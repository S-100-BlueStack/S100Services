using ProductCatalogueAPI.Data.Models;
using S100FC;
using S100FC.YAML;
using S100FC.ProductCatalogue;
using System.Globalization;
using System.Text.Json;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Provides the change paths, local work date, and YAML shared by the ENC package scan.</summary>
internal static class EncChangeSummary
{
    /// <summary>Reports net changes between the archive state at the scan cursor and the latest state.</summary>
    internal static IReadOnlyCollection<string> GetObservedAttributePaths(ArchiveRow row) {
        if (row.Deleted)
            return row.BeforeCode is null ? [] : ["$deleted"];
        var paths = new HashSet<string>(StringComparer.Ordinal);
        AddChangedJsonPaths(paths, "attributes", row.BeforeAttributeBindings, row.AttributeBindings, nested: true);
        AddChangedJsonPaths(paths, "featureBindings", row.BeforeFeatureBindings, row.FeatureBindings, nested: false);
        AddChangedJsonPaths(paths, "informationBindings", row.BeforeInformationBindings, row.InformationBindings, nested: false);
        if (row.BeforeCode is not null && !string.Equals(row.BeforeCode, row.Code, StringComparison.Ordinal))
            paths.Add("$code");
        if (row.GeometryChanged)
            paths.Add("$geometry");
        if (row.BeforeCode is null && paths.Count == 0)
            paths.Add("$feature");
        return paths.OrderBy(path => path, StringComparer.Ordinal).ToArray();
    }

    private static void AddChangedJsonPaths(ISet<string> paths, string prefix, string? beforeJson, string? afterJson, bool nested) {
        if (string.IsNullOrWhiteSpace(beforeJson) && string.IsNullOrWhiteSpace(afterJson))
            return;
        try {
            using var before = string.IsNullOrWhiteSpace(beforeJson) ? null : JsonDocument.Parse(beforeJson);
            using var after = string.IsNullOrWhiteSpace(afterJson) ? null : JsonDocument.Parse(afterJson);
            Diff(before?.RootElement, after?.RootElement, prefix);
        }
        catch (JsonException exception) {
            throw new InvalidOperationException($"Archive {prefix} is not valid JSON; DPC preserved the watermark.", exception);
        }

        void Diff(JsonElement? before, JsonElement? after, string path) {
            if (JsonEquals(before, after))
                return;
            if (nested && (before?.ValueKind == JsonValueKind.Object || after?.ValueKind == JsonValueKind.Object)) {
                var names = (before?.ValueKind == JsonValueKind.Object ? before.Value.EnumerateObject().Select(p => p.Name) : [])
                    .Concat(after?.ValueKind == JsonValueKind.Object ? after.Value.EnumerateObject().Select(p => p.Name) : [])
                    .Distinct(StringComparer.Ordinal);
                foreach (var name in names)
                    Diff(Property(before, name), Property(after, name), $"{path}.{name}");
            }
            else if (nested && (before?.ValueKind == JsonValueKind.Array || after?.ValueKind == JsonValueKind.Array)) {
                var length = Math.Max(before?.ValueKind == JsonValueKind.Array ? before.Value.GetArrayLength() : 0,
                    after?.ValueKind == JsonValueKind.Array ? after.Value.GetArrayLength() : 0);
                if (length == 0) paths.Add(path);
                for (var index = 0; index < length; index++)
                    Diff(Element(before, index), Element(after, index), $"{path}[{index}]");
            }
            else {
                paths.Add(path);
            }
        }
    }

    private static JsonElement? Property(JsonElement? element, string name) =>
        element?.ValueKind == JsonValueKind.Object && element.Value.TryGetProperty(name, out var value) ? value : null;

    private static JsonElement? Element(JsonElement? element, int index) =>
        element?.ValueKind == JsonValueKind.Array && index < element.Value.GetArrayLength() ? element.Value[index] : null;

    private static bool JsonEquals(JsonElement? left, JsonElement? right) {
        if (!left.HasValue || !right.HasValue) return left.HasValue == right.HasValue;
        if (left.Value.ValueKind != right.Value.ValueKind) return false;
        switch (left.Value.ValueKind) {
            case JsonValueKind.Object:
                var properties = left.Value.EnumerateObject().ToArray();
                return properties.Length == right.Value.EnumerateObject().Count() &&
                    properties.All(property => right.Value.TryGetProperty(property.Name, out var other) && JsonEquals(property.Value, other));
            case JsonValueKind.Array:
                return left.Value.GetArrayLength() == right.Value.GetArrayLength() &&
                    Enumerable.Range(0, left.Value.GetArrayLength()).All(index => JsonEquals(left.Value[index], right.Value[index]));
            case JsonValueKind.String: return left.Value.GetString() == right.Value.GetString();
            case JsonValueKind.Number:
                return left.Value.TryGetDecimal(out var a) && right.Value.TryGetDecimal(out var b)
                    ? a == b : left.Value.GetRawText() == right.Value.GetRawText();
            default: return left.Value.GetRawText() == right.Value.GetRawText();
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
        var observedChanges = changes.Distinct().OrderBy(change => change.FeatureId, StringComparer.Ordinal)
            .ThenBy(change => change.AttributePath, StringComparer.Ordinal).ToArray();
        if (observedChanges.Length == 0)
            throw new InvalidOperationException("An ENC package requires at least one archive change.");
        foreach (var instant in observedChanges.Select(change => change.DetectedAtUtc).Append(firstDetectedAtUtc).Append(lastDetectedAtUtc)) {
            if (instant.Kind != DateTimeKind.Utc)
                throw new InvalidOperationException("ENC summary UTC fields require normalized UTC timestamps.");
        }
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
            lines.Add($"  - featureId: {change.FeatureId}");
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
