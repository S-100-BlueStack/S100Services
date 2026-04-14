using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using S100FC;
using S100FC.ProductCatalogue;
using S100FC.S128.ComplexAttributes;
using S100FC.S128.FeatureTypes;
using S100FC.S128.SimpleAttributes;
using S100Framework.REST.Clients;
using S100Framework.REST.Models;
using S100Horizon.Settings;
using System.Collections;
using System.Collections.Concurrent;
using System.Diagnostics;

namespace ProductCatalogue
{
    public class ProductManagerREST : IProductManager, INauticalProductManager, IElectronicProductManager
    {
        public static async Task<IProductManager> CreateInstanceAsync(Func<FeatureServiceClient> client) => await new ProductManagerREST().InitializeAsync(client);
        public string OutputFolder { get; internal set; }
        private WKTReader _wktReader { get; } = new WKTReader();
        private FeatureServiceClient? _s128FeatureServiceClient;


        private ConnectionREST[] _connections { get; set; } = [];
        private FeatureServiceClient Connection(string productSpecification, int compilationScale) => _connections.FirstOrDefault(e => e.ProductSpecification == productSpecification && e.MinimumScale <= compilationScale && e.MaximumScale >= compilationScale).Client;

        private readonly ConcurrentDictionary<string, S100FC.S128.FeatureTypes.ElectronicProduct> _electronicProducts = new ConcurrentDictionary<string, S100FC.S128.FeatureTypes.ElectronicProduct>();

        protected async Task<ProductManagerREST> InitializeAsync(Func<FeatureServiceClient> creator) {
            this._s128FeatureServiceClient = creator();

            // TEST
            if (System.Diagnostics.Debugger.IsAttached) {
                var testclient = await this._s128FeatureServiceClient.GetLayerClient("Paper Charts");
                var chart = await testclient.QueryAsync(new FeatureQuery() {
                    Where = "PRODUCTNAME = 'Kort1161'",
                }).SingleOrDefaultAsync();

                var wkt = chart.Geometry.ToString();

                System.Diagnostics.Debugger.Break();
            }


            // ---- Read configuration
            var configurationClient = await this._s128FeatureServiceClient.GetLayerClient("configuration");
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
            var attachmentClient = await this._s128FeatureServiceClient.GetLayerClient("attachment");
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
            var code = nameof(Dataset);
            var json = System.Text.Json.JsonSerializer.Serialize(new Dataset {
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

            var attachmentClient = await this._s128FeatureServiceClient.GetLayerClient("attachment");

            var applyEditsResult = await attachmentClient.ApplyEditsAsync(edits);

            if (applyEditsResult.AddResults.Any(e => !e.Success))
                throw new Exception("Error occured during CreateAttachmentAsync.ApplyEditsAsync()");
        }

        public async Task CreateElectronicProductAsync(string name, productSpecification productSpecification, specificUsage specificUsage, string boundary, int? optimumDisplayScale = null) {
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
                specificUsage = specificUsage.value,
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

            var attachmentClient = await this._s128FeatureServiceClient.GetLayerClient("attachment");

            var applyEditsResult = await attachmentClient.ApplyEditsAsync(edits);

            if (applyEditsResult.AddResults.Any(e => !e.Success))
                throw new Exception("Error occured during CreateElectronicProductAsync.ApplyEditsAsync()");


            var result = this._electronicProducts.TryAdd(name, electronicProduct);
            Debug.Assert(result);
        }

        public async Task CreateElectronicProductAsync(string name, productSpecification productSpecification, specificUsage specificUsage, string boundary, int edition, int update, byte[] zipfile) => throw new NotImplementedException();

        public async Task<S100FC.YAML.Dataset> CreateNewDatasetAsync(string name) {
            throw new NotImplementedException();

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

            return await this.CreateDatasetAsync(result.ElectronicProduct, /*result.Filter,*/ ExportTypes.NewDataset);
        }

        public async Task<S100FC.YAML.Dataset> CreateNewEditionAsync(string name) {
            throw new NotImplementedException();

            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));
            name = name.ToUpperInvariant();

            if (!this._electronicProducts.ContainsKey(name))
                throw new System.ArgumentException(nameof(name));

            var result = await this.GetElectronicProductAsync(name);


            result.ElectronicProduct.editionNumber += 1;
            result.ElectronicProduct.updateNumber = 0;

            return await this.CreateDatasetAsync(result.ElectronicProduct,/* result.Filter,*/ ExportTypes.NewEdition);
        }

        public async Task<S100FC.YAML.Dataset> CreateNewUpdateAsync(string name) {
            throw new NotImplementedException();

            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));
            name = name.ToUpperInvariant();

