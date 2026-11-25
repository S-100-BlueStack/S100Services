using Hangfire;
using Microsoft.Extensions.Options;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.ValidationEmail;

namespace ProductCatalogueAPI.BackgroundProcessing.Scheduling;

/// <summary>Registers the mailbox schedule only in the Worker process, independently of DPC enablement.</summary>
public sealed class ValidationEmailSchedule(IRecurringJobManager jobs, IOptions<ValidationEmailOptions> options) : IHostedService
{
    /// <summary>Reconciles enabled/disabled state when the Worker starts.</summary>
    public Task StartAsync(CancellationToken cancellationToken) {
        if (options.Value.Mode != ValidationEmailMode.Disabled) jobs.AddOrUpdate<ProcessValidationMailboxJob>("process-icenc-mailbox", job => job.RunAsync(CancellationToken.None), Cron.Minutely());
        else jobs.RemoveIfExists("process-icenc-mailbox");
        return Task.CompletedTask;
    }
    /// <summary>The schedule remains durable; the next Worker start reconciles it.</summary>
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
