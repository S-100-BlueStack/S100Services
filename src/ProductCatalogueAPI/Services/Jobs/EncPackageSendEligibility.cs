using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Services.Jobs;

/// <summary>Package send is a paired operation; neither a valid sibling nor a simulation flag overrides a blocked candidate.</summary>
public static class EncPackageSendEligibility
{
    /// <summary>Requires the active, unpaused, error-free S-101/S-57 pair and complete candidate versions.</summary>
    /// <param name="package">Shared snapshot owning both exports.</param>
    /// <param name="s101">Current S-101 track.</param>
    /// <param name="s57">Current S-57 track.</param>
    /// <returns>True only when both members can enter their first send together.</returns>
    public static bool CanSend(EncPackage package, ProductExportTrackRecord? s101, ProductExportTrackRecord? s57) =>
        !package.IsPaused && !package.S101Discarded && !package.S57Discarded && string.IsNullOrWhiteSpace(package.ErrorMessage) &&
        IsReady(s101, ProductSpecification.S101, package.SourceDatasetName) && IsReady(s57, ProductSpecification.S57, package.S57DatasetName);

    /// <summary>Checks exact member identity as well as readiness; stale error metadata remains a send blocker.</summary>
    private static bool IsReady(ProductExportTrackRecord? track, ProductSpecification specification, string name) =>
        track is not null && track.ProductSpecification == specification && string.Equals(track.DatasetName, name, StringComparison.OrdinalIgnoreCase) &&
        track.State == ProductState.ReadyForDistribution && !track.IsManuallyFrozen &&
        track.CandidateEdition is >= 0 && track.CandidateUpdate is >= 0 and <= 999 &&
        string.IsNullOrWhiteSpace(track.ErrorCode) && string.IsNullOrWhiteSpace(track.ErrorMessage);
}
