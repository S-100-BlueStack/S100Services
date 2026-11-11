using Hangfire;
using Hangfire.Server;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Services.ValidationEmail;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Sends ready members independently so a failure in one never skips the other.</summary>
public sealed class SendEncPackageJob(IEncPackageRepository packages, IValidationEmailSimulatedSend simulation, TimeProvider clock, ILogger<SendEncPackageJob> logger)
{
    /// <summary>Rechecks package identity at execution; each reservation repeats Pause and current-version guards in SQL.</summary>
    /// <param name="sourceName">S-101 package source.</param>
    /// <param name="packageId">Expected immutable shared package snapshot.</param>
    /// <param name="members">Immutable candidate versions selected when the package was queued.</param>
    /// <param name="cancellationToken">Cooperative worker cancellation.</param>
    /// <param name="context">Hangfire identity used to deduplicate each member's simulated send.</param>
    [AutomaticRetry(Attempts = 0)]
    public async Task RunAsync(string sourceName, Guid packageId, EncPackageSendMember[] members, CancellationToken cancellationToken, PerformContext? context = null) {
        if (!simulation.Enabled) throw new InvalidOperationException("Both delivery and email modes must be Simulation.");
        var package = (await packages.GetActiveAsync([sourceName], cancellationToken, includeSourceYaml: false)).GetValueOrDefault(sourceName);
        if (package is null || package.Id != packageId || package.S57Discarded || package.S101Discarded)
            throw new InvalidOperationException("The package changed before its send job started.");
        var failures = 0;
        foreach (var member in members) {
            try {
                if (member.DatasetName != (member.Specification == ProductSpecification.S101 ? package.SourceDatasetName : package.S57DatasetName))
                    throw new InvalidOperationException("The queued member does not belong to the current package.");
                var id = (context?.BackgroundJob.Id ?? throw new InvalidOperationException("A durable send job is required.")) + ":" + member.Specification;
                var request = new SendToIcEncJobRequest(member.DatasetName, SendToIcEncMode.Simulation, member.Edition, member.Update, id, clock.GetUtcNow(), ProductSpecification: member.Specification.ToString()) { PackageId = packageId, ExpectedRevisionId = member.RevisionId };
                await simulation.SendAsync(request, id, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
            catch (Exception exception) {
                failures++;
                logger.LogError(exception, "Simulated package member send failed. PackageId: {PackageId}. DatasetName: {DatasetName}. Specification: {Specification}", packageId, member.DatasetName, member.Specification);
            }
        }
        if (failures > 0) throw new InvalidOperationException("One or more simulated sends failed. Inspect the package and Worker logs before retrying.");
    }
}

/// <summary>Immutable candidate identity captured before enqueueing a package send.</summary>
/// <param name="DatasetName">Canonical member dataset.</param>
/// <param name="Specification">Member's S-57 or S-101 format.</param>
/// <param name="Edition">Expected candidate edition.</param>
/// <param name="Update">Expected candidate update.</param>
/// <param name="RevisionId">Exact immutable revision; repeated edition/update values are insufficient.</param>
public sealed record EncPackageSendMember(string DatasetName, ProductSpecification Specification, int Edition, int Update, Guid RevisionId);
