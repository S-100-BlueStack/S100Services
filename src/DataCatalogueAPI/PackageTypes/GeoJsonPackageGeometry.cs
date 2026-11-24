using DataCatalague.Api.Domain;
using System.Text.Json;

namespace DataCatalague.Api.PackageTypes;

/// <summary>Converts WGS84 GeoJSON to Esri JSON geometry groups without using ArcGIS.</summary>
internal static class GeoJsonPackageGeometry
{
    internal static PackageGeometry Parse(JsonElement root) {
        var points = new List<double[]>();
        var paths = new List<double[][]>();
        var rings = new List<double[][]>();
        Read(root);
        return Build(points, paths, rings, "submission", rejectAntimeridian: true);

        void Read(JsonElement element) {
            if (element.TryGetProperty("crs", out var crs) && crs.ValueKind != JsonValueKind.Null
                && (crs.GetProperty("type").GetString() != "name"
                    || crs.GetProperty("properties").GetProperty("name").GetString() is not ("EPSG:4326" or "urn:ogc:def:crs:EPSG::4326" or "urn:ogc:def:crs:OGC:1.3:CRS84"))) {
                throw new InvalidDataException("Submission GeoJSON must use WGS84 longitude/latitude coordinates.");
            }

            switch (element.GetProperty("type").GetString()) {
                case "FeatureCollection":
                    foreach (var feature in element.GetProperty("features").EnumerateArray()) {
                        if (feature.GetProperty("type").GetString() != "Feature") {
                            throw new InvalidDataException("A FeatureCollection can only contain Features.");
                        }
                        Read(feature);
                    }
                    break;
                case "Feature":
                    var geometry = element.GetProperty("geometry");
                    if (geometry.ValueKind != JsonValueKind.Null) { Read(geometry); }
                    break;
                case "GeometryCollection":
                    foreach (var geometryPart in element.GetProperty("geometries").EnumerateArray()) { Read(geometryPart); }
                    break;
                default:
                    AddGeometry(element, points, paths, rings);
                    break;
            }
        }
    }

    internal static PackageGeometry Build(List<double[]> points, List<double[][]> paths, List<double[][]> rings, string source, bool rejectAntimeridian = false) {
        var coordinates = points.Concat(paths.SelectMany(path => path)).Concat(rings.SelectMany(ring => ring)).ToArray();
        if (coordinates.Length == 0) {
            throw new InvalidDataException($"The {source} contains no geometry.");
        }
        var xmin = coordinates.Min(point => point[0]);
        var ymin = coordinates.Min(point => point[1]);
        var xmax = coordinates.Max(point => point[0]);
        var ymax = coordinates.Max(point => point[1]);
        if (rejectAntimeridian && xmax - xmin > 180) {
            throw new InvalidDataException("Submission GeoJSON cannot span the antimeridian.");
        }
        // A point or an axis-aligned line has a zero-area envelope. Give only
        // those collapsed dimensions a roughly metre-wide extent in WGS84.
        const double padding = 0.000005;
        if (xmin == xmax) { xmin = Math.Max(-180, xmin - padding); xmax = Math.Min(180, xmax + padding); }
        if (ymin == ymax) { ymin = Math.Max(-90, ymin - padding); ymax = Math.Min(90, ymax + padding); }
        double[][] rectangle = [[xmin, ymin], [xmin, ymax], [xmax, ymax], [xmax, ymin], [xmin, ymin]];
        var spatialReference = new { wkid = 4326 };
        return new PackageGeometry(
            JsonSerializer.Serialize(new { rings = new[] { rectangle }, spatialReference }),
            points.Count == 0 ? null : JsonSerializer.Serialize(new { points, spatialReference }),
            paths.Count == 0 ? null : JsonSerializer.Serialize(new { paths, spatialReference }),
            rings.Count == 0 ? null : JsonSerializer.Serialize(new { rings, spatialReference }));
    }

    internal static void AddGeometry(JsonElement geometry, List<double[]> points, List<double[][]> paths, List<double[][]> rings) {
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
            default: throw new InvalidDataException($"Unsupported GeoJSON geometry type '{type}'.");
        }
    }

    private static double[] Position(JsonElement position) {
        if (position.GetArrayLength() != 2) {
            throw new InvalidDataException("GeoJSON must contain two-dimensional longitude/latitude coordinates.");
        }
        var x = position[0].GetDouble();
        var y = position[1].GetDouble();
        if (!double.IsFinite(x) || !double.IsFinite(y) || x < -180 || x > 180 || y < -90 || y > 90) {
            throw new InvalidDataException("GeoJSON coordinates must be valid WGS84 longitude/latitude values.");
        }
        return [x, y];
    }

    private static double[][] Line(JsonElement coordinates) {
        var positions = coordinates.EnumerateArray().Select(Position).ToArray();
        if (positions.Length < 2) { throw new InvalidDataException("A GeoJSON line must contain at least two positions."); }
        return positions;
    }

    private static void AddPolygon(JsonElement coordinates, List<double[][]> rings) {
        var index = 0;
        foreach (var ring in coordinates.EnumerateArray()) {
            var positions = ring.EnumerateArray().Select(Position).ToArray();
            if (positions.Length < 4 || !positions[0].SequenceEqual(positions[^1])) {
                throw new InvalidDataException("A GeoJSON polygon must contain closed rings with at least four positions.");
            }
            var area = 0d;
            for (var i = 0; i < positions.Length - 1; i++) {
                area += (positions[i][0] - positions[0][0]) * (positions[i + 1][1] - positions[0][1])
                    - (positions[i + 1][0] - positions[0][0]) * (positions[i][1] - positions[0][1]);
            }
            if (area == 0) { throw new InvalidDataException("A GeoJSON polygon ring has zero area."); }
            // Esri JSON uses clockwise shells and counterclockwise holes.
            if ((index == 0 && area > 0) || (index > 0 && area < 0)) { Array.Reverse(positions); }
            rings.Add(positions);
            index++;
        }
    }
}
