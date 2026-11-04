using DataCatalague.Api.Domain;
using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DataCatalague.Api.PackageTypes;

/// <summary>A MARIS extraction site mapped from a supplied GeoJSON snapshot, without inferring current permit validity.</summary>
/// <param name="MetaData">Source site identity, extraction type and title; catalogue short IDs are allocated during creation.</param>
/// <param name="Geometry">WGS84 envelope and complete site polygon, including holes and separate parts.</param>
/// <param name="Descriptions">HTML-encoded source properties and a safe permit link when supplied.</param>
public sealed record MarineAggregateExtraction(PackageMetaData MetaData, PackageGeometry Geometry, PackageDescription[] Descriptions)
{
    /// <summary>Reads the notebook's MARIS GeoJSON export without requiring the ArcGIS runtime.</summary>
    /// <param name="json">A WGS84 FeatureCollection containing one feature per MARIS site ID.</param>
    /// <returns>Sites in source order, including expired records.</returns>
    /// <exception cref="InvalidDataException">The collection, identity, properties, CRS or polygon coordinates are invalid.</exception>
    public static IReadOnlyList<MarineAggregateExtraction> Parse(string json) {
        try {
            var collection = JsonSerializer.Deserialize<SourceCollection>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (collection is null || collection.Type != "FeatureCollection" || collection.Features is not { Length: > 0 }) {
                throw new InvalidDataException("A MARIS sample must be a nonempty GeoJSON FeatureCollection.");
            }
            // The supplied MARIS export omits CRS (GeoJSON longitude/latitude).
            // Reject other declared CRSs rather than relabel projected WFS coordinates.
            if (collection.Crs is { } crs && (crs.Type != "name" || crs.Properties?.Name is not ("urn:ogc:def:crs:EPSG::4326" or "EPSG:4326" or "urn:ogc:def:crs:OGC:1.3:CRS84"))) {
                throw new InvalidDataException("MARIS samples must use WGS84 longitude/latitude coordinates.");
            }

            var ids = new HashSet<Guid>();
            var sites = new List<MarineAggregateExtraction>();
            foreach (var feature in collection.Features) {
                if (feature is null || feature.Type != "Feature" || feature.Properties is not { } properties || feature.Geometry is not { } geometry
                    || !Guid.TryParse(properties.Id, out var id) || id == Guid.Empty || !ids.Add(id)
                    || (feature.Id is not null && (!Guid.TryParse(feature.Id, out var featureId) || featureId != id))
                    || string.IsNullOrWhiteSpace(properties.Number) || string.IsNullOrWhiteSpace(properties.Name) || string.IsNullOrWhiteSpace(properties.Type)) {
                    throw new InvalidDataException("Every MARIS feature requires a unique site UUID, matching feature ID when supplied, area number, name, type and polygon.");
                }

                var rings = new List<double[][]>();
                switch (geometry.Type) {
                    case "Polygon": AddPolygon(geometry.Coordinates, rings); break;
                    case "MultiPolygon":
                        RequireArray(geometry.Coordinates);
                        foreach (var polygon in geometry.Coordinates.EnumerateArray()) { AddPolygon(polygon, rings); }
                        break;
                    default: throw new InvalidDataException("MARIS geometry must be Polygon or MultiPolygon.");
                }
                var positions = rings.SelectMany(ring => ring).ToArray();
                var xmin = positions.Min(point => point[0]);
                var ymin = positions.Min(point => point[1]);
                var xmax = positions.Max(point => point[0]);
                var ymax = positions.Max(point => point[1]);
                if (xmin >= xmax || ymin >= ymax || xmax - xmin > 180) {
                    throw new InvalidDataException("MARIS polygons require a nonzero extent that does not cross the antimeridian.");
                }
                double[][] rectangle = [[xmin, ymin], [xmin, ymax], [xmax, ymax], [xmax, ymin], [xmin, ymin]];
                var spatialReference = new { wkid = 4326 };
                var detail = new PackageGeometry(JsonSerializer.Serialize(new { rings = new[] { rectangle }, spatialReference }), null, null, JsonSerializer.Serialize(new { rings, spatialReference }));
                var title = $"{properties.Number} – {properties.Name}";
                if (!string.IsNullOrWhiteSpace(properties.Subsite)) { title += $" ({properties.Subsite})"; }
                // MARIS does not supply a creation timestamp. Effective/expiry dates
                // describe a permit and must not be presented as package creation dates.
                var metadata = new PackageMetaData(null, properties.Type, title, "Miljøstyrelsen / MARIS", id.ToString("D"), null);
                sites.Add(new MarineAggregateExtraction(metadata, detail, [new PackageDescription("en", Description(properties))]));
            }
            return sites;
        }
        catch (Exception exception) when (exception is JsonException or InvalidOperationException or FormatException or OverflowException) {
            throw new InvalidDataException("Invalid MARIS GeoJSON snapshot.", exception);
        }
    }

