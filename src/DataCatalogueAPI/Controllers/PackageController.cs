using ArcGIS.Core.Geometry;
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
using System.Globalization;
using DataCatalague.Api.Services;
using IO = System.IO;
using System.ComponentModel.DataAnnotations;

namespace DataCatalague.Api.Controllers
{
    [ApiController]
    [ApiVersion(ApiVersions.V1Text)]
    [Route("api/v{version:apiVersion}/packages")]
    [Produces("application/json")]
    public sealed class PackageController(
        IEventStore eventstore,
        ICommandService<PackageState> packageService,
        PackageRepository packageRepository,
        PackageGeometryService geometryService,
        IOptions<PackagesOptions> options,
        ArcGisDispatcher dispatcher,
        ILogger<PackageController> logger) : ControllerBase
    {
        private const int DefaultPageSize = 20;

        private readonly PackageGeometryService _geometryService = geometryService;

        // The in-memory store and geometry repository cannot share a transaction.
        // Serialize creates so duplicate source IDs are checked before writing geometry.
        private static readonly SemaphoreSlim CreationGate = new(1, 1);

        readonly StreamNameMap _streamNameMap = new();

        private readonly IEventStore _eventStore = eventstore;

        private readonly ICommandService<PackageState> _servicePackage = packageService;

        private readonly PackageRepository _packageRepository = packageRepository;

        private readonly IOptions<PackagesOptions> _options = options;

        private readonly ArcGisDispatcher _dispatcher = dispatcher;

        private readonly ILogger<PackageController> _logger = logger;


        [HttpPost()]
        [Consumes("application/json")]
        [ProducesResponseType<PackageResponse>(StatusCodes.Status201Created)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
        public async Task<ActionResult<PackageResponse>> CreatePackage([FromBody] CreatePackageRequest request, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNull(request);

            // Sample initialization invokes this action directly, bypassing MVC model validation.
            var validationErrors = new List<ValidationResult>();
            if (!Validator.TryValidateObject(request, new ValidationContext(request), validationErrors, validateAllProperties: true)
                || !Uri.TryCreate(request.AbsoluteUri, UriKind.Absolute, out _)) {
                return this.BadRequest(new ProblemDetails {
                    Title = "Invalid package request.",
                    Detail = "A category, absolute source URI, geometry and valid optional identifier are required."
                });
            }

            await CreationGate.WaitAsync(cancellationToken);
            try {
                var categoryId = new CategoryId(request.Category);
                var categoryStream = this._streamNameMap.GetStreamName(categoryId);

                if (!await this._eventStore.StreamExists(categoryStream, cancellationToken)) {
                    return this.BadRequest(new ProblemDetails {
                        Title = "Category does not exist.",
                        Detail = $"No category exists with identifier '{request.Category}'."
                    });
                }

                var category = await this._eventStore.LoadState<CategoryState, CategoryId>(this._streamNameMap, categoryId, true, cancellationToken);

                if (category.State.IsTerminated) {
                    return this.BadRequest(new ProblemDetails {
                        Title = "Category is terminated.",
                        Detail = $"Category '{request.Category}' no longer accepts packages."
                    });
                }

                // Use UTC so annual identifiers do not depend on the server's timezone.
                var year = DateTime.UtcNow.ToString("yy", CultureInfo.InvariantCulture);
                var streamId = request.Id;

                if (streamId is null) {
                    if (string.IsNullOrEmpty(category.State.Prefix)) {
                        return this.BadRequest(new ProblemDetails {
                            Title = "Category has no identifier prefix."
                        });
                    }

                    // The creation gate serializes allocation and persistence within this API instance.
                    for (long number = 0; ; number++) {
                        streamId = $"{category.State.Prefix}-{number.ToString("D3", CultureInfo.InvariantCulture)}-{year}";
                        if (!await this._eventStore.StreamExists(this._streamNameMap.GetStreamName(new PackageId(streamId)), cancellationToken)) {
                            break;
                        }
                    }
                }

                if (!System.Text.RegularExpressions.Regex.IsMatch(streamId, $@"\A{System.Text.RegularExpressions.Regex.Escape(category.State.Prefix)}-[0-9]{{3,}}-[0-9]{{2}}\z")) {
                    return this.BadRequest(new ProblemDetails {
                        Title = "Package ID must match PREFIX-NNN-YY (with at least three sequence digits)."
                    });
                }

                if (await this._eventStore.StreamExists(this._streamNameMap.GetStreamName(new PackageId(streamId)), cancellationToken)) {
                    return this.Conflict(new ProblemDetails {
                        Title = "Package already exists.",
                        Detail = $"Package '{streamId}' already exists."
                    });
                }

                var references = await this._dispatcher.ExecuteAsync(() => {
                    cancellationToken.ThrowIfCancellationRequested();

                    if (request.DetailedGeometry is { } geometry) {
                        var aoi = PolygonBuilderEx.FromJson(geometry.Aoi);
                        var points = geometry.Points is null ? null : MultipointBuilderEx.FromJson(geometry.Points);
                        var curves = geometry.Curves is null ? null : PolylineBuilderEx.FromJson(geometry.Curves);
                        var surfaces = geometry.Surfaces is null ? null : PolygonBuilderEx.FromJson(geometry.Surfaces);

                        if ((points is null && curves is null && surfaces is null)
                            || points?.IsEmpty == true
                            || curves?.IsEmpty == true
                            || surfaces?.IsEmpty == true) {
                            throw new InvalidDataException("Detailed geometry must contain at least one group, and supplied groups must not be empty.");
                        }

                        return this._packageRepository.AddPackageGeometries(aoi, points, curves, surfaces, streamId, request.AbsoluteUri, cancellationToken);
                    }

                    var polygon = this._packageRepository.FromEsriJson(request.EsriJSON);
                    return (Aoi: this._packageRepository.AddPackageAOI(polygon, streamId, request.AbsoluteUri), Details: (DetailedGeometry?)null);
                });

                var filename = IO.Path.GetFileName(request.AbsoluteUri);

                // Once geometry commits, finish recording its references even if the caller disconnects.
                var cmd = await this._servicePackage.Handle(new PackagesCommands.CreatePackage(streamId, category.State.Id, filename, request.AbsoluteUri, references.Aoi, request.Severity, request.MetaData, request.DisplayScale, references.Details, request.CategoryData), CancellationToken.None);

                if (!cmd.Success) {
                    this._logger.LogError("Package command failed after geometry persistence. PackageId: {PackageId}, Aoi: {Aoi}, Details: {@Details}.", streamId, references.Aoi, references.Details);
                    return this.BadRequest();
                }

                var result = cmd.Get()!;

                this._logger.LogInformation("Created package {id}.", result.State.Id);

                return this.CreatedAtRoute(
                    "GetPackage.V1",
                    new { id = result.State.Id, version = ApiVersions.V1Text },
                    Map(result.State));
            }
            catch (InvalidDataException exception) {
                return this.BadRequest(new ProblemDetails {
                    Title = "Invalid package geometry.",
                    Detail = exception.Message
                });
            }
            finally {
                CreationGate.Release();
            }
        }

        /// <summary>Lists all packages, optionally filtered by their category identifier.</summary>
        /// <param name="category">An exact category identifier; omitted values return all categories.</param>
        /// <param name="cancellationToken">Cancels package state reads.</param>
        /// <returns>All matching packages in catalogue identifier order.</returns>
        [HttpGet]
        [ProducesResponseType<PagedResponse<PackageResponse>>(StatusCodes.Status200OK)]
        public async Task<ActionResult<PagedResponse<PackageResponse>>> GetPackages(CancellationToken cancellationToken, [FromQuery] string? category = null) {
            var packages = await this._packageRepository.GetPackagesAsync(category, cancellationToken);
            return this.Ok(new PagedResponse<PackageResponse> {
                Items = [.. packages.Select(Map)],
                Page = 1,
                PageSize = Math.Max(DefaultPageSize, packages.Count),
                TotalCount = packages.Count,
            });
        }

        [HttpGet("{id}", Name = "GetPackage.V1")]
        [Consumes("application/json")]
        [ProducesResponseType<PackageResponse>(StatusCodes.Status200OK)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<PackageResponse>> GetPackage(string id, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNullOrEmpty(id);

            try {
                var stream = await this._eventStore.LoadState<PackageState, PackageId>(this._streamNameMap, new(id), true, cancellationToken);
                return Map(stream.State);
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
                return Map(state);
            }
            catch (InvalidDataException exception) {
                this.ModelState.AddModelError(nameof(request), exception.Message);
                return this.ValidationProblem(this.ModelState);
            }
        }

        [HttpPost("repository")]
        [Consumes("multipart/form-data")]
        [ProducesResponseType<FileResponse>(StatusCodes.Status200OK)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<PackageResponse>> UploadFile([FromForm] UploadFileRequest request, CancellationToken cancellationToken) {
            if (request.File.Length == 0) {
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

            var fileRef = await this._dispatcher.ExecuteAsync(() => {
                return this._packageRepository.AddAttachment(stream, request.File.FileName, DateTime.UtcNow);
            });

            //var cmd = await this._servicePackage.Handle(new StreamCommands.AddPackage(fileid, uuid, request.File.FileName, request.File.Length), cancellationToken);

            //if (!cmd.Success)
            //    return this.BadRequest();

            return this.Ok(new FileResponse {
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
            CategoryData = state.CategoryData,
            DisplayScale = state.DisplayScale,
            LastUpdatedUtc = state.LastUpdatedUtc,
        };

        private const string _alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";

        private static string CreateStreamId() => Nanoid.Generate(_alphabet, 18);

    }
}
