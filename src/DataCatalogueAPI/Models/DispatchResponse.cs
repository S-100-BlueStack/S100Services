using DataCatalague.Api.Domain;

namespace DataCatalague.Api.Models.V1
{
    public class CategoryResponse
    {
        public required string Id { get; init; }

        public required string DisplayName { get; init; }

        public required string? Description { get; init; }
        
        public string? Version { get; init; }
        
        public string? Specification { get; init; }

        public required DateTimeOffset LastUpdatedUtc { get; init; }
    }

    public class PackageResponse
    {
        public required string Id { get; init; }

        public required string? Category { get; init; }

        public required string FileName { get; init; }

        public required string? AbsoluteUri {  get; init; }

        public string? ShortId { get; init; } = null;

        public string? Type { get; init; } = null;

        public long? Number { get; init; } = null;

        public string? Title { get; init; } = null;

        public string? Source { get; init; } = null;

        public string? RefId { get; init; } = null;

        public DateTimeOffset? CreatedUTC { get; init; } = null;

        public DateTimeOffset LastUpdatedUtc { get; init; }
    }

    public class FileResponse {
        public string? AbsoluteUri { get; init; }
    }
}
