using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Xml;
using Hangfire;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using ProductCatalogueAPI.Contracts;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Services.BathymetricSurfaces;
using ProductCatalogueAPI.Services.Distribution;
using static ProductCatalogueAPI.Contracts.ResponseTypes;

namespace ProductCatalogueAPI.Controllers;

/// <summary>Receives bathymetric export callbacks and queues submission of the completed exchange set.</summary>
/// <param name="catalogue">Resolves S-128 dataset names for new exports and sends.</param>
/// <param name="repository">Stores export reservations, outputs and delivery status.</param>
/// <param name="deliveryRepository">Reconciles independently verified IC-ENC transfer outcomes.</param>
/// <param name="clock">Supplies the UTC time of a reconciliation.</param>
/// <param name="jobs">Queues delivery on the ProductCatalogue Worker.</param>
/// <param name="deliveryOptions">Controls the bathymetric IC-ENC intake and simulation mode.</param>
[ApiController]
[Route("[controller]")]
public sealed class BathymetricSurfacesController(BathymetricSurfaceService catalogue, ProductExternalExportRepository repository,
    IIcEncDeliveryRepository deliveryRepository, TimeProvider clock, IBackgroundJobClient jobs, IOptionsMonitor<BathymetricSurfaceDeliveryOptions> deliveryOptions) : ControllerBase
{
    /// <summary>Reserves exports for a batch of changed bathymetric datasets.</summary>
    /// <param name="request">Canonical dataset names and a stable producer-generated export identifier.</param>
    /// <param name="cancellationToken">Cancels acquisition of the batch.</param>
    /// <returns>Current export states, or a problem response if any dataset cannot be locked.</returns>
    [Authorize("productmanager:manage")]
    [HttpPost("changes")]
    [ProducesResponseType(typeof(ApiResponse<ExternalProductExportResponse[]>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> ReportChanges([FromBody] BathymetricChangeReport request, CancellationToken cancellationToken) {
        if (request.ExportId == Guid.Empty)
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "A non-empty exportId is required.");

        var products = new Dictionary<string, ProductExternalExportRepository.ExternalProductReference>(StringComparer.OrdinalIgnoreCase);
        foreach (var input in request.DatasetNames) {
            if (!BathymetricSurfaceService.IsDatasetName(input))
                return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Use a dataset name of at most 64 characters with ASCII letters, digits, underscores or hyphens, and an optional .H5 extension.");

            var product = catalogue.ResolveDataset(input);
            if (product is null)
                return Problem(statusCode: StatusCodes.Status404NotFound, title: "Bathymetric dataset not found.", detail: input);
            products.TryAdd(product.DatasetName, product);
        }

        var ordered = products.Values.OrderBy(product => product.DatasetName, StringComparer.OrdinalIgnoreCase).ToArray();
        var exports = await repository.StartAsync(ordered, request.ExportId, BathymetricSurfaceService.Specification,
            ExportEngineKind.Hdf5, User.Identity?.Name, cancellationToken);
        return exports is null
            ? Problem(statusCode: StatusCodes.Status409Conflict, title: "A dataset has a conflicting export or delivery lock.")
            : Ok(new ApiResponse<ExternalProductExportResponse[]> { Data = exports, TotalHits = exports.Length });
    }

    /// <summary>Completes the exact reserved export and stores the producer's exchange set and validation evidence.</summary>
    /// <param name="datasetName">Bathymetric dataset name from the change report.</param>
    /// <param name="exportId">Identifier of the reserved export.</param>
    /// <param name="completion">Producer's validation result and optional diagnostic, with a ZIP required on success.</param>
    /// <param name="cancellationToken">Cancels file reads and persistence.</param>
    /// <returns>The updated export, or a problem response when the output is invalid or the export reservation is stale.</returns>
    [Authorize("productmanager:manage")]
    [HttpPost("{datasetName}/exports/{exportId:guid}/complete")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(BathymetricUploadLimits.RequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = BathymetricUploadLimits.RequestBytes)]
    [ProducesResponseType(typeof(ApiResponse<ExternalProductExportResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CompleteExport(string datasetName, Guid exportId, [FromForm] BathymetricExportCompletion completion, CancellationToken cancellationToken) {
        if (!BathymetricSurfaceService.IsDatasetName(datasetName) || exportId == Guid.Empty || completion.ValidationPassed is not bool passed)
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "A dataset name, export identifier and validation result are required.");

        if (passed && completion.ExchangeSet is null)
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "A successful export must include an exchange-set ZIP.");

        byte[]? exchangeSet;
        byte[]? artifact;
        int? edition = null;
        try {
            exchangeSet = await ReadFileAsync(completion.ExchangeSet, ".zip", BathymetricUploadLimits.ExchangeSetBytes, cancellationToken);
            artifact = await ReadFileAsync(completion.ValidationArtifact, ".vld", BathymetricUploadLimits.ValidationArtifactBytes, cancellationToken);
            if (passed) {
                using var stream = new MemoryStream(exchangeSet!, writable: false);
                using var zip = new ZipArchive(stream, ZipArchiveMode.Read);
                edition = await BathymetricExchangeSet.ReadEditionAsync(zip, datasetName, cancellationToken);
            }
        }
        catch (InvalidDataException exception) {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Export output is invalid.", detail: exception.Message);
        }
        catch (XmlException) {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "The exchange catalogue is invalid XML.");
        }

        // The producer can finish an existing lock even if its entry was removed from the S-128 catalogue during the export.
        var name = catalogue.ResolveDataset(datasetName)?.DatasetName ?? datasetName;
        var result = await repository.CompleteAsync(name, BathymetricSurfaceService.Specification, exportId, passed, edition, exchangeSet,
            artifact, User.Identity?.Name, cancellationToken);
        return result is null
            ? Problem(statusCode: StatusCodes.Status409Conflict, title: "Export ID, edition or output conflicts with the current dataset export.")
            : Ok(new ApiResponse<ExternalProductExportResponse> { Data = result });
    }

    /// <summary>Queues IC-ENC submission of a validated export using the bathymetric delivery profile.</summary>
    /// <param name="datasetName">Bathymetric dataset name.</param>
    /// <param name="exportId">Exact export selected for submission.</param>
    /// <param name="cancellationToken">Cancels request validation before the job is queued.</param>
    /// <param name="operatorKey">Required IC-ENC operator header in live mode.</param>
    /// <returns>An accepted response with the job identifier, or a problem response if delivery cannot be queued.</returns>
    [Authorize("productmanager:distribute")]
    [HttpPost("{datasetName}/exports/{exportId:guid}/send")]
    [ProducesResponseType(typeof(BathymetricSendResponse), StatusCodes.Status202Accepted)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Send(string datasetName, Guid exportId, CancellationToken cancellationToken,
        [FromHeader(Name = "X-ICENC-Operator-Key")] string? operatorKey = null) {
        var settings = deliveryOptions.CurrentValue;
        var mode = settings.Mode;
        if (!settings.CanSend(mode))
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Bathymetric surface delivery is disabled or unavailable.");

        if (mode == SendToIcEncMode.Live && !HasOperatorKey(settings.OperatorKey, operatorKey))
            return Forbid();

        if (!BathymetricSurfaceService.IsDatasetName(datasetName) || catalogue.ResolveDataset(datasetName) is not { DatasetName: var name })
            return Problem(statusCode: StatusCodes.Status404NotFound, title: "Bathymetric dataset not found.");

        var current = (await repository.GetCurrentAsync(name, BathymetricSurfaceService.Specification, cancellationToken)).SingleOrDefault();
        if (exportId == Guid.Empty || current is null || current.ExportId != exportId || current.Status != ExternalProductExportStatus.ReadyForDistribution)
            return Problem(statusCode: StatusCodes.Status409Conflict, title: "The selected export is not ready for distribution.");

        cancellationToken.ThrowIfCancellationRequested();
        var jobId = jobs.Enqueue<SendBathymetricSurfaceJob>(job => job.RunAsync(name, exportId, mode, CancellationToken.None, null));
        return Accepted(new BathymetricSendResponse(jobId, exportId));
    }

    /// <summary>Reconciles an uncertain transfer after the operator verifies the outcome with IC-ENC.</summary>
    /// <param name="datasetName">Bathymetric dataset name from the delivery record.</param>
    /// <param name="exportId">Current export associated with the uncertain delivery.</param>
    /// <param name="deliveryId">Exact handoff to reconcile.</param>
    /// <param name="request">Confirmed receipt or confirmed absence of this handoff at the intake.</param>
    /// <param name="cancellationToken">Cancels the reconciliation.</param>
    /// <param name="operatorKey">Bathymetric delivery operator key.</param>
    /// <returns>200 on reconciliation, or a problem response if the delivery is no longer uncertain.</returns>
    [Authorize("productmanager:distribute")]
    [HttpPost("{datasetName}/exports/{exportId:guid}/deliveries/{deliveryId:guid}/reconcile")]
    public async Task<IActionResult> ReconcileDelivery(string datasetName, Guid exportId, Guid deliveryId,
        [FromBody] ReconcileBathymetricDeliveryRequest request, CancellationToken cancellationToken,
        [FromHeader(Name = "X-ICENC-Operator-Key")] string? operatorKey = null) {
        if (!HasOperatorKey(deliveryOptions.CurrentValue.OperatorKey, operatorKey))
            return Forbid();
        if (!BathymetricSurfaceService.IsDatasetName(datasetName) || request.ReceivedByIcEnc is not bool received)
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "A dataset name and confirmed receipt result are required.");

        var name = catalogue.ResolveDataset(datasetName)?.DatasetName ?? datasetName;
        var current = (await repository.GetCurrentAsync(name, BathymetricSurfaceService.Specification, cancellationToken)).SingleOrDefault();
        if (current is null || current.ExportId != exportId || current.DeliveryId != deliveryId
            || current.Status != ExternalProductExportStatus.DeliveryNeedsReview
            || current.DeliveryMode != SendToIcEncMode.Live
            || !await deliveryRepository.ReconcileAsync(deliveryId, received, User.Identity?.Name, clock.GetUtcNow().UtcDateTime, cancellationToken))
            return Problem(statusCode: StatusCodes.Status409Conflict, title: "The active bathymetric delivery is not eligible for reconciliation.");

        return Ok();
    }

    /// <summary>Checks the live delivery key against a fixed-length digest.</summary>
    /// <param name="configured">Key supplied by the bathymetric delivery configuration.</param>
    /// <param name="provided">Key supplied by the request header.</param>
    /// <returns>Whether the two non-empty keys match.</returns>
    private static bool HasOperatorKey(string? configured, string? provided) =>
        !string.IsNullOrWhiteSpace(configured) && !string.IsNullOrWhiteSpace(provided)
        && CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(configured)), SHA256.HashData(Encoding.UTF8.GetBytes(provided)));

    /// <summary>Reads a file only after checking the producer's filename and size against this endpoint's contract.</summary>
    /// <param name="file">File supplied by the multipart binder.</param>
    /// <param name="extension">Required filename extension.</param>
    /// <param name="limit">Maximum allowed size in bytes.</param>
    /// <param name="token">Cancels the file read.</param>
    /// <returns>File bytes or null when the optional part is missing.</returns>
    /// <exception cref="InvalidDataException">The supplied file is empty, oversized or has the wrong extension.</exception>
    private static async Task<byte[]?> ReadFileAsync(IFormFile? file, string extension, int limit, CancellationToken token) {
        if (file is null)
            return null;
        if (file.Length <= 0 || file.Length > limit || !file.FileName.EndsWith(extension, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException($"Expected a non-empty {extension} file no larger than {limit} bytes.");

        var content = new byte[(int)file.Length];
        using var stream = file.OpenReadStream();
        await stream.ReadExactlyAsync(content, token);
        return content;
    }
}
