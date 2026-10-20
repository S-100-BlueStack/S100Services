using DataCatalague.Api.Domain;
using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace DataCatalague.Api.Models.V1
{
    public sealed class CreatePackageRequest
    {
        /// <summary>An optional catalogue identity in PREFIX-NNN-YY format; omitted values receive a generated yearly identity. Source identities belong in MetaData.RefId.</summary>
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

        /// <summary>Category-specific data, whose schema is defined by the category.</summary>
        public JsonElement? CategoryData { get; init; }

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
