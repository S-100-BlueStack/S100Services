using ArcGIS.Core.Data;
using ArcGIS.Core.Geometry;
using ArcGIS.Core.Internal.Geometry;
using S100FC.S128.ComplexAttributes;
using S100FC.S128.FeatureAssociation;
using S100FC.S128.FeatureTypes;
using S100FC.YAML;
using S100Horizon.Settings;
using Serilog;
using System.Collections;
using System.Collections.Concurrent;
using System.Data;
using System.Diagnostics;
using System.Reflection.Metadata;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using static System.Runtime.InteropServices.JavaScript.JSType;
using IO = System.IO;

namespace S100FC.ProductCatalogue
{
    public class ProductManagerGDB : IProductManager, INauticalProductManager, IElectronicProductManager, IDisposable
    {
        public static async Task<IProductManager> CreateInstanceAsync(Func<Geodatabase> creator) => await new ProductManagerGDB().InitializeAsync(creator);

        private bool _disposed = false;

        private readonly SingleThreadTaskScheduler _singleThreadTaskScheduler;

        private readonly TaskFactory _taskFactory;

        private Geodatabase? _geodatabase = default;

        private string _databaseName = string.Empty;
        private string _ownerName = string.Empty;

        readonly JsonSerializerOptions jsonSerializerOptions = new() {
            WriteIndented = false,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            PropertyNameCaseInsensitive = true,
        };



        public string OutputFolder { get; internal set; }
        private Connection[] _connections { get; set; } = [];
        //private Uri? Connection(string productSpecification, int compilationScale) => _connections.FirstOrDefault(e => e.ProductSpecification == productSpecification && e.MinimumScale <= compilationScale && e.MaximumScale >= compilationScale)?.ConnectionFile;
        private Uri? Connection(string productSpecification) => _connections.FirstOrDefault(e => e.ProductSpecification == productSpecification)?.ConnectionFile;


        record ElectronicProductKey(string ps, string name)
        {
            public override string ToString() => $"{this.ps}::{this.name}";
        }

        private readonly ConcurrentDictionary<string, S100FC.S128.FeatureTypes.ElectronicProduct> _electronicProducts = new ConcurrentDictionary<string, S100FC.S128.FeatureTypes.ElectronicProduct>();

        private ProductManagerGDB() {
            this._singleThreadTaskScheduler = new SingleThreadTaskScheduler();
            this._taskFactory = new TaskFactory(this._singleThreadTaskScheduler);
            this.OutputFolder = string.Empty;
        }

        protected async Task<ProductManagerGDB> InitializeAsync(Func<Geodatabase> creator) {
            S100FC.S101.Extensions.AppendTypeInfoResolver(this.jsonSerializerOptions);

            await this.Dispatch(() => {
                this._geodatabase = creator();

                var tableDefinitions = this._geodatabase.GetDefinitions<TableDefinition>();

                var configuration = tableDefinitions.Single(e => e.GetName().EndsWith("configuration"));

                var syntax = this.SQLSyntax.ParseTableName(configuration.GetName());
                this._databaseName = syntax.Item1;
                this._ownerName = syntax.Item2;

                using var table = this._geodatabase.OpenDataset<Table>(configuration.GetName());

                using var cursor = table.Search(new QueryFilter {
                    WhereClause = "upper(ps) = 'S-128.NuvionPro' AND code = 'ProductCatalogue'",
                }, true);

                cursor.MoveNext();

                Debug.Assert(cursor.Current != null);

                var c = cursor.Current;

                var code = Convert.ToString(c["code"]);
                if (!string.IsNullOrEmpty(code) && code.Equals("ProductCatalogue")) {
                    if (!c.IsNull("json")) {
                        var settings = System.Text.Json.JsonSerializer.Deserialize<S100Horizon.Settings.ProductCatalogue>(
                            Convert.ToString(c["json"])!);

                        if (settings != null) {
                            var connections = settings.Connections.Select(e => {
                                var uri = e.ConnectionFile;

                                var path = uri is null
                                    ? null
                                    : uri.IsAbsoluteUri
                                        ? uri.LocalPath
                                        : uri.OriginalString;

                                Log.Information(
                                    "Adding connection for {ProductSpecification} with connection file: {Path}.",
                                    e.ProductSpecification,
                                    path);

                                return new Connection(e.ProductSpecification, uri);
                            });

                            this._connections = [.. connections];

                            // Add output folder
                            this.OutputFolder = settings.OutputFolder;
                        }
                    }
                }
            });

            await this.Dispatch(() => {
                using (var surface = this._geodatabase!.OpenDataset<FeatureClass>(this.QualifyTableName("surface"))) {
                    using var cursor = surface.Search(new QueryFilter {
                        WhereClause = "upper(ps) = 'S-128'"
                    }, true);
                    while (cursor.MoveNext()) {
                        var c = cursor.Current;

                        if (c.IsNull("code")) continue;

                        var code = Convert.ToString(c["code"])!;

                        if (code.Equals(nameof(S100FC.S128.FeatureTypes.ElectronicProduct))) {
                            var json = c["attributebindings"];

                            var electronicProduct = S100FC.AttributeFlattenExtensions.Unflatten<ElectronicProduct>(json.ToString(), typeof(ElectronicProduct));
                            this._electronicProducts.GetOrAdd(electronicProduct.datasetName!.ToUpperInvariant(), electronicProduct);
                        }
                    }
                }
            });

            return this;
        }

        public INauticalProductManager NauticalProductManager => this;

        public IElectronicProductManager ElectronicProductManager => this;

        public Task Dispatch(Action action) {
            return this._taskFactory.StartNew(() => {
                action();
            });
        }
        public Task<TResult> Dispatch<TResult>(Func<TResult> function) {
            return this._taskFactory.StartNew(() => {
                return function();
            });
        }

        #region IElectronicProductManager

