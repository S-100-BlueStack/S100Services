namespace ProductCatalogueAPI.Data.Repositories;

/// <summary>
/// Reads the lightweight SQL-owned revision signals used by Analyze and Review workspace freshness checks.
/// </summary>
public interface IProductWorkspaceFreshnessRepository
{
    /// <summary>Gets workflow, history, validation-artifact, and finalized audit signals for the requested datasets.</summary>
    Task<ProductWorkspaceFreshnessStoreSnapshot> GetSnapshotAsync(
        IReadOnlyCollection<string> datasetNames,
        CancellationToken cancellationToken = default);
}

/// <summary>Contains the persisted freshness signals needed to build opaque public workspace revisions.</summary>
public sealed record ProductWorkspaceFreshnessStoreSnapshot(
    IReadOnlyList<ProductWorkspaceFreshnessTrackSnapshot> Tracks,
    IReadOnlyList<ProductWorkspaceFreshnessAuditSnapshot> AuditEvents);

/// <summary>Represents one independently versioned Product workflow track and its visible child-data revisions.</summary>
public sealed record ProductWorkspaceFreshnessTrackSnapshot(
    Guid TrackId,
    string DatasetName,
    string ProductSpecification,
    int State,
    int PublishedEdition,
    int PublishedUpdate,
    int? CandidateEdition,
    int? CandidateUpdate,
    DateTime UpdatedAtUtc,
    byte[] RowVersion,
    long StateHistoryCount,
    Guid? LatestStateHistoryId,
    DateTime? LatestStateHistoryAtUtc,
    long ValidationArtifactCount,
    Guid? LatestValidationArtifactId,
    DateTime? LatestValidationArtifactAtUtc);

/// <summary>Represents the finalized public audit-event revision for one Product.</summary>
public sealed record ProductWorkspaceFreshnessAuditSnapshot(
    string DatasetName,
    long EventCount,
    DateTime? LatestUpdatedAtUtc);
