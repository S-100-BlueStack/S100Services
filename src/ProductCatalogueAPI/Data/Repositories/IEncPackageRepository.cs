using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Data.Repositories;

/// <summary>Persists one active package per S-101 AOI and any source scan that must be replayed.</summary>
public interface IEncPackageRepository
{
    /// <summary>Gets one exact current snapshot without loading its YAML.</summary>
    Task<EncPackage?> GetByIdAsync(Guid packageId, CancellationToken cancellationToken = default);
    /// <summary>Atomically discards both unsent member candidates for the exact snapshot.</summary>
    Task<EncPackageDiscardResult> TryDiscardPackageAsync(Guid expectedPackageId, string actor, DateTime nowUtc, CancellationToken cancellationToken = default);
    /// <summary>Atomically discards both eligible members and retains the cumulative source baseline for automatic replacement.</summary>
    /// <param name="expectedPackageId">The exact snapshot whose members must both remain eligible.</param>
    /// <param name="nowUtc">The UTC instant recorded in immutable discard history.</param>
    /// <param name="cancellationToken">Cancels before the SQL transaction commits.</param>
    /// <returns>The committed discard and output identities, or a conflict without changing either member.</returns>
    Task<EncPackageDiscardResult> TryDiscardForRefreshAsync(Guid expectedPackageId, DateTime nowUtc, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException("This repository cannot atomically replace an ENC package.");
    /// <summary>Checks the same paired state and exact-delivery guards before replay can be consumed, including empty replay.</summary>
    /// <param name="expectedPackageId">The active snapshot inspected while the caller holds both Product locks.</param>
    /// <param name="cancellationToken">Cancels the eligibility read.</param>
    /// <returns>Whether both members can be refreshed; a missing snapshot is ineligible.</returns>
    Task<bool> CanRefreshAsync(Guid expectedPackageId, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException("This repository cannot verify ENC refresh eligibility.");
    /// <summary>Gets active packages for a set of S-101 AOIs in one SQL read.</summary>
    Task<IReadOnlyDictionary<string, EncPackage>> GetActiveAsync(IEnumerable<string> sourceDatasetNames, CancellationToken cancellationToken = default, bool includeSourceYaml = true);
    /// <summary>Gets the oldest pending scan bound for edits observed while a package was locked or after acceptance.</summary>
    Task<DateTime?> GetReplayFromUtcAsync(CancellationToken cancellationToken = default);
    /// <summary>Gets the per-AOI replay bounds to avoid rebuilding unrelated packages from old edits.</summary>
    Task<IReadOnlyDictionary<string, DateTime>> GetReplayBoundsAsync(CancellationToken cancellationToken = default);
    /// <summary>Retains source edits while a manual hold or unrelated candidate blocks package creation.</summary>
    Task MarkReplayAsync(string sourceDatasetName, DateTime scanFromUtc, CancellationToken cancellationToken = default);
    /// <summary>Clears a replay bound after all edits in its window have no net product change.</summary>
    Task ClearReplayAsync(string sourceDatasetName, CancellationToken cancellationToken = default);
    /// <summary>Retires only the inspected replay cursor; a concurrently queued older cursor remains durable.</summary>
    /// <param name="sourceDatasetName">The S-101 source inspected successfully.</param>
    /// <param name="expectedScanFromUtc">The exact inspected cursor, or the baseline retained by a committed replacement.</param>
    /// <param name="cancellationToken">Cancels cleanup without consuming pending replay.</param>
    Task RetireReplayAsync(string sourceDatasetName, DateTime expectedScanFromUtc, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException("This repository cannot safely retire an inspected ENC replay cursor.");
    /// <summary>Creates a package and clears its replay cursor atomically; returns false if one already exists.</summary>
    Task<bool> TryCreateAsync(EncPackage package, CancellationToken cancellationToken = default);
    /// <summary>Records a package failure without losing its source YAML or rollback boundary.</summary>
    Task SetErrorAsync(Guid packageId, string message, CancellationToken cancellationToken = default);
    /// <summary>Marks a candidate discarded; only an automatic package refresh replays its scan bound.</summary>
    Task DiscardAsync(string datasetName, ProductSpecification specification, CancellationToken cancellationToken = default, bool preserveScanBound = false);
}
