using ArcGIS.Core.Data.DDL;
using Asp.Versioning;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Models;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Repositories;
using DataCatalague.Api.Services;
using Eventuous;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using NanoidDotNet;
using IO = System.IO;

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
    [ApiController]
    [ApiVersion(ApiVersions.V1Text)]
    [Route("api/v{version:apiVersion}/dispatcher")]
    [Produces("application/json")]
    public sealed class DispatcherController(
        IEventStore eventstore,
        ICommandService<CategoryState> categoryService,
        ICommandService<BindingState> bindingService,
        DispatchRepository dispatchRepository,
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
        public async Task<ActionResult<CategoryResponse>> CreateCategory([FromBody] CreateCategoryRequest request, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNull(request);
            ArgumentNullException.ThrowIfNullOrWhiteSpace(request.DisplayName?.Trim());
            ArgumentNullException.ThrowIfNullOrWhiteSpace(request.Description?.Trim());

            var displayName = request.DisplayName?.Trim()!;
            var description = request.Description?.Trim();

            var cmd = await this._serviceCategory.Handle(new DispatcherCommands.CreateCategory(CreateStreamId(), displayName, description), cancellationToken);

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
            ArgumentNullException.ThrowIfNullOrEmpty(request.GeoJSON);

            var geometryRef = await this._dispatcher.ExecuteAsync(() => {
                var polygon = this._dispatchRepository.FromGeoJson(request.GeoJSON);

                return this._dispatchRepository.AddSeverityAOI(polygon, request.Severity);
            });

            this._logger.LogInformation("Created severity area {id}.", geometryRef);

            return new SeverityResponse {
                GeometryRef = geometryRef,
            };
        }


        [HttpPost("bindings")]
        [Consumes("application/json")]
        [ProducesResponseType<BindingResponse>(StatusCodes.Status200OK)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<BindingResponse>> CreateBinding([FromBody] BindRequest request, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNull(request);
            ArgumentNullException.ThrowIfNullOrEmpty(request.PackageId);
            ArgumentNullException.ThrowIfNullOrEmpty(request.PipelineId);

            try {
                var package = await this._eventStore.LoadState<PackageState>(new(request.PackageId), true, cancellationToken);

                var pipeline = await this._eventStore.LoadState<PipelineState>(new(request.PipelineId), true, cancellationToken);

                var cmd = await this._serviceBinding.Handle(new DispatcherCommands.Bind($"{request.PackageId}::{request.PipelineId}", request.PackageId, request.PipelineId), cancellationToken);

                if (!cmd.Success)
                    return this.BadRequest();

                var result = cmd.Get()!;

                this._logger.LogInformation("Bind {package} => {pipeline}.", result.State.PackageId, result.State.PipelineId);

                return this.CreatedAtRoute(
                    "GetBinding.V1",
                    new { id = result.State.Id, version = ApiVersions.V1Text },
                    Map(result.State));

            }
            catch {
                this._logger.LogInformation("Package/Pipeline {package}/{pipeline} was not found.", request.PackageId, request.PipelineId);

                return this.Problem(
                    title: "Package or pipeline not found.",
                    detail: $"No package or pipeline exists with identifier {request.PackageId}|{request.PipelineId}.",
                    statusCode: StatusCodes.Status404NotFound);
            }
        }

        [HttpGet("bindings/{id}", Name = "GetBinding.V1")]
        [Consumes("application/json")]
        [ProducesResponseType<BindingResponse>(StatusCodes.Status200OK)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<BindingResponse>> GetBinding(string id, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNullOrEmpty(id);

            try {
                var stream = await this._eventStore.LoadState<BindingState, BindingId>(this._streamNameMap, new(id), cancellationToken: cancellationToken);
                return Map(stream.State);
            }
            catch {
                this._logger.LogInformation("Binding {id} was not found.", id);

                return this.Problem(
                    title: "Binding not found.",
                    detail: $"No binding exists with identifier {id}.",
                    statusCode: StatusCodes.Status404NotFound);
            }
        }



        private static CategoryResponse Map(Domain.CategoryState state) => new() {
            Id = state.Id,
            DisplayName = state.DisplayName,
            Description = state.Description,
            Version = state.Version?.ToString(),
            Specification = state.Markdown,
            LastUpdatedUtc = state.LastUpdatedUtc,
        };

        private static BindingResponse Map(Domain.BindingState state) => new() {
            Id = state.Id,
            PackageId = state.PackageId,
            PipelineId = state.PipelineId,
            LastUpdatedUtc = state.LastUpdatedUtc,
        };

        private const string _alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";

        private static string CreateStreamId() => Nanoid.Generate(_alphabet, 18);
    }
}
