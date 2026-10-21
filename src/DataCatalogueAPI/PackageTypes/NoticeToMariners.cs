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
                    AddGeometry(geometry, points, paths, rings);
                }
            }
        }

        var coordinates = points.Concat(paths.SelectMany(path => path)).Concat(rings.SelectMany(ring => ring)).ToArray();
        if (coordinates.Length == 0) {
            throw new InvalidDataException($"Notice '{id}' contains no geometry.");
        }
        var xmin = coordinates.Min(point => point[0]);
        var ymin = coordinates.Min(point => point[1]);
        var xmax = coordinates.Max(point => point[0]);
        var ymax = coordinates.Max(point => point[1]);
        // A point or an axis-aligned line has a zero-area envelope. Give only
        // those collapsed dimensions a roughly metre-wide extent in WGS84.
        const double padding = 0.000005;
        if (xmin == xmax) { xmin -= padding; xmax += padding; }
        if (ymin == ymax) { ymin -= padding; ymax += padding; }
        double[][] rectangle = [[xmin, ymin], [xmin, ymax], [xmax, ymax], [xmax, ymin], [xmin, ymin]];
        var spatialReference = new { wkid = 4326 };
        return new(id, metadata, new PackageGeometry(
            JsonSerializer.Serialize(new { rings = new[] { rectangle }, spatialReference }),
            points.Count == 0 ? null : JsonSerializer.Serialize(new { points, spatialReference }),
            paths.Count == 0 ? null : JsonSerializer.Serialize(new { paths, spatialReference }),
            rings.Count == 0 ? null : JsonSerializer.Serialize(new { rings, spatialReference })),
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

    private static void AddGeometry(JsonElement geometry, List<double[]> points, List<double[][]> paths, List<double[][]> rings) {
        var type = geometry.GetProperty("type").GetString();
        var coordinates = geometry.GetProperty("coordinates");
        switch (type) {
            case "Point": points.Add(Position(coordinates)); break;
            case "MultiPoint": points.AddRange(coordinates.EnumerateArray().Select(Position)); break;
            case "LineString": paths.Add(Line(coordinates)); break;
            case "MultiLineString": paths.AddRange(coordinates.EnumerateArray().Select(Line)); break;
            case "Polygon": AddPolygon(coordinates, rings); break;
            case "MultiPolygon":
                foreach (var polygon in coordinates.EnumerateArray()) { AddPolygon(polygon, rings); }
                break;
            default: throw new InvalidDataException($"Unsupported notice geometry type '{type}'.");
        }
    }

    private static double[] Position(JsonElement position) {
        if (position.GetArrayLength() != 2) {
            throw new InvalidDataException("Notices must contain two-dimensional longitude/latitude coordinates.");
        }
        var x = position[0].GetDouble();
        var y = position[1].GetDouble();
        if (!double.IsFinite(x) || !double.IsFinite(y) || x < -180 || x > 180 || y < -90 || y > 90) {
            throw new InvalidDataException("Notice coordinates must be valid WGS84 longitude/latitude values.");
        }
        return [x, y];
    }

    private static double[][] Line(JsonElement coordinates) {
        var positions = coordinates.EnumerateArray().Select(Position).ToArray();
        if (positions.Length < 2) { throw new InvalidDataException("A notice line must contain at least two positions."); }
        return positions;
    }

    private static void AddPolygon(JsonElement coordinates, List<double[][]> rings) {
        var index = 0;
        foreach (var ring in coordinates.EnumerateArray()) {
            var positions = ring.EnumerateArray().Select(Position).ToArray();
            if (positions.Length < 4 || !positions[0].SequenceEqual(positions[^1])) {
                throw new InvalidDataException("A notice polygon must contain closed rings with at least four positions.");
            }
            var area = 0d;
            for (var i = 0; i < positions.Length - 1; i++) {
                area += positions[i][0] * positions[i + 1][1] - positions[i + 1][0] * positions[i][1];
            }
            if (area == 0) { throw new InvalidDataException("A notice polygon ring has zero area."); }
            // Esri JSON uses clockwise shells and counterclockwise holes.
            if ((index == 0 && area > 0) || (index > 0 && area < 0)) { Array.Reverse(positions); }
            rings.Add(positions);
            index++;
        }
    }
}
/// <summary>Adapts the existing notice parser to the common source-file creation interface.</summary>
public sealed class NoticeToMarinersPackageType : IPackageType
{
    /// <inheritdoc />
    public string CategoryType => "NoticeToMariners";

    /// <inheritdoc />
    public async Task<DataCatalague.Api.Models.V1.CreatePackageRequest> CreateRequestAsync(string sourceFile, CancellationToken cancellationToken) {
        var notice = NoticeToMariners.Parse(await File.ReadAllTextAsync(sourceFile, cancellationToken).ConfigureAwait(false));
        if (string.IsNullOrWhiteSpace(notice.MetaData.ShortId)) {
            throw new InvalidDataException($"Notice '{Path.GetFileName(sourceFile)}' has no shortId.");
        }
        return new() {
            Category = CategoryType,
            AbsoluteUri = new Uri(Path.GetFullPath(sourceFile)).AbsoluteUri,
            EsriJSON = notice.Geometry.Aoi,
            DetailedGeometry = notice.Geometry,
            MetaData = notice.MetaData,
            Descriptions = notice.Descriptions,
            Charts = notice.Charts,
        };
    }
}
