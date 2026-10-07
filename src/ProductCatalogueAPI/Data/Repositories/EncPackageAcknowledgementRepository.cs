using Dapper;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Services.Jobs;
using S100FC.ProductCatalogue;
using System.Data;

namespace ProductCatalogueAPI.Data.Repositories;

/// <summary>Records verified IC-ENC notices independently of their email or Swagger source.</summary>
public interface IEncPackageAcknowledgementRepository
{
    /// <summary>Applies one exact acceptance or rejection and returns whether both current products are accepted.</summary>
    Task<IcEncAcknowledgementResult?> RecordAsync(IcEncAcknowledgement acknowledgement, DateTime nowUtc, CancellationToken cancellationToken);
    /// <summary>Finds packages whose two current deliveries have both been accepted.</summary>
    Task<IReadOnlyList<Guid>> GetPendingAsync(CancellationToken cancellationToken);
    /// <summary>Loads and verifies the accepted versions, shared snapshot and compiler artifacts.</summary>
    Task<EncPackagePublication?> GetPublicationAsync(Guid packageId, CancellationToken cancellationToken);
    /// <summary>Atomically advances both published tracks and removes the package after S-128 publication.</summary>
    Task CompleteAsync(EncPackagePublication publication, DateTime nowUtc, CancellationToken cancellationToken);
}

