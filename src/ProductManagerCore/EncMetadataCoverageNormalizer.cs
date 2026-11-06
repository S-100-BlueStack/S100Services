using System.Globalization;
using System.Text;
using System.Text.Json;
using NetTopologySuite.Geometries;
using NtsCoordinate = NetTopologySuite.Geometries.Coordinate;
using YamlDataset = S100FC.YAML.Dataset;
using S100FC.YAML;

namespace S100FC.ProductCatalogue;

/// <summary>
/// Removes fully redundant ENC metadata features after the framework has built its output topology.
/// Source geodatabase rows and all non-metadata features remain unchanged.
/// </summary>
internal static class EncMetadataCoverageNormalizer
{
    private static readonly HashSet<string> CoverageTypes = new(StringComparer.Ordinal) {
        "DataCoverage", "SoundingDatum", "VerticalDatumOfData"
    };

    internal sealed record Region(string Foid, string FeatureType, string Attributes,
        string Masks, Polygon Footprint);

    internal sealed record Result(int RemovedDataCoverage, int RemovedSoundingDatum,
        int RemovedVerticalDatumOfData, bool SkippedPartialOverlap = false, string? SkipReason = null)
    {
        internal int TotalRemoved => RemovedDataCoverage + RemovedSoundingDatum + RemovedVerticalDatumOfData;

        // Exact topology identities suppressed by this normalization plan. The owning
        // serializer can omit only these surfaces after checking for other references.
        internal IReadOnlyList<string> SuppressedSurfaceNames { get; init; } = [];
    }

    internal sealed class PartialOverlapRequiresPartitionException : Exception
    {
        internal PartialOverlapRequiresPartitionException(string message) : base(message) { }
    }

    // Dataset.Features is a sorted projection of the framework's internal feature collection.
    // Mutating it does not remove a feature from the serialized dataset. Metadata features must
    // remain pending until topology is available and be committed through Dataset.AddFeature.
    internal static Result Normalize(YamlDataset dataset, IReadOnlyCollection<Feature> pendingMetadata,
        IReadOnlyDictionary<Feature, string>? sourceAttributes = null,
        ISet<Feature>? protectedFeatures = null)
    {
        ArgumentNullException.ThrowIfNull(dataset);
        ArgumentNullException.ThrowIfNull(pendingMetadata);
        var metadata = pendingMetadata.ToArray();
        if (metadata.Length == 0)
            return Apply(dataset, metadata, [], protectedFeatures);

        var parser = new SurfaceParser(dataset);
        var regions = metadata.Select(feature => new Region(
            feature.Foid ?? throw new InvalidDataException("An ENC metadata feature has no FOID."),
            feature.Name,
            sourceAttributes is not null && sourceAttributes.TryGetValue(feature, out var flattened)
                ? CanonicalizeAttributes(flattened) : string.Empty,
            feature.Masks ?? string.Empty,
            parser.Read(feature.Geometry))).ToArray();
        return Apply(dataset, metadata, regions, protectedFeatures);
    }

    internal static Polygon ReadSurfaceGeometry(YamlDataset dataset, string reference)
    {
        ArgumentNullException.ThrowIfNull(dataset);
        return new SurfaceParser(dataset).Read(reference);
    }

