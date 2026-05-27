using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.ExchangeSet;
using S100FC.ProductCatalogue;
using S100FC.YAML;
using System.Diagnostics;
using static ProductCatalogueAPI.Models.ResponseTypes;
using IO = System.IO;

namespace ProductCatalogueAPI.Controllers
{
    [Authorize("productmanager:manage")]
    [ApiController]
    [Route("[controller]")]
    public class ExportController(ILogger<ExportController> logger, IMemoryCache cache, IExchangeSetService exchangeSetService, IProductManager productManager, IProductRepository productRepository) : ControllerBase
    {
        private readonly ILogger<ExportController> _logger = logger;
        private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
        private readonly IExchangeSetService _exchangeSetService = exchangeSetService;
        private readonly IProductRepository _productRepository = productRepository;
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

            var user = User?.Identity?.Name;
            _logger.LogInformation("{NewEdition} called with name: {name} by user: {user}", nameof(NewEdition), name, user);

            var product = _electronicProductManager.ElectronicProduct(name);

            if (product == null) {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status404NotFound, response);
            }

            var dataset = await _electronicProductManager.CreateNewEditionAsync(name);

            // Ensure updated edition/updateNo from the product
            //product = _electronicProductManager.ElectronicProduct(name)!;

            var yaml = dataset.Serialize();


            if (string.IsNullOrEmpty(yaml)) {
                response.Success = false;
                response.Message = $"An error occured attempting to read dataset '{name}'.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status500InternalServerError, response);
            }


            var result = _exchangeSetService.CreateExchangeSet(product, _electronicProductManager.OutputFolder, yaml);

            await _electronicProductManager.CreateAttachmentAsync(name, ExportTypes.NewEdition, yaml, result.Index, result.Sign);

            await _productRepository.AppendAsync(name, Data.Models.ProductState.Exported, user);

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

            var user = User?.Identity?.Name;
            _logger.LogInformation("{NewUpdate} called with name: {name} by user: {user}", nameof(NewUpdate), name, user);

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

            // Ensure updated edition/updateNo from the product
            //product = _electronicProductManager.ElectronicProduct(name)!;

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

            await _productRepository.AppendAsync(name, Data.Models.ProductState.Exported, user);

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

            var user = User?.Identity?.Name;
            _logger.LogInformation("{newDataset} called with name: {name} by user: {user}", nameof(NewDataset), name, user);

            var product = _electronicProductManager.ElectronicProduct(name);

            if (product == null) {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status404NotFound, response);
            }

            var dataset = await _electronicProductManager.CreateNewDatasetAsync(name);

            // Ensure updated edition/updateNo from the product
            //product = _electronicProductManager.ElectronicProduct(name)!;

            var yaml = dataset.Serialize();


            var result = _exchangeSetService.CreateExchangeSet(product, _electronicProductManager.OutputFolder, yaml);

            await _electronicProductManager.CreateAttachmentAsync(name, ExportTypes.NewDataset, yaml, result.Index, result.Sign);

            await _productRepository.AppendAsync(name, Data.Models.ProductState.Idle, user);

            response.DurationMs = sw.ElapsedMilliseconds;
            return Ok(response);
        }


        /// <summary>
        /// Creates a new edition.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPost("{name}/rollback", Name = "RollBack")]
        public async Task<IActionResult> RollBack(string name) {
            _logger.LogInformation("{method} called with name: {name}", nameof(RollBack), name);
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse();

            var user = User?.Identity?.Name;
            _logger.LogInformation("{method} called with name: {name} by user: {user}", nameof(RollBack), name, user);


            return StatusCode(StatusCodes.Status501NotImplemented, new ApiResponse {
                Success = false,
                Message = "Rollback is not implemented yet.",
                DurationMs = sw.ElapsedMilliseconds
            });

            return Ok();
        }



        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPost("alldatasets", Name = "NewDatasets")]
        public async Task<IActionResult> CreateAllDatasets() {
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse();

            var products = _electronicProductManager.ToArray();
            int i = 0;
            int total = products.Length;

            foreach (var name in products) {
                try {
                    i++;
                    _logger.LogInformation("creating dataset {i}/{total}: {name}", i, total, name);
                    var product = _electronicProductManager.ElectronicProduct(name)!;
                    if (product.editionNumber.HasValue && product.editionNumber.Value > 0) {
                        _logger.LogInformation("Product {name} already has edition {edition}. skipping", name, product.editionNumber.Value);
                        continue;
                        //throw new InvalidOperationException();
                    }
                    // Create exchange set
                    var dataset = await _electronicProductManager.CreateNewDatasetAsync(name);

                    // Ensure updated edition/updateNo from the product
                    //product = _electronicProductManager.ElectronicProduct(name)!;

                    var yaml = dataset.Serialize();

                    var result = _exchangeSetService.CreateExchangeSet(product, _electronicProductManager.OutputFolder, yaml);

                    await _electronicProductManager.CreateAttachmentAsync(name, ExportTypes.NewDataset, yaml, result.Index, result.Sign);
                    _logger.LogInformation("Exchangeset created successfully");

                    await _productRepository.AppendAsync(name, Data.Models.ProductState.Idle);
                }
                catch (InvalidOperationException) {
                    _logger.LogWarning("Dataset already has update. skipping");
                }
                catch (IndexOutOfRangeException) {
                    _logger.LogWarning("Topology IndexOutOfRangeException! skipping");
                }
                catch (AggregateException) {
                    _logger.LogWarning("Topology AggregateException! skipping");
                }
                catch (ArgumentException) {
                    _logger.LogWarning("s100compiler exception for exchangeset. Probably missing minimumScale on DataCoverage skipping");
                }
                catch (Exception ex) {
                    _logger.LogError("Unexpected exception: {ex}", ex);
                }

            }
            response.DurationMs = sw.ElapsedMilliseconds;
            response.Message = $"Datasets created: {products.Length}";
            return Ok(response);
        }
    }
}