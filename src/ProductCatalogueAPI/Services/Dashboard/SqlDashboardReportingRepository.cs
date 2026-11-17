using Dapper;
using ProductCatalogueAPI.Data.Database;

namespace ProductCatalogueAPI.Services.Dashboard;

/// <summary>Reads small SQL metadata projections for the Dashboard; never reads artifact binary content.</summary>
public sealed class SqlDashboardReportingRepository(DbConnectionFactory connectionFactory) : IDashboardReportingRepository
{
    public async Task<DashboardReportingSnapshot> LoadAsync(
        DateTime fromUtc, DateTime toUtc, string? datasetName, CancellationToken cancellationToken)
    {
        // Keep independent result sets to avoid multiplying deliveries, tracks, and artifacts in joins.
        // The reporting interval is [from, to), matching ProductStateHistory and Dashboard paging.
        using var connection = connectionFactory.Create();
        using var reader = await connection.QueryMultipleAsync(new CommandDefinition("""
            SELECT d.delivery_id AS Id, d.product_revision_id AS RevisionId,
                   p.dataset_name AS DatasetName, t.product_specification AS ProductSpecification,
                   d.status AS Status, d.is_simulation AS IsSimulation,
                   d.reserved_at_utc AS ReservedAtUtc, d.completed_at_utc AS CompletedAtUtc,
                   d.acknowledged_at_utc AS AcknowledgedAtUtc
            FROM dbo.ProductIcEncDelivery d
            INNER JOIN dbo.ProductExportTrack t ON t.product_export_track_id = d.product_export_track_id
            INNER JOIN dbo.Product p ON p.product_id = t.product_id
            WHERE (@DatasetName IS NULL OR p.dataset_name = @DatasetName)
              AND ((d.completed_at_utc >= @FromUtc AND d.completed_at_utc < @ToUtc)
                   OR (d.acknowledged_at_utc >= @FromUtc AND d.acknowledged_at_utc < @ToUtc)
                   OR (d.status = 'Uncertain' AND d.reserved_at_utc >= @FromUtc AND d.reserved_at_utc < @ToUtc));

            SELECT t.product_export_track_id AS TrackId,
                   p.dataset_name AS DatasetName, t.product_specification AS ProductSpecification,
                   t.state AS State,
                   CONVERT(bit, CASE WHEN hold.product_export_track_id IS NULL THEN 0 ELSE 1 END) AS IsManuallyFrozen
            FROM dbo.ProductExportTrack t
            INNER JOIN dbo.Product p ON p.product_id = t.product_id
            LEFT JOIN dbo.ProductExportTrackFreezeHold hold
                ON hold.product_export_track_id = t.product_export_track_id
            WHERE (@DatasetName IS NULL OR p.dataset_name = @DatasetName);

            SELECT a.product_artifact_id AS Id, a.product_export_track_id AS TrackId,
                   a.product_revision_id AS RevisionId,
                   p.dataset_name AS DatasetName, t.product_specification AS ProductSpecification,
                   a.artifact_kind AS Kind, a.file_name AS FileName,
                   r.edition_number AS Edition, r.update_number AS [Update],
                   a.created_at_utc AS CreatedAtUtc
            FROM dbo.ProductArtifact a
            INNER JOIN dbo.ProductExportTrack t ON t.product_export_track_id = a.product_export_track_id
            INNER JOIN dbo.Product p ON p.product_id = t.product_id
            LEFT JOIN dbo.ProductRevision r ON r.product_revision_id = a.product_revision_id
                AND r.product_export_track_id = a.product_export_track_id
            WHERE a.artifact_kind IN ('IcEncReport', 'ValidationReport', 'ValidationDiagnostic')
              AND a.created_at_utc >= @FromUtc AND a.created_at_utc < @ToUtc
              AND (@DatasetName IS NULL OR p.dataset_name = @DatasetName);
            """, new { FromUtc = fromUtc, ToUtc = toUtc, DatasetName = datasetName },
            cancellationToken: cancellationToken));

        var deliveries = (await reader.ReadAsync<DashboardDeliveryRecord>()).ToArray();
        var tracks = (await reader.ReadAsync<DashboardTrackRecord>()).ToArray();
        var artifacts = (await reader.ReadAsync<DashboardArtifactRecord>()).ToArray();
        return new DashboardReportingSnapshot(deliveries, tracks, artifacts);
    }
}
