namespace S100FC.ProductCatalogue;

/// <summary>Optionally supplies invocation-scoped archive history without changing existing product-manager contracts.</summary>
public interface IArchiveScanSource
{
    /// <summary>Creates a lazy, read-only history reader for exact comparisons inside one fixed UTC window.</summary>
    /// <param name="sinceUtc">The oldest required exclusive archive boundary, already constrained by the import baseline.</param>
    /// <param name="throughUtc">The invocation's inclusive cutoff; concurrent later edits belong to the next invocation.</param>
    /// <param name="comparisonBoundsUtc">All exact lower boundaries that this invocation may request.</param>
    /// <returns>A reader owned and disposed by the caller; no persistent cursor is advanced.</returns>
    IArchiveChangeScan OpenArchiveScan(DateTime sinceUtc, DateTime throughUtc, IReadOnlyCollection<DateTime> comparisonBoundsUtc);

    /// <summary>Runs the initial bounded scan with cancellation between native archive rows.</summary>
    /// <param name="sinceUtc">The exclusive UTC cursor constrained by the import baseline.</param>
    /// <param name="throughUtc">The invocation's inclusive cutoff.</param>
    /// <param name="cancellationToken">Cancels archive inspection without advancing persisted progress.</param>
    /// <returns>The same all-product differences as the existing bounded product-manager operation.</returns>
    Task<Dictionary<string, Dictionary<string, ArchiveRow>>> ReadPendingEditsAsync(DateTime sinceUtc, DateTime throughUtc, CancellationToken cancellationToken);
}

/// <summary>Reuses raw archive versions while recomposing net differences for each source's exact lower bound.</summary>
public interface IArchiveChangeScan : IAsyncDisposable
{
    /// <summary>Returns one product's comparison without scanning other products again.</summary>
    /// <param name="sinceUtc">An exclusive UTC boundary included in the reader's declared comparison boundaries.</param>
    /// <param name="sourceName">The S-101 source dataset whose membership must be evaluated.</param>
    /// <param name="cancellationToken">Cancels loading and composition without consuming scan progress.</param>
    /// <returns>Freshly composed rows; modifying them cannot alter retained archive versions.</returns>
    Task<Dictionary<string, ArchiveRow>> ReadAsync(DateTime sinceUtc, string sourceName, CancellationToken cancellationToken);
}
