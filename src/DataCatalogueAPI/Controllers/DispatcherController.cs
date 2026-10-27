using ArcGIS.Core.Data.DDL;
using Asp.Versioning;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Models;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Repositories;
using Eventuous;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using NanoidDotNet;
using IO = System.IO;
using DataCatalague.Api.Services;

/*
    Dispatcher
       │
       ├── Dispatch
       │     └── Package
       │
       └── Category

    Dispatch
      ID: 01J...
      Status: Completed

      Packages:
        ├── S101
        ├── S128
        └── Metadata
 */

namespace DataCatalague.Api.Controllers
{
    [Authorize(Policy = "datacatalogue:access")]
    [ApiController]
    [ApiVersion(ApiVersions.V1Text)]
    [Route("api/v{version:apiVersion}/dispatcher")]
    [Produces("application/json")]
    public sealed class DispatcherController(
        IEventStore eventstore,
        ICommandService<CategoryState> categoryService,
        ICommandService<BindingState> bindingService,
        DispatchRepository dispatchRepository,
        WorkspaceService workspaceService,
        IOptions<DispatcherOptions> options,
        ArcGisDispatcher dispatcher,
        ILogger<DispatcherController> logger) : ControllerBase
    {
        private const int DefaultPageSize = 20;

        readonly StreamNameMap _streamNameMap = new();

        private readonly IEventStore _eventStore = eventstore;

        private readonly ICommandService<CategoryState> _serviceCategory = categoryService;

        private readonly ICommandService<BindingState> _serviceBinding = bindingService;

        private readonly DispatchRepository _dispatchRepository = dispatchRepository;

        private readonly IOptions<DispatcherOptions> _options = options;

        private readonly ArcGisDispatcher _dispatcher = dispatcher;

        private readonly ILogger<DispatcherController> _logger = logger;

        [HttpGet("categories")]
        [Consumes("application/json")]
        [ProducesResponseType<PagedResponse<CategoryResponse>>(StatusCodes.Status200OK)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<PagedResponse<CategoryResponse>>> GetCategories(CancellationToken cancellationToken) {
            var categories = _dispatchRepository.Categories;

            return this.Ok(new PagedResponse<CategoryResponse> {
                Items = categories.Select(e => Map(_dispatchRepository.GetCategory(e))).ToArray(),
                Page = 1,
                PageSize = Math.Max(DefaultPageSize, categories.Length),
                TotalCount = categories.Length,
            });
        }

        [HttpPost("categories")]
        [Consumes("application/json")]
        [ProducesResponseType<CategoryResponse>(StatusCodes.Status201Created)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
        public async Task<ActionResult<CategoryResponse>> CreateCategory([FromBody] CreateCategoryRequest request, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNull(request);
            ArgumentNullException.ThrowIfNullOrWhiteSpace(request.DisplayName?.Trim());
            ArgumentNullException.ThrowIfNullOrWhiteSpace(request.Description?.Trim());

            var displayName = request.DisplayName?.Trim()!;
            var description = request.Description?.Trim();

            if (request.Id is not null && !System.Text.RegularExpressions.Regex.IsMatch(request.Id, @"\A[a-zA-Z0-9_-]{1,200}\z")) {
                return this.BadRequest(new ProblemDetails { Title = "Invalid category identifier." });
            }
            if (string.IsNullOrEmpty(request.Prefix) || !System.Text.RegularExpressions.Regex.IsMatch(request.Prefix, @"\A[A-Z]{2,3}\z")) {
                return this.BadRequest(new ProblemDetails { Title = "Category prefix must contain two or three uppercase letters." });
            }
            if (this._dispatchRepository.Categories.Any(id => string.Equals(this._dispatchRepository.GetCategory(id).Prefix, request.Prefix, StringComparison.Ordinal))) {
                return this.Conflict(new ProblemDetails { Title = "Category prefix already in use." });
            }
            var categoryId = request.Id ?? CreateStreamId();
            if (await this._eventStore.StreamExists(this._streamNameMap.GetStreamName(new CategoryId(categoryId)), cancellationToken)) {
                return this.Conflict(new ProblemDetails { Title = "Category already exists.", Detail = $"Category '{categoryId}' already exists." });
            }
            var cmd = await this._serviceCategory.Handle(new DispatcherCommands.CreateCategory(categoryId, displayName, description, request.Prefix), cancellationToken);

            if (!cmd.Success)
                return this.BadRequest();

            var result = cmd.Get()!;

            this._logger.LogInformation("CreateCategory {id}.", result.State.Id);

            return this.CreatedAtRoute(
                "GetCategory.V1",
                new { id = result.State.Id, version = ApiVersions.V1Text },
                Map(result.State));
        }

        [HttpGet("categories/{id}", Name = "GetCategory.V1")]
        [Consumes("application/json")]
        [ProducesResponseType<CategoryResponse>(StatusCodes.Status200OK)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<CategoryResponse>> GetCategory(string id, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNullOrEmpty(id);

            try {
                var stream = await this._eventStore.LoadState<CategoryState, CategoryId>(this._streamNameMap, new(id), true, cancellationToken);
                return Map(stream.State);
            }
            catch (StreamNotFound) {
                this._logger.LogInformation("Category {id} was not found.", id);

                return this.Problem(
                    title: "Category not found.",
                    detail: $"No category exists with identifier {id}.",
                    statusCode: StatusCodes.Status404NotFound);
            }
        }

        [HttpPut("categories/{id}/specification")]
        [Consumes("application/json")]
        [ProducesResponseType<CategoryResponse>(StatusCodes.Status202Accepted)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<CategoryResponse>> UpdateCategorySpecification(string id, [FromBody] UpdateCategorySpecificationRequest request, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNullOrEmpty(id);

            ArgumentNullException.ThrowIfNullOrEmpty(request.Version);
            ArgumentNullException.ThrowIfNullOrEmpty(request.Markdown);

            var cmd = await this._serviceCategory.Handle(new DispatcherCommands.UpdateSpecificationCategory(id, request.Version, request.Markdown), cancellationToken);

            if (!cmd.Success)
                return this.BadRequest();

            var result = cmd.Get()!;


            this._logger.LogInformation("UpdateCategorySpecification {version}.", result.State.Version);

            return this.AcceptedAtRoute(
                "GetCategory.V1",
                new { id = result.State.Id, version = ApiVersions.V1Text },
                Map(result.State));
        }



        [HttpPost("severity")]
        [Consumes("application/json")]
        [ProducesResponseType<SeverityResponse>(StatusCodes.Status200OK)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<SeverityResponse>> AddSeverity([FromBody] AddSeverityAreaRequest request, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNull(request);
            ArgumentNullException.ThrowIfNullOrEmpty(request.EsriJSON);

            var geometryRef = await this._dispatcher.ExecuteAsync(() => {
                var polygon = this._dispatchRepository.FromEsriJson(request.EsriJSON);

                return this._dispatchRepository.AddSeverityAOI(polygon, request.Severity);
            });

            this._logger.LogInformation("Created severity area {id}.", geometryRef);

            return new SeverityResponse {
                GeometryRef = geometryRef,
            };
        }


        [HttpPost("bindings")]
        [Consumes("application/json")]
        [ProducesResponseType<BindingResponse>(StatusCodes.Status201Created)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
        public async Task<ActionResult<BindingResponse>> CreateBinding([FromBody] BindRequest request, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNull(request);
            if (string.IsNullOrWhiteSpace(request.PackageId) || string.IsNullOrWhiteSpace(request.PipelineId)) {
                return this.BadRequest(new ProblemDetails { Title = "Package and pipeline identifiers are required." });
            }

            // Command services use typed stream names; raw IDs address different streams.
            if (!await this._eventStore.StreamExists(this._streamNameMap.GetStreamName(new PackageId(request.PackageId)), cancellationToken)) {
                return this.NotFound(new ProblemDetails { Title = "Package not found.", Detail = $"No package exists with identifier {request.PackageId}." });
            }
            if (!await this._eventStore.StreamExists(this._streamNameMap.GetStreamName(new PipelineId(request.PipelineId)), cancellationToken)) {
                return this.NotFound(new ProblemDetails { Title = "Pipeline not found.", Detail = $"No pipeline exists with identifier {request.PipelineId}." });
            }

            // One stream per pair prevents duplicate links while allowing a package in multiple pipelines.
            var bindingId = $"{request.PackageId}::{request.PipelineId}";
            var streamName = this._streamNameMap.GetStreamName(new BindingId(bindingId));
            if (await this._eventStore.StreamExists(streamName, cancellationToken)) {
                return this.Conflict(new ProblemDetails { Title = "Package is already bound to this pipeline." });
            }

            // Resolve AOI matches before committing so a geometry-query failure cannot
            // turn a successful binding write into an HTTP failure.
            var intersections = await workspaceService.GetIntersectionsAsync(request.PackageId, request.PipelineId, cancellationToken);
            this._logger.LogInformation("Creating package binding. PackageId: {PackageId}, PipelineId: {PipelineId}, WorkspaceMatches: {WorkspaceMatches}, User: {User}.", request.PackageId, request.PipelineId, intersections.Count, this.User?.Identity?.Name);
            var cmd = await this._serviceBinding.Handle(new DispatcherCommands.Bind(bindingId, request.PackageId, request.PipelineId), cancellationToken);
            if (!cmd.Success) {
                // A concurrent caller may have created the same pair after the existence check.
                if (await this._eventStore.StreamExists(streamName, cancellationToken)) {
                    return this.Conflict(new ProblemDetails { Title = "Package is already bound to this pipeline." });
                }
                this._logger.LogError("Could not bind package {PackageId} to pipeline {PipelineId}.", request.PackageId, request.PipelineId);
                return this.Problem(title: "Could not create binding.", statusCode: StatusCodes.Status500InternalServerError);
            }

            var result = cmd.Get()!;
            this._logger.LogInformation("Bound package {PackageId} to pipeline {PipelineId}. BindingId: {BindingId}.", request.PackageId, request.PipelineId, result.State.Id);
            return this.CreatedAtRoute("GetBinding.V1", new { id = result.State.Id, version = ApiVersions.V1Text }, Map(result.State, intersections));
        }

        [HttpGet("bindings/{id}", Name = "GetBinding.V1")]
        [ProducesResponseType<BindingResponse>(StatusCodes.Status200OK)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<BindingResponse>> GetBinding(string id, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNullOrEmpty(id);
            if (!await this._eventStore.StreamExists(this._streamNameMap.GetStreamName(new BindingId(id)), cancellationToken)) {
                return this.NotFound(new ProblemDetails { Title = "Binding not found.", Detail = $"No binding exists with identifier {id}." });
            }

            var stream = await this._eventStore.LoadState<BindingState, BindingId>(this._streamNameMap, new(id), true, cancellationToken);
            var intersections = await workspaceService.GetIntersectionsAsync(stream.State.PackageId!.Value, stream.State.PipelineId!.Value, cancellationToken);
            return Map(stream.State, intersections);
        }



        private static CategoryResponse Map(Domain.CategoryState state) => new() {
            Id = state.Id,
            DisplayName = state.DisplayName,
            Prefix = state.Prefix,
            Description = state.Description,
            Version = state.Version?.ToString(),
            Specification = state.Markdown,
            LastUpdatedUtc = state.LastUpdatedUtc,
        };

        private static BindingResponse Map(Domain.BindingState state, IReadOnlyList<WorkspaceResponse> intersections) => new() {
            Workspaces = intersections,
            Id = state.Id,
            PackageId = state.PackageId,
            PipelineId = state.PipelineId,
            LastUpdatedUtc = state.LastUpdatedUtc,
        };

        private const string _alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";

        private static string CreateStreamId() => Nanoid.Generate(_alphabet, 18);
    }
}
