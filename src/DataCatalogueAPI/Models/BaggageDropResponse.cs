namespace DataCatalague.Api.Models.V1
{
    public class CheckInCounterResponse {

    }

    public class LuggageResponse
    {
        public required Guid Uuid { get; init; }

        public required string DisplayName { get; init; }

        public required string? Description { get; init; }

        public required DateTimeOffset LastUpdatedUtc { get; init; }
    }
}
