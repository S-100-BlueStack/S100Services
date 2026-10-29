using S100FC;
using YamlDotNet.RepresentationModel;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Uses emitted topology identities as evidence for removals; an AOI intersection alone is insufficient.</summary>
internal static class EncSnapshotMembership
{
    /// <summary>Matches source GUIDs to emitted FOIDs, including split feature parts, in a persisted candidate or published snapshot.</summary>
    internal static IReadOnlyCollection<string> FindSourceMembers(string yaml, IEnumerable<string> sourceIds) {
        var stream = new YamlStream();
        using var reader = new StringReader(yaml);
        stream.Load(reader);
        if (stream.Documents.Count != 1 || stream.Documents[0].RootNode is not YamlMappingNode root)
            throw new InvalidOperationException("The prior ENC snapshot is invalid; removal membership cannot be verified.");
        var emitted = new HashSet<string>(StringComparer.Ordinal);
        if (root.Children.TryGetValue(new YamlScalarNode("Features"), out var features) && features is YamlSequenceNode sequence) {
            foreach (var entry in sequence.OfType<YamlMappingNode>()) {
                if (entry.Children.TryGetValue(new YamlScalarNode("Foid"), out var node) && node is YamlScalarNode foid) {
                    var parts = foid.Value?.Split(':');
                    if (parts is { Length: 3 } && parts[0] == "110")
                        emitted.Add(parts[1]);
                }
            }
        }
        return sourceIds.Where(id => emitted.Contains(Guid.Parse(id).ToStableUInt64().ToString(System.Globalization.CultureInfo.InvariantCulture))).ToArray();
    }

    /// <summary>Retains verified cumulative removals which no longer have a FOID in the preceding candidate.</summary>
    internal static IEnumerable<string> ReadSummaryFeatureIds(string summaryYaml) => summaryYaml.Split('\n')
        .Where(line => line.StartsWith("  - featureId: ", StringComparison.Ordinal))
        .Select(line => line["  - featureId: ".Length..].Trim());
}
