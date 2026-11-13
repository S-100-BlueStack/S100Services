using Hangfire;
using Hangfire.Storage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Operations;

namespace ProductCatalogueAPI.Controllers;

/// <summary>Feature-flagged package actions, including server-configured simulated delivery.</summary>
[Authorize]
[ApiController]
[Route("electronicproducts/packages")]
public sealed class EncPackageActionsController(IEncPackageActionService actions) : ControllerBase
{
    [Authorize("productmanager:access")]
    [HttpGet("{sourceName}/actions")]
    public async Task<IActionResult> GetActions(string sourceName, CancellationToken cancellationToken) {
        if (!actions.Enabled) return StatusCode(503, new { code = "PACKAGE_ACTIONS_DISABLED", message = "ENC package actions are disabled." });
        var snapshot = await actions.ReadAsync(sourceName, cancellationToken);
        // Absence and missing control state share the legacy null read result.
        // Do not infer package absence or grant authorization from this endpoint.
        // The independent AOI/status projection explicitly reports package presence.
        return snapshot is null ? Ok(new { actionsAvailable = false }) : Ok(snapshot);
    }

    [Authorize("productmanager:manage")]
    [HttpPost("{sourceName}/pause")]
    public Task<IActionResult> Pause(string sourceName, [FromBody] EncPackagePauseRequest request, CancellationToken cancellationToken) =>
        SetPause(sourceName, request, true, cancellationToken);

    [Authorize("productmanager:manage")]
    [HttpPost("{sourceName}/resume")]
    public Task<IActionResult> Resume(string sourceName, [FromBody] EncPackagePauseRequest request, CancellationToken cancellationToken) =>
        SetPause(sourceName, request, false, cancellationToken);

    private async Task<IActionResult> SetPause(string sourceName, EncPackagePauseRequest request, bool paused, CancellationToken cancellationToken) {
        if (!actions.Enabled) return StatusCode(503, new { code = "PACKAGE_ACTIONS_DISABLED", message = "ENC package actions are disabled." });
        if (request is null || request.PackageId == Guid.Empty || !TryDecodeVersion(request.ExpectedControlVersion, out var token))
            return BadRequest(new { code = "PACKAGE_ACTION_INVALID", message = "A current package and control version are required." });
        var result = await actions.SetPausedAsync(sourceName, request.PackageId, token, paused, cancellationToken);
        return result.Status switch {
            EncPackagePauseWriteStatus.Changed or EncPackagePauseWriteStatus.Unchanged => Ok(new {
                packageId = result.State!.PackageId, paused = result.State.IsPaused,
                controlVersion = result.State.RowVersion is null ? null : Convert.ToBase64String(result.State.RowVersion)
            }),
            EncPackagePauseWriteStatus.SnapshotNotFound => Conflict(new { code = "PACKAGE_REPLACED", message = "The package was replaced. Refresh before retrying." }),
            EncPackagePauseWriteStatus.VersionConflict => Conflict(new { code = "PACKAGE_VERSION_CONFLICT", message = "The Pause state changed. Refresh before retrying." }),
            _ => Conflict(new { code = "PACKAGE_ACTION_UNAVAILABLE", message = "The package is not eligible for this action." })
        };
    }

