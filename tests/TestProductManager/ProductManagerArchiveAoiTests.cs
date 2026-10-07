using ArcGIS.Core.Geometry;
using S100FC.ProductCatalogue;

namespace TestProductCatalogueAPI;

public sealed class ProductManagerArchiveAoiTests
{
    public ProductManagerArchiveAoiTests() => ArcGIS.Core.Hosting.Host.Initialize();

    [Fact]
    public void GreenlandFeatureAffectsOnlyIntersectingAoi() {
        var products = new[] {
            new ProductManagerGDB.ScanProductAoi("101GL001", PolygonBuilderEx.CreatePolygon(EnvelopeBuilderEx.CreateEnvelope(-53, 64, -51, 66, SpatialReferences.WGS84))),
            new ProductManagerGDB.ScanProductAoi("101DK001", PolygonBuilderEx.CreatePolygon(EnvelopeBuilderEx.CreateEnvelope(8, 54, 14, 58, SpatialReferences.WGS84)))
        };
        var changedFeature = MapPointBuilderEx.CreateMapPoint(-52, 65, SpatialReferences.WGS84);

        Assert.Equal(new[] { "101GL001" }, ProductManagerGDB.FindAffectedProducts(changedFeature, products));
        Assert.Empty(ProductManagerGDB.FindAffectedProducts(MapPointBuilderEx.CreateMapPoint(0, 0, SpatialReferences.WGS84), products));

        // Archive and S-128 geometries can use different spatial references.
        var projectedFeature = GeometryEngine.Instance.Project(changedFeature, SpatialReferences.WebMercator);
        Assert.Equal(new[] { "101GL001" }, ProductManagerGDB.FindAffectedProducts(projectedFeature, products));
    }

    [Fact]
    public void FeatureOnSharedBoundaryAffectsBothProducts() {
        var products = new[] {
            new ProductManagerGDB.ScanProductAoi("WEST", PolygonBuilderEx.CreatePolygon(EnvelopeBuilderEx.CreateEnvelope(0, 0, 1, 1, SpatialReferences.WGS84))),
            new ProductManagerGDB.ScanProductAoi("EAST", PolygonBuilderEx.CreatePolygon(EnvelopeBuilderEx.CreateEnvelope(1, 0, 2, 1, SpatialReferences.WGS84)))
        };

        Assert.Equal(new[] { "WEST", "EAST" }, ProductManagerGDB.FindAffectedProducts(MapPointBuilderEx.CreateMapPoint(1, 0.5, SpatialReferences.WGS84), products));
    }

    [Fact]
    public void ExcessiveFanoutStopsBeforeTheScanCanBuildPackages() {
        var coverage = PolygonBuilderEx.CreatePolygon(EnvelopeBuilderEx.CreateEnvelope(-53, 64, -51, 66, SpatialReferences.WGS84));
        var products = Enumerable.Range(0, ProductManagerGDB.MaxAoisPerArchiveFeature + 1)
            .Select(number => new ProductManagerGDB.ScanProductAoi($"101GL{number:000}", coverage)).ToArray();

        var exception = Assert.Throws<InvalidOperationException>(() => ProductManagerGDB.FindAffectedProducts(MapPointBuilderEx.CreateMapPoint(-52, 65, SpatialReferences.WGS84), products, "feature-1", "LandArea", "surface"));
        Assert.Contains("DPC stopped before creating packages", exception.Message);
    }
}
