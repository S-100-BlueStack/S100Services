using ArcGIS.Core.Geometry;
using S100FC.ProductCatalogue;

namespace TestProductCatalogueAPI;

public sealed class ProductManagerCoverageMatcherTests
{
    public ProductManagerCoverageMatcherTests() => ArcGIS.Core.Hosting.Host.Initialize();

    [Fact]
    public void IncomingBindingsRetainTheOwnersScaleCoverageAndExactAoiIntersectionChecks() {
        var aoi = PolygonBuilderEx.CreatePolygon(EnvelopeBuilderEx.CreateEnvelope(0, 0, 10, 10, SpatialReferences.WGS84));
        var coverage = PolygonBuilderEx.CreatePolygon(EnvelopeBuilderEx.CreateEnvelope(0, 0, 5, 10, SpatialReferences.WGS84));
        var products = new[] {
            new ProductManagerGDB.DpcProductCoverage(new("MATCH", aoi), 1000, [coverage]),
            new ProductManagerGDB.DpcProductCoverage(new("OTHER_SCALE", aoi), 2000, [coverage])
        };
        var at = new DateTime(2026, 10, 29, 10, 0, 0, DateTimeKind.Utc);
        var target = new ArchiveBindingTarget(ArchiveBindingKind.Information, Guid.Parse("ab9b3e89-d57c-47c2-a105-68ebb574db10"));
        var index = new ArchiveBindingIndex([target], new(at.AddHours(-2), at));
        // All three owners have the binding, but only one meets every membership check.
        foreach (var x in new[] { 2, 8, 12 }) {
            var point = MapPointBuilderEx.CreateMapPoint(x, 2, SpatialReferences.WGS84);
            index.AddOwner(new(at.AddHours(-4), null), ArchiveBindingIndexTests.Json(target), null,
                () => ProductManagerGDB.FindAffectedProductsAtScale(point, 1000, products));
        }

        Assert.Equal("MATCH", Assert.Single(index.Affected.Keys));
        Assert.Equal(target, Assert.Single(index.Affected["MATCH"]));
    }

    [Fact]
    public void CoverageScaleComesFromS101AttributeBindings() {
        Assert.Equal(10000, ProductManagerGDB.ReadCoverageScale("{\"optimumDisplayScale\":10000}"));
        Assert.Throws<InvalidOperationException>(() => ProductManagerGDB.ReadCoverageScale("{\"maximumDisplayScale\":10000}"));
    }

    [Fact]
    public void FeatureMustIntersectMatchingScaleCoverageAndProductAoi() {
        var aoi = PolygonBuilderEx.CreatePolygon(EnvelopeBuilderEx.CreateEnvelope(0, 0, 10, 10, SpatialReferences.WGS84));
        var coverage = PolygonBuilderEx.CreatePolygon(EnvelopeBuilderEx.CreateEnvelope(0, 0, 5, 10, SpatialReferences.WGS84));
        var products = new[] {
            new ProductManagerGDB.DpcProductCoverage(new("SCALE_10000", aoi), 10000, [coverage]),
            new ProductManagerGDB.DpcProductCoverage(new("SCALE_20000", aoi), 20000, [coverage])
        };

        Assert.Equal(new[] { "SCALE_10000" }, ProductManagerGDB.FindAffectedProductsAtScale(MapPointBuilderEx.CreateMapPoint(2, 2, SpatialReferences.WGS84), 10000, products));
        Assert.Equal(new[] { "SCALE_20000" }, ProductManagerGDB.FindAffectedProductsAtScale(MapPointBuilderEx.CreateMapPoint(2, 2, SpatialReferences.WGS84), 20000, products));
        Assert.Empty(ProductManagerGDB.FindAffectedProductsAtScale(MapPointBuilderEx.CreateMapPoint(8, 2, SpatialReferences.WGS84), 10000, products));
        Assert.Empty(ProductManagerGDB.FindAffectedProductsAtScale(MapPointBuilderEx.CreateMapPoint(12, 2, SpatialReferences.WGS84), 10000, products));
        var projectedFeature = GeometryEngine.Instance.Project(MapPointBuilderEx.CreateMapPoint(2, 2, SpatialReferences.WGS84), SpatialReferences.WebMercator);
        Assert.Equal(new[] { "SCALE_10000" }, ProductManagerGDB.FindAffectedProductsAtScale(projectedFeature, 10000, products));
    }

    [Fact]
    public void ArchivedDataCoverageStillMarksTheOldAoiAfterMovingOrDeletion() {
        var aoi = PolygonBuilderEx.CreatePolygon(EnvelopeBuilderEx.CreateEnvelope(0, 0, 10, 10, SpatialReferences.WGS84));
        var oldCoverage = PolygonBuilderEx.CreatePolygon(EnvelopeBuilderEx.CreateEnvelope(0, 0, 5, 10, SpatialReferences.WGS84));
        var newCoverage = PolygonBuilderEx.CreatePolygon(EnvelopeBuilderEx.CreateEnvelope(20, 0, 25, 10, SpatialReferences.WGS84));
        var products = new[] { new ProductManagerGDB.DpcProductCoverage(new("OLD", aoi), 10000, [newCoverage]) };

        Assert.Equal(new[] { "OLD" }, ProductManagerGDB.FindAffectedProductsAtScale(oldCoverage, 10000, products, oldCoverage));
        Assert.Empty(ProductManagerGDB.FindAffectedProductsAtScale(oldCoverage, 20000, products, oldCoverage));
    }
}
