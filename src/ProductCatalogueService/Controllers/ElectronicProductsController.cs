using ArcGIS.Core.Geometry;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using ProductCatalogueService.Models;
using S100FC.ProductCatalogue;
using System.Diagnostics;
using static ProductCatalogueService.Models.RequestTypes;
using static ProductCatalogueService.Models.ResponseTypes;
using IO = System.IO;

namespace ProductCatalogueService.Controllers
{

    //[Authorize]
    [AllowAnonymous] // during development
    [ApiController]
    [Route("[controller]")]
    public class ElectronicProductsController(ILogger<ElectronicProductsController> logger, IMemoryCache cache, IProductManager productManager) : ControllerBase
    {
        private readonly ILogger<ElectronicProductsController> _logger = logger;
        private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
        private readonly IMemoryCache _cache = cache;

        /// <summary>
        /// Get all product names in the database
        /// </summary>
        /// <returns>An collection with all productnames</returns>
        [ProducesResponseType(typeof(ApiResponse<string[]>), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpGet(Name = "GetAllElectronicProducts")]
        public IActionResult GetAllElectronicProducts() {
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse<string[]>();

            var productNames = this._electronicProductManager.ToArray();

            response.Data = productNames;
            response.TotalHits = productNames.Length;
            response.DurationMs = sw.ElapsedMilliseconds;

            return this.Ok(response);
        }

        /// <summary>
        /// Get a specific electronic product
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        /// <returns>The product</returns>
        [ProducesResponseType(typeof(ApiResponse<ResponseTypes.ProductResponse>), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpGet("{name}", Name = "GetElectronicProduct")]
        public IActionResult GetElectronicProduct(string name) {
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse<ResponseTypes.ProductResponse>();
            var electronicProduct = this._electronicProductManager.ElectronicProduct(name);

            if (electronicProduct == null) {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return this.NotFound(response);
            }
            var product = new ProductResponse {
                Edition = electronicProduct.editionNumber,
                IssueDate = electronicProduct.issueDate,
                Name = electronicProduct.datasetName,
                Update = electronicProduct.updateNumber,
                UsageBand = electronicProduct.specificUsage
            };

            response.Data = product;
            response.TotalHits = 1;
            response.DurationMs = sw.ElapsedMilliseconds;

            return this.Ok(response);
        }

        /// <summary>
        /// Get all products that have pending updates
        /// </summary>
        ///// <param name="name">The name of the dataset.</param>
        /// <returns>The product</returns>
        [ProducesResponseType(StatusCodes.Status501NotImplemented)]
        //[ProducesResponseType(typeof(ApiResponse<string>), StatusCodes.Status200OK, "application/json")]
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpGet("pending", Name = "GetPendingProducts")]
        public IActionResult GetPendingProducts() {
            return StatusCode(StatusCodes.Status501NotImplemented);
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse<string>();

            //var product = new ProductResponse {
            //    Edition = electronicProduct.editionNumber,
            //    IssueDate = electronicProduct.issueDate,
            //    Name = electronicProduct.datasetName,
            //    Update = electronicProduct.updateNumber,
            //    UsageBand = electronicProduct.specificUsage
            //};

           // response.Data = geojson;
            //response.DurationMs = sw.ElapsedMilliseconds;

            return this.Ok(response);
        }



        /// <summary>
        /// Creates a new Electronic Product in the S-128 database.
        /// </summary>
        /// <param name="product">
        /// The request payload containing the dataset boundary (AOI) and usage band.
        /// The <c>aoi</c> should be provided in ArcGIS JSON geometry format.
        /// </param>
        [ProducesResponseType(StatusCodes.Status501NotImplemented)]
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPost()]
        public async Task<IActionResult> CreateElectronicProduct([FromBody] CreateProductRequest product) {
            return StatusCode(StatusCodes.Status501NotImplemented);
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse();

            if (_electronicProductManager.ElectronicProduct(product.Name) != null) {
                response.Success = false;
                response.Message = $"An electronic product with name '{product.Name}' already exists.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status404NotFound, response);
            }

            //var boundary = GetBoundaryFromGeoJSON(aoi);
            var boundary = PolygonBuilderEx.FromJson(product.Aoi.ToString());

            var productSpecification = new S100FC.S128.ComplexAttributes.productSpecification() {
                name = "S-101",
                version = "2.0.0",
                editionDate = DateOnly.FromDateTime(DateTime.Today)
            };

            var specificUsage = product.UsageBand switch {
                SpecificUsage.NavigationalPurposeOverview => 1, // S100FC.S128.specificUsage.NavigationalPurposeOverview,
                SpecificUsage.NavigationalPurposeGeneral => 2, //S100FC.S128.specificUsage.NavigationalPurposeGeneral,
                SpecificUsage.NavigationalPurposeCoastal => 3, //S100FC.S128.specificUsage.NavigationalPurposeCoastal,
                SpecificUsage.NavigationalPurposeApproach => 4, //S100FC.S128.specificUsage.NavigationalPurposeApproach,
                SpecificUsage.NavigationalPurposeHarbour => 5, //S100FC.S128.specificUsage.NavigationalPurposeHarbour,
                SpecificUsage.NavigationalPurposeBerthing => 6, //S100FC.S128.specificUsage.NavigationalPurposeBerthing,
                _ => throw new ArgumentNullException(),
            };

            // Todo: change argument to AOI and do arcgis core geometry conversion in productmanager
            await _electronicProductManager.CreateElectronicProductAsync(product.Name, productSpecification, specificUsage, boundary);

            response.DurationMs = sw.ElapsedMilliseconds;

            return Ok(response);
        }







