using DataCatalague.Api.Domain;
using System.ComponentModel.DataAnnotations;

namespace DataCatalague.Api.Models.V1
{
    public sealed class CreateCategoryRequest
    {
        /// <summary>An optional stable category identity, such as a core package type name.</summary>
        [StringLength(200, MinimumLength = 1)]
        [RegularExpression(@"\A[a-zA-Z0-9_-]+\z")]
        public string? Id { get; init; }

        [Required]
        public required string DisplayName { get; init; }

        public required string? Description { get; init; }

        /// <summary>Unique two- or three-letter package identifier prefix.</summary>
        [Required, RegularExpression(@"\A[A-Z]{2,3}\z")]
        public required string Prefix { get; init; }
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

        /// <summary>An Esri JSON polygon encoded as a string, containing rings and a spatialReference; GeoJSON is not accepted.</summary>
        [Required]
        public required string EsriJSON { get; init; }
    }

    public sealed class BindRequest {
        [Required]
        public required string PackageId { get; init; }

        [Required]
        public required string PipelineId { get; init; }
    }
}
