namespace DataCatalague.Api.Models.V1
{
    public sealed class PipelineResponse
    {
        public required string Id { get; init; }

        public required string DisplayName { get; init; }

        public required string? Description { get; init; }

        public required DateTimeOffset LastUpdatedUtc { get; init; }
    }
}