/// <summary>Uses the exact candidate revision bound to a delivered transfer; an old notice cannot accept a newer candidate.</summary>
public sealed class EncPackageAcknowledgementRepository(DbConnectionFactory connectionFactory) : IEncPackageAcknowledgementRepository
{
    public async Task<IcEncAcknowledgementResult?> RecordAsync(IcEncAcknowledgement acknowledgement, DateTime nowUtc, CancellationToken cancellationToken) {
        ArgumentNullException.ThrowIfNull(acknowledgement);
        using var connection = connectionFactory.Create();
        connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        var deliveries = (await connection.QueryAsync<AcknowledgementRow>(new CommandDefinition("""
            SELECT d.delivery_id AS DeliveryId, d.status AS Status, d.product_revision_id AS RevisionId,
                   d.source_event_id AS SourceEventId,
                   t.product_export_track_id AS TrackId, t.state AS State,
                   t.candidate_edition AS Edition, t.candidate_update AS [Update],
                   r.edition_number AS RevisionEdition, r.update_number AS RevisionUpdate,
                   ep.package_id AS PackageId, ep.s57_discarded AS S57Discarded, ep.s101_discarded AS S101Discarded
            FROM dbo.ProductExportTrack t WITH (UPDLOCK, HOLDLOCK)
            JOIN dbo.Product p ON p.product_id = t.product_id
            JOIN dbo.ProductIcEncDelivery d WITH (UPDLOCK, HOLDLOCK) ON d.product_export_track_id = t.product_export_track_id
            JOIN dbo.ProductRevision r ON r.product_revision_id = d.product_revision_id AND r.product_export_track_id = t.product_export_track_id
            LEFT JOIN dbo.EncPackage ep WITH (UPDLOCK, HOLDLOCK)
                ON (t.product_specification = 'S57' AND ep.s57_dataset_name = p.dataset_name)
                OR (t.product_specification = 'S101' AND ep.source_dataset_name = p.dataset_name)
            WHERE p.dataset_name = @DatasetName AND t.product_specification = @Specification
              AND r.edition_number = @Edition AND r.update_number = @Update
              AND (@DeliveryId IS NULL OR d.delivery_id = @DeliveryId)
              AND d.status IN ('Delivered', 'Accepted', 'Rejected');
            """, new { acknowledgement.DatasetName, Specification = acknowledgement.Specification.ToString(),
                acknowledgement.Edition, acknowledgement.Update, acknowledgement.DeliveryId }, transaction, cancellationToken: cancellationToken))).ToArray();

        // A later rebuild can use the same edition/update. A stable email event ID identifies a replay;
        // otherwise ambiguous versions require an exact delivery ID from an operator.
        var eventMatches = acknowledgement.SourceEventId is null ? Array.Empty<AcknowledgementRow>() : deliveries
            .Where(row => row.SourceEventId == acknowledgement.SourceEventId).ToArray();
        if (eventMatches.Length > 1 || (eventMatches.Length == 0 && deliveries.Length != 1))
            return null;
        var delivery = eventMatches.Length == 1 ? eventMatches[0] : deliveries[0];

        var status = acknowledgement.Decision.ToString();
        var expectedState = acknowledgement.Decision == IcEncDecision.Accepted ? ProductState.AcceptedForDistribution : ProductState.Rejected;
        if (eventMatches.Length == 1 && delivery.Status == status) {
            // The mailbox can replay a notice after the package has been finalized or superseded.
            transaction.Commit();
            return new IcEncAcknowledgementResult(delivery.DeliveryId, null, false, true);
        }
        if (delivery.Status == status &&
            (delivery.PackageId is null || delivery.Edition != delivery.RevisionEdition || delivery.Update != delivery.RevisionUpdate)) {
            transaction.Commit();
            return new IcEncAcknowledgementResult(delivery.DeliveryId, null, false, true);
        }
        if (delivery.PackageId is null || delivery.S57Discarded || delivery.S101Discarded ||
            delivery.Edition != delivery.RevisionEdition || delivery.Update != delivery.RevisionUpdate)
            return null;

        var latest = await connection.QuerySingleAsync<Guid>(new CommandDefinition("""
            SELECT TOP 1 product_revision_id FROM dbo.ProductRevision
            WHERE product_export_track_id = @TrackId ORDER BY created_at_utc DESC, product_revision_id DESC;
            """, new { delivery.TrackId }, transaction, cancellationToken: cancellationToken));
        if (latest != delivery.RevisionId)
            return null;

        var alreadyRecorded = delivery.Status == status && delivery.State == expectedState;
        if (!alreadyRecorded && (delivery.Status != "Delivered" || delivery.State != ProductState.InTransit))
            return null; // Conflicting or stale notices require review; never reverse an acknowledgement.
        // The mailbox may later receive the same outcome after an operator used the fallback.
        // Keep the original evidence and treat an identical decision for this exact revision as a replay.

        if (!alreadyRecorded) {
            var rejectionMessage = acknowledgement.Decision == IcEncDecision.Rejected
                ? string.IsNullOrWhiteSpace(acknowledgement.Reason)
                    ? "IC-ENC rejected this candidate. Review the notice before discarding or rebuilding it."
                    : acknowledgement.Reason.Trim()
                : null;
            var changed = await connection.ExecuteAsync(new CommandDefinition("""
                UPDATE dbo.ProductIcEncDelivery
                SET status = @Status, acknowledged_at_utc = @NowUtc, acknowledgement_source = @Source,
                    source_event_id = @SourceEventId, notice_reference = @NoticeReference, rejection_reason = @Reason
                WHERE delivery_id = @DeliveryId AND status = 'Delivered';
                """, new { delivery.DeliveryId, Status = status, NowUtc = nowUtc,
                    Source = acknowledgement.Source.ToString(), acknowledgement.SourceEventId,
                    acknowledgement.NoticeReference, Reason = acknowledgement.Reason }, transaction, cancellationToken: cancellationToken));
            if (changed != 1)
                throw new InvalidOperationException("The IC-ENC delivery changed during acknowledgement.");
            changed = await connection.ExecuteAsync(new CommandDefinition("""
                UPDATE dbo.ProductExportTrack
                SET state = @State, updated_at_utc = @NowUtc, error_code = @ErrorCode, error_message = @ErrorMessage
                WHERE product_export_track_id = @TrackId AND state = @InTransit;
                """, new { delivery.TrackId, NowUtc = nowUtc, State = expectedState,
                    InTransit = ProductState.InTransit,
                    ErrorCode = acknowledgement.Decision == IcEncDecision.Rejected ? "IC_ENC_REJECTED" : null,
                    ErrorMessage = rejectionMessage
                }, transaction, cancellationToken: cancellationToken));
            if (changed != 1)
                throw new InvalidOperationException("The IC-ENC product changed during acknowledgement.");
            await connection.ExecuteAsync(new CommandDefinition("""
                INSERT INTO dbo.ProductStateHistory
                    (product_state_history_id, product_export_track_id, state, edition_number, update_number, owner, occurred_at_utc, error_code, error_message)
                VALUES (@HistoryId, @TrackId, @State, @Edition, @Update, @Owner, @NowUtc, @ErrorCode, @ErrorMessage);
                """, new { delivery.TrackId, State = expectedState, acknowledgement.Edition, acknowledgement.Update,
                    Owner = acknowledgement.Source.ToString(), NowUtc = nowUtc, HistoryId = Guid.NewGuid(),
                    ErrorCode = acknowledgement.Decision == IcEncDecision.Rejected ? "IC_ENC_REJECTED" : null,
                    ErrorMessage = rejectionMessage
                }, transaction, cancellationToken: cancellationToken));
        }

        var ready = false;
        if (acknowledgement.Decision == IcEncDecision.Accepted) {
            ready = await connection.QuerySingleAsync<bool>(new CommandDefinition("""
                SELECT CONVERT(bit, CASE WHEN
                    EXISTS (SELECT 1 FROM dbo.EncPackage ep
                            JOIN dbo.Product p ON p.dataset_name = ep.s57_dataset_name
                            JOIN dbo.ProductExportTrack t ON t.product_id = p.product_id AND t.product_specification = 'S57'
                            JOIN dbo.ProductIcEncDelivery d ON d.product_export_track_id = t.product_export_track_id AND d.status = 'Accepted'
                            JOIN dbo.ProductRevision r ON r.product_revision_id = d.product_revision_id
                            WHERE ep.package_id = @PackageId AND t.state = @Accepted AND ep.s57_discarded = 0
                              AND t.candidate_edition = r.edition_number AND t.candidate_update = r.update_number)
                    AND EXISTS (SELECT 1 FROM dbo.EncPackage ep
                            JOIN dbo.Product p ON p.dataset_name = ep.source_dataset_name
                            JOIN dbo.ProductExportTrack t ON t.product_id = p.product_id AND t.product_specification = 'S101'
                            JOIN dbo.ProductIcEncDelivery d ON d.product_export_track_id = t.product_export_track_id AND d.status = 'Accepted'
                            JOIN dbo.ProductRevision r ON r.product_revision_id = d.product_revision_id
                            WHERE ep.package_id = @PackageId AND t.state = @Accepted AND ep.s101_discarded = 0
                              AND t.candidate_edition = r.edition_number AND t.candidate_update = r.update_number)
                    THEN 1 ELSE 0 END);
                """, new { delivery.PackageId, Accepted = ProductState.AcceptedForDistribution }, transaction, cancellationToken: cancellationToken));
        }
        transaction.Commit();
        return new IcEncAcknowledgementResult(delivery.DeliveryId, delivery.PackageId.Value, ready, alreadyRecorded);
    }

