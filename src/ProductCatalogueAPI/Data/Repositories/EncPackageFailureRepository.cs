using Dapper;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Operations;
using System.Data;
using System.Data.Common;

namespace ProductCatalogueAPI.Data.Repositories;

/// <summary>Retires failed paired attempts using existing immutable history; no S-128 publication or delivery evidence is rewritten.</summary>
public sealed partial class EncPackageRepository
{
    /// <inheritdoc/>
    public async Task<IReadOnlyDictionary<string, DateTime>> GetFailureAcknowledgementBoundsAsync(CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        var rows = await connection.QueryAsync<FailureCutoff>(new CommandDefinition("""
            SELECT p.dataset_name AS SourceName, MAX(h.occurred_at_utc) AS AcknowledgedAtUtc
            FROM dbo.ProductStateHistory h
            JOIN dbo.ProductExportTrack t ON t.product_export_track_id = h.product_export_track_id
            JOIN dbo.Product p ON p.product_id = t.product_id
            WHERE t.product_specification = 'S101' AND h.error_code = @HistoryCode
            GROUP BY p.dataset_name;
            """, new { EncPackageFailureRules.HistoryCode }, cancellationToken: cancellationToken));
        return rows.ToDictionary(row => row.SourceName, row => DateTime.SpecifyKind(row.AcknowledgedAtUtc, DateTimeKind.Utc), StringComparer.OrdinalIgnoreCase);
    }

    /// <inheritdoc/>
    public async Task<DateTime?> GetFailureAcknowledgedAtUtcAsync(string sourceName, CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        var cutoff = await connection.ExecuteScalarAsync<DateTime?>(new CommandDefinition("""
            SELECT MAX(h.occurred_at_utc) FROM dbo.ProductStateHistory h
            JOIN dbo.ProductExportTrack t ON t.product_export_track_id = h.product_export_track_id
            JOIN dbo.Product p ON p.product_id = t.product_id
            WHERE p.dataset_name = @SourceName AND t.product_specification = 'S101' AND h.error_code = @HistoryCode;
            """, new { SourceName = sourceName, EncPackageFailureRules.HistoryCode }, cancellationToken: cancellationToken));
        return cutoff.HasValue ? DateTime.SpecifyKind(cutoff.Value, DateTimeKind.Utc) : null;
    }

    /// <inheritdoc/>
    public async Task<string?> GetAcknowledgedSourceYamlAsync(string sourceName, CancellationToken cancellationToken = default) {
        using var connection = _connectionFactory.Create();
        return await connection.QuerySingleOrDefaultAsync<string>(new CommandDefinition("""
            SELECT TOP (1) r.dataset_yaml FROM dbo.ProductStateHistory h
            JOIN dbo.ProductExportTrack t ON t.product_export_track_id = h.product_export_track_id
            JOIN dbo.Product p ON p.product_id = t.product_id
            JOIN dbo.ProductRevision r ON r.product_export_track_id = t.product_export_track_id
                AND r.edition_number = h.edition_number AND r.update_number = h.update_number AND r.created_at_utc <= h.occurred_at_utc
            WHERE p.dataset_name = @SourceName AND t.product_specification = 'S101' AND h.error_code = @HistoryCode
            ORDER BY h.occurred_at_utc DESC, r.created_at_utc DESC, r.product_revision_id DESC;
            """, new { SourceName = sourceName, EncPackageFailureRules.HistoryCode }, cancellationToken: cancellationToken));
    }

