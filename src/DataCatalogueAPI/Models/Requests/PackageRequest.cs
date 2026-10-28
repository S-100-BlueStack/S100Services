using DataCatalague.Api.Domain;
using System.ComponentModel.DataAnnotations;

namespace DataCatalague.Api.Models.V1
{
    public sealed class CreatePackageRequest
    {
        /// <summary>Complete Esri geometry groups; the AOI is recomputed after projection when supplied.</summary>
        public PackageGeometry? DetailedGeometry { get; init; }

        [Required]
        public required string Category { get; init; }

        [Required]
        public required string AbsoluteUri { get; init; }

        public ulong Severity { get; init; } = ulong.MaxValue;

        public PackageMetaData? MetaData { get; init; } = null;

        /// <summary>Source description entries with optional part index/language and unchanged HTML.</summary>
        public PackageDescription[]? Descriptions { get; init; }

        /// <summary>Related chart numbers; null when no chart information is supplied.</summary>
        public PackageChart[]? Charts { get; init; }

        public DisplayScale? DisplayScale { get; init; } = null;

        /// <summary>An Esri JSON polygon encoded as a string, containing rings and a spatialReference; GeoJSON is not accepted.</summary>
        [Required]
        public required string EsriJSON { get; init; }
    }

    public sealed class UploadFileRequest
    {
        [Required]
        public required IFormFile File { get; init; }
    }
}
