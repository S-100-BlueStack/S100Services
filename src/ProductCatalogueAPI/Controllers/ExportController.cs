using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Filters;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Models;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.Locking;
using ProductCatalogueAPI.Services.Jobs;
using ProductCatalogueAPI.Services.Operations;
using S100FC.ProductCatalogue;
using S100FC.S128.SimpleAttributes;
using S100FC.YAML;
using System.Diagnostics;
using static ProductCatalogueAPI.Models.RequestTypes;
using static ProductCatalogueAPI.Models.ResponseTypes;
using IO = System.IO;

namespace ProductCatalogueAPI.Controllers
{
    [AllowAnonymous]
    //[Authorize("productmanager:manage")]
    [ApiController]
    [Route("[controller]")]
    public class ExportController(ILogger<ExportController> logger, IMemoryCache cache, IExportService exportService, IProductManager productManager, IProductRepository productRepository, IDatasetLockService datasetLockService, IExportOperationService exportOperationService, IExportJobService exportJobService, TimeProvider timeProvider) : ControllerBase
    {
        private readonly ILogger<ExportController> _logger = logger;
        private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
        private readonly IExportService _exportService = exportService;
        private readonly IProductRepository _productRepository = productRepository;
        private readonly IDatasetLockService _datasetLockService = datasetLockService;
        private readonly IMemoryCache _cache = cache;
        private readonly IExportOperationService _exportOperationService = exportOperationService;
        private readonly IExportJobService _exportJobService = exportJobService;
        private readonly TimeProvider _timeProvider = timeProvider;


        /// <summary>
        /// Creates a new edition.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest, "application/problem+json")]
        [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status422UnprocessableEntity, "application/problem+json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status409Conflict, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [ValidateExportTarget]
        [HttpPost("{name}/newedition", Name = "NewEdition")]
        public async Task<IActionResult> NewEdition(string name, CancellationToken cancellationToken) {
            var user = User?.Identity?.Name;
            _logger.LogInformation("{NewEdition} called with name: {name} by user: {user}", nameof(NewEdition), name, user);

            var sw = Stopwatch.StartNew();
            var response = new ApiResponse();
            var exportTarget = ExportTargetContract.GetValidatedTarget(HttpContext);
            var product = _electronicProductManager.ElectronicProduct(name);

            if (product == null) {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status404NotFound, response);
            }

            await using var datasetLock = await _datasetLockService.TryAcquireAsync(name, cancellationToken);
            if (datasetLock == null) {
                response.Success = false;
                response.Message = $"Dataset {name} is already being processed.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status409Conflict, response);
            }

            try {
                await _exportOperationService.ExecuteNewEditionAsync(
                    name,
                    exportTarget,
                    user,
                    cancellationToken
                );
            }
            catch (ExportOperationRejectedException ex) {
                response.Success = false;
                response.Message = ex.Message;
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status400BadRequest, response);
            }
            catch (ExportSourceUnavailableException) {
                response.Success = false;
                response.Message = $"An error occured attempting to read dataset '{name}'.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status500InternalServerError, response);
            }

            response.DurationMs = sw.ElapsedMilliseconds;
            return Ok(response);
        }

