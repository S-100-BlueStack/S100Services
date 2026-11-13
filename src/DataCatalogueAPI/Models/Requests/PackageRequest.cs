using DataCatalague.Api.Domain;
using System.ComponentModel.DataAnnotations;

namespace DataCatalague.Api.Models.V1
{
    public sealed class CreatePackageRequest : IValidatableObject
    {
        /// <summary>Reads the uploaded ZIP referenced by AbsoluteUri. Supported for MarineAggregateExtraction and WorkZone; omit all derived metadata and geometry.</summary>
        public bool ImportFromArchive { get; init; }

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

        /// <summary>An Esri JSON polygon string with rings and spatialReference. Required unless ImportFromArchive is true.</summary>
        public string? EsriJSON { get; init; }

        /// <summary>Requires one authoritative geometry/metadata source for each creation mode.</summary>
        /// <param name="validationContext">The request validation context.</param>
        /// <returns>Contract violations for MVC and direct controller/service callers.</returns>
        public IEnumerable<ValidationResult> Validate(ValidationContext validationContext) {
            if (!this.ImportFromArchive) {
                if (string.IsNullOrWhiteSpace(this.EsriJSON)) {
                    yield return new ValidationResult("EsriJSON is required unless importFromArchive is true.", [nameof(this.EsriJSON)]);
                }
                yield break;
            }
            if (this.Category is not ("MarineAggregateExtraction" or "WorkZone")) {
                yield return new ValidationResult("Archive import is supported for MarineAggregateExtraction and WorkZone.", [nameof(this.Category)]);
            }
            // System.Uri normalizes a bare database://UUID authority to a root path.
            if (!Uri.TryCreate(this.AbsoluteUri, UriKind.Absolute, out var uri) || uri.Scheme != "database"
                || !Guid.TryParse(uri.Host, out var id) || id == Guid.Empty
                || uri.AbsolutePath is not ("" or "/") || uri.Query.Length != 0 || uri.Fragment.Length != 0 || uri.UserInfo.Length != 0 || !uri.IsDefaultPort) {
                yield return new ValidationResult("Archive import requires an upload-issued database://UUID URI.", [nameof(this.AbsoluteUri)]);
            }
            if (this.EsriJSON is not null || this.DetailedGeometry is not null || this.MetaData is not null || this.Descriptions is not null || this.Charts is not null) {
                yield return new ValidationResult("Do not supply geometry, metadata, descriptions or charts when importing their values from an archive.", [nameof(this.ImportFromArchive)]);
            }
        }
    }

    public sealed class UploadFileRequest
    {
        [Required]
        public required IFormFile File { get; init; }
    }
}
