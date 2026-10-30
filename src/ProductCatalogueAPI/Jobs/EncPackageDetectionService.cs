using Microsoft.Extensions.Configuration;
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
public sealed class EncPackageDetectionService(IProductRepository productRepository, IProductWorkflowRepository workflowRepository, IEncPackageRepository packages, IProductManager productManager, IExportOperationService exports, IDatasetLockService locks, TimeProvider clock, ILogger<EncPackageDetectionService> logger, IConfiguration configuration, IEncPackageFinalizationService? finalization = null) : IEncPackageDetectionService
{
    private readonly IElectronicProductManager _products = productManager.ElectronicProductManager;

    /// <inheritdoc/>
    public async Task RunAsync(CancellationToken cancellationToken) {
        await using var scanLock = await locks.TryAcquireAsync("ENC-DPC-GLOBAL", cancellationToken);
        if (scanLock is null) {
            logger.LogInformation("ENC change scan skipped because another scan is running.");
            return;
        }

        // Load the diagnostic flag from the Worker's normal appsettings configuration.
        EncDetectionPerformance.Configure(configuration[EncDetectionPerformance.ConfigurationKey]);

        if (finalization is not null)
            await finalization.FinalizePendingAsync(cancellationToken);
        var scanStartedUtc = clock.GetUtcNow().UtcDateTime;
        var storedWatermark = await productRepository.GetLastSuccessfulRunUtcAsync(nameof(DetectProductChangesJob));
        // SQL datetime2 has no Kind; JobRunState persists UTC instants, not ArcGIS wall time.
        var sinceUtc = storedWatermark.HasValue ? DateTime.SpecifyKind(storedWatermark.Value, DateTimeKind.Utc)
            : EncChangeSummary.GetCopenhagenDayStartUtc(scanStartedUtc);
        logger.LogInformation("ENC archive scan started. SinceUtc: {SinceUtc:O}. StartedUtc: {StartedUtc:O}.", sinceUtc, scanStartedUtc);

        var completeScans = new Dictionary<DateTime, Dictionary<string, Dictionary<string, ArchiveRow>>>();
        async Task<Dictionary<string, Dictionary<string, ArchiveRow>>> ScanAsync(DateTime lowerBound) {
            if (!completeScans.TryGetValue(lowerBound, out var result)) {
                result = await _products.GetPendingEditsAsync(lowerBound, scanStartedUtc);
                cancellationToken.ThrowIfCancellationRequested();
                foreach (var (source, rows) in result) {
                    foreach (var (featureId, row) in rows) {
                        if (row.EditDate is null || row.EditDate.Value.Kind != DateTimeKind.Utc || row.EditDate > clock.GetUtcNow().UtcDateTime.AddMinutes(5))
                            throw new InvalidOperationException($"Invalid ENC archive timestamp for '{source}', feature '{featureId}'. The watermark and candidates were preserved.");
                    }
                }
                completeScans.Add(lowerBound, result);
            }
            return result;
        }

        var archiveScanTime = Stopwatch.StartNew();
        var pending = new Dictionary<string, Dictionary<string, ArchiveRow>>(await ScanAsync(sinceUtc), StringComparer.OrdinalIgnoreCase);
        logger.LogInformation("ENC archive scan finished. DurationMs: {DurationMs}. ChangedAoiCount: {ChangedAoiCount}. UniqueChangedFeatureCount: {UniqueChangedFeatureCount}.",
            archiveScanTime.ElapsedMilliseconds, pending.Count, pending.Values.SelectMany(changes => changes.Keys).Distinct(StringComparer.OrdinalIgnoreCase).Count());
        // An older package may have no replay marker and no new source edits. Its persisted
        // snapshot still owns the unfinished member; discover it independently of the archive.
        var incompleteNames = await packages.GetIncompleteSourceNamesAsync(cancellationToken);
        foreach (var incomplete in (await packages.GetActiveAsync(incompleteNames, cancellationToken, includeSourceYaml: false)).Values)
            await packages.MarkReplayAsync(incomplete.SourceDatasetName, incomplete.ScanFromUtc, cancellationToken);
        var replay = await packages.GetReplayBoundsAsync(cancellationToken);
        var snapshotAttempts = await packages.GetSnapshotAttemptBoundsAsync(cancellationToken);
        if (replay.Count > 0) {
            var activeReplay = await packages.GetActiveAsync(replay.Keys, cancellationToken);
            var mappedS57 = replay.Keys.ToDictionary(name => name,
                name => _products.GetMappedElectronicProducts(name, ProductSpecification.S57.ToString())
                    .Select(product => product.datasetName).OfType<string>().ToArray(), StringComparer.OrdinalIgnoreCase);
            var mappedNames = replay.Keys.Concat(mappedS57.Values.SelectMany(names => names)).ToArray();
            // Recover only after acquiring the same locks as a live package
            // export. Replay must be checked before its blocked-state filter,
            // otherwise a stranded Validating member can never be reconsidered.
            foreach (var candidate in activeReplay.Values) {
                cancellationToken.ThrowIfCancellationRequested();
                await using var s101Lock = await locks.TryAcquireAsync(
                    ProductTrackLockKey.For(candidate.SourceDatasetName, ProductSpecification.S101), cancellationToken);
                if (s101Lock is null) {
                    logger.LogInformation("Interrupted ENC recovery deferred while the S-101 Product lock is busy. SourceDatasetName: {SourceDatasetName}.", candidate.SourceDatasetName);
                    continue;
                }
                await using var s57Lock = await locks.TryAcquireAsync(
                    ProductTrackLockKey.For(candidate.S57DatasetName, ProductSpecification.S57), cancellationToken);
                if (s57Lock is null) {
                    logger.LogInformation("Interrupted ENC recovery deferred while the S-57 Product lock is busy. SourceDatasetName: {SourceDatasetName}.", candidate.SourceDatasetName);
                    continue;
                }
                await EncPackageInterruptedExportRecovery.TryRecoverAsync(candidate,
                    workflowRepository, packages, clock, logger, cancellationToken);
            }
            var replayTracks = await workflowRepository.GetTracksByNamesAsync(mappedNames, cancellationToken);
            var eligibleReplay = replay.Where(entry =>
                !replayTracks.Any(track => (string.Equals(track.DatasetName, entry.Key, StringComparison.OrdinalIgnoreCase) ||
                    mappedS57[entry.Key].Contains(track.DatasetName, StringComparer.OrdinalIgnoreCase)) &&
                    (IsRefreshBlocked(track) || !activeReplay.ContainsKey(entry.Key) &&
                        IsUnownedFinalTrack(track))))
                .ToDictionary(entry => entry.Key, entry => entry.Value, StringComparer.OrdinalIgnoreCase);
            foreach (var group in eligibleReplay.GroupBy(entry => entry.Value)) {
                // Composition is relative to an endpoint state, not just a timestamp filter.
                // A source at 10:00 cannot reuse an 08:00 comparison, even if the net result is empty.
                logger.LogInformation("ENC replay archive scan started. SinceUtc: {SinceUtc:O}. EligibleAoiCount: {EligibleAoiCount}.", group.Key, group.Count());
                foreach (var entry in group) {
                    // A dormant failed source needs only its post-attempt delta. Keep the
                    // older cumulative baseline durable without composing it every minute.
                    if (snapshotAttempts.TryGetValue(entry.Key, out var attemptedThroughUtc) &&
                        (!activeReplay.TryGetValue(entry.Key, out var attemptedPackage) || attemptedPackage.DetectedAtUtc <= attemptedThroughUtc)) {
                        var newerChanges = (await ScanAsync(attemptedThroughUtc)).GetValueOrDefault(entry.Key);
                        if (newerChanges is null || !newerChanges.Values.Any(change => EncChangeSummary.GetObservedAttributePaths(change).Count > 0)) {
                            pending.Remove(entry.Key);
                            logger.LogInformation("ENC failed snapshot is awaiting a new matching archive change. SourceDatasetName: {SourceDatasetName}. AttemptedThroughUtc: {AttemptedThroughUtc:O}.", entry.Key, attemptedThroughUtc);
                            continue;
                        }
                    }
                    var replayed = await ScanAsync(group.Key);
                    pending[entry.Key] = replayed.GetValueOrDefault(entry.Key) ?? new(StringComparer.OrdinalIgnoreCase);
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

        var workerUtc = clock.GetUtcNow().UtcDateTime;
        DateTime? latestArchiveEditUtc = null;
        foreach (var (sourceName, changes) in pending) {
            foreach (var (featureId, change) in changes) {
                if (change.EditDate is null)
                    throw new InvalidOperationException($"ENC archive change for '{sourceName}', feature '{featureId}', has no readable archive timestamp. DPC preserved the watermark and existing candidates.");
                if (!latestArchiveEditUtc.HasValue || change.EditDate > latestArchiveEditUtc)
                    latestArchiveEditUtc = change.EditDate;
            }
        }
        if (latestArchiveEditUtc > workerUtc.AddMinutes(5))
            throw new InvalidOperationException($"S-101 archive edit at {latestArchiveEditUtc:O} is more than five minutes ahead of the worker clock at {workerUtc:O}. Check the archive timestamp zone and clock synchronization; DPC preserved its watermark and candidates.");

        var active = await packages.GetActiveAsync(pending.Keys, cancellationToken);
        // Finish every required archive inspection before destructive candidate work. A later
        // replay/history scan failure must not leave earlier sources partly replaced.
        foreach (var existing in active.Values) {
            await ScanAsync(existing.ScanFromUtc);
            await ScanAsync(existing.DetectedAtUtc);
        }
        foreach (var sourceName in pending.Keys) {
            if (snapshotAttempts.TryGetValue(sourceName, out var attemptedThroughUtc))
                await ScanAsync(attemptedThroughUtc);
        }
        var retiredReplay = new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
        var failedSourceCount = 0;
        foreach (var (sourceName, changes) in pending) {
            cancellationToken.ThrowIfCancellationRequested();
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

            if (snapshotAttempts.TryGetValue(sourceName, out var attemptedThroughUtc) &&
                (!active.TryGetValue(sourceName, out var attemptedPackage) || attemptedPackage.DetectedAtUtc <= attemptedThroughUtc)) {
                var newerChanges = (await ScanAsync(attemptedThroughUtc)).GetValueOrDefault(sourceName);
                if (newerChanges is null || !newerChanges.Values.Any(change => EncChangeSummary.GetObservedAttributePaths(change).Count > 0)) {
                    logger.LogInformation("ENC failed snapshot is awaiting a new matching archive change. SourceDatasetName: {SourceDatasetName}. AttemptedThroughUtc: {AttemptedThroughUtc:O}.", sourceName, attemptedThroughUtc);
                    continue;
                }
            }

            var packageChanges = changes;
            var snapshotChanges = changes;
            var packageScanFromUtc = replay.GetValueOrDefault(sourceName, sinceUtc);
            EncPackage? previous = null;
            if (active.TryGetValue(sourceName, out var existing)) {
                if (!string.Equals(existing.S57DatasetName, s57Name, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException($"The mapped S-57 member of ENC package '{existing.Id}' changed. The watermark and candidates were preserved.");
                await EncPackageInterruptedExportRecovery.TryRecoverAsync(existing,
                    workflowRepository, packages, clock, logger, cancellationToken);
                await EnsureMissingTracksAsync(existing, cancellationToken);
                if (!await CanRefreshAsync(existing, cancellationToken) ||
                    !await packages.TryQueueMissingMembersAsync(existing.Id, clock.GetUtcNow().UtcDateTime, cancellationToken)) {
                    await packages.MarkReplayAsync(sourceName, packageScanFromUtc, cancellationToken);
                    logger.LogInformation("ENC package refresh deferred while a product is held, building, or awaiting approval. SourceDatasetName: {SourceDatasetName}.", sourceName);
                    continue;
                }
                // The snapshot timestamp identifies the source state already encoded. The
                // surviving cumulative summary can have older timestamps after a partial revert.
                snapshotChanges = (await ScanAsync(existing.DetectedAtUtc)).GetValueOrDefault(sourceName) ?? new(StringComparer.OrdinalIgnoreCase);
                if (!snapshotChanges.Values.Any(change => EncChangeSummary.GetObservedAttributePaths(change).Count > 0)) {
                    await RecoverIncompletePackageAsync(existing, cancellationToken);
                    retiredReplay[sourceName] = packageScanFromUtc;
                    continue;
                }
                packageChanges = (await ScanAsync(existing.ScanFromUtc)).GetValueOrDefault(sourceName) ?? new(StringComparer.OrdinalIgnoreCase);
                packageScanFromUtc = existing.ScanFromUtc;
                previous = existing;
            }

            var s101Version = await _products.ReadElectronicProductVersionAsync(sourceName, ProductSpecification.S101.ToString(), cancellationToken)
                ?? throw new InvalidOperationException($"S-101 product '{sourceName}' could not be read from S-128.");
            var s57Version = await _products.ReadElectronicProductVersionAsync(s57Name, ProductSpecification.S57.ToString(), cancellationToken)
                ?? throw new InvalidOperationException($"S-57 product '{s57Name}' could not be read from S-128.");

            var s101 = await workflowRepository.GetOrCreateTrackAsync(sourceName, ProductSpecification.S101, ExportEngineKind.IsoIec8211, s101Version.Edition ?? 0, s101Version.Update ?? 0, cancellationToken);
            var s57 = await workflowRepository.GetOrCreateTrackAsync(s57Name, ProductSpecification.S57, ExportEngineKind.IsoIec8211, s57Version.Edition ?? 0, s57Version.Update ?? 0, cancellationToken);
            var hasUnownedCandidate = HasUnownedFinalCandidate(previous, s101, s57);
            if (IsRefreshBlocked(s101) || IsRefreshBlocked(s57) || hasUnownedCandidate) {
                // An unrelated manual Product export is not an ENC package. Never
                // adopt its candidate or invent an active package to expose actions.
                await packages.MarkReplayAsync(sourceName, replay.GetValueOrDefault(sourceName, sinceUtc), cancellationToken);
                if (hasUnownedCandidate)
                    logger.LogWarning("ENC package creation deferred because a Product candidate has no active package owner. SourceDatasetName: {SourceDatasetName}. S101State: {S101State}. S57State: {S57State}. Recover the standalone candidate before replay.",
                        sourceName, s101.State, s57.State);
                continue;
            }

            var summaryChanges = packageChanges.SelectMany(pair => EncChangeSummary.GetObservedAttributePaths(pair.Value)
                .Select(path => new ProductChange(pair.Key, pair.Value.Code, path, pair.Value.EditDate ?? scanStartedUtc, pair.Value.Deleted))).ToArray();
            if (summaryChanges.Length == 0 && previous is null) {
                await AcknowledgeSourceFailuresAsync(s101, s57, cancellationToken);
                retiredReplay[sourceName] = packageScanFromUtc;
                logger.LogInformation("ENC archive rows had no net feature difference. SourceDatasetName: {SourceDatasetName}.", sourceName);
                continue;
            }
            var edition = checked(s101.PublishedEdition + 1);
            var requiredFeatures = packageChanges.Concat(snapshotChanges)
                .Where(pair => pair.Value.CurrentInProduct && !pair.Value.Deleted)
                .Select(pair => pair.Key).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            logger.LogInformation("ENC source dataset creation started. SourceDatasetName: {SourceDatasetName}. ExportType: {ExportType}. Edition: {Edition}. Update: {Update}. RequiredChangedFeatureCount: {RequiredChangedFeatureCount}.",
                sourceName, ExportTypes.NewEdition, edition, 0, requiredFeatures.Length);
            var snapshotTimer = Stopwatch.StartNew();
            var snapshotSucceeded = false;
            VerifiedExportSnapshot snapshot;
            string yaml;
            try {
                snapshot = await _products.CreateVerifiedExportSnapshotAsync(sourceName, ExportTypes.NewEdition, edition, 0, requiredFeatures, cancellationToken);

                var serializationTimer = EncDetectionPerformance.IsEnabled ? Stopwatch.StartNew() : null;
                yaml = snapshot.Dataset.Serialize();
                if (snapshot.SuppressedMetadataSurfaces.Count > 0) {
                    yaml = EncMetadataSurfaceYamlCleanup.RemoveSuppressedSurfaces(yaml,
                        snapshot.SuppressedMetadataSurfaces);
                    logger.LogInformation("ENC suppressed metadata topology surfaces removed. SourceDatasetName: {SourceDatasetName}. SurfaceCount: {SurfaceCount}.",
                        sourceName, snapshot.SuppressedMetadataSurfaces.Distinct(StringComparer.Ordinal).Count());
                }
                if (serializationTimer is not null)
                    logger.LogInformation("ENC detection profile. SourceDatasetName: {SourceDatasetName}. Phase: SerializeYaml. DurationMs: {DurationMs}. YamlCharacterCount: {YamlCharacterCount}. IncludedChangedFeatureCount: {IncludedChangedFeatureCount}.",
                        sourceName, serializationTimer.Elapsed.TotalMilliseconds, yaml?.Length ?? 0, snapshot.IncludedChangedFeatureIds.Count);
                if (string.IsNullOrWhiteSpace(yaml))
                    throw new InvalidOperationException($"ENC source snapshot for '{sourceName}' was empty.");
                snapshotSucceeded = true;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
                throw;
            }
            catch (Exception exception) {
                // This failure belongs to one source, not to the complete archive inspection.
                // Persist replay before the global cursor advances, and never discard its old pair.
                await RecordSourceSnapshotFailureAsync(sourceName, previous, packageScanFromUtc, s101, s57, scanStartedUtc, exception, cancellationToken);
                failedSourceCount++;
                continue;
            }
            finally {
                logger.LogInformation("ENC source dataset creation finished. SourceDatasetName: {SourceDatasetName}. Success: {Success}. DurationMs: {DurationMs}.",
                    sourceName, snapshotSucceeded, snapshotTimer.ElapsedMilliseconds);
            }
            var included = snapshot.IncludedChangedFeatureIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
            var priorMembers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var possibleRemovals = packageChanges.Concat(snapshotChanges)
                .Where(pair => (!pair.Value.CurrentInProduct || pair.Value.Deleted || !included.Contains(pair.Key)) && EncChangeSummary.GetObservedAttributePaths(pair.Value).Count > 0)
                .Select(pair => pair.Key).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            if (possibleRemovals.Length > 0) {
                if (previous is not null) {
                    priorMembers.UnionWith(EncSnapshotMembership.FindSourceMembers(previous.DatasetYaml, possibleRemovals));
                    // Cumulative removals are already absent from the preceding candidate's YAML.
                    priorMembers.UnionWith(EncSnapshotMembership.ReadSummaryFeatureIds(previous.SummaryYaml));
                }
                else if (s101.PublishedEdition > 0) {
                    var published = await _products.GetLatestDatasetYAML(sourceName, s101.PublishedEdition);
                    priorMembers.UnionWith(EncSnapshotMembership.FindSourceMembers(published.yaml, possibleRemovals));
                }
            }
            bool IsRelevant(KeyValuePair<string, ArchiveRow> change) =>
                EncChangeSummary.GetObservedAttributePaths(change.Value).Count > 0 &&
                (change.Value.CurrentInProduct && !change.Value.Deleted && included.Contains(change.Key) || priorMembers.Contains(change.Key));

            if (previous is not null && !snapshotChanges.Any(IsRelevant)) {
                logger.LogInformation("ENC archive changes did not alter the verified export selection. SourceDatasetName: {SourceDatasetName}.", sourceName);
                await RecoverIncompletePackageAsync(previous, cancellationToken);
                retiredReplay[sourceName] = replay.GetValueOrDefault(sourceName, sinceUtc);
                continue;
            }
            var relevantIds = packageChanges.Where(IsRelevant).Select(pair => pair.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);
            summaryChanges = summaryChanges.Where(change => relevantIds.Contains(change.FeatureId)).ToArray();
            if (summaryChanges.Length == 0) {
                if (previous is null) await AcknowledgeSourceFailuresAsync(s101, s57, cancellationToken);
                if (previous is not null && !await DiscardForRefreshAsync(previous, cancellationToken))
                    continue;
                retiredReplay[sourceName] = packageScanFromUtc;
                logger.LogInformation("ENC source returned to its cumulative baseline. SourceDatasetName: {SourceDatasetName}.", sourceName);
                continue;
            }
            var summary = EncChangeSummary.Serialize(sourceName, ProductSpecification.S101, EncChangeSummary.GetCopenhagenDate(scanStartedUtc), packageScanFromUtc, scanStartedUtc, summaryChanges);

            if (previous is not null && !await DiscardForRefreshAsync(previous, cancellationToken))
                continue;

            if (previous is null) {
                // Only this owned, pre-candidate failure is safe to acknowledge automatically.
                // The immutable failure history remains; ordinary manual errors stay protected.
                await AcknowledgeSourceFailuresAsync(s101, s57, cancellationToken);
            }

            var package = new EncPackage { Id = Guid.NewGuid(), SourceDatasetName = sourceName, S57DatasetName = s57Name, ScanFromUtc = packageScanFromUtc, DetectedAtUtc = scanStartedUtc, DatasetYaml = yaml, SummaryYaml = summary };
            if (!await packages.TryCreatePendingAsync(package, cancellationToken)) {
                await packages.MarkReplayAsync(sourceName, packageScanFromUtc, cancellationToken);
                continue;
            }

            // Both members are already queued in the same SQL commit as this snapshot and replay.
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
            retiredReplay[sourceName] = packageScanFromUtc;
        }

        cancellationToken.ThrowIfCancellationRequested();
        await productRepository.SetSuccessfulRunUtcAsync(nameof(DetectProductChangesJob), scanStartedUtc);
        // A failed invocation must retain inspected empty cursors too. If cleanup fails after
        // the watermark commit, retained replay safely repeats the already-complete inspection.
        foreach (var (sourceName, inspectedFromUtc) in retiredReplay)
            await packages.RetireReplayAsync(sourceName, inspectedFromUtc, cancellationToken);
        logger.LogInformation("ENC change scan completed. ChangedAoiCount: {ChangedAoiCount}. WatermarkUtc: {WatermarkUtc:O}. FailedSourceCount: {FailedSourceCount}.", pending.Count, scanStartedUtc, failedSourceCount);
    }

    /// <summary>Retains source work durably while recording the failed shared build on both product histories.</summary>
    private async Task RecordSourceSnapshotFailureAsync(string sourceName, EncPackage? previous, DateTime scanFromUtc, ProductExportTrackRecord s101, ProductExportTrackRecord s57, DateTime attemptedThroughUtc, Exception exception, CancellationToken cancellationToken) {
        var replayFromUtc = previous?.ScanFromUtc ?? scanFromUtc;
        await packages.MarkReplayAsync(sourceName, replayFromUtc, cancellationToken);
        var message = PublicExportError.GenericMessage;
        if (previous is not null)
            await packages.SetErrorAsync(previous.Id, message, cancellationToken);
        foreach (var track in new[] { s101, s57 }) {
            // Existing candidate identities/artifacts remain valid evidence of the previous
            // snapshot. History records the replacement failure without relabelling that build.
            var state = previous is null ? ProductState.Error : track.State;
            await workflowRepository.SetStateAsync(track.Id, state, "system", clock.GetUtcNow().UtcDateTime, "ENC_SOURCE_SNAPSHOT_FAILED", message, cancellationToken);
        }
        // Commit the retry gate only after both durable error histories succeeded. A failure
        // while recording diagnostics must never suppress the unfinished attempt on restart.
        await packages.MarkSnapshotAttemptAsync(sourceName, replayFromUtc, attemptedThroughUtc, cancellationToken);
        logger.LogError(exception, "ENC source snapshot failed; replay retained and remaining products will continue. SourceDatasetName: {SourceDatasetName}. ExistingPackageId: {PackageId}. ReplayFromUtc: {ReplayFromUtc:O}.", sourceName, previous?.Id, replayFromUtc);
    }

    /// <summary>Recreates only absent legacy member tracks using each published catalogue version before queue recovery.</summary>
    private async Task EnsureMissingTracksAsync(EncPackage package, CancellationToken cancellationToken) {
        foreach (var (name, spec) in new[] { (package.SourceDatasetName, ProductSpecification.S101), (package.S57DatasetName, ProductSpecification.S57) }) {
            if (await workflowRepository.GetTrackAsync(name, spec, cancellationToken) is not null) continue;
            var version = await _products.ReadElectronicProductVersionAsync(name, spec.ToString(), cancellationToken)
                ?? throw new InvalidOperationException($"Missing ENC member '{name}' cannot be recovered because its S-128 product is absent.");
            await workflowRepository.GetOrCreateTrackAsync(name, spec, ExportEngineKind.IsoIec8211, version.Edition ?? 0, version.Update ?? 0, cancellationToken);
        }
    }

    private async Task<bool> CanRefreshAsync(EncPackage package, CancellationToken cancellationToken) {
        var s57 = await workflowRepository.GetTrackAsync(package.S57DatasetName, ProductSpecification.S57, cancellationToken);
        var s101 = await workflowRepository.GetTrackAsync(package.SourceDatasetName, ProductSpecification.S101, cancellationToken);
        return !IsRefreshBlocked(s57) && !IsRefreshBlocked(s101) && await packages.CanRefreshAsync(package.Id, cancellationToken);
    }

    /// <summary>Requires a later archive edit before replacing a package; the global scan cursor is not evidence of a new edit.</summary>
    internal static bool HasNewEdits(IReadOnlyDictionary<string, ArchiveRow> changes, DateTime lastArchivedEditUtc) {
        if (changes.Values.Any(change => change.EditDate is null))
            throw new InvalidOperationException("An ENC archive edit has no timestamp; the package cannot be refreshed safely.");
        return changes.Values.Any(change => change.EditDate > lastArchivedEditUtc);
    }

    /// <summary>Protects an operator hold, a build in progress, or a candidate submitted for approval.</summary>
    internal static bool IsRefreshBlocked(ProductExportTrackRecord? track) => track?.IsManuallyFrozen == true ||
        track?.State is ProductState.Frozen or ProductState.InTransit or ProductState.AcceptedForDistribution or ProductState.Published or ProductState.Exporting or ProductState.Validating;

    /// <summary>A standalone final Product candidate cannot be adopted by a newly detected package.</summary>
    internal static bool HasUnownedFinalCandidate(EncPackage? activePackage, ProductExportTrackRecord s101, ProductExportTrackRecord s57) =>
        activePackage is null &&
        (IsUnownedFinalTrack(s101) || IsUnownedFinalTrack(s57));

    private static bool IsUnownedFinalTrack(ProductExportTrackRecord track) =>
        (track.State is ProductState.ReadyForDistribution or ProductState.Error or ProductState.Rejected) && !IsSourceSnapshotFailure(track);

    private static bool IsSourceSnapshotFailure(ProductExportTrackRecord track) =>
        track.State == ProductState.Error && track.CandidateEdition is null && track.CandidateUpdate is null &&
        track.ErrorCode == "ENC_SOURCE_SNAPSHOT_FAILED";

    private async Task AcknowledgeSourceFailuresAsync(ProductExportTrackRecord s101, ProductExportTrackRecord s57, CancellationToken cancellationToken) {
        foreach (var track in new[] { s101, s57 }.Where(IsSourceSnapshotFailure))
            await workflowRepository.DiscardCandidateAsync(track.Id, "system", clock.GetUtcNow().UtcDateTime, cancellationToken);
    }

    /// <summary>Checks and discards both members in one SQL transaction, preserving replay if either member is protected.</summary>
    private async Task<bool> DiscardForRefreshAsync(EncPackage package, CancellationToken cancellationToken) {
        if (await exports.ExecutePackageRefreshDiscardAsync(package.Id, cancellationToken))
            return true;
        await packages.MarkReplayAsync(package.SourceDatasetName, package.ScanFromUtc, cancellationToken);
        logger.LogInformation("ENC replacement deferred because a member or its exact delivery is protected. PackageId: {PackageId}. SourceDatasetName: {SourceDatasetName}.", package.Id, package.SourceDatasetName);
        return false;
    }

    private async Task RecoverIncompletePackageAsync(EncPackage package, CancellationToken cancellationToken) {
        // An existing failure does not prevent the never-started counterpart from using the persisted snapshot.
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
            ? PublicExportError.Message(validation.Code, validation.PublicMessage)
            : PublicExportError.GenericMessage;
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
