using DataCatalague.Api.Domain;

namespace DataCatalague.Api.Models.V1
{
    public class CategoryResponse
    {
        public required string Id { get; init; }

        public required string DisplayName { get; init; }

        public required string Prefix { get; init; }

        public required string? Description { get; init; }

        public string? Version { get; init; }

        public string? Specification { get; init; }

        public required DateTimeOffset LastUpdatedUtc { get; init; }
    }    

    public sealed class SeverityResponse
    {
        public required string GeometryRef { get; init; }
    }

    public sealed class BindingResponse {
        /// <summary>Workspaces intersecting the package rectangular AOI within this binding's pipeline.</summary>
        public IReadOnlyList<WorkspaceResponse> Workspaces { get; init; } = [];

        public required string Id { get; init; }

        public required string PackageId { get; init; }

        public required string? PipelineId { get; init; }

        public required DateTimeOffset LastUpdatedUtc { get; init; }

    }
}
