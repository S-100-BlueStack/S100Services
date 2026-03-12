using ArcGIS.Core.Data;
using ArcGIS.Core.Hosting.Threading.Tasks;
using ProductCatalogueService.Data.Repositories;
using S100FC.S128.FeatureTypes;

namespace ProductCatalogueService.Jobs
{
    public class DetectProductChangesJob(IProductRepository repository, ILogger<DetectProductChangesJob> logger) : IBackgroundJob
    {
        private readonly IProductRepository _repository = repository;
        private readonly ILogger<DetectProductChangesJob> _logger = logger;
        public async Task RunAsync(CancellationToken token) {
            _logger.LogInformation("Job: {jobName} started", nameof(DetectProductChangesJob));
            
            throw new NotImplementedException();

            var products = await _repository.GetCurrentAsync();

           

            _logger.LogInformation("Job: {jobName} finished", nameof(DetectProductChangesJob));
        }
    }

    //public async Task CheckForChangesAsync(CancellationToken token) {
    //    var connection = CreateGeodatabase(f);
    //    var sqlSyntax = connection.GetSQLSyntax();

    //    var filter = new QueryFilter();

    //    // 1) get products
    //    var products =


    //    //2) foreach product, build queryfilter with spatial dimensions
    //    //3) query all archive table(point/ pointset / curve / surface) in s101 with queryfilter
    //    //4) save all rows with edits for later analysis
    //    //5) Apply rules supplied from EPK that decide if its newupdate / newedition
    //    //6) Write to JobState table with new PendingUpdates state + result from update/ edition analysis




    //    await QueuedWorker.Run(() => {
    //        //string[] tableNames = ["point", "pointset", "curve", "surface"];
    //        //foreach (var baseTableName in tableNames) {
    //        //    using var fc = connection.OpenDataset<FeatureClass>("baseTableName");

    //        //    // read fc and figure out dataset timestamp


    //        //    var formattedDate = sqlSyntax.Format(dataset.TimestampUTC, SQLDateTimeType.Timestamp);

    //        //    var isArchived = fc.IsArchiveEnabled();
    //        //    if (isArchived) {
    //        //        var archiveTable = fc.GetArchiveTable();

    //        //        using var archiveCursor = archiveTable.Search(filter);
    //        //        while (archiveCursor.MoveNext()) {
    //        //            var cur = archiveCursor.Current;
    //        //            var id = cur["UID"]?.ToString();
    //        //            var flatten = cur["flatten"]?.ToString();

    //        //            _logger.LogInformation("Change detected for {id} in {table}. Stopping further detection", id, baseTableName);
    //        //            return true;
    //        //        }
    //        //    }
    //        //    else {
    //        //        _logger.LogWarning("Archive is not enabled on {tableName}. Should only happen while debugging! Checking for 'created_date' or 'last_edited_date' instead", baseTableName);
    //        //        filter.WhereClause = $"UPPER(ps) = 'S-101' AND (" +
    //        //                             $"created_date > DATE '{dataset.TimestampUTC:yyyy-MM-dd HH:mm:ss}' " +
    //        //                             $"OR last_edited_date > DATE '{dataset.TimestampUTC:yyyy-MM-dd HH:mm:ss}')";

    //        //        using var cursor = fc.Search(filter, true);
    //        //        while (cursor.MoveNext()) {
    //        //            return true;
    //        //        }
    //        //    }
    //        //}
    //        return false;
    //    });



    //}

    //private static async Task GetProducts(Geodatabase geodatabase) {
    //    await QueuedWorker.Run(() => {
    //        using (var surface = geodatabase!.OpenDataset<FeatureClass>("surface")) {
    //            using var cursor = surface.Search(new QueryFilter {
    //                WhereClause = "upper(ps) = 'S-128'"
    //            }, true);
    //            while (cursor.MoveNext()) {
    //                var c = cursor.Current;

    //                if (c.IsNull("code")) continue;

    //                var code = Convert.ToString(c["code"])!;
    //                if (code.Equals(nameof(S100FC.S128.FeatureTypes.ElectronicProduct))) {
    //                    var json = c["flatten"];

    //                    var electronicProduct = S100FC.AttributeFlattenExtensions.Unflatten<ElectronicProduct>(json.ToString(), typeof(ElectronicProduct));
    //                    //  this._electronicProducts.GetOrAdd(electronicProduct.datasetName!.ToUpperInvariant(), electronicProduct);
    //                }
    //            }
    //        }
    //    });
    //}

    //private static Geodatabase CreateGeodatabase(string path) {
    //    if (".sde".Equals(System.IO.Path.GetExtension(path), StringComparison.OrdinalIgnoreCase)) {
    //        var connectionFile = new DatabaseConnectionFile(new Uri(System.IO.Path.GetFullPath(path)));

    //        return new Geodatabase(connectionFile);
    //    }
    //    else if (".gdb".Equals(System.IO.Path.GetExtension(path), StringComparison.OrdinalIgnoreCase)) {
    //        var connectionFile = new FileGeodatabaseConnectionPath(new Uri(System.IO.Path.GetFullPath(path)));

    //        return new Geodatabase(connectionFile);
    //    }
    //    else {
    //        throw new InvalidOperationException("Connectionfile path while detecting changes is neither .gdb nor .sde");
    //    }
    //}
    //private static async Task<SpatialQueryFilter> BuildSpatialQueryFilter(S100FC.ProductCatalogue.Dataset dataset, S100FC.S128.SimpleAttributes.specificUsage? specificUsage, Geodatabase geodatabase) {
    //    return await QueuedWorker.Run(() => {
    //        using var surface = geodatabase!.OpenDataset<FeatureClass>("surface");

    //        using var cursorS128 = surface.Search(new QueryFilter {
    //            WhereClause = $"flatten LIKE '%\"{dataset.DatasetName}\"%'",
    //        }, false);

    //        cursorS128.MoveNext();

    //        if (cursorS128.Current.IsNull("flatten"))
    //            throw new System.ArgumentNullException(nameof(dataset.DatasetName));

    //        var sqlSyntax = geodatabase.GetSQLSyntax();

    //        var formattedDate = sqlSyntax.Format(dataset.TimestampUTC, SQLDateTimeType.Timestamp);

    //        var whereClause = $"UPPER(ps) = 'S-101' AND (GDB_FROM_DATE > {formattedDate} OR GDB_TO_DATE > {formattedDate})";

    //        if (specificUsage != null)
    //            whereClause += $" AND usageband = {specificUsage.value}";


    //        ArcGIS.Core.Geometry.Polygon shapeCoverage = (ArcGIS.Core.Geometry.Polygon)((ArcGIS.Core.Data.Feature)cursorS128.Current).GetShape().Clone();

    //        var filter = new SpatialQueryFilter {
    //            FilterGeometry = shapeCoverage,
    //            SpatialRelationship = SpatialRelationship.Relation,
    //            SpatialRelationshipDescription = S100FC.Topology.Matrix.DE9IM,
    //            WhereClause = whereClause,
    //        };

    //        return filter;
    //    });

    //}

    //private SQLSyntax SQLSyntax => this._geodatabase!.GetSQLSyntax();

    // private string QualifyTableName(this Geodatabase geodatabase, string tableName) => geodatabase.GetSQLSyntax().QualifyTableName(geodatabase._databaseName, this._ownerName, tableName);


}