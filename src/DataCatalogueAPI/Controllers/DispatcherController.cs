using Asp.Versioning;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Models;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Repositories;
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
        ICommandService<PackageState> packageService,
        DispatchRepository dispatchRepository,
        IOptions<DispatcherOptions> options,
        ArcGisDispatcher dispatcher,
        ILogger<DispatcherController> logger) : ControllerBase
    {
        private const int DefaultPageSize = 20;

        readonly StreamNameMap _streamNameMap = new();

        private readonly IEventStore _eventStore = eventstore;

        private readonly ICommandService<CategoryState> _serviceCategory = categoryService;

        private readonly ICommandService<PackageState> _servicePackage = packageService;

        private readonly DispatchRepository _dispatchRepository = dispatchRepository;

        private readonly IOptions<DispatcherOptions> _options = options;

        private readonly ArcGisDispatcher _dispatcher = dispatcher;

        private readonly ILogger<DispatcherController> _logger = logger;

        [HttpGet("categories")]
        [Consumes("application/json")]
        [ProducesResponseType<PagedResponse<CategoryResponse>>(StatusCodes.Status200OK)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<PagedResponse<CategoryResponse>>> GetCategories(CancellationToken cancellationToken) {
            return this.BadRequest();
        }

        [HttpPost("categories")]
        [Consumes("application/json")]
        [ProducesResponseType<CategoryResponse>(StatusCodes.Status201Created)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<CategoryResponse>> CreateCategory([FromBody] CreateCategoryRequest request, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNull(request);
            ArgumentNullException.ThrowIfNullOrWhiteSpace(request.DisplayName?.Trim());
            ArgumentNullException.ThrowIfNullOrWhiteSpace(request.Description?.Trim());

            var displayName = request.DisplayName?.Trim();
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

        [HttpGet("categoriess/{id}", Name = "GetCategory.V1")]
        [Consumes("application/json")]
        [ProducesResponseType<CategoryResponse>(StatusCodes.Status200OK)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<CategoryResponse>> GetCategory(string id, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNullOrEmpty(id);

            try {
                var stream = await this._eventStore.LoadState<CategoryState, CategoryId>(this._streamNameMap, new(id), cancellationToken: cancellationToken);
                return Map(stream.State);
            }
            catch {
                this._logger.LogInformation("Category {id} was not found.", id);

                return this.Problem(
                    title: "Category not found.",
                    detail: $"No category exists with identifier {id}.",
                    statusCode: StatusCodes.Status404NotFound);
            }
        }

        [HttpPut("categoriess/{id}/specification")]
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
                "GetPackage.V1",
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



        private static CategoryResponse Map(Domain.CategoryState state) => new() {
            Id = state.Id,
            DisplayName = state.DisplayName,
            Description = state.Description,
            Version = state.Version?.ToString(),
            Specification = state.Markdown,
            LastUpdatedUtc = state.LastUpdatedUtc,
        };

        private const string _alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

        private static string CreateStreamId() => Nanoid.Generate(_alphabet, 18);
    }
}
