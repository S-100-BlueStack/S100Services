using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.Locking;
using S100FC.ProductCatalogue;
using S100FC.YAML;
using System.Diagnostics;
using static ProductCatalogueAPI.Models.RequestTypes;
using static ProductCatalogueAPI.Models.ResponseTypes;
using IO = System.IO;

namespace ProductCatalogueAPI.Controllers
{
    [Authorize("productmanager:manage")]
    [ApiController]
    [Route("[controller]")]
    public class ExportController(ILogger<ExportController> logger, IMemoryCache cache, IExportService exportService, IProductManager productManager, IProductRepository productRepository, IDatasetLockService datasetLockService) : ControllerBase
    {
        private readonly ILogger<ExportController> _logger = logger;
        private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
        private readonly IExportService _exportService = exportService;
        private readonly IProductRepository _productRepository = productRepository;
        private readonly IDatasetLockService _datasetLockService = datasetLockService;
        private readonly IMemoryCache _cache = cache;


        /// <summary>
        /// Creates a new edition.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        /// <param name="exportTarget">The target format for the export(s).</param>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPost("{name}/newedition", Name = "NewEdition")]
        public async Task<IActionResult> NewEdition(string name, Models.RequestTypes.ExportFormat exportTarget = Models.RequestTypes.ExportFormat.S100) {
            var user = User?.Identity?.Name;
            _logger.LogInformation("{NewEdition} called with name: {name} by user: {user}", nameof(NewEdition), name, user);

            var sw = Stopwatch.StartNew();
            var response = new ApiResponse();


            var product = _electronicProductManager.ElectronicProduct(name);

            if (product == null) {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status404NotFound, response);
            }

            // Check if product is being
            await using var datasetLock = await _datasetLockService.AcquireAsync(name);


            // long-running work here

            // Create YAML Dataset
            var dataset = await _electronicProductManager.CreateNewEditionAsync(name);


            var yaml = dataset.Serialize();


            if (string.IsNullOrEmpty(yaml)) {
                response.Success = false;
                response.Message = $"An error occured attempting to read dataset '{name}'.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status500InternalServerError, response);
            }

            // avoid null
            int update = dataset.Update.HasValue ? (int)(dataset.Update.Value) : 0;


            // Create export(s)

            // S-100
            if (exportTarget is Models.RequestTypes.ExportFormat.Both or Models.RequestTypes.ExportFormat.S100) {
                var result = _exportService.CreateS100Export(name, (int)dataset.Edition!, update, _electronicProductManager.OutputFolder, yaml);

                var exportResult = (result.Index, result.Sign);

                // Store in s128 attachment table
                await _electronicProductManager.CreateAttachmentAsync(name, ExportTypes.NewEdition, yaml, exportResult.Index, exportResult.Sign);

                // Store in system job table.
                await _productRepository.AppendAsync(name, Data.Models.ProductState.Exported, "S-101", (int)dataset.Edition, update, user);
            }


            //// S-57
            //if (exportTarget is Models.RequestTypes.ExportFormat.Both or Models.RequestTypes.ExportFormat.S57) {
            //    var S57Name = product.datasetName;
            //    var S57Edition = product.editionNumber.Value;
            //    var S57Update = product.updateNumber.Value;

            //    // TODO: Fix S-57 Exporter. For now assume it works
            //    // _exportService.CreateS57Export(S57Name, (int)dataset.Edition!, (int)dataset.Update!, _electronicProductManager.OutputFolder, yaml);

            //    // Store in s128 attachment table. TODO: Add necessary files if needed
            //    await _electronicProductManager.CreateS57AttachmentAsync(S57Name, ExportTypes.NewEdition, yaml);

            //    // Store in system job table.
            //    await _productRepository.AppendAsync(S57Name, Data.Models.ProductState.Exported, "S-57", S57Edition, S57Update, user);
            //}


            response.DurationMs = sw.ElapsedMilliseconds;
            return Ok(response);
        }