    // The plan is independently testable without requiring ArcGIS CoreHost or a native compiler.
    internal static Result Apply(YamlDataset dataset, IReadOnlyCollection<Feature> pendingMetadata,
        IReadOnlyList<Region> regions, ISet<Feature>? protectedFeatures = null)
    {
        ArgumentNullException.ThrowIfNull(dataset);
        ArgumentNullException.ThrowIfNull(pendingMetadata);
        ArgumentNullException.ThrowIfNull(regions);
        var metadata = pendingMetadata.ToArray();
        var alreadyAdded = dataset.Features?.ToArray() ?? [];
        if (alreadyAdded.Any(feature => CoverageTypes.Contains(feature.Name)))
            throw new InvalidDataException("S-101 metadata features were committed before coverage normalization.");
        if (metadata.Any(feature => !CoverageTypes.Contains(feature.Name)) ||
            metadata.Length != regions.Count ||
            !metadata.Select(feature => feature.Foid).OrderBy(value => value, StringComparer.Ordinal)
                .SequenceEqual(regions.Select(region => region.Foid).OrderBy(value => value, StringComparer.Ordinal)))
            throw new InvalidDataException("Metadata normalization plan does not match the pending feature identities.");

        var existingFoids = alreadyAdded.Select(feature => feature.Foid).ToHashSet(StringComparer.Ordinal);
        if (metadata.Any(feature => string.IsNullOrWhiteSpace(feature.Foid) || existingFoids.Contains(feature.Foid)))
            throw new InvalidDataException("Pending S-101 metadata contains a missing or previously committed feature identity.");

        IReadOnlySet<string> suppressedFoids;
        try {
            suppressedFoids = FindRedundantRegions(regions);
        }
        catch (PartialOverlapRequiresPartitionException exception) {
            // There is no safe metadata-only partition operation for a partial overlap.
            // Reproduce the pre-normalization output unchanged and let the existing
            // native compiler and SevenCs validation report the unresolved coverage.
            // Never leave a partially normalized ENC or block unrelated products.
            foreach (var feature in metadata)
                dataset.AddFeature(feature);
            return new Result(0, 0, 0, SkippedPartialOverlap: true, SkipReason: exception.Message);
        }
        var removed = metadata.Where(feature => suppressedFoids.Contains(feature.Foid)).ToArray();
        var removedFoids = removed.Select(feature => feature.Foid).ToHashSet(StringComparer.Ordinal);

        foreach (var feature in removed) {
            if (protectedFeatures?.Contains(feature) == true)
                throw new InvalidDataException($"Changed S-101 metadata feature '{feature.Foid}' would be suppressed; source membership must not be lost.");
            if (feature.Association?.Count > 0 || feature.FeatureAssociation?.Count > 0)
                throw new InvalidDataException($"S-101 metadata feature '{feature.Foid}' has associations and cannot be suppressed safely.");
        }

        // Inspect committed features and retained pending features before making any additions.
        foreach (var feature in alreadyAdded.Concat(metadata.Where(feature => !suppressedFoids.Contains(feature.Foid)))) {
            if (feature.FeatureAssociation?.Any(association => removedFoids.Contains(association.To)) == true)
                throw new InvalidDataException($"Feature '{feature.Foid}' references a redundant metadata feature; normalization cannot change the association target.");
        }

        // A missing geometry reference cannot be safely removed from the serialized
        // topology. Validate every suppressed identity before committing metadata.
        if (removed.Any(feature => string.IsNullOrWhiteSpace(feature.Geometry)))
            throw new InvalidDataException("A suppressed S-101 metadata feature has no surface reference.");
        var suppressedSurfaces = removed.Select(feature => feature.Geometry!).ToArray();

        // Preserve framework-owned topology primitives and commit only retained metadata using
        // the public mutation API. Dataset.Features itself is not a mutable backing collection.
        foreach (var feature in metadata.Where(feature => !suppressedFoids.Contains(feature.Foid)))
            dataset.AddFeature(feature);

        return new Result(
            removed.Count(feature => feature.Name == "DataCoverage"),
            removed.Count(feature => feature.Name == "SoundingDatum"),
            removed.Count(feature => feature.Name == "VerticalDatumOfData")) {
            SuppressedSurfaceNames = suppressedSurfaces
        };
    }

