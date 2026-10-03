using Asp.Versioning;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Models.V1;
using Eventuous;
using Microsoft.AspNetCore.Mvc;

namespace DataCatalague.Api.Controllers
{
    [ApiController]
    [ApiVersion(ApiVersions.V1Text)]
    [Route("api/v{version:apiVersion}/luggages")]
    [Produces("application/json")]
    public sealed class LuggageController(IEventStore eventstore, ICommandService<LuggageState> service, ILogger<LuggageController> logger) : ControllerBase
    {
        private const int DefaultPageSize = 20;

        readonly StreamNameMap _streamNameMap = new();

        private readonly IEventStore _eventStore = eventstore;

        private readonly ICommandService<LuggageState> _service = service;

        private readonly ILogger<LuggageController> _logger = logger;

        [HttpGet("{uuid:guid}", Name = "GetLuggageV1")]
        [ProducesResponseType<LuggageResponse>(StatusCodes.Status200OK)]
        [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<LuggageResponse>> GetLuggage(Guid uuid, CancellationToken cancellationToken) {
            try {
                var Luggage = await this._eventStore.LoadState<LuggageState, LuggageId>(_streamNameMap, uuid.ToLuggageId(), cancellationToken: cancellationToken);

                return this.Ok(Map(Luggage.State));
            }
            catch {
                this._logger.LogInformation("Luggage {uuid} was not found.", uuid);

                return this.Problem(
                    title: "Luggage not found.",
                    detail: $"No luggage exists with identifier {uuid}.",
                    statusCode: StatusCodes.Status404NotFound);
            }
        }

        [HttpPost]
        [Consumes("application/json")]
        [ProducesResponseType<LuggageResponse>(StatusCodes.Status201Created)]
        [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
        public async Task<ActionResult<LuggageState>> Create([FromBody] CreateLuggageRequest request, CancellationToken cancellationToken) {
            ArgumentNullException.ThrowIfNull(request);

            var displayName = request.DisplayName?.Trim();
            var description = request.Description?.Trim();

            if (string.IsNullOrEmpty(displayName)) {
                throw new ArgumentNullException(nameof(request.DisplayName));
            }

            var cmd = await _service.Handle(new LuggageCommands.Create(Guid.NewGuid(), displayName, description), cancellationToken);

            if (!cmd.Success)
                return this.BadRequest();

            var result = cmd.Get()!;

            this._logger.LogInformation("Created luggage {uuid}.", result.State.Uuid);

            var route = this.CreatedAtRoute(
                "GetLuggageV1",
                new { uuid = result.State.Uuid, version = ApiVersions.V1Text },
                Map(result.State));

            return route;
        }

        private static LuggageResponse Map(Domain.LuggageState luggage) => new() {
            Uuid = luggage.Uuid,
            DisplayName = luggage.DisplayName,
            Description = luggage.Description,
            LastUpdatedUtc = luggage.LastUpdatedUtc,
        };
    }
}