    /// <inheritdoc/>
    public async Task<EncPackageFailureAcknowledgementResult> TryAcknowledgeFailureAsync(string sourceName, Guid packageId, string actor, DateTime nowUtc, CancellationToken cancellationToken = default) {
        if (string.IsNullOrWhiteSpace(sourceName) || sourceName.Length > 64 || packageId == Guid.Empty ||
            string.IsNullOrWhiteSpace(actor) || actor.Length > 256 || nowUtc.Kind != DateTimeKind.Utc)
            throw new ArgumentException("A failed-package acknowledgement requires an exact source, package, bounded actor and UTC cutoff.");
        using var connection = _connectionFactory.Create();
        if (connection is DbConnection db) await db.OpenAsync(cancellationToken); else connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        var package = await connection.QuerySingleOrDefaultAsync<EncPackage>(new CommandDefinition(
            $"{SelectHeaderSql} WITH (UPDLOCK, HOLDLOCK) WHERE package_id = @PackageId AND source_dataset_name = @SourceName;",
            new { PackageId = packageId, SourceName = sourceName }, transaction, cancellationToken: cancellationToken));
        var receipt = EncPackageFailureRules.Receipt(packageId);
        var recordedAt = await connection.ExecuteScalarAsync<DateTime?>(new CommandDefinition("""
            SELECT MAX(h.occurred_at_utc) FROM dbo.ProductStateHistory h
            JOIN dbo.ProductExportTrack t ON t.product_export_track_id = h.product_export_track_id
            JOIN dbo.Product p ON p.product_id = t.product_id
            WHERE p.dataset_name = @SourceName AND t.product_specification = 'S101'
              AND h.error_code = @HistoryCode AND h.error_message = @Receipt;
            """, new { SourceName = sourceName, EncPackageFailureRules.HistoryCode, Receipt = receipt }, transaction, cancellationToken: cancellationToken));
        if (recordedAt.HasValue) {
            transaction.Commit();
            return new(EncPackageFailureAcknowledgementStatus.AlreadyAcknowledged, DateTime.SpecifyKind(recordedAt.Value, DateTimeKind.Utc));
        }
        if (package is null) return new(EncPackageFailureAcknowledgementStatus.Conflict);
        // Lock policy before tracks, matching Pause and send reservation order.
        await connection.ExecuteScalarAsync<bool?>(new CommandDefinition("""
            SELECT is_paused FROM dbo.EncPackageControl WITH (UPDLOCK, HOLDLOCK) WHERE source_dataset_name = @SourceName;
            """, new { SourceName = sourceName }, transaction, cancellationToken: cancellationToken));
        var tracks = new List<ProductExportTrackRecord>(2);
        foreach (var (name, specification) in new[] { (package.SourceDatasetName, ProductSpecification.S101), (package.S57DatasetName, ProductSpecification.S57) }) {
            var track = await connection.QuerySingleOrDefaultAsync<ProductExportTrackRecord>(new CommandDefinition("""
                SELECT t.product_export_track_id AS Id, p.dataset_name AS DatasetName, t.product_specification AS ProductSpecification,
                    t.state AS State, t.published_edition AS PublishedEdition, t.published_update AS PublishedUpdate,
                    t.candidate_edition AS CandidateEdition, t.candidate_update AS CandidateUpdate,
                    history.error_code AS ErrorCode, history.error_message AS ErrorMessage,
                    CONVERT(bit, CASE WHEN EXISTS (SELECT 1 FROM dbo.ProductExportTrackFreezeHold WITH (UPDLOCK, HOLDLOCK)
                        WHERE product_export_track_id = t.product_export_track_id) THEN 1 ELSE 0 END) AS IsManuallyFrozen
                FROM dbo.ProductExportTrack t WITH (UPDLOCK, HOLDLOCK) JOIN dbo.Product p ON p.product_id = t.product_id
                OUTER APPLY (SELECT TOP (1) error_code, error_message FROM dbo.ProductStateHistory
                    WHERE product_export_track_id = t.product_export_track_id ORDER BY occurred_at_utc DESC, product_state_history_id DESC) history
                WHERE p.dataset_name = @DatasetName AND t.product_specification = @Specification;
                """, new { DatasetName = name, Specification = specification.ToString() }, transaction, cancellationToken: cancellationToken));
            if (track is null) return new(EncPackageFailureAcknowledgementStatus.Conflict);
            tracks.Add(track);
        }
        if (!EncPackageFailureRules.CanAcknowledge(package, tracks[0], tracks[1])) return new(EncPackageFailureAcknowledgementStatus.Conflict);
        foreach (var track in tracks) {
            // Keep failed edition identities in history so neither the accepted nor rejected
            // member can reuse that edition after the active pair has been removed.
            await connection.ExecuteAsync(new CommandDefinition("""
                INSERT dbo.ProductStateHistory (product_state_history_id, product_export_track_id, state,
                    edition_number, update_number, owner, occurred_at_utc, error_code, error_message)
                VALUES (@RetiredId, @TrackId, @Cancelled, @Edition, @Update, @Actor, @NowUtc, @HistoryCode, @Receipt);
                UPDATE dbo.ProductExportTrack SET state = @Idle, candidate_edition = NULL, candidate_update = NULL,
                    candidate_previous_state = NULL, updated_at_utc = @IdleAtUtc WHERE product_export_track_id = @TrackId;
                INSERT dbo.ProductStateHistory (product_state_history_id, product_export_track_id, state,
                    edition_number, update_number, owner, occurred_at_utc)
                VALUES (@IdleId, @TrackId, @Idle, @PublishedEdition, @PublishedUpdate, @Actor, @IdleAtUtc);
                """, WithUtcTimes(new { TrackId = track.Id, RetiredId = Guid.NewGuid(), IdleId = Guid.NewGuid(),
                    Cancelled = ProductState.Cancelled, Idle = ProductState.Idle,
                    Edition = Math.Max(track.PublishedEdition, track.CandidateEdition ?? track.PublishedEdition),
                    Update = track.CandidateUpdate ?? track.PublishedUpdate, track.PublishedEdition, track.PublishedUpdate,
                    Actor = actor, NowUtc = nowUtc, IdleAtUtc = nowUtc.AddTicks(1), EncPackageFailureRules.HistoryCode, Receipt = receipt }, ("NowUtc", nowUtc), ("IdleAtUtc", nowUtc.AddTicks(1))), transaction, cancellationToken: cancellationToken));
        }
        await connection.ExecuteAsync(new CommandDefinition("""
            DELETE FROM dbo.EncPackageReplay WHERE source_dataset_name = @SourceName;
            UPDATE dbo.EncPackageControl SET is_paused = 0, paused_at_utc = NULL, updated_at_utc = @NowUtc WHERE source_dataset_name = @SourceName;
            DELETE FROM dbo.EncPackage WHERE package_id = @PackageId AND source_dataset_name = @SourceName;
            """, new { SourceName = sourceName, PackageId = packageId, NowUtc = nowUtc }, transaction, cancellationToken: cancellationToken));
        cancellationToken.ThrowIfCancellationRequested();
        transaction.Commit();
        return new(EncPackageFailureAcknowledgementStatus.Acknowledged, nowUtc);
    }

