using Asp.Versioning;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Repositories;
using Eventuous;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using NanoidDotNet;
using static NanoidDotNet.Nanoid;

namespace DataCatalague.Api.Controllers.V1
{
    namespace DataCatalague.Api.Controllers
    {
        [ApiController]
        [ApiVersion(ApiVersions.V1Text)]
        [Route("api/v{version:apiVersion}/pipelines")]
        [Produces("application/json")]
        public sealed class PipelineController(
                IEventStore eventstore, 
                ICommandService<PipelineState> servicePipeline,
                DispatchRepository dispatchRepository,
                IOptions<DispatcherOptions> options,
                ArcGisDispatcher dispatcher,
                ILogger<PipelineController> logger) : ControllerBase
        {
            private const int DefaultPageSize = 20;

            readonly StreamNameMap _streamNameMap = new();

            private readonly IEventStore _eventStore = eventstore;

            private readonly ICommandService<PipelineState> _servicePipeline = servicePipeline;

            private readonly DispatchRepository _dispatchRepository = dispatchRepository;

            private readonly IOptions<DispatcherOptions> _options = options;

            private readonly ArcGisDispatcher _dispatcher = dispatcher;

            private readonly ILogger<PipelineController> _logger = logger;

            [HttpPost]
            [Consumes("application/json")]
            [ProducesResponseType<PipelineResponse>(StatusCodes.Status201Created)]
            [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
            public async Task<ActionResult<PipelineResponse>> Create([FromBody] CreatePipelineRequest request, CancellationToken cancellationToken) {
                ArgumentNullException.ThrowIfNull(request);                
                ArgumentNullException.ThrowIfNullOrWhiteSpace(request.DisplayName);
                ArgumentNullException.ThrowIfNullOrWhiteSpace(request.Description);

                var displayName = request.DisplayName?.Trim();
                ArgumentNullException.ThrowIfNullOrWhiteSpace(displayName);

                var description = request.Description?.Trim();
                ArgumentNullException.ThrowIfNullOrWhiteSpace(description);

                var cmd = await this._servicePipeline.Handle(new PipelineCommands.Create(CreateStreamId(), displayName, description), cancellationToken);

                if (!cmd.Success)
                    return this.BadRequest();

                var result = cmd.Get()!;

                this._logger.LogInformation("Created pipeline {id}.", result.State.Id);

                var route = this.CreatedAtRoute(
                    "GetPipeline.V1",
                    new { id = result.State.Id, version = ApiVersions.V1Text },
                    Map(result.State));

                return route;
            }


            [HttpGet("{id}", Name = "GetPipeline.V1")]
            [ProducesResponseType<PipelineResponse>(StatusCodes.Status200OK)]
            [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
            public async Task<ActionResult<PipelineResponse>> GetPipeline(string id, CancellationToken cancellationToken) {
                ArgumentNullException.ThrowIfNullOrEmpty(id);

                try {
                    var pipeline = await this._eventStore.LoadState<PipelineState, PipelineId>(this._streamNameMap, new(id), cancellationToken: cancellationToken);

                    return this.Ok(Map(pipeline.State));
                }
                catch {
                    this._logger.LogInformation("Pipeline {id} was not found.", id);

                    return this.Problem(
                        title: "Pipeline not found.",
                        detail: $"No pipeline exists with identifier {id}.",
                        statusCode: StatusCodes.Status404NotFound);
                }
            }


            [HttpPost("{id}/workspaces")]
            [ProducesResponseType<PipelineResponse>(StatusCodes.Status200OK)]
            [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
            public async Task<ActionResult<PipelineResponse>> AddWorkspace(string id, [FromBody] AddWorkspaceRequest request, CancellationToken cancellationToken) {
                ArgumentNullException.ThrowIfNull(request);
                ArgumentNullException.ThrowIfNullOrWhiteSpace(request.GeoJSON);
                ArgumentNullException.ThrowIfNullOrWhiteSpace(request.DisplayName);

                var displayName = request.DisplayName?.Trim();
                ArgumentNullException.ThrowIfNullOrWhiteSpace(displayName);

                var pipeline = await this._eventStore.LoadState<PipelineState>(new(id), true, cancellationToken);

                var geometryRef = await this._dispatcher.ExecuteAsync(() => {
                    var polygon = this._dispatchRepository.FromGeoJson(request.GeoJSON);

                    return this._dispatchRepository.AddWorkspaceAOI(polygon, id, displayName);
                });

                var cmd = await this._servicePipeline.Handle(new PipelineCommands.CreateWorkspace(pipeline.State.Id, displayName, geometryRef), cancellationToken);

                if (!cmd.Success)
                    return this.BadRequest();

                var result = cmd.Get()!;

                this._logger.LogInformation("Created workspace {id}.", displayName);

                var route = this.CreatedAtRoute(
                    "GetPipeline.V1",
                    new { id = result.State.Id, version = ApiVersions.V1Text },
                    Map(result.State));

                return route;
            }

            [HttpPost("{id}/workspaces/{workspace}")]
            [ProducesResponseType<PipelineResponse>(StatusCodes.Status200OK)]
            [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
            public async Task<ActionResult<PipelineResponse>> LockWorkspace(string id, string workspace, CancellationToken cancellationToken) {
                throw new NotImplementedException();
            }


            private static PipelineResponse Map(Domain.PipelineState state) => new() {
                Id = state.Id,
                DisplayName = state.DisplayName,
                Description = state.Description,
                LastUpdatedUtc = state.LastUpdatedUtc,
            };

            private const string _alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

            private static string CreateStreamId() => Nanoid.Generate(_alphabet, 18);
        }
    }

}
