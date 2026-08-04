using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using ProductManagerAPI.Options;
using ProductManagerAPI.Data.Models;
using ProductManagerAPI.Data.Repositories;
using ProductManagerAPI.Jobs;
using ProductManagerAPI.Models;
using ProductManagerAPI.Services.Jobs;
using ProductManagerAPI.Services.Locking;

namespace ProductManagerAPI.Controllers
{
    // [Authorize("productmanager:distribute")]
    [AllowAnonymous]
    [ApiController]
    [Route("[controller]")]
    public class UploadController(
        ILogger<UploadController> logger,
        IProductRepository productRepository,
        IDatasetLockService datasetLockService,
        ISendToIcEncJobService sendToIcEncJobService,
        IOptionsMonitor<SendToIcEncOptions> sendToIcEncOptions,
        TimeProvider timeProvider
    ) : ControllerBase
    {
        private readonly ILogger<UploadController> _logger = logger;
        private readonly IProductRepository _productRepository = productRepository;
        private readonly IDatasetLockService _datasetLockService = datasetLockService;
        private readonly ISendToIcEncJobService _sendToIcEncJobService = sendToIcEncJobService;
        private readonly IOptionsMonitor<SendToIcEncOptions> _sendToIcEncOptions = sendToIcEncOptions;
        private readonly TimeProvider _timeProvider = timeProvider;

        /// <summary>
        /// Enqueues a truthful IC-ENC send simulation when the capability is enabled.
        /// </summary>
        [ProducesResponseType(typeof(ExportJobStartResponse), StatusCodes.Status202Accepted, "application/json")]
        [ProducesResponseType(typeof(ExportJobErrorResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ExportJobErrorResponse), StatusCodes.Status409Conflict, "application/json")]
        [ProducesResponseType(typeof(ExportJobErrorResponse), StatusCodes.Status503ServiceUnavailable, "application/json")]
        [HttpPut("{datasetName}", Name = "upload")]
        public async Task<IActionResult> UploadSingularProduct(
            string datasetName,
            CancellationToken cancellationToken
        ) {
            _logger.LogInformation(
                "{Method}({DatasetName}). User: {User}",
                nameof(UploadSingularProduct),
                datasetName,
                User?.Identity?.Name ?? string.Empty
            );

            var mode = _sendToIcEncOptions.CurrentValue.Mode;
            if (mode == SendToIcEncMode.Disabled) {
                return JobProblem(
                    StatusCodes.Status503ServiceUnavailable,
                    SendToIcEncContract.DisabledCode,
                    SendToIcEncContract.DisabledMessage
                );
            }

            if (mode != SendToIcEncMode.Simulation) {
                return JobProblem(
                    StatusCodes.Status503ServiceUnavailable,
                    SendToIcEncContract.UnsupportedModeCode,
                    SendToIcEncContract.UnsupportedModeMessage
                );
            }

            ProductRecord? product;
            try {
                product = await _productRepository.GetCurrentByNameAsync(datasetName);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
                throw;
            }
            catch (Exception ex) {
                _logger.LogError(
                    ex,
                    "IC-ENC send simulation setup failed while reading Product state. DatasetName: {DatasetName}. CorrelationId: {CorrelationId}",
                    datasetName,
                    HttpContext.TraceIdentifier
                );
                return JobProblem(
                    StatusCodes.Status503ServiceUnavailable,
                    SendToIcEncContract.SetupFailedCode,
                    SendToIcEncContract.SetupFailedMessage
                );
            }

            if (product == null) {
                return JobProblem(
                    StatusCodes.Status404NotFound,
                    ExportJobContract.ProductNotFoundCode,
                    ExportJobContract.ProductNotFoundStartMessage
                );
            }

            if (product.State != ProductState.Exported) {
                _logger.LogWarning(
                    "IC-ENC send simulation rejected because Product state is invalid. DatasetName: {DatasetName}. ExpectedState: {ExpectedState}. ActualState: {ActualState}",
                    datasetName,
                    ProductState.Exported,
                    product.State
                );
                return JobProblem(
                    StatusCodes.Status409Conflict,
                    SendToIcEncContract.InvalidStateCode,
                    SendToIcEncContract.InvalidStateStartMessage
                );
            }

            cancellationToken.ThrowIfCancellationRequested();

            var request = new SendToIcEncJobRequest(
                datasetName,
                SendToIcEncMode.Simulation,
                product.EditionNo,
                product.UpdateNo,
                HttpContext.TraceIdentifier,
                _timeProvider.GetUtcNow()
            );

            try {
                var response = _sendToIcEncJobService.Enqueue(request);
                _logger.LogInformation(
                    "IC-ENC send simulation job enqueued. DatasetName: {DatasetName}. JobId: {JobId}. CorrelationId: {CorrelationId}",
                    datasetName,
                    response.JobId,
                    request.CorrelationId
                );
                return Accepted(response.StatusUrl, response);
            }
            catch (JobEnqueueException ex) {
                _logger.LogError(
                    ex,
                    "IC-ENC send simulation could not be queued. DatasetName: {DatasetName}. CorrelationId: {CorrelationId}",
                    datasetName,
                    request.CorrelationId
                );
                return JobProblem(
                    StatusCodes.Status503ServiceUnavailable,
                    ExportJobContract.JobEnqueueFailedCode,
                    ExportJobContract.JobEnqueueFailedMessage
                );
            }
        }

        /// <summary>
        /// Manually freezes a product so it will be excluded in the automatic upload to IC-ENC.
        /// </summary>
        [ProducesResponseType(typeof(string), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(string), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPut("{datasetName}/freeze", Name = "freeze")]
        public async Task<IActionResult> FreezeProduct(
            string datasetName,
            CancellationToken cancellationToken
        ) {
            _logger.LogInformation(
                "{Method}({DatasetName}). User: {User}",
                nameof(FreezeProduct),
                datasetName,
                User?.Identity?.Name ?? string.Empty
            );

            await using var datasetLock = await _datasetLockService.TryAcquireAsync(
                datasetName,
                cancellationToken
            );

            if (datasetLock == null)
                return Conflict($"Dataset {datasetName} is already being processed.");

            var product = await _productRepository.GetCurrentByNameAsync(datasetName);

            if (product == null)
                return NotFound();

            if (product.State == ProductState.Frozen)
                return BadRequest($"Product {datasetName} is already frozen.");

            if (product.State == ProductState.InTransit)
                return BadRequest($"Product {datasetName} is currently in transit and cannot be frozen.");

            await _productRepository.AppendAsync(
                datasetName,
                ProductState.Frozen,
                "S-101",
                (uint)product.EditionNo,
                (uint?)product.UpdateNo,
                User?.Identity?.Name
            );

            return Ok();
        }

        /// <summary>
        /// Unfreezes a product so it will be included again in the automatic upload to IC-ENC.
        /// </summary>
        [ProducesResponseType(typeof(string), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(string), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPut("{datasetName}/unfreeze", Name = "unfreeze")]
        public async Task<IActionResult> UnfreezeProduct(
            string datasetName,
            CancellationToken cancellationToken
        ) {
            _logger.LogInformation(
                "{Method}({DatasetName}). User: {User}",
                nameof(UnfreezeProduct),
                datasetName,
                User?.Identity?.Name ?? string.Empty
            );

            await using var datasetLock = await _datasetLockService.TryAcquireAsync(
                datasetName,
                cancellationToken
            );

            if (datasetLock == null)
                return Conflict($"Dataset {datasetName} is already being processed.");

            var product = await _productRepository.GetCurrentByNameAsync(datasetName);

            if (product == null)
                return NotFound();

            if (product.State != ProductState.Frozen)
                return BadRequest($"Product {datasetName} is not frozen and cannot be unfrozen.");

            await _productRepository.AppendAsync(
                datasetName,
                ProductState.Idle,
                "S-101",
                (uint)product.EditionNo,
                (uint?)product.UpdateNo,
                User?.Identity?.Name
            );

            return Ok();
        }

        private static ObjectResult JobProblem(int statusCode, string code, string message) {
            var result = new ObjectResult(new ExportJobErrorResponse {
                Code = code,
                Message = message
            }) {
                StatusCode = statusCode
            };
            result.ContentTypes.Add("application/json");
            return result;
        }
    }
}
