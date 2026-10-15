using Hangfire;
using ProductCatalogueAPI.Services.History;

namespace ProductCatalogueAPI.Jobs;

public sealed class ProductHistoryReconciliationJob(ProductHistoryReconciliation reconciliation)
{
    [Queue("default")]
    [AutomaticRetry(Attempts = 0)]
    public Task RunAsync(CancellationToken cancellationToken) => reconciliation.RunAsync(cancellationToken);
}

/// <summary>The existing Worker owns registration and execution; the API never starts a maintenance server.</summary>
public sealed class ProductHistoryReconciliationRegistration(IRecurringJobManager jobs) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken) {
        // The existing single Worker consumes the default queue. A separate maintenance
        // queue would have no consumer and an extra server would change process isolation.
        jobs.AddOrUpdate<ProductHistoryReconciliationJob>(
            "product-history-reconciliation", "default",
            job => job.RunAsync(CancellationToken.None),
            "*/15 * * * *",
            new RecurringJobOptions { TimeZone = TimeZoneInfo.Utc });
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
