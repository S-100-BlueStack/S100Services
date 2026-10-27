using Asp.Versioning;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Models;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Repositories;
using Eventuous;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using NanoidDotNet;
using DataCatalague.Api.Services;
using System.ComponentModel.DataAnnotations;

namespace DataCatalague.Api.Controllers.V1
{
    namespace DataCatalague.Api.Controllers
    {
        [Authorize(Policy = "datacatalogue:access")]
        [ApiController]
        [ApiVersion(ApiVersions.V1Text)]
        [Route("api/v{version:apiVersion}/pipelines")]
        [Produces("application/json")]
        public sealed class PipelineController(
                IEventStore eventstore,
                ICommandService<PipelineState> servicePipeline,
                DispatchRepository dispatchRepository,
                IPipelineRepository pipelineRepository,
                WorkspaceService workspaceService,
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

            /// <summary>Lists all pipelines in catalogue identifier order.</summary>
            /// <param name="cancellationToken">Cancels the pipeline listing.</param>
            /// <returns>All pipelines using the same response envelope as categories and packages.</returns>
            [HttpGet]
            [ProducesResponseType<PagedResponse<PipelineResponse>>(StatusCodes.Status200OK)]
            public async Task<ActionResult<PagedResponse<PipelineResponse>>> GetPipelines(CancellationToken cancellationToken) {
                var pipelines = await pipelineRepository.GetPipelinesAsync(cancellationToken);
                return this.Ok(new PagedResponse<PipelineResponse> {
                    Items = [.. pipelines.Select(Map)],
                    Page = 1,
                    PageSize = Math.Max(DefaultPageSize, pipelines.Count),
                    TotalCount = pipelines.Count,
                });
            }

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

                if (!await this._eventStore.StreamExists(this._streamNameMap.GetStreamName(new PipelineId(id)), cancellationToken)) {
                    return this.NotFound(new ProblemDetails { Title = "Pipeline not found.", Detail = $"No pipeline exists with identifier {id}." });
                }
                var pipeline = await this._eventStore.LoadState<PipelineState, PipelineId>(this._streamNameMap, new(id), true, cancellationToken);
                return this.Ok(Map(pipeline.State));
            }