    private static void RequireArray(JsonElement value) {
        if (value.ValueKind != JsonValueKind.Array || value.GetArrayLength() == 0) {
            throw new InvalidDataException("MARIS polygon coordinate arrays must not be empty.");
        }
    }

    private static void AddPolygon(JsonElement polygon, List<double[][]> rings) {
        RequireArray(polygon);
        var index = 0;
        foreach (var ring in polygon.EnumerateArray()) {
            RequireArray(ring);
            var positions = ring.EnumerateArray().Select(position => {
                if (position.ValueKind != JsonValueKind.Array || position.GetArrayLength() != 2) {
                    throw new InvalidDataException("MARIS coordinates must be two-dimensional longitude/latitude positions.");
                }
                var x = position[0].GetDouble();
                var y = position[1].GetDouble();
                if (!double.IsFinite(x) || !double.IsFinite(y) || x < -180 || x > 180 || y < -90 || y > 90) {
                    throw new InvalidDataException("MARIS coordinates must be finite WGS84 longitude/latitude values.");
                }
                return new[] { x, y };
            }).ToArray();
            if (positions.Length < 4 || !positions[0].SequenceEqual(positions[^1])) {
                throw new InvalidDataException("MARIS polygon rings must be closed and contain at least four positions.");
            }
            // Translate before summing to avoid cancellation for small geographic rings.
            var area = 0d;
            for (var i = 0; i < positions.Length - 1; i++) {
                area += (positions[i][0] - positions[0][0]) * (positions[i + 1][1] - positions[0][1])
                    - (positions[i + 1][0] - positions[0][0]) * (positions[i][1] - positions[0][1]);
            }
            if (area == 0) { throw new InvalidDataException("MARIS polygon rings must have nonzero area."); }
            // Esri shells are clockwise, holes counterclockwise; restart at each polygon.
            if ((index == 0 && area > 0) || (index > 0 && area < 0)) { Array.Reverse(positions); }
            rings.Add(positions);
            index++;
        }
    }

    private static string Description(SourceProperties properties) {
        static string Encode(string? value) => WebUtility.HtmlEncode(value ?? "Unspecified");
        static string Date(DateTimeOffset? value) => value?.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture) ?? "Unspecified";
        var html = "<p>Supplied MARIS snapshot; permit dates and status have not been verified against the current register.</p><dl>";
        foreach (var entry in new[] {
            ("Area number", properties.Number), ("Site name", properties.Name), ("Extraction type", properties.Type),
            ("Subsite", properties.Subsite), ("Is subsite", properties.IsSubsite?.ToString()),
            ("Effective date (UTC)", Date(properties.EffectiveDate)), ("Expiry date (UTC)", Date(properties.ExpiryDate)),
            ("Status in supplied snapshot", properties.Status), ("Remarks", properties.Remarks),
            ("Source deadline value", properties.Deadline?.ToString(CultureInfo.InvariantCulture)), ("Volume ID", properties.VolumeId),
        }) {
            html += $"<dt>{entry.Item1}</dt><dd>{Encode(entry.Item2)}</dd>";
        }
        html += "</dl>";
        if (Uri.TryCreate(properties.LicenseUrl, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https") {
            html += $"<p><a href=\"{Encode(uri.AbsoluteUri)}\" rel=\"noopener noreferrer\">Source permit</a></p>";
        }
        else if (!string.IsNullOrWhiteSpace(properties.LicenseUrl)) {
            html += $"<p>Source permit reference: {Encode(properties.LicenseUrl)}</p>";
        }
        return html;
    }

    private sealed record SourceCollection(string? Type, SourceFeature?[]? Features, SourceCrs? Crs);
    private sealed record SourceCrs(string? Type, SourceCrsProperties? Properties);
    private sealed record SourceCrsProperties(string? Name);
    private sealed record SourceFeature(string? Type, string? Id, SourceProperties? Properties, SourceGeometry? Geometry);
    private sealed record SourceGeometry(string? Type, JsonElement Coordinates);
    private sealed record SourceProperties(string? Id, string? Number, string? Name, string? Type, string? Subsite, bool? IsSubsite, string? Remarks, int? Deadline, string? LicenseUrl, string? VolumeId, DateTimeOffset? EffectiveDate, DateTimeOffset? ExpiryDate, [property: JsonPropertyName("Status")] string? Status);
}
