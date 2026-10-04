using DataCatalague.Api.Domain;

namespace DataCatalague.Api.Models.V1
{
    public class PackageTypeResponse
    {
        public required string Id { get; init; }

        public required string DisplayName { get; init; }

        public required string? Description { get; init; }

        public required DateTimeOffset LastUpdatedUtc { get; init; }
    }

    public class PackageResponse
    {
        public required string Id { get; init; }

        public required string? PackageTypeId { get; init; }

        public required string FileName { get; init; }

        public required string? AbsoluteUri {  get; init; }        

        public DateTimeOffset LastUpdatedUtc { get; init; }
    }

    public class FileResponse {
        public string? AbsoluteUri { get; init; }
    }
}
