using DataCatalague.Api.Domain;

namespace DataCatalague.Api.Models.V1
{
    public sealed class CreatePipelineRequest
    {
        public required string DisplayName { get; init; }

        public required string Description { get; init; }
    }

    public sealed class AddWorkspaceRequest
    {
        public required string GeoJSON { get; init; }

        public required string DisplayName { get; init; }

        public required DisplayScale DisplayScale { get; init; }
    }
}
