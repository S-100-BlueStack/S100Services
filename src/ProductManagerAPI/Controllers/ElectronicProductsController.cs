using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using ProductManagerAPI.Data.Repositories;
using ProductManagerAPI.Models;
using S100FC.ProductCatalogue;
using S100FC.S128.FeatureTypes;
using System.Diagnostics;
using System.Text.Json;
using static ProductManagerAPI.Models.RequestTypes;
using static ProductManagerAPI.Models.ResponseTypes;

namespace ProductManagerAPI.Controllers
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
                     //new("S-57", electronicProduct.datasetName.Replace("101DK00", "DK"), electronicProduct.editionNumber.Value, electronicProduct.updateNumber, s128Status, electronicProduct.issueDate.Value.ToDateTime(TimeOnly.MinValue))
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
            await _electronicProductManager.CreateElectronicProductAsync(product.Name, productSpecification, /*specificUsage,*/ boundary, "", product.OptimumDisplayScale);

            response.DurationMs = sw.ElapsedMilliseconds;

            return Ok(response);
        }


        /// <summary>
        /// Get the history of a specific electronic product
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        /// <returns>The product</returns>
        [ProducesResponseType(typeof(ApiResponse<ResponseTypes.ProductHistoryResponse[]>), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpGet("{name}/history", Name = "GetElectronicProductHistory")]
        public async Task<IActionResult> GetElectronicProductHistory(string name) {
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse<ResponseTypes.ProductHistoryResponse[]>();
            var electronicProduct = this._electronicProductManager.ElectronicProduct(name);


            if (electronicProduct == null) {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return NotFound(response);
            }


            var rows = await _repository.GetHistoryByNameAsync(name);


            response.Data = [.. rows.Select(r => new ProductHistoryResponse {
                Name = r.Name,
                Edition = r.EditionNo,
                Update = r.UpdateNo,
                Status = Enum.Parse<ProductStatus>(r.State.ToString()),
                From = r.Date_From,
                To = r.Date_to,
                Owner = TrimUsername(r.Owner)
            })];
            response.TotalHits = rows.Count();
            response.DurationMs = sw.ElapsedMilliseconds;

            return this.Ok(response);
        }

        private static string? TrimUsername(string? username) => username?.ToUpper().Replace("PROD\\", "");
    }
}