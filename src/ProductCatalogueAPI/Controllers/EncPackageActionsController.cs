using Hangfire;
using Hangfire.Storage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Operations;

namespace ProductCatalogueAPI.Controllers;

/// <summary>Development-only live package Pause/Resume/Discard. Never exposes Send/Accept.</summary>
[AllowAnonymous]
[ApiController]
[Route("electronicproducts/packages")]
public sealed class EncPackageActionsController(IEncPackageActionService actions) : ControllerBase
{
    [HttpGet("{sourceName}/actions")]
    public async Task<IActionResult> GetActions(string sourceName, CancellationToken cancellationToken) {
        if (!actions.Enabled) return StatusCode(503, new { code = "PACKAGE_ACTIONS_DISABLED", message = "ENC package actions are disabled." });
        var snapshot = await actions.ReadAsync(sourceName, cancellationToken);
        return snapshot is null ? NotFound(new { code = "PACKAGE_NOT_FOUND", message = "No current ENC package is available." }) : Ok(snapshot);
    }

    [HttpPost("{sourceName}/pause")]
    public Task<IActionResult> Pause(string sourceName, [FromBody] EncPackagePauseRequest request, CancellationToken cancellationToken) =>
        SetPause(sourceName, request, true, cancellationToken);

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
