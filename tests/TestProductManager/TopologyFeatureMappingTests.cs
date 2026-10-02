using NtsCoordinate = NetTopologySuite.Geometries.Coordinate;
using NtsGeometryFactory = NetTopologySuite.Geometries.GeometryFactory;
using S100FC.ProductCatalogue;
using S100FC.Topology;
using S100FC.YAML;
using YamlDataset = S100FC.YAML.Dataset;

namespace TestProductCatalogueAPI
{
    public class TopologyFeatureMappingTests
    {
        private const string SourceUid = "00000000-0000-0000-0000-0000000001ab";

        private static string Foid(int part) => $"110:{Guid.Parse(SourceUid).ToStableUInt64()}:{part}";

        [Fact]
        public void Resolve_NonSplitFeature_PreservesExistingFoidAndMappedGeometry() {
            var result = TopologyFeatureMapping.Resolve(
                SourceUid,
                Primitive.Curve,
                [],
                new Dictionary<string, string> { [SourceUid] = "C200" },
                []);

            var mapping = Assert.Single(result);

            Assert.Equal(SourceUid, mapping.FeatureUid);
            Assert.Equal(Foid(1), mapping.Foid);
            Assert.Equal("C200", mapping.Geometry);
            Assert.Null(mapping.Masks);
        }

        [Fact]
        public void Resolve_NonSplitPointWithoutTopologyMapping_UsesStablePointGeometry() {
            var result = TopologyFeatureMapping.Resolve(
                SourceUid,
                Primitive.Point,
                [],
                new Dictionary<string, string>(),
                []);

            var mapping = Assert.Single(result);

            Assert.Equal(SourceUid, mapping.FeatureUid);
            Assert.Equal(Foid(1), mapping.Foid);
            Assert.Equal($"P{Guid.Parse(SourceUid).ToStableUInt64()}", mapping.Geometry);
        }

        [Fact]
        public void CreateFoid_UsesStableGuidForGeneratedPart() {
            Assert.Equal(Foid(0), TopologyFeatureMapping.CreateFoid($"{SourceUid}:0"));
        }

        [Fact]
        public void CreateFoid_RejectsOldColumnBasedIdentifier() {
            Assert.Throws<ArgumentException>(() => TopologyFeatureMapping.CreateFoid("F100"));
        }

        [Fact]
        public void Resolve_MultipleGeneratedCurveUids_UsesDeterministicGeneratedMappingsAndFoids() {
            var mapper = new Dictionary<string, string> {
                [$"{SourceUid}:1"] = SourceUid,
                [$"{SourceUid}:0"] = SourceUid,
            };
            var mappingFoid = new Dictionary<string, string> {
                [$"{SourceUid}:0"] = "C200",
                [$"{SourceUid}:1"] = "C201",
            };

            var result = TopologyFeatureMapping.Resolve(
                SourceUid,
                Primitive.Curve,
                mapper,
                mappingFoid,
                []);

            Assert.Collection(
                result,
                mapping => {
                    Assert.Equal($"{SourceUid}:0", mapping.FeatureUid);
                    Assert.Equal(Foid(0), mapping.Foid);
                    Assert.Equal("C200", mapping.Geometry);
                },
                mapping => {
                    Assert.Equal($"{SourceUid}:1", mapping.FeatureUid);
                    Assert.Equal(Foid(1), mapping.Foid);
                    Assert.Equal("C201", mapping.Geometry);
                });
        }