    /// <inheritdoc/>
    public async Task RecordSendFailureAsync(string sourceName, Guid packageId, IReadOnlyList<EncPackageSendMember> members, string jobId, CancellationToken cancellationToken = default) {
        if (members.Count != 2 || members.Select(m => m.Specification).Distinct().Count() != 2) return;
        using var connection = _connectionFactory.Create();
        if (connection is DbConnection db) await db.OpenAsync(cancellationToken); else connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        var package = await connection.QuerySingleOrDefaultAsync<EncPackage>(new CommandDefinition(
            $"{SelectHeaderSql} WITH (UPDLOCK, HOLDLOCK) WHERE package_id = @PackageId AND source_dataset_name = @SourceName;",
            new { PackageId = packageId, SourceName = sourceName }, transaction, cancellationToken: cancellationToken));
        if (package is null || members.Any(m => m.DatasetName != (m.Specification == ProductSpecification.S101 ? package.SourceDatasetName : package.S57DatasetName))) return;
        foreach (var member in members.OrderBy(m => m.Specification == ProductSpecification.S101 ? 0 : 1)) {
            var ownsFailure = await connection.ExecuteScalarAsync<bool>(new CommandDefinition("""
                SELECT CONVERT(bit, CASE WHEN EXISTS (
                    SELECT 1 FROM dbo.ProductExportTrack t WITH (UPDLOCK, HOLDLOCK) JOIN dbo.Product p ON p.product_id = t.product_id
                    WHERE p.dataset_name = @DatasetName AND t.product_specification = @Specification
                      AND t.candidate_edition = @Edition AND t.candidate_update = @Update
                      AND t.state IN (@Ready, @InTransit, @Accepted, @Error, @Rejected)
                      AND @RevisionId = (SELECT TOP (1) product_revision_id FROM dbo.ProductRevision
                          WHERE product_export_track_id = t.product_export_track_id ORDER BY created_at_utc DESC, product_revision_id DESC)
                      AND NOT EXISTS (SELECT 1 FROM dbo.ProductIcEncDelivery d WITH (UPDLOCK, HOLDLOCK)
                          WHERE d.product_revision_id = @RevisionId AND d.status <> 'NotDelivered' AND d.job_id <> @MemberJobId)
                ) THEN 1 ELSE 0 END);
                """, new { member.DatasetName, member.Edition, member.Update, member.RevisionId,
                    Specification = member.Specification.ToString(), MemberJobId = jobId + ":" + member.Specification,
                    Ready = ProductState.ReadyForDistribution, InTransit = ProductState.InTransit, Accepted = ProductState.AcceptedForDistribution, Error = ProductState.Error, Rejected = ProductState.Rejected }, transaction, cancellationToken: cancellationToken));
            if (!ownsFailure) return;
        }
        await connection.ExecuteAsync(new CommandDefinition("""
            UPDATE ep SET error_message = @Message FROM dbo.EncPackage ep WHERE ep.package_id = @PackageId
              AND EXISTS (SELECT 1 FROM dbo.ProductExportTrack t JOIN dbo.Product p ON p.product_id = t.product_id
                  WHERE ((t.product_specification = 'S101' AND p.dataset_name = ep.source_dataset_name) OR
                         (t.product_specification = 'S57' AND p.dataset_name = ep.s57_dataset_name))
                    AND t.state <> @Accepted);
            """, new { PackageId = packageId, Accepted = ProductState.AcceptedForDistribution, Message = EncPackageFailureRules.SendFailureMessage }, transaction, cancellationToken: cancellationToken));
        transaction.Commit();
    }

    /// <summary>Preserves datetime2(7) cutoff and history ordering precision instead of relying on provider datetime inference.</summary>
    /// <param name="values">Other command parameters.</param>
    /// <param name="timestamps">Named UTC values compared with persisted source cutoffs.</param>
    /// <returns>Parameters with explicit datetime2 bindings for stable receipts and exact replay comparisons.</returns>
    private static DynamicParameters WithUtcTimes(object values, params (string Name, DateTime? Value)[] timestamps) {
        var parameters = new DynamicParameters(values);
        foreach (var (name, value) in timestamps) parameters.Add(name, value, DbType.DateTime2);
        return parameters;
    }

    /// <summary>Maps one source's retained acknowledgement checkpoint.</summary>
    private sealed class FailureCutoff
    {
        /// <summary>Canonical S-101 dataset owning this detection cutoff.</summary>
        public string SourceName { get; set; } = string.Empty;
        /// <summary>Persisted exclusive UTC source boundary.</summary>
        public DateTime AcknowledgedAtUtc { get; set; }
    }
}
