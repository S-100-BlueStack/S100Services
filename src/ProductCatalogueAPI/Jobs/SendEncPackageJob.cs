using Hangfire;
using Hangfire.Server;
using ProductCatalogueAPI.Services.ValidationEmail;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Commits the complete simulated package before making generated replies available for processing.</summary>
public sealed class SendEncPackageJob(IValidationEmailSimulatedSend simulation, ILogger<SendEncPackageJob> logger)
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
        catch (Exception exception) {
            logger.LogError(exception, "Simulated ENC package send failed. JobId: {JobId}. PackageId: {PackageId}. DatasetName: {DatasetName}", jobId, packageId, sourceName);
            throw;
        }
    }
}
