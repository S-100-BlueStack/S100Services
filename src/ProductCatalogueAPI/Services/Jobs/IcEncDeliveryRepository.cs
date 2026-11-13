using Dapper;
using ProductCatalogueAPI.Services.Operations;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using System.Data;
using System.Data.Common;
using ProductCatalogueAPI.Services.ValidationEmail;

namespace ProductCatalogueAPI.Services.Jobs;

public sealed class IcEncDeliveryRepository(DbConnectionFactory connectionFactory) : IIcEncDeliveryRepository
{
    /// <inheritdoc/>
    public Task<IcEncDelivery?> ReserveAsync(string datasetName, ProductSpecification specification, int edition, int update, string jobId, DateTime nowUtc, CancellationToken cancellationToken) =>
        ReserveCoreAsync(datasetName, specification, edition, update, jobId, nowUtc, false, cancellationToken);

    /// <inheritdoc/>
    public Task<IcEncDelivery?> ReserveSimulationAsync(string datasetName, ProductSpecification specification, int edition, int update, string jobId, DateTime nowUtc, CancellationToken cancellationToken, Guid? packageId = null, Guid? revisionId = null) =>
        ReserveCoreAsync(datasetName, specification, edition, update, jobId, nowUtc, true, cancellationToken, packageId, revisionId);

    /// <inheritdoc/>
    public async Task<bool> IsPackageMemberAsync(string datasetName, ProductSpecification specification, CancellationToken cancellationToken) {
        using var connection = connectionFactory.Create();
        return await connection.ExecuteScalarAsync<bool>(new CommandDefinition("""
            SELECT CONVERT(bit, CASE WHEN EXISTS (SELECT 1 FROM dbo.EncPackage
                WHERE (source_dataset_name = @DatasetName AND @Specification = 'S101') OR
                      (s57_dataset_name = @DatasetName AND @Specification = 'S57')) THEN 1 ELSE 0 END);
            """, new { DatasetName = datasetName, Specification = specification.ToString() }, cancellationToken: cancellationToken));
    }

