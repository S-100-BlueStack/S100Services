using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using S100FC.ProductCatalogue;
using S100FC.Topology;
using S100FC.YAML;
using YamlDataset = S100FC.YAML.Dataset;

namespace TestProductCatalogueAPI;

public sealed class EncMetadataCoverageNormalizerTests
{
    private static readonly WKTReader Reader = new();

    [Theory]
    [InlineData("DataCoverage")]
    [InlineData("SoundingDatum")]
    [InlineData("VerticalDatumOfData")]
    public void ContainedEquivalentMetadataRetainsTheCompleteCoverage(string type)
    {
        var regions = new[] {
            Region("110:2:1", type, "datum=44", "POLYGON ((1 1, 9 1, 9 9, 1 9, 1 1))"),
            Region("110:1:1", type, "datum=44", "POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))")
        };

        var removed = EncMetadataCoverageNormalizer.FindRedundantRegions(regions);

        Assert.Equal(new[] { "110:2:1" }, removed.OrderBy(value => value));
        var kept = regions.Where(region => !removed.Contains(region.Foid)).Select(region => region.Footprint).ToArray();
        Assert.Single(kept);
        Assert.Equal(regions[1].Footprint.Area, kept[0].Area);
        Assert.True(kept[0].Covers(regions[0].Footprint));
    }

    [Fact]
    public void IdenticalFootprintsSelectOneStableFoidRegardlessOfInputOrder()
    {
        var original = new[] {
            Region("110:12:1", "SoundingDatum", "datum=44", "POLYGON ((0 0, 2 0, 2 2, 0 2, 0 0))"),
            Region("110:11:1", "SoundingDatum", "datum=44", "POLYGON ((0 0, 2 0, 2 2, 0 2, 0 0))")
        };

        Assert.Equal(new[] { "110:12:1" }, EncMetadataCoverageNormalizer.FindRedundantRegions(original));
        Assert.Equal(new[] { "110:12:1" }, EncMetadataCoverageNormalizer.FindRedundantRegions(original.Reverse().ToArray()));
    }

    [Fact]
    public void ThreeNestedRegionsRetainOnlyTheLargestAndAllCoveredPoints()
    {
        var regions = new[] {
            Region("A", "SoundingDatum", "datum=44", "POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))"),
            Region("B", "SoundingDatum", "datum=44", "POLYGON ((1 1, 9 1, 9 9, 1 9, 1 1))"),
            Region("C", "SoundingDatum", "datum=44", "POLYGON ((2 2, 8 2, 8 8, 2 8, 2 2))")
        };
        var point = Reader.Read("POINT (5 5)");
        Assert.Equal(3, regions.Count(region => region.Footprint.Covers(point)));

        var removed = EncMetadataCoverageNormalizer.FindRedundantRegions(regions);

        Assert.Equal(new[] { "B", "C" }, removed.OrderBy(value => value));
        Assert.Single(regions.Where(region => !removed.Contains(region.Foid) && region.Footprint.Covers(point)));
    }

    [Fact]
    public void PartiallyOverlappingInnerRegionsCanBothBeSuppressedByOneContainingRegion()
    {
        var regions = new[] {
            Region("A", "SoundingDatum", "datum=44", "POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))"),
            Region("B", "SoundingDatum", "datum=44", "POLYGON ((1 1, 6 1, 6 6, 1 6, 1 1))"),
            Region("C", "SoundingDatum", "datum=44", "POLYGON ((4 4, 9 4, 9 9, 4 9, 4 4))")
        };

        Assert.Equal(new[] { "B", "C" }, EncMetadataCoverageNormalizer.FindRedundantRegions(regions).OrderBy(value => value));
    }

