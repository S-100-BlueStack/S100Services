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
        IOptions<PackagesOptions> options,
        ArcGisDispatcher dispatcher,
        ILogger<PackageController> logger) : ControllerBase
    {
        private const int DefaultPageSize = 20;

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
        public async Task<ActionResult<PackageResponse>> CreatePackage([FromBody] CreatePackageRequest request, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNull(request);

            ArgumentNullException.ThrowIfNullOrEmpty(request.Category);
            ArgumentNullException.ThrowIfNullOrEmpty(request.AbsoluteUri);
            ArgumentNullException.ThrowIfNullOrEmpty(request.GeoJSON);

            try {
                var category = await this._eventStore.LoadState<CategoryState>(new(request.Category), true, cancellationToken);
                if (category.State.IsTerminated)
                    return this.BadRequest();

                var streamId = CreateStreamId();

                var geometryRef = await this._dispatcher.ExecuteAsync(() => {
                    var polygon = this._packageRepository.FromGeoJson(request.GeoJSON);

                    return this._packageRepository.AddPackageAOI(polygon, streamId, request.AbsoluteUri);
                });

                var filename = IO.Path.GetFileName(request.AbsoluteUri);

                var cmd = await this._servicePackage.Handle(new PackagesCommands.CreatePackage(streamId, category.State.Id, filename, request.AbsoluteUri, geometryRef, request.Severity, request.MetaData, request.DisplayScale), cancellationToken);

                if (!cmd.Success)
                    return this.BadRequest();

                var result = cmd.Get()!;

                this._logger.LogInformation("Created package {id}.", result.State.Id);

                return this.CreatedAtRoute(
                    "GetPackage.V1",
                    new { id = result.State.Id, version = ApiVersions.V1Text },
                    Map(result.State));
            }
            catch (StreamNotFound) {
                return this.BadRequest();
            }
        }

        [HttpGet("{id}", Name = "GetPackage.V1")]
        [Consumes("application/json")]
        [ProducesResponseType<PackageResponse>(StatusCodes.Status200OK)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<PackageResponse>> GetPackage(string id, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNullOrEmpty(id);

            try {
                var stream = await this._eventStore.LoadState<PackageState>(new(id), true, cancellationToken);
                return Map(stream.State);
            }
            catch {
                this._logger.LogInformation("Package {id} was not found.", id);

                return this.Problem(
                    title: "Package not found.",
                    detail: $"No package exists with identifier {id}.",
                    statusCode: StatusCodes.Status404NotFound);
            }
        }

        [HttpPut("{id}/geometry")]
        [Consumes("application/json")]
        [ProducesResponseType<PackageResponse>(StatusCodes.Status200OK)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<PackageResponse>> AddGeometry(string id, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNullOrEmpty(id);

            try {
                var stream = await this._eventStore.LoadState<PackageState>(new(id), true, cancellationToken);

                throw new NotImplementedException();

                return Map(stream.State);
            }
            catch {
                this._logger.LogInformation("Package {id} was not found.", id);

                return this.Problem(
                    title: "Package not found.",
                    detail: $"No package exists with identifier {id}.",
                    statusCode: StatusCodes.Status404NotFound);
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
            MetaData = state.MetaData,
            DisplayScale = state.DisplayScale,
            LastUpdatedUtc = state.LastUpdatedUtc,
        };

        private const string _alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";

        private static string CreateStreamId() => Nanoid.Generate(_alphabet, 18);

    }
}
