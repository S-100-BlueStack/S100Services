using Hangfire;
using ProductCatalogueAPI.Services.History;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Runs one recovery pass for incomplete product history events on the Worker.</summary>
/// <param name="reconciliation">Reconciles durable export receipts against their history records.</param>
public sealed class ProductHistoryReconciliationJob(ProductHistoryReconciliation reconciliation)
{
    /// <summary>Runs the pass on the existing default queue. The next recurring tick handles remaining events.</summary>
    /// <param name="cancellationToken">Stops the pass during Worker shutdown.</param>
    /// <returns>A task that completes when this pass is finished.</returns>
    [Queue("default")]
    [AutomaticRetry(Attempts = 0)]
    public Task RunAsync(CancellationToken cancellationToken) => reconciliation.RunAsync(cancellationToken);
}