    [Fact]
    public void DisjointAndBoundaryTouchingRegionsRemainSeparate()
    {
        var regions = new[] {
            Region("A", "DataCoverage", "scale=180000", "POLYGON ((0 0, 2 0, 2 2, 0 2, 0 0))"),
            Region("B", "DataCoverage", "scale=180000", "POLYGON ((2 0, 4 0, 4 2, 2 2, 2 0))"),
            Region("C", "DataCoverage", "scale=180000", "POLYGON ((6 0, 8 0, 8 2, 6 2, 6 0))")
        };

        Assert.Empty(EncMetadataCoverageNormalizer.FindRedundantRegions(regions));
    }

    [Fact]
    public void DifferentFeatureClassesAreNotMergedEvenWhenGeometryAndAttributesMatch()
    {
        var regions = new[] {
            Region("A", "DataCoverage", "value=44", "POLYGON ((0 0, 2 0, 2 2, 0 2, 0 0))"),
            Region("B", "SoundingDatum", "value=44", "POLYGON ((0 0, 2 0, 2 2, 0 2, 0 0))")
        };

        Assert.Empty(EncMetadataCoverageNormalizer.FindRedundantRegions(regions));
    }

    [Theory]
    [InlineData("datum=44", "datum=45")]
    [InlineData("scale=90000", "scale=180000")]
    [InlineData("", "datum=44")]
    public void OverlappingDifferentOrMissingSemanticsFailClosed(string first, string second)
    {
        var regions = new[] {
            Region("A", "SoundingDatum", first, "POLYGON ((0 0, 4 0, 4 4, 0 4, 0 0))"),
            Region("B", "SoundingDatum", second, "POLYGON ((1 1, 2 1, 2 2, 1 2, 1 1))")
        };

        Assert.Throws<InvalidDataException>(() => EncMetadataCoverageNormalizer.FindRedundantRegions(regions));
    }

    [Fact]
    public void PartialOverlapFailsRatherThanDiscardingTheExclusiveArea()
    {
        var regions = new[] {
            Region("A", "DataCoverage", "scale=180000", "POLYGON ((0 0, 5 0, 5 5, 0 5, 0 0))"),
            Region("B", "DataCoverage", "scale=180000", "POLYGON ((4 0, 9 0, 9 5, 4 5, 4 0))")
        };

        Assert.Throws<EncMetadataCoverageNormalizer.PartialOverlapRequiresPartitionException>(
            () => EncMetadataCoverageNormalizer.FindRedundantRegions(regions));
    }

    [Fact]
    public void PartialOverlapPreservesAllPendingMetadataAndNonMetadataFeatures()
    {
        var dataset = new YamlDataset();
        var sounding = new Feature { Foid = "S", Name = "Sounding", Prim = Primitive.Point, Geometry = "P1" };
        var first = new Feature { Foid = "A", Name = "DataCoverage", Prim = Primitive.Surface, Geometry = "S1" };
        var second = new Feature { Foid = "B", Name = "DataCoverage", Prim = Primitive.Surface, Geometry = "S2" };
        dataset.AddFeature(sounding);
        var regions = new[] {
            Region("A", "DataCoverage", "scale=180000", "POLYGON ((0 0, 5 0, 5 5, 0 5, 0 0))"),
            Region("B", "DataCoverage", "scale=180000", "POLYGON ((4 0, 9 0, 9 5, 4 5, 4 0))")
        };

        var result = EncMetadataCoverageNormalizer.Apply(dataset, [first, second], regions);

        Assert.True(result.SkippedPartialOverlap);
        Assert.NotNull(result.SkipReason);
        Assert.Contains("Partially overlapping", result.SkipReason!);
        Assert.Equal(0, result.TotalRemoved);
        Assert.Equal(3, dataset.Features!.Count);
        Assert.Same(first, dataset.Features!.Single(feature => feature.Foid == "A"));
        Assert.Same(second, dataset.Features!.Single(feature => feature.Foid == "B"));
        Assert.Same(sounding, dataset.Features!.Single(feature => feature.Foid == "S"));
    }

