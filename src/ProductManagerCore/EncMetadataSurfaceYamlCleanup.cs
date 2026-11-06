using System.Text;
using System.Text.RegularExpressions;

namespace S100FC.ProductCatalogue;

/// <summary>
/// Omits only serialized surface records belonging to explicitly suppressed ENC
/// metadata features. All curves, composite curves, points and retained surfaces
/// remain untouched; the serializer owns the only durable topology representation.
/// </summary>
public static class EncMetadataSurfaceYamlCleanup
{
    private static readonly Regex SurfaceHeader = new(@"(?m)^Surfaces:\r?$", RegexOptions.CultureInvariant);
    private static readonly Regex FeatureHeader = new(@"(?m)^Features:\r?$", RegexOptions.CultureInvariant);
    private static readonly Regex SurfaceEntry = new(@"(?m)^  - Name: (?<name>[^\r\n]+)\r?$", RegexOptions.CultureInvariant);
    private static readonly Regex SurfaceName = new(@"^S[A-Za-z0-9_-]+$", RegexOptions.CultureInvariant);
    private static readonly Regex UnexpectedSurfaceItem = new(@"(?m)^  - (?!Name: )[^\r\n]*", RegexOptions.CultureInvariant);
    private static readonly Regex TopLevelHeader = new(@"(?m)^[A-Za-z][A-Za-z0-9_]*:\r?$", RegexOptions.CultureInvariant);

    /// <summary>
    /// Return identical YAML when no metadata was suppressed. Otherwise remove
    /// only exact listed surface records after proving there are no other references.
    /// Throws before publishing an invalid or ambiguously modified export snapshot.
    /// </summary>
    public static string RemoveSuppressedSurfaces(string yaml, IReadOnlyCollection<string> suppressedSurfaces)
    {
        ArgumentNullException.ThrowIfNull(yaml);
        ArgumentNullException.ThrowIfNull(suppressedSurfaces);
        if (suppressedSurfaces.Count == 0)
            return yaml;
        if (string.IsNullOrWhiteSpace(yaml))
            throw new InvalidDataException("ENC topology cleanup received an empty YAML snapshot.");

        var toRemove = suppressedSurfaces.ToHashSet(StringComparer.Ordinal);
        if (toRemove.Any(name => string.IsNullOrWhiteSpace(name) || !SurfaceName.IsMatch(name)))
            throw new InvalidDataException("ENC topology cleanup received an invalid suppressed surface identity.");

        var surfaceHeaders = SurfaceHeader.Matches(yaml);
        var featureHeaders = FeatureHeader.Matches(yaml);
        if (surfaceHeaders.Count != 1 || featureHeaders.Count != 1 ||
            featureHeaders[0].Index <= surfaceHeaders[0].Index)
            throw new InvalidDataException("ENC topology cleanup requires unique Surfaces and Features YAML sections.");

        var sectionStart = surfaceHeaders[0].Index + surfaceHeaders[0].Length;
        if (sectionStart >= yaml.Length || yaml[sectionStart] != '\n')
            throw new InvalidDataException("ENC topology cleanup could not determine the Surfaces YAML boundary.");
        sectionStart++;
        var sectionEnd = featureHeaders[0].Index;
        var section = yaml[sectionStart..sectionEnd];
        if (TopLevelHeader.IsMatch(section))
            throw new InvalidDataException("ENC topology cleanup encountered an unexpected YAML section between Surfaces and Features.");

        var entries = SurfaceEntry.Matches(section);
        if (UnexpectedSurfaceItem.IsMatch(section) || entries.Count == 0 ||
            entries.Count <= toRemove.Count || !string.IsNullOrWhiteSpace(section[..entries[0].Index]))
            throw new InvalidDataException("ENC topology cleanup cannot identify surface list items safely.");

        var found = new HashSet<string>(StringComparer.Ordinal);
        var removed = new List<(int Start, int End, string Name)>();
        for (var index = 0; index < entries.Count; index++) {
            var match = entries[index];
            var name = match.Groups["name"].Value;
            if (!SurfaceName.IsMatch(name) || !found.Add(name))
                throw new InvalidDataException($"ENC topology cleanup found an invalid or duplicate surface '{name}'.");
            if (!toRemove.Contains(name))
                continue;
            var start = sectionStart + match.Index;
            var end = index + 1 < entries.Count ? sectionStart + entries[index + 1].Index : sectionEnd;
            var item = yaml[start..end];
            if (!item.Contains("\n    Exterior:", StringComparison.Ordinal))
                throw new InvalidDataException($"ENC topology cleanup cannot verify the geometry of surface '{name}'.");
            removed.Add((start, end, name));
        }
        if (!toRemove.SetEquals(removed.Select(entry => entry.Name)))
            throw new InvalidDataException("An explicitly suppressed ENC metadata surface is missing from serialized topology.");

        // Check the entire remaining document, not just Feature.Geometry. A surface
        // may be referenced by additional feature types or future public YAML fields.
        foreach (var entry in removed) {
            var remaining = yaml[..entry.Start] + yaml[entry.End..];
            var pattern = $@"(?<![A-Za-z0-9_-]){Regex.Escape(entry.Name)}(?![A-Za-z0-9_-])";
            // Other suppressed surface entries are still present at this point.
            // They must not reference the candidate either; a reference there also
            // makes this check fail rather than permitting unsafe cascading removal.
            if (Regex.IsMatch(remaining, pattern, RegexOptions.CultureInvariant))
                throw new InvalidDataException($"ENC surface '{entry.Name}' is referenced outside its suppressed metadata record.");
        }

        var output = new StringBuilder(yaml.Length);
        var offset = 0;
        foreach (var entry in removed.OrderBy(entry => entry.Start)) {
            output.Append(yaml, offset, entry.Start - offset);
            offset = entry.End;
        }
        output.Append(yaml, offset, yaml.Length - offset);
        return output.ToString();
    }
}
