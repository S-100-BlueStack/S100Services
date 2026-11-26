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
[Route("v{version:apiVersion}/packages/binding-comments/availability")]
[Produces("application/json")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class BindingCommentAvailabilityController(PipelineAssignmentService assignments) : ControllerBase
{
    /// <summary>Checks retained binding-comment presence for a bounded set of Package–Pipeline bindings.</summary>
    [HttpPost]
    [Consumes("application/json")]
    // Two 200-code-unit identifiers per pair can each use six JSON bytes per code unit.
    [RequestSizeLimit(512 * 1024)]
    [ProducesResponseType<BindingCommentAvailabilityResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status413PayloadTooLarge)]
    public ActionResult<BindingCommentAvailabilityResponse> Read(
        [FromBody] BindingCommentAvailabilityRequest request, CancellationToken cancellationToken) {
        try { return this.Ok(assignments.GetCommentAvailability(request.Bindings, cancellationToken)); }
        catch (InvalidDataException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status400BadRequest); }
    }
}
