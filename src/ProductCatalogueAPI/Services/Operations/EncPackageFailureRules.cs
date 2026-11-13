using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Services.Operations;

/// <summary>Failure retirement rules shared by action discovery and the transaction's final eligibility check.</summary>
public static class EncPackageFailureRules
{
    /// <summary>Legacy persisted send-failure marker retained for matching existing packages; it does not grant acknowledgement.</summary>
    public const string SendFailureMessage = "The package send failed. Review the failure, then acknowledge it before continuing.";

    /// <summary>History marker for a retired candidate and its exclusive per-source detection cutoff.</summary>
    public const string HistoryCode = "ENC_PACKAGE_ACKNOWLEDGED";

    /// <summary>Whether an IC-ENC rejection permits retiring the pair without interrupting active builds.</summary>
    /// <param name="package">Exact current shared snapshot.</param>
    /// <param name="s101">Current source track.</param>
    /// <param name="s57">Current mapped S-57 track.</param>
    /// <returns>True only when a current candidate is rejected and both members can be retired safely.</returns>
    public static bool CanAcknowledge(EncPackage package, ProductExportTrackRecord? s101, ProductExportTrackRecord? s57) =>
        s101 is not null && s57 is not null &&
        s101.ProductSpecification == ProductSpecification.S101 && s57.ProductSpecification == ProductSpecification.S57 &&
        string.Equals(s101.DatasetName, package.SourceDatasetName, StringComparison.OrdinalIgnoreCase) &&
        string.Equals(s57.DatasetName, package.S57DatasetName, StringComparison.OrdinalIgnoreCase) &&
        IsRetirable(s101) && IsRetirable(s57) &&
        (s101.State == ProductState.Rejected || s57.State == ProductState.Rejected);

    /// <summary>Creates a stable receipt reference while retaining the operator in the history owner field.</summary>
    /// <param name="packageId">Exact failed snapshot whose receipt must survive deletion.</param>
    /// <returns>Stable reference stored with the retired candidate event.</returns>
    public static string Receipt(Guid packageId) => $"Acknowledged failed ENC package {packageId:D}.";

    /// <summary>A healthy in-transit member may be retired only because another member was rejected by IC-ENC.</summary>
    private static bool IsRetirable(ProductExportTrackRecord track) => !track.IsManuallyFrozen && track.State is
        ProductState.Idle or ProductState.ChangesDetected or ProductState.Exported or ProductState.ReadyForDistribution or
        ProductState.InTransit or ProductState.AcceptedForDistribution or ProductState.Rejected or ProductState.Error;
}
