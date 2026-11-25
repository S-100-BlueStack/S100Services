using System.Text.Json;

namespace S100FC.ProductCatalogue.Archive;

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
    /// <param name="findProducts">The existing compilationscale, DataCoverage and exact AOI intersection matcher.</param>
    internal void AddOwner(ArchiveInterval interval, string? informationBindings, string? featureBindings, Func<IReadOnlyList<string>> findProducts) {
        AddOwner(interval, FindTargets(interval, informationBindings, featureBindings), findProducts);
    }

    /// <summary>Filters a lightweight binding row before any shape or compilationscale is fetched.</summary>
    /// <param name="interval">The owner's normalized archive lifetime.</param>
    /// <param name="informationBindings">Optional information references copied from this owner.</param>
    /// <param name="featureBindings">Optional feature references copied from this owner.</param>
    /// <param name="includeIntermediate">Retains owners needed at intermediate comparison boundaries when building reusable history.</param>
    /// <returns>Distinct changed targets referenced by this owner.</returns>
    internal IReadOnlyCollection<ArchiveBindingTarget> FindTargets(ArchiveInterval interval, string? informationBindings, string? featureBindings, bool includeIntermediate = false) {
        var before = interval.Contains(_window.SinceUtc);
        var after = interval.Contains(_window.ThroughUtc);
        // Reusable history must also retain owners that exist only at a later replay boundary.
        var intermediate = includeIntermediate && interval.FromUtc <= _window.ThroughUtc &&
            (!interval.ToUtc.HasValue || interval.ToUtc.Value > _window.SinceUtc);
        if (!before && !after && !intermediate)
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

    /// <summary>Reads referenced S-101 target IDs using the catalogue binding format.</summary>
    /// <param name="bindings">The flattened bindings stored on the source or archive row.</param>
    /// <param name="kind">The target namespace to resolve.</param>
    /// <returns>Distinct target IDs in the specified namespace.</returns>
    /// <exception cref="InvalidOperationException">The bindings cannot be read reliably, so the DPC watermark must stay in place.</exception>
    private static IReadOnlyCollection<ArchiveBindingTarget> ReadTargets(string? bindings, ArchiveBindingKind kind) {
        try {
            // A feature binding with roleType association is omitted by the S-101 exporter.
            IEnumerable<string?> ids = kind == ArchiveBindingKind.Information
                ? AttributeFlattenExtensions.UnflattenInformationBindings(bindings)
                    .Select(binding => binding is null ? throw new JsonException("Expected an information binding.") : binding.informationId)
                : AttributeFlattenExtensions.UnflattenFeatureBindings(bindings)
                    .Where(binding => binding is null || binding.roleType != "association")
                    .Select(binding => binding is null ? throw new JsonException("Expected a feature binding.") : binding.featureId);

            var result = new HashSet<ArchiveBindingTarget>();
            foreach (var target in ids) {
                if (target is null)
                    continue;
                if (!Guid.TryParse(target, out var id) || id == Guid.Empty)
                    throw new JsonException("Expected a nonempty binding target GUID.");
                result.Add(new(kind, id));
            }
            return result;
        }
        catch (Exception exception) when (exception is JsonException or InvalidOperationException or ArgumentException or OverflowException or NotSupportedException or System.Reflection.TargetInvocationException) {
            throw new InvalidOperationException($"DPC cannot resolve incoming {kind} bindings: invalid binding JSON. The watermark and candidates were preserved.", exception);
        }
    }
}
