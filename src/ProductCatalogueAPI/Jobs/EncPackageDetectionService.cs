using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.Locking;
using ProductCatalogueAPI.Services.Operations;
using S100FC.ProductCatalogue;
using S100FC.YAML;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Scans S-101 source edits and builds both ENC candidates from one persisted YAML snapshot.</summary>
public interface IEncPackageDetectionService
{
    /// <summary>Runs one coalesced scan; an overlapping invocation returns without advancing the watermark.</summary>
    Task RunAsync(CancellationToken cancellationToken);
}

/// <summary>Coordinates a package scan across the system database, S-128 catalogue, and export engines.</summary>
public sealed class EncPackageDetectionService(IProductRepository productRepository, IProductWorkflowRepository workflowRepository, IEncPackageRepository packages, IProductManager productManager, IExportOperationService exports, IDatasetLockService locks, TimeProvider clock, ILogger<EncPackageDetectionService> logger) : IEncPackageDetectionService
{
    private readonly IElectronicProductManager _products = productManager.ElectronicProductManager;

    /// <inheritdoc/>
    public async Task RunAsync(CancellationToken cancellationToken) {
        await using var scanLock = await locks.TryAcquireAsync("ENC-DPC-GLOBAL", cancellationToken);
        if (scanLock is null) {
            logger.LogInformation("ENC change scan skipped because another scan is running.");
            return;
        }

        await packages.ReleaseAcceptedAsync(cancellationToken);
        var scanStartedUtc = clock.GetUtcNow().UtcDateTime;
        var sinceUtc = await productRepository.GetLastSuccessfulRunUtcAsync(nameof(DetectProductChangesJob))
            ?? DetectProductChangesJob.GetCopenhagenDayStartUtc(scanStartedUtc);
        var pending = await _products.GetPendingEditsAsync(sinceUtc);
        var replay = await packages.GetReplayBoundsAsync(cancellationToken);
        if (replay.Count > 0) {
            var activeReplay = await packages.GetActiveAsync(replay.Keys, cancellationToken);
            var mappedS57 = replay.Keys.ToDictionary(name => name,
                name => _products.GetMappedElectronicProducts(name, ProductSpecification.S57.ToString())
                    .Select(product => product.datasetName).OfType<string>().ToArray(), StringComparer.OrdinalIgnoreCase);
            var mappedNames = replay.Keys.Concat(mappedS57.Values.SelectMany(names => names)).ToArray();
            var replayTracks = await workflowRepository.GetTracksByNamesAsync(mappedNames, cancellationToken);
            var eligibleReplay = replay.Where(entry => !activeReplay.ContainsKey(entry.Key) &&
                !replayTracks.Any(track => (string.Equals(track.DatasetName, entry.Key, StringComparison.OrdinalIgnoreCase) ||
                    mappedS57[entry.Key].Contains(track.DatasetName, StringComparer.OrdinalIgnoreCase)) &&
                    (track.IsManuallyFrozen || track.State is ProductState.InTransit or ProductState.Exporting or ProductState.Validating or ProductState.ReadyForDistribution or ProductState.Error)))
                .ToDictionary(entry => entry.Key, entry => entry.Value, StringComparer.OrdinalIgnoreCase);
            if (eligibleReplay.Count > 0) {
                // A blocked AOI retains its cursor without repeatedly forcing a historic archive scan.
                var replayed = await _products.GetPendingEditsAsync(eligibleReplay.Values.Min());
                foreach (var (sourceName, changes) in replayed) {
                    if (eligibleReplay.TryGetValue(sourceName, out var lowerBound) && lowerBound <= sinceUtc && changes.Count > 0)
                        pending[sourceName] = changes;
                }
            }
        }

        var active = await packages.GetActiveAsync(pending.Keys, cancellationToken);
        foreach (var (sourceName, changes) in pending) {
            cancellationToken.ThrowIfCancellationRequested();
            if (changes.Count == 0)
                continue;
            await using var packageLock = await locks.TryAcquireAsync(ProductTrackLockKey.For(sourceName, ProductSpecification.S101), cancellationToken);
            if (packageLock is null)
                throw new InvalidOperationException($"ENC package lock for '{sourceName}' is busy. The scan watermark was preserved.");

            var mapped = _products.GetMappedElectronicProducts(sourceName, ProductSpecification.S57.ToString());
            if (mapped.Count != 1 || string.IsNullOrWhiteSpace(mapped[0].datasetName))
                throw new InvalidOperationException($"S-101 AOI '{sourceName}' must map to exactly one S-57 product before a package can be created.");
            var s57Name = mapped[0].datasetName!.Trim();
            await using var s57Lock = await locks.TryAcquireAsync(ProductTrackLockKey.For(s57Name, ProductSpecification.S57), cancellationToken);
            if (s57Lock is null)
                throw new InvalidOperationException($"Mapped S-57 export lock for '{s57Name}' is busy. The scan watermark was preserved.");

            var packageChanges = changes;
            var packageScanFromUtc = replay.GetValueOrDefault(sourceName, sinceUtc);
            if (active.TryGetValue(sourceName, out var existing)) {
                if (sinceUtc < existing.DetectedAtUtc || !await CanRefreshAsync(existing, cancellationToken)) {
                    await RecoverIncompletePackageAsync(existing, cancellationToken);
                    continue;
                }

                var completeChanges = await _products.GetPendingEditsAsync(existing.ScanFromUtc);
                if (!completeChanges.TryGetValue(sourceName, out packageChanges) || packageChanges.Count == 0)
                    continue;
                try {
                    await exports.ExecuteCancelExportAsync(existing.S57DatasetName, "system", cancellationToken);
                    await exports.ExecuteCancelExportAsync(existing.SourceDatasetName, "system", cancellationToken);
                }
                catch {
                    await packages.SetErrorAsync(existing.Id, "The package could not be refreshed. Review and discard its remaining candidate.", CancellationToken.None);
                    throw;
                }
                packageScanFromUtc = existing.ScanFromUtc;
            }

            var s101Version = await _products.ReadElectronicProductVersionAsync(sourceName, ProductSpecification.S101.ToString(), cancellationToken)
                ?? throw new InvalidOperationException($"S-101 product '{sourceName}' could not be read from S-128.");
            var s57Version = await _products.ReadElectronicProductVersionAsync(s57Name, ProductSpecification.S57.ToString(), cancellationToken)
                ?? throw new InvalidOperationException($"S-57 product '{s57Name}' could not be read from S-128.");

            var s101 = await workflowRepository.GetOrCreateTrackAsync(sourceName, ProductSpecification.S101, ExportEngineKind.IsoIec8211, s101Version.Edition ?? 0, s101Version.Update ?? 0, cancellationToken);
            var s57 = await workflowRepository.GetOrCreateTrackAsync(s57Name, ProductSpecification.S57, ExportEngineKind.IsoIec8211, s57Version.Edition ?? 0, s57Version.Update ?? 0, cancellationToken);
            if (s101.IsManuallyFrozen || s57.IsManuallyFrozen ||
                s101.State is ProductState.InTransit or ProductState.Exporting or ProductState.Validating or ProductState.ReadyForDistribution or ProductState.Error ||
                s57.State is ProductState.InTransit or ProductState.Exporting or ProductState.Validating or ProductState.ReadyForDistribution or ProductState.Error) {
                await packages.MarkReplayAsync(sourceName, replay.GetValueOrDefault(sourceName, sinceUtc), cancellationToken);
                continue;
            }

            var summaryChanges = packageChanges.SelectMany(pair => DetectProductChangesJob.GetObservedAttributePaths(pair.Value)
                .Select(path => new ProductChange(pair.Key, pair.Value.Code ?? string.Empty, path, pair.Value.EditDate ?? scanStartedUtc, pair.Value.Deleted)));
            var summary = ChangeSummaryYamlSerializer.Serialize(sourceName, ProductSpecification.S101, DateOnly.FromDateTime(scanStartedUtc), packageScanFromUtc, scanStartedUtc, summaryChanges);
            var edition = checked(s101.PublishedEdition + 1);
            var dataset = await _products.CreateExportSnapshotAsync(sourceName, ExportTypes.NewEdition, edition, 0, cancellationToken);
            var yaml = dataset.Serialize();
            if (string.IsNullOrWhiteSpace(yaml))
                throw new InvalidOperationException($"ENC source snapshot for '{sourceName}' was empty.");

            var package = new EncPackage { Id = Guid.NewGuid(), SourceDatasetName = sourceName, S57DatasetName = s57Name, ScanFromUtc = packageScanFromUtc, DetectedAtUtc = scanStartedUtc, DatasetYaml = yaml, SummaryYaml = summary };
            if (!await packages.TryCreateAsync(package, cancellationToken))
                continue;

            // A failed candidate remains in the package for explicit operator acknowledgement.
            // Both encoders receive the exact same persisted YAML string.
            foreach (var name in new[] { sourceName, s57Name }) {
                try {
                    await exports.ExecutePackageExportAsync(name, ExportRevisionType.NewEdition, yaml, summary, cancellationToken);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
                    throw;
                }
                catch (Exception exception) {
                    logger.LogError(exception, "ENC candidate failed. SourceDatasetName: {SourceDatasetName}. ExportDatasetName: {ExportDatasetName}. PackageId: {PackageId}.", sourceName, name, package.Id);
                    await packages.SetErrorAsync(package.Id, $"The {name} candidate failed. Review its export status and diagnostics, then discard the failed candidate.", cancellationToken);
                }
            }
        }

        await productRepository.SetSuccessfulRunUtcAsync(nameof(DetectProductChangesJob), scanStartedUtc);
        logger.LogInformation("ENC change scan completed. ChangedAoiCount: {ChangedAoiCount}. WatermarkUtc: {WatermarkUtc}.", pending.Count, scanStartedUtc);
    }

