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

    /// <summary>Queues a manual new-edition build for Swagger testing and operator repair.</summary>
    [HttpPost("{name}/newedition", Name = "NewEdition")]
    [ProducesResponseType(typeof(ExportJobStartResponse), StatusCodes.Status202Accepted, "application/json")]
    public Task<IActionResult> NewEdition(string name, CancellationToken cancellationToken) => QueueJobAsync(name, ExportOperationType.ExportEdition, cancellationToken);

    /// <summary>Queues a manual update build for Swagger testing and operator repair.</summary>
    [HttpPost("{name}/newupdate", Name = "NewUpdate")]
    [ProducesResponseType(typeof(ExportJobStartResponse), StatusCodes.Status202Accepted, "application/json")]
    public Task<IActionResult> NewUpdate(string name, CancellationToken cancellationToken) => QueueJobAsync(name, ExportOperationType.ExportUpdate, cancellationToken);

    /// <summary>Queues a candidate discard; discarding both products removes the package until new edits are detected.</summary>
    [HttpPost("{name}/discard", Name = "Discard")]
    [ProducesResponseType(typeof(ExportJobStartResponse), StatusCodes.Status202Accepted, "application/json")]
    public Task<IActionResult> Discard(string name, CancellationToken cancellationToken) => QueueJobAsync(name, ExportOperationType.Discard, cancellationToken);

    /// <summary>Accepts the former UI discard route while clients move to /discard.</summary>
    [ApiExplorerSettings(IgnoreApi = true)]
    [HttpPost("{name}/cancel-export")]
    public Task<IActionResult> DiscardLegacy(string name, CancellationToken cancellationToken) => Discard(name, cancellationToken);

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

        if (version.Edition.Value == 0 && (operationType is ExportOperationType.ExportEdition or ExportOperationType.ExportUpdate))
            operationType = ExportOperationType.NewDataset;
        else if (operationType == ExportOperationType.NewDataset && version.Edition.Value != 0)
            return JobProblem(StatusCodes.Status409Conflict, ExportJobContract.NewDatasetInvalidVersionCode, ExportJobContract.NewDatasetInvalidVersionMessage);

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