            /// <summary>Creates a workspace polygon in this pipeline.</summary>
            [HttpPost("{id}/workspaces")]
            [ProducesResponseType<PipelineResponse>(StatusCodes.Status201Created)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
            public Task<ActionResult<PipelineResponse>> AddWorkspace(string id, [FromBody] AddWorkspaceRequest request, CancellationToken cancellationToken) => ExecuteWorkspaceAsync(async () => {
                this._logger.LogInformation("Creating workspace. PipelineId: {PipelineId}, Name: {DisplayName}, User: {User}.", id, request?.DisplayName, this.User?.Identity?.Name);
                var state = await workspaceService.CreateAsync(id, request!, cancellationToken);
                return Map(state);
            }, createdPipelineId: id);

            /// <summary>Lists workspaces and their current owners.</summary>
            [HttpGet("{id}/workspaces")]
            [ProducesResponseType<IReadOnlyList<WorkspaceResponse>>(StatusCodes.Status200OK)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
            public Task<ActionResult<IReadOnlyList<WorkspaceResponse>>> GetWorkspaces(string id, CancellationToken cancellationToken) => ExecuteWorkspaceAsync<IReadOnlyList<WorkspaceResponse>>(async () => {
                var pipeline = await workspaceService.GetPipelineAsync(id, cancellationToken);
                return pipeline.Workspaces.Select(WorkspaceResponse.FromState).ToArray();
            });

            /// <summary>Gets a workspace and its Esri JSON polygon.</summary>
            [HttpGet("{id}/workspaces/{workspace}", Name = "GetWorkspace.V1")]
            [ProducesResponseType<WorkspaceDetailResponse>(StatusCodes.Status200OK)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
            public Task<ActionResult<WorkspaceDetailResponse>> GetWorkspace(string id, string workspace, CancellationToken cancellationToken) => ExecuteWorkspaceAsync(() => workspaceService.GetWorkspaceAsync(id, workspace, cancellationToken));

            /// <summary>Lists bound packages whose rectangular AOIs intersect this workspace.</summary>
            [HttpGet("{id}/workspaces/{workspace}/packages")]
            [ProducesResponseType<PagedResponse<WorkspacePackageResponse>>(StatusCodes.Status200OK)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
            public Task<ActionResult<PagedResponse<WorkspacePackageResponse>>> GetWorkspacePackages(string id, string workspace, CancellationToken cancellationToken, [FromQuery, Range(1, int.MaxValue)] int page = 1, [FromQuery, Range(1, PackageRepository.MaximumPageSize)] int pageSize = DefaultPageSize) => ExecuteWorkspaceAsync(() => workspaceService.GetPackagesAsync(id, workspace, page, pageSize, cancellationToken));

            /// <summary>Claims the workspace for the signed-in user, replacing any current owner.</summary>
            /// <param name="id">Pipeline ID from GET /pipelines.</param>
            /// <param name="workspace">ID from that same pipeline's workspaces array.</param>
            /// <param name="cancellationToken">Cancels the operation.</param>
            [HttpPost("{id}/workspaces/{workspace}")]
            [ProducesResponseType<PipelineResponse>(StatusCodes.Status200OK)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
            public Task<ActionResult<PipelineResponse>> LockWorkspace(string id, string workspace, CancellationToken cancellationToken) => SetWorkspaceLock(id, workspace, true, cancellationToken);

            /// <summary>Clears the workspace owner, regardless of who currently owns it.</summary>
            [HttpDelete("{id}/workspaces/{workspace}/lock")]
            [ProducesResponseType<PipelineResponse>(StatusCodes.Status200OK)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
            [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
            public Task<ActionResult<PipelineResponse>> UnlockWorkspace(string id, string workspace, CancellationToken cancellationToken) => SetWorkspaceLock(id, workspace, false, cancellationToken);

            private async Task<ActionResult<PipelineResponse>> SetWorkspaceLock(string id, string workspace, bool locked, CancellationToken cancellationToken) {
                var identity = this.User?.Identity;
                var username = identity?.Name;
                if (identity?.IsAuthenticated != true || string.IsNullOrWhiteSpace(username)) {
                    return this.Problem(title: "A signed-in user is required.", statusCode: StatusCodes.Status401Unauthorized);
                }
                username = Extensions.NormalizeUserName(username);
                if (string.IsNullOrWhiteSpace(username)) {
                    return this.Problem(title: "A valid username is required.", statusCode: StatusCodes.Status401Unauthorized);
                }
                this._logger.LogInformation("Updating workspace ownership. PipelineId: {PipelineId}, WorkspaceId: {WorkspaceId}, User: {User}, Assigned: {Assigned}.", id, workspace, username, locked);
                try {
                    var state = await workspaceService.SetLockAsync(id, workspace, username, locked, cancellationToken);
                    if (state is null) {
                        return this.Problem(title: "Workspace not found in this pipeline.", detail: $"Workspace '{workspace}' is not part of pipeline '{id}'. Use a workspace ID from that pipeline's workspaces array.", statusCode: StatusCodes.Status404NotFound);
                    }
                    return this.Ok(Map(state));
                }
                catch (KeyNotFoundException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status404NotFound); }
                catch (InvalidDataException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status400BadRequest); }
                catch (WorkspaceConflictException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status409Conflict); }
            }

            private async Task<ActionResult<T>> ExecuteWorkspaceAsync<T>(Func<Task<T>> action, string? createdPipelineId = null) {
                try {
                    var result = await action();
                    return createdPipelineId is null ? this.Ok(result) : this.CreatedAtRoute("GetPipeline.V1", new { id = createdPipelineId, version = ApiVersions.V1Text }, result);
                }
                catch (KeyNotFoundException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status404NotFound); }
                catch (InvalidDataException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status400BadRequest); }
                catch (WorkspaceConflictException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status409Conflict); }
            }


            private static PipelineResponse Map(Domain.PipelineState state) => new() {
                Id = state.Id,
                DisplayName = state.DisplayName,
                Description = state.Description,
                LastUpdatedUtc = state.LastUpdatedUtc,
                Workspaces = state.Workspaces.Select(WorkspaceResponse.FromState).ToArray(),
            };

            private const string _alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";

            private static string CreateStreamId() => Nanoid.Generate(_alphabet, 18);
        }
    }

}
