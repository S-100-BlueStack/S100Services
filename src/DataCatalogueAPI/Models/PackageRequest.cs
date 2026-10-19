using DataCatalague.Api.Domain;
using System.ComponentModel.DataAnnotations;

namespace DataCatalague.Api.Models.V1
{
    public sealed class CreatePackageRequest
    {
        /// <summary>An optional stable source identity; omitted values receive a generated identity.</summary>
        [StringLength(200, MinimumLength = 1)]
        [RegularExpression(@"\A[a-zA-Z0-9_-]+\z")]
        public string? Id { get; init; }

        /// <summary>Complete Esri geometry groups; the AOI is recomputed after projection when supplied.</summary>
        public PackageGeometry? DetailedGeometry { get; init; }

        [Required]
        public required string Category { get; init; }

        [Required]
        public required string AbsoluteUri { get; init; }

        public ulong Severity { get; init; } = ulong.MaxValue;

        public PackageMetaData? MetaData { get; init; } = null;

        public DisplayScale? DisplayScale { get; init; } = null;

        [Required]
        public required string GeoJSON { get; init; }
    }

    public sealed class UploadFileRequest
    {
        [Required]
        public required IFormFile File { get; init; }
    }
}
