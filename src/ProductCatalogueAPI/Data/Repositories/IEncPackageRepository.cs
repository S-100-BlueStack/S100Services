using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Data.Repositories;

/// <summary>Persists one active package per S-101 AOI and any source scan that must be replayed.</summary>
public interface IEncPackageRepository
{
    /// <summary>Gets active packages for a set of S-101 AOIs in one SQL read.</summary>
    Task<IReadOnlyDictionary<string, EncPackage>> GetActiveAsync(IEnumerable<string> sourceDatasetNames, CancellationToken cancellationToken = default, bool includeSourceYaml = true);
    /// <summary>Gets the oldest scan lower bound that was rolled back by a discard or a completed package.</summary>
    Task<DateTime?> GetReplayFromUtcAsync(CancellationToken cancellationToken = default);
    /// <summary>Gets the per-AOI replay bounds to avoid rebuilding unrelated packages from old edits.</summary>
    Task<IReadOnlyDictionary<string, DateTime>> GetReplayBoundsAsync(CancellationToken cancellationToken = default);
    /// <summary>Retains source edits while a manual hold or unrelated candidate blocks package creation.</summary>
    Task MarkReplayAsync(string sourceDatasetName, DateTime scanFromUtc, CancellationToken cancellationToken = default);
    /// <summary>Creates a package and clears its replay cursor atomically; returns false if one already exists.</summary>
    Task<bool> TryCreateAsync(EncPackage package, CancellationToken cancellationToken = default);
    /// <summary>Records a package failure without losing its source YAML or rollback boundary.</summary>
    Task SetErrorAsync(Guid packageId, string message, CancellationToken cancellationToken = default);
    /// <summary>Marks a candidate discarded and restores the scan bound when both are discarded.</summary>
    Task DiscardAsync(string datasetName, ProductSpecification specification, CancellationToken cancellationToken = default);
    /// <summary>Releases packages whose non-discarded tracks have all reached an accepted terminal state.</summary>
    Task ReleaseAcceptedAsync(CancellationToken cancellationToken = default);
}
