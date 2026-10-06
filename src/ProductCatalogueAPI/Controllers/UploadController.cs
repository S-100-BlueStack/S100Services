using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Models;
using ProductCatalogueAPI.Services.Jobs;
using ProductCatalogueAPI.Services.Locking;
using ProductCatalogueAPI.Services.Export;
using S100FC.ProductCatalogue;
using System.Security.Cryptography;
using System.Text;

namespace ProductCatalogueAPI.Controllers
{
    /// <summary>Result of an operator's direct check of the IC-ENC intake.</summary>
    public sealed record ReconcileIcEncDeliveryRequest(bool ReceivedByIcEnc);

    // [Authorize("productmanager:distribute")]
    [AllowAnonymous]
    [ApiController]
    [Route("[controller]")]
    public class UploadController(
        ILogger<UploadController> logger,
        IProductRepository productRepository,
        IProductWorkflowRepository workflowRepository,
        IDatasetLockService datasetLockService,
        ISendToIcEncJobService sendToIcEncJobService,
        IOptionsMonitor<SendToIcEncOptions> sendToIcEncOptions,
        TimeProvider timeProvider,
        IProductManager productManager,
        IIcEncDeliveryRepository? deliveryRepository = null
    ) : ControllerBase
    {
        private readonly ILogger<UploadController> _logger = logger;
        private readonly IProductRepository _productRepository = productRepository;
        private readonly IProductWorkflowRepository _workflowRepository = workflowRepository;
        private readonly IDatasetLockService _datasetLockService = datasetLockService;
        private readonly ISendToIcEncJobService _sendToIcEncJobService = sendToIcEncJobService;
        private readonly IOptionsMonitor<SendToIcEncOptions> _sendToIcEncOptions = sendToIcEncOptions;
        private readonly TimeProvider _timeProvider = timeProvider;
        private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
        private readonly IIcEncDeliveryRepository? _deliveryRepository = deliveryRepository;

        /// <summary>
        /// Queues delivery of the ready S-57 or S-101 candidate to IC-ENC. Simulation mode performs no transfer.
        /// Live delivery requires X-ICENC-Operator-Key in the request header.
        /// </summary>
        [ProducesResponseType(typeof(ExportJobStartResponse), StatusCodes.Status202Accepted, "application/json")]
        [ProducesResponseType(typeof(ExportJobErrorResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ExportJobErrorResponse), StatusCodes.Status409Conflict, "application/json")]
        [ProducesResponseType(typeof(ExportJobErrorResponse), StatusCodes.Status503ServiceUnavailable, "application/json")]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        [HttpPost("{datasetName}", Name = "upload")]
        public async Task<IActionResult> UploadSingularProduct(
            string datasetName,
            CancellationToken cancellationToken,
            [FromHeader(Name = "X-ICENC-Operator-Key")] string? operatorKey = null
        ) {
            var mode = _sendToIcEncOptions.CurrentValue.Mode;
            if (mode == SendToIcEncMode.Disabled) {
                return JobProblem(
                    StatusCodes.Status503ServiceUnavailable,
                    SendToIcEncContract.DisabledCode,
                    SendToIcEncContract.DisabledMessage
                );
            }

            if (mode is not (SendToIcEncMode.Simulation or SendToIcEncMode.Live)) {
                return JobProblem(
                    StatusCodes.Status503ServiceUnavailable,
                    SendToIcEncContract.UnsupportedModeCode,
                    SendToIcEncContract.UnsupportedModeMessage
                );
            }

            if (mode == SendToIcEncMode.Live) {
                var provided = operatorKey ?? Request.Headers["X-ICENC-Operator-Key"].ToString();
                if (!HasLiveOperatorKey(provided))
                    return StatusCode(StatusCodes.Status403Forbidden);
            }

            ProductRecord? product;
            ExportProductIdentity? identity = null;
            try {
                if (mode == SendToIcEncMode.Live) {
                    identity = ExportProductResolver.Resolve(_electronicProductManager, datasetName);
                    var track = identity is null ? null : await _workflowRepository.GetTrackAsync(identity.DatasetName, identity.ProductSpecification, cancellationToken);
                    product = track is null ? null : new ProductRecord {
                        Name = track.DatasetName, State = track.State, EditionNo = track.CandidateEdition ?? track.PublishedEdition,
                        UpdateNo = track.CandidateUpdate ?? track.PublishedUpdate, ProductSpecification = track.ProductSpecification.ToString(),
                        IsManuallyFrozen = track.IsManuallyFrozen, ErrorCode = track.ErrorCode
                    };
                }
                else
                    product = await _productRepository.GetCurrentByNameAsync(datasetName);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
                throw;
            }
            catch (Exception ex) {
                _logger.LogError(
                    ex,
                    "IC-ENC send setup failed while reading Product state. DatasetName: {DatasetName}. CorrelationId: {CorrelationId}",
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

            var allowsSevenCsValidationOverride = product.State == ProductState.Error &&
                string.Equals(product.ErrorCode, SendToIcEncContract.SevenCsValidationFailedCode, StringComparison.Ordinal);
            if (product.IsManuallyFrozen || (mode == SendToIcEncMode.Live && product.State != ProductState.ReadyForDistribution) ||
                product.State is not (ProductState.Exported or ProductState.ReadyForDistribution) &&
                !(mode == SendToIcEncMode.Simulation && allowsSevenCsValidationOverride)) {
                _logger.LogWarning(
                    "IC-ENC send rejected because Product state is invalid. DatasetName: {DatasetName}. ExpectedState: {ExpectedState}. ActualState: {ActualState}",
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

            if (mode == SendToIcEncMode.Simulation && allowsSevenCsValidationOverride) {
                _logger.LogWarning(
                    "IC-ENC send simulation manually allowed despite SevenCs validation findings. DatasetName: {DatasetName}. User: {User}",
                    datasetName,
                    User?.Identity?.Name
                );
            }

            cancellationToken.ThrowIfCancellationRequested();

            var request = new SendToIcEncJobRequest(
                datasetName,
                mode,
                product.EditionNo,
                product.UpdateNo,
                HttpContext.TraceIdentifier,
                _timeProvider.GetUtcNow(),
                mode == SendToIcEncMode.Simulation && allowsSevenCsValidationOverride,
                identity?.ProductSpecification.ToString()
            );

            try {
                var response = _sendToIcEncJobService.Enqueue(request);
                _logger.LogInformation(
                    "IC-ENC send job enqueued. DatasetName: {DatasetName}. JobId: {JobId}. CorrelationId: {CorrelationId}",
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

        /// <summary>Accepts the former PUT send route used by the existing web client.</summary>
        [ApiExplorerSettings(IgnoreApi = true)]
        [HttpPut("{datasetName}")]
        public Task<IActionResult> UploadSingularProductLegacy(string datasetName, CancellationToken cancellationToken) => UploadSingularProduct(datasetName, cancellationToken);

        /// <summary>
        /// Places an independent manual hold on this product and its ENC package.
        /// </summary>
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status409Conflict)]
        [HttpPut("{datasetName}/hold", Name = "hold")]
        public async Task<IActionResult> HoldProduct(
            string datasetName,
            CancellationToken cancellationToken
        ) {
            var product = ExportProductResolver.Resolve(_electronicProductManager, datasetName);
            if (product is null)
                return NotFound();

            await using var datasetLock = await _datasetLockService.TryAcquireAsync(
                ProductTrackLockKey.For(product.DatasetName, product.ProductSpecification),
                cancellationToken
            );

            if (datasetLock == null)
                return Conflict($"Dataset {datasetName} is already being processed.");

            var version = await _electronicProductManager.ReadElectronicProductVersionAsync(product.DatasetName, product.ProductSpecification.ToString(), cancellationToken);
            if (version is null)
                return NotFound();
            if (version.Edition is null || version.Update is null)
                return Conflict($"Product {product.DatasetName} has no public edition or update number.");

            // The catalogue is authoritative; initialize SQL state before placing the hold.
            var track = await _workflowRepository.GetOrCreateTrackAsync(product.DatasetName, product.ProductSpecification, ExportEngineKind.IsoIec8211, version.Edition.Value, version.Update.Value, cancellationToken);

            if (track.IsManuallyFrozen || track.State == ProductState.Frozen)
                return Ok();

            if (track.State == ProductState.InTransit)
                return BadRequest($"Product {datasetName} is currently in transit and cannot be placed on hold.");

            var changed = await _workflowRepository.SetManualFreezeAsync(
                track.Id,
                User?.Identity?.Name,
                _timeProvider.GetUtcNow().UtcDateTime,
                cancellationToken
            );

            if (!changed)
                return Ok();

            return Ok();
        }

        /// <summary>Accepts the former freeze route used by the existing web client.</summary>
        [ApiExplorerSettings(IgnoreApi = true)]
        [HttpPut("{datasetName}/freeze")]
        public Task<IActionResult> HoldProductLegacy(string datasetName, CancellationToken cancellationToken) => HoldProduct(datasetName, cancellationToken);

        /// <summary>
        /// Releases an independent manual hold so future package detection can proceed.
        /// </summary>
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status409Conflict)]
        [HttpDelete("{datasetName}/hold", Name = "release-hold")]
        public async Task<IActionResult> ReleaseHoldProduct(
            string datasetName,
            CancellationToken cancellationToken
        ) {
            var product = ExportProductResolver.Resolve(_electronicProductManager, datasetName);
            if (product is null)
                return NotFound();

            await using var datasetLock = await _datasetLockService.TryAcquireAsync(
                ProductTrackLockKey.For(product.DatasetName, product.ProductSpecification),
                cancellationToken
            );

            if (datasetLock == null)
                return Conflict($"Dataset {datasetName} is already being processed.");

            var track = await _workflowRepository.GetTrackAsync(product.DatasetName, product.ProductSpecification, cancellationToken);

            if (track == null)
                return Ok();

            if (!track.IsManuallyFrozen)
                return Ok();

            var changed = await _workflowRepository.ClearManualFreezeAsync(
                track.Id,
                User?.Identity?.Name,
                _timeProvider.GetUtcNow().UtcDateTime,
                cancellationToken
            );

            if (!changed)
                return Ok();

            return Ok();
        }

        /// <summary>Accepts the former PUT release route during client migration.</summary>
        [ApiExplorerSettings(IgnoreApi = true)]
        [HttpPut("{datasetName}/release-hold")]
        [HttpPut("{datasetName}/unfreeze")]
        public Task<IActionResult> ReleaseHoldLegacy(string datasetName, CancellationToken cancellationToken) => ReleaseHoldProduct(datasetName, cancellationToken);

        /// <summary>
        /// Resolves an uncertain delivery after an operator checks IC-ENC's intake.
        /// Set ReceivedByIcEnc to false only after confirming that the receiver has no copy;
        /// the candidate then becomes ready for another send. A confirmed receipt remains InTransit.
        /// </summary>
        [HttpPost("deliveries/{deliveryId:guid}/reconcile")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status403Forbidden)]
        [ProducesResponseType(StatusCodes.Status409Conflict)]
        public async Task<IActionResult> ReconcileDelivery(Guid deliveryId, [FromBody] ReconcileIcEncDeliveryRequest request,
            CancellationToken cancellationToken, [FromHeader(Name = "X-ICENC-Operator-Key")] string? operatorKey = null) {
            if (_sendToIcEncOptions.CurrentValue.Mode != SendToIcEncMode.Live || _deliveryRepository is null)
                return StatusCode(StatusCodes.Status503ServiceUnavailable);
            if (!HasLiveOperatorKey(operatorKey ?? Request.Headers["X-ICENC-Operator-Key"].ToString()))
                return StatusCode(StatusCodes.Status403Forbidden);
            if (!await _deliveryRepository.ReconcileAsync(deliveryId, request.ReceivedByIcEnc,
                User?.Identity?.Name, _timeProvider.GetUtcNow().UtcDateTime, cancellationToken))
                return Conflict("The delivery is no longer uncertain or the product is no longer in transit.");
            return Ok();
        }

        private bool HasLiveOperatorKey(string? provided) {
            var configured = _sendToIcEncOptions.CurrentValue.OperatorKey;
            return !string.IsNullOrEmpty(configured) && !string.IsNullOrEmpty(provided) &&
                CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(configured)), SHA256.HashData(Encoding.UTF8.GetBytes(provided)));
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
