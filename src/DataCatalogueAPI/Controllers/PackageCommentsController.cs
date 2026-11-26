using System.ComponentModel.DataAnnotations;
using Asp.Versioning;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DataCatalague.Api.Controllers;

[Authorize(Policy = "datacatalogue:access")]
[ApiController]
[ApiVersion(ApiVersions.V1Text)]
[Route("v{version:apiVersion}/packages/{id}")]
[Produces("application/json")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class PackageCommentsController(PackageCommentService comments) : ControllerBase
{
    [HttpGet("comments")]
    public ActionResult<PackageCommentPageResponse> Get(string id, CancellationToken token,
        [FromQuery] Guid? before = null, [FromQuery, Range(1, 100)] int pageSize = 50) {
        try { return this.Ok(comments.List(id, before, pageSize, token)); }
        catch (InvalidDataException exception) { return this.Problem(title: exception.Message, statusCode: 400); }
        catch (KeyNotFoundException exception) { return this.Problem(title: exception.Message, statusCode: 404); }
    }

    [HttpPut("discarded")]
    [RequestSizeLimit(32 * 1024)]
    public Task<ActionResult<PackageOperationResponse>> Decide(string id, PackageDiscardRequest request, CancellationToken token)
        => request.Discarded is { } discarded
            ? this.Save(id, request.OperationId, request.Reason, discarded, token)
            : Task.FromResult<ActionResult<PackageOperationResponse>>(this.Problem(title: "Supply the discarded decision.", statusCode: 400));

    private async Task<ActionResult<PackageOperationResponse>> Save(string id, Guid operationId, string? text, bool discarded, CancellationToken token) {
        if (PackageHistoryActor.FromPrincipal(this.User) is not { } actor) { return this.Forbid(); }
        try { return this.Ok(await comments.Save(id, operationId, text, actor, discarded, token)); }
        catch (InvalidDataException exception) { return this.Problem(title: exception.Message, statusCode: 400); }
        catch (KeyNotFoundException exception) { return this.Problem(title: exception.Message, statusCode: 404); }
        catch (PipelineAssignmentConflictException exception) { return this.Problem(title: exception.Message, statusCode: 409); }
    }
}
