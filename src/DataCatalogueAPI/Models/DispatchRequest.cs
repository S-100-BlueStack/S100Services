using DataCatalague.Api.Domain;
using System.ComponentModel.DataAnnotations;

namespace DataCatalague.Api.Models.V1
{
    public sealed class CreateCategoryRequest
    {
        [Required]
        public required string DisplayName { get; init; }

        public required string? Description { get; init; }
    }

    public sealed class UpdateCategorySpecificationRequest
    {
        [Required]
        public required string Version { get; init; }

        [Required]
        public required string Markdown { get; init; }
    }

    public sealed class CreatePackageRequest
    {
        [Required]
        public required string Category { get; init; }

        [Required]
        public required string AbsoluteUri { get; init; }

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
