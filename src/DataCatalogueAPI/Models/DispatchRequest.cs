using System.ComponentModel.DataAnnotations;

namespace DataCatalague.Api.Models.V1
{
    public sealed class CreatePackageTypeRequest
    {
        [Required]
        public required string DisplayName { get; init; }

        public required string? Description { get; init; }
    }

    public sealed class UpdatePackageTypeSpecificationRequest
    {
        [Required]
        public required string Version { get; init; }

        [Required]
        public required string Markdown { get; init; }
    }

    public sealed class CreatePackageRequest
    {
        [Required]
        public required string PackageTypeId { get; init; }

        [Required]
        public required string AbsoluteUri { get; init; }

        [Required]
        public required string GeoJSON { get; init; }
    }

    public sealed class UploadFileRequest
    {
        [Required]
        public required IFormFile File { get; init; }
    }
}
