using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using ProductCatalogueService.Data.Repositories;
using ProductCatalogueService.Models;
using S100FC.ProductCatalogue;
using System.Diagnostics;
using System.Text.Json;
using static ProductCatalogueService.Models.RequestTypes;
using static ProductCatalogueService.Models.ResponseTypes;

namespace ProductCatalogueService.Controllers
{
    //[AllowAnonymous] 
    [Authorize("productmanager:access")]
    [ApiController]
    [Route("[controller]")]
    public class ElectronicProductsController(ILogger<ElectronicProductsController> logger, IMemoryCache cache, IProductManager productManager, IProductRepository repository) : ControllerBase
    {
        private readonly ILogger<ElectronicProductsController> _logger = logger;
        private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
        private readonly IMemoryCache _cache = cache;
        private readonly IProductRepository _repository = repository;

        /// <summary>
        /// Get all product names in the database
        /// </summary>
        /// <returns>An collection with all productnames</returns>f
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
        /// Get all product names in the database
        /// </summary>
        /// <returns>An collection with all productnames</returns>f
        [ProducesResponseType(typeof(ApiResponse<string>), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpGet("aoi")]
        public async Task<IActionResult> GetAllElectronicProductsAOI() {
            var sw = Stopwatch.StartNew();
            //var response = new ApiResponse<string>();
            var aois = await _electronicProductManager.GetDatasetAOIs();
            var features = new List<object>();

            foreach (var a in aois) {
                var electronicProduct = _electronicProductManager.ElectronicProduct(a.Key);

                if (electronicProduct == null) {
                    logger.LogWarning("No electronic product found for dataset {dataset}", a.Key);
                    continue;
                }

                var polygon = a.Value;

                //var env = polygon.Extent;

                //// simplify coordinates
                //var rectangle = PolygonBuilder.CreatePolygon(
                //[
                //    new Coordinate2D(env.XMin, env.YMin),
                //    new Coordinate2D(env.XMax, env.YMin),
                //    new Coordinate2D(env.XMax, env.YMax),
                //    new Coordinate2D(env.XMin, env.YMax),
                //    new Coordinate2D(env.XMin, env.YMin)
                //], SpatialReferences.WGS84);

                var current = await _repository.GetCurrentByNameAsync(a.Key);

                // var esriGeometry = GeometryEngine.Instance.ExportToJson(JsonExportFlags.JsonExportSkipCRS, rectangle);

                features.Add(new {
                    geometry = polygon, // JsonSerializer.Deserialize<object>(polygon),
                    attributes = new {
                        datasetName = electronicProduct.datasetName,
                        edition = electronicProduct.editionNumber,
                        update = electronicProduct.updateDate,
                        status = (int)(current?.State ?? Data.Models.ProductState.Ready)    // If no explicit state defined in JobTable, default to Ready
                    }
                });
            }


            return Ok(features);
        }

        /// <summary>
        /// Get a specific electronic product
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        /// <returns>The product</returns>
        [ProducesResponseType(typeof(ApiResponse<ResponseTypes.ProductResponse>), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpGet("{name}", Name = "GetElectronicProduct")]
        public async Task<IActionResult> GetElectronicProduct(string name) {
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse<ResponseTypes.ProductResponse>();
            var electronicProduct = this._electronicProductManager.ElectronicProduct(name);

            if (electronicProduct == null) {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return this.NotFound(response);
            }

            var boundary = await _electronicProductManager.GetDatasetBoundary(name);

            var current = await _repository.GetCurrentByNameAsync(name);

            var product = new ProductResponse {
                Edition = electronicProduct.editionNumber,
                IssueDate = electronicProduct.issueDate,
                Name = electronicProduct.datasetName,
                Update = electronicProduct.updateNumber,
                UsageBand = electronicProduct.specificUsage,
                Aoi = boundary,
                Status = (int)(current?.State ?? Data.Models.ProductState.Ready)
            };


            response.Data = product;
            response.TotalHits = 1;
            response.DurationMs = sw.ElapsedMilliseconds;

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
        [Authorize("productmanager:manage")]
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
            //var boundary = NetTopologySuite.Geometries.Polygon.FromJson(product.Aoi.ToString());
            var boundary = product.Aoi.ToString();

            _electronicProductManager.ElectronicProduct(product.Name); // check if product already exists, if not, will return null

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
            await _electronicProductManager.CreateElectronicProductAsync(product.Name, productSpecification, specificUsage, boundary, product.OptimumDisplayScale);

            response.DurationMs = sw.ElapsedMilliseconds;

            return Ok(response);
        }







        // #region import
        /// <summary>
        /// Creates all datasets in s128 database.
        /// </summary>



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
        //#endregion

    }
}