        #region import
        ///// <summary>
        ///// Creates all datasets in s128 database.
        ///// </summary>
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        //[HttpPost("alldatasets", Name = "NewDatasets")]
        //public async Task<IActionResult> CreateAllDatasets() {
        //    var sw = Stopwatch.StartNew();
        //    var response = new ApiResponse();

        //    var products = _electronicProductManager.ToArray();
        //    int i = 1;
        //    int total = products.Length;

        //    foreach (var name in products) {
        //        try {
        //            _logger.LogInformation("creating dataset {i}/{total}: {name}", i, total, name);
        //            var product = _electronicProductManager.ElectronicProduct(name)!;
        //            if (product.editionNumber.HasValue && product.editionNumber.Value > 0) {
        //                throw new InvalidOperationException();
        //            }
        //            // Create exchange set
        //            var dataset = await _electronicProductManager.CreateNewDatasetAsync(name);
        //            var yaml = dataset.Serialize();

        //            this.CreateExchangeSet(product, yaml);
        //            _logger.LogInformation("Exchangeset created successfully");
        //        }
        //        catch (InvalidOperationException) {
        //            _logger.LogWarning("Dataset already has update. skipping");
        //        }
        //        catch (IndexOutOfRangeException) {
        //            _logger.LogWarning("Topology IndexOutOfRangeException! skipping");
        //        }
        //        catch (AggregateException) {
        //            _logger.LogWarning("Topology AggregateException! skipping");
        //        }
        //        catch (ArgumentException) {
        //            _logger.LogWarning("s100compiler exception for exchangeset. Probably missing minimumScale on DataCoverage skipping");
        //        }
        //        catch (Exception ex) {
        //            _logger.LogError("Unexpected exception: {ex}", ex);
        //        }
        //        i++;
        //    }
        //    response.DurationMs = sw.ElapsedMilliseconds;
        //    response.Message = $"Datasets created: {products.Length}";
        //    return Ok(response);
        //}


        ///// <summary>
        ///// Imports all existing products from a S-57 database
        ///// </summary>
        ///// <param name="createAll"> If set to true, will create a new dataset for each product, and may take up to 10 minutes to complete.</param>
        ///// <returns>An collection with all imported productnames.</returns>
        //[ProducesResponseType(typeof(ApiResponse<string[]>), StatusCodes.Status200OK, "application/json")]
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        //[HttpPost("import", Name = "LoadElectronicProducts")]
        //public async Task<IActionResult> LoadElectronicProducts(bool createAll = false) {
        //    var response = new ApiResponse<string[]>();
        //    var sw = Stopwatch.StartNew();
        //    var s57 = Environment.GetEnvironmentVariable("S100-Horizon-S57-Database");

        //    if (string.IsNullOrEmpty(s57)) {
        //        response.Success = false;
        //        response.Message = $"No S-57 database was configured";
        //        response.DurationMs = sw.ElapsedMilliseconds;
        //        return StatusCode(StatusCodes.Status500InternalServerError, response);
        //    }

        //    Log.Information("S-57 env: {s57}", s57);
        //    Log.Information("Exists? {exist}", IO.File.Exists(s57));