        /// <summary>
        /// Queues a new S-100 edition export.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        [ProducesResponseType(typeof(ExportJobStartResponse), StatusCodes.Status202Accepted, "application/json")]
        [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest, "application/problem+json")]
        [ProducesResponseType(typeof(ExportJobErrorResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ExportJobErrorResponse), StatusCodes.Status409Conflict, "application/json")]
        [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status422UnprocessableEntity, "application/problem+json")]
        [ProducesResponseType(typeof(ExportJobErrorResponse), StatusCodes.Status503ServiceUnavailable, "application/json")]
        [ValidateExportTarget]
        [HttpPost("{name}/newedition/jobs", Name = "NewEditionJob")]
        public async Task<IActionResult> NewEditionJob(string name, CancellationToken cancellationToken) {
            var exportTarget = ExportTargetContract.GetValidatedTarget(HttpContext);
            return await QueueJobAsync(
                name,
                ExportOperationType.ExportEdition,
                ExportOperationContract.ToPublicExportTarget(exportTarget),
                cancellationToken
            );
        }



        /// <summary>
        /// Creates a new update.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest, "application/problem+json")]
        [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status422UnprocessableEntity, "application/problem+json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status501NotImplemented, "application/json")]
        [ValidateExportTarget]
        [HttpPost("{name}/newupdate", Name = "NewUpdate")]
        public async Task<IActionResult> NewUpdate(string name, CancellationToken cancellationToken) {
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse();
            var exportTarget = ExportTargetContract.GetValidatedTarget(HttpContext);



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

            // Check if eligble for new update
            var ps = await _productRepository.GetCurrentByNameAsync(name);

            if (ps is null || ps.State is not Data.Models.ProductState.Idle) {
                response.Success = false;
                response.Message = $"A New update could not be created now. Current product state: {ps?.State}.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status400BadRequest, response);
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
                var result = _exportService.CreateS100Export(name, dataset.Edition.Value, dataset.Update, _electronicProductManager.OutputFolder, update, prevIndex);

                // Store in s128 attachment table
                await _electronicProductManager.CreateAttachmentAsync(name, ExportTypes.Update, update, result.Index, result.Sign);


                // Store in system job table.
                await _productRepository.AppendAsync(name, Data.Models.ProductState.Exported, "S-101", dataset.Edition.Value, dataset.Update, user);
            }


            // S-57
            if (exportTarget is Models.RequestTypes.ExportFormat.Both or Models.RequestTypes.ExportFormat.S57) {
                var S57Name = name;
                var S57Edition = 1u;
                var S57Update = 1u;

                _exportService.CreateS57Export(S57Name, dataset.Edition.Value, dataset.Update, _electronicProductManager.OutputFolder, latest);

                // Store in s128 attachment table. TODO: Add necessary files if needed
                await _electronicProductManager.CreateS57AttachmentAsync(S57Name, ExportTypes.Update, latest);

                // Store in system job table.
                await _productRepository.AppendAsync(S57Name, Data.Models.ProductState.Exported, "S-57", S57Edition, S57Update, user);
            }

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

            var yaml = dataset.Serialize();

            var result = _exportService.CreateS100Export(name, dataset.Edition!.Value, dataset.Update, _electronicProductManager.OutputFolder, yaml);

            // _exportService.CreateS57Export(name, dataset.Edition!.Value, dataset.Update!.Value, _electronicProductManager.OutputFolder, yaml);

            await _electronicProductManager.CreateAttachmentAsync(name, ExportTypes.NewDataset, yaml, result.Index, result.Sign);
            _logger.LogInformation("Exchangeset created successfully");

            await _productRepository.AppendAsync(name, Data.Models.ProductState.Idle, "S-101", dataset.Edition.Value, dataset.Update);

            response.DurationMs = sw.ElapsedMilliseconds;
            return Ok(response);
        }


        /// <summary>
        /// Begins a rollback process on the specified dataset.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        ///         /// <param name="exportTarget">The target format(s) for the export.</param>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPost("{name}/rollback", Name = "RollBack")]
        public async Task<IActionResult> RollBack(string name, CancellationToken cancellationToken, Models.RequestTypes.ExportFormat exportTarget = Models.RequestTypes.ExportFormat.S100) {
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

            await using var datasetLock = await _datasetLockService.TryAcquireAsync(name, cancellationToken);
            if (datasetLock == null) {
                response.Success = false;
                response.Message = $"Dataset {name} is already being processed.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status409Conflict, response);
            }

            try {
                await _exportOperationService.ExecuteRollbackAsync(
                    name,
                    cancellationToken
                );
            }
            catch (ExportOperationRejectedException ex) {
                response.Success = false;
                response.Message = ex.Message;
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status400BadRequest, response);
            }

            return Ok();
        }

        /// <summary>
        /// Queues a rollback operation.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        [ProducesResponseType(typeof(ExportJobStartResponse), StatusCodes.Status202Accepted, "application/json")]
        [ProducesResponseType(typeof(ExportJobErrorResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ExportJobErrorResponse), StatusCodes.Status409Conflict, "application/json")]
        [ProducesResponseType(typeof(ExportJobErrorResponse), StatusCodes.Status503ServiceUnavailable, "application/json")]
        [HttpPost("{name}/rollback/jobs", Name = "RollBackJob")]
        public Task<IActionResult> RollBackJob(string name, CancellationToken cancellationToken) =>
            QueueJobAsync(
                name,
                ExportOperationType.Rollback,
                exportTarget: null,
                cancellationToken
            );


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


        private async Task<IActionResult> QueueJobAsync(
            string name,
            ExportOperationType operationType,
            string? exportTarget,
            CancellationToken cancellationToken
        ) {
            var correlationId = Activity.Current?.TraceId.ToString();
            if (string.IsNullOrWhiteSpace(correlationId))
                correlationId = HttpContext.TraceIdentifier;

            ElectronicProductVersion? version;
            try {
                version = await _electronicProductManager.ReadElectronicProductVersionAsync(
                    name,
                    cancellationToken
                );
            }
            catch (ProductDataIntegrityException ex) {
                _logger.LogError(
                    ex,
                    "Ambiguous authoritative Product data found during job creation. DatasetName: {DatasetName}. ExactMatchCount: {ExactMatchCount}. CorrelationId: {CorrelationId}",
                    name,
                    ex.ExactMatchCount,
                    correlationId
                );
                return JobProblem(
                    StatusCodes.Status409Conflict,
                    "Product data integrity error",
                    ExportJobContract.ProductDataIntegrityStartMessage,
                    ExportJobContract.ProductDataIntegrityErrorCode
                );
            }

            if (version == null) {
                return JobProblem(
                    StatusCodes.Status404NotFound,
                    "Product not found",
                    ExportJobContract.ProductNotFoundStartMessage,
                    ExportJobContract.ProductNotFoundCode
                );
            }

            if (!version.Edition.HasValue || !version.Update.HasValue) {
                return JobProblem(
                    StatusCodes.Status409Conflict,
                    "Product version unavailable",
                    ExportJobContract.ProductVersionUnavailableMessage,
                    ExportJobContract.ProductVersionUnavailableCode
                );
            }

            var request = new ExportOperationJobRequest(
                version.DatasetName,
                operationType,
                exportTarget,
                version.Edition,
                version.Update,
                correlationId,
                _timeProvider.GetUtcNow()
            );

            try {
                var startResponse = _exportJobService.Enqueue(request);
                return Accepted(startResponse.StatusUrl, startResponse);
            }
            catch (JobEnqueueException ex) {
                _logger.LogError(
                    ex,
                    "Failed to enqueue Product Manager job. DatasetName: {DatasetName}. OperationType: {OperationType}. CorrelationId: {CorrelationId}",
                    version.DatasetName,
                    operationType,
                    correlationId
                );
                return JobProblem(
                    StatusCodes.Status503ServiceUnavailable,
                    "Job enqueue failed",
                    ExportJobContract.JobEnqueueFailedMessage,
                    ExportJobContract.JobEnqueueFailedCode
                );
            }
        }

        private static ObjectResult JobProblem(
            int status,
            string title,
            string detail,
            string code
        ) {
            _ = title;
            var result = new ObjectResult(new ExportJobErrorResponse {
                Code = code,
                Message = detail
            }) {
                StatusCode = status
            };
            result.ContentTypes.Add("application/json");
            return result;
        }