    private async Task<bool> CanRefreshAsync(EncPackage package, CancellationToken cancellationToken) {
        if (package.ErrorMessage is not null || package.S57Discarded || package.S101Discarded)
            return false;
        var s57 = await workflowRepository.GetTrackAsync(package.S57DatasetName, ProductSpecification.S57, cancellationToken);
        var s101 = await workflowRepository.GetTrackAsync(package.SourceDatasetName, ProductSpecification.S101, cancellationToken);
        return s57 is { State: ProductState.ReadyForDistribution, IsManuallyFrozen: false } &&
               s101 is { State: ProductState.ReadyForDistribution, IsManuallyFrozen: false };
    }

    private async Task RecoverIncompletePackageAsync(EncPackage package, CancellationToken cancellationToken) {
        if (package.ErrorMessage is not null)
            return;
        foreach (var (name, specification) in new[] { (package.SourceDatasetName, ProductSpecification.S101), (package.S57DatasetName, ProductSpecification.S57) }) {
            if (specification == ProductSpecification.S101 && package.S101Discarded || specification == ProductSpecification.S57 && package.S57Discarded)
                continue;
            var track = await workflowRepository.GetTrackAsync(name, specification, cancellationToken);
            if (track?.State is ProductState.Exporting or ProductState.Validating) {
                await workflowRepository.SetStateAsync(track.Id, ProductState.Error, "system", clock.GetUtcNow().UtcDateTime, "ENC_EXPORT_INTERRUPTED", "The candidate build was interrupted. Discard it before another package is created.", cancellationToken);
                await packages.SetErrorAsync(package.Id, "A candidate build was interrupted. Discard the affected candidate.", cancellationToken);
                return;
            }
            if (track is null || track.CandidateEdition.HasValue || track.State is ProductState.Error or ProductState.Rejected)
                continue;
            try {
                await exports.ExecutePackageExportAsync(name, ExportRevisionType.NewEdition, package.DatasetYaml, package.SummaryYaml, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
                throw;
            }
            catch (Exception exception) {
                logger.LogError(exception, "ENC candidate recovery failed. PackageId: {PackageId}. ExportDatasetName: {ExportDatasetName}.", package.Id, name);
                await packages.SetErrorAsync(package.Id, "A candidate build failed during recovery. Discard the affected candidate.", cancellationToken);
            }
        }
    }
}
