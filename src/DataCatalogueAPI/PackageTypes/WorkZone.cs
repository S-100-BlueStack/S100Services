using DataCatalague.Api.Domain;
using System.Net;
using System.Text.Json;

namespace DataCatalague.Api.PackageTypes;

/// <summary>DataCatalogue's ZIP manifest for one WorkZone case; not a native WorkZone export schema.</summary>
/// <param name="SchemaVersion">Supported DataCatalogue import contract version, currently 1.0.</param>
/// <param name="Category">The exact WorkZone catalogue category identifier.</param>
/// <param name="Title">Required case or submission title.</param>
/// <param name="Summary">Required plain-text case/submission summary.</param>
/// <param name="CaseNumber">Required WorkZone case number, retained as the package source reference.</param>
/// <param name="CaseId">Optional internal WorkZone case identifier, treated as opaque text.</param>
/// <param name="Language">Optional description language; defaults to en.</param>
/// <param name="Documents">Optional case document metadata and references to included files under documents/.</param>
public sealed record WorkZoneManifest(string SchemaVersion, string Category, string Title, string Summary, string CaseNumber, string? CaseId = null, string? Language = null, WorkZoneDocument[]? Documents = null);

/// <summary>Metadata for a WorkZone case document included in, or described by, the submission.</summary>
/// <param name="DocumentId">Required opaque source document identifier; no UUID or numeric format is assumed.</param>
/// <param name="Title">Required document title.</param>
/// <param name="DocumentNumber">Optional human-readable source document/record number.</param>
/// <param name="File">Optional exact ZIP path under documents/; null means metadata only.</param>
public sealed record WorkZoneDocument(string DocumentId, string Title, string? DocumentNumber = null, string? File = null);

/// <summary>A submission originating from a WorkZone case, with a supplementary geographical AOI.</summary>
/// <param name="Manifest">Validated DataCatalogue import metadata, including source case and document references.</param>
/// <param name="MetaData">Generic package metadata; the catalogue allocates a WZ-NNN-YY short ID.</param>
/// <param name="Geometry">Supplementary WGS84 envelope and complete polygon geometry.</param>
/// <param name="Descriptions">Encoded summary, case reference and document metadata using the existing description contract.</param>
public sealed record WorkZone(WorkZoneManifest Manifest, PackageMetaData MetaData, PackageGeometry Geometry, PackageDescription[] Descriptions)
{
    /// <summary>Validates metadata and converts a WGS84 GeoJSON AOI without initializing ArcGIS.</summary>
    /// <param name="metadataJson">The DataCatalogue workzone.json object with schemaVersion, category, title, summary and caseNumber.</param>
    /// <param name="geoJson">A Polygon/MultiPolygon, a Feature, or a FeatureCollection with exactly one polygon feature.</param>
    /// <returns>The package fields ready for the existing creation service.</returns>
    /// <exception cref="InvalidDataException">Required metadata or supported WGS84 polygon geometry is invalid.</exception>
    public static WorkZone Parse(string metadataJson, string geoJson) {
        try {
            // Additional metadata fields can be retained in the ZIP without changing the generic package model.
            var manifest = JsonSerializer.Deserialize<WorkZoneManifest>(metadataJson, new JsonSerializerOptions(JsonSerializerDefaults.Web))
                ?? throw new InvalidDataException("workzone.json must contain an object.");
            if (manifest.SchemaVersion != "1.0" || manifest.Category != "WorkZone"
                || string.IsNullOrWhiteSpace(manifest.Title) || string.IsNullOrWhiteSpace(manifest.Summary)
                || string.IsNullOrWhiteSpace(manifest.CaseNumber)
                || manifest.CaseId is not null && string.IsNullOrWhiteSpace(manifest.CaseId)
                || manifest.Language is not null && string.IsNullOrWhiteSpace(manifest.Language)) {
                throw new InvalidDataException("workzone.json requires schemaVersion 1.0, category WorkZone and nonempty title, summary and caseNumber; caseId and language must be nonempty when supplied.");
            }

            var documentIds = new HashSet<string>(StringComparer.Ordinal);
            foreach (var sourceDocument in manifest.Documents ?? []) {
                if (sourceDocument is null || string.IsNullOrWhiteSpace(sourceDocument.DocumentId) || string.IsNullOrWhiteSpace(sourceDocument.Title)
                    || !documentIds.Add(sourceDocument.DocumentId.Trim())
                    || sourceDocument.DocumentNumber is not null && string.IsNullOrWhiteSpace(sourceDocument.DocumentNumber)
                    || sourceDocument.File is not null && string.IsNullOrWhiteSpace(sourceDocument.File)) {
                    throw new InvalidDataException("WorkZone documents require unique nonempty documentId and title; documentNumber and file must be nonempty when supplied.");
                }
            }

            using var document = JsonDocument.Parse(geoJson);
            var geometry = document.RootElement;
            ValidateCrs(geometry);
            if (Type(geometry) == "FeatureCollection") {
                if (!geometry.TryGetProperty("features", out var features) || features.ValueKind != JsonValueKind.Array || features.GetArrayLength() != 1) {
                    throw new InvalidDataException("A WorkZone FeatureCollection must contain exactly one Feature.");
                }
                geometry = features[0];
                if (Type(geometry) != "Feature") { throw new InvalidDataException("WorkZone features must be GeoJSON Features."); }
            }
            ValidateCrs(geometry);
            if (Type(geometry) == "Feature") {
                geometry = geometry.GetProperty("geometry");
                ValidateCrs(geometry);
            }
            var rings = new List<double[][]>();
            var coordinates = geometry.GetProperty("coordinates");
            switch (Type(geometry)) {
                case "Polygon": AddPolygon(coordinates, rings); break;
                case "MultiPolygon":
                    RequireArray(coordinates);
                    foreach (var polygon in coordinates.EnumerateArray()) { AddPolygon(polygon, rings); }
                    break;
                default: throw new InvalidDataException("The WorkZone AOI must be Polygon or MultiPolygon.");
            }
            var positions = rings.SelectMany(ring => ring).ToArray();
            var xmin = positions.Min(point => point[0]);
            var ymin = positions.Min(point => point[1]);
            var xmax = positions.Max(point => point[0]);
            var ymax = positions.Max(point => point[1]);
            if (xmin >= xmax || ymin >= ymax || xmax - xmin > 180) {
                throw new InvalidDataException("WorkZone polygons require a nonzero extent that does not cross the antimeridian.");
            }
            double[][] rectangle = [[xmin, ymin], [xmin, ymax], [xmax, ymax], [xmax, ymin], [xmin, ymin]];
            var spatialReference = new { wkid = 4326 };
            var detail = new PackageGeometry(JsonSerializer.Serialize(new { rings = new[] { rectangle }, spatialReference }), null, null, JsonSerializer.Serialize(new { rings, spatialReference }));
            var metadata = new PackageMetaData(null, "WorkZone", manifest.Title.Trim(), "WorkZone", manifest.CaseNumber.Trim(), null);
            // WorkZone case/document fields stay out of the generic aggregate. The original manifest
            // remains authoritative; encoded descriptions expose useful source references to clients.
            static string Encode(string value) => WebUtility.HtmlEncode(value);
            var summary = Encode(manifest.Summary.Trim()).Replace("\r\n", "\n", StringComparison.Ordinal).Replace("\n", "<br>", StringComparison.Ordinal);
            var html = $"<p>{summary}</p><p><strong>WorkZone case number:</strong> {Encode(manifest.CaseNumber.Trim())}</p>";
            if (manifest.CaseId is not null) { html += $"<p><strong>WorkZone case ID:</strong> {Encode(manifest.CaseId.Trim())}</p>"; }
            foreach (var sourceDocument in manifest.Documents ?? []) {
                html += $"<p><strong>Document:</strong> {Encode(sourceDocument.Title.Trim())}<br><strong>Document ID:</strong> {Encode(sourceDocument.DocumentId.Trim())}";
                if (sourceDocument.DocumentNumber is not null) { html += $"<br><strong>Document number:</strong> {Encode(sourceDocument.DocumentNumber.Trim())}"; }
                if (sourceDocument.File is not null) { html += $"<br><strong>File retained in ZIP:</strong> {Encode(sourceDocument.File)}"; }
                html += "</p>";
            }
            return new WorkZone(manifest, metadata, detail, [new PackageDescription(manifest.Language?.Trim() ?? "en", html)]);
        }
        catch (Exception exception) when (exception is JsonException or InvalidOperationException or KeyNotFoundException or FormatException or OverflowException) {
            throw new InvalidDataException("Invalid WorkZone metadata or GeoJSON AOI.", exception);
        }
    }