        /// <summary>
        /// Creates a new update.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        /// <param name="exportTarget">The target format(s) for the export.</param>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPost("{name}/newupdate", Name = "NewUpdate")]
        public async Task<IActionResult> NewUpdate(string name = "101DK0040349E", Models.RequestTypes.ExportFormat exportTarget = Models.RequestTypes.ExportFormat.S100) {
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse();



            var user = User?.Identity?.Name;
            _logger.LogInformation("{NewUpdate} called with name: {name} by user: {user}", nameof(NewUpdate), name, user);

            return StatusCode(StatusCodes.Status501NotImplemented, new ApiResponse {
                Success = false,
                Message = "NewUpdate is not implemented yet.",
                DurationMs = sw.ElapsedMilliseconds
            });

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



            // Create export(s)

            // S-100
            if (exportTarget is Models.RequestTypes.ExportFormat.Both or Models.RequestTypes.ExportFormat.S100) {
                var result = _exportService.CreateS100Export(name, (int)dataset.Edition!, (int)dataset.Update!, _electronicProductManager.OutputFolder, update, prevIndex);

                // Store in s128 attachment table
                await _electronicProductManager.CreateAttachmentAsync(name, ExportTypes.Update, update, result.Index, result.Sign);


                // Store in system job table.
                await _productRepository.AppendAsync(name, Data.Models.ProductState.Exported, "S-101", (int)dataset.Edition!, (int)dataset.Update!, user);
            }


            // S-57
            if (exportTarget is Models.RequestTypes.ExportFormat.Both or Models.RequestTypes.ExportFormat.S57) {
                var S57Name = name;
                var S57Edition = 1;
                var S57Update = 1;

                _exportService.CreateS57Export(S57Name, (int)dataset.Edition!, (int)dataset.Update!, _electronicProductManager.OutputFolder, latest);

                // Store in s128 attachment table. TODO: Add necessary files if needed
                await _electronicProductManager.CreateS57AttachmentAsync(S57Name, ExportTypes.Update, latest);

                // Store in system job table.
                await _productRepository.AppendAsync(S57Name, Data.Models.ProductState.Exported, "S-57", S57Edition, S57Update, user);
            }

            response.DurationMs = sw.ElapsedMilliseconds;
            return Ok(response);
        }

        ///// <summary>
        ///// Creates a new dataset.
        ///// </summary>
        ///// <param name="name">The name of the dataset.</param>
        ///// <param name="includeS57">Whether to include S57 export.</param>
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        //[HttpPost("{name}/newdataset", Name = "NewDataset")]
        //public async Task<IActionResult> NewDataset(string name = "101DK0040349E", bool includeS57 = false) {
        //    var sw = Stopwatch.StartNew();
        //    var response = new ApiResponse();

        //    var user = User?.Identity?.Name;
        //    _logger.LogInformation("{newDataset} called with name: {name} by user: {user}", nameof(NewDataset), name, user);

        //    var product = _electronicProductManager.ElectronicProduct(name);

        //    if (product == null) {
        //        response.Success = false;
        //        response.Message = $"No electronic product with name '{name}' was found.";
        //        response.DurationMs = sw.ElapsedMilliseconds;
        //        return StatusCode(StatusCodes.Status404NotFound, response);
        //    }

        //    var dataset = await _electronicProductManager.CreateNewDatasetAsync(name);

        //    // Ensure updated edition/updateNo from the product
        //    //product = _electronicProductManager.ElectronicProduct(name)!;

        //    var yaml = dataset.Serialize();


        //    var result = _exportService.CreateS100Export(name, (int)dataset.Edition!, (int)dataset.Update!, _electronicProductManager.OutputFolder, yaml);

        //    if (includeS57)
        //        _exportService.CreateS57Export(name, (int)dataset.Edition!, (int)dataset.Update!, _electronicProductManager.OutputFolder, yaml);

        //    await _electronicProductManager.CreateAttachmentAsync(name, ExportTypes.NewDataset, yaml, result.Index, result.Sign);

        //    await _productRepository.AppendAsync(name, Data.Models.ProductState.Idle, user);

        //    response.DurationMs = sw.ElapsedMilliseconds;
        //    return Ok(response);
        //}


