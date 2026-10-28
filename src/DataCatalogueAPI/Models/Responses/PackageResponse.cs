using DataCatalague.Api.Domain;

namespace DataCatalague.Api.Models.V1
{
    public class PackageResponse
    {
        public required string Id { get; init; }

        public required string? Category { get; init; }

        public required string FileName { get; init; }

        public required string? AbsoluteUri { get; init; }

        /// <summary>The rectangular package AOI reference.</summary>
        public GeometryReferenceResponse? GeometryRef { get; init; }

        /// <summary>References to the full point, curve and surface geometries.</summary>
        public DetailedGeometryResponse? DetailedGeometry { get; init; }

        /// <summary>The severity from the latest severity event.</summary>
        public ulong? Severity { get; init; }

        public PackageMetaData? MetaData { get; init; }

        /// <summary>Source description entries with optional part index/language and unchanged HTML.</summary>
        public PackageDescription[]? Descriptions { get; init; }

        /// <summary>Related chart numbers; null when no chart information is supplied.</summary>
        public PackageChart[]? Charts { get; init; }

        public DisplayScale? DisplayScale { get; init; }

        public DateTimeOffset? CreatedUTC { get; init; } = null;

        public DateTimeOffset LastUpdatedUtc { get; init; }
    }

    public class FileResponse
    {
        public string? AbsoluteUri { get; init; }
    }
}
