using S100FC.ProductCatalogue;
using S100FC.Topology;
using S100FC.YAML;
using YamlDotNet.RepresentationModel;
using NtsMultiPoint = NetTopologySuite.Geometries.MultiPoint;
using NtsPoint = NetTopologySuite.Geometries.Point;
using YamlDataset = S100FC.YAML.Dataset;

namespace TestProductCatalogueAPI;

public class EncPointGeometryReferenceTests
{
    private const string SourceUid = "00000000-0000-0000-0000-0000000001ab";

    [Theory]
    [InlineData(14.0072643, 54.9692015, 46.0)]
    [InlineData(-180.0, -90.0, 0.0)]
    [InlineData(0.0, 0.0, 100.0)]
    public void Point_UsesTheActualLibraryNameAndPreservesFeatureIdentity(double x, double y, double z)
    {
        var mapping = Assert.Single(TopologyFeatureMapping.Resolve(SourceUid, Primitive.Point, [],
            new Dictionary<string, string>(), []));
        var feature = new Feature { Name = "Wreck", Prim = Primitive.Point,
            Foid = mapping.Foid, Geometry = mapping.Geometry };
        var dataset = new YamlDataset();
        dataset.AddFeature(feature);
        var geometry = new NtsPoint(x, y, z);

        dataset.AddGeometry(geometry, mapping.Geometry);
        EncPointGeometryReferences.Rebind(dataset, geometry, feature);

        Assert.Equal(mapping.Foid, feature.Foid);
        Assert.Equal(Primitive.Point, feature.Prim);
        Assert.Equal(Assert.Single(dataset.Points!).Name, feature.Geometry);
        EncPointGeometryReferences.RequireResolvedPointReferences(dataset);
        AssertSerializedPointReferencesResolve(dataset);
    }

    [Fact]
    public void LibraryOutputWithTheOriginalGuidReference_IsRejectedUntilRebound()
    {
        var dataset = DatasetWithPoint("P761930093");
        var geometry = new NtsMultiPoint([new NtsPoint(14.0072643, 54.9692015, 46)]);
        dataset.AddGeometry(geometry, "P761930093");

        // Reproduce the installed library's missing Feature.Geometry assignment.
        var failure = Assert.Throws<InvalidOperationException>(() =>
            EncPointGeometryReferences.RequireResolvedPointReferences(dataset));
        Assert.Contains("P761930093", failure.Message);

        EncPointGeometryReferences.Rebind(dataset, geometry, Assert.Single(dataset.Features!));

        Assert.Equal(Assert.Single(dataset.Depths!).Name, Assert.Single(dataset.Features!).Geometry);
        EncPointGeometryReferences.RequireResolvedPointReferences(dataset);
        AssertSerializedPointReferencesResolve(dataset);
    }

    [Fact]
    public void Sounding_PreservesEveryCoordinateAndRoundedDepth()
    {
        var dataset = DatasetWithPoint("Psource");
        var geometry = new NtsMultiPoint([
            new NtsPoint(14.0072643, 54.9692015, 46.123456789),
            new NtsPoint(14.0767275, 54.9540945, 45.987654321),
        ]);
        dataset.AddGeometry(geometry, "Psource");
        EncPointGeometryReferences.Rebind(dataset, geometry, dataset.Features!.First());

        var depths = Assert.Single(dataset.Depths!);
        Assert.Equal(2, depths.Points.Length);
        Assert.Equal(14.0072643, depths.Points[0].X);
        Assert.Equal(54.9692015, depths.Points[0].Y);
        Assert.Equal(14.0767275, depths.Points[1].X);
        Assert.Equal(54.9540945, depths.Points[1].Y);
        Assert.Equal(new[] { Math.Round(46.123456789, 7), Math.Round(45.987654321, 7) }, depths.Depths);
        AssertSerializedPointReferencesResolve(dataset);
    }

    [Fact]
    public void CoincidentPoints_PreserveLibraryDeduplicationAndBothFeatureFoids()
    {
        var dataset = DatasetWithPoint("Pfirst");
        dataset.AddFeature(new Feature { Name = "Wreck", Prim = Primitive.Point,
            Foid = "110:2:1", Geometry = "Psecond" });
        var geometry = new NtsPoint(14, 55);
        foreach (var name in new[] { "Pfirst", "Psecond" }) {
            dataset.AddGeometry(geometry, name);
            EncPointGeometryReferences.Rebind(dataset, geometry, dataset.Features!.Single(feature => feature.Geometry == name));
        }

        var point = Assert.Single(dataset.Points!);
        Assert.Equal(new[] { "110:1:1", "110:2:1" }, dataset.Features!.Select(feature => feature.Foid).OrderBy(foid => foid));
        Assert.All(dataset.Features!, feature => Assert.Equal(point.Name, feature.Geometry));
        AssertSerializedPointReferencesResolve(dataset);
    }

    [Fact]
    public void RepeatedBinding_LeavesUnrelatedGeometryAndFeatureAssociationsUnchanged()
    {
        var dataset = DatasetWithPoint("Psource");
        var pointFeature = Assert.Single(dataset.Features!);
        pointFeature.AddFeatureAssociation(new Association { Name = "Wreck", Role = "test", To = "110:2:1" });
        var curveFeature = new Feature { Name = "DepthContour", Prim = Primitive.Curve, Geometry = "C200", Foid = "110:2:1" };
        var surfaceFeature = new Feature { Name = "DepthArea", Prim = Primitive.Surface, Geometry = "S300", Foid = "110:3:1" };
        var unrelatedPoint = new Feature { Name = "Wreck", Prim = Primitive.Point, Geometry = "Punrelated", Foid = "110:4:1" };
        dataset.AddFeature(curveFeature).AddFeature(surfaceFeature).AddFeature(unrelatedPoint);
        var geometry = new NtsPoint(14, 55);
        dataset.AddGeometry(geometry, "Psource");

        EncPointGeometryReferences.Rebind(dataset, geometry, pointFeature);
        var name = pointFeature.Geometry;
        EncPointGeometryReferences.Rebind(dataset, geometry, pointFeature);

        Assert.Equal(name, pointFeature.Geometry);
        Assert.Equal("110:2:1", Assert.Single(pointFeature.FeatureAssociation!).To);
        Assert.Equal("C200", curveFeature.Geometry);
        Assert.Equal("S300", surfaceFeature.Geometry);
        Assert.Equal("Punrelated", unrelatedPoint.Geometry);
    }

