namespace S100FC.ProductCatalogue;

/// <summary>Preserves content and selection differences between the two archive endpoint states.</summary>
internal static class ArchiveChangeComposer
{
    /// <summary>Composes a source change without treating the most recent intermediate version as either endpoint.</summary>
    /// <param name="before">The row at the exclusive lower bound, or null before creation.</param>
    /// <param name="after">The row at the inclusive cutoff, or null after deletion.</param>
    /// <param name="latest">The latest observed row, supplying feature identity after deletion.</param>
    /// <param name="latestEditUtc">The most recent event within the fixed archive window.</param>
    /// <param name="geometryChanged">Whether the two endpoint shapes differ.</param>
    /// <returns>Content and scale selection differences for this exact window.</returns>
    internal static ArchiveRow Compose(ArchiveRow? before, ArchiveRow? after, ArchiveRow latest, DateTime latestEditUtc, bool geometryChanged) => new() {
        Code = (after ?? latest).Code,
        AttributeBindings = after?.AttributeBindings,
        FeatureBindings = after?.FeatureBindings,
        InformationBindings = after?.InformationBindings,
        BeforeCode = before?.Code,
        BeforeAttributeBindings = before?.AttributeBindings,
        BeforeFeatureBindings = before?.FeatureBindings,
        BeforeInformationBindings = before?.InformationBindings,
        BeforeNominalScale = before?.NominalScale,
        NominalScale = after?.NominalScale,
        GeometryChanged = geometryChanged,
        Deleted = after is null,
        EditDate = latestEditUtc
    };
}