    public async Task<IReadOnlyList<Guid>> GetPendingAsync(CancellationToken cancellationToken) {
        using var connection = connectionFactory.Create();
        var ids = await connection.QueryAsync<Guid>(new CommandDefinition("""
            SELECT p.package_id FROM dbo.EncPackage p
            WHERE p.s57_discarded = 0 AND p.s101_discarded = 0
              AND EXISTS (SELECT 1 FROM dbo.ProductExportTrack t JOIN dbo.Product prod ON prod.product_id = t.product_id
                          JOIN dbo.ProductIcEncDelivery d ON d.product_export_track_id = t.product_export_track_id AND d.status = 'Accepted'
                          JOIN dbo.ProductRevision r ON r.product_revision_id = d.product_revision_id
                          WHERE prod.dataset_name = p.s57_dataset_name AND t.product_specification = 'S57' AND t.state = @Accepted
                            AND r.edition_number = t.candidate_edition AND r.update_number = t.candidate_update)
              AND EXISTS (SELECT 1 FROM dbo.ProductExportTrack t JOIN dbo.Product prod ON prod.product_id = t.product_id
                          JOIN dbo.ProductIcEncDelivery d ON d.product_export_track_id = t.product_export_track_id AND d.status = 'Accepted'
                          JOIN dbo.ProductRevision r ON r.product_revision_id = d.product_revision_id
                          WHERE prod.dataset_name = p.source_dataset_name AND t.product_specification = 'S101' AND t.state = @Accepted
                            AND r.edition_number = t.candidate_edition AND r.update_number = t.candidate_update);
            """, new { Accepted = ProductState.AcceptedForDistribution }, cancellationToken: cancellationToken));
        return ids.ToArray();
    }

