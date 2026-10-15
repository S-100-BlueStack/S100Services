using DataCatalague.Api.Domain;

namespace DataCatalague.Api.Models.V1
{
    public class PackageResponse
    {
        public required string Id { get; init; }

        public required string? Category { get; init; }

        public required string FileName { get; init; }

        public required string? AbsoluteUri { get; init; }

        public PackageMetaData? MetaData { get; init; }

        public DisplayScale? DisplayScale { get; init; }

        public DateTimeOffset? CreatedUTC { get; init; } = null;

        public DateTimeOffset LastUpdatedUtc { get; init; }
    }

    public class FileResponse
    {
        public string? AbsoluteUri { get; init; }
    }
}
