using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Services.Operations;

/// <summary>Failure retirement rules shared by action discovery and the transaction's final eligibility check.</summary>
public static class EncPackageFailureRules
{
    /// <summary>Stable safe send-failure presentation, also distinguishing a send failure from a rebuildable compiler failure.</summary>
    public const string SendFailureMessage = "The package send failed. Review the failure, then acknowledge it before continuing.";

    /// <summary>History marker for a retired candidate and its exclusive per-source detection cutoff.</summary>
    public const string HistoryCode = "ENC_PACKAGE_ACKNOWLEDGED";

    /// <summary>Whether an error may retire the pair without interrupting active builds or successful publication.</summary>
    /// <param name="package">Exact current shared snapshot.</param>
    /// <param name="s101">Current source track.</param>
    /// <param name="s57">Current mapped S-57 track.</param>
    /// <returns>True for a failed pair, including an accepted or in-transit sibling; false for healthy pending delivery.</returns>
    public static bool CanAcknowledge(EncPackage package, ProductExportTrackRecord? s101, ProductExportTrackRecord? s57) =>
        s101 is not null && s57 is not null &&
        s101.ProductSpecification == ProductSpecification.S101 && s57.ProductSpecification == ProductSpecification.S57 &&
        string.Equals(s101.DatasetName, package.SourceDatasetName, StringComparison.OrdinalIgnoreCase) &&
        string.Equals(s57.DatasetName, package.S57DatasetName, StringComparison.OrdinalIgnoreCase) &&
        IsRetirable(s101) && IsRetirable(s57) &&
        !(s101.State == ProductState.AcceptedForDistribution && s57.State == ProductState.AcceptedForDistribution) &&
        (!string.IsNullOrWhiteSpace(package.ErrorMessage) || IsFailed(s101) || IsFailed(s57));

    /// <summary>Creates a stable receipt reference while retaining the operator in the history owner field.</summary>
    /// <param name="packageId">Exact failed snapshot whose receipt must survive deletion.</param>
    /// <returns>Stable reference stored with the retired candidate event.</returns>
    public static string Receipt(Guid packageId) => $"Acknowledged failed ENC package {packageId:D}.";

    /// <summary>A healthy in-transit member may be retired only because another member or the package failed.</summary>
    private static bool IsRetirable(ProductExportTrackRecord track) => !track.IsManuallyFrozen && track.State is
        ProductState.Idle or ProductState.ChangesDetected or ProductState.Exported or ProductState.ReadyForDistribution or
        ProductState.InTransit or ProductState.AcceptedForDistribution or ProductState.Rejected or ProductState.Error;

    /// <summary>Explicit failure evidence is required; elapsed time alone never grants acknowledgement.</summary>
    private static bool IsFailed(ProductExportTrackRecord track) => track.State is ProductState.Error or ProductState.Rejected ||
        !string.IsNullOrWhiteSpace(track.ErrorCode) || !string.IsNullOrWhiteSpace(track.ErrorMessage);
}
