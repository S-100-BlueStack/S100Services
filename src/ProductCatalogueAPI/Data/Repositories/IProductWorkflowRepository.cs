using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Data.Repositories;

/// <summary>
/// Persists independent product tracks, candidate revisions and artifacts in SQL Server.
/// </summary>
public interface IProductWorkflowRepository
{
    /// <summary>Gets one product track by dataset and product specification.</summary>
    Task<ProductExportTrackRecord?> GetTrackAsync(string datasetName, ProductSpecification productSpecification, CancellationToken cancellationToken = default);

    /// <summary>Gets all independently versioned tracks for one dataset.</summary>
    Task<IReadOnlyList<ProductExportTrackRecord>> GetTracksAsync(string datasetName, CancellationToken cancellationToken = default);

    /// <summary>Gets both export tracks for all AOIs in a bounded number of SQL reads.</summary>
    async Task<IReadOnlyList<ProductExportTrackRecord>> GetTracksByNamesAsync(IEnumerable<string> datasetNames, CancellationToken cancellationToken = default) {
        var result = new List<ProductExportTrackRecord>();
        foreach (var name in datasetNames.Distinct(StringComparer.OrdinalIgnoreCase))
            result.AddRange(await GetTracksAsync(name, cancellationToken));
        return result;
    }

    /// <summary>Creates a missing track from the currently published S-128 version, or returns the existing SQL-authoritative track.</summary>
    Task<ProductExportTrackRecord> GetOrCreateTrackAsync(string datasetName, ProductSpecification productSpecification, ExportEngineKind engine, int publishedEdition, int publishedUpdate, CancellationToken cancellationToken = default);

    /// <summary>Atomically records a candidate version and changes its track to <see cref="ProductState.Exporting"/>.</summary>
    Task BeginExportAsync(Guid trackId, int candidateEdition, int candidateUpdate, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default);

    /// <summary>Changes a track state and appends immutable history without altering published S-128 version values.</summary>
    Task SetStateAsync(Guid trackId, ProductState state, string? owner, DateTime occurredAtUtc, string? errorCode = null, string? errorMessage = null, CancellationToken cancellationToken = default);

    /// <summary>Creates an independent manual hold without changing the underlying workflow state.</summary>
    Task<bool> SetManualFreezeAsync(Guid trackId, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default);

    /// <summary>Removes an independent manual hold and leaves the underlying workflow state unchanged.</summary>
    Task<bool> ClearManualFreezeAsync(Guid trackId, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default);

    /// <summary>Clears an unverified candidate, or acknowledges a failed build that never received a candidate version.</summary>
    Task DiscardCandidateAsync(Guid trackId, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default);

    /// <summary>Creates an immutable candidate revision containing its complete YAML source.</summary>
    Task<Guid> AddRevisionAsync(ProductRevisionWrite revision, CancellationToken cancellationToken = default);

    /// <summary>Stores a typed artifact without imposing format-specific columns on the schema.</summary>
    Task AddArtifactAsync(ProductArtifactWrite artifact, CancellationToken cancellationToken = default);

    /// <summary>Gets the most recently created candidate revision for a product track.</summary>
    Task<Guid?> GetLatestRevisionIdAsync(Guid trackId, CancellationToken cancellationToken = default);

    /// <summary>Gets downloadable validation diagnostics belonging to one candidate revision.</summary>
    Task<IReadOnlyList<ProductArtifactReference>> GetValidationArtifactsAsync(Guid productRevisionId, CancellationToken cancellationToken = default);

    /// <summary>Gets all downloadable validation diagnostics ever created for a product track.</summary>
    Task<IReadOnlyList<ProductArtifactReference>> GetValidationArtifactHistoryAsync(Guid trackId, CancellationToken cancellationToken = default);

    /// <summary>Gets one validation diagnostic after verifying that it belongs to the requested dataset.</summary>
    Task<ProductArtifactContent?> GetValidationArtifactAsync(string datasetName, Guid artifactId, CancellationToken cancellationToken = default);

}
