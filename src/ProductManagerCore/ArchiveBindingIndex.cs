using System.Text.Json;

namespace S100FC.ProductCatalogue;

/// <summary>Distinguishes the two binding namespaces even if their source GUIDs collide.</summary>
internal enum ArchiveBindingKind { Feature, Information }

/// <summary>Identifies a non-spatial source row by its binding kind and canonical GUID.</summary>
internal readonly record struct ArchiveBindingTarget(ArchiveBindingKind Kind, Guid Id)
{
    internal string SourceId => Id.ToString("B");
}

/// <summary>Collects incoming spatial bindings once per exact archive window, without per-target database queries.</summary>
internal sealed class ArchiveBindingIndex
{
    private readonly HashSet<ArchiveBindingTarget> _targets;
    private readonly ArchiveScanWindow _window;
    private readonly bool _hasInformation;
    private readonly bool _hasFeatures;
    private readonly Dictionary<string, HashSet<ArchiveBindingTarget>> _affected = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, HashSet<ArchiveBindingTarget>> _current = new(StringComparer.OrdinalIgnoreCase);

    internal ArchiveBindingIndex(IEnumerable<ArchiveBindingTarget> changedTargets, ArchiveScanWindow window) {
        _targets = changedTargets.ToHashSet();
        _window = window;
        _hasInformation = _targets.Any(target => target.Kind == ArchiveBindingKind.Information);
        _hasFeatures = _targets.Any(target => target.Kind == ArchiveBindingKind.Feature);
    }

    /// <summary>Exposes distinct affected targets per product across the two endpoint binding states.</summary>
    internal IReadOnlyDictionary<string, HashSet<ArchiveBindingTarget>> Affected => _affected;

    /// <summary>Tests membership at the inclusive cutoff, independently of historical ownership.</summary>
    internal bool IsCurrent(string product, ArchiveBindingTarget target) =>
        _current.TryGetValue(product, out var targets) && targets.Contains(target);

    /// <summary>Reads an owner's endpoint bindings, requesting its geometry/scale match only when a changed target is referenced.</summary>
    /// <param name="interval">Lifetime of this archived spatial owner version.</param>
    /// <param name="informationBindings">The owner's informationBindings JSON, not the target row's fields.</param>
    /// <param name="featureBindings">The owner's featureBindings JSON.</param>
    /// <param name="findProducts">The existing nominalscale, DataCoverage and exact AOI intersection matcher.</param>
    internal void AddOwner(ArchiveInterval interval, string? informationBindings, string? featureBindings, Func<IReadOnlyList<string>> findProducts) {
        AddOwner(interval, FindTargets(interval, informationBindings, featureBindings), findProducts);
    }

    /// <summary>Filters a lightweight binding row before any shape or nominalscale is fetched.</summary>
    internal IReadOnlyCollection<ArchiveBindingTarget> FindTargets(ArchiveInterval interval, string? informationBindings, string? featureBindings) {
        var before = interval.Contains(_window.SinceUtc);
        var after = interval.Contains(_window.ThroughUtc);
        if (!before && !after)
            return [];
        IReadOnlyCollection<ArchiveBindingTarget> information = _hasInformation ? ReadTargets(informationBindings, ArchiveBindingKind.Information) : [];
        IReadOnlyCollection<ArchiveBindingTarget> features = _hasFeatures ? ReadTargets(featureBindings, ArchiveBindingKind.Feature) : [];
        return information.Concat(features).Where(_targets.Contains).Distinct().ToArray();
    }

    /// <summary>Matches a batch-fetched owner once and attaches all its changed targets to the resulting products.</summary>
    internal void AddOwner(ArchiveInterval interval, IReadOnlyCollection<ArchiveBindingTarget> targets, Func<IReadOnlyList<string>> findProducts) {
        var before = interval.Contains(_window.SinceUtc);
        var after = interval.Contains(_window.ThroughUtc);
        if ((!before && !after) || targets.Count == 0)
            return;
        // All changed targets on this owner share one geometry/scale lookup.
        foreach (var product in findProducts()) {
            if (!_affected.TryGetValue(product, out var affected))
                _affected[product] = affected = [];
            affected.UnionWith(targets);
            if (after) {
                if (!_current.TryGetValue(product, out var current))
                    _current[product] = current = [];
                current.UnionWith(targets);
            }
        }
    }

    private static IReadOnlyCollection<ArchiveBindingTarget> ReadTargets(string? json, ArchiveBindingKind kind) {
        if (string.IsNullOrWhiteSpace(json))
            return [];
        try {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind == JsonValueKind.Null)
                return [];
            if (document.RootElement.ValueKind != JsonValueKind.Array)
                throw new JsonException("Expected a binding array.");
            var result = new HashSet<ArchiveBindingTarget>();
            var property = kind == ArchiveBindingKind.Information ? "informationId" : "featureId";
            foreach (var binding in document.RootElement.EnumerateArray()) {
                if (binding.ValueKind != JsonValueKind.Object)
                    throw new JsonException("Expected a binding object.");
                // The actual S101 exporter omits this feature roleType as well.
                if (kind == ArchiveBindingKind.Feature && binding.TryGetProperty("roleType", out var roleType) &&
                    roleType.ValueKind == JsonValueKind.String && roleType.GetString() == "association")
                    continue;
                if (!binding.TryGetProperty(property, out var target) || target.ValueKind == JsonValueKind.Null)
                    continue;
                if (target.ValueKind != JsonValueKind.String || !Guid.TryParse(target.GetString(), out var id) || id == Guid.Empty)
                    throw new JsonException($"Invalid {property}.");
                result.Add(new(kind, id));
            }
            return result;
        }
        catch (JsonException exception) {
            throw new InvalidOperationException($"DPC cannot resolve incoming {kind} bindings: invalid binding JSON. The watermark and candidates were preserved.", exception);
        }
    }
}