    [Fact]
    public void PartialOverlapDoesNotApplyAnEarlierContainedSuppression()
    {
        var dataset = new YamlDataset();
        var pending = new[] {
            new Feature { Foid = "A", Name = "DataCoverage", Prim = Primitive.Surface, Geometry = "S1" },
            new Feature { Foid = "B", Name = "DataCoverage", Prim = Primitive.Surface, Geometry = "S2" },
            new Feature { Foid = "C", Name = "SoundingDatum", Prim = Primitive.Surface, Geometry = "S3" },
            new Feature { Foid = "D", Name = "SoundingDatum", Prim = Primitive.Surface, Geometry = "S4" }
        };
        var regions = new[] {
            Region("A", "DataCoverage", "scale=180000", "POLYGON ((0 0, 5 0, 5 5, 0 5, 0 0))"),
            Region("B", "DataCoverage", "scale=180000", "POLYGON ((4 0, 9 0, 9 5, 4 5, 4 0))"),
            Region("C", "SoundingDatum", "datum=44", "POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))"),
            Region("D", "SoundingDatum", "datum=44", "POLYGON ((2 2, 4 2, 4 4, 2 4, 2 2))")
        };

        var result = EncMetadataCoverageNormalizer.Apply(dataset, pending, regions);

        Assert.True(result.SkippedPartialOverlap);
        Assert.Equal(0, result.TotalRemoved);
        Assert.Equal(4, dataset.Features!.Count);
        Assert.Equal(new[] { "A", "B", "C", "D" }, dataset.Features!.Select(feature => feature.Foid!).OrderBy(foid => foid, StringComparer.Ordinal).ToArray());
    }

    [Fact]
    public void PartialOverlapMustNotConcealConflictingMetadata()
    {
        var dataset = new YamlDataset();
        var pending = new[] {
            new Feature { Foid = "A", Name = "SoundingDatum", Prim = Primitive.Surface },
            new Feature { Foid = "B", Name = "SoundingDatum", Prim = Primitive.Surface },
            new Feature { Foid = "C", Name = "SoundingDatum", Prim = Primitive.Surface }
        };
        var regions = new[] {
            Region("A", "SoundingDatum", "datum=44", "POLYGON ((0 0, 5 0, 5 5, 0 5, 0 0))"),
            Region("B", "SoundingDatum", "datum=44", "POLYGON ((4 0, 9 0, 9 5, 4 5, 4 0))"),
            Region("C", "SoundingDatum", "datum=45", "POLYGON ((1 1, 2 1, 2 2, 1 2, 1 1))")
        };

        Assert.Throws<InvalidDataException>(() => EncMetadataCoverageNormalizer.Apply(dataset, pending, regions));
        Assert.Empty(dataset.Features ?? Array.Empty<Feature>());
    }

    [Fact]
    public void PartialOverlapCannotConcealConflictInAnotherMetadataClass()
    {
        var dataset = new YamlDataset();
        var pending = new[] {
            new Feature { Foid = "A", Name = "DataCoverage", Prim = Primitive.Surface },
            new Feature { Foid = "B", Name = "DataCoverage", Prim = Primitive.Surface },
            new Feature { Foid = "C", Name = "SoundingDatum", Prim = Primitive.Surface },
            new Feature { Foid = "D", Name = "SoundingDatum", Prim = Primitive.Surface }
        };
        var regions = new[] {
            Region("A", "DataCoverage", "scale=180000", "POLYGON ((0 0, 5 0, 5 5, 0 5, 0 0))"),
            Region("B", "DataCoverage", "scale=180000", "POLYGON ((4 0, 9 0, 9 5, 4 5, 4 0))"),
            Region("C", "SoundingDatum", "datum=44", "POLYGON ((0 0, 3 0, 3 3, 0 3, 0 0))"),
            Region("D", "SoundingDatum", "datum=45", "POLYGON ((1 1, 4 1, 4 4, 1 4, 1 1))")
        };

        Assert.Throws<InvalidDataException>(() => EncMetadataCoverageNormalizer.Apply(dataset, pending, regions));
        Assert.Empty(dataset.Features ?? Array.Empty<Feature>());
    }