        async Task IElectronicProductManager.CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, /*S100FC.S128.SimpleAttributes.specificUsage specificUsage,*/ string boundary, string? productMapping, int? optimumDisplayScale) {
            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));

            name = name.ToUpperInvariant();

            var key = new ElectronicProductKey(productSpecification.name, name);

            await this.Dispatch(() => {
                if (this._electronicProducts.ContainsKey(name))
                    throw new System.ArgumentException("An element with the same key already exists!");

                this._geodatabase!.ApplyEdits(() => {
                    using (var surface = this._geodatabase!.OpenDataset<FeatureClass>(this.QualifyTableName("surface"))) {
                        using var buffer = surface.CreateRowBuffer();
                        buffer["ps"] = "S-128";
                        buffer["code"] = nameof(S100FC.S128.FeatureTypes.ElectronicProduct);

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

                        if (!string.IsNullOrEmpty(productMapping)) {


                            featureBinding[] bindings = [
                                new featureBinding<ProductMapping>
                                {
                                    roleType = "association",
                                    role = "theReference",
                                    association = new() {
                                       // ProductMapping
                                    }
                                }
                            ];

                            buffer["featurebindings"] = bindings;

                        }

                        var flattened = electronicProduct.Flatten();
                        buffer["attributebindings"] = flattened;

                        // cast to EsriGeometry
                        var shape = ArcGIS.Core.Geometry.GeometryEngine.Instance.ImportFromJson(JsonImportFlags.JsonImportDefaults, boundary);
                        buffer["shape"] = shape;
                        surface.CreateRow(buffer);

                        var result = this._electronicProducts.TryAdd(name, electronicProduct);
                        Debug.Assert(result);
                    }
                });
            });

        }

        Task IElectronicProductManager.CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, /*S100FC.S128.SimpleAttributes.specificUsage specificUsage,*/ string boundary, int edition, int update, byte[] zipfile) => throw new NotImplementedException();

        async Task<YAML.Dataset> IElectronicProductManager.CreateNewDatasetAsync(string name) {
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

            return await this.CreateDatasetAsync(result.ElectronicProduct, result.Filter, ExportTypes.NewDataset);
        }

        async Task<YAML.Dataset> IElectronicProductManager.CreateNewEditionAsync(string name) {
            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));
            name = name.ToUpperInvariant();

            if (!this._electronicProducts.ContainsKey(name))
                throw new System.ArgumentException(nameof(name));

            var result = await this.GetElectronicProductAsync(name);


            result.ElectronicProduct.editionNumber += 1;
            result.ElectronicProduct.updateNumber = 0;


            return await this.CreateDatasetAsync(result.ElectronicProduct, result.Filter, ExportTypes.NewEdition);
        }

        async Task<YAML.Dataset> IElectronicProductManager.CreateNewUpdateAsync(string name) {
            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));
            name = name.ToUpperInvariant();

            if (!this._electronicProducts.ContainsKey(name))
                throw new System.ArgumentException(nameof(name));

            var result = await this.GetElectronicProductAsync(name);


            result.ElectronicProduct.updateNumber += 1;

            return await this.CreateDatasetAsync(result.ElectronicProduct, result.Filter, ExportTypes.Update);
        }

        async Task<YAML.Dataset> IElectronicProductManager.ReissueAsync(string name) {
            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));
            name = name.ToUpperInvariant();

            if (!this._electronicProducts.ContainsKey(name))
                throw new System.ArgumentException(nameof(name));

            var result = await this.GetElectronicProductAsync(name);

            return await this.CreateDatasetAsync(result.ElectronicProduct, result.Filter, ExportTypes.Reissue);
        }

        async Task<bool> IElectronicProductManager.IsDirtyAsync(string name) {
            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));
            name = name.ToUpperInvariant();

            if (!this._electronicProducts.TryGetValue(name, out var electronicProduct))
                throw new ArgumentException(null, nameof(name));

            //var uri = this.Connection(electronicProduct.productSpecification!.name!, electronicProduct.optimumDisplayScale!.Value)!;
            var uri = this.Connection(electronicProduct.productSpecification!.name!)!;

            using var connection = this.OpenGeodatabase(uri);

            var dataset = await this.GetLatestDataset(name);

            if (dataset == default)
                return false;

            var filter = await this.BuildSpatialQueryFilter(dataset);

            var dirty = await this.Dispatch(() => {
                string[] tableNames = ["point", "pointset", "curve", "surface"];
                foreach (var baseTableName in tableNames) {
                    using var fc = connection.OpenDataset<FeatureClass>(this.QualifyTableName($"{baseTableName}"));

                    var isArchived = fc.IsArchiveEnabled();
                    if (isArchived) {
                        var archiveTable = fc.GetArchiveTable();

                        using var archiveCursor = archiveTable.Search(filter, true);
                        while (archiveCursor.MoveNext()) {
                            var cur = archiveCursor.Current;
                            var id = cur["UID"]?.ToString();
                            Log.Information("Change detected for {id} in {table}. Stopping further detection", id, baseTableName);
                            return true;
                        }
                    }
                    else {
                        Log.Warning("Archive is not enabled on {tableName}. Should only happen while debugging! Checking for 'created_date' or 'last_edited_date' instead", baseTableName);
                        filter.WhereClause = $"UPPER(ps) = 'S-101' AND (" +
                                             $"created_date > DATE '{dataset.TimestampUTC:yyyy-MM-dd HH:mm:ss}' " +
                                             $"OR last_edited_date > DATE '{dataset.TimestampUTC:yyyy-MM-dd HH:mm:ss}')";

                        using var cursor = fc.Search(filter, true);
                        while (cursor.MoveNext()) {
                            return true;
                        }
                    }
                }
                return false;
            });

            return dirty;
        }

        async Task<Dictionary<string, ArchiveRow>> IElectronicProductManager.GetPendingEditsAsync(string name) {
            if (string.IsNullOrWhiteSpace(name))
                throw new ArgumentNullException(nameof(name));

            name = name.ToUpperInvariant();

            if (!this._electronicProducts.TryGetValue(name, out var electronicProduct))
                throw new ArgumentException(null, nameof(name));

            var dataset = await this.GetLatestDataset(name);

            if (dataset == default)
                throw new NullReferenceException(nameof(dataset));

            var filter = await this.BuildSpatialQueryFilter(dataset);

            var result = new Dictionary<string, ArchiveRow>();

            await this.Dispatch(() => {
                string[] tableNames = ["point", "pointset", "curve", "surface"];

                var productName = electronicProduct.productSpecification?.name
                    ?? throw new NullReferenceException(nameof(electronicProduct.productSpecification.name));

                var displayScale = electronicProduct.optimumDisplayScale
                    ?? throw new NullReferenceException(nameof(electronicProduct.optimumDisplayScale));

                //var uri = this.Connection(productName, displayScale) ?? throw new NullReferenceException("uri");

                var uri = this.Connection(electronicProduct.productSpecification!.name!)!;

                using var connection = this.OpenGeodatabase(uri);

                foreach (var baseTableName in tableNames) {
                    using var fc = connection.OpenDataset<FeatureClass>(
                        this.QualifyTableName(baseTableName));

                    if (!fc.IsArchiveEnabled()) {
                        Log.Warning(
                            "Archiving is not enabled on {tableName} for product {name}.",
                            baseTableName,
                            name);

                        continue;
                    }

                    using var archiveTable = fc.GetArchiveTable();

                    using var cursor = archiveTable.Search(filter, true);

                    var tableCount = 0;

                    while (cursor.MoveNext()) {
                        var row = cursor.Current;

                        var id = row["UID"]?.ToString();

                        if (string.IsNullOrWhiteSpace(id))
                            continue;

                        result[id] = new ArchiveRow {
                            Code = row["Code"]?.ToString(),
                            AttributeBindings = row["attributebindings"]?.ToString(),
                            InformationBindings = row["informationbindings"]?.ToString(),
                            FeatureBindings = row["featurebindings"]?.ToString(),

                            // Do not infer deletion from a single historical row.
                            // Deletion needs separate current-row validation if required.
                            Deleted = false
                        };

                        tableCount++;
                    }

                    Log.Information(
                        "Found {count} archive changes in {tableName} for product {name}.",
                        tableCount,
                        baseTableName,
                        name);
                }
            });

            Log.Information(
                "Found {count} unique pending edited features for product {name}.",
                result.Count,
                name);

            return result;
        }

        public async Task<Dictionary<string, Dictionary<string, ArchiveRow>>> GetPendingEditsAsync(DateTime sinceUtc) {
            var result = new Dictionary<string, Dictionary<string, ArchiveRow>>();

            await this.Dispatch(() => {
                var products = this._electronicProducts
                    .Where(x => x.Value.optimumDisplayScale.HasValue)
                    .Select(x => new {
                        Name = x.Key,
                        Product = x.Value,
                        DisplayScale = x.Value.optimumDisplayScale!.Value,
                        Aoi = this.GetProductAoiGeometry(x.Key)
                    })
                    .Where(x => x.Aoi != null && !x.Aoi.IsEmpty)
                    .ToList();

                foreach (var c in this._connections.Where(e => e.ProductSpecification.Equals("S-101", StringComparison.OrdinalIgnoreCase))) {
                    var uri = c.ConnectionFile!;
                    //  var dbScale = $"Database: {c.MinimumScale}-{c.MaximumScale}";
                    var connectionName = c.ProductSpecification;
                    using var connection = this.OpenGeodatabase(uri);

                    var productsForConnection = products
                        .Where(p => this.Connection(p.Product.productSpecification!.name!) == uri)
                        .ToList();

                    if (productsForConnection.Count == 0)
                        continue;

                    ScanConnectionForPendingEdits(connection, connectionName, productsForConnection, sinceUtc, result);
                }
            });

            return result;
        }

        private void ScanConnectionForPendingEdits(Geodatabase connection, string connectionName, IEnumerable<dynamic> products, DateTime sinceUtc, Dictionary<string, Dictionary<string, ArchiveRow>> result) {
            var productList = products.ToList();

            var sqlSyntax = connection.GetSQLSyntax();

            var formattedSince = sqlSyntax.Format(
                sinceUtc,
                SQLDateTimeType.Timestamp);

            var formattedMaxDate = sqlSyntax.Format(
                new DateTime(9999, 12, 31),
                SQLDateTimeType.Timestamp);

            var archiveWhereClause =
                $"UPPER(ps) = 'S-101' AND " +
                $"(" +
                $"GDB_FROM_DATE > {formattedSince} OR " +
                $"(GDB_TO_DATE > {formattedSince} AND GDB_TO_DATE < {formattedMaxDate})" +
                $")";

            string[] tableNames = ["point", "pointset", "curve", "surface"];

            foreach (var baseTableName in tableNames) {
                using var fc = connection.OpenDataset<FeatureClass>(
                    this.QualifyTableName(baseTableName));

                if (!fc.IsArchiveEnabled()) {
                    Log.Warning(
                        "Archiving is not enabled on {tableName} for connection {connectionName}.",
                        baseTableName,
                        connectionName);

                    continue;
                }

                using var archiveTable = fc.GetArchiveTable();

                using var cursor = archiveTable.Search(new QueryFilter {
                    WhereClause = archiveWhereClause
                }, true);

                var archiveRows = 0;

                var uniqueChangedFeatureIds = new HashSet<string>();
                var affectedProducts = new HashSet<string>();

                while (cursor.MoveNext()) {
                    var row = cursor.Current;

                    var id = row["UID"]?.ToString();

                    if (string.IsNullOrWhiteSpace(id)) {

                        Log.Warning("Row in {tableName} for connection {connectionName} is missing UID. Skipping geometry check.", baseTableName, connectionName);
                        continue;
                    }

                    if (row is not ArcGIS.Core.Data.Feature feature) {
                        Log.Warning("Row with UID {id} in {tableName} for connection {connectionName} is not a feature. Skipping geometry check.", id, baseTableName, connectionName);
                        continue;
                    }

                    var changedShape = feature.GetShape();

                    if (changedShape == null || changedShape.IsEmpty) {
                        Log.Warning("Feature with UID {id} in {tableName} for connection {connectionName} has no geometry. Skipping.", id, baseTableName, connectionName);
                        continue;
                    }

                    archiveRows++;
                    uniqueChangedFeatureIds.Add(id);

                    var archiveRow = new ArchiveRow {
                        Code = row["Code"]?.ToString(),
                        AttributeBindings = row["attributebindings"]?.ToString(),
                        InformationBindings = row["informationbindings"]?.ToString(),
                        FeatureBindings = row["featurebindings"]?.ToString(),
                        Deleted = false,
                        EditDate = row["GDB_FROM_DATE"] as DateTime?
                    };

                    foreach (var product in productList) {
                        if (!GeometryEngine.Instance.Intersects(changedShape, product.Aoi))
                            continue;

                        affectedProducts.Add(product.Name);

                        if (!result.ContainsKey(product.Name))
                            result[product.Name] = new Dictionary<string, ArchiveRow>();

                        result[product.Name][id] = archiveRow;
                    }
                }

                Log.Information(
                    "Scanned archive changes in {tableName} for connection {connectionName}. Archive rows: {archiveRows}, unique changed features: {uniqueChangedFeatureIds}, affected products: {affectedProducts}",
                    baseTableName,
                    connectionName,
                    archiveRows,
                    uniqueChangedFeatureIds.Count,
                    affectedProducts.Count);
            }
        }
        public async Task<(string yaml, string index)> GetLatestDatasetYAML(string datasetName, int edition) {
            return await this.Dispatch(() => {
                using var attachment = _geodatabase!.OpenDataset<Table>(QualifyTableName("attachment"));


                using var cursor = attachment.Search(new QueryFilter {
                    WhereClause = $"json LIKE '%\"DatasetName\":\"{datasetName}\"%' AND json LIKE '%\"Edition\":{edition}%'",
                    PostfixClause = "ORDER BY created_date ASC"
                }, true);

                if (!cursor.MoveNext())
                    throw new InvalidOperationException("No dataset rows found");

                var ms = cursor.Current["data"] as MemoryStream;

                var rootData = Extensions.ReadZippedData(ms); // root YAML
                var rootYAML = rootData["yaml"];
                var index = rootData["index"];

                while (cursor.MoveNext()) {
                    var cms = cursor.Current["data"] as MemoryStream;
                    var data = Extensions.ReadZippedData(cms);
                    var delta = data["yaml"];
                    index = data["index"];

                    if (!string.IsNullOrEmpty(delta))
                        rootYAML = S100FC.YAML.DatasetComparer.AppendUpdate(rootYAML, delta);
                }

                return (rootYAML, index);
            });
        }

        ElectronicProduct? IElectronicProductManager.ElectronicProduct(string name) => this._electronicProducts.GetValueOrDefault(name.ToUpperInvariant());

        IEnumerator<string> IEnumerable<string>.GetEnumerator() {
            foreach (var p in this._electronicProducts)
                yield return p.Key;
            yield break;
        }

        IEnumerator IEnumerable.GetEnumerator() => this._electronicProducts.Keys.GetEnumerator();

        private async Task<(ElectronicProduct ElectronicProduct, SpatialQueryFilter Filter)> GetElectronicProductAsync(string name) {
            return await this.Dispatch(() => {
                using var surface = this._geodatabase!.OpenDataset<FeatureClass>(this.QualifyTableName("surface"));
                ArcGIS.Core.Data.Row row128;

                using var cursorS128 = surface.Search(new QueryFilter {
                    //WhereClause = $"json LIKE '%datasetName\":\"{name}\"%'",
                    WhereClause = $"attributebindings LIKE '%\"{name}\"%'",
                }, false);

                cursorS128.MoveNext();

                Debug.Assert(cursorS128.Current != null);

                row128 = cursorS128.Current;

                if (row128.IsNull("attributebindings"))
                    throw new System.ArgumentNullException(nameof(name));

                var electronicProduct = S100FC.AttributeFlattenExtensions.Unflatten<ElectronicProduct>(Convert.ToString(row128["attributebindings"])!, typeof(ElectronicProduct));

                var shapeCoverage = (ArcGIS.Core.Geometry.Polygon)((ArcGIS.Core.Data.Feature)cursorS128.Current).GetShape();

                var whereClause = "upper(ps) = 'S-101'";


                var filter = new SpatialQueryFilter {
                    FilterGeometry = shapeCoverage,
                    SpatialRelationship = SpatialRelationship.Relation,
                    SpatialRelationshipDescription = S100FC.Topology.Matrix.DE9IM,
                    WhereClause = whereClause,
                };

                return (electronicProduct, filter);
            });
        }

        private async Task<YAML.Dataset> CreateDatasetAsync(ElectronicProduct electronicProduct, SpatialQueryFilter filter, ExportTypes exportType, bool applyEdits = true) {
            var timestamp = DateTime.UtcNow;

            var featureCatalogue = S100FC.Catalogues.FeatureCatalogue.Catalogues.Single(e => e.ProductID.Equals("S-101"));

            var regFileReference = new Regex("fileReference\":\"(?<filename>[^\"]+)", RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.IgnorePatternWhitespace);
            var regPictorialRepresentation = new Regex("pictorialRepresentation\":\"(?<filename>[^\"]+)", RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.IgnorePatternWhitespace);

            //var uri = this.Connection(electronicProduct.productSpecification!.name!, electronicProduct.optimumDisplayScale!.Value)!;
            var uri = this.Connection(electronicProduct.productSpecification!.name!)!;


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
            var geometries = new List<(ArcGIS.Core.Geometry.Geometry geometry, string name)>();
            var spatialAssociations = new Dictionary<string, S100FC.YAML.Association>();
            var informationTypes = new List<YAML.Information>();
            var informationsTypesAdded = new List<string>();
            var featureTypes = new List<YAML.Feature>();
            var featureTypesAdded = new List<string>();

            return await this.Dispatch(() => {
                using var connection = this.OpenGeodatabase(uri);
                var topology = connection.BuildTopology(filter)!;

                //  InformationTypes
                //try {
                //    using var informationType = connection.OpenDataset<Table>(this.QualifyTableName("informationtype"));

                //    using var informationCursor = informationType.Search();
                //    while (informationCursor.MoveNext()) {
                //        var current = informationCursor.Current;

                //        var name = $"{current.UID()}";
                //        var code = current["code"].ToString()!;
                //        var flatten = current.FindField("attributebindings") != -1 &&
                //            current["attributebindings"] != null &&
                //            current["attributebindings"] != DBNull.Value ?
                //            current["attributebindings"].ToString() :
                //            string.Empty;

                //        var type = featureCatalogue.Assembly!.GetType($"{S100FC.Catalogues.FeatureCatalogue.Namespace("S101", "InformationTypes")}.{code}", true)!;
                //        var instance = S100FC.AttributeFlattenExtensions.Unflatten<S100FC.InformationType>(flatten, type);

                //        var information = new YAML.Information {
                //            Name = code,
                //            ID = name,
                //        };
                //        // Only emit attributes if feature contains any non-static properties
                //        if (instance?.attributeBindings.Length > 0)
                //            information.Attributes = instance!;

                //        informationTypes.Add(information);

                //        var filenames = S100FC.YAML.Extensions.GetFileNames(flatten);

                //        foreach (var filename in filenames) {
                //            if (!supportFiles.Contains(filename)) {
                //                supportFiles.Add(filename);
                //            }
                //        }
                //    }
                //}
                //catch (Exception ex) {
                //    Log.Information("Table: informationtype: {message} ", ex.Message);
                //}

                // FeatureType
                try {
                    using var featureType = connection.OpenDataset<Table>(this.QualifyTableName("featuretype"));

                    using var featureCursor = featureType.Search();
                    while (featureCursor.MoveNext()) {
                        var current = featureCursor.Current;

                        var name = $"{current.UID()}";
                        var code = current["code"].ToString()!;
                        var flatten = current.FindField("attributebindings") != -1 &&
                           current["attributebindings"] != null &&
                           current["attributebindings"] != DBNull.Value ?
                           current["attributebindings"].ToString() :
                           string.Empty;
                        var type = featureCatalogue.Assembly!.GetType($"{S100FC.Catalogues.FeatureCatalogue.Namespace("S101", "FeatureTypes")}.{code}", true)!;

                        var instance = S100FC.AttributeFlattenExtensions.Unflatten<S100FC.FeatureType>(flatten, type);

                        var foid = $"110:{name.Substring(1)}:1";       // Geodatastyrelsen: 110

                        var feature = new YAML.Feature {
                            Prim = Primitive.NoGeometry,
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
                foreach (var def in connection.GetDefinitions<FeatureClassDefinition>()) {
                    var tableName = def.GetAliasName();

                    var supported = tableName switch {
                        "surface" => true,
                        "curve" => true,
                        "point" => true,
                        "pointset" => true,
                        _ => false
                    };

                    if (!supported) {
                        Log.Information("Unsupported table detected: {tableName}", tableName);
                        continue;
                    }

                    using var fc = connection.OpenDataset<FeatureClass>(def.GetName());
                    using var featureCursor = fc.Search(filter, true);
                    while (featureCursor.MoveNext()) {
                        var current = (ArcGIS.Core.Data.Feature)featureCursor.Current;
                        var name = $"{current.UID()}";

                        // Only map geometry, and keep name seperate so foids remain unique
                        var geometry = name;

                        if (topology.Mapping.TryGetValue(name!, out var value))
                            geometry = value;

                        var shapetype = def.GetShapeType();

                        var code = Convert.ToString(current["code"]);

                        var foid = $"110:{name.Substring(1)}:1";       // Geodatastyrelsen: 110

                        var prim = shapetype switch {
                            GeometryType.Point => Primitive.Point,
                            GeometryType.Multipoint => Primitive.Point,
                            GeometryType.Polyline => Primitive.Curve,
                            GeometryType.Polygon => Primitive.Surface,
                            _ => throw new InvalidOperationException(),
                        };

                        try {
                            var type = featureCatalogue.Assembly?.GetType($"{S100FC.Catalogues.FeatureCatalogue.Namespace("S101", "FeatureTypes")}.{code}", false) ?? default;

                            if (type == default) {
                                Log.Error("Could not get type: {type} for feature: {name}. In product: {product}", code, name, electronicProduct.datasetName);
                                continue;
                            }
                            // var flatten = current["attributebindings"].ToString()!;
                            var flatten =
                                current.FindField("attributebindings") != -1 &&
                                current["attributebindings"] != null &&
                                current["attributebindings"] != DBNull.Value
                                ? current["attributebindings"].ToString()
                                : string.Empty;

                            var instance = S100FC.AttributeFlattenExtensions.Unflatten<S100FC.FeatureType>(flatten, type);

                            var filenames = S100FC.YAML.Extensions.GetFileNames(flatten);

                            foreach (var filename in filenames) {
                                if (!supportFiles.Contains(filename)) {
                                    supportFiles.Add(filename);
                                }
                            }


                            // Surface Masks
                            var topologySurface = topology.Surfaces.FirstOrDefault(e => e.Ref!.Equals(name, StringComparison.InvariantCultureIgnoreCase));

                            // Build comma seperated string of masks, with :1 or :2 indicating which mask it is. Should be null/omitted if empty.
                            var masks = new[] {
                                    topologySurface?.Masks1?.Select(e => $"C{e}:1"),
                                    topologySurface?.Masks2?.Select(e => $"C{e}:2")
                                }.Where(m => m != null).SelectMany(m => m!);

                            var feature = new YAML.Feature {
                                Name = code,
                                Foid = foid,
                                Prim = prim,
                                Geometry = geometry,
                                Masks = masks.Any() ? string.Join(",", masks) : null,
                                Attributes = instance?.attributeBindings.Length > 0 ? instance : null,
                            };

                            //// Information Associations
                            //if (!current.IsNull("informationbindings")) {
                            //    try {
                            //        var informationBindings = System.Text.Json.JsonSerializer.Deserialize<informationBinding[]>(Convert.ToString(current["informationbindings"])!, this.jsonSerializerOptionsS101);

                            //        if (informationBindings != default && informationBindings.Length != 0) {
                            //            foreach (var binding in informationBindings) {

                            //                var isValid = binding.Validate();

                            //                if (!isValid)
                            //                    continue;

                            //                var asso = new YAML.Association {
                            //                    Name = binding.informationType!, // binding.GetType().GenericTypeArguments[0].Name,
                            //                    Role = binding.role,
                            //                    To = binding.informationId
                            //                };

                            //                if (!informationsTypesAdded.Contains(binding.informationId!)) {
                            //                    dataset!.AddInformation(informationTypes.Single(e => e.ID!.Equals(binding.informationId!)));
                            //                    informationsTypesAdded.Add(binding.informationId!);
                            //                }


                            //                // Special case for SpatialAssociation. Add to dictionary for later processing.
                            //                if (prim != Primitive.Surface && asso.Name.Equals("SpatialAssociation", StringComparison.CurrentCultureIgnoreCase))
                            //                    spatialAssociations.TryAdd(geometry, asso);
                            //                else
                            //                    feature?.AddAssociation(asso);
                            //            }
                            //        }
                            //    }
                            //    catch (Exception ex) {
                            //        Log.Warning(ex, "Error deserializing informationbindings for feature {name}: {message}", name, ex.Message);
                            //    }
                            //}

                            //// Feature Associations
                            //if (!current.IsNull("featurebindings")) {
                            //    try {
                            //        var featureBindings = System.Text.Json.JsonSerializer.Deserialize<featureBinding[]>(Convert.ToString(current["featurebindings"])!, this.jsonSerializerOptionsS101);

                            //        if (featureBindings != default && featureBindings.Length != 0) {
                            //            foreach (var binding in featureBindings) {

                            //                // check if valid
                            //                var isValid = binding.Validate();

                            //                if (!isValid)
                            //                    continue;

                            //                var roleType = binding.roleType;

                            //                // Skip association roleType
                            //                if (roleType == "association")
                            //                    continue;

                            //                var asso = new YAML.Association {
                            //                    Name = binding.featureType!, // binding.GetType().GenericTypeArguments[0].Name,
                            //                    Role = binding.role,
                            //                    To = $"110:{binding!.featureId!.Substring(1)}:1"
                            //                };

                            //                feature?.AddFeatureAssociation(asso);

                            //                var noGeometry = featureTypes.SingleOrDefault(e => e.Foid.Equals($"110:{binding.featureId.Substring(1)}:1"));
                            //                if (noGeometry != null && !featureTypesAdded.Contains(binding.featureId)) {
                            //                    featureTypesAdded.Add(binding.featureId);
                            //                    dataset?.AddFeature(noGeometry);
                            //                }
                            //            }
                            //        }

                            //    }
                            //    catch (Exception ex) {
                            //        Log.Warning(ex, "Error deserializing featurebindings for feature {name}: {message}", name, ex.Message);
                            //    }
                            //}

                            dataset?.AddFeature(feature!);

                            var geometrytype = code!.ToLower() switch {
                                "sounding" => MultipointBuilderEx.CreateMultipoint(current.GetShape() as MapPoint),
                                _ => current.GetShape()
                            };

                            geometries.Add(new(geometrytype, name!));
                        }
                        catch (Exception ex) {
                            Log.Error(ex, ex.Message);
                            throw;
                        }
                    }
                }

                // SupportFiles
                if (supportFiles.Count != 0) {
                    using var attachmentTable = connection.OpenDataset<Table>(this.QualifyTableName("attachment"));

                    using var attachmentCursor = attachmentTable.Search(new QueryFilter {
                        WhereClause = "code = 'supportfile'"
                    });
                    while (attachmentCursor.MoveNext()) {
                        var current = attachmentCursor.Current;

                        var json = current.FindField("json") != -1
                            && current["json"] != null
                            && current["json"] != DBNull.Value
                            ? current["json"].ToString()
                            : string.Empty;

                        if (string.IsNullOrEmpty(json))
                            continue;

                        var file = System.Text.Json.JsonSerializer.Deserialize<S100BlueStack.Settings.SupportFile>(json);

                        if (!supportFiles.Contains(file!.FileName))
                            continue;


                        if (current["data"] is not MemoryStream stream)
                            throw new ArgumentNullException("Column 'data' is not a memory stream");

                        stream.Position = 0;
                        using var reader = new StreamReader(stream);

                        var base64 = Convert.ToBase64String(stream.ToArray());
                        dataset?.Metadata.AddSupportFile(file.FileName, base64);
                    }
                }

                //  Geometries
                foreach (var (geometry, name) in geometries.OrderBy(e => e.geometry.GeometryType)) {
                    if (geometry.GeometryType == GeometryType.Polygon) continue;    // Skip polygons after topology
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
                    using var surface = this._geodatabase.OpenDataset<FeatureClass>(this.QualifyTableName("surface"));

                    this._geodatabase.ApplyEdits(() => {
                        using var cursor = surface.Search(new QueryFilter {
                            WhereClause = $"attributebindings LIKE '%\"{electronicProduct.datasetName}\"%'"
                        }, false);

                        if (!cursor.MoveNext())
                            throw new InvalidOperationException("No matching surface row found.");

                        using var row = cursor.Current;

                        row["attributebindings"] = electronicProduct.Flatten();
                        row.Store();

                    });

                    this._electronicProducts[electronicProduct.datasetName!.ToUpperInvariant()] = electronicProduct;
                }
                return dataset!;
            });
        }

        public async Task CreateAttachmentAsync(string name, ExportTypes exportType, string yaml, string index, string sign) {
            var electronicProduct = this._electronicProducts[name.ToUpperInvariant()];
            var timestamp = DateTime.UtcNow;
            await this.Dispatch(() => {
                this._geodatabase!.ApplyEdits(() => {
                    using var attachment = this._geodatabase!.OpenDataset<Table>(this.QualifyTableName("attachment"));

                    using var buffer = attachment.CreateRowBuffer();

                    buffer["ps"] = "S-128.NuvionPro";
                    buffer["code"] = nameof(Dataset);
                    buffer["json"] = System.Text.Json.JsonSerializer.Serialize(new Dataset {
                        DatasetName = electronicProduct.datasetName!,
                        Edition = electronicProduct.editionNumber!.Value,
                        Update = electronicProduct.updateNumber.GetValueOrDefault(),
                        ExportTypes = exportType,
                        TimestampUTC = timestamp,
                        ProductSpecification = electronicProduct.productSpecification!.name!
                    }, this.jsonSerializerOptions);

                    var memoryStream = Extensions.ZipIt(yaml, index, sign);

                    buffer["data_size"] = memoryStream.Length;
                    buffer["data"] = memoryStream;

                    attachment.CreateRow(buffer);

                    Log.Information("Attachment created for dataset {datasetName} with edition {edition} and update {update}", electronicProduct.datasetName, electronicProduct.editionNumber, electronicProduct.updateNumber);
                });
            });
        }

        public async Task CreateS57AttachmentAsync(string name, ExportTypes exportType, string yaml) {
            var electronicProduct = this._electronicProducts[name.ToUpperInvariant()];
            var timestamp = DateTime.UtcNow;
            await this.Dispatch(() => {
                this._geodatabase!.ApplyEdits(() => {
                    using var attachment = this._geodatabase!.OpenDataset<Table>(this.QualifyTableName("attachment"));

                    using var buffer = attachment.CreateRowBuffer();

                    buffer["ps"] = "S-128.NuvionPro";
                    buffer["code"] = nameof(Dataset);
                    buffer["json"] = System.Text.Json.JsonSerializer.Serialize(new Dataset {
                        DatasetName = electronicProduct.datasetName!,
                        Edition = electronicProduct.editionNumber!.Value,
                        Update = electronicProduct.updateNumber.GetValueOrDefault(),
                        ExportTypes = exportType,
                        TimestampUTC = timestamp,
                        ProductSpecification = "S-57" //electronicProduct.productSpecification!.name!

                    }, this.jsonSerializerOptions);

                    var memoryStream = new MemoryStream(Encoding.UTF8.GetBytes(yaml));
                    //var memoryStream = Extensions.ZipIt(yaml, index, sign);

                    buffer["data_size"] = memoryStream.Length;
                    buffer["data"] = memoryStream;

                    attachment.CreateRow(buffer);

                    Log.Information("Attachment created for dataset {datasetName} with edition {edition} and update {update}", electronicProduct.datasetName, electronicProduct.editionNumber, electronicProduct.updateNumber);
                });
            });
        }

        #endregion

        public void Dispose() {
            if (!this._disposed) {
                this._singleThreadTaskScheduler.Dispose();

                //foreach (var e in this._connections) {
                //    e.Value.Dispose();
                //}
                this._geodatabase?.Dispose();
                this._disposed = true;
            }

            // Prevent the finalizer from running, since we've already cleaned up.
            GC.SuppressFinalize(this);
        }

        private SQLSyntax SQLSyntax => this._geodatabase!.GetSQLSyntax();

        private string QualifyTableName(string tableName) => this.SQLSyntax.QualifyTableName(this._databaseName, this._ownerName, tableName);

        private Geodatabase OpenGeodatabase(Uri connectionFile) {
            Func<Geodatabase> createGeodatabase = () => { throw new NotImplementedException(); };

            var path = connectionFile.LocalPath;

            if (!IO.Path.Exists(path))
                throw new ArgumentNullException($"Could not find or authorize to path: {path}");

            if (".sde".Equals(IO.Path.GetExtension(path), StringComparison.InvariantCultureIgnoreCase)) {
                createGeodatabase = () => { return new Geodatabase(new DatabaseConnectionFile(connectionFile)); };
            }
            else if (".gdb".Equals(IO.Path.GetExtension(path), StringComparison.InvariantCultureIgnoreCase)) {
                createGeodatabase = () => { return new Geodatabase(new FileGeodatabaseConnectionPath(connectionFile)); };
            }
            else
                throw new System.ArgumentOutOfRangeException(nameof(connectionFile));

            return createGeodatabase();
        }

        private async Task<Dataset?> GetLatestDataset(string name) {
            return await this.Dispatch(() => {
                using var attachment = this._geodatabase!.OpenDataset<Table>(this.QualifyTableName("attachment"));

                using var cursor = attachment.Search(new QueryFilter {
                    //WhereClause = $"json LIKE '%\"DatasetName\":\"{name}\"%'",
                    WhereClause = $"json LIKE '%\"{name}\"%'",
                    PostfixClause = "ORDER BY created_date DESC",
                }, true);

                if (!cursor.MoveNext())
                    return default;

                return System.Text.Json.JsonSerializer.Deserialize<Dataset>(Convert.ToString(cursor.Current["json"])!);
            });
        }

        private ArcGIS.Core.Geometry.Geometry GetProductAoiGeometry(string productName) {
            if (string.IsNullOrWhiteSpace(productName))
                throw new ArgumentNullException(nameof(productName));

            using var surface = this._geodatabase!.OpenDataset<FeatureClass>(
                this.QualifyTableName("surface"));

            using var cursor = surface.Search(new QueryFilter {
                WhereClause = $"attributebindings LIKE '%\"{productName}\"%'",
            }, false);

            if (!cursor.MoveNext() || cursor.Current == null)
                throw new InvalidOperationException(
                    $"Could not find product coverage surface for product '{productName}'.");

            if (cursor.Current is not ArcGIS.Core.Data.Feature feature)
                throw new InvalidOperationException(
                    $"Product coverage row for '{productName}' is not a feature.");

            var shape = feature.GetShape();

            if (shape == null || shape.IsEmpty)
                throw new InvalidOperationException(
                    $"Product coverage geometry for '{productName}' is empty.");

            return shape.Clone();
        }

        private async Task<SpatialQueryFilter> BuildSpatialQueryFilter(Dataset dataset) {
            if (dataset == null)
                throw new ArgumentNullException(nameof(dataset));

            if (string.IsNullOrWhiteSpace(dataset.DatasetName))
                throw new ArgumentNullException(nameof(dataset.DatasetName));

            return await this.Dispatch(() => {
                var sqlSyntax = this._geodatabase!.GetSQLSyntax();

                var formattedDate = sqlSyntax.Format(
                    dataset.TimestampUTC,
                    SQLDateTimeType.Timestamp);

                var whereClause =
                    $"UPPER(ps) = 'S-101' AND " +
                    $"(GDB_FROM_DATE > {formattedDate} OR GDB_TO_DATE > {formattedDate})";

                var shapeCoverage = this.GetProductAoiGeometry(dataset.DatasetName);

                return new SpatialQueryFilter {
                    FilterGeometry = shapeCoverage,
                    SpatialRelationship = SpatialRelationship.Relation,
                    SpatialRelationshipDescription = S100FC.Topology.Matrix.DE9IM,
                    WhereClause = whereClause
                };
            });
        }

        public async Task<Dictionary<string, string>> GetDatasetAOIs() {
            return await this.Dispatch(() => {
                var result = new Dictionary<string, string>();

                using var surface = this._geodatabase!.OpenDataset<FeatureClass>(this.QualifyTableName("surface"));
                using var cursor = surface.Search();

                while (cursor.MoveNext()) {
                    var feature = (ArcGIS.Core.Data.Feature)cursor.Current;
                    var boundary = feature.GetShape();

                    var attrBindings = Convert.ToString(feature["attributebindings"]) ?? string.Empty;

                    if (string.IsNullOrEmpty(attrBindings))
                        continue;

                    try {
                        var electronicProduct = S100FC.AttributeFlattenExtensions.Unflatten<ElectronicProduct>(attrBindings!, typeof(ElectronicProduct));

                        if (electronicProduct.datasetName == null)
                            continue;

                        var env = boundary.Extent;

                        // simplify coordinates
                        var rectangle = PolygonBuilder.CreatePolygon(
                        [
                            new Coordinate2D(env.XMin, env.YMin),
                            new Coordinate2D(env.XMax, env.YMin),
                            new Coordinate2D(env.XMax, env.YMax),
                            new Coordinate2D(env.XMin, env.YMax),
                            new Coordinate2D(env.XMin, env.YMin)
                        ], SpatialReferences.WGS84);

                        result[electronicProduct.datasetName!] = rectangle.ToJson();
                    }
                    catch (Exception ex) {
                        continue;
                    }

                }

                return result;
            });
        }

        public async Task<string> GetDatasetBoundary(string datasetName) {
            return await this.Dispatch(() => {
                //using var surface = _geodatabase!.OpenDataset<Table>(QualifyTableName("surface"));

                //using var cursor = surface.Search(new QueryFilter {
                //    WhereClause = $"json LIKE '%\"DatasetName\":\"{datasetName}\"%'",
                //    PostfixClause = "ORDER BY created_date ASC"
                //}, true);

                using var surface = this._geodatabase!.OpenDataset<FeatureClass>(this.QualifyTableName("surface"));

                using var cursor = surface.Search(new QueryFilter {
                    WhereClause = $"attributebindings LIKE '%\"{datasetName}\"%'",
                }, false);

                if (!cursor.MoveNext())
                    throw new InvalidOperationException("No dataset rows found");

                var boundary = ((ArcGIS.Core.Data.Feature)cursor.Current).GetShape();

                return boundary.ToJson()!;
            });

        }

        public async Task<bool> RollBackAsync(string name) {
            await this.Dispatch(() => {

                var electronicProduct = this._electronicProducts[name.ToUpperInvariant()];

                // Delete most recent attachment from attachmenttable
                this._geodatabase!.ApplyEdits(() => {
                    using var attachment = this._geodatabase!.OpenDataset<Table>(this.QualifyTableName("attachment"));

                    var datasetName = electronicProduct.datasetName!;
                    var editionNo = electronicProduct.editionNumber!.Value;
                    var updateNo = electronicProduct.updateNumber;

                    var escapedDatasetName = datasetName.Replace("'", "''");

                    using var cursor = attachment.Search(new QueryFilter {
                        WhereClause =
                            $"ps = 'S-128.NuvionPro' " +
                            $"AND code = '{nameof(Dataset)}' " +
                            $"AND json LIKE '%\"DatasetName\":\"{escapedDatasetName}\"%'"
                    }, false);

                    while (cursor.MoveNext()) {
                        using var row = cursor.Current;
                        var jason = row["json"].ToString()!;

                        var dataset = JsonSerializer.Deserialize<Dataset>(jason);   //, this.jsonSerializerOptions);

                        if (dataset?.Edition == editionNo && dataset.Update == updateNo) {
                            row.Delete();

                            Log.Information("Deleted attachment for dataset {datasetName} edition {edition} update {update}", datasetName, editionNo, updateNo);

                            break;
                        }
                    }



                    // Rollback edition/updateno and save to concurrect dict aswell
                    using var surface = this._geodatabase!.OpenDataset<FeatureClass>(this.QualifyTableName("surface"));

                    using var cursorS128 = surface.Search(new QueryFilter {
                        WhereClause = $"attributebindings LIKE '%\"{electronicProduct.datasetName}\"%'",
                    }, false);

                    cursorS128.MoveNext();

                    Debug.Assert(cursorS128.Current != null);

                    if (electronicProduct.updateNumber > 0)
                        electronicProduct.updateNumber--;
                    else
                        electronicProduct.editionNumber--;


                    var flatten = electronicProduct.Flatten();

                    var row128 = cursorS128.Current;
                    row128["attributebindings"] = flatten;
                    row128.Store();
                    row128.Dispose();

                    this._electronicProducts[electronicProduct.datasetName!.ToUpperInvariant()] = electronicProduct;
                });
            });

            return true;
        }

        public Task CreateElectronicProductAsync(string name, productSpecification productSpecification, string boundary, int? optimumDisplayScale = null) {
            throw new NotImplementedException();
        }
    }

    public sealed class SingleThreadTaskScheduler : TaskScheduler, IDisposable
    {
        private readonly BlockingCollection<Task> _tasks;
        private readonly Thread _processingThread;

        public SingleThreadTaskScheduler() {
            this._tasks = [];

            this._processingThread = new Thread(this.ProcessTasks) {
                IsBackground = true, // Allow the application to exit even if this thread is running
                Name = "SingleThreadTaskScheduler"
            };
            this._processingThread.Start();
        }

        private void ProcessTasks() {
            try {
                foreach (var task in this._tasks.GetConsumingEnumerable()) {
                    this.TryExecuteTask(task);
                }
            }
            catch (ObjectDisposedException) {
                // The collection was disposed, which is fine. The thread can exit.
            }
        }

        protected override void QueueTask(Task task) {
            if (this._tasks.IsAddingCompleted) return;
            this._tasks.Add(task);
        }

        protected override bool TryExecuteTaskInline(Task task, bool taskWasPreviouslyQueued) {
            if (Thread.CurrentThread == this._processingThread) {
                return this.TryExecuteTask(task);
            }

            // Otherwise, we cannot execute it inline. Let QueueTask handle it.
            return false;
        }

        protected override IEnumerable<Task> GetScheduledTasks() {
            return this._tasks.ToArray();
        }

        public override int MaximumConcurrencyLevel => 1;

        public void Dispose() {
            this._tasks.CompleteAdding();
            this._processingThread.Join();
            this._tasks.Dispose();
        }
    }
}