    public async Task<EncPackagePublication?> GetPublicationAsync(Guid packageId, CancellationToken cancellationToken) {
        using var connection = connectionFactory.Create();
        var package = await connection.QuerySingleOrDefaultAsync<EncPackage>(new CommandDefinition("""
            SELECT package_id AS Id, source_dataset_name AS SourceDatasetName, s57_dataset_name AS S57DatasetName,
                   dataset_yaml AS DatasetYaml, detected_at_utc AS DetectedAtUtc,
                   s57_discarded AS S57Discarded, s101_discarded AS S101Discarded
            FROM dbo.EncPackage WHERE package_id = @PackageId;
            """, new { PackageId = packageId }, cancellationToken: cancellationToken));
        if (package is null || package.S57Discarded || package.S101Discarded)
            return null;

        var rows = (await connection.QueryAsync<PublicationRow>(new CommandDefinition("""
            SELECT p.dataset_name AS DatasetName, t.product_specification AS Specification,
                   t.candidate_edition AS Edition, t.candidate_update AS [Update],
                   d.product_revision_id AS RevisionId
            FROM dbo.ProductExportTrack t JOIN dbo.Product p ON p.product_id = t.product_id
            JOIN dbo.ProductIcEncDelivery d ON d.product_export_track_id = t.product_export_track_id AND d.status = 'Accepted'
            JOIN dbo.ProductRevision r ON r.product_revision_id = d.product_revision_id AND r.product_export_track_id = t.product_export_track_id
            WHERE ((p.dataset_name = @S57 AND t.product_specification = 'S57') OR
                   (p.dataset_name = @S101 AND t.product_specification = 'S101'))
              AND t.state = @Accepted AND t.candidate_edition = r.edition_number AND t.candidate_update = r.update_number
              AND NOT EXISTS (SELECT 1 FROM dbo.ProductRevision newer WHERE newer.product_export_track_id = t.product_export_track_id
                              AND (newer.created_at_utc > r.created_at_utc OR
                                   (newer.created_at_utc = r.created_at_utc AND newer.product_revision_id > r.product_revision_id)));
            """, new { S57 = package.S57DatasetName, S101 = package.SourceDatasetName,
                Accepted = ProductState.AcceptedForDistribution }, cancellationToken: cancellationToken))).ToArray();
        if (rows.Length != 2 || rows.Count(row => row.Specification == "S57") != 1 || rows.Count(row => row.Specification == "S101") != 1)
            return null;
        var s57 = rows.Single(row => row.Specification == "S57");
        var s101 = rows.Single(row => row.Specification == "S101");
        var artifacts = (await connection.QueryAsync<PublicationArtifact>(new CommandDefinition("""
            SELECT artifact_kind AS Kind, content AS Content FROM dbo.ProductArtifact
            WHERE product_revision_id = @RevisionId AND artifact_kind IN ('CompilerIndex', 'CatalogueSignature');
            """, new { s101.RevisionId }, cancellationToken: cancellationToken))).ToArray();
        var index = artifacts.SingleOrDefault(artifact => artifact.Kind == "CompilerIndex")?.Content;
        var signature = artifacts.SingleOrDefault(artifact => artifact.Kind == "CatalogueSignature")?.Content;
        if (index is null || index.Length == 0 || signature is null || signature.Length == 0)
            throw new InvalidOperationException("The accepted S-101 revision has no compiler index or catalogue signature for S-128 publication.");
        return new EncPackagePublication(packageId, s57.DatasetName, s57.Edition, s57.Update,
            s101.DatasetName, s101.Edition, s101.Update, package.DetectedAtUtc, package.DatasetYaml, index, signature);
    }