    [Fact]
    public void PartialOverlapWithAdditionalContainmentDefersWholePlan()
    {
        var regions = new[] {
            Region("A", "SoundingDatum", "datum=44", "POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))"),
            Region("B", "SoundingDatum", "datum=44", "POLYGON ((9 0, 14 0, 14 10, 9 10, 9 0))"),
            Region("C", "SoundingDatum", "datum=44", "POLYGON ((8 2, 10 2, 10 4, 8 4, 8 2))")
        };

        // The first two cannot be partitioned by feature removal; the third is
        // wholly contained, but the final plan must still be deferred as a unit.
        var dataset = new YamlDataset();
        var pending = regions.Select(region => new Feature {
            Foid = region.Foid, Name = region.FeatureType, Prim = Primitive.Surface
        }).ToArray();
        var result = EncMetadataCoverageNormalizer.Apply(dataset, pending, regions);

        Assert.True(result.SkippedPartialOverlap);
        Assert.Equal(3, dataset.Features!.Count);
    }

    [Fact]
    public void DifferentMasksAreNotTreatedAsEquivalent()
    {
        var region = Region("A", "SoundingDatum", "datum=44", "POLYGON ((0 0, 5 0, 5 5, 0 5, 0 0))");
        var other = Region("B", "SoundingDatum", "datum=44", "POLYGON ((1 1, 2 1, 2 2, 1 2, 1 1))") with { Masks = "C123:1" };

        Assert.Throws<InvalidDataException>(() => EncMetadataCoverageNormalizer.FindRedundantRegions([region, other]));
    }

    [Fact]
    public void SurfaceParserReconstructsAnEmittedPolygon()
    {
        var dataset = new YamlDataset();
        dataset.AddCurve(new S100FC.YAML.Curve([
            new S100FC.YAML.Coordinate(0, 0), new S100FC.YAML.Coordinate(4, 0),
            new S100FC.YAML.Coordinate(4, 4), new S100FC.YAML.Coordinate(0, 4),
            new S100FC.YAML.Coordinate(0, 0)
        ]) { Name = "C1" });
        dataset.AddSurface(new S100FC.YAML.Surface("C1") { Name = "S1" });

        var polygon = EncMetadataCoverageNormalizer.ReadSurfaceGeometry(dataset, "S1");

        Assert.True(polygon.IsValid);
        Assert.Equal(16, polygon.Area);
        Assert.True(polygon.Covers(Reader.Read("POINT (2 2)")));
        Assert.False(polygon.Covers(Reader.Read("POINT (5 5)")));
    }

    [Fact]
    public void SurfaceParserRespectsReverseCompositeCurveComponents()
    {
        var dataset = new YamlDataset();
        dataset.AddCurve(new S100FC.YAML.Curve([
            new S100FC.YAML.Coordinate(0, 0), new S100FC.YAML.Coordinate(4, 0)
        ]) { Name = "C1" });
        dataset.AddCurve(new S100FC.YAML.Curve([
            new S100FC.YAML.Coordinate(4, 4), new S100FC.YAML.Coordinate(4, 0)
        ]) { Name = "C2" });
        dataset.AddCurve(new S100FC.YAML.Curve([
            new S100FC.YAML.Coordinate(4, 4), new S100FC.YAML.Coordinate(0, 4)
        ]) { Name = "C3" });
        dataset.AddCurve(new S100FC.YAML.Curve([
            new S100FC.YAML.Coordinate(0, 4), new S100FC.YAML.Coordinate(0, 0)
        ]) { Name = "C4" });
        dataset.AddCompositeCurve(new S100FC.YAML.CompositeCurve("C1,RC2,C3,C4") { Name = "C5" });
        dataset.AddSurface(new S100FC.YAML.Surface("C5") { Name = "S5" });

        var polygon = EncMetadataCoverageNormalizer.ReadSurfaceGeometry(dataset, "S5");

        Assert.True(polygon.IsValid);
        Assert.Equal(16, polygon.Area);
    }

