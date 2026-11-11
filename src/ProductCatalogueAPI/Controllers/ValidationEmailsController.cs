using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Services.ValidationEmail;
using System.Security.Cryptography;
using System.Text;
using static ProductCatalogueAPI.Models.ResponseTypes;

namespace ProductCatalogueAPI.Controllers;

/// <summary>Operator audit, offline replay and exact transmission association for inbound IC-ENC notices.</summary>
[ApiController]
[Authorize("productmanager:distribute")]
[Route("upload/validation-emails")]
[Route("upload/icenc-emails")]
public sealed class ValidationEmailsController(ValidationEmailRepository repository, ValidationEmailService service, IOptionsMonitor<SendToIcEncOptions> deliveryOptions, IValidationEmailSimulationService simulations, IOptions<ValidationEmailOptions> emailOptions) : ControllerBase
{
    /// <summary>Lists the latest 100 results, optionally for one delivery or processing status.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ValidationEmailRepository.InboundRow>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] Guid? deliveryId, [FromQuery] bool? isSimulation, CancellationToken cancellationToken) {
        if (status is not null && status is not ("Pending" or "Review" or "Applied" or "Recorded" or "DryRun" or "Dismissed")) return BadRequest("Unknown inbound processing status.");
        var rows = await repository.ListAsync(status, deliveryId, isSimulation, cancellationToken);
        return Ok(new ApiResponse<IReadOnlyList<ValidationEmailRepository.InboundRow>> { Data = rows, TotalHits = rows.Count });
    }

    /// <summary>Inspects original metadata, bodies and report bytes; restricted to distribution operators.</summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(ApiResponse<ValidationEmailMessage>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken) {
        var message = await repository.GetMessageAsync(id, cancellationToken);
        return message is null ? NotFound() : Ok(new ApiResponse<ValidationEmailMessage> { Data = message });
    }

    /// <summary>Associates a reviewed message with an exact transmission and reprocesses it. DryRun remains authoritative.</summary>
    /// <remarks>Requires the same operator key as the existing manual acknowledgement endpoint. Parsing contradictions cannot be overridden here.</remarks>
    [HttpPost("{id:guid}/review")]
    [ProducesResponseType(typeof(ApiResponse<ValidationEmailProcessingResult>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Review(Guid id, [FromBody] ValidationEmailReview review, [FromHeader(Name = "X-ICENC-Operator-Key")] string? operatorKey, CancellationToken cancellationToken) {
        var key = deliveryOptions.CurrentValue.OperatorKey;
        if (string.IsNullOrEmpty(key) || string.IsNullOrEmpty(operatorKey) || !CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(key)), SHA256.HashData(Encoding.UTF8.GetBytes(operatorKey)))) return StatusCode(StatusCodes.Status403Forbidden);
        try {
            var result = await service.ReviewAsync(id, review, User.Identity?.Name ?? "Unknown operator", cancellationToken);
            return result is null ? NotFound() : Ok(new ApiResponse<ValidationEmailProcessingResult> { Data = result });
        }
        catch (ArgumentException exception) { return BadRequest(exception.Message); }
    }

    /// <summary>Parses and matches normalized offline messages. Never applies decisions, regardless of supplied trust flags.</summary>
    [HttpPost("replay")]
    [RequestSizeLimit(24 * 1024 * 1024)]
    [ProducesResponseType(typeof(ApiResponse<ValidationEmailProcessingResult>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Replay([FromBody] ValidationEmailMessage message, CancellationToken cancellationToken) {
        if (message is null || string.IsNullOrWhiteSpace(message.Id) || message.Id.Length > 1024 || message.Subject is null || message.Body is null || message.Attachments is null ||
            message.Attachments.Any(a => a is null || a.Name is null || a.Content is null) || message.Attachments.Sum(a => (long)a.Content.Length) > 16 * 1024 * 1024)
            return BadRequest("A bounded normalized message is required.");
        return Ok(new ApiResponse<ValidationEmailProcessingResult> { Data = await service.ReplayAsync(message, cancellationToken) });
    }

    /// <summary>Generates a random sample-shaped response for the current candidate; valid only in Simulation mode.</summary>
    /// <remarks>Repeat the same RequestId to inspect the same generated outcome. A new RequestId explicitly creates a new simulation.</remarks>
    [HttpPost("simulate")]
    [ProducesResponseType(typeof(ApiResponse<ValidationEmailSimulationRecord>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Simulate([FromBody] ValidationEmailSimulationRequest request, CancellationToken cancellationToken) {
        if (emailOptions.Value.Mode != ValidationEmailMode.Simulation) return StatusCode(StatusCodes.Status503ServiceUnavailable, "ValidationEmail:Mode must be Simulation.");
        if (request.RequestId == Guid.Empty || string.IsNullOrWhiteSpace(request.DatasetName) || request.DatasetName.Length > 64 ||
            request.ProductSpecification is not null && request.ProductSpecification is not ("S57" or "S101")) return BadRequest("Specify a RequestId, candidate dataset name and optional S57/S101 format.");
        try {
            var simulation = await simulations.GenerateAsync(request.DatasetName.Trim(), request.ProductSpecification, null, null, "manual:" + request.RequestId.ToString("N"), cancellationToken);
            return simulation is null ? Conflict("No unique current ENC candidate with a stored exchange set matches this request.") : Ok(new ApiResponse<ValidationEmailSimulationRecord> { Data = simulation });
        }
        catch (ArgumentException exception) { return BadRequest(exception.Message); }
    }
}

/// <summary>Explicit idempotent request to preview a generated response for an actual candidate.</summary>
/// <param name="RequestId">Caller-generated idempotency GUID; reuse it to retain the same random outcome.</param>
/// <param name="DatasetName">Exact current candidate dataset name.</param>
/// <param name="ProductSpecification">Optional S57/S101 filter for disambiguation.</param>
public sealed record ValidationEmailSimulationRequest(Guid RequestId, string DatasetName, string? ProductSpecification = null);
