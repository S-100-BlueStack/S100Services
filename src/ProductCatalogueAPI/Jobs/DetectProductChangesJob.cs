using Hangfire;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Runs the scheduled ENC package scan on the Hangfire worker.</summary>
/// <param name="detectionState">Prevents persisted jobs from running after detection is disabled.</param>
/// <param name="encPackages">Creates or refreshes packages and their paired export candidates.</param>
public sealed class DetectProductChangesJob(DetectProductChangesState detectionState, IEncPackageDetectionService encPackages) : IBackgroundJob
{
    /// <inheritdoc/>
    [AutomaticRetry(Attempts = 0, OnAttemptsExceeded = AttemptsExceededAction.Fail)]
    public async Task RunAsync(CancellationToken cancellationToken) {
        detectionState.EnsureEnabled();
        cancellationToken.ThrowIfCancellationRequested();
        await encPackages.RunAsync(cancellationToken);
    }
}