            if (!this._electronicProducts.ContainsKey(name))
                throw new System.ArgumentException(nameof(name));

            var result = await this.GetElectronicProductAsync(name);


            result.ElectronicProduct.updateNumber += 1;

            return await this.CreateDatasetAsync(result.ElectronicProduct, /*result.Filter,*/ ExportTypes.Update);
        }

        public async Task<(string yaml, string index)> GetLatestDatasetYAML(string name, int edition) {
            var attachmentClient = await this._s128FeatureServiceClient.GetLayerClient("attachment");

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
            throw new NotImplementedException();

            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));

            name = name.ToUpperInvariant();

            if (!this._electronicProducts.TryGetValue(name, out var electronicProduct))
                throw new ArgumentException(null, nameof(name));

            var dataset = await this.GetLatestDataset(name);

            if (dataset == default)
                throw new NullReferenceException(nameof(dataset));

            var maxDate = new DateTime(31, 12, 9999);

            var dict = new Dictionary<string, ArchiveRow>();

            var client = this.Connection(electronicProduct.productSpecification!.name!, electronicProduct.optimumDisplayScale!.Value)!;
            string[] tableNames = ["point", "pointset", "curve", "surface"];
            foreach (var baseTableName in tableNames) {
                var layerClient = client.GetLayerClient(baseTableName);

                //var filter = await this.BuildSpatialQueryFilter(dataset, electronicProduct.specificUsage);

                // query spatially
                // TODO: Access archiveTable? ExtractChanges query.
            }


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
                var layerClient = client.GetLayerClient(baseTableName);

                //var filter = await this.BuildSpatialQueryFilter(dataset, electronicProduct.specificUsage);

                // query spatially
                // TODO: Access archiveTable? ExtractChanges query.
            }

            return dirty;
        }
        private async Task<Dataset?> GetLatestDataset(string name) {
            var attachmentClient = await this._s128FeatureServiceClient.GetLayerClient("attachment");

            var product = await attachmentClient.QueryAsync(new FeatureQuery() {
                Where = $"json LIKE '{name}' AND Code = 'ElectronicProduct'",
                OrderBy = "created_date DESC",
                ReturnGeometry = false,
                OutFields = ["json"]
            }).FirstOrDefaultAsync();

            var json = product.GetString("json");

            return System.Text.Json.JsonSerializer.Deserialize<Dataset>(json);
        }


        public async Task<S100FC.YAML.Dataset> ReissueAsync(string name) {
            throw new NotImplementedException();

            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));
            name = name.ToUpperInvariant();

            if (!this._electronicProducts.ContainsKey(name))
                throw new System.ArgumentException(nameof(name));

            var result = await this.GetElectronicProductAsync(name);

            return await this.CreateDatasetAsync(result.ElectronicProduct, /*result.Filter,*/ ExportTypes.Reissue);
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

            var surfaceClient = await this._s128FeatureServiceClient.GetLayerClient("surface");

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

            var surfaceClient = await this._s128FeatureServiceClient.GetLayerClient("surface");
            var product = await surfaceClient.QueryAsync(new FeatureQuery() {
                Where = $"upper(ps) = 'S-128' AND Code = 'ElectronicProduct' AND attributebindings LIKE '%\"{name}\"%'",
                ReturnGeometry = true,
            }).SingleOrDefaultAsync();

            var boundaryWKT = product.Geometry.ToString();

            return boundaryWKT;
        }



        // TODO: Refactor from Arcgis.Core
        private async Task<(ElectronicProduct ElectronicProduct, ArcGIS.Core.Data.SpatialQueryFilter Filter)> GetElectronicProductAsync(string name) {
            throw new NotImplementedException();

            var surfaceClient = await this._s128FeatureServiceClient.GetLayerClient("surface");
            var product = await surfaceClient.QueryAsync(new FeatureQuery() {
                Where = $"attributebindings LIKE '{name}' AND Code = 'ElectronicProduct'",
                ReturnGeometry = true,
            }).SingleOrDefaultAsync();

            var attrBindings = Convert.ToString(product.Attributes["attributebindings"]) ?? string.Empty;

            var electronicProduct = S100FC.AttributeFlattenExtensions.Unflatten<ElectronicProduct>(attrBindings!, typeof(ElectronicProduct));

        }
        // TODO: Refactor from Arcgis.Core with new spatial filter
        private async Task<S100FC.YAML.Dataset> CreateDatasetAsync(ElectronicProduct electronicProduct, /*SpatialQueryFilter filter,*/ ExportTypes exportType, bool applyEdits = true) {
            throw new NotImplementedException();
        }
    }
}