    [Fact]
    public void SurfaceParserRejectsMissingTopologyReferences()
    {
        var dataset = new YamlDataset();
        dataset.AddSurface(new S100FC.YAML.Surface("Cmissing") { Name = "S5" });

        Assert.Throws<InvalidDataException>(() => EncMetadataCoverageNormalizer.ReadSurfaceGeometry(dataset, "S5"));
    }

    [Fact]
    public void NormalizeUsesCanonicalSourceBindingsAndActualSurfaceGeometry()
    {
        var (dataset, outer, inner) = MetadataWithTopology();
        var bindings = new Dictionary<Feature, string>(ReferenceEqualityComparer.Instance) {
            [outer] = "{\"verticalDatum\":44,\"note\":\"Baltic\"}",
            [inner] = "{\"note\":\"Baltic\",\"verticalDatum\":44}"
        };

        var result = EncMetadataCoverageNormalizer.Normalize(dataset, [outer, inner], bindings);

        Assert.Equal(1, result.RemovedSoundingDatum);
        Assert.Same(outer, Assert.Single(dataset.Features!));
        Assert.DoesNotContain(dataset.Features!, feature => feature.Foid == inner.Foid);
    }

    [Fact]
    public void NormalizeExposesExactSuppressedSurfaceReferencesForSerializerCleanup()
    {
        var (dataset, outer, inner) = MetadataWithTopology();
        var bindings = new Dictionary<Feature, string>(ReferenceEqualityComparer.Instance) {
            [outer] = "{\"verticalDatum\":44}", [inner] = "{\"verticalDatum\":44}"
        };

        var result = EncMetadataCoverageNormalizer.Normalize(dataset, [inner, outer], bindings);

        Assert.Equal(1, result.RemovedSoundingDatum);
        Assert.Equal(new[] { "S2" }, result.SuppressedSurfaceNames);
        Assert.Equal(new[] { "S1" }, dataset.Features!.Select(feature => feature.Geometry));
    }

    [Fact]
    public void NormalizeRetainsPartiallyOverlappingEmittedCoverageSurfaces()
    {
        var dataset = new YamlDataset();
        dataset.AddCurve(new S100FC.YAML.Curve([
            new S100FC.YAML.Coordinate(0, 0), new S100FC.YAML.Coordinate(5, 0),
            new S100FC.YAML.Coordinate(5, 5), new S100FC.YAML.Coordinate(0, 5),
            new S100FC.YAML.Coordinate(0, 0)
        ]) { Name = "C1" });
        dataset.AddCurve(new S100FC.YAML.Curve([
            new S100FC.YAML.Coordinate(4, 0), new S100FC.YAML.Coordinate(9, 0),
            new S100FC.YAML.Coordinate(9, 5), new S100FC.YAML.Coordinate(4, 5),
            new S100FC.YAML.Coordinate(4, 0)
        ]) { Name = "C2" });
        dataset.AddSurface(new S100FC.YAML.Surface("C1") { Name = "S1" });
        dataset.AddSurface(new S100FC.YAML.Surface("C2") { Name = "S2" });
        var first = new Feature { Foid = "A", Name = "DataCoverage", Prim = Primitive.Surface, Geometry = "S1" };
        var second = new Feature { Foid = "B", Name = "DataCoverage", Prim = Primitive.Surface, Geometry = "S2" };
        var bindings = new Dictionary<Feature, string>(ReferenceEqualityComparer.Instance) {
            [first] = "{\"maximumDisplayScale\":180000}",
            [second] = "{\"maximumDisplayScale\":180000}"
        };

        var result = EncMetadataCoverageNormalizer.Normalize(dataset, [first, second], bindings);

        Assert.True(result.SkippedPartialOverlap);
        Assert.Equal(0, result.TotalRemoved);
        Assert.Equal(2, dataset.Features!.Count);
        Assert.Same(first, dataset.Features!.Single(feature => feature.Foid == "A"));
        Assert.Same(second, dataset.Features!.Single(feature => feature.Foid == "B"));
        Assert.Equal("S1", first.Geometry);
        Assert.Equal("S2", second.Geometry);
    }