    public async Task CompleteAsync(EncPackagePublication publication, DateTime nowUtc, CancellationToken cancellationToken) {
        using var connection = connectionFactory.Create();
        connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        var package = await connection.QuerySingleOrDefaultAsync<EncPackage>(new CommandDefinition("""
            SELECT package_id AS Id, source_dataset_name AS SourceDatasetName, s57_dataset_name AS S57DatasetName,
                   detected_at_utc AS DetectedAtUtc, s57_discarded AS S57Discarded, s101_discarded AS S101Discarded
            FROM dbo.EncPackage WITH (UPDLOCK, HOLDLOCK) WHERE package_id = @PackageId;
            """, new { publication.PackageId }, transaction, cancellationToken: cancellationToken));
        if (package is null)
            return; // A previous finalization completed after S-128 was written.
        if (package.S57Discarded || package.S101Discarded || package.S57DatasetName != publication.S57DatasetName ||
            package.SourceDatasetName != publication.S101DatasetName)
            throw new InvalidOperationException("The ENC package changed during finalization.");

        foreach (var product in new[] { (DatasetName: publication.S57DatasetName, Specification: "S57", Edition: publication.S57Edition, Update: publication.S57Update),
                                        (DatasetName: publication.S101DatasetName, Specification: "S101", Edition: publication.S101Edition, Update: publication.S101Update) }) {
            var changed = await connection.ExecuteAsync(new CommandDefinition("""
                UPDATE t SET state = @Idle, published_edition = @Edition, published_update = @Update,
                    candidate_edition = NULL, candidate_update = NULL, candidate_previous_state = NULL,
                    error_code = NULL, error_message = NULL, updated_at_utc = @NowUtc
                FROM dbo.ProductExportTrack t JOIN dbo.Product p ON p.product_id = t.product_id
                WHERE p.dataset_name = @DatasetName AND t.product_specification = @Specification
                  AND t.state = @Accepted AND t.candidate_edition = @Edition AND t.candidate_update = @Update
                  AND EXISTS (SELECT 1 FROM dbo.ProductIcEncDelivery d JOIN dbo.ProductRevision r ON r.product_revision_id = d.product_revision_id
                              WHERE d.product_export_track_id = t.product_export_track_id AND d.status = 'Accepted'
                                AND r.edition_number = @Edition AND r.update_number = @Update);
                """, new { product.DatasetName, product.Specification, product.Edition, product.Update,
                    Idle = ProductState.Idle, Accepted = ProductState.AcceptedForDistribution, NowUtc = nowUtc }, transaction, cancellationToken: cancellationToken));
            if (changed != 1)
                throw new InvalidOperationException("An accepted ENC revision changed before SQL finalization.");
            await connection.ExecuteAsync(new CommandDefinition("""
                INSERT INTO dbo.ProductStateHistory
                    (product_state_history_id, product_export_track_id, state, edition_number, update_number, owner, occurred_at_utc)
                SELECT @PublishedHistoryId, t.product_export_track_id, @Published, @Edition, @Update, 'IC-ENC acceptance', @NowUtc
                FROM dbo.ProductExportTrack t JOIN dbo.Product p ON p.product_id = t.product_id
                WHERE p.dataset_name = @DatasetName AND t.product_specification = @Specification;
                INSERT INTO dbo.ProductStateHistory
                    (product_state_history_id, product_export_track_id, state, edition_number, update_number, owner, occurred_at_utc)
                SELECT @IdleHistoryId, t.product_export_track_id, @Idle, @Edition, @Update, 'ENC package finalization', DATEADD(microsecond, 1, @NowUtc)
                FROM dbo.ProductExportTrack t JOIN dbo.Product p ON p.product_id = t.product_id
                WHERE p.dataset_name = @DatasetName AND t.product_specification = @Specification;
                """, new { product.DatasetName, product.Specification, product.Edition, product.Update,
                    Published = ProductState.Published, Idle = ProductState.Idle, NowUtc = nowUtc,
                    PublishedHistoryId = Guid.NewGuid(), IdleHistoryId = Guid.NewGuid() }, transaction, cancellationToken: cancellationToken));
        }
        await connection.ExecuteAsync(new CommandDefinition("""
            UPDATE dbo.EncPackageReplay WITH (UPDLOCK, HOLDLOCK)
            SET scan_from_utc = CASE WHEN scan_from_utc < @DetectedAtUtc THEN scan_from_utc ELSE @DetectedAtUtc END
            WHERE source_dataset_name = @SourceDatasetName;
            IF @@ROWCOUNT = 0
                INSERT INTO dbo.EncPackageReplay (source_dataset_name, scan_from_utc) VALUES (@SourceDatasetName, @DetectedAtUtc);
            DELETE FROM dbo.EncPackage WHERE package_id = @PackageId;
            """, new { package.SourceDatasetName, package.DetectedAtUtc, publication.PackageId }, transaction, cancellationToken: cancellationToken));
        transaction.Commit();
    }

    private sealed class AcknowledgementRow
    {
        public Guid DeliveryId { get; set; }
        public string Status { get; set; } = string.Empty;
        public string? SourceEventId { get; set; }
        public Guid RevisionId { get; set; }
        public Guid TrackId { get; set; }
        public ProductState State { get; set; }
        public int? Edition { get; set; }
        public int? Update { get; set; }
        public int RevisionEdition { get; set; }
        public int RevisionUpdate { get; set; }
        public Guid? PackageId { get; set; }
        public bool S57Discarded { get; set; }
        public bool S101Discarded { get; set; }
    }
    private sealed class PublicationRow
    {
        public string DatasetName { get; set; } = string.Empty;
        public string Specification { get; set; } = string.Empty;
        public int Edition { get; set; }
        public int Update { get; set; }
        public Guid RevisionId { get; set; }
    }
    private sealed class PublicationArtifact
    {
        public string Kind { get; set; } = string.Empty;
        public byte[] Content { get; set; } = [];
    }
}
