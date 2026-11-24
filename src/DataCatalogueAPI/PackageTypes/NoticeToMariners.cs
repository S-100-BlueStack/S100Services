using DataCatalague.Api.Domain;
using System.Text.Json;

namespace DataCatalague.Api.PackageTypes;

/// <summary>An incoming Notice to Mariners mapped to package metadata and Esri geometry JSON.</summary>
/// <param name="Id">The original source notice UUID, stored separately from the catalogue package ID.</param>
/// <param name="MetaData">Metadata read from the source notice.</param>
/// <param name="Geometry">The rectangular AOI and complete detailed geometries in WGS84.</param>
/// <param name="Descriptions">All part descriptions, preserving their HTML and language.</param>
/// <param name="Charts">Chart numbers from the notice, or null when none are supplied.</param>
public sealed record NoticeToMariners(string Id, PackageMetaData MetaData, PackageGeometry Geometry, PackageDescription[]? Descriptions, PackageChart[]? Charts)
{
    /// <summary>Reads the supplied notice format without depending on ArcGIS runtime initialization.</summary>
    /// <param name="json">The original notice JSON.</param>
    /// <returns>The notice ready for package creation.</returns>
    /// <exception cref="InvalidDataException">The notice has invalid or unsupported geometry.</exception>
    public static NoticeToMariners Parse(string json) {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        var id = Guid.Parse(root.GetProperty("id").GetString()!).ToString("D");
        var descriptions = root.GetProperty("descs").EnumerateArray().ToArray();
        var description = descriptions.FirstOrDefault(item => Text(item, "lang") == "da");
        if (description.ValueKind == JsonValueKind.Undefined) {
            description = descriptions.FirstOrDefault(item => Text(item, "lang") == "en");
        }
        if (description.ValueKind == JsonValueKind.Undefined) {
            description = descriptions.FirstOrDefault();
        }

        var metadata = new PackageMetaData(Text(root, "shortId"), Text(root, "type"), Text(description, "title"), Text(description, "source"), id, root.GetProperty("created").GetDateTimeOffset().ToUniversalTime());
        var points = new List<double[]>();
        var paths = new List<double[][]>();
        var rings = new List<double[][]>();

        foreach (var part in root.GetProperty("parts").EnumerateArray()) {
            if (!part.TryGetProperty("geometry", out var collection) || collection.ValueKind == JsonValueKind.Null) {
                continue;
            }
            foreach (var feature in collection.GetProperty("features").EnumerateArray()) {
                if (feature.TryGetProperty("geometry", out var geometry) && geometry.ValueKind != JsonValueKind.Null) {
                    GeoJsonPackageGeometry.AddGeometry(geometry, points, paths, rings);
                }
            }
        }

        return new(id, metadata, GeoJsonPackageGeometry.Build(points, paths, rings, $"notice '{id}'"),
            ReadDescriptions(root), ReadCharts(root));
    }

    private static PackageDescription[]? ReadDescriptions(JsonElement root) {
        var descriptions = new List<PackageDescription>();
        foreach (var part in root.GetProperty("parts").EnumerateArray()) {
           // int? index = part.TryGetProperty("indexNo", out var value) && value.ValueKind != JsonValueKind.Null ? value.GetInt32() : null;
            if (!part.TryGetProperty("descs", out var descs) || descs.ValueKind == JsonValueKind.Null) { continue; }
            foreach (var desc in descs.EnumerateArray()) {
                // Keep every language/part entry in source order, including repeated
                // part indices. Do not trim or combine HTML from different parts.
                if (Text(desc, "details") is { } html) {
                    descriptions.Add(new PackageDescription(Text(desc, "lang"), html));
                }
            }
        }
        return descriptions.Count == 0 ? null : descriptions.ToArray();
    }

    private static PackageChart[]? ReadCharts(JsonElement root) {
        if (!root.TryGetProperty("charts", out var charts) || charts.ValueKind == JsonValueKind.Null) { return null; }
        var result = new List<PackageChart>();
        foreach (var chart in charts.EnumerateArray()) {
            var number = Text(chart, "chartNumber");
            long? international = chart.TryGetProperty("internationalNumber", out var value) && value.ValueKind != JsonValueKind.Null ? value.GetInt64() : null;
            if (number is not null || international is not null) { result.Add(new PackageChart(number, international)); }
        }
        return result.Count == 0 ? null : result.ToArray();
    }

    private static string? Text(JsonElement element, string property)
        => element.ValueKind == JsonValueKind.Object && element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
