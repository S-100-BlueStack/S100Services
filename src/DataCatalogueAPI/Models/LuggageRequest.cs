using System.ComponentModel.DataAnnotations;

namespace DataCatalague.Api.Models.V1
{
    public sealed class CreateLuggageRequest
    {
        [Required]
        public required string DisplayName { get; init; }

        public required string? Description { get; init; }
    }

    public sealed class UploadLuggageRequest
    {
        [Required]
        public required IFormFile File { get; init; }
    }
}
