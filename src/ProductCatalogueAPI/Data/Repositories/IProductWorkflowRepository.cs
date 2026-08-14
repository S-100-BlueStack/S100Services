using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Data.Repositories;

/// <summary>
/// Persists independent product tracks, candidate revisions, artifacts, and daily change summaries in SQL Server.
/// </summary>
public interface IProductWorkflowRepository
{
    /// <summary>Gets one product track by dataset and product specification.</summary>
    Task<ProductExportTrackRecord?> GetTrackAsync(string datasetName, ProductSpecification productSpecification, CancellationToken cancellationToken = default);

    /// <summary>Creates a missing track from the currently published S-128 version, or returns the existing SQL-authoritative track.</summary>
    Task<ProductExportTrackRecord> GetOrCreateTrackAsync(string datasetName, ProductSpecification productSpecification, ExportEngineKind engine, int publishedEdition, int publishedUpdate, CancellationToken cancellationToken = default);

    /// <summary>Atomically records a candidate version and changes its track to <see cref="ProductState.Exporting"/>.</summary>
    Task BeginExportAsync(Guid trackId, int candidateEdition, int candidateUpdate, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default);

    /// <summary>Changes a track state and appends immutable history without altering published S-128 version values.</summary>
    Task SetStateAsync(Guid trackId, ProductState state, string? owner, DateTime occurredAtUtc, string? errorCode = null, string? errorMessage = null, CancellationToken cancellationToken = default);

    /// <summary>Clears an unverified candidate and records a cancelled workflow state.</summary>
    Task CancelCandidateAsync(Guid trackId, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default);

    /// <summary>Creates an immutable candidate revision containing its complete YAML source.</summary>
    Task<Guid> AddRevisionAsync(ProductRevisionWrite revision, CancellationToken cancellationToken = default);

    /// <summary>Stores a typed artifact without imposing format-specific columns on the schema.</summary>
    Task AddArtifactAsync(ProductArtifactWrite artifact, CancellationToken cancellationToken = default);

    /// <summary>Gets the open daily summary for a track and work date.</summary>
    Task<ProductChangeSummary?> GetOpenChangeSummaryAsync(Guid trackId, DateOnly workDate, CancellationToken cancellationToken = default);

    /// <summary>Upserts the complete, lock-protected daily summary and its normalized changes.</summary>
    Task SaveChangeSummaryAsync(ProductChangeSummary summary, CancellationToken cancellationToken = default);

    /// <summary>Gets all open summaries that can be evaluated by the nightly export rulesets.</summary>
    Task<IReadOnlyList<ProductChangeSummary>> GetOpenChangeSummariesAsync(CancellationToken cancellationToken = default);

    /// <summary>Closes a summary after its candidate export has been durably created.</summary>
    Task CloseChangeSummaryAsync(Guid summaryId, DateTime closedAtUtc, CancellationToken cancellationToken = default);
}
