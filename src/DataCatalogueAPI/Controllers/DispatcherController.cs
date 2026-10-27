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
    public sealed class DispatcherController(IEventStore eventstore, ICommandService<CategoryState> categoryService, DispatchRepository dispatchRepository, WorkspaceService workspaceService, PipelineAssignmentService assignments, DispatcherResourceService resources, IOptions<DispatcherOptions> options, ILogger<DispatcherController> logger) : ControllerBase
    {
        private const int DefaultPageSize = 20;

        readonly StreamNameMap _streamNameMap = new();

        private readonly IEventStore _eventStore = eventstore;

        private readonly ICommandService<CategoryState> _serviceCategory = categoryService;

        private readonly DispatchRepository _dispatchRepository = dispatchRepository;

        private readonly IOptions<DispatcherOptions> _options = options;

        private readonly ILogger<DispatcherController> _logger = logger;

        [HttpGet("categories")]
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
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<CategoryResponse>> CreateCategory([FromBody] CreateCategoryRequest request, CancellationToken cancellationToken) {
            if (request is null || string.IsNullOrWhiteSpace(request.DisplayName) || string.IsNullOrWhiteSpace(request.Description)) {
                return this.Problem(title: "Category display name and description are required.", statusCode: StatusCodes.Status400BadRequest);
            }

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

            if (cmd.Exception is WrongVersion) { return this.Problem(title: "Category changed; retry the request.", statusCode: StatusCodes.Status409Conflict); }
            if (!cmd.Success) {
                this._logger.LogError(cmd.Exception, "Could not save category changes.");
                return this.Problem(title: "Could not save category changes.", statusCode: StatusCodes.Status500InternalServerError);
            }

            var result = cmd.Get()!;

            this._logger.LogInformation("CreateCategory {id}.", result.State.Id);

            return this.CreatedAtRoute(
                "GetCategory.V1",
                new { id = result.State.Id!.Value, version = ApiVersions.V1Text },
                Map(result.State));
        }

        [HttpGet("categories/{id}", Name = "GetCategory.V1")]
        [ProducesResponseType<CategoryResponse>(StatusCodes.Status200OK)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<CategoryResponse>> GetCategory(string id, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNullOrEmpty(id);

            if (!await this._eventStore.StreamExists(this._streamNameMap.GetStreamName(new CategoryId(id)), cancellationToken)) {
                return this.Problem(title: "Category not found.", detail: $"No category exists with identifier {id}.", statusCode: StatusCodes.Status404NotFound);
            }
            try {
                var stream = await this._eventStore.LoadState<CategoryState, CategoryId>(this._streamNameMap, new(id), true, cancellationToken);
                return this.Ok(Map(stream.State));
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
        [ProducesResponseType<CategoryResponse>(StatusCodes.Status200OK)]
        [ProducesResponseType<CategoryResponse>(StatusCodes.Status201Created)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<CategoryResponse>> UpdateCategorySpecification(string id, [FromBody] UpdateCategorySpecificationRequest request, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNullOrEmpty(id);

            if (request is null || !Version.TryParse(request.Version, out var version) || string.IsNullOrWhiteSpace(request.Markdown)) {
                return this.Problem(title: "Supply a valid specification version and Markdown.", statusCode: StatusCodes.Status400BadRequest);
            }
            if (!await this._eventStore.StreamExists(this._streamNameMap.GetStreamName(new CategoryId(id)), cancellationToken)) {
                return this.Problem(title: "Category not found.", statusCode: StatusCodes.Status404NotFound);
            }
            var current = (await this._eventStore.LoadState<CategoryState, CategoryId>(this._streamNameMap, new(id), true, cancellationToken)).State;
            if (current.Version == version && current.Markdown == request.Markdown) { return this.Ok(Map(current)); }

            var cmd = await this._serviceCategory.Handle(new DispatcherCommands.UpdateSpecificationCategory(id, request.Version, request.Markdown), cancellationToken);

            if (cmd.Exception is WrongVersion) { return this.Problem(title: "Category changed; retry the request.", statusCode: StatusCodes.Status409Conflict); }
            if (!cmd.Success) {
                this._logger.LogError(cmd.Exception, "Could not save category changes.");
                return this.Problem(title: "Could not save category changes.", statusCode: StatusCodes.Status500InternalServerError);
            }

            var result = cmd.Get()!;


            this._logger.LogInformation("UpdateCategorySpecification {version}.", result.State.Version);

            if (current.Markdown is null) {
                return this.CreatedAtAction(nameof(UpdateCategorySpecification), new { id, version = ApiVersions.V1Text }, Map(result.State));
            }
            return this.Ok(Map(result.State));
        }



        [HttpPost("severity")]
        [Consumes("application/json")]
        [ProducesResponseType<SeverityResponse>(StatusCodes.Status201Created)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<SeverityResponse>> AddSeverity([FromBody] AddSeverityAreaRequest request, CancellationToken cancellationToken) {
            if (request is null || string.IsNullOrWhiteSpace(request.EsriJSON)) {
                return this.Problem(title: "An Esri JSON polygon is required.", statusCode: StatusCodes.Status400BadRequest);
            }

            try {
                var geometryRef = await resources.CreateSeverityAsync(request.EsriJSON, request.Severity, cancellationToken);
                this._logger.LogInformation("Created severity area {id}.", geometryRef);
                return this.StatusCode(StatusCodes.Status201Created, new SeverityResponse { GeometryRef = geometryRef });
            }
            catch (InvalidDataException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status400BadRequest); }
        }


        /// <summary>Assigns a package to a pipeline, including a previously removed assignment.</summary>
        [HttpPost("bindings")]
        [Consumes("application/json")]
        [ProducesResponseType<BindingResponse>(StatusCodes.Status201Created)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
        public async Task<ActionResult<BindingResponse>> CreateBinding([FromBody] BindRequest request, CancellationToken cancellationToken) {
            if (request is null || string.IsNullOrWhiteSpace(request.PackageId) || string.IsNullOrWhiteSpace(request.PipelineId)) {
                return this.Problem(title: "Package and pipeline identifiers are required.", statusCode: StatusCodes.Status400BadRequest);
            }
            try {
                // Resolve AOI matches before committing the assignment.
                var intersections = await workspaceService.GetIntersectionsAsync(request.PackageId, request.PipelineId, cancellationToken);
                var state = await assignments.AssignAsync(request.PackageId, request.PipelineId, cancellationToken);
                this._logger.LogInformation("Assigned package {PackageId} to pipeline {PipelineId}. User: {User}.", request.PackageId, request.PipelineId, this.User?.Identity?.Name);
                return this.CreatedAtRoute("GetBinding.V1", new { id = state.Id!.Value, version = ApiVersions.V1Text }, Map(state, intersections));
            }
            catch (InvalidDataException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status400BadRequest); }
            catch (KeyNotFoundException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status404NotFound); }
            catch (PipelineAssignmentConflictException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status409Conflict); }
        }

        /// <summary>Lists a package's active pipeline assignments and intersecting workspaces.</summary>
        /// <param name="packageId">The package whose selected pipelines are returned.</param>
        /// <param name="cancellationToken">Cancels the listing.</param>
        [HttpGet("bindings")]
        [ProducesResponseType<IReadOnlyList<BindingResponse>>(StatusCodes.Status200OK)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<IReadOnlyList<BindingResponse>>> GetBindings([FromQuery, System.ComponentModel.DataAnnotations.Required] string packageId, CancellationToken cancellationToken) {
            if (string.IsNullOrWhiteSpace(packageId)) { return this.Problem(title: "Package identifier is required.", statusCode: StatusCodes.Status400BadRequest); }
            try {
                var result = new List<BindingResponse>();
                foreach (var state in await assignments.ListAsync(packageId, cancellationToken)) {
                    var intersections = await workspaceService.GetIntersectionsAsync(packageId, state.PipelineId!.Value, cancellationToken);
                    result.Add(Map(state, intersections));
                }
                return this.Ok(result);
            }
            catch (KeyNotFoundException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status404NotFound); }
        }

        /// <summary>Gets an active package–pipeline assignment.</summary>
        [HttpGet("bindings/{id}", Name = "GetBinding.V1")]
        [ProducesResponseType<BindingResponse>(StatusCodes.Status200OK)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<BindingResponse>> GetBinding(string id, CancellationToken cancellationToken) {
            try {
                var state = await assignments.GetAsync(id, cancellationToken);
                if (!state.IsActive) { return this.Problem(title: "Binding not found.", statusCode: StatusCodes.Status404NotFound); }
                var intersections = await workspaceService.GetIntersectionsAsync(state.PackageId!.Value, state.PipelineId!.Value, cancellationToken);
                return this.Ok(Map(state, intersections));
            }
            catch (KeyNotFoundException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status404NotFound); }
        }

        /// <summary>Removes a pipeline assignment; preserves the package and assignment history.</summary>
        /// <param name="id">Binding ID from the assignment listing or creation response.</param>
        /// <param name="cancellationToken">Cancels the removal.</param>
        [HttpDelete("bindings/{id}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
        public async Task<IActionResult> DeleteBinding(string id, CancellationToken cancellationToken) {
            try {
                await assignments.RemoveAsync(id, cancellationToken);
                this._logger.LogInformation("Removed pipeline assignment {BindingId}. User: {User}.", id, this.User?.Identity?.Name);
                return this.NoContent();
            }
            catch (KeyNotFoundException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status404NotFound); }
            catch (PipelineAssignmentConflictException exception) { return this.Problem(title: exception.Message, statusCode: StatusCodes.Status409Conflict); }
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
