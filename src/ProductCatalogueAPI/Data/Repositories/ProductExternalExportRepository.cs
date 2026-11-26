using System.Data;
using System.Data.Common;
using System.Security.Cryptography;
using Dapper;
using ProductCatalogueAPI.Contracts;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Services.Distribution;

namespace ProductCatalogueAPI.Data.Repositories;

/// <summary>Coordinates external export candidates on the shared product workflow tables.</summary>
/// <param name="connectionFactory">Creates connections to the ProductCatalogue System database.</param>
/// <param name="workflow">Creates missing product tracks from published catalogue metadata.</param>
public sealed class ProductExternalExportRepository(DbConnectionFactory connectionFactory, IProductWorkflowRepository workflow)
{
    private const string ExportSelect = """
        SELECT t.product_export_track_id AS TrackId, p.dataset_name AS DatasetName,
            r.product_revision_id AS RevisionId, r.external_operation_id AS ExportId, r.edition_number AS Edition,
            t.state AS State, COALESCE(delivery.completed_at_utc, t.updated_at_utc) AS UpdatedAtUtc,
            delivery.delivery_id AS DeliveryId, delivery.status AS DeliveryStatus,
            delivery.is_simulation AS IsSimulation, diagnostic.product_artifact_id AS ValidationArtifactId,
            CONVERT(bit, CASE WHEN hold.product_export_track_id IS NULL THEN 0 ELSE 1 END) AS IsHeld
        FROM dbo.ProductExportTrack t{0}
        JOIN dbo.Product p ON p.product_id = t.product_id
        OUTER APPLY (
            SELECT TOP (1) product_revision_id, external_operation_id, edition_number
            FROM dbo.ProductRevision WHERE product_export_track_id = t.product_export_track_id
            ORDER BY created_at_utc DESC, product_revision_id DESC
        ) r
        LEFT JOIN dbo.ProductExportTrackFreezeHold hold ON hold.product_export_track_id = t.product_export_track_id
        OUTER APPLY (
            SELECT TOP (1) delivery_id, status, is_simulation, completed_at_utc FROM dbo.ProductIcEncDelivery
            WHERE product_revision_id = r.product_revision_id AND status <> 'NotDelivered'
            ORDER BY reserved_at_utc DESC, delivery_id DESC
        ) delivery
        OUTER APPLY (
            SELECT TOP (1) product_artifact_id FROM dbo.ProductArtifact
            WHERE product_export_track_id = t.product_export_track_id AND product_revision_id = r.product_revision_id
              AND artifact_kind = 'ValidationDiagnostic'
            ORDER BY created_at_utc DESC, product_artifact_id DESC
        ) diagnostic
        """;

    private const string TrackFilter = "WHERE t.product_specification = @Specification AND p.dataset_name = @Name;";

    private const string ApplyStateSql = """
        UPDATE dbo.ProductExportTrack SET state = @State, updated_at_utc = @Now,
            candidate_edition = @Edition, candidate_update = 0
        WHERE product_export_track_id = @TrackId;
        INSERT dbo.ProductStateHistory (product_state_history_id, product_export_track_id, state, edition_number, update_number, owner,
            occurred_at_utc, error_code, error_message)
        VALUES (NEWID(), @TrackId, @State, @Edition, 0, @Owner, @Now, @ErrorCode, @ErrorMessage);
        """;

    /// <summary>Reserves the batch in one transaction on the existing export tracks.</summary>
    /// <param name="products">Authoritative datasets in stable order with their published editions.</param>
    /// <param name="exportId">Stable batch identifier used by the producer for retries.</param>
    /// <param name="specification">External product specification.</param>
    /// <param name="engine">Encoding that the producer uses for this specification.</param>
    /// <param name="owner">Authenticated producer identity, when available.</param>
    /// <param name="token">Cancels the batch and rolls back incomplete locks.</param>
    /// <returns>The current exports or null when the batch contains a conflicting dataset.</returns>
    internal async Task<ExternalProductExportResponse[]?> StartAsync(ExternalProductReference[] products, Guid exportId,
        ProductSpecification specification, ExportEngineKind engine, string? owner, CancellationToken token) {
        foreach (var product in products)
            await workflow.GetOrCreateTrackAsync(product.DatasetName, specification, engine, product.PublishedEdition, 0, token);

        await using var connection = (DbConnection)connectionFactory.Create();
        await connection.OpenAsync(token);
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, token);

