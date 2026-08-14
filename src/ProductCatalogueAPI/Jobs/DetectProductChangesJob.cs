using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.Locking;
using S100FC.ProductCatalogue;
using System.Text.Json;

namespace ProductCatalogueAPI.Jobs;

/// <summary>
/// Accumulates detected source edits into daily YAML summaries. It never creates exports or changes S-128.
/// </summary>
public sealed class DetectProductChangesJob(IProductRepository productRepository, IProductWorkflowRepository workflowRepository, IProductManager productManager, IDatasetLockService datasetLockService, TimeProvider timeProvider, ILogger<DetectProductChangesJob> logger) : IBackgroundJob
{
    private static readonly ProductSpecification[] SummaryTracks = [ProductSpecification.S101, ProductSpecification.S57];
    private readonly IProductRepository _productRepository = productRepository;
    private readonly IProductWorkflowRepository _workflowRepository = workflowRepository;
    private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
    private readonly IDatasetLockService _datasetLockService = datasetLockService;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ILogger<DetectProductChangesJob> _logger = logger;

    /// <inheritdoc/>
    public async Task RunAsync(CancellationToken cancellationToken) {
        var jobName = nameof(DetectProductChangesJob);
        var scanStartedUtc = _timeProvider.GetUtcNow().UtcDateTime;
        var sinceUtc = await _productRepository.GetLastSuccessfulRunUtcAsync(jobName);
        if (!sinceUtc.HasValue) {
            sinceUtc = GetCopenhagenDayStartUtc(scanStartedUtc);
            _logger.LogInformation("Initialized {JobName} scan window at the start of the Copenhagen work day. SinceUtc: {SinceUtc}.", jobName, sinceUtc);
        }

        var pendingEdits = await _electronicProductManager.GetPendingEditsAsync(sinceUtc.Value);
        var scanCompleted = true;
        foreach (var (datasetName, dirtyFeatures) in pendingEdits) {
            cancellationToken.ThrowIfCancellationRequested();
            if (dirtyFeatures.Count == 0)
                continue;

            await using var datasetLock = await _datasetLockService.TryAcquireAsync($"{datasetName}-change-summary", cancellationToken);
            if (datasetLock is null) {
                _logger.LogWarning("Skipped change-summary update because the dataset lock is held. DatasetName: {DatasetName}.", datasetName);
                scanCompleted = false;
                continue;
            }

            var publicVersion = await _electronicProductManager.ReadElectronicProductVersionAsync(datasetName, cancellationToken);
            if (publicVersion is null) {
                _logger.LogError("Skipped change-summary update because the S-128 product was not found. DatasetName: {DatasetName}.", datasetName);
                scanCompleted = false;
                continue;
            }

            foreach (var productSpecification in SummaryTracks) {
                var initialEdition = productSpecification == ProductSpecification.S101 ? publicVersion.Edition ?? 0 : 0;
                var initialUpdate = productSpecification == ProductSpecification.S101 ? publicVersion.Update ?? 0 : 0;
                var track = await _workflowRepository.GetOrCreateTrackAsync(datasetName, productSpecification, ExportEngineKind.IsoIec8211, initialEdition, initialUpdate, cancellationToken);
                await MergeDailySummaryAsync(track, dirtyFeatures, scanStartedUtc, cancellationToken);
                if (track.State != ProductState.Frozen)
                    await _workflowRepository.SetStateAsync(track.Id, ProductState.ChangesDetected, "system", scanStartedUtc, cancellationToken: cancellationToken);
            }
        }

        if (!scanCompleted)
            throw new InvalidOperationException("Change detection was incomplete. The successful-run watermark was preserved so skipped edits can be retried.");

        await _productRepository.SetSuccessfulRunUtcAsync(jobName, scanStartedUtc);
        _logger.LogInformation("Change detection completed. ProductCount: {ProductCount}. WatermarkUtc: {WatermarkUtc}.", pendingEdits.Count, scanStartedUtc);
    }

