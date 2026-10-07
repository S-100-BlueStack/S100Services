using ArcGIS.Core.Data;
using ArcGIS.Core.Data.UtilityNetwork.Trace;
using ArcGIS.Core.Geometry;
using ArcGIS.Core.Internal.Geometry;
using Microsoft.Extensions.Logging;
using S100BlueStack.Settings;
using S100FC;
using S100FC.S128.ComplexAttributes;
using S100FC.S128.FeatureAssociation;
using S100FC.S128.FeatureTypes;
using S100FC.S128.SimpleAttributes;
using S100FC.Topology;
using S100FC.YAML;
using S100Horizon.Settings;
using Serilog;
using Serilog.Core;
using System.Collections;
using System.Collections.Concurrent;
using System.Data;
using System.Diagnostics;
using System.IO.Compression;
using System.Globalization;
using System.Reflection.Metadata;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using static System.Runtime.InteropServices.JavaScript.JSType;
using IO = System.IO;

namespace S100FC.ProductCatalogue
{
    public class ProductManagerGDB : IProductManager, INauticalProductManager, IElectronicProductManager, IDisposable
    {
        // Abort implausibly broad archive matches before DPC can create any candidates or advance its watermark.
        internal const int MaxAoisPerArchiveFeature = 50;

        public static async Task<IProductManager> CreateInstanceAsync(
            Func<Geodatabase> creator,
            string executionLane = "Unspecified"
        ) => await new ProductManagerGDB(executionLane).InitializeAsync(creator);

        private bool _disposed = false;

        private readonly SingleThreadTaskScheduler _singleThreadTaskScheduler;

        private readonly TaskFactory _taskFactory;

        private readonly string _executionLane;

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


        private sealed record ElectronicProductKey(string ProductSpecification, string DatasetName)
        {
            public override string ToString() => $"{ProductSpecification}::{DatasetName}";
        }

        private readonly ConcurrentDictionary<ElectronicProductKey, S100FC.S128.FeatureTypes.ElectronicProduct> _electronicProducts = new();
        private readonly ConcurrentDictionary<string, S100FC.S128.FeatureTypes.ElectronicProduct> _preferredElectronicProductsByName = new();
        private ElectronicProductMappingIndex _productMappings = ElectronicProductMappingIndex.Empty;
        // ArcGIS geometries stay on the product manager's single execution lane.
        private readonly Dictionary<string, DpcCoverageCache> _dpcCoverageCaches = new(StringComparer.OrdinalIgnoreCase);
        private static readonly Lazy<TimeZoneInfo> ArchiveUnspecifiedTimeZone = new(ResolveArchiveUnspecifiedTimeZone);

