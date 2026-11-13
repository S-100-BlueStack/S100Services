using Hangfire;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.Jobs;
using Hangfire.Server;
using ProductCatalogueAPI.Services.ValidationEmail;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Commits the complete simulated package before making generated replies available for processing.</summary>
public sealed class SendEncPackageJob(IValidationEmailSimulatedSend simulation, ILogger<SendEncPackageJob> logger, IEncPackageRepository? packages = null)
{
    /// <summary>SQL rechecks both exact candidates and atomically reserves the pair; a local failure leaves both unsent.</summary>
    /// <param name="sourceName">S-101 package source.</param>
    /// <param name="packageId">Expected shared snapshot.</param>
    /// <param name="members">Both immutable revisions selected at enqueue time.</param>
    /// <param name="cancellationToken">Worker cancellation.</param>
    /// <param name="context">Stable Hangfire identity used for retry recovery, never a new send attempt.</param>
    /// <returns>Completion after the paired send and its immediate inbox-processing attempt.</returns>
    [AutomaticRetry(Attempts = 0)]
    public async Task RunAsync(string sourceName, Guid packageId, EncPackageSendMember[] members, CancellationToken cancellationToken, PerformContext? context = null) {
        if (!simulation.Enabled) throw new InvalidOperationException("Both delivery and email modes must be Simulation.");
        var jobId = context?.BackgroundJob.Id ?? throw new InvalidOperationException("A durable package send job is required.");
        logger.LogInformation("Simulated ENC package send starting. JobId: {JobId}. PackageId: {PackageId}. DatasetName: {DatasetName}", jobId, packageId, sourceName);
        try {
            await simulation.SendPackageAsync(sourceName, packageId, members, jobId, cancellationToken);
            logger.LogInformation("Simulated ENC package pair committed and responses captured. JobId: {JobId}. PackageId: {PackageId}. DatasetName: {DatasetName}", jobId, packageId, sourceName);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (EncPackageSendUnavailableException) { throw; } // An obsolete/duplicate queued request is not a new send failure.
        catch (Exception exception) {
            logger.LogError(exception, "Simulated ENC package send failed. JobId: {JobId}. PackageId: {PackageId}. DatasetName: {DatasetName}", jobId, packageId, sourceName);
            if (packages is not null) {
                try { await packages.RecordSendFailureAsync(sourceName, packageId, members, jobId, CancellationToken.None); }
                catch (Exception persistenceException) {
                    logger.LogError(persistenceException, "ENC send failure could not be recorded. PackageId: {PackageId}. JobId: {JobId}", packageId, jobId);
                }
            }
            throw;
        }
    }
}
