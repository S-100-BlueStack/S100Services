using ArcGIS.Core.Data;
using ArcGIS.Core.Geometry;
using IO = System.IO;
using S100FC.ProductCatalogue;
using S100FC.S128.FeatureTypes;
using S100FC;

namespace TestProductCatalogueAPI.Manual
{
    /// <summary>Developer import scenarios that persist S-128 products in an isolated catalogue.</summary>
    public sealed class S128ImportTests
    {
        /// <summary>
        /// Creates S-101 and S-57 ElectronicProducts for LalaLand and establishes
        /// an S-128 ProductMapping association from the S-101 product to the S-57 product.
        /// </summary>
        /// <remarks>
        /// This integration test writes persistent data to the configured S-128 geodatabase.
        /// It is intended to run once against a dedicated test database.
        /// </remarks>
        [Fact(Skip = "Manual S-128 write. Enable only for an isolated copy of the catalogue.")]
        [Trait("Category", "Manual")]
        public async Task Test_ImportLalaLand_S128() {
            ArcGIS.Core.Hosting.Host.Initialize();
            var lalaLandSde = Environment.GetEnvironmentVariable("PRODUCTCATALOGUE_TEST_LALALAND_SOURCE");
            var s128 = Environment.GetEnvironmentVariable("PRODUCTCATALOGUE_TEST_S128_CONNECTION");

            Assert.False(string.IsNullOrWhiteSpace(lalaLandSde));
            Assert.False(string.IsNullOrWhiteSpace(s128));
            Assert.True(System.IO.Path.Exists(lalaLandSde));
            Assert.True(System.IO.Path.Exists(s128));

            const string s101DatasetName = "101DK00LALALAND";
            const string s57DatasetName = "DK00LALA";
            const int compilationScale = 22000;
            const int specificUsage = 4;
            const int sourceIdentifier = 9160;

            var editionDate = new DateOnly(2024, 10, 16);

            Geodatabase OpenS128Geodatabase() {
                var path = System.IO.Path.GetFullPath(s128);

                return System.IO.Path.GetExtension(path).ToLowerInvariant() switch {
                    ".sde" => new Geodatabase(new DatabaseConnectionFile(new Uri(path))),
                    ".gdb" => new Geodatabase(new FileGeodatabaseConnectionPath(new Uri(path))),
                    _ => throw new InvalidOperationException("S-128 path must be an .sde or .gdb.")
                };
            }

            var productManager = (S100FC.ProductCatalogue.ProductManagerGDB)
                await S100FC.ProductCatalogue.ProductManagerGDB.CreateInstanceAsync(OpenS128Geodatabase);

            using (productManager) {
                // Read the existing LalaLand AOI from the source geodatabase.
                var boundary = await productManager.Dispatch(() => {
                    using var lalaGdb = new Geodatabase(
                        new DatabaseConnectionFile(new Uri(System.IO.Path.GetFullPath(lalaLandSde))));

                    using var surface = lalaGdb.OpenDataset<FeatureClass>("S100.Surface");
                    using var cursor = surface.Search(new QueryFilter {
                        WhereClause = "flatten LIKE '%LALA%'"
                    }, false);

                    string? result = null;

                    while (cursor.MoveNext()) {
                        using var row = (ArcGIS.Core.Data.Feature)cursor.Current;

                        if (row.GetShape() is not Polygon polygon)
                            continue;

                        Assert.Null(result); // The test must not silently choose between multiple AOIs.
                        result = polygon.ToJson();
                    }

                    return result;
                });

                Assert.False(string.IsNullOrWhiteSpace(boundary));

                var s101Specification = new S100FC.S128.ComplexAttributes.productSpecification {
                    editionDate = editionDate,
                    name = "S-101",
                    version = "2.0.0"
                };

                var s57Specification = new S100FC.S128.ComplexAttributes.productSpecification {
                    editionDate = editionDate,
                    name = "S-57",
                    version = "3.1"
                };

                // The target must already exist when the S-101 product is created.
                var electronicProducts = productManager.ElectronicProductManager;
                await electronicProducts.CreateElectronicProductAsync(s57DatasetName, s57Specification, specificUsage, boundary!, null, compilationScale, sourceIdentifier);
                Assert.NotNull(electronicProducts.ResolveExportProduct(s57DatasetName));
                Assert.Empty(electronicProducts.GetMappedElectronicProducts(s57DatasetName, "S-101"));

                await electronicProducts.CreateElectronicProductAsync(s101DatasetName, s101Specification, specificUsage, boundary!, s57DatasetName, compilationScale, sourceIdentifier);
                Assert.Equal(s57DatasetName, Assert.Single(electronicProducts.GetMappedElectronicProducts(s101DatasetName, "S-57")).datasetName);
                Assert.Equal(s101DatasetName, Assert.Single(electronicProducts.GetMappedElectronicProducts(s57DatasetName, "S-101")).datasetName);
            }

            // Reload from the geodatabase to verify the association survived disposal.
            using var reloaded = (ProductManagerGDB)await ProductManagerGDB.CreateInstanceAsync(OpenS128Geodatabase);
            Assert.Equal(s57DatasetName, Assert.Single(reloaded.ElectronicProductManager.GetMappedElectronicProducts(s101DatasetName, "S-57")).datasetName);
            Assert.Equal(s101DatasetName, Assert.Single(reloaded.ElectronicProductManager.GetMappedElectronicProducts(s57DatasetName, "S-101")).datasetName);

            await reloaded.Dispatch(() => {
                using var gdb = OpenS128Geodatabase();
                var definitions = gdb.GetDefinitions<FeatureClassDefinition>();
                try {
                    var surfaceDefinition = Assert.Single(definitions, definition => {
                        var tableName = definition.GetName();
                        return tableName.Equals("surface", StringComparison.OrdinalIgnoreCase) || tableName.EndsWith(".surface", StringComparison.OrdinalIgnoreCase);
                    });
                    using var surface = gdb.OpenDataset<FeatureClass>(surfaceDefinition.GetName());
                    using var cursor = surface.Search(new QueryFilter { WhereClause = "upper(ps) = 'S-128' AND code = 'ElectronicProduct'" }, false);
                    var verifiedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    while (cursor.MoveNext()) {
                        using var row = cursor.Current;
                        var product = AttributeFlattenExtensions.UnflattenFeatureType<ElectronicProduct>(Convert.ToString(row["attributebindings"])!);
                        if (product.datasetName != s101DatasetName && product.datasetName != s57DatasetName)
                            continue;

                        Assert.False(row.IsNull("sourceIdentifier"));
                        Assert.Equal(sourceIdentifier, Convert.ToInt32(row["sourceIdentifier"]));
                        Assert.True(verifiedNames.Add(product.datasetName!));
                    }
                    Assert.Equal(2, verifiedNames.Count);
                }
                finally {
                    foreach (var definition in definitions)
                        definition.Dispose();
                }
            });
        }

