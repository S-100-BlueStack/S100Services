using Hangfire;
using ProductCatalogueAPI.Services.ValidationEmail;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Worker Hangfire entry point. Failed polls retry on the next tick using the same durable cursor.</summary>
public sealed class ProcessValidationMailboxJob(ValidationEmailService service)
{
    /// <summary>Polls once; the service's shared distributed lock also excludes API review operations.</summary>
    [AutomaticRetry(Attempts = 0)]
    [DisableConcurrentExecution(5)]
    public Task RunAsync(CancellationToken cancellationToken) => service.PollAsync(cancellationToken);
}
