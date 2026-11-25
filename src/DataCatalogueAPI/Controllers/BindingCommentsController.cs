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
[Route("v{version:apiVersion}/packages/{id}/binding-comments")]
[Produces("application/json")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class BindingCommentsController(PipelineAssignmentService assignments) : ControllerBase
{
    /// <summary>Reads a newest-first page of committed comments for the selected Package.</summary>
    [HttpGet]
    [ProducesResponseType<BindingCommentPageResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public ActionResult<BindingCommentPageResponse> Get(
        string id, CancellationToken cancellationToken, [FromQuery] Guid? before = null,
        [FromQuery, Range(1, PipelineAssignmentService.MaximumCommentPageSize)] int pageSize = PipelineAssignmentService.DefaultCommentPageSize) {
        try { return this.Ok(assignments.ListComments(id, before, pageSize, cancellationToken)); }
        catch (InvalidDataException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status400BadRequest); }
        catch (KeyNotFoundException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status404NotFound); }
    }

    /// <summary>Commits a comment on an existing active binding or acknowledges a matching retry.</summary>
    [HttpPost]
    [Consumes("application/json")]
    [RequestSizeLimit(32 * 1024)]
    [ProducesResponseType<BindingCommentResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status413PayloadTooLarge)]
    public async Task<ActionResult<BindingCommentResponse>> Add(
        string id, [FromBody] AddBindingCommentRequest request, CancellationToken cancellationToken) {
        var actor = PackageHistoryActor.FromPrincipal(this.User);
        if (actor is null) { return this.Forbid(); }

        try {
            var comment = await assignments.AddCommentAsync(id, request.PipelineId, request.OperationId, request.Text, actor, cancellationToken);
            return this.Ok(comment);
        }
        catch (InvalidDataException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status400BadRequest); }
        catch (KeyNotFoundException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status404NotFound); }
        catch (PipelineAssignmentConflictException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status409Conflict); }
    }
}
