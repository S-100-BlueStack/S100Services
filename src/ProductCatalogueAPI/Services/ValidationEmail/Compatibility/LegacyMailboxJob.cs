using Hangfire;
using ProductCatalogueAPI.Services.ValidationEmail;

namespace ProductCatalogueAPI.Services.IcEncEmail;

/// <summary>Deserializes previously queued Hangfire invocations and forwards them to the neutral workflow.</summary>
public sealed class ProcessIcEncMailboxJob(ValidationEmailService service)
{
    /// <summary>Runs the same mode guards and distributed lock as newly queued validation jobs.</summary>
    [AutomaticRetry(Attempts = 0)]
    public Task RunAsync(CancellationToken cancellationToken) => service.PollAsync(cancellationToken);
}
