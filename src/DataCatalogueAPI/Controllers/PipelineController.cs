using Asp.Versioning;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Models.V2;
using DataCatalague.Api.Repositories;
using DataCatalague.Api.Services;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;

namespace DataCatalague.Api.Controllers
{
    namespace DataCatalague.Api.Controllers
    {
        [ApiController]
        [ApiVersion(ApiVersions.V1Text)]
        [Route("api/v{version:apiVersion}/pipeline")]
        [Produces("application/json")]
        public sealed class PipelineController(IPipelineRepository repository, ILogger<PipelineController> logger) : ControllerBase
        {
            private const int DefaultPageSize = 20;

            private readonly IPipelineRepository repository = repository;
            private readonly ILogger<PipelineController> logger = logger;


            [HttpGet]
            [ProducesResponseType<PagedResponse<PipelineResponse>>(StatusCodes.Status200OK)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
            public async Task<ActionResult<PagedResponse<PipelineResponse>>> GetPage(
                    [FromQuery][Range(1, int.MaxValue)] int page = 1,
                    [FromQuery][Range(1, 100)] int pageSize = DefaultPageSize,
                    CancellationToken cancellationToken = default) {
                this.logger.LogInformation(
                    "Listing workspace page {Page} with page size {PageSize}.", page, pageSize);

                var totalCount = 0;

                return this.Ok(new PagedResponse<PipelineResponse> {
                    Items = [],
                    Page = page,
                    PageSize = pageSize,
                    TotalCount = totalCount,
                });
            }
        }
    }

}
