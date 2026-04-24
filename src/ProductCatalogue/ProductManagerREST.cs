using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using S100FC;
using S100FC.ProductCatalogue;
using S100FC.S128.ComplexAttributes;
using S100FC.S128.FeatureTypes;
using S100FC.S128.SimpleAttributes;
using S100FC.YAML;
using S100Framework.REST.Clients;
using S100Framework.REST.Models;
using S100Horizon.Settings;
using Serilog;
using System.Collections;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.RegularExpressions;
using Extensions = S100FC.ProductCatalogue.Extensions;

namespace ProductCatalogue
{
    public class ProductManagerREST : IProductManager, INauticalProductManager, IElectronicProductManager
    {
        public static async Task<IProductManager> CreateInstanceAsync(Func<FeatureServiceClient> client) => await new ProductManagerREST().InitializeAsync(client);
        public string OutputFolder { get; internal set; }
        private WKTReader _wktReader { get; } = new WKTReader();
        private FeatureServiceClient? _s128FeatureServiceClient;

        private readonly string[] _tableNames = ["point", "pointset", "curve", "surface"];

        private ConnectionREST[] _connections { get; set; } = [];
        private FeatureServiceClient Connection(string productSpecification, int compilationScale) => _connections.FirstOrDefault(e => e.ProductSpecification == productSpecification && e.MinimumScale <= compilationScale && e.MaximumScale >= compilationScale).Client;

        private readonly ConcurrentDictionary<string, S100FC.S128.FeatureTypes.ElectronicProduct> _electronicProducts = new ConcurrentDictionary<string, S100FC.S128.FeatureTypes.ElectronicProduct>();

        protected async Task<ProductManagerREST> InitializeAsync(Func<FeatureServiceClient> creator) {
            this._s128FeatureServiceClient = creator();

            // TEST
            if (System.Diagnostics.Debugger.IsAttached) {
                var testclient = await this._s128FeatureServiceClient.GetLayerClientAsync("Paper Charts");
                var chart = await testclient.QueryAsync(new FeatureQuery() {
                    Where = "PRODUCTNAME = 'Kort1161'",
                }).SingleOrDefaultAsync();

                var wkt = chart.Geometry.ToString();

                System.Diagnostics.Debugger.Break();
            }


            // ---- Read configuration
            var configurationClient = await this._s128FeatureServiceClient.GetLayerClientAsync("configuration");
            var configuration = await configurationClient.QueryAsync(new FeatureQuery() {
                Where = "upper(ps) = 'S-128.NuvionPro' AND code = 'ProductCatalogue'",
            }).SingleOrDefaultAsync();

            if (configuration == null)
                throw new NullReferenceException(nameof(configuration));

            if (configuration.Attributes.ContainsKey("json") && configuration.Attributes["json"] != null) {
                var settings = System.Text.Json.JsonSerializer.Deserialize<S100Horizon.Settings.ProductCatalogue>(Convert.ToString(configuration.Attributes["json"])!);
                if (settings != null) {
                    var cl = new HttpClient();

                    this._connections = [.. settings.Connections.Select(e => new ConnectionREST(e.ProductSpecification, e.MinimumScale, e.MaximumScale, new FeatureServiceClient(cl, new() { ServiceUri = e.ConnectionFile })))];

                    // Add output folder
                    this.OutputFolder = settings.OutputFolder;
                }
            }

            // ----- Read electronic products
            var attachmentClient = await this._s128FeatureServiceClient.GetLayerClientAsync("attachment");
            var electronicProducts = await attachmentClient.QueryAsync(new FeatureQuery() {
                Where = "upper(ps) = 'S-128' AND code = 'ElectronicProduct'",
            }).ToListAsync();

            foreach (var product in electronicProducts) {
                if (product.Attributes.ContainsKey("attributebindings") && product.Attributes["attributebindings"] != null) {
                    var electronicProduct = S100FC.AttributeFlattenExtensions.Unflatten<ElectronicProduct>(product.Attributes["attributebindings"]!.ToString()!, typeof(ElectronicProduct));
                    this._electronicProducts.GetOrAdd(electronicProduct.datasetName!.ToUpperInvariant(), electronicProduct);
                }
            }

            return this;
        }

        public INauticalProductManager NauticalProductManager => this;

        public IElectronicProductManager ElectronicProductManager => this;