    [Fact]
    public void NormalizeAddsSinglePendingMetadataThroughDatasetMutationApi()
    {
        var (dataset, outer, _) = MetadataWithTopology();
        var result = EncMetadataCoverageNormalizer.Normalize(dataset, [outer]);

        Assert.Equal(0, result.TotalRemoved);
        Assert.Same(outer, Assert.Single(dataset.Features!));
        Assert.Equal("A", Assert.Single(dataset.Features!).Foid);
    }

    [Fact]
    public void NormalizeRefusesOverlappingDifferentSourceDatumValues()
    {
        var (dataset, outer, inner) = MetadataWithTopology();
        var bindings = new Dictionary<Feature, string>(ReferenceEqualityComparer.Instance) {
            [outer] = "{\"verticalDatum\":44}", [inner] = "{\"verticalDatum\":45}"
        };

        Assert.Throws<InvalidDataException>(() => EncMetadataCoverageNormalizer.Normalize(dataset, [outer, inner], bindings));
        Assert.Empty(dataset.Features ?? Array.Empty<Feature>());
    }

    private static (YamlDataset Dataset, Feature Outer, Feature Inner) MetadataWithTopology()
    {
        var dataset = new YamlDataset();
        dataset.AddCurve(new S100FC.YAML.Curve([
            new S100FC.YAML.Coordinate(0, 0), new S100FC.YAML.Coordinate(10, 0),
            new S100FC.YAML.Coordinate(10, 10), new S100FC.YAML.Coordinate(0, 10),
            new S100FC.YAML.Coordinate(0, 0)
        ]) { Name = "C1" });
        dataset.AddCurve(new S100FC.YAML.Curve([
            new S100FC.YAML.Coordinate(1, 1), new S100FC.YAML.Coordinate(9, 1),
            new S100FC.YAML.Coordinate(9, 9), new S100FC.YAML.Coordinate(1, 9),
            new S100FC.YAML.Coordinate(1, 1)
        ]) { Name = "C2" });
        dataset.AddSurface(new S100FC.YAML.Surface("C1") { Name = "S1" });
        dataset.AddSurface(new S100FC.YAML.Surface("C2") { Name = "S2" });
        var outer = new Feature { Name = "SoundingDatum", Foid = "A", Geometry = "S1", Prim = Primitive.Surface };
        var inner = new Feature { Name = "SoundingDatum", Foid = "B", Geometry = "S2", Prim = Primitive.Surface };
        return (dataset, outer, inner);
    }

    [Fact]
    public void NormalizeRejectsMetadataThatWasAlreadyCommitted()
    {
        var (dataset, outer, inner) = MetadataWithTopology();
        dataset.AddFeature(outer);

        Assert.Throws<InvalidDataException>(() => EncMetadataCoverageNormalizer.Normalize(dataset, [inner]));
        Assert.Same(outer, Assert.Single(dataset.Features!));
    }

    [Fact]
    public void NormalizeDoesNotAlterNonMetadataFeatures()
    {
        var dataset = new YamlDataset();
        var sounding = new Feature { Foid = "110:4:1", Name = "Sounding", Geometry = "P1", Prim = Primitive.Point };
        dataset.AddFeature(sounding);
        dataset.AddFeature(new Feature { Foid = "110:5:1", Name = "Wreck", Geometry = "P2", Prim = Primitive.Point });

        var result = EncMetadataCoverageNormalizer.Normalize(dataset, []);

        Assert.Equal(0, result.TotalRemoved);
        Assert.Same(sounding, dataset.Features!.Single(feature => feature.Foid == "110:4:1"));
        Assert.Equal(2, dataset.Features!.Count);
    }

