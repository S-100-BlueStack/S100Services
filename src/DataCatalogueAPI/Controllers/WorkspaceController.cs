using Asp.Versioning;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Models.V2;
using DataCatalague.Api.Services;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;

namespace DataCatalague.Api.Controllers
{
    namespace DataCatalague.Api.Controllers
    {
        [ApiController]
        [ApiVersion(ApiVersions.V1Text)]
        [Route("api/v{version:apiVersion}/workspace")]
        [Produces("application/json")]
        public sealed class WorkspaceController(/*IWorkspaceRepository repository, */ILogger<WorkspaceController> logger) : ControllerBase
        {
            private const int DefaultPageSize = 20;

            //private readonly IWorkspaceRepository repository = repository;
            private readonly ILogger<WorkspaceController> logger = logger;


            [HttpGet]
            [ProducesResponseType<PagedResponse<WorkspaceResponse>>(StatusCodes.Status200OK)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
            public async Task<ActionResult<PagedResponse<WorkspaceResponse>>> GetPage(
                    [FromQuery][Range(1, int.MaxValue)] int page = 1,
                    [FromQuery][Range(1, 100)] int pageSize = DefaultPageSize,
                    CancellationToken cancellationToken = default) {
                this.logger.LogInformation(
                    "Listing workspace page {Page} with page size {PageSize}.", page, pageSize);

                var totalCount = 0;

                return this.Ok(new PagedResponse<WorkspaceResponse> {
                    Items = [],
                    Page = page,
                    PageSize = pageSize,
                    TotalCount = totalCount,
                });
            }
        }
    }

}