        public async Task CreateAttachmentAsync(string name, ExportTypes exportType, string yaml, string index, string sign) {
            var electronicProduct = this._electronicProducts[name.ToUpperInvariant()];
            var timestamp = DateTime.UtcNow;


            var ps = "S-128.NuvionPro";
            var code = nameof(S100FC.ProductCatalogue.Dataset);
            var json = System.Text.Json.JsonSerializer.Serialize(new S100FC.ProductCatalogue.Dataset {
                DatasetName = electronicProduct.datasetName!,
                Edition = electronicProduct.editionNumber!.Value,
                Update = electronicProduct.updateNumber,
                ExportTypes = exportType,
                TimestampUTC = timestamp
            });
            var memoryStream = Extensions.ZipIt(yaml, index, sign);

            var dataSize = memoryStream.Length;
            var data = memoryStream;

            // TODO: Figure out MemoryStream post
            var ef = new EditableFeature(null, new Dictionary<string, object?>() {
                ["ps"] = ps,
                ["code"] = code,
                ["json"] = json,
                ["data"] = data,
                ["datasize"] = dataSize
            });

            var edits = new FeatureEdits() {
                Adds = [ef]
            };

            var attachmentClient = await this._s128FeatureServiceClient.GetLayerClientAsync("attachment");

            var applyEditsResult = await attachmentClient.ApplyEditsAsync(edits);

            if (applyEditsResult.AddResults.Any(e => !e.Success))
                throw new Exception("Error occured during CreateAttachmentAsync.ApplyEditsAsync()");
        }

        public async Task CreateElectronicProductAsync(string name, productSpecification productSpecification, /*specificUsage specificUsage,*/ string boundary, int? optimumDisplayScale = null) {
            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));

            name = name.ToUpperInvariant();

            if (this._electronicProducts.ContainsKey(name))
                throw new System.ArgumentException("An element with the same key already exists!");

            var ps = "S-128";
            var code = nameof(S100FC.S128.FeatureTypes.ElectronicProduct);

            var electronicProduct = new S100FC.S128.FeatureTypes.ElectronicProduct {
                datasetName = name,
                typeOfProductFormat = 2,                 //IsoIec8211,
                notForNavigation = true,
                issueDate = DateOnly.FromDateTime(DateTime.Now),
                editionNumber = 0,
                agencyResponsibleForProduction = "Danish Geodata Agency",
                // specificUsage = specificUsage.value,
                productSpecification = productSpecification,
                optimumDisplayScale = optimumDisplayScale,
            };

            var attributebindings = electronicProduct.Flatten();

            var shape = _wktReader.Read(boundary) as Polygon;


            var ef = new EditableFeature(shape, new Dictionary<string, object?>() {
                ["ps"] = ps,
                ["code"] = code,
                ["attributebindings"] = attributebindings,
            });

            var edits = new FeatureEdits() {
                Adds = [ef]
            };

            var attachmentClient = await this._s128FeatureServiceClient.GetLayerClientAsync("attachment");

            var applyEditsResult = await attachmentClient.ApplyEditsAsync(edits);

            if (applyEditsResult.AddResults.Any(e => !e.Success))
                throw new Exception("Error occured during CreateElectronicProductAsync.ApplyEditsAsync()");


