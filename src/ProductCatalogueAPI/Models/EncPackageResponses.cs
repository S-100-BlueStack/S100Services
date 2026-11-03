using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Models;

/// <summary>Summarizes the state shared by the two exports of one ENC AOI.</summary>
public enum EncPackageStatus
{
    /// <summary>No candidate exists.</summary> 
    Idle,

    /// <summary>At least one candidate is being built or validated.</summary> 
    Building,

    /// <summary>Both required candidates are ready.</summary>
    Ready,

    /// <summary>At least one candidate is awaiting IC-ENC.</summary> 
    InTransit,

    /// <summary>A candidate failed or was rejected and must be acknowledged.</summary> 
    Error,

    /// <summary>One of the products has an operator hold.</summary> 
    Held,

    /// <summary>Both required candidates have been accepted for distribution.</summary>
    Accepted,

    /// <summary>Both required candidates have been published.</summary>
    Published
}

/// <summary>Exposes public and candidate versions separately for one mapped product.</summary>
/// <param name="IssueDate">The issue date of the current product in the S-128 catalogue.</param>
public sealed record EncPackageProductResponse(string DatasetName, ProductSpecification ProductSpecification, int CurrentEdition, int CurrentUpdate, DateOnly? IssueDate, int? CandidateEdition, int? CandidateUpdate, ProductState Status, bool Held, bool Discarded, string? ErrorMessage);

/// <summary>Exposes one S-101 AOI with its shared package and two independent export tracks.</summary>
public sealed record EncPackageResponse(PackageLayer Layer, string SourceDatasetName, int? UsageBand, int? DisplayScale, DateTime? DetectedAtUtc, EncPackageStatus Status, string? ErrorMessage, EncPackageProductResponse S57, EncPackageProductResponse S101)
{
    /// <summary>True only when an active EncPackage exists; never inferred from member track states.</summary>
    public bool HasActivePackage { get; init; }
}

/// <summary>Computes a package status from both tracks so send and acceptance changes are visible immediately.</summary>
public static class EncPackageStatusResolver
{
    /// <summary>Prioritizes failures and holds; successful package states require agreement by both required candidates.</summary>
    /// <param name="package">The active paired snapshot, if one exists.</param>
    /// <param name="s57">The S-57 workflow track.</param>
    /// <param name="s101">The S-101 workflow track.</param>
    /// <returns>The aggregate status, independent of member edition and update numbers.</returns>
    public static EncPackageStatus Resolve(EncPackage? package, ProductExportTrackRecord? s57, ProductExportTrackRecord? s101) {
        if (!string.IsNullOrWhiteSpace(package?.ErrorMessage) || IsError(s57, package?.S57Discarded == true) || IsError(s101, package?.S101Discarded == true) ||
            IsUncertain(s57) || IsUncertain(s101))
            return EncPackageStatus.Error;
        if (package is null)
            return IsHeld(s57) || IsHeld(s101) ? EncPackageStatus.Held : EncPackageStatus.Idle;
        if (s57 is null || s101 is null || package.S57Discarded || package.S101Discarded)
            return EncPackageStatus.Error;
        if (IsHeld(s57) || IsHeld(s101))
            return EncPackageStatus.Held;
        if (s57.State == s101.State) {
            switch (s57.State) {
                case ProductState.ReadyForDistribution: return EncPackageStatus.Ready;
                case ProductState.AcceptedForDistribution: return EncPackageStatus.Accepted;
                case ProductState.Published: return EncPackageStatus.Published;
            }
        }
        if (s57.State == ProductState.InTransit || s101.State == ProductState.InTransit)
            return EncPackageStatus.InTransit;
        if (IsBuilding(s57) || IsBuilding(s101))
            return EncPackageStatus.Building;
        return EncPackageStatus.Error;
    }

    /// <summary>Shows the failed product's diagnostic even when the package row has no error text.</summary>
    public static string? GetErrorMessage(EncPackage? package, ProductExportTrackRecord? s57, ProductExportTrackRecord? s101) {
        if (IsUncertain(s101) || IsUncertain(s57))
            return "IC-ENC delivery could not be confirmed. Verify the receiver's intake and reconcile the delivery before continuing.";
        if (IsError(s101, package?.S101Discarded == true) && !string.IsNullOrWhiteSpace(s101?.ErrorMessage))
            return PublicExportError.For(s101);
        if (IsError(s57, package?.S57Discarded == true) && !string.IsNullOrWhiteSpace(s57?.ErrorMessage))
            return PublicExportError.For(s57);
        if (!string.IsNullOrWhiteSpace(package?.ErrorMessage))
            return PublicExportError.GenericMessage;
        if (IsError(s101, package?.S101Discarded == true))
            return PublicExportError.GenericMessage;
        if (IsError(s57, package?.S57Discarded == true))
            return PublicExportError.GenericMessage;
        if (package is not null && (s57 is null || s101 is null || package.S57Discarded || package.S101Discarded))
            return "The ENC package does not contain both required export candidates.";
        if (Resolve(package, s57, s101) == EncPackageStatus.Error)
            return "The ENC export candidates are in inconsistent states.";
        return null;
    }

    /// <summary>Identifies queued or active candidate work without implying that either member succeeded.</summary>
    /// <param name="track">The existing member track.</param>
    /// <returns>Whether the member still has queued or running build work.</returns>
    private static bool IsBuilding(ProductExportTrackRecord track) => track.State is ProductState.ChangesDetected or ProductState.Exporting or ProductState.Validating;

    private static bool IsError(ProductExportTrackRecord? track, bool discarded) => !discarded && track is { State: ProductState.Error or ProductState.Rejected };
    private static bool IsUncertain(ProductExportTrackRecord? track) => track?.ErrorCode == "IC_ENC_DELIVERY_UNCERTAIN" && track.State == ProductState.InTransit;
    private static bool IsHeld(ProductExportTrackRecord? track) => track?.IsManuallyFrozen == true || track?.State == ProductState.Frozen;
}