    [Fact]
    public void ApplyRemovesOnlyRedundantMetadataAndPreservesSoundings()
    {
        var dataset = new YamlDataset();
        var outer = new Feature { Foid = "A", Name = "SoundingDatum", Prim = Primitive.Surface, Geometry = "S1" };
        var inner = new Feature { Foid = "B", Name = "SoundingDatum", Prim = Primitive.Surface, Geometry = "S2" };
        var sounding = new Feature { Foid = "C", Name = "Sounding", Prim = Primitive.Point, Geometry = "P1" };
        dataset.AddFeature(sounding);
        var regions = new[] {
            Region("A", "SoundingDatum", "datum=44", "POLYGON ((0 0, 4 0, 4 4, 0 4, 0 0))"),
            Region("B", "SoundingDatum", "datum=44", "POLYGON ((1 1, 3 1, 3 3, 1 3, 1 1))")
        };

        var result = EncMetadataCoverageNormalizer.Apply(dataset, [inner, outer], regions);

        Assert.Equal(1, result.RemovedSoundingDatum);
        Assert.Equal(2, dataset.Features!.Count);
        Assert.DoesNotContain(dataset.Features!, feature => feature.Foid == inner.Foid);
        Assert.Same(outer, dataset.Features!.Single(f => f.Name == "SoundingDatum"));
        Assert.Same(sounding, dataset.Features!.Single(f => f.Name == "Sounding"));
        Assert.Equal("P1", sounding.Geometry);
    }

    [Fact]
    public void ChangedSourceMetadataCannotBeSuppressed()
    {
        var (dataset, pending, regions, inner) = RedundantMetadataDataset();
        var protectedFeatures = new HashSet<Feature>(ReferenceEqualityComparer.Instance) { inner };

        Assert.Throws<InvalidDataException>(() => EncMetadataCoverageNormalizer.Apply(dataset, pending, regions, protectedFeatures));
        Assert.Empty(dataset.Features ?? Array.Empty<Feature>());
    }

    [Fact]
    public void FeatureAssociationsCannotBecomeDangling()
    {
        var (dataset, pending, regions, _) = RedundantMetadataDataset();
        var landmark = new Feature { Name = "Landmark", Foid = "C", Prim = Primitive.Point, Geometry = "P1" };
        landmark.AddFeatureAssociation(new Association { Name = "AssociatedFeature", Role = "test", To = "B" });
        dataset.AddFeature(landmark);

        Assert.Throws<InvalidDataException>(() => EncMetadataCoverageNormalizer.Apply(dataset, pending, regions));
        Assert.Single(dataset.Features!);
    }

    [Fact]
    public void OutgoingMetadataAssociationsBlockSuppression()
    {
        var (dataset, pending, regions, inner) = RedundantMetadataDataset();
        inner.AddAssociation(new Association { Name = "AdditionalInformation", Role = "test", To = "123" });

        Assert.Throws<InvalidDataException>(() => EncMetadataCoverageNormalizer.Apply(dataset, pending, regions));
        Assert.Empty(dataset.Features ?? Array.Empty<Feature>());
    }

    private static (YamlDataset Dataset, Feature[] Pending, EncMetadataCoverageNormalizer.Region[] Regions, Feature Inner)
        RedundantMetadataDataset()
    {
        var dataset = new YamlDataset();
        var outer = new Feature { Foid = "A", Name = "SoundingDatum", Prim = Primitive.Surface, Geometry = "S1" };
        var inner = new Feature { Foid = "B", Name = "SoundingDatum", Prim = Primitive.Surface, Geometry = "S2" };
        var regions = new[] {
            Region("A", "SoundingDatum", "datum=44", "POLYGON ((0 0, 4 0, 4 4, 0 4, 0 0))"),
            Region("B", "SoundingDatum", "datum=44", "POLYGON ((1 1, 3 1, 3 3, 1 3, 1 1))")
        };
        return (dataset, [outer, inner], regions, inner);
    }

    private static EncMetadataCoverageNormalizer.Region Region(string id, string type, string attributes, string wkt)
        => new(id, type, attributes, string.Empty, (NetTopologySuite.Geometries.Polygon)Reader.Read(wkt));
}
