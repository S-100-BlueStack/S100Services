using Dapper;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using System.Data;

namespace ProductCatalogueAPI.Services.Jobs;

/// <summary>Reserves one immutable candidate for delivery and records the outcome in SQL.</summary>
public interface IIcEncDeliveryRepository
{
    Task<IcEncDelivery?> ReserveAsync(string datasetName, ProductSpecification specification, int edition, int update, string jobId, DateTime nowUtc, CancellationToken cancellationToken);
    Task MarkDeliveredAsync(Guid deliveryId, DateTime nowUtc, CancellationToken cancellationToken);
    Task MarkUncertainAsync(Guid deliveryId, DateTime nowUtc, string reason, CancellationToken cancellationToken);
    /// <summary>Resolves an uncertain transfer after an operator verifies IC-ENC's intake.</summary>
    Task<bool> ReconcileAsync(Guid deliveryId, bool receivedByIcEnc, string? owner, DateTime nowUtc, CancellationToken cancellationToken);
}

/// <summary>The ZIP belongs to the exact revision and version reserved by the send job.</summary>
public sealed record IcEncDelivery(Guid Id, string DatasetName, ProductSpecification Specification, int Edition, int Update, byte[] ExchangeSet);

public sealed class IcEncDeliveryRepository(DbConnectionFactory connectionFactory) : IIcEncDeliveryRepository
{
    public async Task<IcEncDelivery?> ReserveAsync(string datasetName, ProductSpecification specification, int edition, int update, string jobId, DateTime nowUtc, CancellationToken cancellationToken) {
        using var connection = connectionFactory.Create();
        connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
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
        if (artifact is null || artifact.Content is null || artifact.Content.Length == 0)
            throw new InvalidOperationException("The candidate has no stored exchange set.");

        var deliveryId = Guid.NewGuid();
        await connection.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.ProductIcEncDelivery
                (delivery_id, product_export_track_id, product_revision_id, job_id, status, reserved_at_utc)
            VALUES (@DeliveryId, @TrackId, @RevisionId, @JobId, 'Sending', @NowUtc);
            UPDATE dbo.ProductExportTrack
            SET state = @State, updated_at_utc = @NowUtc
            WHERE product_export_track_id = @TrackId;
            INSERT INTO dbo.ProductStateHistory
                (product_state_history_id, product_export_track_id, state, edition_number, update_number, owner, occurred_at_utc)
            VALUES (@HistoryId, @TrackId, @State, @Edition, @Update, 'IC-ENC delivery', @NowUtc);
            """, new { DeliveryId = deliveryId, TrackId = track.Id, artifact.RevisionId, JobId = jobId,
                       NowUtc = nowUtc, State = ProductState.InTransit, Edition = edition, Update = update,
                       HistoryId = Guid.NewGuid() }, transaction, cancellationToken: cancellationToken));
        transaction.Commit();
        return new IcEncDelivery(deliveryId, datasetName, specification, edition, update, artifact.Content);
    }

    public Task MarkDeliveredAsync(Guid deliveryId, DateTime nowUtc, CancellationToken cancellationToken) =>
        CompleteAsync(deliveryId, "Delivered", nowUtc, null, cancellationToken);

    public Task MarkUncertainAsync(Guid deliveryId, DateTime nowUtc, string reason, CancellationToken cancellationToken) =>
        CompleteAsync(deliveryId, "Uncertain", nowUtc, reason, cancellationToken);

    public async Task<bool> ReconcileAsync(Guid deliveryId, bool receivedByIcEnc, string? owner, DateTime nowUtc, CancellationToken cancellationToken) {
        using var connection = connectionFactory.Create();
        connection.Open();
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
        connection.Open();
        using var transaction = connection.BeginTransaction();
        var affected = await connection.ExecuteAsync(new CommandDefinition("""
            UPDATE dbo.ProductIcEncDelivery
            SET status = @Status, completed_at_utc = @NowUtc, error_message = @Reason
            WHERE delivery_id = @DeliveryId AND status = 'Sending';
            """, new { DeliveryId = deliveryId, Status = status, NowUtc = nowUtc, Reason = reason }, transaction, cancellationToken: cancellationToken));
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

    private sealed class DeliveryTrack
    {
        public Guid Id { get; set; }
        public ProductState State { get; set; }
        public int? Edition { get; set; }
        public int? Update { get; set; }
    }

    private sealed class DeliveryArtifact
    {
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