        var results = new List<ExternalProductExportResponse>(products.Length);
        foreach (var product in products) {
            var current = await ReadLockedAsync(connection, transaction, product.DatasetName, specification, token)
                ?? throw new InvalidOperationException("The initialized product track is missing.");
            if (current.ExportId == exportId) {
                results.Add(current.ToResponse());
                continue;
            }
            if (current.IsHeld || current.State is ProductState.Exporting or ProductState.Validating or ProductState.Frozen
                || current.State == ProductState.InTransit && current.DeliveryStatus != "Delivered")
                return null;

            var publishedEdition = product.PublishedEdition;
            var candidate = await connection.QuerySingleOrDefaultAsync<NewRevision>(new CommandDefinition("""
                IF EXISTS (SELECT 1 FROM dbo.ProductRevision WHERE product_export_track_id = @TrackId AND external_operation_id = @ExportId)
                    RETURN;

                DECLARE @PreviousRevisionUtc datetime2(7) = (
                    SELECT MAX(created_at_utc) FROM dbo.ProductRevision WHERE product_export_track_id = @TrackId);
                DECLARE @Now datetime2(7) = SYSUTCDATETIME();
                IF @PreviousRevisionUtc >= @Now SET @Now = DATEADD(nanosecond, 100, @PreviousRevisionUtc);

                DECLARE @Edition int = (
                    SELECT MAX(edition) + 1 FROM (
                        SELECT published_edition AS edition FROM dbo.ProductExportTrack WHERE product_export_track_id = @TrackId
                        UNION ALL SELECT @PublishedEdition
                        UNION ALL SELECT r.edition_number FROM dbo.ProductIcEncDelivery d
                            JOIN dbo.ProductRevision r ON r.product_revision_id = d.product_revision_id
                            WHERE d.product_export_track_id = @TrackId AND d.is_simulation = 0
                              AND d.status IN ('Delivered', 'Accepted', 'Rejected')
                    ) editions);
                INSERT dbo.ProductRevision (product_revision_id, product_export_track_id, revision_type, edition_number,
                    update_number, dataset_yaml, created_by, created_at_utc, external_operation_id)
                VALUES (NEWID(), @TrackId, 'NewEdition', @Edition, 0, N'', @Owner, @Now, @ExportId);

                SELECT @Edition AS Edition, @Now AS UpdatedAtUtc;
                """, new { current.TrackId, ExportId = exportId, PublishedEdition = publishedEdition, Owner = owner }, transaction, cancellationToken: token));
            if (candidate is null)
                return null;

            await ApplyStateAsync(connection, transaction, current.TrackId, ProductState.Exporting, candidate.Edition,
                candidate.UpdatedAtUtc, owner, token);
            results.Add(new(current.DatasetName, exportId, candidate.Edition, ExternalProductExportStatus.Exporting,
                DateTime.SpecifyKind(candidate.UpdatedAtUtc, DateTimeKind.Utc), null, null, null));
        }

