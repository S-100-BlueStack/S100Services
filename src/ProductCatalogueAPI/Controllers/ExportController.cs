using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Filters;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Models;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.Jobs;
using ProductCatalogueAPI.Services.Locking;
using ProductCatalogueAPI.Services.Operations;
using S100FC.ProductCatalogue;
using System.Diagnostics;
using static ProductCatalogueAPI.Models.ResponseTypes;

namespace ProductCatalogueAPI.Controllers;

/// <summary>
/// Starts SQL-authoritative candidate export workflows. These endpoints do not publish data to S-128.
/// </summary>
[AllowAnonymous]
[ApiController]
[Route("[controller]")]
public sealed class ExportController(ILogger<ExportController> logger, IProductManager productManager, IDatasetLockService datasetLockService, IExportOperationService exportOperationService, IExportJobService exportJobService, TimeProvider timeProvider) : ControllerBase
{
    private readonly ILogger<ExportController> _logger = logger;
    private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
    private readonly IDatasetLockService _datasetLockService = datasetLockService;
    private readonly IExportOperationService _exportOperationService = exportOperationService;
    private readonly IExportJobService _exportJobService = exportJobService;
    private readonly TimeProvider _timeProvider = timeProvider;

    /// <summary>Builds and validates a new-edition candidate without changing S-128.</summary>
    [ValidateExportTarget]
    [HttpPost("{name}/newedition", Name = "NewEdition")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
    public Task<IActionResult> NewEdition(string name, CancellationToken cancellationToken) => ExecuteExportAsync(name, ExportRevisionType.NewEdition, cancellationToken);

    /// <summary>Queues a new-edition candidate build.</summary>
    [ValidateExportTarget]
    [HttpPost("{name}/newedition/jobs", Name = "NewEditionJob")]
    [ProducesResponseType(typeof(ExportJobStartResponse), StatusCodes.Status202Accepted, "application/json")]
    public Task<IActionResult> NewEditionJob(string name, CancellationToken cancellationToken) => QueueJobAsync(name, ExportOperationType.ExportEdition, ExportTargetContract.GetValidatedTarget(HttpContext), cancellationToken);

    /// <summary>Builds and validates an update candidate without changing S-128.</summary>
    [ValidateExportTarget]
    [HttpPost("{name}/newupdate", Name = "NewUpdate")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
    public Task<IActionResult> NewUpdate(string name, CancellationToken cancellationToken) => ExecuteExportAsync(name, ExportRevisionType.Update, cancellationToken);

    /// <summary>Queues an update candidate build.</summary>
    [ValidateExportTarget]
    [HttpPost("{name}/newupdate/jobs", Name = "NewUpdateJob")]
    [ProducesResponseType(typeof(ExportJobStartResponse), StatusCodes.Status202Accepted, "application/json")]
    public Task<IActionResult> NewUpdateJob(string name, CancellationToken cancellationToken) => QueueJobAsync(name, ExportOperationType.ExportUpdate, ExportTargetContract.GetValidatedTarget(HttpContext), cancellationToken);

    /// <summary>Builds the first candidate edition for a catalogue product without publishing it to S-128.</summary>
    [ValidateExportTarget]
    [HttpPost("{name}/newdataset", Name = "NewDataset")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
    public Task<IActionResult> NewDataset(string name, CancellationToken cancellationToken) => ExecuteExportAsync(name, ExportRevisionType.NewEdition, cancellationToken);

    /// <summary>Preserves the legacy bulk route while preventing uncontrolled parallel publication behavior.</summary>
    [HttpPost("alldatasets", Name = "NewDatasets")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status501NotImplemented, "application/json")]
    public IActionResult CreateAllDatasets() => StatusCode(StatusCodes.Status501NotImplemented, new ApiResponse { Success = false, Message = "Bulk candidate creation is not implemented for independent export tracks." });

    /// <summary>Cancels one unverified product-track export without changing S-128.</summary>
    [ValidateExportTarget]
    [HttpPost("{name}/cancel-export", Name = "CancelExport")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
    public async Task<IActionResult> CancelExport(string name, CancellationToken cancellationToken) {
        var target = ExportTargetContract.GetValidatedTarget(HttpContext);
        await using var datasetLock = await _datasetLockService.TryAcquireAsync($"{name}-{target}", cancellationToken);
        if (datasetLock is null)
            return Conflict(new ApiResponse { Success = false, Message = $"The {target} export for {name} is already being processed." });

        try {
            var result = await _exportOperationService.ExecuteCancelExportAsync(name, target, User?.Identity?.Name, cancellationToken);
            return Ok(new ApiResponse { Success = true, Message = result.Message });
        }
        catch (ExportOperationRejectedException ex) {
            return BadRequest(new ApiResponse { Success = false, Message = ex.Message });
        }
    }

    /// <summary>Queues cancellation of one unverified product-track export.</summary>
    [ValidateExportTarget]
    [HttpPost("{name}/cancel-export/jobs", Name = "CancelExportJob")]
    [ProducesResponseType(typeof(ExportJobStartResponse), StatusCodes.Status202Accepted, "application/json")]
    public Task<IActionResult> CancelExportJob(string name, CancellationToken cancellationToken) => QueueJobAsync(name, ExportOperationType.CancelExport, ExportTargetContract.GetValidatedTarget(HttpContext), cancellationToken);

    /// <summary>Preserves the analysis route until validation artifacts receive a dedicated query contract.</summary>
    [HttpPost("{name}/analysis", Name = "GetAnalysis")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status501NotImplemented, "application/json")]
    public IActionResult GetExportAnalysis(string name) => StatusCode(StatusCodes.Status501NotImplemented, new ApiResponse { Success = false, Message = "Validation artifact retrieval is not implemented yet." });

    private async Task<IActionResult> ExecuteExportAsync(string name, ExportRevisionType revisionType, CancellationToken cancellationToken) {
        var stopwatch = Stopwatch.StartNew();
        var target = ExportTargetContract.GetValidatedTarget(HttpContext);
        await using var datasetLock = await _datasetLockService.TryAcquireAsync($"{name}-{target}", cancellationToken);
        if (datasetLock is null)
            return Conflict(new ApiResponse { Success = false, Message = $"The {target} export for {name} is already being processed.", DurationMs = stopwatch.ElapsedMilliseconds });

        try {
            var result = await _exportOperationService.ExecuteExportAsync(name, target, revisionType, User?.Identity?.Name, cancellationToken: cancellationToken);
            return Ok(new ApiResponse { Success = true, Message = result.Message, DurationMs = stopwatch.ElapsedMilliseconds });
        }
        catch (ExportOperationRejectedException ex) {
            return BadRequest(new ApiResponse { Success = false, Message = ex.Message, DurationMs = stopwatch.ElapsedMilliseconds });
        }
        catch (ExportSourceUnavailableException) {
            return StatusCode(StatusCodes.Status500InternalServerError, new ApiResponse { Success = false, Message = $"The source snapshot for '{name}' could not be created.", DurationMs = stopwatch.ElapsedMilliseconds });
        }
        catch (ExportValidationException ex) {
            return StatusCode(StatusCodes.Status422UnprocessableEntity, new ApiResponse { Success = false, Message = ex.PublicMessage, DurationMs = stopwatch.ElapsedMilliseconds });
        }
    }

    private async Task<IActionResult> QueueJobAsync(string name, ExportOperationType operationType, ProductSpecification exportTarget, CancellationToken cancellationToken) {
        var correlationId = Activity.Current?.TraceId.ToString();
        if (string.IsNullOrWhiteSpace(correlationId))
            correlationId = HttpContext.TraceIdentifier;

        ElectronicProductVersion? version;
        try {
            version = await _electronicProductManager.ReadElectronicProductVersionAsync(name, cancellationToken);
        }
        catch (ProductDataIntegrityException ex) {
            _logger.LogError(ex, "Ambiguous S-128 ElectronicProduct during job creation. DatasetName: {DatasetName}. CorrelationId: {CorrelationId}.", name, correlationId);
            return JobProblem(StatusCodes.Status409Conflict, ExportJobContract.ProductDataIntegrityErrorCode, ExportJobContract.ProductDataIntegrityStartMessage);
        }

        if (version is null)
            return JobProblem(StatusCodes.Status404NotFound, ExportJobContract.ProductNotFoundCode, ExportJobContract.ProductNotFoundStartMessage);
        if (!version.Edition.HasValue || !version.Update.HasValue)
            return JobProblem(StatusCodes.Status409Conflict, ExportJobContract.ProductVersionUnavailableCode, ExportJobContract.ProductVersionUnavailableMessage);

        var request = new ExportOperationJobRequest(version.DatasetName, operationType, exportTarget.ToString(), version.Edition, version.Update, correlationId, _timeProvider.GetUtcNow());
        try {
            var response = _exportJobService.Enqueue(request);
            return Accepted(response.StatusUrl, response);
        }
        catch (JobEnqueueException ex) {
            _logger.LogError(ex, "Export operation could not be queued. DatasetName: {DatasetName}. CorrelationId: {CorrelationId}.", name, correlationId);
            return JobProblem(StatusCodes.Status503ServiceUnavailable, ExportJobContract.JobEnqueueFailedCode, ExportJobContract.JobEnqueueFailedMessage);
        }
    }

    private static ObjectResult JobProblem(int statusCode, string code, string message) {
        var result = new ObjectResult(new ExportJobErrorResponse { Code = code, Message = message }) { StatusCode = statusCode };
        result.ContentTypes.Add("application/json");
        return result;
    }
}
