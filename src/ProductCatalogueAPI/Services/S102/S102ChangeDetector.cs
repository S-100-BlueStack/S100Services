namespace ProductCatalogueAPI.Services.BathymetricSurfaces;

/// <summary>Processes changes from the configured bathymetric surface source for one bounded scan.</summary>
public interface IBathymetricSurfaceChangeDetector
{
    /// <summary>Completes only after the scan and any required processing through its upper bound are durable.</summary>
    /// <param name="lastSuccessfulRunUtc">The previous UTC checkpoint, or null when the source's first-run policy applies.</param>
    /// <param name="scanThroughUtc">The UTC upper bound to process and subsequently checkpoint.</param>
    /// <param name="cancellationToken">Cancels source reads and processing where supported.</param>
    /// <returns>A task representing the complete scan, including when the interval contains no changes.</returns>
    Task DetectAsync(DateTime? lastSuccessfulRunUtc, DateTime scanThroughUtc, CancellationToken cancellationToken);
}

/// <summary>Marks the implementation point for bathymetric surface source access and change detection.</summary>
internal sealed class BathymetricSurfaceChangeDetector : IBathymetricSurfaceChangeDetector
{
    /// <inheritdoc/>
    /// <exception cref="NotImplementedException">The source and its change tracking mechanism have yet to be integrated.</exception>
    public Task DetectAsync(DateTime? lastSuccessfulRunUtc, DateTime scanThroughUtc, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        // Successful completion commits the upper bound, so the scaffold must fail until it can process that bound.
        throw new NotImplementedException("Bathymetric surface source change detection is not implemented.");
    }
}