    internal static IReadOnlySet<string> FindRedundantRegions(IReadOnlyList<Region> regions)
    {
        ArgumentNullException.ThrowIfNull(regions);
        var suppressed = new HashSet<string>(StringComparer.Ordinal);
        var seen = new HashSet<string>(StringComparer.Ordinal);

        foreach (var region in regions) {
            if (!seen.Add(region.Foid))
                throw new InvalidDataException($"Duplicate S-101 metadata FOID '{region.Foid}'.");
            if (!CoverageTypes.Contains(region.FeatureType) || region.Footprint.IsEmpty || !region.Footprint.IsValid)
                throw new InvalidDataException($"Invalid S-101 metadata region '{region.Foid}'.");
        }

        var groups = regions.GroupBy(region => region.FeatureType, StringComparer.Ordinal)
            .Select(group => group.OrderByDescending(region => region.Footprint.Area)
                .ThenBy(region => region.Foid, StringComparer.Ordinal).ToArray()).ToArray();

        // Check every overlapping pair in every class before considering a fallback.
        // An early partial overlap must never conceal an unsafe metadata conflict
        // in that class or in another metadata class.
        foreach (var ordered in groups) {
            for (var i = 0; i < ordered.Length; i++) {
                for (var j = i + 1; j < ordered.Length; j++) {
                    var first = ordered[i];
                    var second = ordered[j];
                    if (!first.Footprint.Intersects(second.Footprint) ||
                        first.Footprint.Intersection(second.Footprint).Area <= 0)
                        continue;
                    if (string.IsNullOrWhiteSpace(first.Attributes) || string.IsNullOrWhiteSpace(second.Attributes) ||
                        !string.Equals(first.Attributes, second.Attributes, StringComparison.Ordinal) ||
                        !string.Equals(first.Masks, second.Masks, StringComparison.Ordinal))
                        throw new InvalidDataException($"Overlapping '{first.FeatureType}' regions '{first.Foid}' and '{second.Foid}' have different or unverified semantics.");
                }
            }
        }

        foreach (var ordered in groups) {
            var retained = new List<Region>();
            foreach (var candidate in ordered) {
                // Prefer complete containment even when the candidate also intersects
                // another retained region. Such a candidate is fully redundant.
                if (retained.Any(existing => existing.Footprint.Covers(candidate.Footprint))) {
                    suppressed.Add(candidate.Foid);
                    continue;
                }

                foreach (var existing in retained) {
                    if (!existing.Footprint.Intersects(candidate.Footprint) ||
                        existing.Footprint.Intersection(candidate.Footprint).Area <= 0)
                        continue;
                    throw new PartialOverlapRequiresPartitionException($"Partially overlapping '{candidate.FeatureType}' regions '{existing.Foid}' and '{candidate.Foid}' require a topology-aware partition, not feature removal.");
                }
                retained.Add(candidate);
            }
        }

        return suppressed;
    }

    private static string CanonicalizeAttributes(string flattened)
    {
        if (string.IsNullOrWhiteSpace(flattened))
            return string.Empty;
        try {
            using var document = JsonDocument.Parse(flattened);
            using var stream = new MemoryStream();
            using (var writer = new Utf8JsonWriter(stream)) {
                WriteCanonical(document.RootElement, writer);
            }
            return Encoding.UTF8.GetString(stream.ToArray());
        }
        catch (JsonException exception) {
            throw new InvalidDataException("S-101 metadata attributeBindings contain invalid JSON; overlapping features cannot be reconciled.", exception);
        }
    }

    private static void WriteCanonical(JsonElement value, Utf8JsonWriter writer)
    {
        switch (value.ValueKind) {
            case JsonValueKind.Object:
                writer.WriteStartObject();
                foreach (var property in value.EnumerateObject().OrderBy(property => property.Name, StringComparer.Ordinal)) {
                    writer.WritePropertyName(property.Name);
                    WriteCanonical(property.Value, writer);
                }
                writer.WriteEndObject();
                break;
            case JsonValueKind.Array:
                writer.WriteStartArray();
                foreach (var item in value.EnumerateArray())
                    WriteCanonical(item, writer);
                writer.WriteEndArray();
                break;
            default:
                value.WriteTo(writer);
                break;
        }
    }

    private sealed class SurfaceParser
    {
        private readonly Dictionary<string, S100FC.YAML.Surface> _surfaces;
        private readonly Dictionary<string, S100FC.YAML.Curve> _curves;
        private readonly Dictionary<string, S100FC.YAML.CompositeCurve> _composites;
        private readonly GeometryFactory _factory = new(new PrecisionModel(), 4326);

        internal SurfaceParser(YamlDataset dataset)
        {
            _surfaces = (dataset.Surfaces ?? []).ToDictionary(surface => surface.Name, StringComparer.Ordinal);
            _curves = (dataset.Curves ?? []).ToDictionary(curve => curve.Name, StringComparer.Ordinal);
            _composites = (dataset.CompositeCurves ?? []).ToDictionary(curve => curve.Name, StringComparer.Ordinal);
        }

