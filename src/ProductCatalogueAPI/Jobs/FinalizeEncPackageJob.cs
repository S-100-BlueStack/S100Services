using Hangfire;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.Locking;
using S100FC.ProductCatalogue;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Publishes a package only after both exact IC-ENC deliveries have been accepted.</summary>
public interface IEncPackageFinalizationService
{
    /// <summary>Resumes packages left pending by process restarts or failed job enqueueing.</summary>
    Task FinalizePendingAsync(CancellationToken cancellationToken);
    /// <summary>Idempotently completes one accepted package across S-128 and the System database.</summary>
    Task FinalizeAsync(Guid packageId, CancellationToken cancellationToken);
}

/// <summary>Uses S-128's edit transaction first; SQL completion is retried until both stores agree.</summary>
public sealed class EncPackageFinalizationService(IEncPackageAcknowledgementRepository repository, IProductManager productManager, IDatasetLockService locks,
    TimeProvider clock, ILogger<EncPackageFinalizationService> logger) : IEncPackageFinalizationService
{
    public async Task FinalizePendingAsync(CancellationToken cancellationToken) {
        foreach (var packageId in await repository.GetPendingAsync(cancellationToken)) {
            cancellationToken.ThrowIfCancellationRequested();
            try { await FinalizeAsync(packageId, cancellationToken); }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
            catch (Exception ex) { logger.LogError(ex, "Accepted ENC package {PackageId} still requires finalization; the next DPC scan will retry.", packageId); }
        }
    }

    public async Task FinalizeAsync(Guid packageId, CancellationToken cancellationToken) {
        await using var packageLock = await locks.TryAcquireAsync($"ENC-FINALIZE-{packageId:N}", cancellationToken);
        if (packageLock is null) return;

        var publication = await repository.GetPublicationAsync(packageId, cancellationToken);
        if (publication is null) return;
        logger.LogInformation("Publishing accepted ENC package {PackageId} in S-128.", packageId);
        await productManager.ElectronicProductManager.PublishAcceptedEncPackageAsync(publication, cancellationToken);
        // If this SQL transaction fails, the package remains pending. The S-128 write detects its
        // package ID in the attachment table on retry and does not write duplicate attachments.
        await repository.CompleteAsync(publication, clock.GetUtcNow().UtcDateTime, CancellationToken.None);
        logger.LogInformation("Accepted ENC package {PackageId} is published and idle.", packageId);
    }
}

/// <summary>Worker-only Hangfire entry point for the acceptance-triggered finalization.</summary>
public sealed class FinalizeEncPackageJob(IEncPackageFinalizationService service)
{
    [AutomaticRetry(Attempts = 0)]
    public Task RunAsync(Guid packageId, CancellationToken cancellationToken) => service.FinalizeAsync(packageId, cancellationToken);
}