    [Fact]
    public void FinalNameMatchingAnotherTemporaryName_DoesNotRebindTheWrongFeature()
    {
        var dataset = DatasetWithPoint("Pfirst");
        var first = Assert.Single(dataset.Features!);
        var firstGeometry = new NtsPoint(14, 55);
        dataset.AddGeometry(firstGeometry, "Pfirst");
        var firstName = Assert.Single(dataset.Points!).Name;
        var second = new Feature { Name = "Wreck", Prim = Primitive.Point,
            Foid = "110:2:1", Geometry = firstName };
        dataset.AddFeature(second);

        EncPointGeometryReferences.Rebind(dataset, firstGeometry, first);
        var secondGeometry = new NtsPoint(15, 56);
        dataset.AddGeometry(secondGeometry, firstName!);
        EncPointGeometryReferences.Rebind(dataset, secondGeometry, second);

        Assert.Equal(firstName, first.Geometry);
        Assert.NotEqual(first.Geometry, second.Geometry);
        AssertSerializedPointReferencesResolve(dataset);
    }

    [Fact]
    public void MissingEmittedGeometry_FailsBeforeChangingTheFeatureReference()
    {
        var dataset = DatasetWithPoint("Psource");

        Assert.Throws<InvalidOperationException>(() =>
            EncPointGeometryReferences.Rebind(dataset, new NtsPoint(14, 55), Assert.Single(dataset.Features!)));

        Assert.Equal("Psource", Assert.Single(dataset.Features!).Geometry);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("Pmissing")]
    public void FinalVerification_RejectsMissingPointDefinitions(string? name)
    {
        var dataset = DatasetWithPoint(name);

        Assert.Throws<InvalidOperationException>(() =>
            EncPointGeometryReferences.RequireResolvedPointReferences(dataset));
    }

    [Fact]
    public void FinalVerification_AcceptsNoGeometryFeatures()
    {
        var dataset = new YamlDataset();
        dataset.AddFeature(new Feature { Name = "TestFeature", Prim = Primitive.NoGeometry, Foid = "110:1:1" });

        EncPointGeometryReferences.RequireResolvedPointReferences(dataset);
    }

    [Fact]
    public void PointReference_RemainsResolvedAfterTopologyAddsCurveEndpoints()
    {
        var dataset = DatasetWithPoint("Psource");
        var geometry = new NtsPoint(14, 55);
        dataset.AddGeometry(geometry, "Psource");
        EncPointGeometryReferences.Rebind(dataset, geometry, dataset.Features!.First());
        var name = Assert.Single(dataset.Features!).Geometry;
        var line = new NetTopologySuite.Geometries.GeometryFactory().CreateLineString([
            new NetTopologySuite.Geometries.Coordinate(14, 55),
            new NetTopologySuite.Geometries.Coordinate(15, 56),
        ]);

        dataset.AddTopology(new TestMatrix { Curves = [new CurveFeature(line, 200)] });

        Assert.Equal(name, Assert.Single(dataset.Features!).Geometry);
        Assert.Single(dataset.Curves!);
        EncPointGeometryReferences.RequireResolvedPointReferences(dataset);
        AssertSerializedPointReferencesResolve(dataset);
    }

    private static YamlDataset DatasetWithPoint(string? name)
    {
        var dataset = new YamlDataset();
        dataset.AddFeature(new Feature { Name = "Sounding", Prim = Primitive.Point,
            Foid = "110:1:1", Geometry = name });
        return dataset;
    }

    private static void AssertSerializedPointReferencesResolve(YamlDataset dataset)
    {
        var stream = new YamlStream();
        stream.Load(new StringReader(dataset.Serialize()));
        var root = (YamlMappingNode)stream.Documents[0].RootNode;
        var names = new HashSet<string>(StringComparer.Ordinal);
        foreach (var collection in new[] { "Points", "Depths" }) {
            if (root.Children.TryGetValue(new YamlScalarNode(collection), out var node) && node is YamlSequenceNode sequence) {
                foreach (YamlMappingNode geometry in sequence)
                    names.Add(((YamlScalarNode)geometry.Children[new YamlScalarNode("Name")]).Value!);
            }
        }
        var features = (YamlSequenceNode)root.Children[new YamlScalarNode("Features")];
        foreach (YamlMappingNode feature in features) {
            if (((YamlScalarNode)feature.Children[new YamlScalarNode("Prim")]).Value == "Point")
                Assert.Contains(((YamlScalarNode)feature.Children[new YamlScalarNode("Geometry")]).Value!, names);
        }
    }

    private sealed class TestMatrix : IMatrix
    {
        public IEnumerable<CurveFeature> Curves { get; init; } = [];
        public IEnumerable<CompositeCurveFeature> CompositeCurves { get; init; } = [];
        public IEnumerable<SurfaceFeature> Surfaces { get; init; } = [];
        public IDictionary<string, string> MappingFOID { get; init; } = new Dictionary<string, string>();
        public ICollection<string> Collapse { get; init; } = [];
        public string[] NetworkTopology { get; init; } = [];
    }
}
