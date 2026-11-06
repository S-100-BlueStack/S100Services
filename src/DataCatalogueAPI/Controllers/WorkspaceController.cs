using Asp.Versioning;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Models;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Repositories;
using DataCatalague.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;

namespace DataCatalague.Api.Controllers;

[Authorize(Policy = "datacatalogue:access")]
[ApiController]
[ApiVersion(ApiVersions.V1Text)]
[Route("api/v{version:apiVersion}/workspaces")]
[Produces("application/json")]
public sealed class WorkspaceController(WorkspaceQueryService queries) : ControllerBase
{
    /// <summary>Lists workspaces, optionally filtered by pipeline and ownership.</summary>
    /// <param name="pipelineId">Optional pipeline ID; omitted includes all pipelines.</param>
    /// <param name="owner">Normalized username, or current for the signed-in user.</param>
    /// <param name="unassigned">True for unowned workspaces; false for owned; omit for both. Cannot combine true with owner.</param>
    /// <param name="page">One-based page number.</param>
    /// <param name="pageSize">Results per page, from 1 to 200.</param>
    /// <param name="cancellationToken">Cancels the listing.</param>
    [HttpGet]
    [ProducesResponseType<PagedResponse<WorkspaceListResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PagedResponse<WorkspaceListResponse>>> GetWorkspaces(CancellationToken cancellationToken, [FromQuery] string? pipelineId = null, [FromQuery] string? owner = null, [FromQuery] bool? unassigned = null, [FromQuery, Range(1, int.MaxValue)] int page = 1, [FromQuery, Range(1, PackageRepository.MaximumPageSize)] int pageSize = 20) {
        try {
            var username = this.User?.Identity?.IsAuthenticated == true ? this.User.Identity.Name : null;
            return this.Ok(await queries.ListAsync(pipelineId, owner, unassigned, username, page, pageSize, cancellationToken));
        }
        catch (InvalidDataException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status400BadRequest); }
        catch (UnauthorizedAccessException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status401Unauthorized); }
        catch (KeyNotFoundException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status404NotFound); }
    }
}
