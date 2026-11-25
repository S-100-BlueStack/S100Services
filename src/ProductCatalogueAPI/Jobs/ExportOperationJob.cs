using Hangfire.Server;
using Hangfire;
using ProductCatalogueAPI.BackgroundProcessing.Execution;
using ProductCatalogueAPI.Services.Operations;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Dispatches an export or manual ENC build from the worker using the job's durable metadata.</summary>
/// <param name="executor">Performs locking, history tracking and the requested product operation.</param>
public sealed class ExportOperationJob(ExportJobExecutor executor)
{
    /// <summary>Executes the queued operation and lets the workflow report classified failures.</summary>
    /// <param name="request">Product identity, expected version and requested operation.</param>
    /// <param name="performContext">Hangfire job identity and status metadata.</param>
    /// <param name="cancellationToken">Worker shutdown or job cancellation.</param>
    /// <returns>A task that completes when the guarded workflow finishes.</returns>
    [AutomaticRetry(Attempts = 0, LogEvents = false)]
    public Task RunAsync(ExportOperationJobRequest request, PerformContext performContext, CancellationToken cancellationToken) {
        ArgumentNullException.ThrowIfNull(performContext);
        return executor.ExecuteAsync(request, new HangfireExportJobExecutionContext(performContext), cancellationToken);
    }
}