    private async Task MergeDailySummaryAsync(ProductExportTrackRecord track, IReadOnlyDictionary<string, ArchiveRow> dirtyFeatures, DateTime detectedAtUtc, CancellationToken cancellationToken) {
        var workDate = GetCopenhagenDate(detectedAtUtc);
        var existing = await _workflowRepository.GetOpenChangeSummaryAsync(track.Id, workDate, cancellationToken);
        var merged = new Dictionary<string, ProductChange>(StringComparer.OrdinalIgnoreCase);
        if (existing is not null) {
            foreach (var change in existing.Changes)
                merged[GetChangeKey(change)] = change;
        }

        foreach (var (featureId, archiveRow) in dirtyFeatures) {
            var paths = GetObservedAttributePaths(archiveRow);
            foreach (var path in paths) {
                var change = new ProductChange(featureId, archiveRow.Code ?? string.Empty, path, archiveRow.EditDate ?? detectedAtUtc, archiveRow.Deleted);
                merged[GetChangeKey(change)] = change;
            }
        }

        var changes = merged.Values.OrderBy(change => change.FeatureId, StringComparer.OrdinalIgnoreCase).ThenBy(change => change.AttributePath, StringComparer.OrdinalIgnoreCase).ToArray();
        var summaryId = existing?.Id ?? Guid.NewGuid();
        var firstDetectedAtUtc = existing?.FirstDetectedAtUtc ?? detectedAtUtc;
        var yaml = ChangeSummaryYamlSerializer.Serialize(track.DatasetName, track.ProductSpecification, workDate, firstDetectedAtUtc, detectedAtUtc, changes);
        await _workflowRepository.SaveChangeSummaryAsync(new ProductChangeSummary(summaryId, track.Id, track.DatasetName, track.ProductSpecification, workDate, yaml, changes, firstDetectedAtUtc, detectedAtUtc), cancellationToken);
    }

    private static IReadOnlyCollection<string> GetObservedAttributePaths(ArchiveRow row) {
        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        AddJsonPaths(paths, "attributes", row.AttributeBindings);
        AddJsonPaths(paths, "featureBindings", row.FeatureBindings);
        AddJsonPaths(paths, "informationBindings", row.InformationBindings);
        if (row.Deleted)
            paths.Add("$deleted");
        if (paths.Count == 0)
            paths.Add("$feature");
        return paths;
    }

    private static void AddJsonPaths(ISet<string> paths, string prefix, string? json) {
        if (string.IsNullOrWhiteSpace(json))
            return;
        try {
            using var document = JsonDocument.Parse(json);
            Visit(document.RootElement, prefix);
        }
        catch (JsonException) {
            paths.Add(prefix);
        }

        void Visit(JsonElement element, string path) {
            switch (element.ValueKind) {
                case JsonValueKind.Object:
                    foreach (var property in element.EnumerateObject())
                        Visit(property.Value, $"{path}.{property.Name}");
                    break;
                case JsonValueKind.Array:
                    if (element.GetArrayLength() == 0)
                        paths.Add(path);
                    else
                        foreach (var item in element.EnumerateArray()) Visit(item, path);
                    break;
                default:
                    paths.Add(path);
                    break;
            }
        }
    }

    private static DateOnly GetCopenhagenDate(DateTime utc) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), GetCopenhagenTimeZone()));

    private static DateTime GetCopenhagenDayStartUtc(DateTime utc) {
        var timeZone = GetCopenhagenTimeZone();
        var localDate = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), timeZone));
        return TimeZoneInfo.ConvertTimeToUtc(localDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified), timeZone);
    }

    private static TimeZoneInfo GetCopenhagenTimeZone() {
        try {
            return TimeZoneInfo.FindSystemTimeZoneById("Europe/Copenhagen");
        }
        catch (TimeZoneNotFoundException) {
            return TimeZoneInfo.FindSystemTimeZoneById("Romance Standard Time");
        }
    }

    private static string GetChangeKey(ProductChange change) => $"{change.FeatureId}\u001f{change.AttributePath}";
}

/// <summary>
/// Writes a small deterministic YAML document without adding a general-purpose YAML dependency to the API.
/// </summary>
internal static class ChangeSummaryYamlSerializer
{
    /// <summary>Serializes the complete accumulated summary for durable storage and rule evaluation.</summary>
    public static string Serialize(string datasetName, ProductSpecification productSpecification, DateOnly workDate, DateTime firstDetectedAtUtc, DateTime lastDetectedAtUtc, IEnumerable<ProductChange> changes) {
        var lines = new List<string> {
            $"datasetName: {Quote(datasetName)}",
            $"productSpecification: {productSpecification}",
            $"workDate: {workDate:yyyy-MM-dd}",
            $"firstDetectedAtUtc: {firstDetectedAtUtc:O}",
            $"lastDetectedAtUtc: {lastDetectedAtUtc:O}",
            "changes:"
        };

        foreach (var change in changes) {
            lines.Add($"  - featureId: {Quote(change.FeatureId)}");
            lines.Add($"    featureCode: {Quote(change.FeatureCode)}");
            lines.Add($"    attribute: {Quote(change.AttributePath)}");
            lines.Add($"    deleted: {change.Deleted.ToString().ToLowerInvariant()}");
            lines.Add($"    detectedAtUtc: {change.DetectedAtUtc:O}");
        }
        return string.Join(Environment.NewLine, lines) + Environment.NewLine;
    }

    private static string Quote(string value) => $"\"{value.Replace("\\", "\\\\", StringComparison.Ordinal).Replace("\"", "\\\"", StringComparison.Ordinal)}\"";
}