#if DEBUG
        /// <summary>
        /// Only used for testing.
        /// </summary>
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


                    // ONLY DK For now
                    if (product.specificUsage != 4)
                        continue;


                    // Create exchange set
                    var dataset = await _electronicProductManager.CreateNewDatasetAsync(name);

                    var yaml = dataset.Serialize();

                    var result = _exportService.CreateS100Export(name, dataset.Edition!.Value, dataset.Update, _electronicProductManager.OutputFolder, yaml);

                    // _exportService.CreateS57Export(name, dataset.Edition!.Value, dataset.Update!.Value, _electronicProductManager.OutputFolder, yaml);

                    await _electronicProductManager.CreateAttachmentAsync(name, ExportTypes.NewDataset, yaml, result.Index, result.Sign);
                    _logger.LogInformation("Exchangeset created successfully");

                    await _productRepository.AppendAsync(name, Data.Models.ProductState.Idle, "S-101", dataset.Edition.Value, dataset.Update);
                }
                catch (InvalidOperationException ex) {
                    _logger.LogWarning("ex: {ex}", ex);
                    Console.WriteLine(ex);
                }
                catch (IndexOutOfRangeException ex) {
                    _logger.LogWarning("Topology IndexOutOfRangeException! skipping");
                    Console.WriteLine(ex);
                }
                catch (AggregateException ex) {
                    _logger.LogWarning("Topology AggregateException! skipping");
                    Console.WriteLine(ex);
                }
                catch (ArgumentException ex) {
                    _logger.LogWarning("s100compiler exception for exchangeset. Probably missing minimumScale on DataCoverage skipping");
                    Console.WriteLine(ex);
                }
                catch (Exception ex) {
                    _logger.LogError("Unexpected exception: {ex}", ex);
                    Console.WriteLine(ex);
                }

            }
            response.DurationMs = sw.ElapsedMilliseconds;
            response.Message = $"Datasets created: {products.Length}";
            return Ok(response);
        }
#endif
    }
}
