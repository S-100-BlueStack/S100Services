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
        /// <summary>An Esri JSON polygon encoded as a string, containing rings and a spatialReference; GeoJSON is not accepted.</summary>
        public required string EsriJSON { get; init; }

        public required string DisplayName { get; init; }

        public required DisplayScale DisplayScale { get; init; }
    }
}