        /// <summary>
        /// Begins a rollback process on the specified dataset.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        ///         /// <param name="exportTarget">The target format(s) for the export.</param>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPost("{name}/rollback", Name = "RollBack")]
        public async Task<IActionResult> RollBack(string name, Models.RequestTypes.ExportFormat exportTarget = Models.RequestTypes.ExportFormat.S100) {
            var user = User?.Identity?.Name;
            _logger.LogInformation("{method} called with name: {name} by user: {user}", nameof(RollBack), name, user);
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse();
            var product = _electronicProductManager.ElectronicProduct(name);


            if (product == null) {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status404NotFound, response);
            }

            await using var datasetLock = await _datasetLockService.AcquireAsync(name);

            int oldEdition = product.editionNumber!.Value;
            int oldUpdate = product.updateNumber.GetValueOrDefault();


            if (product == null) {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status404NotFound, response);
            }


            var res = await _electronicProductManager.RollBackAsync(name);

            //if (!res) {
            //    response.Success = false;
            //    response.Message = $"An error occured attempting to rollback dataset '{name}'.";
            //    response.DurationMs = sw.ElapsedMilliseconds;
            //    return StatusCode(StatusCodes.Status500InternalServerError, response);
            //}

            _exportService.DeleteExport(name, _electronicProductManager.OutputFolder, oldEdition, oldUpdate);

            // Rollback in JobState
            await _productRepository.AppendAsync(name, Data.Models.ProductState.Idle, "S-128", product.editionNumber.Value, product.updateNumber.GetValueOrDefault());




            return Ok();
        }

        /// <summary>
        /// Returns an analysis of the export from SevenCs analyzer.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPost("{name}/analysis", Name = "GetAnalysis")]
        public async Task<IActionResult> GetExportAnalysis(string name) {
            var user = User?.Identity?.Name;
            _logger.LogInformation("{method} called with name: {name} by user: {user}", nameof(GetExportAnalysis), name, user);
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse();


            return StatusCode(StatusCodes.Status501NotImplemented, new ApiResponse {
                Success = false,
                Message = "Rollback is not implemented yet.",
                DurationMs = sw.ElapsedMilliseconds
            });

            // AOI, vld, ed, upd, etc from SevenCs analysis report
        }



        ///// <summary>
        ///// Only used for testing.
        ///// </summary>
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        //[HttpPost("alldatasets", Name = "NewDatasets")]
        //public async Task<IActionResult> CreateAllDatasets() {
        //    var sw = Stopwatch.StartNew();
        //    var response = new ApiResponse();

        //    var products = _electronicProductManager.ToArray();
        //    int i = 0;
        //    int total = products.Length;

        //    foreach (var name in products) {
        //        try {
        //            i++;
        //            _logger.LogInformation("creating dataset {i}/{total}: {name}", i, total, name);
        //            var product = _electronicProductManager.ElectronicProduct(name)!;
        //            if (product.editionNumber.HasValue && product.editionNumber.Value > 0) {
        //                _logger.LogInformation("Product {name} already has edition {edition}. skipping", name, product.editionNumber.Value);
        //                continue;
        //                //throw new InvalidOperationException();
        //            }
        //            // Create exchange set
        //            var dataset = await _electronicProductManager.CreateNewDatasetAsync(name);

        //            var yaml = dataset.Serialize();

        //            var result = _exportService.CreateS100Export(name, (int)dataset.Edition!, (int)dataset.Update!, _electronicProductManager.OutputFolder, yaml);

        //            // _exportService.CreateS57Export(name, (int)dataset.Edition!, (int)dataset.Update!, _electronicProductManager.OutputFolder, yaml);

        //            await _electronicProductManager.CreateAttachmentAsync(name, ExportTypes.NewDataset, yaml, result.Index, result.Sign);
        //            _logger.LogInformation("Exchangeset created successfully");

        //            await _productRepository.AppendAsync(name, Data.Models.ProductState.Idle, "S-101", (int)dataset.Edition!, (int)dataset.Update!);
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

        //    }
        //    response.DurationMs = sw.ElapsedMilliseconds;
        //    response.Message = $"Datasets created: {products.Length}";
        //    return Ok(response);
        //}
    }
}