        [Fact]
        public void Resolve_MapperAndGeometryLookup_AreCaseInsensitive() {
            var result = TopologyFeatureMapping.Resolve(
                SourceUid,
                Primitive.Curve,
                new Dictionary<string, string> { [$"{SourceUid}:0"] = SourceUid.ToUpperInvariant() },
                new Dictionary<string, string> { [$"{SourceUid.ToUpperInvariant()}:0"] = "C200" },
                []);

            var mapping = Assert.Single(result);

            Assert.Equal($"{SourceUid}:0", mapping.FeatureUid);
            Assert.Equal("C200", mapping.Geometry);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        public void Resolve_GeneratedCurveWithoutUsableMappingFoid_IsOmitted(string? mappedGeometry) {
            var mappingFoid = new Dictionary<string, string>();

            if (mappedGeometry != null)
                mappingFoid[$"{SourceUid}:0"] = mappedGeometry;

            var result = TopologyFeatureMapping.Resolve(
                SourceUid,
                Primitive.Curve,
                new Dictionary<string, string> { [$"{SourceUid}:0"] = SourceUid },
                mappingFoid,
                []);

            Assert.Empty(result);
        }

        [Fact]
        public void Resolve_MultipleGeneratedCurveUids_OmitsOnlyGeneratedUidsWithoutMappingFoid() {
            var result = TopologyFeatureMapping.Resolve(
                SourceUid,
                Primitive.Curve,
                new Dictionary<string, string> {
                    [$"{SourceUid}:1"] = SourceUid,
                    [$"{SourceUid}:0"] = SourceUid,
                },
                new Dictionary<string, string> { [$"{SourceUid}:0"] = "C200" },
                []);

            var mapping = Assert.Single(result);

            Assert.Equal($"{SourceUid}:0", mapping.FeatureUid);
            Assert.Equal(Foid(0), mapping.Foid);
            Assert.Equal("C200", mapping.Geometry);
        }

        [Fact]
        public void Resolve_AllGeneratedCurveUidsWithoutMappingFoid_ReturnsEmpty() {
            var result = TopologyFeatureMapping.Resolve(
                SourceUid,
                Primitive.Curve,
                new Dictionary<string, string> {
                    [$"{SourceUid}:0"] = SourceUid,
                    [$"{SourceUid}:1"] = SourceUid,
                },
                new Dictionary<string, string>(),
                []);

            Assert.Empty(result);
        }

        [Theory]
        [InlineData(Primitive.Curve)]
        [InlineData(Primitive.Surface)]
        public void Resolve_NonSplitTopologyFeatureWithoutMappingFoid_IsOmitted(Primitive primitive) {
            var result = TopologyFeatureMapping.Resolve(
                SourceUid,
                primitive,
                [],
                new Dictionary<string, string>(),
                []);

            Assert.Empty(result);
        }

        [Fact]
        public void Resolve_FutureGeneratedSurfaceWithoutMappingFoid_IsOmitted() {
            var result = TopologyFeatureMapping.Resolve(
                SourceUid,
                Primitive.Surface,
                new Dictionary<string, string> { [$"{SourceUid}:0"] = SourceUid },
                new Dictionary<string, string>(),
                []);

            Assert.Empty(result);
        }

        [Fact]
        public void Resolve_NonSplitSurface_UsesSourceUidForGeometryAndMasks() {
            var surface = new SurfaceFeature {
                Id = 900,
                Ref = SourceUid,
                Exterior = new FeatureRef { Id = 200 },
                Masks1 = [300],
                Masks2 = [400],
            };

            var result = TopologyFeatureMapping.Resolve(
                SourceUid,
                Primitive.Surface,
                [],
                new Dictionary<string, string> { [SourceUid] = "S900" },
                [surface]);

            var mapping = Assert.Single(result);

            Assert.Equal(SourceUid, mapping.FeatureUid);
            Assert.Equal(Foid(1), mapping.Foid);
            Assert.Equal("S900", mapping.Geometry);
            Assert.Equal("C300:1,C400:2", mapping.Masks);
        }

        [Theory]
        [InlineData(false)]
        [InlineData(true)]
        public void Resolve_NonSplitSurfaceWithoutSurfaceOrMasks_OmitsMasks(bool includeSurface) {
            SurfaceFeature[] surfaces = includeSurface
                ? [
                    new SurfaceFeature {
                        Id = 900,
                        Ref = SourceUid,
                        Exterior = new FeatureRef { Id = 200 },
                    }
                ]
                : [];

            var result = TopologyFeatureMapping.Resolve(
                SourceUid,
                Primitive.Surface,
                [],
                new Dictionary<string, string> { [SourceUid] = "S900" },
                surfaces);

            Assert.Null(Assert.Single(result).Masks);
        }

        [Fact]
        public void SerializedCurveYaml_OmitsGeneratedUidWithoutTopologyGeometry() {
            var matrix = new TestMatrix {
                Curves = [CreateCurve(200, 0.0)],
                MappingFOID = new Dictionary<string, string> { [$"{SourceUid}:0"] = "C200" },
            };
            var mappings = TopologyFeatureMapping.Resolve(
                SourceUid,
                Primitive.Curve,
                new Dictionary<string, string> {
                    [$"{SourceUid}:0"] = SourceUid,
                    [$"{SourceUid}:1"] = SourceUid,
                },
                matrix.MappingFOID,
                matrix.Surfaces);
            var dataset = CreateDataset(mappings, Primitive.Curve);

            dataset.AddTopology(matrix);

            var feature = Assert.Single(dataset.Features!);
            Assert.Equal(Foid(0), feature.Foid);
            Assert.Equal("C200", feature.Geometry);
            AssertFinalTopologyReferencesExist(dataset);

            var yaml = dataset.Serialize();
            Assert.Contains("Geometry: C200", yaml);
            Assert.DoesNotContain(Foid(1), yaml);
            Assert.DoesNotContain($"{SourceUid}:1", yaml);
        }

        [Fact]
        public void SerializedCurveYaml_ReferencesGeneratedTopologyCurves() {
            var matrix = new TestMatrix {
                Curves = [
                    CreateCurve(200, 0.0),
                    CreateCurve(201, 2.0),
                ],
                MappingFOID = new Dictionary<string, string> {
                    [$"{SourceUid}:0"] = "C200",
                    [$"{SourceUid}:1"] = "C201",
                },
            };
            var mappings = TopologyFeatureMapping.Resolve(
                SourceUid,
                Primitive.Curve,
                new Dictionary<string, string> {
                    [$"{SourceUid}:1"] = SourceUid,
                    [$"{SourceUid}:0"] = SourceUid,
                },
                matrix.MappingFOID,
                matrix.Surfaces);
            var dataset = CreateDataset(mappings, Primitive.Curve);

            dataset.AddTopology(matrix);

            AssertFinalTopologyReferencesExist(dataset);

            var yaml = dataset.Serialize();
            Assert.Contains("Geometry: C200", yaml);
            Assert.Contains("Geometry: C201", yaml);
            Assert.Contains("Name: C200", yaml);
            Assert.Contains("Name: C201", yaml);
        }

        [Fact]
        public void SerializedNonSplitSurfaceYaml_UsesSourceUidAndContainsNoDanglingTopologyReferences() {
            var surface = new SurfaceFeature {
                Id = 900,
                Ref = SourceUid,
                Exterior = new FeatureRef { Id = 200 },
                Masks1 = [300],
                Masks2 = [400],
            };
            var matrix = new TestMatrix {
                Curves = [
                    CreateCurve(200, 0.0),
                    CreateCurve(300, 2.0),
                    CreateCurve(400, 4.0),
                ],
                Surfaces = [surface],
                MappingFOID = new Dictionary<string, string> { [SourceUid] = "S900" },
            };
            var mappings = TopologyFeatureMapping.Resolve(
                SourceUid,
                Primitive.Surface,
                [],
                matrix.MappingFOID,
                matrix.Surfaces);
            var dataset = CreateDataset(mappings, Primitive.Surface);

            dataset.AddTopology(matrix);

            var feature = Assert.Single(dataset.Features!);
            var topologySurface = Assert.Single(dataset.Surfaces!);

            Assert.Equal(Foid(1), feature.Foid);
            Assert.Equal("S100", topologySurface.Name);
            Assert.Equal(topologySurface.Name, feature.Geometry);
            Assert.Equal("C200", topologySurface.Exterior);
            Assert.Equal("C300:1,C400:2", feature.Masks);
            AssertFinalTopologyReferencesExist(dataset);

            var yaml = dataset.Serialize();
            Assert.Contains("Name: S100", yaml);
            Assert.Contains("Geometry: S100", yaml);
            Assert.Contains("Exterior: C200", yaml);
            Assert.Contains("Masks: C300:1,C400:2", yaml);
            Assert.Contains("Name: C200", yaml);
            Assert.Contains("Name: C300", yaml);
            Assert.Contains("Name: C400", yaml);
        }

        private static YamlDataset CreateDataset(
            IEnumerable<TopologyFeatureMappingResult> mappings,
            Primitive primitive) {
            var dataset = new YamlDataset();

            foreach (var mapping in mappings) {
                dataset.AddFeature(new Feature {
                    Name = "TestFeature",
                    Foid = mapping.Foid,
                    Prim = primitive,
                    Geometry = mapping.Geometry,
                    Masks = mapping.Masks,
                });
            }

            return dataset;
        }

        private static CurveFeature CreateCurve(ulong id, double offset) {
            var lineString = new NtsGeometryFactory().CreateLineString([
                new NtsCoordinate(offset, 0.0),
                new NtsCoordinate(offset + 1.0, 1.0),
            ]);

            return new CurveFeature(lineString, id);
        }

        private static void AssertFinalTopologyReferencesExist(YamlDataset dataset) {
            var curveNames = (dataset.Curves ?? [])
                .Select(e => e.Name!)
                .Concat((dataset.CompositeCurves ?? []).Select(e => e.Name!))
                .ToHashSet(StringComparer.Ordinal);
            var surfaceNames = (dataset.Surfaces ?? [])
                .Select(e => e.Name!)
                .ToHashSet(StringComparer.Ordinal);

            foreach (var surface in dataset.Surfaces ?? []) {
                Assert.Contains(NormalizeCurveReference(surface.Exterior), curveNames);

                foreach (var interior in surface.InteriorRings ?? [])
                    Assert.Contains(NormalizeCurveReference(interior), curveNames);
            }

            foreach (var feature in dataset.Features ?? []) {
                if (feature.Prim == Primitive.Curve)
                    Assert.Contains(feature.Geometry!, curveNames);
                else if (feature.Prim == Primitive.Surface)
                    Assert.Contains(feature.Geometry!, surfaceNames);

                foreach (var mask in SplitReferences(feature.Masks)) {
                    var separatorIndex = mask.LastIndexOf(':');

                    Assert.True(separatorIndex > 0, $"Mask reference '{mask}' has no orientation suffix.");

                    var curveReference = mask[..separatorIndex];
                    var orientation = mask[(separatorIndex + 1)..];

                    Assert.Contains(orientation, new[] { "1", "2" });
                    Assert.Contains(NormalizeCurveReference(curveReference), curveNames);
                }
            }
        }

        private static IEnumerable<string> SplitReferences(string? references) {
            return string.IsNullOrWhiteSpace(references)
                ? []
                : references.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        }

        private static string NormalizeCurveReference(string reference) {
            return reference.StartsWith("RC", StringComparison.Ordinal)
                ? $"C{reference[2..]}"
                : reference;
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
}
