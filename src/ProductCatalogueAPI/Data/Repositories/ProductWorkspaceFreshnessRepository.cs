using Dapper;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using System.Text;

namespace ProductCatalogueAPI.Data.Repositories;

/// <summary>
/// Reads compact SQL revision signals without loading Product History rows or artifact content.
/// </summary>
public sealed class ProductWorkspaceFreshnessRepository(DbConnectionFactory connectionFactory)
    : IProductWorkspaceFreshnessRepository
{
    public async Task<ProductWorkspaceFreshnessStoreSnapshot> GetSnapshotAsync(
        IReadOnlyCollection<string> datasetNames,
        CancellationToken cancellationToken = default)
    {
        var names = datasetNames
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (names.Length == 0)
            return new ProductWorkspaceFreshnessStoreSnapshot([], []);

        var canonicalAuditNames = names
            .Select(name => name.ToUpperInvariant())
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        var canonicalAuditNameBytes = canonicalAuditNames
            .Select(Encoding.Unicode.GetBytes)
            .ToArray();

        using var connection = connectionFactory.Create();
        using var results = await connection.QueryMultipleAsync(new CommandDefinition(
            Sql,
            new
            {
                DatasetNames = names,
                CanonicalAuditDatasetNames = canonicalAuditNames,
                CanonicalAuditDatasetNameBytes = canonicalAuditNameBytes,
                ValidationKinds = new[]
                {
                    ProductArtifactKind.ValidationReport.ToString(),
                    ProductArtifactKind.ValidationDiagnostic.ToString()
                }
            },
            cancellationToken: cancellationToken));

        var tracks = (await results.ReadAsync<ProductWorkspaceFreshnessTrackSnapshot>()).ToArray();
        var auditEvents = (await results.ReadAsync<ProductWorkspaceFreshnessAuditSnapshot>()).ToArray();
        return new ProductWorkspaceFreshnessStoreSnapshot(tracks, auditEvents);
    }

    private const string Sql = """
        SELECT
            t.product_export_track_id AS TrackId,
            p.dataset_name AS DatasetName,
            t.product_specification AS ProductSpecification,
            t.state AS State,
            t.published_edition AS PublishedEdition,
            t.published_update AS PublishedUpdate,
            t.candidate_edition AS CandidateEdition,
            t.candidate_update AS CandidateUpdate,
            t.updated_at_utc AS UpdatedAtUtc,
            t.row_version AS RowVersion,
            (SELECT COUNT_BIG(*)
             FROM dbo.ProductStateHistory historyCount
             WHERE historyCount.product_export_track_id = t.product_export_track_id) AS StateHistoryCount,
            latestHistory.product_state_history_id AS LatestStateHistoryId,
            latestHistory.occurred_at_utc AS LatestStateHistoryAtUtc,
            (SELECT COUNT_BIG(*)
             FROM dbo.ProductArtifact artifactCount
             WHERE artifactCount.product_export_track_id = t.product_export_track_id
               AND artifactCount.artifact_kind IN @ValidationKinds) AS ValidationArtifactCount,
            latestArtifact.product_artifact_id AS LatestValidationArtifactId,
            latestArtifact.created_at_utc AS LatestValidationArtifactAtUtc
        FROM dbo.ProductExportTrack t
        INNER JOIN dbo.Product p ON p.product_id = t.product_id
        OUTER APPLY (
            SELECT TOP (1)
                history.product_state_history_id,
                history.occurred_at_utc
            FROM dbo.ProductStateHistory history
            WHERE history.product_export_track_id = t.product_export_track_id
            ORDER BY history.occurred_at_utc DESC, history.product_state_history_id DESC
        ) latestHistory
        OUTER APPLY (
            SELECT TOP (1)
                artifact.product_artifact_id,
                artifact.created_at_utc
            FROM dbo.ProductArtifact artifact
            WHERE artifact.product_export_track_id = t.product_export_track_id
              AND artifact.artifact_kind IN @ValidationKinds
            ORDER BY artifact.created_at_utc DESC, artifact.product_artifact_id DESC
        ) latestArtifact
        WHERE p.dataset_name IN @DatasetNames
        ORDER BY p.dataset_name, t.product_specification, t.product_export_track_id;

        SELECT
            DatasetName,
            COUNT_BIG(*) AS EventCount,
            MAX(UpdatedAtUtc) AS LatestUpdatedAtUtc
        FROM dbo.ProductHistoryEvent
        WHERE DatasetName IN @CanonicalAuditDatasetNames
          AND CONVERT(varbinary(512), DatasetName) IN @CanonicalAuditDatasetNameBytes
          AND FinalizedAtUtc IS NOT NULL
        GROUP BY DatasetName, CONVERT(varbinary(512), DatasetName)
        ORDER BY DatasetName;
        """;
}