        internal Polygon Read(string reference)
        {
            if (string.IsNullOrWhiteSpace(reference) || !_surfaces.TryGetValue(reference, out var surface))
                throw new InvalidDataException($"ENC metadata surface '{reference}' is missing from output topology.");

            var shell = Ring(surface.Exterior);
            var holes = new List<LinearRing>();
            // Interior is the serialized representation of InteriorRings, not a second set of holes.
            if (surface.InteriorRings is { Length: > 0 } interiorRings) {
                foreach (var ring in interiorRings)
                    holes.Add(Ring(ring));
            }
            else {
                foreach (var interior in surface.Interior ?? []) {
                    JsonElement node = JsonSerializer.SerializeToElement((object?)interior);
                    if (!node.TryGetProperty("Hole", out JsonElement hole) || hole.ValueKind != JsonValueKind.String)
                        throw new InvalidDataException($"ENC metadata surface '{reference}' has an unsupported interior ring.");
                    holes.Add(Ring(hole.GetString()!));
                }
            }

            var polygon = _factory.CreatePolygon(shell, holes.ToArray());
            if (polygon.IsEmpty || !polygon.IsValid)
                throw new InvalidDataException($"ENC metadata surface '{reference}' has invalid exported geometry.");
            return polygon;
        }

        private LinearRing Ring(string reference)
        {
            var coordinates = Expand(reference, 0);
            if (coordinates.Count < 4 || !coordinates[0].Equals2D(coordinates[^1]))
                throw new InvalidDataException($"ENC metadata ring '{reference}' is not closed.");
            return _factory.CreateLinearRing(coordinates.ToArray());
        }

        private List<NtsCoordinate> Expand(string reference, int depth)
        {
            if (depth > 64 || string.IsNullOrWhiteSpace(reference))
                throw new InvalidDataException("ENC metadata topology contains an invalid or recursive curve reference.");
            var reversed = reference.StartsWith("RC", StringComparison.Ordinal);
            var name = reversed ? reference[1..] : reference;
            List<NtsCoordinate> coordinates;

            if (_curves.TryGetValue(name, out var curve)) {
                coordinates = ParseVertices(curve.Vertices);
            }
            else if (_composites.TryGetValue(name, out var composite)) {
                coordinates = [];
                var parts = (composite.Components ?? string.Empty)
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                if (parts.Length == 0)
                    throw new InvalidDataException($"ENC metadata composite curve '{name}' has no components.");
                foreach (var part in parts) {
                    var segment = Expand(part, depth + 1);
                    if (coordinates.Count > 0) {
                        if (!coordinates[^1].Equals2D(segment[0]))
                            throw new InvalidDataException($"ENC metadata composite curve '{name}' is disconnected.");
                        coordinates.AddRange(segment.Skip(1));
                    }
                    else coordinates.AddRange(segment);
                }
            }
            else throw new InvalidDataException($"ENC metadata curve '{name}' is missing from output topology.");

            if (reversed)
                coordinates.Reverse();
            return coordinates;
        }

        private static List<NtsCoordinate> ParseVertices(string vertices)
        {
            var values = (vertices ?? string.Empty).Split(',', StringSplitOptions.TrimEntries);
            if (values.Length < 4 || values.Length % 2 != 0)
                throw new InvalidDataException("ENC metadata curve has an invalid coordinate sequence.");
            var coordinates = new List<NtsCoordinate>(values.Length / 2);
            for (var i = 0; i < values.Length; i += 2) {
                if (!double.TryParse(values[i], NumberStyles.Float, CultureInfo.InvariantCulture, out var x) ||
                    !double.TryParse(values[i + 1], NumberStyles.Float, CultureInfo.InvariantCulture, out var y) ||
                    !double.IsFinite(x) || !double.IsFinite(y))
                    throw new InvalidDataException("ENC metadata curve contains an invalid coordinate.");
                coordinates.Add(new NtsCoordinate(x, y));
            }
            return coordinates;
        }
    }
}
