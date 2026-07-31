using S100FC.Topology;
using S100FC.YAML;

namespace S100FC.ProductCatalogue
{
    internal sealed record TopologyFeatureMappingResult(
        string FeatureUid,
        string Foid,
        string Geometry,
        string? Masks);

    internal static class TopologyFeatureMapping
    {
        private const string AgencyCode = "110";

        internal static IReadOnlyList<TopologyFeatureMappingResult> Resolve(
            string sourceUid,
            Primitive primitive,
            IEnumerable<KeyValuePair<string, string>> mapper,
            IDictionary<string, string> mappingFoid,
            IEnumerable<SurfaceFeature> surfaces) {
            ArgumentException.ThrowIfNullOrWhiteSpace(sourceUid);
            ArgumentNullException.ThrowIfNull(mapper);
            ArgumentNullException.ThrowIfNull(mappingFoid);
            ArgumentNullException.ThrowIfNull(surfaces);

            var generatedUids = mapper
                .Where(e => string.Equals(e.Value, sourceUid, StringComparison.OrdinalIgnoreCase))
                .Select(e => e.Key)
                .Where(e => !string.IsNullOrWhiteSpace(e))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(e => e, StringComparer.OrdinalIgnoreCase)
                .ToArray();

            string[] featureUids = generatedUids.Length == 0 ? [sourceUid] : generatedUids;
            var results = new List<TopologyFeatureMappingResult>(featureUids.Length);

            foreach (var featureUid in featureUids) {
                if (!TryResolveGeometry(featureUid, primitive, mappingFoid, out var geometry))
                    continue;

                results.Add(new TopologyFeatureMappingResult(
                    featureUid,
                    CreateFoid(featureUid),
                    geometry,
                    ResolveMasks(featureUid, primitive, surfaces)));
            }

            return results;
        }

        internal static string CreateFoid(string featureUid) {
            ArgumentException.ThrowIfNullOrWhiteSpace(featureUid);

            if (featureUid.Length < 2 || !featureUid.StartsWith("F", StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException($"Feature UID '{featureUid}' is not a supported S-101 feature UID.", nameof(featureUid));

            var localId = featureUid[1..];

            return localId.Contains(':')
                ? $"{AgencyCode}:{localId}"
                : $"{AgencyCode}:{localId}:1";
        }

        private static bool TryResolveGeometry(
            string featureUid,
            Primitive primitive,
            IDictionary<string, string> mappingFoid,
            out string geometry) {
            if (TryGetValue(mappingFoid, featureUid, out geometry) && !string.IsNullOrWhiteSpace(geometry))
                return true;

            if (primitive is Primitive.Curve or Primitive.Surface) {
                geometry = string.Empty;
                return false;
            }

            geometry = featureUid;
            return true;
        }

        private static string? ResolveMasks(
            string featureUid,
            Primitive primitive,
            IEnumerable<SurfaceFeature> surfaces) {
            if (primitive != Primitive.Surface)
                return null;

            var topologySurface = surfaces.FirstOrDefault(
                e => string.Equals(e.Ref, featureUid, StringComparison.OrdinalIgnoreCase));

            if (topologySurface == null)
                return null;

            var masks = new[] {
                topologySurface.Masks1?.Select(e => $"C{e}:1"),
                topologySurface.Masks2?.Select(e => $"C{e}:2")
            }.Where(e => e != null).SelectMany(e => e!).ToArray();

            return masks.Length == 0 ? null : string.Join(",", masks);
        }

        private static bool TryGetValue(
            IDictionary<string, string> values,
            string key,
            out string value) {
            if (values.TryGetValue(key, out value!))
                return true;

            foreach (var entry in values) {
                if (!string.Equals(entry.Key, key, StringComparison.OrdinalIgnoreCase))
                    continue;

                value = entry.Value;
                return true;
            }

            value = string.Empty;
            return false;
        }
    }
}