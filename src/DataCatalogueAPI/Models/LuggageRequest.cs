namespace DataCatalague.Api.Models.V1
{
    public sealed class CreateLuggageRequest
    {
        public required string DisplayName { get; init; }

        public required string Description { get; init; }
    }
}
