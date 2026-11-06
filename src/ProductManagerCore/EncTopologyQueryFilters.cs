using ArcGIS.Core.Data;

namespace S100FC.ProductCatalogue;

/// <summary>Keeps verified ENC snapshot selection independent of feature-class query order.</summary>
internal static class EncTopologyQueryFilters
{
    /// <summary>Adapts legacy helper predicates to the current S-101 feature-class schema.</summary>
    /// <param name="filters">DataCoverage filters, before any topology query executes.</param>
    internal static void UseCompilationScale(IEnumerable<SpatialQueryFilter> filters) {
        foreach (var filter in filters)
            filter.WhereClause = System.Text.RegularExpressions.Regex.Replace(filter.WhereClause ?? string.Empty,
                @"\bnominalscale\b", "compilationscale", System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);
    }

    internal const string InteriorIntersection = "T********";

    internal static void PrepareForVerifiedSnapshot(IEnumerable<SpatialQueryFilter> filters)
    {
        foreach (var filter in filters)
        {
            if (filter.SpatialRelationship == SpatialRelationship.Relation &&
                string.IsNullOrEmpty(filter.SpatialRelationshipDescription))
            {
                // Catalogues.Extensions 3.7.1901.6 leaves the last surface relation on shared
                // filters. An explicit interior intersection also selects contained points,
                // while preserving the original exclusion of boundary-only contacts.
                filter.SpatialRelationshipDescription = InteriorIntersection;
            }
        }
    }
}
