using Asp.Versioning;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Models.V1;
using Eventuous;
using Microsoft.AspNetCore.Mvc;

namespace DataCatalague.Api.Controllers.V1
{
    namespace DataCatalague.Api.Controllers
    {
        [ApiController]
        [ApiVersion(ApiVersions.V1Text)]
        [Route("api/v{version:apiVersion}/pipelines")]
        [Produces("application/json")]
        public sealed class PipelineController(IEventStore eventstore, ICommandService<PipelineState> service, ILogger<PipelineController> logger) : ControllerBase
        {
            private const int DefaultPageSize = 20;

            readonly StreamNameMap _streamNameMap = new();

            private readonly IEventStore _eventStore = eventstore;

            private readonly ICommandService<PipelineState> _service = service;

            private readonly ILogger<PipelineController> _logger = logger;

            //[HttpGet]
            //[ProducesResponseType<PagedResponse<PipelineResponse>>(StatusCodes.Status200OK)]
            //[ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
            //public async Task<ActionResult<PagedResponse<PipelineResponse>>> GetPipelines([FromQuery][Range(1, int.MaxValue)] int page = 1, [FromQuery][Range(1, 100)] int pageSize = DefaultPageSize, CancellationToken cancellationToken = default) {
            //    this.logger.LogInformation(
            //        "Listing pipelines page {Page} with page size {PageSize}.", page, pageSize);

            //    var (items, totalCount) = await this.repository.GetPipelinesAsync((page - 1) * pageSize, pageSize, cancellationToken).ConfigureAwait(false);

            //    return this.Ok(new PagedResponse<PipelineResponse> {
            //        Items = items.Select(Map).ToList(),
            //        Page = page,
            //        PageSize = pageSize,
            //        TotalCount = totalCount,
            //    });
            //}

            [HttpGet("{uuid:guid}", Name = "GetPipelineV1")]
            [ProducesResponseType<PipelineResponse>(StatusCodes.Status200OK)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
            public async Task<ActionResult<PipelineResponse>> GetPipeline(Guid uuid, CancellationToken cancellationToken) {
                try {
                    var pipeline = await this._eventStore.LoadState<PipelineState, PipelineId>(_streamNameMap, uuid.ToPipelineId(), cancellationToken: cancellationToken);

                    return this.Ok(Map(pipeline.State));
                }
                catch {
                    this._logger.LogInformation("Pipeline {uuid} was not found.", uuid);

                    return this.Problem(
                        title: "Pipeline not found.",
                        detail: $"No pipeline exists with identifier {uuid}.",
                        statusCode: StatusCodes.Status404NotFound);
                }                            
            }

            [HttpPost]
            [Consumes("application/json")]
            [ProducesResponseType<PipelineResponse>(StatusCodes.Status201Created)]
            [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
            public async Task<ActionResult<PipelineResponse>> Create([FromBody] CreatePipelineRequest request, CancellationToken cancellationToken) {
                ArgumentNullException.ThrowIfNull(request);

                var displayName = request.DisplayName?.Trim();
                var description = request.Description?.Trim();

                if (string.IsNullOrEmpty(displayName)) {
                    throw new ArgumentNullException(nameof(request.DisplayName));
                }

                var cmd = await _service.Handle(new PipelineCommands.Create(Guid.NewGuid(), displayName, description), cancellationToken);

                if (!cmd.Success)
                    return this.BadRequest();
                
                var result = cmd.Get()!;

                this._logger.LogInformation("Created pipeline {uuid}.", result.State.Uuid);

                var route = this.CreatedAtRoute(
                    "GetPipelineV1",
                    new { uuid = result.State.Uuid, version = ApiVersions.V1Text },
                    Map(result.State));

                return route;
            }

            private static PipelineResponse Map(Domain.PipelineState pipeline) => new() {
                Uuid = pipeline.Uuid,
                DisplayName = pipeline.DisplayName,
                Description = pipeline.Description,
                LastUpdatedUtc = pipeline.LastUpdatedUtc,
            };
        }
    }

}
