using Hangfire;
using ProductCatalogueAPI.Services.Distribution;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Worker-only Hangfire entry point for the acceptance-triggered finalization.</summary>
public sealed class FinalizeEncPackageJob(IEncPackageFinalizationService service)
{
    [AutomaticRetry(Attempts = 0)]
    public Task RunAsync(Guid packageId, CancellationToken cancellationToken) => service.FinalizeAsync(packageId, cancellationToken);
}
