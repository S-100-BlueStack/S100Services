using ProductCatalogueAPI.Options;

namespace ProductCatalogueAPI.Jobs
{
    public sealed record SendToIcEncJobRequest(
        string DatasetName,
        SendToIcEncMode Mode,
        int ExpectedEdition,
        int ExpectedUpdate,
        string CorrelationId,
        DateTimeOffset CreatedAtUtc,
        bool AllowSevenCsValidationFailure = false,
        string? ProductSpecification = null
    ) {
        /// <summary>Expected shared package snapshot; reservations reject replacements even when version numbers repeat.</summary>
        public Guid? PackageId { get; init; }
        /// <summary>Exact immutable revision expected by package sends; rejects rebuilds reusing the same version.</summary>
        public Guid? ExpectedRevisionId { get; init; }
    }
}
