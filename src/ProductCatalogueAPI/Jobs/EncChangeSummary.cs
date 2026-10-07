using ProductCatalogueAPI.Data.Models;
using S100FC.ProductCatalogue;
using System.Globalization;
using System.Text.Json;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Provides the change paths, local work date, and YAML shared by the ENC package scan.</summary>
internal static class EncChangeSummary
{
    /// <summary>Includes nested attribute paths and deletions in the package change summary.</summary>
    internal static IReadOnlyCollection<string> GetObservedAttributePaths(ArchiveRow row) {
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

    /// <summary>Uses the local production work date when labeling the shared summary.</summary>
    internal static DateOnly GetCopenhagenDate(DateTime utc) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), GetCopenhagenTimeZone()));

    /// <summary>Starts the initial scan at local midnight rather than at UTC midnight.</summary>
    internal static DateTime GetCopenhagenDayStartUtc(DateTime utc) {
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

    /// <summary>Serializes the changes in one source scan without a separate product-track summary.</summary>
    internal static string Serialize(string datasetName, ProductSpecification productSpecification, DateOnly workDate, DateTime firstDetectedAtUtc, DateTime lastDetectedAtUtc, IEnumerable<ProductChange> changes) {
        var observedChanges = changes.ToArray();
        if (observedChanges.Length == 0)
            throw new InvalidOperationException("An ENC package requires at least one archive change.");
        var lines = new List<string> {
            $"datasetName: {Quote(datasetName)}",
            $"productSpecification: {productSpecification}",
            $"workDate: {workDate:yyyy-MM-dd}",
            $"firstDetectedAtUtc: {firstDetectedAtUtc:O}",
            $"lastDetectedAtUtc: {lastDetectedAtUtc:O}",
            $"latestArchiveEditUtc: {observedChanges.Max(change => change.DetectedAtUtc):O}",
            "changes:"
        };

        foreach (var change in observedChanges) {
            lines.Add($"  - featureId: {Quote(change.FeatureId)}");
            lines.Add($"    featureCode: {Quote(change.FeatureCode)}");
            lines.Add($"    attribute: {Quote(change.AttributePath)}");
            lines.Add($"    deleted: {change.Deleted.ToString().ToLowerInvariant()}");
            lines.Add($"    detectedAtUtc: {change.DetectedAtUtc:O}");
        }
        return string.Join(Environment.NewLine, lines) + Environment.NewLine;
    }

    /// <summary>Reads the archive clock recorded with a package, including summaries made before the explicit header existed.</summary>
    internal static DateTime GetLatestArchiveEditUtc(string summaryYaml) {
        DateTime? latest = null;
        foreach (var line in summaryYaml.Split('\n')) {
            var value = line.StartsWith("latestArchiveEditUtc: ", StringComparison.Ordinal)
                ? line["latestArchiveEditUtc: ".Length..].Trim()
                : line.StartsWith("    detectedAtUtc: ", StringComparison.Ordinal)
                    ? line["    detectedAtUtc: ".Length..].Trim()
                    : null;
            if (value is null)
                continue;
            if (!DateTime.TryParseExact(value, "O", CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed))
                throw new InvalidOperationException("An ENC package has an invalid archive timestamp in its change summary; its candidates were preserved.");
            var utc = parsed.Kind switch {
                DateTimeKind.Local => parsed.ToUniversalTime(),
                DateTimeKind.Unspecified => DateTime.SpecifyKind(parsed, DateTimeKind.Utc),
                _ => parsed
            };
            if (!latest.HasValue || utc > latest.Value)
                latest = utc;
        }
        return latest ?? throw new InvalidOperationException("An ENC package has no archive timestamp in its change summary; its candidates were preserved.");
    }

    private static string Quote(string value) => $"\"{value.Replace("\\", "\\\\", StringComparison.Ordinal).Replace("\"", "\\\"", StringComparison.Ordinal)}\"";
}