        await transaction.CommitAsync(token);
        return [.. results];
    }

    /// <summary>Stores the reserved export's artifacts and advances its state in one transaction.</summary>
    /// <param name="name">Dataset name from the export reservation.</param>
    /// <param name="specification">Exact export track owning the export.</param>
    /// <param name="exportId">Export identifier that must match the active reservation.</param>
    /// <param name="passed">Whether the producer's validator passed the export.</param>
    /// <param name="edition">Edition declared in the exchange catalogue, required on success.</param>
    /// <param name="exchangeSet">Producer's exchange-set ZIP.</param>
    /// <param name="artifact">Optional VLD diagnostic.</param>
    /// <param name="owner">Authenticated producer identity, when available.</param>
    /// <param name="token">Cancels artifact persistence and the state transition.</param>
    /// <returns>The current export or null for a stale lock, mismatched edition or conflicting replay.</returns>
    internal async Task<ExternalProductExportResponse?> CompleteAsync(string name, ProductSpecification specification, Guid exportId,
        bool passed, int? edition, byte[]? exchangeSet, byte[]? artifact, string? owner, CancellationToken token) {
        var zipHash = exchangeSet is null ? null : SHA256.HashData(exchangeSet);
        var artifactHash = artifact is null ? null : SHA256.HashData(artifact);

        await using var connection = (DbConnection)connectionFactory.Create();
        await connection.OpenAsync(token);
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, token);

        var current = await ReadLockedAsync(connection, transaction, name, specification, token);
        if (current is null || current.ExportId != exportId || current.RevisionId is not Guid revisionId ||
            current.Edition is not int expectedEdition || passed && (edition != expectedEdition || exchangeSet is null))
            return null;

        if (current.State != ProductState.Exporting) {
            // A retry may arrive after the API response was lost or the saved exchange set was sent.
            if (passed ? current.State is not (ProductState.ReadyForDistribution or ProductState.InTransit)
                : current.State != ProductState.Error)
                return null;
            var identical = await connection.ExecuteScalarAsync<bool>(new CommandDefinition("""
                SELECT CONVERT(bit, CASE WHEN
                    (@ZipHash IS NULL AND NOT EXISTS (SELECT 1 FROM dbo.ProductArtifact WHERE product_revision_id = @RevisionId AND artifact_kind = 'ExchangeSet')
                     OR EXISTS (SELECT 1 FROM dbo.ProductArtifact WHERE product_revision_id = @RevisionId AND artifact_kind = 'ExchangeSet' AND sha256 = @ZipHash))
                    AND (@ArtifactHash IS NULL AND NOT EXISTS (SELECT 1 FROM dbo.ProductArtifact WHERE product_revision_id = @RevisionId AND artifact_kind = 'ValidationDiagnostic')
                     OR EXISTS (SELECT 1 FROM dbo.ProductArtifact WHERE product_revision_id = @RevisionId AND artifact_kind = 'ValidationDiagnostic' AND sha256 = @ArtifactHash))
                    THEN 1 ELSE 0 END);
                """, new { RevisionId = revisionId, ZipHash = zipHash, ArtifactHash = artifactHash }, transaction, cancellationToken: token));
            return identical ? current.ToResponse() : null;
        }

        var now = DateTime.UtcNow;
        var diagnosticId = artifact is null ? (Guid?)null : Guid.NewGuid();
        if (exchangeSet is not null)
            await WriteArtifactAsync(connection, transaction, current.TrackId, revisionId, Guid.NewGuid(), ProductArtifactKind.ExchangeSet,
                $"{current.DatasetName}.zip", "application/zip", exchangeSet, zipHash!, now, token);
        if (diagnosticId is Guid artifactId)
            await WriteArtifactAsync(connection, transaction, current.TrackId, revisionId, artifactId, ProductArtifactKind.ValidationDiagnostic,
                $"{current.DatasetName}.vld", "application/octet-stream", artifact!, artifactHash!, now, token);

        var state = passed ? ProductState.ReadyForDistribution : ProductState.Error;
        await ApplyStateAsync(connection, transaction, current.TrackId, state, expectedEdition, now, owner, token,
            passed ? null : "EXTERNAL_VALIDATION_FAILED", passed ? null : "The external producer reported a failed export or validation.");
        await transaction.CommitAsync(token);
        return new(current.DatasetName, exportId, expectedEdition, passed ? ExternalProductExportStatus.ReadyForDistribution : ExternalProductExportStatus.Error,
            now, diagnosticId, null, null);
    }

    /// <summary>Reads current export state without loading its binary artifacts.</summary>
    /// <param name="name">Catalogue dataset name, or null to read all tracks for the specification.</param>
    /// <param name="specification">Product specification being presented or sent.</param>
    /// <param name="token">Cancels the SQL read.</param>
    /// <returns>Workflow state for the selected datasets.</returns>
    internal async Task<ExternalProductExportResponse[]> GetCurrentAsync(string? name, ProductSpecification specification, CancellationToken token) {
        using var connection = connectionFactory.Create();
        var rows = await connection.QueryAsync<ExportRow>(new CommandDefinition($"""
            {string.Format(ExportSelect, string.Empty)}
            WHERE t.product_specification = @Specification AND (@Name IS NULL OR p.dataset_name = @Name);
            """, new { Name = name, Specification = specification.ToString() }, cancellationToken: token));
        return rows.Select(row => row.ToResponse()).ToArray();
    }

    /// <summary>Reserves a ready external revision for a single IC-ENC submission.</summary>
    /// <param name="name">Authoritative catalogue dataset name.</param>
    /// <param name="specification">Exact export track being delivered.</param>
    /// <param name="exportId">Exact export selected when the job was queued.</param>
    /// <param name="jobId">Hangfire identity associated with the reservation.</param>
    /// <param name="isSimulation">Whether this handoff bypasses external transport.</param>
    /// <param name="token">Cancels the SQL reservation.</param>
    /// <returns>The immutable submission or null if the current export is ineligible.</returns>
    internal async Task<IcEncDelivery?> ReserveDeliveryAsync(string name, ProductSpecification specification, Guid exportId,
        string jobId, bool isSimulation, CancellationToken token) {
        await using var connection = (DbConnection)connectionFactory.Create();
        await connection.OpenAsync(token);
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, token);

        var current = await ReadLockedAsync(connection, transaction, name, specification, token);
        if (current is null || current.ExportId != exportId || current.RevisionId is not Guid revisionId || current.Edition is not int edition ||
            current.IsHeld || current.State != ProductState.ReadyForDistribution || current.DeliveryStatus is not null)
            return null;

        var exchangeSet = await connection.QuerySingleAsync<byte[]>(new CommandDefinition("""
            SELECT content FROM dbo.ProductArtifact WHERE product_export_track_id = @TrackId AND product_revision_id = @RevisionId
                AND artifact_kind = 'ExchangeSet';
            """, new { current.TrackId, RevisionId = revisionId }, transaction, cancellationToken: token));

        var deliveryId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        await connection.ExecuteAsync(new CommandDefinition("""
            INSERT dbo.ProductIcEncDelivery (delivery_id, product_export_track_id, product_revision_id, job_id, status, reserved_at_utc, completed_at_utc, is_simulation)
            VALUES (@DeliveryId, @TrackId, @RevisionId, @JobId, CASE WHEN @IsSimulation = 1 THEN 'Delivered' ELSE 'Sending' END,
                @Now, CASE WHEN @IsSimulation = 1 THEN @Now ELSE NULL END, @IsSimulation);
            """, new { DeliveryId = deliveryId, current.TrackId, RevisionId = revisionId, JobId = jobId, Now = now, IsSimulation = isSimulation },
            transaction, cancellationToken: token));
        await ApplyStateAsync(connection, transaction, current.TrackId, ProductState.InTransit, edition, now, "IC-ENC delivery", token);
        await transaction.CommitAsync(token);
        return new(deliveryId, current.DatasetName, specification, edition, 0, exchangeSet) { RevisionId = revisionId, TrackId = current.TrackId, ReservedAtUtc = now };
    }

    /// <summary>Locks the shared track until the enclosing transaction commits or rolls back.</summary>
    /// <param name="connection">Open connection to the System database.</param>
    /// <param name="transaction">Transaction retaining workflow locks.</param>
    /// <param name="name">Catalogue dataset name.</param>
    /// <param name="specification">Exact product specification.</param>
    /// <param name="token">Cancels the read.</param>
    /// <returns>The locked workflow row, or null if none exists.</returns>
    private static Task<ExportRow?> ReadLockedAsync(DbConnection connection, DbTransaction transaction, string name, ProductSpecification specification, CancellationToken token) =>
        connection.QuerySingleOrDefaultAsync<ExportRow>(new CommandDefinition($"{string.Format(ExportSelect, " WITH (UPDLOCK, HOLDLOCK)")}\n{TrackFilter}",
            new { Name = name, Specification = specification.ToString() }, transaction, cancellationToken: token));

    /// <summary>Updates the candidate and appends a state-history record inside the current transaction.</summary>
    /// <param name="connection">Open connection to the System database.</param>
    /// <param name="transaction">Transaction owning the track lock.</param>
    /// <param name="trackId">Workflow track being updated.</param>
    /// <param name="state">New candidate state.</param>
    /// <param name="edition">Candidate edition.</param>
    /// <param name="now">UTC state transition time.</param>
    /// <param name="owner">Authenticated producer or delivery worker.</param>
    /// <param name="token">Cancels persistence.</param>
    /// <param name="errorCode">Optional stable error code.</param>
    /// <param name="errorMessage">Optional user-safe error message.</param>
    /// <returns>A task for both SQL writes.</returns>
    private static Task ApplyStateAsync(DbConnection connection, DbTransaction transaction, Guid trackId, ProductState state, int edition,
        DateTime now, string? owner, CancellationToken token, string? errorCode = null, string? errorMessage = null) =>
        connection.ExecuteAsync(new CommandDefinition(ApplyStateSql, new { TrackId = trackId, State = state, Edition = edition, Now = now,
            Owner = owner, ErrorCode = errorCode, ErrorMessage = errorMessage }, transaction, cancellationToken: token));

    /// <summary>Stores an immutable external export artifact in the common artifact store.</summary>
    /// <param name="connection">Open connection to the System database.</param>
    /// <param name="transaction">Transaction that commits artifacts and state together.</param>
    /// <param name="trackId">Track owning the output.</param>
    /// <param name="revisionId">Revision that produced the output.</param>
    /// <param name="artifactId">Identifier assigned to this artifact.</param>
    /// <param name="kind">Artifact type recognized by the existing repository.</param>
    /// <param name="fileName">Canonical download filename.</param>
    /// <param name="mediaType">Artifact content type.</param>
    /// <param name="content">Exact producer-supplied bytes.</param>
    /// <param name="hash">SHA-256 hash of the artifact.</param>
    /// <param name="now">UTC artifact creation time.</param>
    /// <param name="token">Cancels the artifact insert.</param>
    /// <returns>A task for artifact persistence.</returns>
    private static Task WriteArtifactAsync(DbConnection connection, DbTransaction transaction, Guid trackId, Guid revisionId, Guid artifactId,
        ProductArtifactKind kind, string fileName, string mediaType, byte[] content, byte[] hash, DateTime now, CancellationToken token) =>
        connection.ExecuteAsync(new CommandDefinition("""
            INSERT dbo.ProductArtifact (product_artifact_id, product_export_track_id, product_revision_id, artifact_kind, file_name,
                media_type, content, sha256, created_at_utc)
            VALUES (@ArtifactId, @TrackId, @RevisionId, @Kind, @FileName, @MediaType, @Content, @Hash, @Now);
            """, new { ArtifactId = artifactId, TrackId = trackId, RevisionId = revisionId, Kind = kind.ToString(), FileName = fileName,
                MediaType = mediaType, Content = content, Hash = hash, Now = now }, transaction, cancellationToken: token));

    /// <summary>The S-128 metadata needed to initialize an external export track.</summary>
    /// <param name="DatasetName">Canonical catalogue dataset name.</param>
    /// <param name="PublishedEdition">Edition recorded in S-128, or zero for a new dataset.</param>
    internal sealed record ExternalProductReference(string DatasetName, int PublishedEdition);

    /// <summary>Revision edition and timestamp assigned by the database.</summary>
    private sealed class NewRevision
    {
        public int Edition { get; set; }
        public DateTime UpdatedAtUtc { get; set; }
    }

    /// <summary>SQL projection of the current track, revision and delivery.</summary>
    private sealed class ExportRow
    {
        public Guid TrackId { get; set; }
        public string DatasetName { get; set; } = string.Empty;
        public Guid? RevisionId { get; set; }
        /// <summary>Identifies the external export reserved on the current revision.</summary>
        public Guid? ExportId { get; set; }
        public int? Edition { get; set; }
        public ProductState State { get; set; }
        public DateTime UpdatedAtUtc { get; set; }
        public Guid? DeliveryId { get; set; }
        public string? DeliveryStatus { get; set; }
        public bool? IsSimulation { get; set; }
        public Guid? ValidationArtifactId { get; set; }
        public bool IsHeld { get; set; }

        /// <summary>Maps shared workflow and submission state to the bathymetric API contract.</summary>
        /// <returns>The current state without reading its binary content.</returns>
        public ExternalProductExportResponse ToResponse() {
            var status = ExportId is null ? ExternalProductExportStatus.Idle : State switch {
                ProductState.Exporting => ExternalProductExportStatus.Exporting,
                ProductState.ReadyForDistribution => ExternalProductExportStatus.ReadyForDistribution,
                ProductState.InTransit => DeliveryStatus switch {
                    "Delivered" or "Accepted" => ExternalProductExportStatus.Submitted,
                    "Sending" => ExternalProductExportStatus.Sending,
                    _ => ExternalProductExportStatus.DeliveryNeedsReview
                },
                ProductState.Error => ExternalProductExportStatus.Error,
                _ => ExternalProductExportStatus.Idle
            };
            return new(DatasetName, ExportId, Edition, status, DateTime.SpecifyKind(UpdatedAtUtc, DateTimeKind.Utc), ValidationArtifactId, DeliveryId,
                IsSimulation is bool simulation ? (simulation ? SendToIcEncMode.Simulation : SendToIcEncMode.Live) : null);
        }
    }
}
