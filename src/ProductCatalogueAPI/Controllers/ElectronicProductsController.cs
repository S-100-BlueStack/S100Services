using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Models;
using S100FC.ProductCatalogue;
using System.Diagnostics;
using System.Text.Json;
using static ProductCatalogueAPI.Models.RequestTypes;
using static ProductCatalogueAPI.Models.ResponseTypes;

namespace ProductCatalogueAPI.Controllers
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
        /// Get all product AOIs in the database as ESRI json feature collection.
        /// </summary>
        /// <returns>An ESRI json feature collection for all product AOIs</returns>
        [ProducesResponseType(typeof(ApiResponse<ResponseTypes.AOIResponse[]>), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpGet("aoi")]
        public async Task<IActionResult> GetAllElectronicProductsAOI() {
            var aois = await _electronicProductManager.GetDatasetAOIs();
            var responses = new List<AOIResponse>();

            foreach (var aoi in aois) {
                var electronicProduct = _electronicProductManager.ElectronicProduct(aoi.Key);

                if (electronicProduct == null) {
                    logger.LogWarning("No electronic product found for dataset {dataset}", aoi.Key);
                    continue;
                }



                var polygon = aoi.Value;
                var current = await _repository.GetCurrentByNameAsync(aoi.Key);

                responses.Add(new AOIResponse {
                    Geometry = polygon, // JsonSerializer.Deserialize<object>(polygon),
                    Attributes = new Attributes {
                        DatasetName = electronicProduct.datasetName,
                        Status = Enum.Parse<ProductStatus>((current?.State ?? Data.Models.ProductState.Idle).ToString()),    // If no explicit state defined in JobTable, default to Ready,
                        DisplayScale = electronicProduct.optimumDisplayScale,
                        UsageBand = electronicProduct.specificUsage
                    }
                });
            }

            return Ok(responses);
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


            // TODO: this is a temporary solution to get the S-57 product, until we have a better way to link S-128 products to their S-57 counterparts.
            // Currently, we assume that the S-57 product has the same name as the S-128 product, but with the first 3 characters replaced with "101".
            // This is based on the current naming convention of the S-57 products, but may need to be changed in the future if the naming convention changes or if there are exceptions.
            // var s57product = _electronicProductManager.ElectronicProduct(name);

            if (electronicProduct == null) {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return NotFound(response);
            }


            var current = await _repository.GetCurrentByNameAsync(name);
            // var s57current = await _repository.GetCurrentByNameAsync(s57product.datasetName);

            var s128Status = Enum.Parse<ProductStatus>((current?.State ?? Data.Models.ProductState.Idle).ToString());

            // var s57Status = Enum.Parse<ProductStatus>((s57current?.State ?? Data.Models.ProductState.Idle).ToString());

            var product = new ProductResponse {
                IssueDate = electronicProduct.issueDate,
                Name = electronicProduct.datasetName,

                Edition = electronicProduct.editionNumber,
                Update = electronicProduct.updateNumber,


                UsageBand = electronicProduct.specificUsage,
                Status = s128Status,
                Exports = [
                     //new(s57product.productSpecification.name, s57product.datasetName, s57product.editionNumber.Value, s57product.updateNumber, s57Status, s57current.Date_From)
                     new("S-57", electronicProduct.datasetName.Replace("101DK00", "DK"), electronicProduct.editionNumber.Value, electronicProduct.updateNumber, s128Status, electronicProduct.issueDate.Value.ToDateTime(TimeOnly.MinValue))
                ]
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
            await _electronicProductManager.CreateElectronicProductAsync(product.Name, productSpecification, /*specificUsage,*/ boundary, product.OptimumDisplayScale);

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