using System.Diagnostics;
using Hangfire;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Services.Detection;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Runs the scheduled ENC package scan on the Hangfire worker.</summary>
/// <param name="detectionState">Startup decision that governs recurring and manually triggered scans.</param>
/// <param name="encPackages">Scans the source archive and builds or recovers package candidates.</param>
/// <param name="logger">Records skip decisions and scan outcomes.</param>
public sealed class DetectProductChangesJob(DetectProductChangesState detectionState, IEncPackageDetectionService encPackages, ILogger<DetectProductChangesJob> logger)
{
    /// <summary>Runs one scan when detection is enabled and propagates failures to Hangfire.</summary>
    /// <param name="cancellationToken">Worker shutdown or job cancellation.</param>
    /// <returns>A task that completes when the scan finishes.</returns>
    /// <exception cref="DetectProductChangesDisabledException">The startup configuration disables detection.</exception>
    [AutomaticRetry(Attempts = 0, OnAttemptsExceeded = AttemptsExceededAction.Fail)]
    public async Task RunAsync(CancellationToken cancellationToken) {
        detectionState.EnsureEnabled();
        cancellationToken.ThrowIfCancellationRequested();

        var elapsed = Stopwatch.StartNew();
        logger.LogInformation("DPC job started.");
        try {
            await encPackages.RunAsync(cancellationToken);
            logger.LogInformation("DPC job finished. DurationMs: {DurationMs}.", elapsed.ElapsedMilliseconds);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
            logger.LogWarning("DPC job cancelled. DurationMs: {DurationMs}.", elapsed.ElapsedMilliseconds);
            throw;
        }
        catch (Exception exception) {
            logger.LogError(exception, "DPC job failed. DurationMs: {DurationMs}.", elapsed.ElapsedMilliseconds);
            throw;
        }
    }
}