        //    var tasks = new List<Task>();
        //    await productManager.Dispatch(() => {
        //        var connectionFile = new Uri(IO.Path.GetFullPath(s57));

        //        Func<Geodatabase> createGeodatabase; // = () => { throw new NotImplementedException(); };

        //        if (IO.File.Exists(s57) && ".sde".Equals(IO.Path.GetExtension(s57), StringComparison.InvariantCultureIgnoreCase)) {
        //            createGeodatabase = () => { return new Geodatabase(new DatabaseConnectionFile(connectionFile)); };
        //        }
        //        else if (IO.Directory.Exists(s57) && ".gdb".Equals(IO.Path.GetExtension(s57), StringComparison.InvariantCultureIgnoreCase)) {
        //            createGeodatabase = () => { return new Geodatabase(new FileGeodatabaseConnectionPath(connectionFile)); };
        //        }
        //        else {
        //            throw new InvalidDataException("Extension must be either .sde or .gdb");
        //        }

        //        var productSpecification = new S100FC.S128.ComplexAttributes.productSpecification {
        //            editionDate = S100FC.S101.Summary.VersionDate,
        //            name = S100FC.S101.Summary.ProductId,
        //            version = S100FC.S101.Summary.Version.ToString(),
        //        };



        //        using var geodatabase = createGeodatabase();

        //        var definitionTables = geodatabase.GetDefinitions<TableDefinition>();
        //        var definitionFeatureClasses = geodatabase.GetDefinitions<FeatureClassDefinition>();

        //        using var tableProductCoverage = geodatabase.OpenDataset<FeatureClass>(definitionFeatureClasses.Single(e => e.GetName().EndsWith("ProductCoverage")).GetName());

        //        using var tableProductDefinitions = geodatabase.OpenDataset<Table>(definitionTables.Single(e => e.GetName().EndsWith("ProductDefinitions")).GetName());
        //        using var cursor = tableProductDefinitions.Search(new QueryFilter {
        //            WhereClause = "1 = 1",
        //        }, true);

        //        while (cursor.MoveNext()) {
        //            var c = cursor.Current;

        //            var series = Convert.ToString(c["series"])!.ToString();

        //            var name = "101DK00" + Convert.ToString(c["DSNM"])![2..];
        //            var specificUsage = name[7] switch {
        //                '5' => 5, //S100FC.S128.specificUsage.NavigationalPurposeHarbour,
        //                '4' => 4, //S100FC.S128.specificUsage.NavigationalPurposeApproach,
        //                '3' => 3, //S100FC.S128.specificUsage.NavigationalPurposeCoastal,
        //                '2' => 2, //S100FC.S128.specificUsage.NavigationalPurposeGeneral,
        //                '1' => 1, //S100FC.S128.specificUsage.NavigationalPurposeOverview,
        //                _ => throw new InvalidDataException(),
        //            };

        //            using var coverage = tableProductCoverage.Search(new QueryFilter {
        //                WhereClause = $"DSNM = '{Convert.ToString(c["DSNM"])}'",
        //            }, true);

        //            var polygons = new List<ArcGIS.Core.Geometry.Polygon>();
        //            while (coverage.MoveNext()) {
        //                var current = (ArcGIS.Core.Data.Feature)coverage.Current;
        //                var polygon = (ArcGIS.Core.Geometry.Polygon)current.GetShape();

        //                polygons.Add(polygon);
        //                continue;
        //            }
        //            Debug.Assert(polygons.Any());

        //            var cover = (ArcGIS.Core.Geometry.Polygon)GeometryEngine.Instance.Union(polygons);

        //            tasks.Add(_electronicProductManager.CreateElectronicProductAsync(name, productSpecification, specificUsage, cover));
        //        }
        //    });

        //    await Task.WhenAll([.. tasks]);

        //    var products = _electronicProductManager.ToArray();

        //    if (createAll) {
        //        foreach (var productName in products) {
        //            var dataset = await _electronicProductManager.CreateNewDatasetAsync(productName);
        //            var product = _electronicProductManager.ElectronicProduct(productName);

        //            var yaml = dataset.Serialize();
        //            this.CreateExchangeSet(product, yaml);
        //        }
        //    }

        //    response.Data = products;
        //    response.DurationMs = sw.ElapsedMilliseconds;
        //    response.TotalHits = products.Length;

        //    return Ok(response);
        //}
        #endregion

    }
}