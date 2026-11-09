namespace S100FC.ProductCatalogue;

/// <summary>Represents one cursor visit, independently of an SDK ObjectID or a feature's identity across archive versions.</summary>
/// <param name="Interval">The normalized lifetime of this archived owner version.</param>
/// <param name="InformationBindings">Information references copied from the current row.</param>
/// <param name="FeatureBindings">Feature references copied from the current row.</param>
/// <param name="FindProducts">Matches the current row's shape and scale; must be invoked before the owner enumerator advances.</param>
/// <param name="Context">Sanitized connection, class and cursor position for classification failures.</param>
internal sealed record ArchiveBindingOwner(ArchiveInterval Interval, string? InformationBindings, string? FeatureBindings, Func<IReadOnlyList<string>> FindProducts, string Context);

/// <summary>Resolves a streaming sequence of archive versions without assuming any native row identifier is unique or available.</summary>
internal static class ArchiveBindingOwnerResolver
{
    /// <summary>Consumes each matched owner immediately, retaining independent historical versions and avoiding native-row callbacks after cursor advancement.</summary>
    /// <param name="index">The invocation's changed targets and endpoint membership accumulator.</param>
    /// <param name="owners">A sequential cursor-backed enumeration; all callbacks are consumed before requesting the next owner.</param>
    /// <param name="cancellationToken">Stops enumeration without returning a completed classification.</param>
    /// <param name="retainOwner">Optional managed-history sink; receives matched products rather than native-row callbacks.</param>
    /// <param name="comparisonBoundsUtc">Exact history endpoints requiring owner versions, including the fixed inclusive cutoff.</param>
    /// <returns>The number of owner versions whose incoming bindings required a spatial match.</returns>
    /// <exception cref="InvalidOperationException">Relevant bindings cannot be classified safely.</exception>
    internal static int Resolve(ArchiveBindingIndex index, IEnumerable<ArchiveBindingOwner> owners, CancellationToken cancellationToken, Action<ArchiveInterval, IReadOnlyCollection<ArchiveBindingTarget>, IReadOnlyList<string>>? retainOwner = null, IReadOnlyCollection<DateTime>? comparisonBoundsUtc = null) {
        cancellationToken.ThrowIfCancellationRequested();
        var matched = 0;
        foreach (var owner in owners) {
            cancellationToken.ThrowIfCancellationRequested();
            if (comparisonBoundsUtc is not null && !comparisonBoundsUtc.Any(owner.Interval.Contains))
                continue;
            IReadOnlyCollection<ArchiveBindingTarget> referenced;
            try {
                referenced = index.FindTargets(owner.Interval, owner.InformationBindings, owner.FeatureBindings, includeIntermediate: retainOwner is not null);
            }
            catch (InvalidOperationException exception) {
                throw new InvalidOperationException($"DPC cannot read incoming bindings: {owner.Context}. The watermark and candidates were preserved.", exception);
            }
            if (referenced.Count == 0) continue;
            // A recycling cursor may replace the row on MoveNext. Only managed results escape this visit.
            var products = owner.FindProducts();
            if (retainOwner is not null)
                retainOwner(owner.Interval, referenced, products);
            else
                index.AddOwner(owner.Interval, referenced, () => products);
            matched++;
        }
        return matched;
    }
}
