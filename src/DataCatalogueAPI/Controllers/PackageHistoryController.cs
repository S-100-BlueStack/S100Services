using Asp.Versioning;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;

namespace DataCatalague.Api.Controllers;

[Authorize(Policy = "datacatalogue:access")]
[ApiController]
[ApiVersion(ApiVersions.V1Text)]
[Route("v{version:apiVersion}/packages/{id}/history")]
[Produces("application/json")]
public sealed class PackageHistoryController(PackageHistoryService history) : ControllerBase
{
    /// <summary>Reads recorded package events and historical pipeline assignments, newest first.</summary>
    /// <param name="id">Canonical package identifier (not its display Short ID).</param>
    /// <param name="cancellationToken">Cancels the read.</param>
    /// <param name="before">Optional event identifier from the previous page's nextBefore.</param>
    /// <param name="pageSize">Maximum events to return, from 1 to 100.</param>
    /// <remarks>Events are read from the current in-memory event store. Actors are taken from committed events. Older events without an actor remain unattributed.</remarks>
    [HttpGet]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    [ProducesResponseType<PackageHistoryResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<PackageHistoryResponse>> Get(string id, CancellationToken cancellationToken, [FromQuery] Guid? before = null, [FromQuery, Range(1, PackageHistoryService.MaximumPageSize)] int pageSize = PackageHistoryService.DefaultPageSize) {
        if (string.IsNullOrWhiteSpace(id)) {
            this.ModelState.AddModelError(nameof(id), "A package identifier is required.");
            return this.ValidationProblem(this.ModelState);
        }
        try {
            var result = await history.GetAsync(id, before, pageSize, cancellationToken);
            if (result is null) { return this.Problem(title: "Package not found.", statusCode: StatusCodes.Status404NotFound); }
            return this.Ok(result);
        }
        catch (InvalidDataException exception) {
            this.ModelState.AddModelError(nameof(before), exception.Message);
            return this.ValidationProblem(this.ModelState);
        }
    }

    /// <summary>Resolves the current directory profile of the recorded actor of one history event.</summary>
    /// <param name="id">Canonical package identifier.</param>
    /// <param name="eventId">Recorded history event identifier.</param>
    /// <param name="profiles">The optional directory enrichment service.</param>
    /// <param name="cancellationToken">Cancels the reader's wait.</param>
    /// <remarks>Best-effort enrichment only. The recorded actor remains authoritative. No caller-supplied directory identity is accepted.</remarks>
    [HttpGet("{eventId:guid}/profile")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    [ProducesResponseType<ActorProfileResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ActorProfileResponse>> GetProfile(string id, Guid eventId, [FromServices] ActorProfileService profiles, CancellationToken cancellationToken) {
        var entry = string.IsNullOrWhiteSpace(id) ? null : history.FindEvent(id, eventId, cancellationToken);
        if (entry is null) { return this.Problem(title: "Package history event not found.", statusCode: StatusCodes.Status404NotFound); }
        var profile = await profiles.GetAsync(entry.Actor, cancellationToken);
        if (profile is null) { return this.NoContent(); }
        return this.Ok(profile);
    }
}
