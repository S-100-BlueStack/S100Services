using ArcGIS.Core.Data;

namespace S100FC.ProductCatalogue;

/// <summary>Keeps verified ENC snapshot selection independent of feature-class query order.</summary>
internal static class EncTopologyQueryFilters
{
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
