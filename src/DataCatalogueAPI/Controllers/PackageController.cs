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
using DataCatalague.Api.Services;
using IO = System.IO;
using System.ComponentModel.DataAnnotations;

namespace DataCatalague.Api.Controllers
{
    [Authorize(Policy = "datacatalogue:access")]
    [ApiController]
    [ApiVersion(ApiVersions.V1Text)]
    [Route("api/v{version:apiVersion}/packages")]
    [Produces("application/json")]
    public sealed class PackageController(IEventStore eventstore, PackageRepository packageRepository, PackageGeometryService geometryService, PackageCreationService creationService, DispatcherResourceService resources, IOptions<PackagesOptions> options, ILogger<PackageController> logger) : ControllerBase
    {
        private const int DefaultPageSize = 20;

        private readonly PackageGeometryService _geometryService = geometryService;

        readonly StreamNameMap _streamNameMap = new();

        private readonly IEventStore _eventStore = eventstore;

        private readonly PackageRepository _packageRepository = packageRepository;

        private readonly IOptions<PackagesOptions> _options = options;

        private readonly ILogger<PackageController> _logger = logger;


        [HttpPost()]
        [Consumes("application/json")]
        [ProducesResponseType<PackageResponse>(StatusCodes.Status201Created)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<PackageResponse>> CreatePackage([FromBody] CreatePackageRequest request, CancellationToken cancellationToken) {
            if (request is null) { return this.Problem(title: "Invalid package request.", statusCode: StatusCodes.Status400BadRequest); }

            // Sample initialization invokes this action directly, bypassing MVC model validation.
            var validationErrors = new List<ValidationResult>();
            if (!Validator.TryValidateObject(request, new ValidationContext(request), validationErrors, validateAllProperties: true)
                || !Uri.TryCreate(request.AbsoluteUri, UriKind.Absolute, out _)) {
                return this.BadRequest(new ProblemDetails {
                    Title = "Invalid package request.",
                    Detail = "A category, absolute source URI and geometry are required."
                });
            }

            try {
                var state = await creationService.CreateAsync(request, cancellationToken);
                this._logger.LogInformation("Created package {PackageId}. ShortId: {ShortId}, Category: {Category}, User: {User}.", state.Id, state.MetaData?.ShortId, request.Category, this.User?.Identity?.Name);
                return this.CreatedAtRoute("GetPackage.V1", new { id = state.Id!.Value, version = ApiVersions.V1Text }, Map(state));
            }
            catch (PackageCreationException exception) {
                var status = exception.Error switch {
                    PackageCreationError.Validation => StatusCodes.Status400BadRequest,
                    PackageCreationError.Conflict => StatusCodes.Status409Conflict,
                    _ => StatusCodes.Status500InternalServerError,
                };
                return this.Problem(title: exception.Message, detail: exception.Detail, statusCode: status);
            }
        }

        /// <summary>Lists a bounded page of packages, optionally filtered by category, AOI and pipeline assignment.</summary>
        /// <param name="category">An exact category identifier; omitted values include all categories.</param>
        /// <param name="geometry">Optional Esri JSON envelope or polygon with an explicit spatialReference (wkid or wkt).</param>
        /// <param name="page">One-based page number, default 1.</param>
        /// <param name="pageSize">Number of packages per page, from 1 to 200; default 20.</param>
        /// <param name="pipelineId">Optional exact pipeline ID; combined with the other filters.</param>
        /// <param name="hasPipeline">Optional: true for assigned packages, false for unassigned, or omitted for both.</param>
        /// <param name="cancellationToken">Cancels the spatial query and metadata listing.</param>
        /// <returns>Matching packages in ordinal catalogue identifier order and the total count before pagination.</returns>
        [HttpGet]
        [ProducesResponseType<PagedResponse<PackageResponse>>(StatusCodes.Status200OK)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<PagedResponse<PackageResponse>>> GetPackages(CancellationToken cancellationToken, [FromQuery] string? category = null, [FromQuery, StringLength(16384)] string? geometry = null, [FromQuery, Range(1, int.MaxValue)] int page = 1, [FromQuery, Range(1, PackageRepository.MaximumPageSize)] int pageSize = DefaultPageSize, [FromQuery] bool? hasPipeline = null, [FromQuery] string? pipelineId = null) {
            try {
                var result = await this._packageRepository.GetPackagesAsync(category, cancellationToken, geometry, page, pageSize, hasPipeline, pipelineId);
                return this.Ok(new PagedResponse<PackageResponse> {
                    Items = [.. result.Items.Select(Map)],
                    Page = page,
                    PageSize = pageSize,
                    TotalCount = result.TotalCount,
                });
            }
            catch (InvalidDataException exception) {
                this.ModelState.AddModelError(nameof(geometry), exception.Message);
                return this.ValidationProblem(this.ModelState);
            }
        }

        [HttpGet("{id}", Name = "GetPackage.V1")]
        [ProducesResponseType<PackageResponse>(StatusCodes.Status200OK)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<PackageResponse>> GetPackage(string id, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNullOrEmpty(id);

            if (!await this._eventStore.StreamExists(this._streamNameMap.GetStreamName(new PackageId(id)), cancellationToken)) {
                return this.Problem(title: "Package not found.", detail: $"No package exists with identifier {id}.", statusCode: StatusCodes.Status404NotFound);
            }
            try {
                var stream = await this._eventStore.LoadState<PackageState, PackageId>(this._streamNameMap, new(id), true, cancellationToken);
                return this.Ok(Map(stream.State));
            }
            catch (StreamNotFound) {
                this._logger.LogInformation("Package {id} was not found.", id);

                return this.Problem(
                    title: "Package not found.",
                    detail: $"No package exists with identifier {id}.",
                    statusCode: StatusCodes.Status404NotFound);
            }
        }

        /// <summary>Replaces the package's complete detail geometry and recomputes its rectangular AOI.</summary>
        /// <param name="id">The existing package identifier.</param>
        /// <param name="request">Esri JSON strings for the AOI fallback and detail groups; omitted groups are removed.</param>
        /// <param name="cancellationToken">Cancels work before the geometry transaction commits.</param>
        /// <returns>The package containing the persisted geometry references.</returns>
        [HttpPut("{id}/geometry")]
        [Consumes("application/json")]
        [ProducesResponseType<PackageResponse>(StatusCodes.Status200OK)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<PackageResponse>> AddGeometry(string id, [FromBody] AddPackageGeometryRequest request, CancellationToken cancellationToken) {
            if (string.IsNullOrWhiteSpace(id)) {
                this.ModelState.AddModelError(nameof(id), "A package identifier is required.");
                return this.ValidationProblem(this.ModelState);
            }

            this._logger.LogInformation("Replacing package geometry. PackageId: {PackageId}, User: {User}, HasPoints: {HasPoints}, HasCurves: {HasCurves}, HasSurfaces: {HasSurfaces}.", id, this.User?.Identity?.Name, request?.Points is not null, request?.Curves is not null, request?.Surfaces is not null);
            try {
                var state = await this._geometryService.ReplaceAsync(id, request!, cancellationToken);
                if (state is null) {
                    return this.Problem(title: "Package not found.", detail: $"No package exists with identifier {id}.", statusCode: StatusCodes.Status404NotFound);
                }
                return this.Ok(Map(state));
            }
            catch (InvalidDataException exception) {
                this.ModelState.AddModelError(nameof(request), exception.Message);
                return this.ValidationProblem(this.ModelState);
            }
        }

        [HttpPost("repository")]
        [Consumes("multipart/form-data")]
        [ProducesResponseType<FileResponse>(StatusCodes.Status201Created)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<FileResponse>> UploadFile([FromForm] UploadFileRequest request, CancellationToken cancellationToken) {
            if (request?.File is null || request.File.Length == 0) {
                return this.Problem(
                    title: "Invalid package",
                    detail: "The uploaded ZIP file is empty.",
                    statusCode: StatusCodes.Status400BadRequest);
            }

            if (!string.Equals(Path.GetExtension(request.File.FileName), ".zip", StringComparison.OrdinalIgnoreCase)) {
                return this.Problem(
                    title: "Invalid package",
                    detail: "The uploaded file must be a ZIP archive.",
                    statusCode: StatusCodes.Status400BadRequest);
            }

            await using IO.Stream stream = request.File.OpenReadStream();

            var fileRef = await resources.StoreFileAsync(stream, request.File.FileName, cancellationToken);

            return this.StatusCode(StatusCodes.Status201Created, new FileResponse {
                AbsoluteUri = $"database://{fileRef}",
            });
        }

        private static PackageResponse Map(Domain.PackageState state) => new() {
            Id = state.Id,
            Category = state.Category,
            FileName = state.FileName,
            AbsoluteUri = state.AbsoluteUri?.AbsolutePath,
            GeometryRef = GeometryReferenceResponse.FromStoredReference(state.GeometryRef),
            DetailedGeometry = DetailedGeometryResponse.FromState(state.DetailedGeometry),
            Severity = state.Severity,
            MetaData = state.MetaData,
            Descriptions = state.Descriptions,
            Charts = state.Charts,
            DisplayScale = state.DisplayScale,
            LastUpdatedUtc = state.LastUpdatedUtc,
        };

    }
}
