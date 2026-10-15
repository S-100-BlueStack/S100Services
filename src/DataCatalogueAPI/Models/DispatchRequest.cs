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
    
    public sealed class AddSeverityAreaRequest
    {
        [Required]
        public required ulong Severity { get; init; } = ulong.MaxValue;

        [Required]
        public required string GeoJSON { get; init; }
    }
}