    /// <summary>Queues current ready members for simulated delivery and generated response processing.</summary>
    /// <param name="sourceName">S-101 package identity.</param>
    /// <param name="request">Exact active package expected by the caller.</param>
    /// <param name="cancellationToken">Cancels eligibility reads before enqueueing.</param>
    /// <returns>A durable job identifier, or an eligibility conflict.</returns>
    [Authorize("productmanager:distribute")]
    [HttpPost("{sourceName}/send")]
    [ProducesResponseType(StatusCodes.Status202Accepted)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Send(string sourceName, [FromBody] EncPackageSendRequest request, CancellationToken cancellationToken) {
        if (!actions.Enabled) return StatusCode(503, new { code = "PACKAGE_ACTIONS_DISABLED", message = "ENC package actions are disabled." });
        if (request is null || request.PackageId == Guid.Empty) return BadRequest(new { code = "PACKAGE_ACTION_INVALID", message = "A current package is required." });
        var jobId = await actions.QueueSendAsync(sourceName, request.PackageId, cancellationToken);
        return jobId is null ? Conflict(new { code = "PACKAGE_SEND_UNAVAILABLE", message = "Both exports must be Ready without errors, the package must be resumed, and both simulation modes must be enabled." }) : Accepted(new { jobId, packageId = request.PackageId });
    }

    /// <summary>Reads only the aggregate simulated-send job type; no unrelated Hangfire job is exposed.</summary>
    /// <param name="jobId">Durable aggregate send job identifier.</param>
    /// <returns>The bounded send status or 404 for another job type.</returns>
    [Authorize("productmanager:access")]
    [HttpGet("send-jobs/{jobId}")]
    public IActionResult GetSendJob(string jobId) {
        if (string.IsNullOrWhiteSpace(jobId)) return NotFound();
        using var connection = JobStorage.Current.GetConnection();
        var job = connection.GetJobData(jobId);
        if (job?.Job?.Type != typeof(SendEncPackageJob)) return NotFound();
        var state = connection.GetStateData(jobId)?.Name;
        return Ok(new { status = state switch { "Succeeded" => "Succeeded", "Failed" => "Failed", "Deleted" => "Cancelled", _ => "Running" } });
    }

    /// <summary>Acknowledges a failed ENC package and retires both candidates to Idle without publishing either one.</summary>
    /// <param name="sourceName">S-101 source identity returned by GetActions.</param>
    /// <param name="request">Exact failed package expected by the operator.</param>
    /// <param name="cancellationToken">Cancels persistence before the paired transaction commits.</param>
    /// <returns>The stable acknowledgement cutoff, or a conflict if the package is no longer eligible.</returns>
    [Authorize("productmanager:manage")]
    [HttpPost("{sourceName}/acknowledge")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Acknowledge(string sourceName, [FromBody] EncPackageAcknowledgeRequest request, CancellationToken cancellationToken) {
        if (!actions.Enabled) return StatusCode(503, new { code = "PACKAGE_ACTIONS_DISABLED", message = "ENC package actions are disabled." });
        if (request is null || request.PackageId == Guid.Empty || string.IsNullOrWhiteSpace(sourceName) || sourceName.Length > 64)
            return BadRequest(new { code = "PACKAGE_ACTION_INVALID", message = "An exact source and failed package are required." });
        var result = await actions.AcknowledgeFailureAsync(sourceName, request.PackageId, User.Identity?.Name ?? "Authenticated operator", cancellationToken);
        return result.Status == EncPackageFailureAcknowledgementStatus.Conflict
            ? Conflict(new { code = "PACKAGE_ACKNOWLEDGE_UNAVAILABLE", message = "The package changed, has no acknowledgeable failure, is held, is building or is completing successful publication. Refresh before retrying." })
            : Ok(new { packageId = request.PackageId, sourceDatasetName = sourceName.Trim().ToUpperInvariant(), status = ProductCatalogueAPI.Models.EncPackageStatus.Idle,
                acknowledgedAtUtc = result.AcknowledgedAtUtc, alreadyAcknowledged = result.Status == EncPackageFailureAcknowledgementStatus.AlreadyAcknowledged });
    }

    [Authorize("productmanager:manage")]
    [HttpPost("{sourceName}/discard")]
    public async Task<IActionResult> Discard(string sourceName, [FromBody] EncPackageDiscardRequest request, CancellationToken cancellationToken) {
        if (!actions.Enabled) return StatusCode(503, new { code = "PACKAGE_ACTIONS_DISABLED", message = "ENC package actions are disabled." });
        if (request is null || request.PackageId == Guid.Empty)
            return BadRequest(new { code = "PACKAGE_ACTION_INVALID", message = "A current package is required." });
        var jobId = await actions.QueueDiscardAsync(sourceName, request.PackageId, cancellationToken);
        return jobId is null
            ? Conflict(new { code = "PACKAGE_ACTION_UNAVAILABLE", message = "This package cannot be discarded." })
            : Accepted(new { jobId, packageId = request.PackageId });
    }

    [Authorize("productmanager:access")]
    [HttpGet("discard-jobs/{jobId}")]
    public IActionResult GetDiscardJob(string jobId) {
        if (!actions.Enabled) return StatusCode(503, new { code = "PACKAGE_ACTIONS_DISABLED", message = "ENC package actions are disabled." });
        if (string.IsNullOrWhiteSpace(jobId)) return NotFound();
        using var connection = JobStorage.Current.GetConnection();
        var job = connection.GetJobData(jobId);
        if (job?.Job?.Type != typeof(DiscardEncPackageJob)) return NotFound();
        var state = connection.GetStateData(jobId)?.Name;
        return state switch {
            "Succeeded" => Ok(new { status = "Succeeded" }),
            "Failed" => Ok(new { status = "Failed" }),
            "Deleted" => Ok(new { status = "Cancelled" }),
            "Enqueued" or "Processing" or "Scheduled" or "Awaiting" => Ok(new { status = "Running" }),
            _ => Ok(new { status = "Running" })
        };
    }

    private static bool TryDecodeVersion(string? token, out byte[]? version) {
        version = null;
        if (token is null) return true; // No control row was persisted yet.
        try {
            var bytes = Convert.FromBase64String(token);
            if (bytes.Length != 8) return false;
            version = bytes;
            return true;
        }
        catch (FormatException) { return false; }
    }
}

public sealed record EncPackagePauseRequest(Guid PackageId, string? ExpectedControlVersion);
public sealed record EncPackageDiscardRequest(Guid PackageId);

/// <summary>Targets the exact active shared snapshot for simulated delivery.</summary>
/// <param name="PackageId">Package identity returned by the authoritative action snapshot.</param>
public sealed record EncPackageSendRequest(Guid PackageId);

/// <summary>Targets an exact failed package; this is not an external provider acceptance notice.</summary>
/// <param name="PackageId">Failed snapshot identity returned by the authoritative action endpoint.</param>
public sealed record EncPackageAcknowledgeRequest(Guid PackageId);
