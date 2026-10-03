using Asp.Versioning;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Services;
using Eventuous;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace DataCatalague.Api.Controllers
{
    [ApiController]
    [ApiVersion(ApiVersions.V1Text)]
    [Route("api/v{version:apiVersion}/luggages")]
    [Produces("application/json")]
    public sealed class LuggageController(
        IEventStore eventstore, 
        ICommandService<CheckInCounterState> checkInCounterService, 
        ICommandService<LuggageState> luggageService,
        IOptions<LuggageOptions> options, 
        ILogger<LuggageController> logger) : ControllerBase
    {
        private const int DefaultPageSize = 20;

        readonly StreamNameMap _streamNameMap = new();

        private readonly IEventStore _eventStore = eventstore;

        private readonly ICommandService<CheckInCounterState> _serviceCheckInCounter = checkInCounterService;
        private readonly ICommandService<LuggageState> _serviceLuggage = luggageService;

        private readonly IOptions<LuggageOptions> _luggageOptions = options;

        private readonly ILogger<LuggageController> _logger = logger;

        //[HttpGet("{uuid:guid}", Name = "GetLuggageV1")]
        //[ProducesResponseType<LuggageResponse>(StatusCodes.Status200OK)]
        //[ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        //public async Task<ActionResult<LuggageResponse>> GetLuggage(Guid uuid, CancellationToken cancellationToken) {
        //    try {
        //        var Luggage = await this._eventStore.LoadState<LuggageState, LuggageId>(_streamNameMap, uuid.ToLuggageId(), cancellationToken: cancellationToken);

        //        return this.Ok(Map(Luggage.State));
        //    }
        //    catch {
        //        this._logger.LogInformation("Luggage {uuid} was not found.", uuid);

        //        return this.Problem(
        //            title: "Luggage not found.",
        //            detail: $"No luggage exists with identifier {uuid}.",
        //            statusCode: StatusCodes.Status404NotFound);
        //    }
        //}

        [HttpPost]
        [Consumes("application/json")]
        [ProducesResponseType<LuggageResponse>(StatusCodes.Status201Created)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<LuggageResponse>> CreateCheckInCounter([FromBody] CreateLuggageRequest request, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNull(request);

            var displayName = request.DisplayName?.Trim();
            var description = request.Description?.Trim();

            if (string.IsNullOrEmpty(displayName)) {
                throw new ArgumentNullException(nameof(request.DisplayName));
            }

            var cmd = await _serviceCheckInCounter.Handle(new LuggageCommands.CreateCheckInCounter(Guid.NewGuid(), displayName, description), cancellationToken);

            if (!cmd.Success)
                return this.BadRequest();

            var result = cmd.Get()!;

            this._logger.LogInformation("Created luggage {uuid}.", result.State.Uuid);

            return this.CreatedAtRoute(
                "GetLuggageV1",
                new { uuid = result.State.Uuid, version = ApiVersions.V1Text },
                Map(result.State));
        }






        [HttpGet("{uuid:guid}/checkincounter")]
        [Consumes("application/json")]
        [ProducesResponseType<LuggageResponse>(StatusCodes.Status201Created)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]

        public async Task<ActionResult<LuggageResponse>> GetCheckInCounter(CancellationToken cancellationToken) {
            return this.BadRequest();
        }

        [HttpGet("{uuid:guid}/checkincounter/{counterid:guid}")]
        [Consumes("application/json")]
        [ProducesResponseType<LuggageResponse>(StatusCodes.Status201Created)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<LuggageResponse>> GetCheckInCounter(Guid uuid, Guid counterid, CancellationToken cancellationToken) {
            return this.BadRequest();
        }


        [HttpPost("checkincounter/{uuid:guid}")]
        [Consumes("multipart/form-data")]
        [ProducesResponseType<LuggageResponse>(StatusCodes.Status201Created)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<LuggageResponse>> CheckInLuggageAsync(Guid uuid, [FromForm] UploadLuggageRequest request, CancellationToken cancellationToken) {
            if (request.File.Length == 0) {
                return this.Problem(
                    title: "Invalid luggage package",
                    detail: "The uploaded ZIP file is empty.",
                    statusCode: StatusCodes.Status400BadRequest);
            }

            if (!string.Equals(Path.GetExtension(request.File.FileName), ".zip", StringComparison.OrdinalIgnoreCase)) {
                return Problem(
                    title: "Invalid luggage package",
                    detail: "The uploaded file must be a ZIP archive.",
                    statusCode: StatusCodes.Status400BadRequest);
            }

            await using Stream stream = request.File.OpenReadStream();

            var cmd = await _serviceLuggage.Handle(new LuggageCommands.CheckInLuggage(uuid, request.File.FileName, request.File.Length), cancellationToken);

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




        private static LuggageResponse Map(Domain.CheckInCounterState checkInCounter) => new() {
            Uuid = checkInCounter.Uuid,
            DisplayName = checkInCounter.DisplayName,
            Description = checkInCounter.Description,
            LastUpdatedUtc = checkInCounter.LastUpdatedUtc,
        };
    }
}