        /// <summary>Creates S-101 catalogue entries from the existing S-57 product definitions and coverage.</summary>
        /// <returns>A task that completes after all product writes have finished.</returns>
        [Fact(Skip = "Manual bulk import. Enable only for an isolated copy of the catalogue.")]
        [Trait("Category", "Manual")]
        public async Task Test_ImportS128Products() {
            ArcGIS.Core.Hosting.Host.Initialize();
            var s57 = Environment.GetEnvironmentVariable("PRODUCTCATALOGUE_TEST_S57_SOURCE");
            var s128 = Environment.GetEnvironmentVariable("PRODUCTCATALOGUE_TEST_S128_CONNECTION");

            Assert.NotNull(s57);
            Assert.NotNull(s128);

            var exist57 = IO.Path.Exists(s57);
            var exist128 = IO.Path.Exists(s128);

            Assert.True(exist57 && exist128);

            // S128 ProductManager
            using var productManager = (ProductManagerGDB)await ProductManagerGDB.CreateInstanceAsync(() => {
                if (".sde".Equals(System.IO.Path.GetExtension(s128), StringComparison.OrdinalIgnoreCase)) {
                    var connectionFile = new DatabaseConnectionFile(new Uri(System.IO.Path.GetFullPath(s128)));

                    return new Geodatabase(connectionFile);
                }
                else if (".gdb".Equals(System.IO.Path.GetExtension(s128), StringComparison.OrdinalIgnoreCase)) {
                    var connectionFile = new FileGeodatabaseConnectionPath(new Uri(Path.GetFullPath(s128)));

                    return new Geodatabase(connectionFile);
                }
                else {
                    throw new InvalidOperationException("Connectionfile path for S128-Database is neither .gdb nor .sde");
                }
            });

            Assert.NotNull(productManager);

            var tasks = new List<Task>();

            //  S-57 ProductDefinitions
            var connectionFile = new Uri(IO.Path.GetFullPath(s57));

            Func<Geodatabase> createGeodatabase = () => { throw new NotImplementedException(); };

            if (IO.File.Exists(s57) && ".sde".Equals(IO.Path.GetExtension(s57), StringComparison.InvariantCultureIgnoreCase)) {
                createGeodatabase = () => { return new Geodatabase(new DatabaseConnectionFile(connectionFile)); };
            }
            else if (IO.Directory.Exists(s57) && ".gdb".Equals(IO.Path.GetExtension(s57), StringComparison.InvariantCultureIgnoreCase)) {
                createGeodatabase = () => { return new Geodatabase(new FileGeodatabaseConnectionPath(connectionFile)); };
            }

            var productSpecification = new S100FC.S128.ComplexAttributes.productSpecification {
                editionDate = S100FC.S101.Summary.VersionDate,
                name = S100FC.S101.Summary.ProductId,
                version = S100FC.S101.Summary.Version.ToString(),
            };

            using var geodatabase = createGeodatabase();

            var definitionTables = geodatabase.GetDefinitions<TableDefinition>();
            var definitionFeatureClasses = geodatabase.GetDefinitions<FeatureClassDefinition>();

            try {
                using var tableProductCoverage = geodatabase.OpenDataset<FeatureClass>(definitionFeatureClasses.Single(e => e.GetName().EndsWith("ProductCoverage")).GetName());

                using (var tableProductDefinitions = geodatabase.OpenDataset<Table>(definitionTables.Single(e => e.GetName().EndsWith("ProductDefinitions")).GetName())) {
                    using var cursor = tableProductDefinitions.Search(new QueryFilter {
                        WhereClause = "upper(ExportType) <> 'CANCEL'",
                    }, true);

                    while (cursor.MoveNext()) {

                        using var c = cursor.Current;

                        var name = "101DK00" + Convert.ToString(c["DSNM"])!.Substring(2);

                        var compilationScale = c["CSCL"] != null ? Convert.ToInt32(c["CSCL"]) : 0;

                        var specificUsage = name[7] switch {
                            '5' => 5, // NavigationalPurposeHarbour,
                            '4' => 4, // NavigationalPurposeApproach,
                            '3' => 3, // NavigationalPurposeCoastal,
                            '2' => 2, // NavigationalPurposeGeneral,
                            '1' => 1, // NavigationalPurposeOverview,
                            _ => throw new InvalidDataException(),
                        };

                        using var coverage = tableProductCoverage.Search(new QueryFilter {
                            WhereClause = $"DSNM = '{Convert.ToString(c["DSNM"])}'",
                        }, true);

                        var polygons = new List<ArcGIS.Core.Geometry.Polygon>();
                        while (coverage.MoveNext()) {
                            using var current = (ArcGIS.Core.Data.Feature)coverage.Current;
                            var polygon = (ArcGIS.Core.Geometry.Polygon)current.GetShape();

                            polygons.Add(polygon);
                            continue;
                        }

                        var cover = (ArcGIS.Core.Geometry.Polygon)GeometryEngine.Instance.Union(polygons);

                        tasks.Add(productManager.ElectronicProductManager.CreateElectronicProductAsync(name, productSpecification, specificUsage, cover.ToJson(), "", compilationScale));
                    }
                }
            }
            finally {
                foreach (var definition in definitionFeatureClasses)
                    definition.Dispose();
                foreach (var definition in definitionTables)
                    definition.Dispose();
            }

            await Task.WhenAll([.. tasks]);

        }
    }
}