            var result = this._electronicProducts.TryAdd(name, electronicProduct);
            Debug.Assert(result);
        }

        public async Task CreateElectronicProductAsync(string name, productSpecification productSpecification, /*specificUsage specificUsage,*/ string boundary, int edition, int update, byte[] zipfile) => throw new NotImplementedException();

        public async Task<S100FC.YAML.Dataset> CreateNewDatasetAsync(string name) {
            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));
            name = name.ToUpperInvariant();

            if (!this._electronicProducts.ContainsKey(name))
                throw new System.ArgumentException(nameof(name));

            var result = await this.GetElectronicProductAsync(name);

            if (result.ElectronicProduct.editionNumber.HasValue && result.ElectronicProduct.updateNumber.HasValue)
                throw new InvalidOperationException();

            // set ed/upd
            result.ElectronicProduct.editionNumber = 1;
            result.ElectronicProduct.updateNumber = 0;

            return await this.CreateDatasetAsync(result.ElectronicProduct, result.Boundary, ExportTypes.NewDataset);
        }

        public async Task<S100FC.YAML.Dataset> CreateNewEditionAsync(string name) {
            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));
            name = name.ToUpperInvariant();

            if (!this._electronicProducts.ContainsKey(name))
                throw new System.ArgumentException(nameof(name));

            var result = await this.GetElectronicProductAsync(name);


            result.ElectronicProduct.editionNumber += 1;
            result.ElectronicProduct.updateNumber = 0;

            return await this.CreateDatasetAsync(result.ElectronicProduct, result.Boundary, ExportTypes.NewEdition);
        }

        public async Task<S100FC.YAML.Dataset> CreateNewUpdateAsync(string name) {
            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));
            name = name.ToUpperInvariant();

            if (!this._electronicProducts.ContainsKey(name))
                throw new System.ArgumentException(nameof(name));

            var result = await this.GetElectronicProductAsync(name);


            result.ElectronicProduct.updateNumber += 1;

            return await this.CreateDatasetAsync(result.ElectronicProduct, result.Boundary, ExportTypes.Update);
        }

        public async Task<(string yaml, string index)> GetLatestDatasetYAML(string name, int edition) {
            var attachmentClient = await this._s128FeatureServiceClient.GetLayerClientAsync("attachment");

            var attachments = await attachmentClient.QueryAsync(new FeatureQuery() {
                Where = $"json LIKE '%\"DatasetName\":\"{name}\"%' AND json LIKE '%\"Edition\":{edition}%'",
                OrderBy = "created_date DESC",
                ReturnGeometry = true,
            }).ToListAsync();

            // TODO: refactor
            var ms = attachments.First().Attributes["data"] as MemoryStream;

            var rootData = Extensions.ReadZippedData(ms); // root YAML
            var rootYAML = rootData["yaml"];
            var index = rootData["index"];

            foreach (var row in attachments.Skip(1)) {
                var cms = row.Attributes["data"] as MemoryStream;
                var data = Extensions.ReadZippedData(cms);
                var delta = data["yaml"];
                index = data["index"];

                if (!string.IsNullOrEmpty(delta))
                    rootYAML = S100FC.YAML.DatasetComparer.AppendUpdate(rootYAML, delta);

            }

            return (rootYAML, index);
        }

        public async Task<Dictionary<string, ArchiveRow>> GetPendingEditsAsync(string name) {
            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));

            name = name.ToUpperInvariant();

            if (!this._electronicProducts.TryGetValue(name, out var electronicProduct))
                throw new ArgumentException(null, nameof(name));

            var dataset = await this.GetLatestDataset(name);

            if (dataset == null)
                throw new NullReferenceException(nameof(dataset));

            var maxDate = new DateTime(31, 12, 9999);

            var dict = new Dictionary<string, ArchiveRow>();

            var client = this.Connection(electronicProduct.productSpecification!.name!, electronicProduct.optimumDisplayScale!.Value)!;

            var extent = await this.BuildSpatialQueryFilter(name);

            var spatialFilter = ExtractChangesSpatialFilter.FromGeometry(extent);

            var result = await client.ExtractChangesAsync(
                new ExtractChangesRequest {
                    Layers = [0, 1, 2, 3, 4, 5],
                    SpatialFilter = spatialFilter,
                    ReturnIdsOnly = true,
                    FieldsToCompare = ["type"],

                    // TODO: Store generation for later use when requesting actual changes. For now, just return all changes since we don't know the last gen.
                    //LayerServerGens = [
                    //    new ExtractChangesLayerServerGen(0, 1653608093000)
                    //],
                });



            // TODO: populate dict with results

            //foreach(var res in result.Edits) {
            //  //  res.LayerId
            //    res.Features?.Adds.ForEach(f => {
            //        var code = f.Attributes["code"].ToString();
            //        var attrBindings = f.Attributes["attributebindings"].ToString();
            //        var featureBindings = f.Attributes["featurebindings"].ToString();
            //        var informationBindings = f.Attributes["informationbindings"].ToString();
            //        dict.TryAdd(f.Id.ToString(), new ArchiveRow {
            //            Code = code!,
            //            AttributeBindings = attrBindings,
            //            FeatureBindings = featureBindings,
            //            InformationBindings = informationBindings,
            //            Deleted = res.ObjectIds != null && res.ObjectIds.Contains(f.Id) && res.HasGeometryUpdates == false, // if objectids contains the id and hasgeometryupdates is false, we can consider it a delete. Otherwise, it's either an update or an insert.
            //        });
            //    });
            //}
        

            return dict;
        }

        public async Task<bool> IsDirtyAsync(string name) {
            throw new NotImplementedException();

            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));

            name = name.ToUpperInvariant();

            if (!this._electronicProducts.TryGetValue(name, out var electronicProduct))
                throw new ArgumentException(null, nameof(name));

            var dirty = false;


            var dataset = await this.GetLatestDataset(name);

            if (dataset == default)
                return false;

            var client = this.Connection(electronicProduct.productSpecification!.name!, electronicProduct.optimumDisplayScale!.Value)!;
            string[] tableNames = ["point", "pointset", "curve", "surface"];
            foreach (var baseTableName in tableNames) {
                var layerClient = client.GetLayerClientAsync(baseTableName);

                //var filter = await this.BuildSpatialQueryFilter(dataset, electronicProduct.specificUsage);

                // query spatially
                // TODO: Access archiveTable? ExtractChanges query.
            }

            return dirty;
        }
        private async Task<S100FC.ProductCatalogue.Dataset?> GetLatestDataset(string name) {
            var attachmentClient = await this._s128FeatureServiceClient.GetLayerClientAsync("attachment");

            var product = await attachmentClient.QueryAsync(new FeatureQuery() {
                Where = $"json LIKE '{name}' AND Code = 'ElectronicProduct'",
                OrderBy = "created_date DESC",
                ReturnGeometry = false,
                OutFields = ["json"]
            }).FirstOrDefaultAsync();

            var json = product.GetString("json");

            return System.Text.Json.JsonSerializer.Deserialize<S100FC.ProductCatalogue.Dataset>(json);
        }


        public async Task<S100FC.YAML.Dataset> ReissueAsync(string name) {
            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));
            name = name.ToUpperInvariant();

            if (!this._electronicProducts.ContainsKey(name))
                throw new System.ArgumentException(nameof(name));

            var result = await this.GetElectronicProductAsync(name);

            return await this.CreateDatasetAsync(result.ElectronicProduct, result.Boundary, ExportTypes.Reissue);
        }


        ElectronicProduct? IElectronicProductManager.ElectronicProduct(string name) => this._electronicProducts.GetValueOrDefault(name.ToUpperInvariant());

        IEnumerator<string> IEnumerable<string>.GetEnumerator() {
            foreach (var p in this._electronicProducts)
                yield return p.Key;
            yield break;
        }

        IEnumerator IEnumerable.GetEnumerator() => this._electronicProducts.Keys.GetEnumerator();


        async Task<Dictionary<string, string>> IElectronicProductManager.GetDatasetAOIs() {
            var result = new Dictionary<string, string>();

            var surfaceClient = await this._s128FeatureServiceClient.GetLayerClientAsync("surface");

            var products = await surfaceClient.QueryAsync(new FeatureQuery() {
                Where = $"upper(ps) = 'S-128' AND Code = 'ElectronicProduct'",
                ReturnGeometry = true,
            }).ToListAsync();

            foreach (var product in products) {
                var attrBindings = Convert.ToString(product.Attributes["attributebindings"]) ?? string.Empty;
                var electronicProduct = S100FC.AttributeFlattenExtensions.Unflatten<ElectronicProduct>(attrBindings!, typeof(ElectronicProduct));

                var simpleGeometry = product.Geometry.Envelope as Polygon;

                var wkt = simpleGeometry.ToString();

                result.Add(electronicProduct.datasetName!, wkt);
            }

            return result;
        }

        async Task<string> IElectronicProductManager.GetDatasetBoundary(string name) {

            var surfaceClient = await this._s128FeatureServiceClient.GetLayerClientAsync("surface");
            var product = await surfaceClient.QueryAsync(new FeatureQuery() {
                Where = $"upper(ps) = 'S-128' AND Code = 'ElectronicProduct' AND attributebindings LIKE '%\"{name}\"%'",
                ReturnGeometry = true,
            }).SingleOrDefaultAsync();

            var boundaryWKT = product.Geometry.ToString();

            return boundaryWKT;
        }

        private async Task<NetTopologySuite.Geometries.Geometry> BuildSpatialQueryFilter(string name) {

            var surfaceClient = await this._s128FeatureServiceClient.GetLayerClientAsync("surface");

            var product = await surfaceClient.QueryAsync(new FeatureQuery() {
                Where = $"upper(ps) = 'S-128' AND Code = 'ElectronicProduct' AND attributebindings LIKE '{name}'",
                ReturnGeometry = true,
            }).SingleOrDefaultAsync();

            if (product == null)
                throw new System.ArgumentException(nameof(name));


            return product.Geometry!;

            //return await this.Dispatch(() => {
            //    using var surface = this._geodatabase!.OpenDataset<FeatureClass>(this.QualifyTableName("surface"));

            //    using var cursorS128 = surface.Search(new QueryFilter {
            //        WhereClause = $"attributebindings LIKE '%\"{dataset.DatasetName}\"%'",
            //    }, false);

            //    cursorS128.MoveNext();

            //    Debug.Assert(cursorS128.Current != null);

            //    if (cursorS128.Current.IsNull("attributebindings"))
            //        throw new System.ArgumentNullException(nameof(dataset.DatasetName));

            //    // original
            //    //var whereClause = $"UPPER(ps) = 'S-101' AND (" +
            //    //                  $"created_date > DATE '{dataset.TimestampUTC:yyyy-MM-dd HH:mm:ss}' " +
            //    //                  $"OR last_edited_date > DATE '{dataset.TimestampUTC:yyyy-MM-dd HH:mm:ss}')";

            //    var sqlSyntax = _geodatabase.GetSQLSyntax();

            //    var formattedDate = sqlSyntax.Format(dataset.TimestampUTC, SQLDateTimeType.Timestamp);


            //    //var whereClause = $"UPPER(ps) = 'S-101' AND GDB_FROM_DATE > {formattedDate}";
            //    var whereClause = $"UPPER(ps) = 'S-101' AND (GDB_FROM_DATE > {formattedDate} OR GDB_TO_DATE > {formattedDate})";

            //    if (specificUsage != null)
            //        whereClause += $" AND usageband = {specificUsage.value}";


            //    ArcGIS.Core.Geometry.Polygon shapeCoverage;

            //    shapeCoverage = (ArcGIS.Core.Geometry.Polygon)((ArcGIS.Core.Data.Feature)cursorS128.Current).GetShape().Clone();

            //    var filter = new SpatialQueryFilter {
            //        FilterGeometry = shapeCoverage,
            //        SpatialRelationship = SpatialRelationship.Relation,
            //        SpatialRelationshipDescription = S100FC.Topology.Matrix.DE9IM,
            //        WhereClause = whereClause,
            //    };

            //    return filter;
            //});

        }

        private async Task<(ElectronicProduct ElectronicProduct, NetTopologySuite.Geometries.Geometry Boundary)> GetElectronicProductAsync(string name) {
            var surfaceClient = await this._s128FeatureServiceClient.GetLayerClientAsync("surface");
            var product = await surfaceClient.QueryAsync(new FeatureQuery() {
                Where = $"attributebindings LIKE '{name}' AND Code = 'ElectronicProduct'",

                ReturnGeometry = true,
            }).SingleOrDefaultAsync();

            var attrBindings = Convert.ToString(product.Attributes["attributebindings"]) ?? string.Empty;

            var electronicProduct = S100FC.AttributeFlattenExtensions.Unflatten<ElectronicProduct>(attrBindings!, typeof(ElectronicProduct));

            return (electronicProduct, product.Geometry);

        }
        // TODO: Reimplement AddTopology and AddGeometry
        private async Task<S100FC.YAML.Dataset> CreateDatasetAsync(ElectronicProduct electronicProduct, NetTopologySuite.Geometries.Geometry boundary, ExportTypes exportType, bool applyEdits = true) {
            var filter = FeatureSpatialFilter.FromGeometry(boundary, 4326, SpatialRelationship.Intersects);

            var timestamp = DateTime.UtcNow;

            var featureCatalogue = S100FC.Catalogues.FeatureCatalogue.Catalogues.Single(e => e.ProductID.Equals("S-101"));

            var regFileReference = new Regex("fileReference\":\"(?<filename>[^\"]+)", RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.IgnorePatternWhitespace);
            var regPictorialRepresentation = new Regex("pictorialRepresentation\":\"(?<filename>[^\"]+)", RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.IgnorePatternWhitespace);

            var uri = this.Connection(electronicProduct.productSpecification!.name!, electronicProduct.optimumDisplayScale!.Value)!;



            electronicProduct.issueDate = DateOnly.FromDateTime(timestamp);

            var dataset = new S100FC.YAML.Dataset {
                CellName = $"{electronicProduct!.datasetName!}.000",
                Comment = electronicProduct.notForNavigation.HasValue ? "Not for navigation!" : string.Empty,
                Edition = (uint?)electronicProduct.editionNumber,
                ENCVer = "INT.IHO.S-101.2.0",
                FCVer = "2.0",
                verticalDatum = "Baltic Sea Chart Datum 2000,44",
                //Update = (uint?)electronicProduct.updateNumber,   // todo: Bug in s100ocompiler and must always be null 
            };

            var supportFiles = new List<string>();
            var geometries = new List<(NetTopologySuite.Geometries.Geometry geometry, string name)>();
            var spatialAssociations = new Dictionary<string, S100FC.YAML.Association>();
            var informationTypes = new List<S100FC.YAML.Information>();
            var informationsTypesAdded = new List<string>();
            var featureTypes = new List<S100FC.YAML.Feature>();
            var featureTypesAdded = new List<string>();

            var topology = await uri.BuildTopology();

            //  InformationTypes
            try {
                var informationTypeClient = await this._s128FeatureServiceClient.GetLayerClientAsync("informationtype");

                var infRes = await informationTypeClient.QueryAsync(new FeatureQuery() {
                    Where = "1=1",
                }).ToListAsync();

                foreach (var inf in infRes) {
                    var name = $"{inf.Attributes["UID"]}";
                    var code = inf.Attributes["code"].ToString();

                    var flatten = inf.Attributes["attributebindings"].ToString();
                    var type = featureCatalogue.Assembly!.GetType($"{S100FC.Catalogues.FeatureCatalogue.Namespace("S101", "InformationTypes")}.{code}", true)!;
                    var instance = S100FC.AttributeFlattenExtensions.Unflatten<S100FC.InformationType>(flatten, type);

                    var information = new S100FC.YAML.Information {
                        Name = code,
                        ID = name,
                    };

                    // Only emit attributes if feature contains any non-static properties
                    if (instance?.attributeBindings.Length > 0)
                        information.Attributes = instance!;

                    informationTypes.Add(information);

                    var filenames = S100FC.YAML.Extensions.GetFileNames(flatten);

                    foreach (var filename in filenames) {
                        if (!supportFiles.Contains(filename)) {
                            supportFiles.Add(filename);
                        }
                    }

                }
            }
            catch (Exception ex) {
                Log.Information("Table: informationtype: {message} ", ex.Message);
            }

            // FeatureType
            try {
                var featureTypeClient = await this._s128FeatureServiceClient.GetLayerClientAsync("featuretype");

                var ftRes = await featureTypeClient.QueryAsync(new FeatureQuery() {
                    Where = "1=1",
                }).ToListAsync();

                foreach (var ft in ftRes) {
                    var name = $"{ft.Attributes["UID"]}";
                    var code = ft.Attributes["code"].ToString();
                    var flatten = ft.Attributes["attributebindings"].ToString();

                    var type = featureCatalogue.Assembly!.GetType($"{S100FC.Catalogues.FeatureCatalogue.Namespace("S101", "FeatureTypes")}.{code}", true)!;
                    var instance = S100FC.AttributeFlattenExtensions.Unflatten<S100FC.FeatureType>(flatten, type);

                    var foid = $"110:{name.Substring(1)}:1";       // Geodatastyrelsen: 110 

                    var feature = new S100FC.YAML.Feature {
                        Prim = S100FC.YAML.Primitive.NoGeometry,
                        Name = code,
                        Foid = foid,
                        Attributes = instance?.attributeBindings.Length > 0 ? instance : null,
                    };

                    featureTypes.Add(feature);

                    var filenames = S100FC.YAML.Extensions.GetFileNames(flatten);

                    foreach (var filename in filenames) {
                        if (!supportFiles.Contains(filename)) {
                            supportFiles.Add(filename);
                        }
                    }
                }
            }
            catch (Exception ex) {
                Log.Information("Table: featuretype: {message} ", ex.Message);
            }

            //  Features
            foreach (var tableName in _tableNames) {

                var featureClient = await this._s128FeatureServiceClient.GetLayerClientAsync(tableName);

                var records = await featureClient.QueryAsync(new FeatureQuery() {
                    Where = $"upper(ps) = 'S-101'",
                    SpatialFilter = filter,
                    ReturnGeometry = true,
                }).ToListAsync();

                foreach (var record in records) {
                    var name = $"{record.Attributes["UID"]}";

                    // Only map geometry, and keep name seperate so foids remain unique
                    var geometry = name;


                    if (topology.Mapping.TryGetValue(name!, out var value))
                        geometry = value;


                    var code = $"{record.Attributes["code"]}";

                    var foid = $"110:{name.Substring(1)}:1";       // Geodatastyrelsen: 110 

                    var prim = record.Geometry.OgcGeometryType switch {
                        OgcGeometryType.Point => S100FC.YAML.Primitive.Point,
                        OgcGeometryType.MultiPoint => S100FC.YAML.Primitive.Point,
                        OgcGeometryType.LineString => S100FC.YAML.Primitive.Curve,
                        OgcGeometryType.Polygon => S100FC.YAML.Primitive.Surface,
                        _ => throw new InvalidOperationException(),
                    };

                    var type = featureCatalogue.Assembly!.GetType($"{S100FC.Catalogues.FeatureCatalogue.Namespace("S101", "FeatureTypes")}.{code}", true) ?? default;

                    var flatten = $"{record.Attributes["attributebindings"]}";

                    var instance = S100FC.AttributeFlattenExtensions.Unflatten<S100FC.FeatureType>(flatten, type);

                    var filenames = S100FC.YAML.Extensions.GetFileNames(flatten);

                    foreach (var filename in filenames) {
                        if (!supportFiles.Contains(filename)) {
                            supportFiles.Add(filename);
                        }
                    }

                    var topologySurface = topology.Surfaces.FirstOrDefault(e => e.Ref!.Equals(name, StringComparison.InvariantCultureIgnoreCase));

                    //Build comma seperated string of masks, with: 1 or: 2 indicating which mask it is.Should be null / omitted if empty.
                    var masks = new[] {
                                    topologySurface?.Masks1?.Select(e => $"C{e}:1"),
                                    topologySurface?.Masks2?.Select(e => $"C{e}:2")
                                }.Where(m => m != null).SelectMany(m => m!);

                    var feature = new S100FC.YAML.Feature {
                        Name = code,
                        Foid = foid,
                        Prim = prim,
                        Geometry = geometry,
                        Masks = masks.Any() ? string.Join(",", masks) : null,
                        Attributes = instance?.attributeBindings.Length > 0 ? instance : null,
                    };


                    // Information Associations
                    if (record.Attributes["informationbindings"] != null) {
                        try {
                            var informationBindings = System.Text.Json.JsonSerializer.Deserialize<informationBinding[]>(Convert.ToString(record.Attributes["informationbindings"])!);   //  this.jsonSerializerOptionsS101 nessecary?

                            if (informationBindings != default && informationBindings.Length != 0) {
                                foreach (var binding in informationBindings) {

                                    var isValid = binding.Validate();

                                    if (!isValid)
                                        continue;

                                    var asso = new S100FC.YAML.Association {
                                        Name = binding.informationType!, // binding.GetType().GenericTypeArguments[0].Name,
                                        Role = binding.role,
                                        To = binding.informationId
                                    };

                                    if (!informationsTypesAdded.Contains(binding.informationId!)) {
                                        dataset!.AddInformation(informationTypes.Single(e => e.ID!.Equals(binding.informationId!)));
                                        informationsTypesAdded.Add(binding.informationId!);
                                    }


                                    // Special case for SpatialAssociation. Add to dictionary for later processing.
                                    if (prim != S100FC.YAML.Primitive.Surface && asso.Name.Equals("SpatialAssociation", StringComparison.CurrentCultureIgnoreCase))
                                        spatialAssociations.TryAdd(geometry, asso);
                                    else
                                        feature?.AddAssociation(asso);
                                }
                            }
                        }
                        catch (Exception ex) {
                            Log.Warning(ex, "Error deserializing informationbindings for feature {name}: {message}", name, ex.Message);
                        }
                    }

                    // Feature Associations
                    if (record.Attributes["featurebindings"] != null) {
                        try {
                            var featureBindings = System.Text.Json.JsonSerializer.Deserialize<featureBinding[]>(Convert.ToString(record.Attributes["informationbindings"])!);       //  this.jsonSerializerOptionsS101 nessecary?

                            if (featureBindings != default && featureBindings.Length != 0) {
                                foreach (var binding in featureBindings) {

                                    // check if valid
                                    var isValid = binding.Validate();

                                    if (!isValid)
                                        continue;

                                    var roleType = binding.roleType;

                                    // Skip association roleType
                                    if (roleType == "association")
                                        continue;

                                    var asso = new S100FC.YAML.Association {
                                        Name = binding.featureType!, // binding.GetType().GenericTypeArguments[0].Name,
                                        Role = binding.role,
                                        To = $"110:{binding!.featureId!.Substring(1)}:1"
                                    };

                                    feature?.AddFeatureAssociation(asso);

                                    var noGeometry = featureTypes.SingleOrDefault(e => e.Foid.Equals($"110:{binding.featureId.Substring(1)}:1"));
                                    if (noGeometry != null && !featureTypesAdded.Contains(binding.featureId)) {
                                        featureTypesAdded.Add(binding.featureId);
                                        dataset?.AddFeature(noGeometry);
                                    }
                                }
                            }
                        }
                        catch (Exception ex) {
                            Log.Warning(ex, "Error deserializing featurebindings for feature {name}: {message}", name, ex.Message);
                        }
                    }

                    dataset?.AddFeature(feature!);

                    NetTopologySuite.Geometries.Geometry geometrytype = code!.ToLower() switch {
                        "sounding" => new NetTopologySuite.Geometries.Point(record.Geometry.Coordinate),
                        _ => record.Geometry
                    };

                    geometries.Add(new(geometrytype, name!));
                }
            }

            // SupportFiles
            if (supportFiles.Count != 0) {
                var attachmentClient = await this._s128FeatureServiceClient.GetLayerClientAsync("attachment");

                var attachments = await attachmentClient.QueryAsync(new FeatureQuery() {
                    Where = $"code = 'supportfile'",
                    ReturnGeometry = false,
                    OutFields = ["json", "data"]
                }).ToListAsync();

                foreach (var att in attachments) {
                    var json = att.Attributes["json"]?.ToString();
                    if (json == null)
                        continue;

                    var file = System.Text.Json.JsonSerializer.Deserialize<S100BlueStack.Settings.SupportFile>(json);

                    if (!supportFiles.Contains(file!.FileName))
                        continue;

                    if (att.Attributes["data"] is not MemoryStream stream)
                        throw new ArgumentNullException("Column 'data' is not a memory stream");

                    stream.Position = 0;
                    using var reader = new StreamReader(stream);

                    var base64 = Convert.ToBase64String(stream.ToArray());
                    dataset?.Metadata.AddSupportFile(file.FileName, base64);
                }
            }

            //  Geometries
            foreach (var (geometry, name) in geometries.OrderBy(e => e.geometry.GeometryType)) {
                if (geometry.OgcGeometryType == OgcGeometryType.Polygon) continue;    // Skip polygons after topology
                dataset?.AddGeometry(geometry, name!);
                Log.Verbose("Adding {geometryType} with ID: {name}", geometry.GeometryType, name);
            }

            dataset!.AddTopology(topology);

            // Add Spatial Association Informationbindings. Must be handled after curves are added to dataset.
            foreach (var sa in spatialAssociations) {
                var curve = dataset?.Curves?.FirstOrDefault(e => e.Name == sa.Key);

                curve?.AddAssociation(sa.Value);
            }

            // Apply Edits
            if (applyEdits) {
                var sfClient = await this._s128FeatureServiceClient.GetLayerClientAsync("surface");
                var flatten = electronicProduct.Flatten();

                var editableFeature = new EditableFeature(null, new Dictionary<string, object?> {
                    ["attributebindings"] = flatten
                });

                var aeRes = await sfClient.ApplyEditsAsync(new FeatureEdits {
                    Updates = [editableFeature]
                });

                this._electronicProducts[electronicProduct.datasetName!.ToUpperInvariant()] = electronicProduct;
            }

            return dataset!;
        }
    }
}