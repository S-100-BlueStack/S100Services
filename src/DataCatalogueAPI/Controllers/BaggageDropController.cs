using Asp.Versioning;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Models.V1;
using Eventuous;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace DataCatalague.Api.Controllers
{
    [ApiController]
    [ApiVersion(ApiVersions.V1Text)]
    [Route("api/v{version:apiVersion}/baggagedrop")]
    [Produces("application/json")]
    public sealed class BaggageDropController(
        IEventStore eventstore,
        ICommandService<BaggageDropState> checkInCounterService,
        ICommandService<LuggageState> luggageService,
        IOptions<LuggageOptions> options,
        ILogger<BaggageDropController> logger) : ControllerBase
    {
        private const int DefaultPageSize = 20;

        readonly StreamNameMap _streamNameMap = new();

        private readonly IEventStore _eventStore = eventstore;

        private readonly ICommandService<BaggageDropState> _serviceCheckInCounter = checkInCounterService;
        private readonly ICommandService<LuggageState> _serviceLuggage = luggageService;

        private readonly IOptions<LuggageOptions> _luggageOptions = options;

        private readonly ILogger<BaggageDropController> _logger = logger;

        [HttpGet()]
        [Consumes("application/json")]
        [ProducesResponseType<LuggageResponse>(StatusCodes.Status201Created)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<LuggageResponse>> GetCheckInCounters(CancellationToken cancellationToken) {
            return this.BadRequest();
        }

        [HttpGet("{uuid:guid}", Name = "GetCheckInCounter.V1")]
        [Consumes("application/json")]
        [ProducesResponseType<LuggageResponse>(StatusCodes.Status201Created)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<LuggageResponse>> GetCheckInCounter(Guid uuid, CancellationToken cancellationToken) {
            return this.BadRequest();
        }

        [HttpPost]
        [Consumes("application/json")]
        [ProducesResponseType<CheckInCounterResponse>(StatusCodes.Status201Created)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<CheckInCounterResponse>> CreateCheckInCounter([FromBody] CreateLuggageRequest request, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNull(request);

            var displayName = request.DisplayName?.Trim();
            var description = request.Description?.Trim();

            if (string.IsNullOrEmpty(displayName)) {
                throw new ArgumentNullException(nameof(request.DisplayName));
            }

            var cmd = await this._serviceCheckInCounter.Handle(new BaggageDropCommands.CreateCheckInCounter(Guid.NewGuid(), displayName, description), cancellationToken);

            if (!cmd.Success)
                return this.BadRequest();

            var result = cmd.Get()!;

            this._logger.LogInformation("Created luggage {uuid}.", result.State.Uuid);

            return this.CreatedAtRoute(
                "GetCheckInCounter.V1",
                new { uuid = result.State.Uuid, version = ApiVersions.V1Text },
                Map(result.State));
        }



        [HttpPost("{uuid:guid}/luggage")]
        [Consumes("multipart/form-data")]
        [ProducesResponseType<LuggageResponse>(StatusCodes.Status201Created)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<LuggageResponse>> LuggageDropOffAsync(Guid uuid, [FromForm] UploadLuggageRequest request, CancellationToken cancellationToken) {
            if (request.File.Length == 0) {
                return this.Problem(
                    title: "Invalid luggage package",
                    detail: "The uploaded ZIP file is empty.",
                    statusCode: StatusCodes.Status400BadRequest);
            }

            if (!string.Equals(Path.GetExtension(request.File.FileName), ".zip", StringComparison.OrdinalIgnoreCase)) {
                return this.Problem(
                    title: "Invalid luggage package",
                    detail: "The uploaded file must be a ZIP archive.",
                    statusCode: StatusCodes.Status400BadRequest);
            }

            await using Stream stream = request.File.OpenReadStream();

            var cmd = await this._serviceLuggage.Handle(new BaggageDropCommands.DropOffLuggage(uuid, request.File.FileName, request.File.Length), cancellationToken);

            if (!cmd.Success)
                return this.BadRequest();


            throw new NotImplementedException();
            //LuggageResponse luggage = await luggageService.CreateAsync(
            //    uuid,
            //    counterid,
            //    request.File.FileName,
            //    stream,
            //    cancellationToken);

            //return this.CreatedAtRoute(
            //    "GetLuggageV1",
            //    new { uuid = result.State.Uuid, version = ApiVersions.V1Text },
            //    Map(result.State));            
        }




        private static LuggageResponse Map(Domain.BaggageDropState checkInCounter) => new() {
            Uuid = checkInCounter.Uuid,
            DisplayName = checkInCounter.DisplayName,
            Description = checkInCounter.Description,
            LastUpdatedUtc = checkInCounter.LastUpdatedUtc,
        };
    }
}