    private static string? Type(JsonElement value) => value.GetProperty("type").GetString();

    private static void ValidateCrs(JsonElement value) {
        if (value.TryGetProperty("crs", out var crs) && crs.ValueKind != JsonValueKind.Null) {
            if (crs.GetProperty("type").GetString() != "name"
                || crs.GetProperty("properties").GetProperty("name").GetString() is not ("urn:ogc:def:crs:EPSG::4326" or "EPSG:4326" or "urn:ogc:def:crs:OGC:1.3:CRS84")) {
                throw new InvalidDataException("WorkZone GeoJSON must use WGS84 longitude/latitude coordinates.");
            }
        }
    }

    private static void RequireArray(JsonElement value) {
        if (value.ValueKind != JsonValueKind.Array || value.GetArrayLength() == 0) {
            throw new InvalidDataException("WorkZone polygon coordinate arrays must not be empty.");
        }
    }

    private static void AddPolygon(JsonElement polygon, List<double[][]> rings) {
        RequireArray(polygon);
        var index = 0;
        foreach (var ring in polygon.EnumerateArray()) {
            RequireArray(ring);
            var positions = ring.EnumerateArray().Select(position => {
                if (position.ValueKind != JsonValueKind.Array || position.GetArrayLength() != 2) {
                    throw new InvalidDataException("WorkZone coordinates must be two-dimensional longitude/latitude positions.");
                }
                var x = position[0].GetDouble();
                var y = position[1].GetDouble();
                if (!double.IsFinite(x) || !double.IsFinite(y) || x < -180 || x > 180 || y < -90 || y > 90) {
                    throw new InvalidDataException("WorkZone coordinates must be finite WGS84 longitude/latitude values.");
                }
                return new[] { x, y };
            }).ToArray();
            if (positions.Length < 4 || !positions[0].SequenceEqual(positions[^1])) {
                throw new InvalidDataException("WorkZone rings must be closed and contain at least four positions.");
            }
            // Translate before summing to preserve precision for small supplementary geographic areas.
            var area = 0d;
            for (var i = 0; i < positions.Length - 1; i++) {
                if (Math.Abs(positions[i + 1][0] - positions[i][0]) > 180) { throw new InvalidDataException("WorkZone rings must not cross the antimeridian."); }
                area += (positions[i][0] - positions[0][0]) * (positions[i + 1][1] - positions[0][1])
                    - (positions[i + 1][0] - positions[0][0]) * (positions[i][1] - positions[0][1]);
            }
            if (area == 0) { throw new InvalidDataException("WorkZone rings must have nonzero area."); }
            // Esri shells are clockwise and holes counterclockwise; restart for each polygon.
            if ((index == 0 && area > 0) || (index > 0 && area < 0)) { Array.Reverse(positions); }
            rings.Add(positions);
            index++;
        }
    }
}