using Hangfire;
using ProductCatalogueAPI.BackgroundProcessing;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.BathymetricSurfaces;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Coordinates a bounded bathymetric source scan and saves the last successfully processed UTC boundary.</summary>
/// <param name="repository">Stores scan checkpoints in the ProductCatalogue SQL database.</param>
/// <param name="detector">Processes changes from the bathymetric surface source.</param>
/// <param name="clock">Provides the UTC upper bound captured before reading source changes.</param>
/// <param name="logger">Reports the scan bounds without exposing source connection details.</param>
public sealed class DetectBathymetricSurfaceChangesJob(IProductRepository repository, IBathymetricSurfaceChangeDetector detector, TimeProvider clock, ILogger<DetectBathymetricSurfaceChangesJob> logger) : IBackgroundJob
{
    /// <summary>The persisted key must stay stable across job type renames.</summary>
    private const string JobRunStateKey = "DetectBathymetricSurfaceChangesJob";

    /// <summary>Resumes from the bathymetric surface checkpoint and advances it only after the detector completes successfully.</summary>
    /// <param name="cancellationToken">Cancels the scan and is checked before starting the checkpoint write.</param>
    /// <returns>A task that completes when progress is saved or the UTC clock has yet to move past the checkpoint.</returns>
    /// <exception cref="OperationCanceledException">Cancellation was requested before the checkpoint write.</exception>
    /// <exception cref="NotImplementedException">The registered detector is still the scaffold.</exception>
    [AutomaticRetry(Attempts = 0, OnAttemptsExceeded = AttemptsExceededAction.Fail)]
    [DisableConcurrentExecution(5)]
    public async Task RunAsync(CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();

        var stored = await repository.GetLastSuccessfulRunUtcAsync(JobRunStateKey);
        // SQL datetime2 does not preserve DateTimeKind. The persisted value is already UTC.
        var lastSuccessfulRunUtc = stored is DateTime value ? DateTime.SpecifyKind(value, DateTimeKind.Utc) : (DateTime?)null;
        var scanThroughUtc = clock.GetUtcNow().UtcDateTime;

        cancellationToken.ThrowIfCancellationRequested();
        if (lastSuccessfulRunUtc is DateTime previousUtc && scanThroughUtc <= previousUtc) {
            logger.LogWarning("Bathymetric surface scan deferred because its upper bound has not advanced. LastSuccessfulRunUtc: {LastSuccessfulRunUtc:O}. ScanThroughUtc: {ScanThroughUtc:O}.", previousUtc, scanThroughUtc);
            return;
        }

        logger.LogInformation("Bathymetric surface scan starting. LastSuccessfulRunUtc: {LastSuccessfulRunUtc:O}. ScanThroughUtc: {ScanThroughUtc:O}.", lastSuccessfulRunUtc, scanThroughUtc);
        await detector.DetectAsync(lastSuccessfulRunUtc, scanThroughUtc, cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();

        await repository.SetSuccessfulRunUtcAsync(JobRunStateKey, scanThroughUtc);
        logger.LogInformation("Bathymetric surface scan checkpoint saved. ScanThroughUtc: {ScanThroughUtc:O}.", scanThroughUtc);
    }
}
