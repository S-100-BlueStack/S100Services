using Hangfire;
using System.Diagnostics;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Runs the scheduled ENC package scan on the Hangfire worker.</summary>
/// <param name="detectionState">Prevents persisted jobs from running after detection is disabled.</param>
/// <param name="encPackages">Creates or refreshes packages and their paired export candidates.</param>
/// <param name="logger">Reports job execution independently of the archive scan details.</param>
public sealed class DetectProductChangesJob(DetectProductChangesState detectionState, IEncPackageDetectionService encPackages, ILogger<DetectProductChangesJob> logger) : IBackgroundJob
{
    /// <inheritdoc/>
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
