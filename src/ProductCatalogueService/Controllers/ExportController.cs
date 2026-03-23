using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using ProductCatalogueService.Services;
using S100FC.ProductCatalogue;
using S100FC.YAML;
using System.Diagnostics;
using static ProductCatalogueService.Models.RequestTypes;
using static ProductCatalogueService.Models.ResponseTypes;
using IO = System.IO;

namespace ProductCatalogueService.Controllers
{
    public class ExportController(ILogger<ExportController> logger, IMemoryCache cache, IExchangeSetService exchangeSetService, IProductManager productManager) : ControllerBase
    {
        private readonly ILogger<ExportController> _logger = logger;
        private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
        private readonly IExchangeSetService _exchangeSetService = exchangeSetService;
        private readonly IMemoryCache _cache = cache;


        /// <summary>
        /// Creates a new edition.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPost("{name}/newedition", Name = "NewEdition")]
        public async Task<IActionResult> NewEdition(string name) {
            _logger.LogInformation("{newEdition} called with name: {name}", nameof(NewEdition), name);
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse();

            var product = _electronicProductManager.ElectronicProduct(name);

            if (product == null) {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status404NotFound, response);
            }

            var dataset = await _electronicProductManager.CreateNewEditionAsync(name);

            var yaml = dataset.Serialize();


            if (string.IsNullOrEmpty(yaml)) {
                response.Success = false;
                response.Message = $"An error occured attempting to read dataset '{name}'.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status500InternalServerError, response);
            }


            var result = _exchangeSetService.CreateExchangeSet(product, _electronicProductManager.OutputFolder, yaml);

            await _electronicProductManager.CreateAttachmentAsync(name, ExportTypes.NewEdition, yaml, result.Index, result.Sign);

            response.DurationMs = sw.ElapsedMilliseconds;
            return Ok(response);
        }


        /// <summary>
        /// Creates a new update.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPost("{name}/newupdate", Name = "NewUpdate")]
        public async Task<IActionResult> NewUpdate(string name = "101DK0040349E") {
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse();

            // Check if product has any updates before creating new update
            var product = _electronicProductManager.ElectronicProduct(name);

            if (product == null) {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status404NotFound, response);
            }

            var dirty = await _electronicProductManager.IsDirtyAsync(name);

            if (!dirty) {
                response.Success = false;
                response.Message = $"Product has no updates.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return BadRequest(response);
            }

            var dataset = await _electronicProductManager.CreateNewUpdateAsync(name);

            var incoming = dataset.Serialize();

            if (string.IsNullOrEmpty(incoming)) {
                response.Success = false;
                response.Message = $"An error occured attempting to read dataset '{name}'.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status500InternalServerError, response);
            }


            var (latest, prevIndex) = await _electronicProductManager.GetLatestDatasetYAML(name, product.editionNumber!.Value);


            // Build YAML Delta
            var delta = S100FC.YAML.DatasetComparer.Compare(latest, incoming);

            if (!delta.HasEdits) {
                _logger.LogError("No edits found for product {product} during NewUpdate.", name);
                response.Success = false;
                response.Message = $"An error occured identifying edits.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status500InternalServerError, response);
            }

            var update = S100FC.YAML.Converter.Serialize(delta);

            var result = _exchangeSetService.CreateExchangeSet(product, _electronicProductManager.OutputFolder, update, prevIndex);

            await _electronicProductManager.CreateAttachmentAsync(name, ExportTypes.Update, update, result.Index, result.Sign);

            response.DurationMs = sw.ElapsedMilliseconds;
            return Ok(response);
        }

        /// <summary>
        /// Creates a new dataset.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPost("{name}/newdataset", Name = "NewDataset")]
        public async Task<IActionResult> NewDataset(string name = "101DK0040349E") {
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse();

            var product = _electronicProductManager.ElectronicProduct(name);

            if (product == null) {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status404NotFound, response);
            }

            var dataset = await _electronicProductManager.CreateNewDatasetAsync(name);
            var yaml = dataset.Serialize();


            var result = _exchangeSetService.CreateExchangeSet(product, _electronicProductManager.OutputFolder, yaml);

            await _electronicProductManager.CreateAttachmentAsync(name, ExportTypes.NewDataset, yaml, result.Index, result.Sign);

            response.DurationMs = sw.ElapsedMilliseconds;
            return Ok(response);
        }
    }
}