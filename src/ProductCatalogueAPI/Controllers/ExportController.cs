using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Models;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.Jobs;
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
public sealed class ExportController(ILogger<ExportController> logger, IProductManager productManager, IExportJobService exportJobService, TimeProvider timeProvider) : ControllerBase
{
    private readonly ILogger<ExportController> _logger = logger;
    private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
    private readonly IExportJobService _exportJobService = exportJobService;
    private readonly TimeProvider _timeProvider = timeProvider;

    /// <summary>Queues a new-edition candidate build.</summary>
    [HttpPost("{name}/newedition", Name = "NewEdition")]
    [ProducesResponseType(typeof(ExportJobStartResponse), StatusCodes.Status202Accepted, "application/json")]
    public Task<IActionResult> NewEdition(string name, CancellationToken cancellationToken) => QueueJobAsync(name, ExportOperationType.ExportEdition, cancellationToken);

    /// <summary>Queues an update candidate build.</summary>
    [HttpPost("{name}/newupdate", Name = "NewUpdate")]
    [ProducesResponseType(typeof(ExportJobStartResponse), StatusCodes.Status202Accepted, "application/json")]
    public Task<IActionResult> NewUpdate(string name, CancellationToken cancellationToken) => QueueJobAsync(name, ExportOperationType.ExportUpdate, cancellationToken);

    /// <summary>Preserves the legacy bulk route while preventing uncontrolled parallel publication behavior.</summary>
    [HttpPost("alldatasets", Name = "NewDatasets")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status501NotImplemented, "application/json")]
    public IActionResult CreateAllDatasets() => StatusCode(StatusCodes.Status501NotImplemented, new ApiResponse { Success = false, Message = "Bulk candidate creation is not implemented for independent export tracks." });

    /// <summary>Queues cancellation of one unverified product-track export.</summary>
    [HttpPost("{name}/cancel-export", Name = "CancelExport")]
    [ProducesResponseType(typeof(ExportJobStartResponse), StatusCodes.Status202Accepted, "application/json")]
    public Task<IActionResult> CancelExport(string name, CancellationToken cancellationToken) => QueueJobAsync(name, ExportOperationType.CancelExport, cancellationToken);

    /// <summary>Preserves the legacy analysis route while validation history is served by the electronic-products API.</summary>
    [HttpPost("{name}/analysis", Name = "GetAnalysis")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status501NotImplemented, "application/json")]
    public IActionResult GetExportAnalysis(string name) => StatusCode(StatusCodes.Status501NotImplemented, new ApiResponse { Success = false, Message = "Use GET /electronicproducts/{name}/artifacts/history for validation artifact history." });

    private async Task<IActionResult> QueueJobAsync(string name, ExportOperationType operationType, CancellationToken cancellationToken) {
        var correlationId = Activity.Current?.TraceId.ToString();
        if (string.IsNullOrWhiteSpace(correlationId))
            correlationId = HttpContext.TraceIdentifier;

        ElectronicProductVersion? version;
        ExportProductIdentity? product;
        try {
            product = ResolveProduct(name);
        }
        catch (ProductMappingIntegrityException ex) {
            _logger.LogError(ex, "Ambiguous S-128 ElectronicProduct during job creation. DatasetName: {DatasetName}. CorrelationId: {CorrelationId}.", name, correlationId);
            return JobProblem(StatusCodes.Status409Conflict, ExportJobContract.ProductDataIntegrityErrorCode, ExportJobContract.ProductDataIntegrityStartMessage);
        }

        if (product is null)
            return JobProblem(StatusCodes.Status404NotFound, ExportJobContract.ProductNotFoundCode, ExportJobContract.ProductNotFoundStartMessage);

        try {
            version = await _electronicProductManager.ReadElectronicProductVersionAsync(product.DatasetName, product.ProductSpecification.ToString(), cancellationToken);
            if (version is not null)
                version = version with { DatasetName = product.DatasetName };
        }
        catch (ProductDataIntegrityException ex) {
            _logger.LogError(ex, "Ambiguous S-128 ElectronicProduct during job creation. DatasetName: {DatasetName}. CorrelationId: {CorrelationId}.", name, correlationId);
            return JobProblem(StatusCodes.Status409Conflict, ExportJobContract.ProductDataIntegrityErrorCode, ExportJobContract.ProductDataIntegrityStartMessage);
        }

        if (version is null)
            return JobProblem(StatusCodes.Status404NotFound, ExportJobContract.ProductNotFoundCode, ExportJobContract.ProductNotFoundStartMessage);
        if (!version.Edition.HasValue || !version.Update.HasValue)
            return JobProblem(StatusCodes.Status409Conflict, ExportJobContract.ProductVersionUnavailableCode, ExportJobContract.ProductVersionUnavailableMessage);

        var request = new ExportOperationJobRequest(version.DatasetName, operationType, product.ProductSpecification.ToString(), version.Edition, version.Update, correlationId, _timeProvider.GetUtcNow());
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

    private ExportProductIdentity? ResolveProduct(string requestedDatasetName) =>
        ExportProductResolver.Resolve(_electronicProductManager, requestedDatasetName);
}
