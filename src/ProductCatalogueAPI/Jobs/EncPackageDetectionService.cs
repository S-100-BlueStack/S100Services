using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.Locking;
using ProductCatalogueAPI.Services.Operations;
using S100FC.ProductCatalogue;
using S100FC.YAML;
using System.Diagnostics;

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
            ?? EncChangeSummary.GetCopenhagenDayStartUtc(scanStartedUtc);
        logger.LogInformation("ENC archive scan started. SinceUtc: {SinceUtc}. StartedUtc: {StartedUtc}.", sinceUtc, scanStartedUtc);

        var archiveScanTime = Stopwatch.StartNew();
        var pending = await _products.GetPendingEditsAsync(sinceUtc);
        logger.LogInformation("ENC archive scan finished. DurationMs: {DurationMs}. ChangedAoiCount: {ChangedAoiCount}. UniqueChangedFeatureCount: {UniqueChangedFeatureCount}.",
            archiveScanTime.ElapsedMilliseconds, pending.Count, pending.Values.SelectMany(changes => changes.Keys).Distinct(StringComparer.OrdinalIgnoreCase).Count());
        var replay = await packages.GetReplayBoundsAsync(cancellationToken);
        if (replay.Count > 0) {
            var activeReplay = await packages.GetActiveAsync(replay.Keys, cancellationToken);
            var mappedS57 = replay.Keys.ToDictionary(name => name,
                name => _products.GetMappedElectronicProducts(name, ProductSpecification.S57.ToString())
                    .Select(product => product.datasetName).OfType<string>().ToArray(), StringComparer.OrdinalIgnoreCase);
            var mappedNames = replay.Keys.Concat(mappedS57.Values.SelectMany(names => names)).ToArray();
            var replayTracks = await workflowRepository.GetTracksByNamesAsync(mappedNames, cancellationToken);
            var eligibleReplay = replay.Where(entry =>
                !replayTracks.Any(track => (string.Equals(track.DatasetName, entry.Key, StringComparison.OrdinalIgnoreCase) ||
                    mappedS57[entry.Key].Contains(track.DatasetName, StringComparer.OrdinalIgnoreCase)) &&
                    (IsRefreshBlocked(track) || !activeReplay.ContainsKey(entry.Key) &&
                        (track.State is ProductState.ReadyForDistribution or ProductState.Error or ProductState.Rejected))))
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

        if (pending.Count == 0)
            logger.LogInformation("ENC scan found no changed features.");
        else {
            logger.LogInformation("ENC scan found changes. UniqueChangedFeatureCount: {UniqueChangedFeatureCount}. AffectedAoiCount: {AffectedAoiCount}.",
                pending.Values.SelectMany(changes => changes.Keys).Distinct(StringComparer.OrdinalIgnoreCase).Count(), pending.Count);
            foreach (var (sourceName, changes) in pending)
                logger.LogInformation("ENC changes for {SourceDatasetName}: {ChangedFeatureCount} feature(s).", sourceName, changes.Count);
        }

        var active = await packages.GetActiveAsync(pending.Keys, cancellationToken);
        var completeScans = new Dictionary<DateTime, Dictionary<string, Dictionary<string, ArchiveRow>>>();
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
            EncPackage? previous = null;
            if (active.TryGetValue(sourceName, out var existing)) {
                if (!HasNewEdits(changes, existing.DetectedAtUtc, sinceUtc)) {
                    // A replayed archive row from the existing snapshot is not a reason to retry a failed export.
                    if (await CanRefreshAsync(existing, cancellationToken))
                        await RecoverIncompletePackageAsync(existing, cancellationToken);
                    continue;
                }
                if (!await CanRefreshAsync(existing, cancellationToken)) {
                    await packages.MarkReplayAsync(sourceName, packageScanFromUtc, cancellationToken);
                    logger.LogInformation("ENC package refresh deferred while a product is held, building, or awaiting approval. SourceDatasetName: {SourceDatasetName}.", sourceName);
                    continue;
                }

                if (!completeScans.TryGetValue(existing.ScanFromUtc, out var completeChanges)) {
                    completeChanges = await _products.GetPendingEditsAsync(existing.ScanFromUtc);
                    completeScans.Add(existing.ScanFromUtc, completeChanges);
                }
                if (!completeChanges.TryGetValue(sourceName, out packageChanges) || packageChanges.Count == 0)
                    continue;
                packageScanFromUtc = existing.ScanFromUtc;
                previous = existing;
            }

            var s101Version = await _products.ReadElectronicProductVersionAsync(sourceName, ProductSpecification.S101.ToString(), cancellationToken)
                ?? throw new InvalidOperationException($"S-101 product '{sourceName}' could not be read from S-128.");
            var s57Version = await _products.ReadElectronicProductVersionAsync(s57Name, ProductSpecification.S57.ToString(), cancellationToken)
                ?? throw new InvalidOperationException($"S-57 product '{s57Name}' could not be read from S-128.");

            var s101 = await workflowRepository.GetOrCreateTrackAsync(sourceName, ProductSpecification.S101, ExportEngineKind.IsoIec8211, s101Version.Edition ?? 0, s101Version.Update ?? 0, cancellationToken);
            var s57 = await workflowRepository.GetOrCreateTrackAsync(s57Name, ProductSpecification.S57, ExportEngineKind.IsoIec8211, s57Version.Edition ?? 0, s57Version.Update ?? 0, cancellationToken);
            if (IsRefreshBlocked(s101) || IsRefreshBlocked(s57) || previous is null &&
                (s101.State is ProductState.ReadyForDistribution or ProductState.Error or ProductState.Rejected ||
                 s57.State is ProductState.ReadyForDistribution or ProductState.Error or ProductState.Rejected)) {
                await packages.MarkReplayAsync(sourceName, replay.GetValueOrDefault(sourceName, sinceUtc), cancellationToken);
                continue;
            }

            var summaryChanges = packageChanges.SelectMany(pair => EncChangeSummary.GetObservedAttributePaths(pair.Value)
                .Select(path => new ProductChange(pair.Key, pair.Value.Code ?? string.Empty, path, pair.Value.EditDate ?? scanStartedUtc, pair.Value.Deleted)));
            var summary = EncChangeSummary.Serialize(sourceName, ProductSpecification.S101, EncChangeSummary.GetCopenhagenDate(scanStartedUtc), packageScanFromUtc, scanStartedUtc, summaryChanges);
            var edition = checked(s101.PublishedEdition + 1);
            var dataset = await _products.CreateExportSnapshotAsync(sourceName, ExportTypes.NewEdition, edition, 0, cancellationToken);
            var yaml = dataset.Serialize();
            if (string.IsNullOrWhiteSpace(yaml))
                throw new InvalidOperationException($"ENC source snapshot for '{sourceName}' was empty.");

            if (previous is not null) {
                logger.LogInformation("Refreshing ENC package after new edits. SourceDatasetName: {SourceDatasetName}. PreviousDetectedAtUtc: {PreviousDetectedAtUtc}.", sourceName, previous.DetectedAtUtc);
                try {
                    await DiscardForRefreshAsync(previous, s57, ProductSpecification.S57, cancellationToken);
                    await DiscardForRefreshAsync(previous, s101, ProductSpecification.S101, cancellationToken);
                }
                catch {
                    await packages.SetErrorAsync(previous.Id, "The package could not be refreshed. Review and discard its remaining candidate.", CancellationToken.None);
                    throw;
                }
            }

            var package = new EncPackage { Id = Guid.NewGuid(), SourceDatasetName = sourceName, S57DatasetName = s57Name, ScanFromUtc = packageScanFromUtc, DetectedAtUtc = scanStartedUtc, DatasetYaml = yaml, SummaryYaml = summary };
            if (!await packages.TryCreateAsync(package, cancellationToken))
                continue;

            // A failed candidate remains in the package for explicit operator acknowledgement.
            // Both encoders receive the exact same persisted YAML string.
            foreach (var (name, specification) in new[] { (sourceName, ProductSpecification.S101), (s57Name, ProductSpecification.S57) }) {
                try {
                    await exports.ExecutePackageExportAsync(name, ExportRevisionType.NewEdition, yaml, summary, cancellationToken);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
                    throw;
                }
                catch (Exception exception) {
                    await RecordCandidateFailureAsync(package, name, specification, exception);
                }
            }
        }

        await productRepository.SetSuccessfulRunUtcAsync(nameof(DetectProductChangesJob), scanStartedUtc);
        logger.LogInformation("ENC change scan completed. ChangedAoiCount: {ChangedAoiCount}. WatermarkUtc: {WatermarkUtc}.", pending.Count, scanStartedUtc);
    }

    private async Task<bool> CanRefreshAsync(EncPackage package, CancellationToken cancellationToken) {
        var s57 = await workflowRepository.GetTrackAsync(package.S57DatasetName, ProductSpecification.S57, cancellationToken);
        var s101 = await workflowRepository.GetTrackAsync(package.SourceDatasetName, ProductSpecification.S101, cancellationToken);
        return !IsRefreshBlocked(s57) && !IsRefreshBlocked(s101);
    }

    /// <summary>Uses archive change times so replaying an old scan never rebuilds identical failed candidates.</summary>
    internal static bool HasNewEdits(IReadOnlyDictionary<string, ArchiveRow> changes, DateTime detectedAtUtc, DateTime sinceUtc) =>
        changes.Values.Any(change => change.EditDate > detectedAtUtc || change.EditDate is null && sinceUtc >= detectedAtUtc);

    /// <summary>Protects an operator hold, a build in progress, or a candidate submitted for approval.</summary>
    internal static bool IsRefreshBlocked(ProductExportTrackRecord? track) => track?.IsManuallyFrozen == true ||
        track?.State is ProductState.Frozen or ProductState.InTransit or ProductState.AcceptedForDistribution or ProductState.Published or ProductState.Exporting or ProductState.Validating;

    private async Task DiscardForRefreshAsync(EncPackage package, ProductExportTrackRecord track, ProductSpecification specification, CancellationToken cancellationToken) {
        if (specification == ProductSpecification.S57 ? package.S57Discarded : package.S101Discarded)
            return;

        if (track.CandidateEdition.HasValue || track.State is ProductState.Error or ProductState.Rejected)
            await exports.ExecuteDiscardAsync(track.DatasetName, "system", cancellationToken, preservePackageScanBound: true);
        else
            // An encoder can fail before it records a candidate; the package still owns that side.
            await packages.DiscardAsync(track.DatasetName, specification, cancellationToken, preserveScanBound: true);
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
                await RecordCandidateFailureAsync(package, name, specification, exception);
            }
        }
    }

    private async Task RecordCandidateFailureAsync(EncPackage package, string datasetName, ProductSpecification specification, Exception exception) {
        logger.LogError(exception, "ENC candidate failed. PackageId: {PackageId}. ExportDatasetName: {ExportDatasetName}.", package.Id, datasetName);
        var message = exception is ExportValidationException validation
            ? validation.PublicMessage
            : $"The {specification} candidate '{datasetName}' failed. Review its diagnostics and discard the failed candidate.";
        var errorCode = exception is ExportValidationException failure ? failure.Code : "ENC_CANDIDATE_FAILED";
        try {
            // A failure before BeginExportAsync still needs a failed track for the operator to acknowledge.
            var track = await workflowRepository.GetTrackAsync(datasetName, specification, CancellationToken.None);
            if (track is not null && track.State is not (ProductState.Error or ProductState.Rejected))
                await workflowRepository.SetStateAsync(track.Id, ProductState.Error, "system", clock.GetUtcNow().UtcDateTime, errorCode, message, CancellationToken.None);
        }
        catch (Exception persistenceException) {
            logger.LogError(persistenceException, "Could not record the failed ENC export track. PackageId: {PackageId}. ExportDatasetName: {ExportDatasetName}.", package.Id, datasetName);
        }

        // Keep package failure durable even if a cancellation arrives after the encoder fails.
        await packages.SetErrorAsync(package.Id, message, CancellationToken.None);
    }
}