    /// <inheritdoc/>
    public async Task<IReadOnlyList<IcEncDelivery>?> ReserveSimulationPackageAsync(string sourceName, Guid packageId, IReadOnlyList<EncPackageSendMember> members, string jobId, DateTime nowUtc, CancellationToken cancellationToken) {
        if (members.Count != 2 || members.Count(m => m.Specification == ProductSpecification.S101) != 1 || members.Count(m => m.Specification == ProductSpecification.S57) != 1 ||
            members.Any(m => m.RevisionId == Guid.Empty || m.Edition < 0 || m.Update is < 0 or > 999) || string.IsNullOrWhiteSpace(jobId) || jobId.Length > 90)
            throw new ArgumentException("A package send requires two exact immutable ENC candidates and a bounded job identity.");
        using var connection = connectionFactory.Create();
        if (connection is DbConnection db) await db.OpenAsync(cancellationToken);
        else connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        // This is the same package/control -> tracks lock order used by Pause and paired discard.
        var package = await connection.QuerySingleOrDefaultAsync<EncPackage>(new CommandDefinition("""
            SELECT ep.package_id AS Id, ep.source_dataset_name AS SourceDatasetName, ep.s57_dataset_name AS S57DatasetName,
                ep.s101_discarded AS S101Discarded, ep.s57_discarded AS S57Discarded, ep.error_message AS ErrorMessage,
                COALESCE(control.is_paused, CONVERT(bit, 0)) AS IsPaused
            FROM dbo.EncPackage ep WITH (UPDLOCK, HOLDLOCK)
            LEFT JOIN dbo.EncPackageControl control WITH (UPDLOCK, HOLDLOCK) ON control.source_dataset_name = ep.source_dataset_name
            WHERE ep.package_id = @PackageId AND ep.source_dataset_name = @SourceName;
            """, new { PackageId = packageId, SourceName = sourceName }, transaction, cancellationToken: cancellationToken));
        if (!members.Any(m => m.Specification == ProductSpecification.S101 && m.DatasetName == sourceName)) return null;
        if (package is not null && members.Any(m => m.DatasetName != (m.Specification == ProductSpecification.S101 ? package.SourceDatasetName : package.S57DatasetName))) return null;
        if (await connection.ExecuteScalarAsync<bool>(new CommandDefinition("""
            SELECT CONVERT(bit, CASE WHEN EXISTS (
                SELECT 1 FROM dbo.ProductStateHistory h JOIN dbo.ProductExportTrack t ON t.product_export_track_id = h.product_export_track_id
                JOIN dbo.Product p ON p.product_id = t.product_id
                WHERE p.dataset_name = @SourceName AND t.product_specification = 'S101'
                    AND h.error_code = @HistoryCode AND h.error_message = @Receipt
            ) THEN 1 ELSE 0 END);
            """, new { SourceName = sourceName, EncPackageFailureRules.HistoryCode,
                Receipt = EncPackageFailureRules.Receipt(packageId) }, transaction, cancellationToken: cancellationToken))) return null;
        var ordered = members.OrderBy(m => m.Specification == ProductSpecification.S101 ? 0 : 1).ToArray();
        var jobIds = ordered.Select(m => jobId + ":" + m.Specification).ToArray();
        var prior = (await connection.QueryAsync<SimulationReservation>(new CommandDefinition("""
            SELECT d.delivery_id AS Id, d.product_revision_id AS RevisionId, d.product_export_track_id AS TrackId,
                d.reserved_at_utc AS ReservedAtUtc, d.status AS Status, t.product_specification AS Specification,
                p.dataset_name AS DatasetName, r.edition_number AS Edition, r.update_number AS [Update], a.content AS ExchangeSet
            FROM dbo.ProductIcEncDelivery d WITH (UPDLOCK, HOLDLOCK)
            JOIN dbo.ProductExportTrack t ON t.product_export_track_id = d.product_export_track_id
            JOIN dbo.Product p ON p.product_id = t.product_id
            JOIN dbo.ProductRevision r ON r.product_revision_id = d.product_revision_id AND r.product_export_track_id = t.product_export_track_id
            CROSS APPLY (SELECT TOP (1) content FROM dbo.ProductArtifact WHERE product_revision_id = r.product_revision_id
                AND artifact_kind = 'ExchangeSet' ORDER BY created_at_utc DESC, product_artifact_id DESC) a
            WHERE d.job_id IN @JobIds AND d.is_simulation = 1;
            """, new { JobIds = jobIds }, transaction, cancellationToken: cancellationToken))).ToArray();
        if (prior.Length != 0) {
            // Internal replay completes only this job's already committed pair; it never reserves another member.
            if (prior.Length != 2 || ordered.Any(m => prior.Count(p => p.RevisionId == m.RevisionId && p.DatasetName == m.DatasetName && p.Specification == m.Specification.ToString() &&
                p.Edition == m.Edition && p.Update == m.Update && p.Status is ("Delivered" or "Accepted" or "Rejected")) != 1)) return null;
            transaction.Commit();
            return prior.Select(p => new IcEncDelivery(p.Id, p.DatasetName, Enum.Parse<ProductSpecification>(p.Specification), p.Edition, p.Update, p.ExchangeSet) {
                RevisionId = p.RevisionId, TrackId = p.TrackId, ReservedAtUtc = p.ReservedAtUtc
            }).ToArray();
        }
        if (package is null || package.IsPaused || package.S101Discarded || package.S57Discarded || !string.IsNullOrWhiteSpace(package.ErrorMessage)) return null;
        var prepared = new List<(IcEncDelivery Delivery, ValidationOutgoingManifest.Entry[] Manifest)>(2);
        foreach (var member in ordered) {
            var track = await connection.QuerySingleOrDefaultAsync<DeliveryTrack>(new CommandDefinition("""
                SELECT t.product_export_track_id AS Id, t.state AS State, t.candidate_edition AS Edition, t.candidate_update AS [Update]
                FROM dbo.ProductExportTrack t WITH (UPDLOCK, HOLDLOCK) JOIN dbo.Product p ON p.product_id = t.product_id
                OUTER APPLY (SELECT TOP (1) h.error_code, h.error_message FROM dbo.ProductStateHistory h
                    WHERE h.product_export_track_id = t.product_export_track_id ORDER BY h.occurred_at_utc DESC, h.product_state_history_id DESC) history
                WHERE p.dataset_name = @DatasetName AND t.product_specification = @Specification
                    AND NOT EXISTS (SELECT 1 FROM dbo.ProductExportTrackFreezeHold WITH (UPDLOCK, HOLDLOCK) WHERE product_export_track_id = t.product_export_track_id)
                    AND NULLIF(LTRIM(RTRIM(history.error_code)), '') IS NULL AND NULLIF(LTRIM(RTRIM(history.error_message)), '') IS NULL;
                """, new { member.DatasetName, Specification = member.Specification.ToString() }, transaction, cancellationToken: cancellationToken));
            if (track is null || track.State != ProductState.ReadyForDistribution || track.Edition != member.Edition || track.Update != member.Update) return null;
            var artifact = await connection.QuerySingleOrDefaultAsync<DeliveryArtifact>(new CommandDefinition("""
                SELECT TOP (1) r.product_revision_id AS RevisionId, a.content AS Content, r.edition_number AS Edition, r.update_number AS [Update]
                FROM dbo.ProductRevision r WITH (UPDLOCK, HOLDLOCK)
                OUTER APPLY (SELECT TOP (1) content FROM dbo.ProductArtifact WHERE product_revision_id = r.product_revision_id
                    AND artifact_kind = 'ExchangeSet' ORDER BY created_at_utc DESC, product_artifact_id DESC) a
                WHERE r.product_export_track_id = @TrackId ORDER BY r.created_at_utc DESC, r.product_revision_id DESC;
                """, new { TrackId = track.Id }, transaction, cancellationToken: cancellationToken));
            if (artifact is null || artifact.RevisionId != member.RevisionId || artifact.Edition != member.Edition || artifact.Update != member.Update || artifact.Content is not { Length: > 0 }) return null;
            // Read both ZIPs before any delivery/history/state write. A malformed sibling rolls back the entire attempt.
            var manifest = ValidationOutgoingManifest.Read(artifact.Content, member.Specification.ToString(), member.DatasetName, member.Update);
            if (await connection.ExecuteScalarAsync<bool>(new CommandDefinition("""
                SELECT CONVERT(bit, CASE WHEN EXISTS (SELECT 1 FROM dbo.ProductIcEncDelivery WITH (UPDLOCK, HOLDLOCK)
                    WHERE product_revision_id = @RevisionId AND status <> 'NotDelivered') THEN 1 ELSE 0 END);
                """, new { RevisionId = member.RevisionId }, transaction, cancellationToken: cancellationToken))) return null;
            prepared.Add((new(Guid.NewGuid(), member.DatasetName, member.Specification, member.Edition, member.Update, artifact.Content) {
                RevisionId = member.RevisionId, TrackId = track.Id, ReservedAtUtc = nowUtc
            }, manifest));
        }
        foreach (var item in prepared) {
            var delivery = item.Delivery;
            // Simulation has no external transport. Both delivered records and both InTransit states become visible together.
            await connection.ExecuteAsync(new CommandDefinition("""
                INSERT dbo.ProductIcEncDelivery (delivery_id, product_export_track_id, product_revision_id, job_id, status, reserved_at_utc, completed_at_utc, is_simulation)
                VALUES (@Id, @TrackId, @RevisionId, @JobId, 'Delivered', @NowUtc, @NowUtc, 1);
                UPDATE dbo.ProductExportTrack SET state = @InTransit, updated_at_utc = @NowUtc WHERE product_export_track_id = @TrackId AND state = @Ready;
                IF @@ROWCOUNT <> 1 THROW 51210, 'The package candidate changed before paired reservation.', 1;
                INSERT dbo.ProductStateHistory (product_state_history_id, product_export_track_id, state, edition_number, update_number, owner, occurred_at_utc)
                VALUES (@HistoryId, @TrackId, @InTransit, @Edition, @Update, 'Simulated package delivery', @NowUtc);
                """, new { delivery.Id, delivery.TrackId, delivery.RevisionId, JobId = jobId + ":" + delivery.Specification, NowUtc = nowUtc,
                    InTransit = ProductState.InTransit, Ready = ProductState.ReadyForDistribution, delivery.Edition, delivery.Update, HistoryId = Guid.NewGuid() }, transaction, cancellationToken: cancellationToken));
            foreach (var file in item.Manifest)
                await connection.ExecuteAsync(new CommandDefinition("INSERT dbo.ProductIcEncDeliveryFile (delivery_id, file_name, sha256, crc) VALUES (@Id, @FileName, @Sha256, @Crc);",
                    new { delivery.Id, file.FileName, file.Sha256, file.Crc }, transaction, cancellationToken: cancellationToken));
        }
        cancellationToken.ThrowIfCancellationRequested();
        transaction.Commit();
        return prepared.Select(p => p.Delivery).ToArray();
    }

