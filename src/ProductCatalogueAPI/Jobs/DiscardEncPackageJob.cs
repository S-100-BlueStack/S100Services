using Hangfire;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.Locking;
using S100FC.ProductCatalogue;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Executes one real package Discard on the Worker, never in the HTTP process.</summary>
public sealed class DiscardEncPackageJob(
    IEncPackageRepository packages,
    IExportEngineRegistry engines,
    IProductManager productManager,
    IDatasetLockService locks,
    TimeProvider clock,
    IConfiguration configuration,
    IHostEnvironment environment,
    ILogger<DiscardEncPackageJob> logger)
{
    [AutomaticRetry(Attempts = 0)]
    public async Task RunAsync(Guid expectedPackageId, CancellationToken cancellationToken) {
        if (!EncPackageActionsEnabled(configuration, environment))
            throw new InvalidOperationException("ENC package actions are disabled in this Worker.");
        var snapshot = await packages.GetByIdAsync(expectedPackageId, cancellationToken)
            ?? throw new InvalidOperationException("The ENC package was replaced before Discard began.");

        // Same ordering as DPC. No compiler, refresh or per-Product send may run in this Worker
        // while the two exact candidate tracks are being discarded.
        await using var s101Lock = await locks.TryAcquireAsync(
            ProductTrackLockKey.For(snapshot.SourceDatasetName, ProductSpecification.S101), cancellationToken);
        if (s101Lock is null) throw new InvalidOperationException("The S-101 candidate is busy; retry Discard after processing finishes.");
        await using var s57Lock = await locks.TryAcquireAsync(
            ProductTrackLockKey.For(snapshot.S57DatasetName, ProductSpecification.S57), cancellationToken);
        if (s57Lock is null) throw new InvalidOperationException("The S-57 candidate is busy; retry Discard after processing finishes.");

        var result = await packages.TryDiscardPackageAsync(expectedPackageId, "package operator", clock.GetUtcNow().UtcDateTime, cancellationToken);
        if (result.Status != EncPackageDiscardStatus.Discarded)
            throw new InvalidOperationException("The ENC package changed or is not eligible for Discard.");

        // SQL is the authority for discard; cleanup is replaceable output only. A cleanup
        // failure is logged for operators, never reported as a rolled-back SQL transaction.
        foreach (var output in result.Outputs) {
            try {
                await engines.GetRequiredEngine(output.Specification).DeleteOutputAsync(
                    new ExportOutputIdentity(output.DatasetName, output.Specification, output.Edition,
                        output.Update, productManager.ElectronicProductManager.OutputFolder), cancellationToken);
            }
            catch (Exception exception) {
                logger.LogWarning(exception,
                    "ENC candidate was discarded in SQL but output cleanup requires review. DatasetName: {DatasetName}. Specification: {Specification}.",
                    output.DatasetName, output.Specification);
            }
        }
        logger.LogInformation("ENC package {PackageId} discarded. CandidateCount: {CandidateCount}.", expectedPackageId, result.Outputs.Count);
    }

    public static bool EncPackageActionsEnabled(IConfiguration config, IHostEnvironment environment) =>
        environment.IsDevelopment() && config.GetValue<bool>("EncPackageActions:Enabled");
}