        private ProductManagerGDB(string executionLane) {
            if (string.IsNullOrWhiteSpace(executionLane))
                throw new ArgumentException("An ArcGIS execution lane name is required.", nameof(executionLane));

            this._executionLane = executionLane.Trim();
            this._singleThreadTaskScheduler = new SingleThreadTaskScheduler(
                $"ArcGIS-{this._executionLane}"
            );
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


                var c = cursor.Current;

                var code = Convert.ToString(c["code"]);
                if (!string.IsNullOrEmpty(code) && code.Equals("ProductCatalogue")) {
                    if (!c.IsNull("json")) {
                        var settings = System.Text.Json.JsonSerializer.Deserialize<S100Horizon.Settings.ProductCatalogue>(
                            Convert.ToString(c["json"])!);

                        if (settings != null) {
                            var connections = settings.Connections.Select(e => {
                                var uri = e.ConnectionFile;
                                //var path = $"config/{e.ConnectionFile.OriginalString}";

                                //var exist = IO.Path.Exists(path);

                                Log.Information("Adding connection for {productSpecification}  with connection file: {path}.", e.ProductSpecification, uri?.OriginalString);

                                //  var uri = new Uri(System.IO.Path.GetFullPath(path));

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
                var catalogueEntries = new List<ElectronicProductCatalogueEntry>();
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

                            AddElectronicProduct(electronicProduct);
                            catalogueEntries.Add(new ElectronicProductCatalogueEntry(
                                c.UID(),
                                electronicProduct,
                                c.IsNull("featurebindings") ? null : Convert.ToString(c["featurebindings"])));
                        }
                    }
                }
                _productMappings = ElectronicProductMappingIndex.Create(catalogueEntries);
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

        private Task<TResult> DispatchMeasured<TResult>(
            Func<TResult> function,
            string operationType,
            string? datasetName,
            CancellationToken cancellationToken
        ) {
            var queuedAt = Stopwatch.GetTimestamp();
            var correlationId = Activity.Current?.TraceId.ToString() ?? "unavailable";

            return this._taskFactory.StartNew(() => {
                var executionStartedAt = Stopwatch.GetTimestamp();
                var succeeded = false;

                try {
                    cancellationToken.ThrowIfCancellationRequested();
                    var result = function();
                    succeeded = true;
                    return result;
                }
                finally {
                    var completedAt = Stopwatch.GetTimestamp();
                    Log.Verbose(
                        "ArcGIS operation completed. ExecutionLane: {ExecutionLane}. OperationType: {OperationType}. DatasetName: {DatasetName}. CorrelationId: {CorrelationId}. Success: {Success}. Cancelled: {Cancelled}. ArcGisQueueWaitMs: {ArcGisQueueWaitMs}. ArcGisExecutionMs: {ArcGisExecutionMs}",
                        this._executionLane,
                        operationType,
                        datasetName ?? "unavailable",
                        correlationId,
                        succeeded,
                        cancellationToken.IsCancellationRequested,
                        Stopwatch.GetElapsedTime(queuedAt, executionStartedAt).TotalMilliseconds,
                        Stopwatch.GetElapsedTime(executionStartedAt, completedAt).TotalMilliseconds
                    );
                }
            }, cancellationToken);
        }

        #region IElectronicProductManager

        async Task IElectronicProductManager.CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, int? specificUsage, string boundary, string? productMapping, int? optimumDisplayScale) {
            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));

            name = name.ToUpperInvariant();

            var key = new ElectronicProductKey(productSpecification.name, name);

            await this.Dispatch(() => {
                if (this._preferredElectronicProductsByName.ContainsKey(name))
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
                            updateNumber = 0,
                            agencyResponsibleForProduction = "Danish Geodata Agency",
                            specificUsage = specificUsage,
                            productSpecification = productSpecification,
                            optimumDisplayScale = optimumDisplayScale,



                        };

                        //if (!string.IsNullOrEmpty(productMapping)) {


                        //    featureBinding[] bindings = [
                        //        new featureBinding<ProductMapping>
                        //        {
                        //            roleType = "association",
                        //            role = "theReference",
                        //            association = new() {
                        //               // ProductMapping
                        //            }
                        //        }
                        //    ];

                        //    buffer["featurebindings"] = bindings;

                        //}

                        var flattened = electronicProduct.Flatten();
                        buffer["attributebindings"] = flattened;

                        // cast to EsriGeometry
                        var shape = ArcGIS.Core.Geometry.GeometryEngine.Instance.ImportFromJson(JsonImportFlags.JsonImportDefaults, boundary);
                        buffer["shape"] = shape;
                        surface.CreateRow(buffer);

                        AddElectronicProduct(electronicProduct);
                    }
                });
            });

        }

        Task IElectronicProductManager.CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, /*S100FC.S128.SimpleAttributes.specificUsage specificUsage,*/ string boundary, int edition, int update, byte[] zipfile) => throw new NotImplementedException();

        async Task<YAML.Dataset> IElectronicProductManager.CreateNewDatasetAsync(string name) {
            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));
            name = name.ToUpperInvariant();

            if (!this._preferredElectronicProductsByName.ContainsKey(name))
                throw new System.ArgumentException(nameof(name));

            var result = await this.GetElectronicProductAsync(name);

            if (result.ElectronicProduct.editionNumber > 0)
                throw new InvalidOperationException();

            // set ed/upd
            result.ElectronicProduct.editionNumber = 1;
            result.ElectronicProduct.updateNumber = 0;

            return await this.CreateDatasetAsync(result.ElectronicProduct, result.Shape, ExportTypes.NewDataset);
        }

        async Task<YAML.Dataset> IElectronicProductManager.CreateNewEditionAsync(string name) {
            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));
            name = name.ToUpperInvariant();

            if (!this._preferredElectronicProductsByName.ContainsKey(name))
                throw new System.ArgumentException(nameof(name));

            var result = await this.GetElectronicProductAsync(name);


            result.ElectronicProduct.editionNumber += 1;
            result.ElectronicProduct.updateNumber = 0;


            return await this.CreateDatasetAsync(result.ElectronicProduct, result.Shape, ExportTypes.NewEdition);
        }

        async Task<YAML.Dataset> IElectronicProductManager.CreateNewUpdateAsync(string name) {
            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));
            name = name.ToUpperInvariant();

            if (!this._preferredElectronicProductsByName.ContainsKey(name))
                throw new System.ArgumentException(nameof(name));

            var result = await this.GetElectronicProductAsync(name);


            result.ElectronicProduct.updateNumber += 1;

            return await this.CreateDatasetAsync(result.ElectronicProduct, result.Shape, ExportTypes.Update);
        }

        async Task<YAML.Dataset> IElectronicProductManager.ReissueAsync(string name) {
            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));
            name = name.ToUpperInvariant();

            if (!this._preferredElectronicProductsByName.ContainsKey(name))
                throw new System.ArgumentException(nameof(name));

            var result = await this.GetElectronicProductAsync(name);

            return await this.CreateDatasetAsync(result.ElectronicProduct, result.Shape, ExportTypes.Reissue);
        }

        async Task<YAML.Dataset> IElectronicProductManager.CreateExportSnapshotAsync(string name, ExportTypes exportType, int edition, int update, CancellationToken cancellationToken) {
            return (await CreateVerifiedExportSnapshotAsync(name, exportType, edition, update, [], cancellationToken)).Dataset;
        }

        /// <summary>Distinguishes features outside the product's topology selection from selected features lost during conversion.</summary>
        public async Task<VerifiedExportSnapshot> CreateVerifiedExportSnapshotAsync(string name, ExportTypes exportType, int edition, int update, IReadOnlyCollection<string> requiredFeatureIds, CancellationToken cancellationToken) {
            if (string.IsNullOrWhiteSpace(name))
                throw new ArgumentNullException(nameof(name));
            if (edition < 0)
                throw new ArgumentOutOfRangeException(nameof(edition));
            if (update < 0)
                throw new ArgumentOutOfRangeException(nameof(update));

            cancellationToken.ThrowIfCancellationRequested();
            var result = await this.GetElectronicProductAsync(
                name.ToUpperInvariant(),
                cancellationToken
            );
            result.ElectronicProduct.editionNumber = edition;
            result.ElectronicProduct.updateNumber = update;

            // applyEdits must remain false: SQL owns unverified candidate versions until IC-ENC acceptance.
            var included = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var dataset = await this.CreateDatasetAsync(
                result.ElectronicProduct,
                result.Shape,
                exportType,
                applyEdits: false,
                cancellationToken: cancellationToken,
                requiredFeatureIds: requiredFeatureIds,
                includedChangedFeatureIds: included
            );
            ExportSnapshotVersioning.ApplyCompilerCompatibleVersion(dataset, edition);
            cancellationToken.ThrowIfCancellationRequested();
            return new VerifiedExportSnapshot(dataset, included.ToArray());
        }

        async Task<bool> IElectronicProductManager.IsDirtyAsync(string name) {
            if (string.IsNullOrEmpty(name))
                throw new System.ArgumentNullException(nameof(name));
            name = name.ToUpperInvariant();

            if (!this._preferredElectronicProductsByName.TryGetValue(name, out var electronicProduct))
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
                            var id = cur.UID();
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

            if (!this._preferredElectronicProductsByName.TryGetValue(name, out var electronicProduct))
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

                    var currentFeatureIds = ReadCurrentFeatureIds(fc);

                    using var archiveTable = fc.GetArchiveTable();

                    using var cursor = archiveTable.Search(filter, true);

                    var tableCount = 0;

                    while (cursor.MoveNext()) {
                        var row = cursor.Current;

                        var id = row.UID();

                        if (string.IsNullOrWhiteSpace(id))
                            continue;

                        result[id] = new ArchiveRow {
                            Code = row["Code"]?.ToString(),
                            AttributeBindings = row["attributebindings"]?.ToString(),
                            InformationBindings = row["informationbindings"]?.ToString(),
                            FeatureBindings = row["featurebindings"]?.ToString(),
                            Deleted = IsDeletedFeature(id, currentFeatureIds)
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
            if (sinceUtc.Kind != DateTimeKind.Utc)
                throw new ArgumentException("The archive scan watermark must be a UTC instant.", nameof(sinceUtc));
            var result = new Dictionary<string, Dictionary<string, ArchiveRow>>();

            await this.Dispatch(() => {
                var products = this._electronicProducts
                    .Where(entry => entry.Key.ProductSpecification == "S101")
                    .ToDictionary(entry => entry.Key.DatasetName, entry => entry.Value, StringComparer.OrdinalIgnoreCase);

                foreach (var connectionSettings in this._connections.Where(entry => entry.ProductSpecification.Equals("S-101", StringComparison.OrdinalIgnoreCase))) {
                    var uri = connectionSettings.ConnectionFile!;
                    using var connection = this.OpenGeodatabase(uri);
                    var productsForConnection = products
                        .Where(entry => this.Connection(entry.Value.productSpecification!.name!) == uri)
                        .ToDictionary(entry => entry.Key, entry => entry.Value, StringComparer.OrdinalIgnoreCase);
                    if (productsForConnection.Count == 0)
                        continue;

                    var cacheKey = uri.OriginalString;
                    if (!_dpcCoverageCaches.TryGetValue(cacheKey, out var cache) || HasChangedDataCoverage(connection, cache.LoadedAtUtc)) {
                        cache = BuildDpcCoverageCache(connection, productsForConnection);
                        _dpcCoverageCaches[cacheKey] = cache;
                        Log.Information("DPC coverage cache rebuilt. S101AoiCount: {S101AoiCount}. DataCoverageCount: {DataCoverageCount}. Connection: {Connection}.", cache.Products.Count, cache.DataCoverageCount, connectionSettings.ProductSpecification);
                    }

                    ScanConnectionForPendingEdits(connection, connectionSettings.ProductSpecification, cache.Products, sinceUtc, result);
                }
            });

            return result;
        }

        /// <summary>Pairs an S-101 product's S-128 AOI with its coverage at the same scale.</summary>
        internal sealed record ScanProductAoi(string Name, ArcGIS.Core.Geometry.Geometry Aoi);

        /// <summary>Contains only the S-101 DataCoverage polygons relevant to one S-128 product.</summary>
        internal sealed record DpcProductCoverage(ScanProductAoi Product, long OptimumDisplayScale, IReadOnlyList<ArcGIS.Core.Geometry.Geometry> DataCoverages);

        private sealed record DpcCoverageCache(IReadOnlyList<DpcProductCoverage> Products, int DataCoverageCount, DateTime LoadedAtUtc);

        private DpcCoverageCache BuildDpcCoverageCache(Geodatabase source, IReadOnlyDictionary<string, ElectronicProduct> products) {
            // Capture the lower bound before reading either geodatabase; edits during a rebuild are checked next time.
            var loadedAtUtc = DateTime.UtcNow.AddSeconds(-2);
            var coverages = new List<(long Scale, ArcGIS.Core.Geometry.Geometry Shape)>();
            using (var surface = source.OpenDataset<FeatureClass>(QualifyTableName("surface"))) {
                using var cursor = surface.Search(new QueryFilter { WhereClause = "UPPER(ps) = 'S-101' AND code = 'DataCoverage'" }, true);
                while (cursor.MoveNext()) {
                    var row = cursor.Current;
                    if (row is not ArcGIS.Core.Data.Feature feature)
                        throw new InvalidOperationException("An S-101 DataCoverage row has no feature geometry; DPC cannot rebuild its cache.");
                    var scale = ReadCoverageScale(row);
                    var shape = feature.GetShape();
                    if (shape is null || shape.IsEmpty || shape.SpatialReference is null)
                        throw new InvalidOperationException("An S-101 DataCoverage row has invalid geometry; DPC cannot rebuild its cache.");
                    coverages.Add((scale, shape.Clone()));
                }
            }

            var aois = new Dictionary<string, ArcGIS.Core.Geometry.Geometry>(StringComparer.OrdinalIgnoreCase);
            using (var surface = _geodatabase!.OpenDataset<FeatureClass>(QualifyTableName("surface"))) {
                using var cursor = surface.Search(CreateDatasetAoiQueryFilter(), true);
                while (cursor.MoveNext()) {
                    var row = cursor.Current;
                    if (row.IsNull("attributebindings") || row is not ArcGIS.Core.Data.Feature feature)
                        continue;
                    var product = S100FC.AttributeFlattenExtensions.Unflatten<ElectronicProduct>(Convert.ToString(row["attributebindings"])!, typeof(ElectronicProduct));
                    var name = NormalizeDatasetName(product.datasetName);
                    if (NormalizeProductSpecification(product.productSpecification?.name) != "S101" || !products.ContainsKey(name))
                        continue;
                    var shape = feature.GetShape();
                    if (shape is null || shape.IsEmpty || shape.SpatialReference is null || !aois.TryAdd(name, shape.Clone()))
                        throw new ProductDataIntegrityException(name, aois.ContainsKey(name) ? 2 : 0);
                }
            }

            var coverageByScale = coverages.GroupBy(coverage => coverage.Scale)
                .ToDictionary(group => group.Key, group => group.Select(coverage => coverage.Shape).ToArray());
            var entries = new List<DpcProductCoverage>(products.Count);
            foreach (var (name, product) in products) {
                if (!aois.TryGetValue(name, out var aoi))
                    throw new InvalidOperationException($"Could not find product coverage surface for S-101 product '{name}'.");
                if (!product.optimumDisplayScale.HasValue || product.optimumDisplayScale.Value <= 0)
                    throw new InvalidOperationException($"S-128 product '{name}' has no valid optimumDisplayScale.");
                var optimumScale = Convert.ToInt64(product.optimumDisplayScale.Value, CultureInfo.InvariantCulture);
                var matching = (coverageByScale.GetValueOrDefault(optimumScale) ?? [])
                    .Where(coverage => GeometriesIntersect(coverage, aoi)).ToArray();
                if (matching.Length == 0)
                    Log.Warning("S-128 product {ProductName} has no intersecting S-101 DataCoverage at optimumDisplayScale {OptimumDisplayScale}.", name, optimumScale);
                entries.Add(new DpcProductCoverage(new ScanProductAoi(name, aoi), optimumScale, matching));
            }
            return new DpcCoverageCache(entries, coverages.Count, loadedAtUtc);
        }

        private bool HasChangedDataCoverage(Geodatabase source, DateTime loadedAtUtc) {
            using var surface = source.OpenDataset<FeatureClass>(QualifyTableName("surface"));
            if (!surface.IsArchiveEnabled())
                throw new InvalidOperationException("The S-101 surface is not archive enabled; DPC cannot detect DataCoverage cache changes.");
            using var archive = surface.GetArchiveTable();
            var syntax = source.GetSQLSyntax();
            var since = syntax.Format(loadedAtUtc, SQLDateTimeType.Timestamp);
            var maxDate = syntax.Format(new DateTime(9999, 12, 31), SQLDateTimeType.Timestamp);
            using var cursor = archive.Search(new QueryFilter {
                WhereClause = $"UPPER(ps) = 'S-101' AND code = 'DataCoverage' AND (GDB_FROM_DATE > {since} OR (GDB_TO_DATE > {since} AND GDB_TO_DATE < {maxDate}))"
            }, true);
            return cursor.MoveNext();
        }

        /// <summary>Reads the published S-101 coverage scale, including archived versions of a changed coverage.</summary>
        private static long ReadCoverageScale(Row row) {
            if (row.IsNull("attributebindings"))
                throw new InvalidOperationException("S-101 DataCoverage has no attributeBindings or optimumDisplayScale.");
            return ReadCoverageScale(Convert.ToString(row["attributebindings"])!);
        }

        /// <summary>Uses the DataCoverage attribute, not the nominal scale of another feature.</summary>
        internal static long ReadCoverageScale(string attributeBindings) {
            using var json = JsonDocument.Parse(attributeBindings);
            if (json.RootElement.ValueKind != JsonValueKind.Object)
                throw new InvalidOperationException("S-101 DataCoverage attributeBindings is not an object.");
            foreach (var property in json.RootElement.EnumerateObject()) {
                if (property.Name.Equals("optimumDisplayScale", StringComparison.OrdinalIgnoreCase) &&
                    TryReadScale(property.Value.ToString(), out var scale))
                    return scale;
            }
            throw new InvalidOperationException("S-101 DataCoverage has no valid optimumDisplayScale; DPC preserved its watermark.");
        }

        private static long ReadNominalScale(Row row, string featureId) {
            if (row.FindField("nominalscale") < 0 || row.IsNull("nominalscale") ||
                !TryReadScale(Convert.ToString(row["nominalscale"], CultureInfo.InvariantCulture), out var scale))
                throw new InvalidOperationException($"S-101 archive feature '{featureId}' has no valid nominalscale; DPC preserved its watermark.");
            return scale;
        }

        private static bool TryReadScale(string? value, out long scale) {
            scale = 0;
            if (!decimal.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) ||
                number <= 0 || number > long.MaxValue || number != decimal.Truncate(number))
                return false;
            scale = decimal.ToInt64(number);
            return true;
        }

        private void ScanConnectionForPendingEdits(Geodatabase connection, string connectionName, IEnumerable<DpcProductCoverage> products, DateTime sinceUtc, Dictionary<string, Dictionary<string, ArchiveRow>> result) {
            var productList = products.ToList();

            var sqlSyntax = connection.GetSQLSyntax();

            // Nonversioned archive columns are stored in UTC; only ArcGIS-returned DateTime
            // values without a Kind need interpretation as local wall time.
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
            var unclassifiedArchiveRows = 0;
            var loggedArchiveClock = false;
            var versionsById = new Dictionary<string, List<ArchiveVersion>>(StringComparer.OrdinalIgnoreCase);
            var affectedIdsByProduct = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
            var currentIdsByProduct = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);

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

                var currentFeatureIds = ReadCurrentFeatureIds(fc);

                using var archiveTable = fc.GetArchiveTable();

                using var cursor = archiveTable.Search(new QueryFilter {
                    WhereClause = archiveWhereClause
                }, true);

                var archiveRows = 0;

                var uniqueChangedFeatureIds = new HashSet<string>();
                var affectedProducts = new HashSet<string>();

                while (cursor.MoveNext()) {
                    var row = cursor.Current;

                    string id;
                    try {
                        id = ReadFeatureId(row);
                    }
                    catch (InvalidOperationException exception) {
                        throw new InvalidOperationException($"S-101 archive row in '{baseTableName}' has no usable feature GUID; DPC preserved the watermark and candidates.", exception);
                    }

                    if (row is not ArcGIS.Core.Data.Feature feature) {
                        Log.Warning("Row with UID {id} in {tableName} for connection {connectionName} is not a feature. Skipping geometry check.", id, baseTableName, connectionName);
                        unclassifiedArchiveRows++;
                        continue;
                    }

                    var changedShape = feature.GetShape();

                    if (changedShape == null || changedShape.IsEmpty) {
                        Log.Warning("Feature with UID {id} in {tableName} for connection {connectionName} has no geometry. Skipping.", id, baseTableName, connectionName);
                        unclassifiedArchiveRows++;
                        continue;
                    }

                    archiveRows++;
                    uniqueChangedFeatureIds.Add(id);

                    var fromDate = ReadArchiveUtc(row["GDB_FROM_DATE"]);
                    var toDate = ReadArchiveUtc(row["GDB_TO_DATE"]);
                    if (!loggedArchiveClock) {
                        Log.Information("DPC archive clock. Connection: {Connection}. RawFrom: {RawFrom:O}. RawKind: {RawKind}. NormalizedFromUtc: {FromUtc:O}. UnspecifiedZone: {Zone}.",
                            connectionName, row["GDB_FROM_DATE"], (row["GDB_FROM_DATE"] as DateTime?)?.Kind, fromDate, ArchiveUnspecifiedTimeZone.Value.Id);
                        loggedArchiveClock = true;
                    }
                    // A removed or superseded archive row changed when it closed, not when it began.
                    var changedAt = toDate is { Year: < 9999 } && (!fromDate.HasValue || toDate > fromDate) ? toDate : fromDate;
                    if (changedAt is null)
                        throw new InvalidOperationException($"Archive feature '{id}' in '{baseTableName}' has no readable change date; DPC cannot advance its watermark safely.");
                    var archiveRow = new ArchiveRow {
                        Code = row["Code"]?.ToString() ?? string.Empty,
                        AttributeBindings = row["attributebindings"]?.ToString(),
                        InformationBindings = row["informationbindings"]?.ToString(),
                        FeatureBindings = row["featurebindings"]?.ToString(),
                        Deleted = IsDeletedFeature(id, currentFeatureIds),
                        EditDate = changedAt
                    };
                    if (!versionsById.TryGetValue(id, out var versions)) {
                        versions = new List<ArchiveVersion>();
                        versionsById[id] = versions;
                    }
                    versions.Add(new ArchiveVersion(archiveRow, fromDate, toDate, changedShape.Clone()));

                    var isDataCoverage = baseTableName == "surface" && string.Equals(archiveRow.Code, "DataCoverage", StringComparison.OrdinalIgnoreCase);
                    var nominalScale = isDataCoverage ? ReadCoverageScale(row) : ReadNominalScale(row, id);
                    foreach (var productName in FindAffectedProductsAtScale(changedShape, nominalScale, productList, isDataCoverage ? changedShape : null, id, archiveRow.Code, baseTableName)) {
                        affectedProducts.Add(productName);

                        if (!affectedIdsByProduct.TryGetValue(productName, out var affectedIds)) {
                            affectedIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            affectedIdsByProduct[productName] = affectedIds;
                        }
                        affectedIds.Add(id);
                        if (toDate?.Year == 9999 && !archiveRow.Deleted) {
                            if (!currentIdsByProduct.TryGetValue(productName, out var currentIds)) {
                                currentIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                                currentIdsByProduct[productName] = currentIds;
                            }
                            currentIds.Add(id);
                        }
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

            foreach (var (productName, affectedIds) in affectedIdsByProduct) {
                if (!result.TryGetValue(productName, out var productChanges)) {
                    productChanges = new Dictionary<string, ArchiveRow>(StringComparer.OrdinalIgnoreCase);
                    result[productName] = productChanges;
                }
                foreach (var id in affectedIds) {
                    var change = ComposeArchiveChange(versionsById[id], sinceUtc);
                    change.CurrentInProduct = currentIdsByProduct.TryGetValue(productName, out var currentIds) && currentIds.Contains(id);
                    productChanges[id] = change;
                }
            }

            if (unclassifiedArchiveRows > 0)
                throw new ArchiveChangeClassificationException(connectionName, unclassifiedArchiveRows);
        }

        private sealed record ArchiveVersion(ArchiveRow Row, DateTime? FromUtc, DateTime? ToUtc, ArcGIS.Core.Geometry.Geometry Shape);

        /// <summary>Compares the state at the scan cursor with the final archived state, regardless of cursor order.</summary>
        private static ArchiveRow ComposeArchiveChange(IReadOnlyCollection<ArchiveVersion> versions, DateTime sinceUtc) {
            var before = versions.Where(version => version.FromUtc <= sinceUtc && version.ToUtc > sinceUtc)
                .OrderByDescending(version => version.FromUtc).FirstOrDefault();
            var latest = versions.OrderByDescending(version => version.Row.EditDate).ThenByDescending(version => version.FromUtc).First();
            var after = latest.Row.Deleted ? null : versions.Where(version => version.ToUtc?.Year == 9999)
                .OrderByDescending(version => version.FromUtc).FirstOrDefault();
            if (after is null && !latest.Row.Deleted)
                throw new InvalidOperationException("An archived S-101 feature has no current version; DPC preserved the watermark.");

            var row = after?.Row ?? latest.Row;
            return new ArchiveRow {
                Code = row.Code,
                AttributeBindings = after?.Row.AttributeBindings,
                FeatureBindings = after?.Row.FeatureBindings,
                InformationBindings = after?.Row.InformationBindings,
                BeforeCode = before?.Row.Code,
                BeforeAttributeBindings = before?.Row.AttributeBindings,
                BeforeFeatureBindings = before?.Row.FeatureBindings,
                BeforeInformationBindings = before?.Row.InformationBindings,
                GeometryChanged = before is not null && after is not null && !GeometryEngine.Instance.Equals(before.Shape, after.Shape),
                Deleted = after is null,
                EditDate = versions.Max(version => version.Row.EditDate)
            };
        }

        /// <summary>Converts archive wall time to UTC; explicit UTC and offset values remain absolute instants.</summary>
        internal static DateTime? ReadArchiveUtc(object? value) => value switch {
            null or DBNull => null,
            DateTimeOffset offset => offset.UtcDateTime,
            DateTime { Kind: DateTimeKind.Utc } date => date,
            DateTime { Kind: DateTimeKind.Local } date => date.ToUniversalTime(),
            DateTime date => ConvertArchiveWallTimeToUtc(date),
            _ => throw new InvalidOperationException($"Unsupported geodatabase archive date value of type '{value.GetType().FullName}'.")
        };

        private static DateTime ConvertArchiveWallTimeToUtc(DateTime date) {
            var zone = ArchiveUnspecifiedTimeZone.Value;
            if (zone.IsInvalidTime(date) || zone.IsAmbiguousTime(date))
                throw new InvalidOperationException($"Archive date '{date:O}' is invalid or ambiguous in '{zone.Id}'; DPC preserved its watermark. Supply a UTC archive clock if available.");
            return TimeZoneInfo.ConvertTimeToUtc(date, zone);
        }

        private static TimeZoneInfo ResolveArchiveUnspecifiedTimeZone() {
            // The SDK exposes archive dates without an offset on this installation. Operators can
            // choose UTC when their ArcGIS driver returns the raw UTC database value instead.
            var name = Environment.GetEnvironmentVariable("S101_ARCHIVE_UNSPECIFIED_TIME_ZONE") ?? "Europe/Copenhagen";
            if (name.Equals("Europe/Copenhagen", StringComparison.OrdinalIgnoreCase)) {
                try { return TimeZoneInfo.FindSystemTimeZoneById(name); }
                catch (TimeZoneNotFoundException) { return TimeZoneInfo.FindSystemTimeZoneById("Romance Standard Time"); }
            }
            return TimeZoneInfo.FindSystemTimeZoneById(name);
        }

        /// <summary>Requires both matching coverage and the final S-128 AOI intersection at the feature's scale.</summary>
        internal static IReadOnlyList<string> FindAffectedProductsAtScale(ArcGIS.Core.Geometry.Geometry feature, long nominalScale, IReadOnlyList<DpcProductCoverage> products, ArcGIS.Core.Geometry.Geometry? archivedCoverage = null, string? featureId = null, string? featureCode = null, string? tableName = null) {
            if (nominalScale <= 0)
                throw new InvalidOperationException($"Archive feature '{featureId}' has no positive nominalscale.");
            var eligible = products.Where(product => product.OptimumDisplayScale == nominalScale &&
                (archivedCoverage is not null && GeometriesIntersect(archivedCoverage, product.Product.Aoi) ||
                 product.DataCoverages.Any(coverage => GeometriesIntersect(feature, coverage))))
                .Select(product => product.Product).ToArray();
            return FindAffectedProducts(feature, eligible, featureId, featureCode, tableName);
        }

        private static bool GeometriesIntersect(ArcGIS.Core.Geometry.Geometry source, ArcGIS.Core.Geometry.Geometry target) {
            if (source.SpatialReference is null || target.SpatialReference is null)
                throw new InvalidOperationException("An S-101 feature, DataCoverage, or S-128 AOI has no spatial reference; DPC preserved its watermark.");
            var comparable = source.SpatialReference.IsEqual(target.SpatialReference)
                ? source : GeometryEngine.Instance.Project(source, target.SpatialReference);
            return GeometryEngine.Instance.Intersects(comparable, target);
        }

        /// <summary>Only a real intersection with an AOI may attach an archived change to its product.</summary>
        internal static IReadOnlyList<string> FindAffectedProducts(ArcGIS.Core.Geometry.Geometry feature, IReadOnlyList<ScanProductAoi> products, string? featureId = null, string? featureCode = null, string? tableName = null) {
            if (feature.SpatialReference is null)
                throw new InvalidOperationException("An archived feature has no spatial reference; the scan watermark was preserved.");
            var result = new List<string>();
            var projections = new List<ArcGIS.Core.Geometry.Geometry>();
            foreach (var product in products) {
                if (product.Aoi.SpatialReference is null)
                    throw new InvalidOperationException($"S-101 AOI '{product.Name}' has no spatial reference; the scan watermark was preserved.");
                var comparable = feature;
                if (!feature.SpatialReference.IsEqual(product.Aoi.SpatialReference)) {
                    var projected = projections.FirstOrDefault(shape => shape.SpatialReference.IsEqual(product.Aoi.SpatialReference));
                    if (projected is null) {
                        projected = GeometryEngine.Instance.Project(feature, product.Aoi.SpatialReference);
                        projections.Add(projected);
                    }
                    comparable = projected;
                }
                if (GeometryEngine.Instance.Intersects(comparable, product.Aoi))
                    result.Add(product.Name);
            }
            if (result.Count > MaxAoisPerArchiveFeature) {
                var bounds = feature.Extent;
                var matching = result.ToHashSet(StringComparer.OrdinalIgnoreCase);
                var sample = products.Where(product => matching.Contains(product.Name)).Take(3)
                    .Select(product => $"{product.Name}: {product.Aoi.Extent.XMin},{product.Aoi.Extent.YMin} to {product.Aoi.Extent.XMax},{product.Aoi.Extent.YMax}");
                Log.Error("DPC AOI-intersection matcher v2 rejected excessive spatial fan-out. Table: {TableName}. FeatureId: {FeatureId}. FeatureCode: {FeatureCode}. Matches: {Matches}. AvailableAois: {AvailableAois}. FeatureExtent: {XMin},{YMin} to {XMax},{YMax}. FeatureWkid: {Wkid}. ExampleMatchedAois: {ExampleMatchedAois}.", tableName, featureId, featureCode, result.Count, products.Count, bounds.XMin, bounds.YMin, bounds.XMax, bounds.YMax, feature.SpatialReference.Wkid, string.Join("; ", sample));
                throw new InvalidOperationException($"Archive feature '{featureId}' matched {result.Count} S-101 AOIs. DPC stopped before creating packages; inspect the AOI geometries and spatial references in the error log.");
            }
            return result;
        }

        /// <summary>Reads current feature GUIDs so archived deletes can be identified without a UID column.</summary>
        private static HashSet<string> ReadCurrentFeatureIds(FeatureClass featureClass) {
            var currentFeatureIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            using var cursor = featureClass.Search(new QueryFilter {
                SubFields = "OBJECTID,GLOBALID"
            }, true);

            while (cursor.MoveNext()) {
                currentFeatureIds.Add(ReadFeatureId(cursor.Current));
            }

            return currentFeatureIds;
        }

        private static string ReadFeatureId(Row row) {
            var rawGlobalId = row.FindField("GLOBALID") >= 0 && !row.IsNull("GLOBALID") ? row["GLOBALID"] : null;
            return ResolveFeatureId(row.UID(), rawGlobalId);
        }

        /// <summary>Rejects an empty archive GUID and falls back to the actual GlobalID field when the row extension cannot read it.</summary>
        internal static string ResolveFeatureId(string? extensionId, object? rawGlobalId) {
            if (Guid.TryParse(extensionId, out var id) && id != Guid.Empty)
                return id.ToString("B");
            if (Guid.TryParse(Convert.ToString(rawGlobalId), out id) && id != Guid.Empty)
                return id.ToString("B");
            throw new InvalidOperationException($"UID returned '{extensionId ?? "<null>"}' and GLOBALID returned '{rawGlobalId ?? "<null>"}'.");
        }

        /// <summary>Identifies a deleted feature by its absence from the current feature class version.</summary>
        internal static bool IsDeletedFeature(string featureId, ISet<string> currentFeatureIds) => !currentFeatureIds.Contains(featureId);

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

                    // Accepted ENC packages store a full snapshot. Legacy attachments store deltas.
                    using var metadata = JsonDocument.Parse(Convert.ToString(cursor.Current["json"])!);
                    if (metadata.RootElement.TryGetProperty("PackageId", out _))
                        rootYAML = delta;
                    else if (!string.IsNullOrEmpty(delta))
                        rootYAML = S100FC.YAML.DatasetComparer.AppendUpdate(rootYAML, delta);
                }

                return (rootYAML, index);
            });
        }

        ElectronicProduct? IElectronicProductManager.ElectronicProduct(string name) => this._preferredElectronicProductsByName.GetValueOrDefault(name.ToUpperInvariant());

        ElectronicProduct? IElectronicProductManager.ElectronicProduct(string name, string productSpecification) => this._electronicProducts.GetValueOrDefault(CreateElectronicProductKey(productSpecification, name));

        ElectronicProduct? IElectronicProductManager.ResolveExportProduct(string name) => _productMappings.ResolveByDatasetName(name);

        ElectronicProduct? IElectronicProductManager.ResolveElectronicProduct(string name, string productSpecification) => _productMappings.Resolve(name, productSpecification);

        IReadOnlyList<ElectronicProduct> IElectronicProductManager.GetMappedElectronicProducts(string name, string productSpecification) => _productMappings.GetMapped(name, productSpecification);

        async Task<ElectronicProductVersion?> IElectronicProductManager.ReadElectronicProductVersionAsync(
            string datasetName,
            CancellationToken cancellationToken
        ) => await ReadElectronicProductVersionCoreAsync(datasetName, null, cancellationToken);

        async Task<ElectronicProductVersion?> IElectronicProductManager.ReadElectronicProductVersionAsync(
            string datasetName,
            string productSpecification,
            CancellationToken cancellationToken
        ) => await ReadElectronicProductVersionCoreAsync(datasetName, productSpecification, cancellationToken);

        private async Task<ElectronicProductVersion?> ReadElectronicProductVersionCoreAsync(string datasetName, string? productSpecification, CancellationToken cancellationToken) {
            if (string.IsNullOrWhiteSpace(datasetName))
                throw new ArgumentNullException(nameof(datasetName));

            cancellationToken.ThrowIfCancellationRequested();

            return await this.DispatchMeasured(() => {
                cancellationToken.ThrowIfCancellationRequested();

                using var surface = this._geodatabase!.OpenDataset<FeatureClass>(
                    this.QualifyTableName("surface")
                );
                using var cursor = surface.Search(
                    CreateElectronicProductVersionQueryFilter(),
                    true
                );
                var candidates = new List<ElectronicProduct>();
                var normalizedDatasetName = NormalizeDatasetName(datasetName);

                while (cursor.MoveNext()) {
                    cancellationToken.ThrowIfCancellationRequested();

                    var row = cursor.Current;
                    if (row.IsNull("attributebindings"))
                        continue;

                    var attributes = Convert.ToString(row["attributebindings"]);
                    if (string.IsNullOrWhiteSpace(attributes))
                        continue;

                    var candidateDatasetName = ReadDatasetName(
                        attributes,
                        out _
                    );
                    if (!string.Equals(
                        NormalizeDatasetName(candidateDatasetName),
                        normalizedDatasetName,
                        StringComparison.OrdinalIgnoreCase
                    )) {
                        continue;
                    }

                    var candidate = S100FC.AttributeFlattenExtensions.Unflatten<ElectronicProduct>(
                        attributes,
                        typeof(ElectronicProduct)
                    );
                    if (!string.IsNullOrWhiteSpace(productSpecification) &&
                        !string.Equals(NormalizeProductSpecification(candidate.productSpecification?.name), NormalizeProductSpecification(productSpecification), StringComparison.Ordinal))
                        continue;

                    candidates.Add(candidate);
                }

                return SelectExactElectronicProductVersion(datasetName, candidates);
            }, "ReadElectronicProductVersion", datasetName, cancellationToken);
        }

        private static QueryFilter CreateElectronicProductVersionQueryFilter() => new() {
            WhereClause = "upper(ps) = 'S-128' AND code = 'ElectronicProduct'",
            SubFields = "attributebindings"
        };

        private static ElectronicProductVersion? SelectExactElectronicProductVersion(
            string requestedDatasetName,
            IEnumerable<ElectronicProduct> candidates
        ) {
            var normalizedDatasetName = NormalizeDatasetName(requestedDatasetName);
            var exactMatches = candidates
                .Where(candidate => string.Equals(
                    NormalizeDatasetName(candidate.datasetName),
                    normalizedDatasetName,
                    StringComparison.OrdinalIgnoreCase
                ))
                .ToArray();

            if (exactMatches.Length == 0)
                return null;

            if (exactMatches.Length > 1) {
                var correlationId = Activity.Current?.TraceId.ToString();
                Log.Error(
                    "Multiple exact ElectronicProduct rows found. DatasetName: {DatasetName}. ExactMatchCount: {ExactMatchCount}. CorrelationId: {CorrelationId}",
                    normalizedDatasetName,
                    exactMatches.Length,
                    correlationId
                );
                throw new ProductDataIntegrityException(
                    normalizedDatasetName,
                    exactMatches.Length
                );
            }

            var match = exactMatches[0];
            return new ElectronicProductVersion(
                match.datasetName!.Trim(),
                match.editionNumber,
                match.updateNumber
            );
        }

        private static string NormalizeDatasetName(string? datasetName) =>
            datasetName?.Trim().ToUpperInvariant() ?? string.Empty;

        IEnumerator<string> IEnumerable<string>.GetEnumerator() {
            foreach (var p in this._preferredElectronicProductsByName)
                yield return p.Key;
            yield break;
        }

        IEnumerator IEnumerable.GetEnumerator() => this._preferredElectronicProductsByName.Keys.GetEnumerator();

        //private async Task<(ElectronicProduct ElectronicProduct, SpatialQueryFilter Filter)> GetElectronicProductAsync(
        //    string name,
        //    CancellationToken cancellationToken = default
        //) {
        private async Task<(ElectronicProduct ElectronicProduct, ArcGIS.Core.Geometry.Polygon Shape)> GetElectronicProductAsync(string name, CancellationToken cancellationToken = default) {
            return await this.DispatchMeasured(() => {
                cancellationToken.ThrowIfCancellationRequested();
                using var surface = this._geodatabase!.OpenDataset<FeatureClass>(this.QualifyTableName("surface"));
                using var cursorS128 = surface.Search(new QueryFilter {
                    WhereClause = "upper(ps) = 'S-128' AND code = 'ElectronicProduct'",
                    SubFields = "attributebindings, shape"
                }, true);

                var matches = new List<(ElectronicProduct Product, ArcGIS.Core.Geometry.Polygon Shape)>();
                while (cursorS128.MoveNext()) {
                    cancellationToken.ThrowIfCancellationRequested();
                    var row = cursorS128.Current;
                    if (row.IsNull("attributebindings") || row is not ArcGIS.Core.Data.Feature feature)
                        continue;

                    var product = S100FC.AttributeFlattenExtensions.Unflatten<ElectronicProduct>(Convert.ToString(row["attributebindings"])!, typeof(ElectronicProduct));
                    if (NormalizeDatasetName(product.datasetName) != NormalizeDatasetName(name) ||
                        NormalizeProductSpecification(product.productSpecification?.name) != NormalizeProductSpecification("S-101"))
                        continue;

                    matches.Add((product, (ArcGIS.Core.Geometry.Polygon)feature.GetShape().Clone()));
                }

                if (matches.Count == 0)
                    throw new ArgumentException($"No S-101 ElectronicProduct named '{name}' was found in S-128.", nameof(name));
                if (matches.Count > 1)
                    throw new ProductDataIntegrityException(name, matches.Count);

                var electronicProduct = matches[0].Product;
                var shapeCoverage = matches[0].Shape;
                //var shapeCoverage = (ArcGIS.Core.Geometry.Polygon)((ArcGIS.Core.Data.Feature)cursorS128.Current).GetShape();

                // TODO: FIX, only exist in s101
                // var nominalScale = cursorS128.Current["nominalScale"] != null ? Convert.ToInt64(cursorS128.Current["nominalScale"]) : 0;

                var whereClause = "upper(ps) = 'S-101'";


                var filter = new SpatialQueryFilter {
                    FilterGeometry = shapeCoverage,
                    SpatialRelationship = SpatialRelationship.Relation,
                    SpatialRelationshipDescription = S100FC.Topology.Matrix.DE9IM,
                    WhereClause = whereClause,
                };

                return (electronicProduct, shapeCoverage);
            }, "ResolveExportSourceProduct", name, cancellationToken);
        }

        private async Task<YAML.Dataset> CreateDatasetAsync(ElectronicProduct electronicProduct, ArcGIS.Core.Geometry.Polygon shape, ExportTypes exportType, bool applyEdits = true, CancellationToken cancellationToken = default, IReadOnlyCollection<string>? requiredFeatureIds = null, ISet<string>? includedChangedFeatureIds = null) {
            var timestamp = DateTime.UtcNow;

            var featureCatalogue = S100FC.Catalogues.FeatureCatalogue.Catalogues.Single(e => e.ProductID.Equals("S-101"));

            var regFileReference = new Regex("fileReference\":\"(?<filename>[^\"]+)", RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.IgnorePatternWhitespace);
            var regPictorialRepresentation = new Regex("pictorialRepresentation\":\"(?<filename>[^\"]+)", RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.IgnorePatternWhitespace);

            //var uri = this.Connection(electronicProduct.productSpecification!.name!, electronicProduct.optimumDisplayScale!.Value)!;
            var uri = this.Connection(electronicProduct.productSpecification!.name!)!;

            long nominalscale = electronicProduct.optimumDisplayScale!.Value;

            electronicProduct.issueDate = DateOnly.FromDateTime(timestamp);

            var dataset = new S100FC.YAML.Dataset {
                CellName = $"{electronicProduct!.datasetName!}.000",
                Comment = electronicProduct.notForNavigation.HasValue ? "Not for navigation!" : string.Empty,
                Edition = (uint?)electronicProduct.editionNumber,
                ENCVer = "INT.IHO.S-101.2.0",
                FCVer = "2.0",
                VerticalDatum = "Baltic Sea Chart Datum 2000,44",
                //Update = (uint?)electronicProduct.updateNumber,   // todo: Bug in s100ocompiler and must always be null
            };

            var supportFiles = new Dictionary<string, string>();
            var geometries = new List<(ArcGIS.Core.Geometry.Geometry geometry, string name)>();
            var spatialAssociations = new Dictionary<string, S100FC.YAML.Association>();
            var informationTypes = new List<YAML.Information>();
            var informationsTypesAdded = new HashSet<string>();
            var featureTypes = new List<YAML.Feature>();
            var featureTypesAdded = new HashSet<string>();
            var exportedFeatureIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var selectedFeatureIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var collapsedFeatureIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            return await this.DispatchMeasured(() => {
                cancellationToken.ThrowIfCancellationRequested();
                using Geodatabase connection = this.OpenGeodatabase(uri);

                var s101Uri = this.Connection("S-101") ?? throw new InvalidOperationException("No S-101 geodatabase connection is configured.");
                using var s101Geodatabase = this.OpenGeodatabase(s101Uri);

                using var loggerFactory = LoggerFactory.Create(builder => {
                    builder.SetMinimumLevel(LogLevel.Trace);
                    builder.AddSerilog();

                });


                // TODO: Fix S101_QueryDataCoverage. Returns empty array and causes BuildTopology to fail.
                var filters = s101Geodatabase.S101_QueryDataCoverage(shape, nominalscale).Select(result => result.Filter).ToArray();
                var result = connection.BuildTopology(filters, loggerFactory: loggerFactory)!;

                var topology = result.matrix;
                var selection = result.selection;
                var collapse = topology.Collapse;

                cancellationToken.ThrowIfCancellationRequested();

                // InformationTypes
                try {
                    using var informationType = connection.OpenDataset<Table>(this.QualifyTableName("informationtype"));

                    using var informationCursor = informationType.Search();
                    while (informationCursor.MoveNext()) {
                        cancellationToken.ThrowIfCancellationRequested();
                        var current = informationCursor.Current;

                        var uid = current.UID();
                        var name = Guid.Parse(uid).ToStableUInt64().ToString();
                        var code = current["code"].ToString()!;
                        var flatten = current.FindField("attributebindings") != -1 &&
                            current["attributebindings"] != null &&
                            current["attributebindings"] != DBNull.Value ?
                            current["attributebindings"].ToString() :
                            string.Empty;

                        var type = featureCatalogue.Assembly!.GetType($"{S100FC.Catalogues.FeatureCatalogue.Namespace("S101", "InformationTypes")}.{code}", true)!;
                        var instance = S100FC.AttributeFlattenExtensions.Unflatten<S100FC.InformationType>(flatten, type);

                        var information = new YAML.Information {
                            Name = code,
                            ID = name,
                        };
                        // Only emit attributes if feature contains any non-static properties
                        if (instance?.attributeBindings.Length > 0)
                            information.Attributes = instance!;

                        informationTypes.Add(information);

                        var filenames = S100FC.YAML.Extensions.GetFileNames(flatten);

                        foreach (var filename in filenames) {
                            supportFiles.Add(uid, filename);
                        }
                    }
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
                    throw;
                }
                catch (Exception ex) {
                    Log.Information("Table: informationtype: {message} ", ex.Message);
                }

                // FeatureType
                try {
                    using var featureType = connection.OpenDataset<Table>(this.QualifyTableName("featuretype"));

                    using var featureCursor = featureType.Search();
                    while (featureCursor.MoveNext()) {
                        cancellationToken.ThrowIfCancellationRequested();
                        var current = featureCursor.Current;

                        var uid = current.UID();
                        var name = Guid.Parse(uid).ToStableUInt64().ToString();
                        var code = current["code"].ToString()!;
                        var flatten = current.FindField("attributebindings") != -1 &&
                           current["attributebindings"] != null &&
                           current["attributebindings"] != DBNull.Value ?
                           current["attributebindings"].ToString() :
                           string.Empty;
                        var type = featureCatalogue.Assembly!.GetType($"{S100FC.Catalogues.FeatureCatalogue.Namespace("S101", "FeatureTypes")}.{code}", true)!;

                        var instance = S100FC.AttributeFlattenExtensions.Unflatten<S100FC.FeatureType>(flatten, type);

                        var foid = $"110:{name}:1";       // Geodatastyrelsen: 110

                        var feature = new YAML.Feature {
                            Prim = Primitive.NoGeometry,
                            Name = code,
                            Foid = foid,
                            Attributes = instance?.attributeBindings.Length > 0 ? instance : null,
                        };

                        featureTypes.Add(feature);

                        var filenames = S100FC.YAML.Extensions.GetFileNames(flatten);

                        foreach (var filename in filenames) {
                            supportFiles.Add(uid, filename);
                        }
                    }
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
                    throw;
                }
                catch (Exception ex) {
                    Log.Information("Table: featuretype: {message} ", ex.Message);
                }

                //  Features
                foreach (var def in connection.GetDefinitions<FeatureClassDefinition>()) {
                    cancellationToken.ThrowIfCancellationRequested();
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

                    var hashSet = new HashSet<long>();

                    using var fc = connection.OpenDataset<FeatureClass>(def.GetName());

                    if (selection.ContainsKey(tableName.ToLowerInvariant()) && selection[tableName.ToLowerInvariant()].Any()) {
                        using var cursor = fc.Search(new QueryFilter {
                            WhereClause = $"OBJECTID IN ({string.Join(',', selection[tableName.ToLowerInvariant()])})",
                            SubFields = "OBJECTID,GLOBALID,CODE,attributeBindings,informationBindings,featureBindings,SHAPE",
                        }, true);

                        while (cursor.MoveNext()) {
                            var current = (ArcGIS.Core.Data.Feature)cursor.Current;

                            //if ("DataCoverage".Equals(Convert.ToString(current["code"]), StringComparison.InvariantCultureIgnoreCase)) System.Diagnostics.Debugger.Break();                                    

                            var oid = current.GetObjectID();
                            if (hashSet.Contains(oid)) continue;
                            hashSet.Add(oid);

                            var _uid = current.UID();// Convert.ToString(current["UID"])!;

                            var currentFeatureId = ReadFeatureId(current);
                            if (requiredFeatureIds is not null && requiredFeatureIds.Contains(currentFeatureId, StringComparer.OrdinalIgnoreCase))
                                selectedFeatureIds.Add(currentFeatureId);

                            if (collapse.Contains(_uid)) {
                                collapsedFeatureIds.Add(currentFeatureId);
                                continue;
                            }

                            string[] features = [_uid];

                            if (result.mapper.Values.Contains(_uid)) {
                                features = result.mapper.Where(e => e.Value.Equals(_uid)).Select(e => e.Key).ToArray();
                            }

                            foreach (var uid in features) {
                                //if ("F10400000368".Equals(uid)) System.Diagnostics.Debugger.Break();

                                // Only map geometry, and keep name seperate so foids remain unique
                                var geometry = uid;

                                var shapetype = def.GetShapeType();

                                var prim = shapetype switch {
                                    GeometryType.Point => Primitive.Point,
                                    GeometryType.Multipoint => Primitive.Point,
                                    GeometryType.Polyline => Primitive.Curve,
                                    GeometryType.Polygon => Primitive.Surface,
                                    _ => throw new InvalidOperationException(),
                                };


                                if (topology.MappingFOID.TryGetValue(uid!, out var value)) {
                                    geometry = value;
                                }
                                else if (prim == Primitive.Surface || prim == Primitive.Curve)
                                    continue;
                                else {
                                    geometry = $"P{Guid.Parse(uid).ToStableUInt64()}";
                                }

                                var code = Convert.ToString(current["code"]);

                                var split = uid.Split(':');

                                //var foid = $"110:{Guid.Parse(uid).ToStableUInt64()}:1";// : $"110:{Guid.Parse(uid).ToStableUInt64()}:1";
                                var foid = uid.Contains(':') ? $"110:{Guid.Parse(split[0]).ToStableUInt64()}:{split[^1]}" : $"110:{Guid.Parse(uid).ToStableUInt64()}:1";// : $"110:{Guid.Parse(uid).ToStableUInt64()}:1";

                                try {
                                    var type = featureCatalogue.Assembly!.GetType($"{S100FC.Catalogues.FeatureCatalogue.Namespace("S101", "FeatureTypes")}.{code}", true) ?? default;

                                    if (type == default) {
                                        Log.Error("Could not get type: {type} for feature: {name}", code, uid);
                                        continue;
                                    }

                                    var json = Convert.ToString(current["attributebindings"])!;

                                    var instance = string.IsNullOrEmpty(json) ? null : S100FC.AttributeFlattenExtensions.Unflatten<S100FC.FeatureType>(json, type);

                                    var filenames = S100FC.YAML.Extensions.GetFileNames(json);

                                    foreach (var filename in filenames) {
                                        supportFiles.TryAdd(uid, filename);
                                    }

                                    // Surface Masks
                                    var topologySurface = topology.Surfaces.FirstOrDefault(e => e.Ref!.Equals(uid, StringComparison.InvariantCultureIgnoreCase));

                                    // Build comma seperated string of masks, with :1 or :2 indicating which mask it is. Should be null/omitted if empty.
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
                                        Attributes = instance?.attributeBindings.Length > 0 ? instance : null
                                    };


                                    // Information Associations
                                    if (!current.IsNull("informationbindings")) {
                                        var informationBindings = System.Text.Json.JsonSerializer.Deserialize<informationBinding[]>(Convert.ToString(current["informationbindings"])!); // jsonSerializerOptionsS101

                                        if (informationBindings != default && informationBindings.Any()) {
                                            foreach (var binding in informationBindings) {
                                                var asso = new S100FC.YAML.Association {
                                                    Name = binding.association!.S100FC_code,
                                                    Role = binding.role,
                                                    To = $"{Guid.Parse(binding.informationId).ToStableUInt64()}",
                                                };

                                                // Special case for SpatialAssociation. Add to dictionary for later processing.
                                                if (prim != Primitive.Surface && asso.Name.Equals("SpatialAssociation", StringComparison.CurrentCultureIgnoreCase))
                                                    spatialAssociations.TryAdd(geometry, asso);
                                                else
                                                    feature?.AddAssociation(asso);


                                                var newEntry = informationsTypesAdded.Add(binding.informationId!);
                                                if (newEntry) {
                                                    dataset!.AddInformation(informationTypes.Single(e => e.ID!.Equals($"{Guid.Parse(binding.informationId).ToStableUInt64()}")));

                                                    if (supportFiles.TryGetValue(binding.informationId!, out var filename)) {

                                                        // TODO: how get attachment?
                                                        var attachment = connection.GetAttachment(filename);
                                                        if (attachment is not null) {
                                                            var base64 = Convert.ToBase64String(attachment.Value.stream.ToArray());
                                                            dataset?.Metadata.AddSupportFile(filename, base64);
                                                        }
                                                        else {
                                                            if (System.Diagnostics.Debugger.IsAttached)
                                                                System.Diagnostics.Debugger.Break();
                                                            Log.Error("File not found ({filename})!", filename);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    // Feature Associations
                                    if (!current.IsNull("featurebindings")) {
                                        var featureBindingsJson = Convert.ToString(current["featurebindings"])!;
                                        var featureBindings = System.Text.Json.JsonSerializer.Deserialize<featureBinding[]>(featureBindingsJson); // jsonSerializerOptionsS101

                                        if (featureBindings != default && featureBindings.Any()) {
                                            foreach (var binding in featureBindings) {
                                                var roleType = binding.roleType;

                                                // Skip association roleType for now
                                                if (roleType == "association")
                                                    continue;

                                                var asso = new S100FC.YAML.Association {
                                                    Name = binding.association!.S100FC_code,
                                                    Role = binding.role,
                                                    To = $"110:{Guid.Parse(binding.featureId!).ToStableUInt64()}:1"
                                                };

                                                feature?.AddFeatureAssociation(asso);

                                                var noGeometry = featureTypes.SingleOrDefault(e => e.Foid.Equals($"110:{Guid.Parse(binding.featureId!).ToStableUInt64()}:1"));
                                                if (noGeometry != null && !featureTypesAdded.Contains(binding.featureId)) {
                                                    featureTypesAdded.Add(binding.featureId);
                                                    dataset?.AddFeature(noGeometry);
                                                }
                                            }
                                        }
                                    }

                                    //if ("F10500070853".Equals(name)) System.Diagnostics.Debugger.Break();

                                    //var lookup = topology.MappingFeature(name);

                                    //if (!lookup.Any())
                                    dataset?.AddFeature(feature!);
                                    exportedFeatureIds.Add(currentFeatureId);
                                    if (Guid.TryParse(uid, out var exportedId))
                                        exportedFeatureIds.Add(exportedId.ToString("B"));
                                    //else {
                                    //    int _ = 1;
                                    //    foreach (var c in lookup) {
                                    //        feature!.Foid = $"110:{name.Substring(1)}:{_++}";
                                    //        feature!.Geometry = c;
                                    //        dataset?.AddFeature(feature!);
                                    //    }
                                    //}

                                    Action geometryConverter = tableName.Split('.', StringSplitOptions.RemoveEmptyEntries)[^1] switch {
                                        "pointset" or "topo_pointset" => () => {
                                            var _ = MultipointBuilderEx.CreateMultipoint((MapPoint)current.GetShape());
                                            geometries.Add(new(_, uid!));
                                        }
                                        ,
                                        "point" or "topo_point" => () => {
                                            geometries.Add(new(current.GetShape(), uid!));
                                        }
                                        ,
                                        _ => () => { }
                                        ,
                                    };

                                    geometryConverter();
                                    //geometries.Add(new(current.GetShape(), name!));                                        
                                }
                                catch (Exception ex) {
                                    Log.Error("Exception: {ex}", ex);
                                    if (Guid.TryParse(_uid, out var failedId) && requiredFeatureIds?.Contains(failedId.ToString("B"), StringComparer.OrdinalIgnoreCase) == true)
                                        throw new InvalidOperationException($"Detected S-101 feature '{_uid}' could not be included in the export snapshot.", ex);
                                    continue;
                                }
                            }
                        }
                    }
                    // using var featureCursor = fc.Search(filter, true);


                    //if (selection.ContainsKey(tableName.ToLowerInvariant()) && selection[tableName.ToLowerInvariant()].Any()) {

                    //    using var featureCursor = fc.Search(new QueryFilter {
                    //        WhereClause = $"OBJECTID IN ({string.Join(',', selection[tableName.ToLowerInvariant()])})",
                    //        SubFields = "OBJECTID,GLOBALID,CODE,attributeBindings,informationBindings,featureBindings,SHAPE",
                    //    }, true);


                    //    while (featureCursor.MoveNext()) {
                    //        cancellationToken.ThrowIfCancellationRequested();
                    //        var current = (ArcGIS.Core.Data.Feature)featureCursor.Current;
                    //        var name = current.UID();



                    //        var oid = current.GetObjectID();
                    //        if (hashSet.Contains(oid)) continue;
                    //        hashSet.Add(oid);

                    //        var _uid = name;

                    //        // if (topology.matrix.Collapse.Contains(_uid)) continue;
                    //        if (collapse.Contains(_uid)) continue;
                    //        var shapetype = def.GetShapeType();

                    //        var prim = shapetype switch {
                    //            GeometryType.Point => Primitive.Point,
                    //            GeometryType.Multipoint => Primitive.Point,
                    //            GeometryType.Polyline => Primitive.Curve,
                    //            GeometryType.Polygon => Primitive.Surface,
                    //            _ => throw new InvalidOperationException(),
                    //        };

                    //        var featureMappings = TopologyFeatureMapping.Resolve(
                    //            _uid,
                    //            prim,
                    //            result.mapper,
                    //            topology.MappingFOID,
                    //            topology.Surfaces);

                    //        foreach (var featureMapping in featureMappings) {
                    //            cancellationToken.ThrowIfCancellationRequested();
                    //            var geometry = featureMapping.Geometry;

                    //            var code = Convert.ToString(current["code"]);

                    //            var foid = featureMapping.Foid;

                    //            try {
                    //                var type = featureCatalogue.Assembly?.GetType($"{S100FC.Catalogues.FeatureCatalogue.Namespace("S101", "FeatureTypes")}.{code}", false) ?? default;

                    //                if (type == default) {
                    //                    Log.Error("Could not get type: {type} for feature: {name}. In product: {product}", code, name, electronicProduct.datasetName);
                    //                    continue;
                    //                }
                    //                // var flatten = current["attributebindings"].ToString()!;
                    //                var flatten =
                    //                    current.FindField("attributebindings") != -1 &&
                    //                    current["attributebindings"] != null &&
                    //                    current["attributebindings"] != DBNull.Value
                    //                    ? current["attributebindings"].ToString()
                    //                    : string.Empty;

                    //                var instance = S100FC.AttributeFlattenExtensions.Unflatten<S100FC.FeatureType>(flatten, type);

                    //                var filenames = S100FC.YAML.Extensions.GetFileNames(flatten);

                    //                foreach (var filename in filenames) {
                    //                    supportFiles.Add(name, filename);
                    //                }


                    //                var feature = new YAML.Feature {
                    //                    Name = code,
                    //                    Foid = foid,
                    //                    Prim = prim,
                    //                    Geometry = geometry,
                    //                    Masks = featureMapping.Masks,
                    //                    Attributes = instance?.attributeBindings.Length > 0 ? instance : null,
                    //                };

                    //                // Information Associations
                    //                if (!current.IsNull("informationbindings")) {
                    //                    try {
                    //                        var informationBindings = System.Text.Json.JsonSerializer.Deserialize<informationBinding[]>(Convert.ToString(current["informationbindings"])!);

                    //                        if (informationBindings != default && informationBindings.Length != 0) {
                    //                            foreach (var binding in informationBindings) {

                    //                                var isValid = binding.Validate();

                    //                                if (!isValid)
                    //                                    continue;

                    //                                var asso = new YAML.Association {
                    //                                    Name = binding.informationType!, // binding.GetType().GenericTypeArguments[0].Name,
                    //                                    Role = binding.role,
                    //                                    To = Guid.Parse(binding.informationId!).ToStableUInt64().ToString()
                    //                                };

                    //                                var wasAdded = informationsTypesAdded.Add(binding.informationId!);
                    //                                if (wasAdded) {
                    //                                    dataset!.AddInformation(informationTypes.Single(e => e.ID == asso.To));


                    //                                    using var attachmentTable = connection.OpenDataset<Table>(this.QualifyTableName("attachment"));

                    //                                    var hasSupportFile = supportFiles.ContainsKey(binding.informationId!);

                    //                                    if (hasSupportFile) {
                    //                                        var filename = supportFiles.GetValueOrDefault(binding.informationId!);

                    //                                        var escapedFilename = filename.Replace("'", "''");

                    //                                        using var attachmentCursor = attachmentTable.Search(new QueryFilter {
                    //                                            WhereClause = $"code = 'supportfile' AND json LIKE '%{escapedFilename}%'"
                    //                                        });


                    //                                        while (attachmentCursor.MoveNext()) {
                    //                                            cancellationToken.ThrowIfCancellationRequested();
                    //                                            var curr = attachmentCursor.Current;

                    //                                            var json = curr.FindField("json") != -1
                    //                                                && curr["json"] != null
                    //                                                && curr["json"] != DBNull.Value
                    //                                                ? curr["json"].ToString()
                    //                                                : string.Empty;

                    //                                            if (string.IsNullOrEmpty(json))
                    //                                                continue;

                    //                                            var file = System.Text.Json.JsonSerializer.Deserialize<S100BlueStack.Settings.SupportFile>(json);


                    //                                            if (curr["data"] is not MemoryStream stream)
                    //                                                throw new ArgumentNullException("Column 'data' is not a memory stream");

                    //                                            stream.Position = 0;
                    //                                            using var reader = new StreamReader(stream);

                    //                                            var base64 = Convert.ToBase64String(stream.ToArray());

                    //                                            // Avoid adding duplicate support files.
                    //                                            if (dataset?.Metadata?.SupportFiles?.Any(e => string.Equals(e.Name, file.FileName, StringComparison.OrdinalIgnoreCase)) == true) {
                    //                                                continue;
                    //                                            }

                    //                                            dataset?.Metadata?.AddSupportFile(file.FileName, base64);
                    //                                        }

                    //                                    }
                    //                                }


                    //                                // Special case for SpatialAssociation. Add to dictionary for later processing.
                    //                                if (prim != Primitive.Surface && asso.Name.Equals("SpatialAssociation", StringComparison.CurrentCultureIgnoreCase))
                    //                                    spatialAssociations.TryAdd(geometry, asso);
                    //                                else
                    //                                    feature?.AddAssociation(asso);
                    //                            }
                    //                        }
                    //                    }
                    //                    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
                    //                        throw;
                    //                    }
                    //                    catch (Exception ex) {
                    //                        Log.Warning(ex, "Error deserializing informationbindings for feature {name}: {message}", name, ex.Message);
                    //                    }
                    //                }

                    //                // Feature Associations
                    //                if (!current.IsNull("featurebindings")) {
                    //                    try {
                    //                        var featureBindings = System.Text.Json.JsonSerializer.Deserialize<featureBinding[]>(Convert.ToString(current["featurebindings"])!);

                    //                        if (featureBindings != default && featureBindings.Length != 0) {
                    //                            foreach (var binding in featureBindings) {

                    //                                // check if valid
                    //                                var isValid = binding.Validate();

                    //                                if (!isValid)
                    //                                    continue;

                    //                                var roleType = binding.roleType;

                    //                                // Skip association roleType
                    //                                if (roleType == "association")
                    //                                    continue;

                    //                                var asso = new YAML.Association {
                    //                                    Name = binding.featureType!, // binding.GetType().GenericTypeArguments[0].Name,
                    //                                    Role = binding.role,
                    //                                    To = TopologyFeatureMapping.CreateFoid(binding.featureId!)
                    //                                };

                    //                                feature?.AddFeatureAssociation(asso);

                    //                                var noGeometry = featureTypes.SingleOrDefault(e => e.Foid == asso.To);
                    //                                if (noGeometry != null && !featureTypesAdded.Contains(binding.featureId)) {
                    //                                    featureTypesAdded.Add(binding.featureId);
                    //                                    dataset?.AddFeature(noGeometry);
                    //                                }
                    //                            }
                    //                        }

                    //                    }
                    //                    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
                    //                        throw;
                    //                    }
                    //                    catch (Exception ex) {
                    //                        Log.Warning(ex, "Error deserializing featurebindings for feature {name}: {message}", name, ex.Message);
                    //                    }
                    //                }

                    //                dataset?.AddFeature(feature!);

                    //                var geometrytype = code!.ToLower() switch {
                    //                    "sounding" => MultipointBuilderEx.CreateMultipoint(current.GetShape() as MapPoint),
                    //                    _ => current.GetShape()
                    //                };

                    //                geometries.Add(new(geometrytype, geometry!));


                    //            }
                    //            catch (Exception ex) {
                    //                Log.Error(ex, ex.Message);
                    //                throw;
                    //            }
                    //        }
                    //    }
                    //}
                }

                //// SupportFiles
                //if (supportFiles.Count != 0) {
                //    using var attachmentTable = connection.OpenDataset<Table>(this.QualifyTableName("attachment"));

                //    using var attachmentCursor = attachmentTable.Search(new QueryFilter {
                //        WhereClause = "code = 'supportfile'"
                //    });
                //    while (attachmentCursor.MoveNext()) {
                //        var current = attachmentCursor.Current;

                //        var json = current.FindField("json") != -1
                //            && current["json"] != null
                //            && current["json"] != DBNull.Value
                //            ? current["json"].ToString()
                //            : string.Empty;

                //        if (string.IsNullOrEmpty(json))
                //            continue;

                //        var file = System.Text.Json.JsonSerializer.Deserialize<S100BlueStack.Settings.SupportFile>(json);

                //        if (!supportFiles.Contains(file!.FileName))
                //            continue;


                //        if (current["data"] is not MemoryStream stream)
                //            throw new ArgumentNullException("Column 'data' is not a memory stream");

                //        stream.Position = 0;
                //        using var reader = new StreamReader(stream);

                //        var base64 = Convert.ToBase64String(stream.ToArray());
                //        dataset?.Metadata.AddSupportFile(file.FileName, base64);
                //    }
                //}

                //  Geometries
                foreach (var (geometry, name) in geometries.OrderBy(e => e.geometry.GeometryType)) {
                    cancellationToken.ThrowIfCancellationRequested();
                    if (geometry.GeometryType == GeometryType.Polygon) continue;    // Skip polygons after topology
                    dataset?.AddGeometry(geometry, name!);
                    Log.Verbose("Adding {geometryType} with ID: {name}", geometry.GeometryType, name);
                }

                if (requiredFeatureIds is not null) {
                    var missing = requiredFeatureIds.Where(id => selectedFeatureIds.Contains(id) &&
                        !exportedFeatureIds.Contains(id) && !collapsedFeatureIds.Contains(id)).ToArray();
                    if (missing.Length > 0)
                        throw new InvalidOperationException($"Selected S-101 feature(s) were omitted during topology mapping or YAML conversion: {string.Join(", ", missing)}. DPC preserved its watermark.");
                    foreach (var id in requiredFeatureIds.Where(exportedFeatureIds.Contains))
                        includedChangedFeatureIds?.Add(id);
                    foreach (var id in requiredFeatureIds.Where(id => !selectedFeatureIds.Contains(id)))
                        Log.Information("DPC source feature {FeatureId} is outside the topology selection for {DatasetName}; it is not required in this product's YAML.", id, electronicProduct.datasetName);
                    foreach (var id in requiredFeatureIds.Where(collapsedFeatureIds.Contains))
                        Log.Information("DPC source surface {FeatureId} collapsed during topology for {DatasetName}; it is not emitted as a feature.", id, electronicProduct.datasetName);
                }
                dataset!.AddTopology(topology);

                // Add Spatial Association Informationbindings. Must be handled after curves are added to dataset.
                foreach (var sa in spatialAssociations) {
                    cancellationToken.ThrowIfCancellationRequested();
                    var curve = dataset?.Curves?.FirstOrDefault(e => e.Name == sa.Key);

                    curve?.AddAssociation(sa.Value);
                }

                // Apply Edits

                if (applyEdits) {
                    cancellationToken.ThrowIfCancellationRequested();
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

                    AddElectronicProduct(electronicProduct);
                }
                cancellationToken.ThrowIfCancellationRequested();
                return dataset!;
            }, $"CreateDataset:{exportType}", electronicProduct.datasetName, cancellationToken);
        }

        public async Task CreateAttachmentAsync(string name, ExportTypes exportType, string yaml, string index, string sign) {
            var electronicProduct = this._preferredElectronicProductsByName[name.ToUpperInvariant()];
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
            var electronicProduct = _productMappings.Resolve(name, "S-57")
                ?? throw new ArgumentException($"No S-57 ElectronicProduct named or ProductMapped from '{name}' was found.", nameof(name));
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

        /// <summary>Publishes the two bound products and the source attachment in one geodatabase edit transaction.</summary>
        async Task IElectronicProductManager.PublishAcceptedEncPackageAsync(EncPackagePublication publication, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNull(publication);
            if (publication.PackageId == Guid.Empty || string.IsNullOrWhiteSpace(publication.DatasetYaml) || publication.CompilerIndex.Length == 0)
                throw new ArgumentException("The accepted package must include its identity, YAML and S-101 compiler index.", nameof(publication));

            await Dispatch(() => {
                cancellationToken.ThrowIfCancellationRequested();
                var mapped = _productMappings.GetMapped(publication.S101DatasetName, "S-57");
                if (mapped.Count != 1 || !string.Equals(mapped[0].datasetName, publication.S57DatasetName, StringComparison.OrdinalIgnoreCase))
                    throw new ProductMappingIntegrityException("The accepted S-57 and S-101 products no longer have an exact ProductMapping binding.");

                using var surface = _geodatabase!.OpenDataset<FeatureClass>(QualifyTableName("surface"));
                using var attachment = _geodatabase.OpenDataset<Table>(QualifyTableName("attachment"));
                var existingAttachment = false;
                var sourceSha256 = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(publication.DatasetYaml)));
                using (var existing = attachment.Search(new QueryFilter {
                    WhereClause = $"json LIKE '%{publication.PackageId:D}%'"
                }, true)) {
                    while (existing.MoveNext()) {
                        using var document = JsonDocument.Parse(Convert.ToString(existing.Current["json"])!);
                        if (document.RootElement.TryGetProperty("PackageId", out var id) && id.GetGuid() == publication.PackageId) {
                            if (existingAttachment || !document.RootElement.TryGetProperty("SourceSha256", out var hash) ||
                                !string.Equals(hash.GetString(), sourceSha256, StringComparison.Ordinal) ||
                                !document.RootElement.TryGetProperty("DatasetName", out var name) ||
                                !string.Equals(name.GetString(), publication.S101DatasetName, StringComparison.OrdinalIgnoreCase))
                                throw new InvalidOperationException("Conflicting S-128 attachment metadata exists for this package.");
                            existingAttachment = true;
                        }
                    }
                }

                var products = new Dictionary<string, ElectronicProduct>(StringComparer.OrdinalIgnoreCase);
                using (var cursor = surface.Search(CreateElectronicProductVersionQueryFilter(), true)) {
                    while (cursor.MoveNext()) {
                        var row = cursor.Current;
                        if (row.IsNull("attributebindings")) continue;
                        var product = S100FC.AttributeFlattenExtensions.Unflatten<ElectronicProduct>(Convert.ToString(row["attributebindings"])!, typeof(ElectronicProduct));
                        var specification = NormalizeProductSpecification(product.productSpecification?.name);
                        var wanted = specification == "S57" && string.Equals(product.datasetName, publication.S57DatasetName, StringComparison.OrdinalIgnoreCase) ||
                                     specification == "S101" && string.Equals(product.datasetName, publication.S101DatasetName, StringComparison.OrdinalIgnoreCase);
                        if (wanted && !products.TryAdd(specification, product))
                            throw new ProductMappingIntegrityException("Multiple S-128 ElectronicProduct rows match an accepted package product.");
                    }
                }
                if (!products.TryGetValue("S57", out var s57) || !products.TryGetValue("S101", out var s101))
                    throw new ProductMappingIntegrityException("An accepted package product is missing from the S-128 surface table.");

                var s57Published = s57.editionNumber == publication.S57Edition && s57.updateNumber.GetValueOrDefault() == publication.S57Update;
                var s101Published = s101.editionNumber == publication.S101Edition && s101.updateNumber.GetValueOrDefault() == publication.S101Update;
                if (existingAttachment) {
                    if (!s57Published || !s101Published)
                        throw new InvalidOperationException("The package attachment exists but S-128 product versions do not match; manual repair is required.");
                    return;
                }
                if (s57Published || s101Published || s57.editionNumber > publication.S57Edition || s101.editionNumber > publication.S101Edition)
                    throw new InvalidOperationException("An S-128 product version changed outside package finalization; manual review is required.");

                var publishedAtUtc = DateTime.UtcNow;
                var updated = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                _geodatabase.ApplyEdits(() => {
                    using var cursor = surface.Search(new QueryFilter { WhereClause = "upper(ps) = 'S-128' AND code = 'ElectronicProduct'" }, false);
                    while (cursor.MoveNext()) {
                        using var row = cursor.Current;
                        if (row.IsNull("attributebindings")) continue;
                        var product = S100FC.AttributeFlattenExtensions.Unflatten<ElectronicProduct>(Convert.ToString(row["attributebindings"])!, typeof(ElectronicProduct));
                        var specification = NormalizeProductSpecification(product.productSpecification?.name);
                        if (specification == "S57" && string.Equals(product.datasetName, publication.S57DatasetName, StringComparison.OrdinalIgnoreCase)) {
                            product.editionNumber = publication.S57Edition;
                            product.updateNumber = publication.S57Update;
                        }
                        else if (specification == "S101" && string.Equals(product.datasetName, publication.S101DatasetName, StringComparison.OrdinalIgnoreCase)) {
                            product.editionNumber = publication.S101Edition;
                            product.updateNumber = publication.S101Update;
                        }
                        else continue;

                        if (!updated.Add(specification))
                            throw new ProductMappingIntegrityException("A duplicate S-128 ElectronicProduct appeared during publication.");
                        // The issued dataset was built from the package snapshot; acceptance can arrive days later.
                        product.issueDate = DateOnly.FromDateTime(publication.DetectedAtUtc);
                        row["attributebindings"] = product.Flatten();
                        row.Store();
                        products[specification] = product;
                    }
                    if (updated.Count != 2)
                        throw new ProductMappingIntegrityException("An accepted product disappeared during S-128 publication.");

                    using var buffer = attachment.CreateRowBuffer();
                    buffer["ps"] = "S-128.NuvionPro";
                    buffer["code"] = nameof(Dataset);
                    buffer["json"] = JsonSerializer.Serialize(new {
                        publication.PackageId,
                        SourceSha256 = sourceSha256,
                        DatasetName = publication.S101DatasetName,
                        Edition = publication.S101Edition,
                        Update = publication.S101Update,
                        ExportTypes = s101.editionNumber.GetValueOrDefault() == 0 ? ExportTypes.NewDataset : publication.S101Update > 0 ? ExportTypes.Update : ExportTypes.NewEdition,
                        TimestampUTC = publishedAtUtc,
                        ProductSpecification = "S-101"
                    }, jsonSerializerOptions);
                    using var data = new MemoryStream();
                    using (var archive = new ZipArchive(data, ZipArchiveMode.Create, leaveOpen: true)) {
                        Write(archive, "yaml", Encoding.UTF8.GetBytes(publication.DatasetYaml));
                        Write(archive, "index", publication.CompilerIndex);
                        Write(archive, "sign", publication.CatalogueSignature);
                    }
                    data.Position = 0;
                    buffer["data_size"] = data.Length;
                    buffer["data"] = data;
                    attachment.CreateRow(buffer);
                });

                AddElectronicProduct(products["S57"]);
                AddElectronicProduct(products["S101"]);
                Log.Information("Accepted ENC package {PackageId} published in S-128.", publication.PackageId);
            });

            static void Write(ZipArchive archive, string name, byte[] bytes) {
                using var stream = archive.CreateEntry(name).Open();
                stream.Write(bytes);
            }
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

        private ArcGIS.Core.Geometry.Geometry GetProductAoiGeometry(string productName, string productSpecification) {
            if (string.IsNullOrWhiteSpace(productName))
                throw new ArgumentNullException(nameof(productName));

            using var surface = this._geodatabase!.OpenDataset<FeatureClass>(
                this.QualifyTableName("surface"));

            using var cursor = surface.Search(new QueryFilter {
                WhereClause = "upper(ps) = 'S-128' AND code = 'ElectronicProduct'",
                SubFields = "attributebindings, shape"
            }, true);

            var matches = new List<ArcGIS.Core.Geometry.Geometry>();
            while (cursor.MoveNext()) {
                var row = cursor.Current;
                if (row.IsNull("attributebindings") || row is not ArcGIS.Core.Data.Feature feature)
                    continue;
                var product = S100FC.AttributeFlattenExtensions.Unflatten<ElectronicProduct>(Convert.ToString(row["attributebindings"])!, typeof(ElectronicProduct));
                if (NormalizeDatasetName(product.datasetName) != NormalizeDatasetName(productName) ||
                    NormalizeProductSpecification(product.productSpecification?.name) != NormalizeProductSpecification(productSpecification))
                    continue;
                var shape = feature.GetShape();
                if (shape != null && !shape.IsEmpty)
                    matches.Add(shape.Clone());
            }

            return matches.Count switch {
                1 => matches[0],
                0 => throw new InvalidOperationException($"Could not find product coverage surface for {productSpecification} product '{productName}'."),
                _ => throw new ProductDataIntegrityException(productName, matches.Count)
            };
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

                var shapeCoverage = this.GetProductAoiGeometry(dataset.DatasetName, "S-101");

                return new SpatialQueryFilter {
                    FilterGeometry = shapeCoverage,
                    SpatialRelationship = SpatialRelationship.Relation,
                    SpatialRelationshipDescription = S100FC.Topology.Matrix.DE9IM,
                    WhereClause = whereClause
                };
            });
        }

        private static QueryFilter CreateDatasetAoiQueryFilter() {
            return new QueryFilter {
                WhereClause = $"upper(ps) = 'S-128' AND code = '{nameof(ElectronicProduct)}'",
                SubFields = "attributebindings, shape",
            };
        }

        private static string? ReadDatasetName(
            string attrBindings,
            out bool usedUnflattenFallback
        ) {
            usedUnflattenFallback = false;

            if (TryReadDatasetNameFromJson(attrBindings, out var datasetName))
                return datasetName;

            usedUnflattenFallback = true;

            var electronicProduct =
                S100FC.AttributeFlattenExtensions.Unflatten<ElectronicProduct>(
                    attrBindings,
                    typeof(ElectronicProduct)
                );

            return electronicProduct.datasetName;
        }

        private static bool TryReadDatasetNameFromJson(
            string attrBindings,
            out string? datasetName
        ) {
            datasetName = null;

            try {
                using var document = JsonDocument.Parse(attrBindings);
                return TryReadDatasetNameFromJsonElement(
                    document.RootElement,
                    out datasetName
                );
            }
            catch (JsonException) {
                return false;
            }
        }

        private static bool TryReadDatasetNameFromJsonElement(
            JsonElement element,
            out string? datasetName
        ) {
            datasetName = null;

            if (element.ValueKind == JsonValueKind.Object) {
                foreach (var property in element.EnumerateObject()) {
                    if (
                        property.Name.Equals(
                            "datasetName",
                            StringComparison.OrdinalIgnoreCase
                        ) &&
                        property.Value.ValueKind == JsonValueKind.String
                    ) {
                        var value = property.Value.GetString();

                        if (!string.IsNullOrWhiteSpace(value)) {
                            datasetName = value;
                            return true;
                        }
                    }

                    if (
                        TryReadDatasetNameFromJsonElement(
                            property.Value,
                            out datasetName
                        )
                    ) {
                        return true;
                    }
                }
            }
            else if (element.ValueKind == JsonValueKind.Array) {
                foreach (var item in element.EnumerateArray()) {
                    if (TryReadDatasetNameFromJsonElement(item, out datasetName))
                        return true;
                }
            }

            return false;
        }

        private static double StopwatchTicksToMilliseconds(long stopwatchTicks) {
            return stopwatchTicks * 1000d / Stopwatch.Frequency;
        }

        public Task<Dictionary<string, string>> GetDatasetAOIs() => GetDatasetAOIsCore(null);

        public Task<Dictionary<string, string>> GetDatasetAOIs(string productSpecification) => GetDatasetAOIsCore(productSpecification);

        private async Task<Dictionary<string, string>> GetDatasetAOIsCore(string? productSpecification) {
            var dispatchStartedAt = Stopwatch.GetTimestamp();
            var executionStartedAt = 0L;
            var executionCompletedAt = 0L;
            var correlationId = Activity.Current?.TraceId.ToString() ?? "unavailable";
            var rowsScanned = 0;
            var rowsAccepted = 0;
            var rowsSkippedMissingAttributes = 0;
            var rowsSkippedMissingDatasetName = 0;
            var rowsFailed = 0;
            var geometryCount = 0;
            var datasetNameFastPathCount = 0;
            var datasetNameUnflattenFallbackCount = 0;
            var openAndSearchStopwatchTicks = 0L;
            var cursorMoveNextStopwatchTicks = 0L;
            var attributeReadStopwatchTicks = 0L;
            var datasetNameReadStopwatchTicks = 0L;
            var geometryReadStopwatchTicks = 0L;
            var rectangleSerializationStopwatchTicks = 0L;
            var succeeded = false;

            try {
                var result = await this.Dispatch(() => {
                    executionStartedAt = Stopwatch.GetTimestamp();

                    try {
                        var dispatchResult = new Dictionary<string, string>();

                        var openAndSearchStartedAt = Stopwatch.GetTimestamp();
                        using var surface = this._geodatabase!.OpenDataset<FeatureClass>(
                            this.QualifyTableName("surface")
                        );
                        using var cursor = surface.Search(
                            CreateDatasetAoiQueryFilter(),
                            true
                        );
                        openAndSearchStopwatchTicks +=
                            Stopwatch.GetTimestamp() - openAndSearchStartedAt;

                        while (true) {
                            var moveNextStartedAt = Stopwatch.GetTimestamp();
                            var hasNext = cursor.MoveNext();
                            cursorMoveNextStopwatchTicks +=
                                Stopwatch.GetTimestamp() - moveNextStartedAt;

                            if (!hasNext)
                                break;

                            rowsScanned++;

                            var feature = (ArcGIS.Core.Data.Feature)cursor.Current;

                            var attributeReadStartedAt = Stopwatch.GetTimestamp();
                            var attrBindings =
                                Convert.ToString(feature["attributebindings"]) ??
                                string.Empty;
                            attributeReadStopwatchTicks +=
                                Stopwatch.GetTimestamp() - attributeReadStartedAt;

                            if (string.IsNullOrEmpty(attrBindings)) {
                                rowsSkippedMissingAttributes++;
                                continue;
                            }

                            try {
                                var datasetNameReadStartedAt = Stopwatch.GetTimestamp();
                                var datasetName = ReadDatasetName(
                                    attrBindings,
                                    out var usedUnflattenFallback
                                );
                                datasetNameReadStopwatchTicks +=
                                    Stopwatch.GetTimestamp() -
                                    datasetNameReadStartedAt;

                                if (usedUnflattenFallback)
                                    datasetNameUnflattenFallbackCount++;
                                else
                                    datasetNameFastPathCount++;

                                if (string.IsNullOrWhiteSpace(datasetName)) {
                                    rowsSkippedMissingDatasetName++;
                                    continue;
                                }

                                // The same dataset name can exist for multiple specifications, so the current row is authoritative.
                                if (!string.IsNullOrWhiteSpace(productSpecification)
                                    && !MatchesProductSpecification(attrBindings, productSpecification))
                                    continue;

                                var geometryReadStartedAt = Stopwatch.GetTimestamp();
                                var boundary = feature.GetShape();
                                var env = boundary.Extent;
                                geometryReadStopwatchTicks +=
                                    Stopwatch.GetTimestamp() - geometryReadStartedAt;

                                var rectangleSerializationStartedAt =
                                    Stopwatch.GetTimestamp();

                                // The public AOI contract returns the existing extent-based rectangle.
                                var rectangle = PolygonBuilder.CreatePolygon(
                                [
                                    new Coordinate2D(env.XMin, env.YMin),
                                    new Coordinate2D(env.XMax, env.YMin),
                                    new Coordinate2D(env.XMax, env.YMax),
                                    new Coordinate2D(env.XMin, env.YMax),
                                    new Coordinate2D(env.XMin, env.YMin)
                                ], SpatialReferences.WGS84);

                                dispatchResult[datasetName] = rectangle.ToJson();
                                rectangleSerializationStopwatchTicks +=
                                    Stopwatch.GetTimestamp() -
                                    rectangleSerializationStartedAt;
                                rowsAccepted++;
                            }
                            catch (Exception) {
                                rowsFailed++;
                                continue;
                            }
                        }

                        geometryCount = dispatchResult.Count;
                        return dispatchResult;
                    }
                    finally {
                        executionCompletedAt = Stopwatch.GetTimestamp();
                    }
                });

                succeeded = true;
                return result;
            }
            finally {
                var dispatchCompletedAt = Stopwatch.GetTimestamp();
                var queueWaitMs = executionStartedAt == 0
                    ? 0d
                    : Stopwatch.GetElapsedTime(
                        dispatchStartedAt,
                        executionStartedAt
                    ).TotalMilliseconds;
                var executionMs = executionStartedAt == 0 || executionCompletedAt == 0
                    ? 0d
                    : Stopwatch.GetElapsedTime(
                        executionStartedAt,
                        executionCompletedAt
                    ).TotalMilliseconds;
                var dispatchTotalMs = Stopwatch.GetElapsedTime(
                    dispatchStartedAt,
                    dispatchCompletedAt
                ).TotalMilliseconds;

                Log.Verbose(
                    "AOI ArcGIS profiling completed. ExecutionLane: {ExecutionLane}. OperationType: {OperationType}. CorrelationId: {CorrelationId}. Success: {Success}. ArcGisDispatchTotalMs: {ArcGisDispatchTotalMs}. ArcGisQueueWaitMs: {ArcGisQueueWaitMs}. ArcGisExecutionMs: {ArcGisExecutionMs}. ArcGisOpenAndSearchMs: {ArcGisOpenAndSearchMs}. ArcGisCursorMoveNextMs: {ArcGisCursorMoveNextMs}. ArcGisAttributeReadMs: {ArcGisAttributeReadMs}. ArcGisDatasetNameReadMs: {ArcGisDatasetNameReadMs}. ArcGisGeometryReadMs: {ArcGisGeometryReadMs}. ArcGisRectangleSerializationMs: {ArcGisRectangleSerializationMs}. DatasetNameFastPathCount: {DatasetNameFastPathCount}. DatasetNameUnflattenFallbackCount: {DatasetNameUnflattenFallbackCount}. RowsScanned: {RowsScanned}. RowsAccepted: {RowsAccepted}. RowsSkippedMissingAttributes: {RowsSkippedMissingAttributes}. RowsSkippedMissingDatasetName: {RowsSkippedMissingDatasetName}. RowsFailed: {RowsFailed}. GeometryCount: {GeometryCount}",
                    this._executionLane,
                    "GetDatasetAOIs",
                    correlationId,
                    succeeded,
                    dispatchTotalMs,
                    queueWaitMs,
                    executionMs,
                    StopwatchTicksToMilliseconds(openAndSearchStopwatchTicks),
                    StopwatchTicksToMilliseconds(cursorMoveNextStopwatchTicks),
                    StopwatchTicksToMilliseconds(attributeReadStopwatchTicks),
                    StopwatchTicksToMilliseconds(datasetNameReadStopwatchTicks),
                    StopwatchTicksToMilliseconds(geometryReadStopwatchTicks),
                    StopwatchTicksToMilliseconds(
                        rectangleSerializationStopwatchTicks
                    ),
                    datasetNameFastPathCount,
                    datasetNameUnflattenFallbackCount,
                    rowsScanned,
                    rowsAccepted,
                    rowsSkippedMissingAttributes,
                    rowsSkippedMissingDatasetName,
                    rowsFailed,
                    geometryCount
                );
            }
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

        public Task CreateElectronicProductAsync(string name, productSpecification productSpecification, string boundary, int? optimumDisplayScale = null) {
            throw new NotImplementedException();
        }

        private void AddElectronicProduct(ElectronicProduct electronicProduct) {
            var key = CreateElectronicProductKey(electronicProduct);
            _electronicProducts[key] = electronicProduct;
            _preferredElectronicProductsByName.AddOrUpdate(key.DatasetName, electronicProduct, (_, existing) => NormalizeProductSpecification(electronicProduct.productSpecification?.name) == "S101" ? electronicProduct : existing);
        }

        private static ElectronicProductKey CreateElectronicProductKey(ElectronicProduct electronicProduct) => CreateElectronicProductKey(electronicProduct.productSpecification?.name, electronicProduct.datasetName);

        private static ElectronicProductKey CreateElectronicProductKey(string? productSpecification, string? datasetName) => new(NormalizeProductSpecification(productSpecification), datasetName?.Trim().ToUpperInvariant() ?? string.Empty);

        private static bool MatchesProductSpecification(string attrBindings, string requestedProductSpecification) {
            var electronicProduct = S100FC.AttributeFlattenExtensions.Unflatten<ElectronicProduct>(attrBindings, typeof(ElectronicProduct));
            return string.Equals(NormalizeProductSpecification(electronicProduct.productSpecification?.name), NormalizeProductSpecification(requestedProductSpecification), StringComparison.Ordinal);
        }

        private static string NormalizeProductSpecification(string? value) => value?.Replace("-", string.Empty, StringComparison.Ordinal).Trim().ToUpperInvariant() ?? string.Empty;
    }

    public sealed class SingleThreadTaskScheduler : TaskScheduler, IDisposable
    {
        private readonly BlockingCollection<Task> _tasks;
        private readonly Thread _processingThread;

        public SingleThreadTaskScheduler(string threadName = "SingleThreadTaskScheduler") {
            if (string.IsNullOrWhiteSpace(threadName))
                throw new ArgumentException("A scheduler thread name is required.", nameof(threadName));

            this._tasks = [];

            this._processingThread = new Thread(this.ProcessTasks) {
                IsBackground = true, // Allow the application to exit even if this thread is running
                Name = threadName
            };
            this._processingThread.SetApartmentState(ApartmentState.STA);
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