    /// <summary>Locks Pause before the track and records provenance with the immutable reservation.</summary>
    private async Task<IcEncDelivery?> ReserveCoreAsync(string datasetName, ProductSpecification specification, int edition, int update, string jobId, DateTime nowUtc, bool simulation, CancellationToken cancellationToken, Guid? packageId = null, Guid? revisionId = null) {
        using var connection = connectionFactory.Create();
        if (connection is DbConnection dbConnection) await dbConnection.OpenAsync(cancellationToken);
        else connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        // Package Pause is an authoritative delivery gate. Lock it before the track row,
        // matching the package-action transaction order and closing the Send/Pause race.
        // A singular endpoint must never reserve only one member of an active ENC package.
        if (await connection.ExecuteScalarAsync<bool>(new CommandDefinition("""
            SELECT CONVERT(bit, CASE WHEN EXISTS (SELECT 1 FROM dbo.EncPackage WITH (UPDLOCK, HOLDLOCK)
                WHERE (source_dataset_name = @DatasetName AND @Specification = 'S101') OR
                      (s57_dataset_name = @DatasetName AND @Specification = 'S57')) THEN 1 ELSE 0 END);
            """, new { DatasetName = datasetName, Specification = specification.ToString() }, transaction, cancellationToken: cancellationToken))) return null;
        var isPackagePaused = await connection.ExecuteScalarAsync<bool>(new CommandDefinition("""
            SELECT CONVERT(bit, CASE WHEN EXISTS (
                SELECT 1 FROM dbo.EncPackage ep WITH (UPDLOCK, HOLDLOCK)
                INNER JOIN dbo.EncPackageControl control WITH (UPDLOCK, HOLDLOCK)
                    ON control.source_dataset_name = ep.source_dataset_name
                WHERE control.is_paused = 1 AND (
                    (ep.source_dataset_name = @DatasetName AND @Specification = 'S101') OR
                    (ep.s57_dataset_name = @DatasetName AND @Specification = 'S57'))
            ) THEN 1 ELSE 0 END);
            """, new { DatasetName = datasetName, Specification = specification.ToString() }, transaction, cancellationToken: cancellationToken));
        if (isPackagePaused) return null;
        if (packageId.HasValue && !await connection.ExecuteScalarAsync<bool>(new CommandDefinition("""
            SELECT CONVERT(bit, CASE WHEN EXISTS (SELECT 1 FROM dbo.EncPackage WITH (UPDLOCK, HOLDLOCK)
                WHERE package_id = @PackageId AND s57_discarded = 0 AND s101_discarded = 0
                    AND ((source_dataset_name = @DatasetName AND @Specification = 'S101') OR (s57_dataset_name = @DatasetName AND @Specification = 'S57')))
                THEN 1 ELSE 0 END);
            """, new { PackageId = packageId, DatasetName = datasetName, Specification = specification.ToString() }, transaction, cancellationToken: cancellationToken))) return null;

        // Recover a simulated send interrupted after reservation, capture or acknowledgement without rerolling it.
        if (simulation) {
            var prior = await connection.QuerySingleOrDefaultAsync<SimulationReservation>(new CommandDefinition("""
                SELECT d.delivery_id AS Id, d.product_revision_id AS RevisionId, d.product_export_track_id AS TrackId,
                       d.reserved_at_utc AS ReservedAtUtc, p.dataset_name AS DatasetName, r.edition_number AS Edition,
                       r.update_number AS [Update], a.content AS ExchangeSet
                FROM dbo.ProductIcEncDelivery d WITH (UPDLOCK, HOLDLOCK)
                JOIN dbo.ProductExportTrack t ON t.product_export_track_id = d.product_export_track_id
                JOIN dbo.Product p ON p.product_id = t.product_id
                JOIN dbo.ProductRevision r ON r.product_revision_id = d.product_revision_id
                CROSS APPLY (SELECT TOP (1) content FROM dbo.ProductArtifact WHERE product_revision_id = r.product_revision_id
                    AND artifact_kind = 'ExchangeSet' ORDER BY created_at_utc DESC, product_artifact_id DESC) a
                WHERE d.job_id = @JobId AND d.is_simulation = 1 AND p.dataset_name = @DatasetName
                    AND t.product_specification = @Specification AND r.edition_number = @Edition AND r.update_number = @Update;
                """, new { JobId = jobId, DatasetName = datasetName, Specification = specification.ToString(), Edition = edition, Update = update }, transaction, cancellationToken: cancellationToken));
            if (prior is not null && (!revisionId.HasValue || prior.RevisionId == revisionId)) {
                transaction.Commit();
                return new(prior.Id, prior.DatasetName, specification, prior.Edition, prior.Update, prior.ExchangeSet) {
                    RevisionId = prior.RevisionId, TrackId = prior.TrackId, ReservedAtUtc = prior.ReservedAtUtc
                };
            }
        }

        var mixedMode = await connection.ExecuteScalarAsync<bool>(new CommandDefinition("""
            SELECT CONVERT(bit, CASE WHEN EXISTS (
                SELECT 1 FROM dbo.EncPackage ep WITH (UPDLOCK, HOLDLOCK)
                JOIN dbo.Product p ON p.dataset_name = ep.source_dataset_name OR p.dataset_name = ep.s57_dataset_name
                JOIN dbo.ProductExportTrack t ON t.product_id = p.product_id AND
                    ((p.dataset_name = ep.source_dataset_name AND t.product_specification = 'S101') OR
                     (p.dataset_name = ep.s57_dataset_name AND t.product_specification = 'S57'))
                JOIN dbo.ProductRevision r ON r.product_export_track_id = t.product_export_track_id
                    AND r.edition_number = t.candidate_edition AND r.update_number = t.candidate_update
                JOIN dbo.ProductIcEncDelivery d ON d.product_revision_id = r.product_revision_id
                WHERE ((ep.source_dataset_name = @DatasetName AND @Specification = 'S101') OR
                       (ep.s57_dataset_name = @DatasetName AND @Specification = 'S57'))
                    AND d.is_simulation <> @Simulation AND d.status <> 'NotDelivered'
                    AND NOT EXISTS (SELECT 1 FROM dbo.ProductRevision newer WHERE newer.product_export_track_id = t.product_export_track_id
                        AND (newer.created_at_utc > r.created_at_utc OR (newer.created_at_utc = r.created_at_utc AND newer.product_revision_id > r.product_revision_id)))
            ) THEN 1 ELSE 0 END);
            """, new { DatasetName = datasetName, Specification = specification.ToString(), Simulation = simulation }, transaction, cancellationToken: cancellationToken));
        if (mixedMode) return null;

        var track = await connection.QuerySingleOrDefaultAsync<DeliveryTrack>(new CommandDefinition("""
            SELECT t.product_export_track_id AS Id, t.state AS State, t.candidate_edition AS Edition,
                   t.candidate_update AS [Update]
            FROM dbo.ProductExportTrack t WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN dbo.Product p ON p.product_id = t.product_id
            WHERE p.dataset_name = @DatasetName AND t.product_specification = @Specification
              AND NOT EXISTS (SELECT 1 FROM dbo.ProductExportTrackFreezeHold h WHERE h.product_export_track_id = t.product_export_track_id);
            """, new { DatasetName = datasetName, Specification = specification.ToString() }, transaction, cancellationToken: cancellationToken));
        if (track is null || track.State != ProductState.ReadyForDistribution ||
            track.Edition != edition || track.Update != update)
            return null;

        // A replaced candidate can have the same version. Only the latest matching revision is eligible.
        var artifact = await connection.QuerySingleOrDefaultAsync<DeliveryArtifact>(new CommandDefinition("""
            SELECT TOP 1 r.product_revision_id AS RevisionId, a.content AS Content
            FROM dbo.ProductRevision r
            OUTER APPLY (SELECT TOP 1 content FROM dbo.ProductArtifact
                         WHERE product_revision_id = r.product_revision_id AND artifact_kind = 'ExchangeSet'
                         ORDER BY created_at_utc DESC, product_artifact_id DESC) a
            WHERE r.product_export_track_id = @TrackId AND r.edition_number = @Edition
              AND r.update_number = @Update
            ORDER BY r.created_at_utc DESC, r.product_revision_id DESC;
            """, new { TrackId = track.Id, Edition = edition, Update = update }, transaction, cancellationToken: cancellationToken));
        if (revisionId.HasValue && artifact?.RevisionId != revisionId) return null;
        if (artifact is null || artifact.Content is null || artifact.Content.Length == 0)
            throw new InvalidOperationException("The candidate has no stored exchange set.");

        if (simulation && await connection.ExecuteScalarAsync<bool>(new CommandDefinition("""
            SELECT CONVERT(bit, CASE WHEN EXISTS (
                SELECT 1 FROM dbo.ProductRevision newer
                JOIN dbo.ProductRevision reserved ON reserved.product_revision_id = @RevisionId
                WHERE newer.product_export_track_id = @TrackId AND (newer.created_at_utc > reserved.created_at_utc OR
                    (newer.created_at_utc = reserved.created_at_utc AND newer.product_revision_id > reserved.product_revision_id))) THEN 1 ELSE 0 END);
            """, new { artifact.RevisionId, TrackId = track.Id }, transaction, cancellationToken: cancellationToken))) return null;
        var deliveryId = Guid.NewGuid();
        // Capture the exact transmitted file and checksum in the same transaction as the immutable revision reservation.
        var manifest = ValidationOutgoingManifest.Read(artifact.Content, specification.ToString(), datasetName, update);
        await connection.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.ProductIcEncDelivery
                (delivery_id, product_export_track_id, product_revision_id, job_id, status, reserved_at_utc, is_simulation)
            VALUES (@DeliveryId, @TrackId, @RevisionId, @JobId, 'Sending', @NowUtc, @Simulation);
            UPDATE dbo.ProductExportTrack
            SET state = @State, updated_at_utc = @NowUtc
            WHERE product_export_track_id = @TrackId;
            INSERT INTO dbo.ProductStateHistory
                (product_state_history_id, product_export_track_id, state, edition_number, update_number, owner, occurred_at_utc)
            VALUES (@HistoryId, @TrackId, @State, @Edition, @Update, 'IC-ENC delivery', @NowUtc);
            """, new { DeliveryId = deliveryId, TrackId = track.Id, artifact.RevisionId, JobId = jobId,
                       NowUtc = nowUtc, Simulation = simulation, State = ProductState.InTransit, Edition = edition, Update = update,
                       HistoryId = Guid.NewGuid() }, transaction, cancellationToken: cancellationToken));
        foreach (var file in manifest)
            await connection.ExecuteAsync(new CommandDefinition("""
                INSERT dbo.ProductIcEncDeliveryFile (delivery_id, file_name, sha256, crc)
                VALUES (@DeliveryId, @FileName, @Sha256, @Crc);
                """, new { DeliveryId = deliveryId, file.FileName, file.Sha256, file.Crc }, transaction, cancellationToken: cancellationToken));
        transaction.Commit();
        return new IcEncDelivery(deliveryId, datasetName, specification, edition, update, artifact.Content) { RevisionId = artifact.RevisionId, TrackId = track.Id, ReservedAtUtc = nowUtc };
    }

    public Task MarkDeliveredAsync(Guid deliveryId, DateTime nowUtc, CancellationToken cancellationToken) =>
        CompleteAsync(deliveryId, "Delivered", nowUtc, null, cancellationToken);

    public Task MarkUncertainAsync(Guid deliveryId, DateTime nowUtc, string reason, CancellationToken cancellationToken) =>
        CompleteAsync(deliveryId, "Uncertain", nowUtc, reason, cancellationToken);

    public async Task<bool> ReconcileAsync(Guid deliveryId, bool receivedByIcEnc, string? owner, DateTime nowUtc, CancellationToken cancellationToken) {
        using var connection = connectionFactory.Create();
        if (connection is DbConnection dbConnection) await dbConnection.OpenAsync(cancellationToken);
        else connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        var delivery = await connection.QuerySingleOrDefaultAsync<ReconciliationState>(new CommandDefinition("""
            SELECT d.product_export_track_id AS TrackId, t.state AS State, t.candidate_edition AS Edition, t.candidate_update AS [Update]
            FROM dbo.ProductIcEncDelivery d WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN dbo.ProductExportTrack t WITH (UPDLOCK, HOLDLOCK) ON t.product_export_track_id = d.product_export_track_id
            WHERE d.delivery_id = @DeliveryId AND d.status = 'Uncertain';
            """, new { DeliveryId = deliveryId }, transaction, cancellationToken: cancellationToken));
        if (delivery is null || delivery.State != ProductState.InTransit || delivery.Edition is null || delivery.Update is null)
            return false;

        await connection.ExecuteAsync(new CommandDefinition("""
            UPDATE dbo.ProductIcEncDelivery SET status = @Status, completed_at_utc = @NowUtc, error_message = NULL
            WHERE delivery_id = @DeliveryId AND status = 'Uncertain';
            UPDATE dbo.ProductExportTrack SET state = @TrackState, updated_at_utc = @NowUtc
            WHERE product_export_track_id = @TrackId;
            INSERT INTO dbo.ProductStateHistory
                (product_state_history_id, product_export_track_id, state, edition_number, update_number, owner, occurred_at_utc)
            VALUES (@HistoryId, @TrackId, @TrackState, @Edition, @Update, @Owner, @NowUtc);
            """, new { DeliveryId = deliveryId, Status = receivedByIcEnc ? "Delivered" : "NotDelivered",
                       TrackState = receivedByIcEnc ? ProductState.InTransit : ProductState.ReadyForDistribution,
                       delivery.TrackId, delivery.Edition, delivery.Update, Owner = owner, NowUtc = nowUtc,
                       HistoryId = Guid.NewGuid() }, transaction, cancellationToken: cancellationToken));
        transaction.Commit();
        return true;
    }

    private async Task CompleteAsync(Guid deliveryId, string status, DateTime nowUtc, string? reason, CancellationToken cancellationToken) {
        using var connection = connectionFactory.Create();
        if (connection is DbConnection dbConnection) await dbConnection.OpenAsync(cancellationToken);
        else connection.Open();
        using var transaction = connection.BeginTransaction();
        var affected = await connection.ExecuteAsync(new CommandDefinition("""
            UPDATE dbo.ProductIcEncDelivery
            SET status = @Status, completed_at_utc = @NowUtc, error_message = @Reason
            WHERE delivery_id = @DeliveryId AND status = 'Sending';
            """, new { DeliveryId = deliveryId, Status = status, NowUtc = nowUtc, Reason = reason }, transaction, cancellationToken: cancellationToken));
        if (affected == 0 && status == "Delivered" && await connection.ExecuteScalarAsync<bool>(new CommandDefinition(
            "SELECT CONVERT(bit, CASE WHEN EXISTS (SELECT 1 FROM dbo.ProductIcEncDelivery WHERE delivery_id = @DeliveryId AND is_simulation = 1 AND status IN ('Delivered', 'Accepted', 'Rejected')) THEN 1 ELSE 0 END);",
            new { DeliveryId = deliveryId }, transaction, cancellationToken: cancellationToken))) {
            transaction.Commit();
            return;
        }
        if (affected != 1)
            throw new InvalidOperationException("The IC-ENC delivery reservation could not be completed.");
        if (status == "Uncertain")
            await connection.ExecuteAsync(new CommandDefinition("""
                INSERT INTO dbo.ProductStateHistory
                    (product_state_history_id, product_export_track_id, state, edition_number, update_number, owner, occurred_at_utc, error_code, error_message)
                SELECT @HistoryId, t.product_export_track_id, t.state,
                       t.candidate_edition, t.candidate_update, 'IC-ENC delivery', @NowUtc,
                       'IC_ENC_DELIVERY_UNCERTAIN', @Reason
                FROM dbo.ProductIcEncDelivery d
                INNER JOIN dbo.ProductExportTrack t ON t.product_export_track_id = d.product_export_track_id
                WHERE d.delivery_id = @DeliveryId;
                """, new { HistoryId = Guid.NewGuid(), DeliveryId = deliveryId, NowUtc = nowUtc, Reason = reason }, transaction, cancellationToken: cancellationToken));
        transaction.Commit();
    }

    private sealed class SimulationReservation
    {
        public string Specification { get; set; } = "";
        public string Status { get; set; } = "";
        public Guid Id { get; set; }
        public Guid RevisionId { get; set; }
        public Guid TrackId { get; set; }
        public DateTime ReservedAtUtc { get; set; }
        public string DatasetName { get; set; } = "";
        public int Edition { get; set; }
        public int Update { get; set; }
        public byte[] ExchangeSet { get; set; } = [];
    }

    private sealed class DeliveryTrack
    {
        public Guid Id { get; set; }
        public ProductState State { get; set; }
        public int? Edition { get; set; }
        public int? Update { get; set; }
    }

    private sealed class DeliveryArtifact
    {
        public int Edition { get; set; }
        public int Update { get; set; }
        public Guid RevisionId { get; set; }
        public byte[] Content { get; set; } = [];
    }

    private sealed class ReconciliationState
    {
        public Guid TrackId { get; set; }
        public ProductState State { get; set; }
        public int? Edition { get; set; }
        public int? Update { get; set; }
    }
}
