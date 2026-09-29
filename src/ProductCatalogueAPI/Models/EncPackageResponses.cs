using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Models;

/// <summary>Summarizes the state shared by the two exports of one ENC AOI.</summary>
public enum EncPackageStatus
{
    /// <summary>No candidate exists.</summary> 
    Idle,

    /// <summary>At least one candidate is being built or validated.</summary> 
    Building,

    /// <summary>Both non-discarded candidates are ready.</summary> 
    Ready,

    /// <summary>At least one candidate is awaiting IC-ENC.</summary> 
    InTransit,

    /// <summary>A candidate failed or was rejected and must be acknowledged.</summary> 
    Error,

    /// <summary>One of the products has an operator hold.</summary> 
    Held
}

/// <summary>Exposes public and candidate versions separately for one mapped product.</summary>
public sealed record EncPackageProductResponse(string DatasetName, ProductSpecification ProductSpecification, int CurrentEdition, int CurrentUpdate, int? CandidateEdition, int? CandidateUpdate, ProductState Status, bool Held, bool Discarded, string? ErrorMessage);

/// <summary>Exposes one S-101 AOI with its shared package and two independent export tracks.</summary>
public sealed record EncPackageResponse(PackageLayer Layer, string SourceDatasetName, int? UsageBand, int? DisplayScale, DateTime? DetectedAtUtc, EncPackageStatus Status, string? ErrorMessage, EncPackageProductResponse S57, EncPackageProductResponse S101);

/// <summary>Computes a package status from both tracks so send and acceptance changes are visible immediately.</summary>
public static class EncPackageStatusResolver
{
    /// <summary>Returns Error for any failed candidate and keeps InTransit locked until both are terminal.</summary>
    public static EncPackageStatus Resolve(EncPackage? package, ProductExportTrackRecord? s57, ProductExportTrackRecord? s101) {
        if (!string.IsNullOrWhiteSpace(package?.ErrorMessage) || IsError(s57, package?.S57Discarded == true) || IsError(s101, package?.S101Discarded == true))
            return EncPackageStatus.Error;
        if (package is null)
            return IsHeld(s57) || IsHeld(s101) ? EncPackageStatus.Held : EncPackageStatus.Idle;
        if (s57?.State is ProductState.InTransit or ProductState.AcceptedForDistribution or ProductState.Published ||
            s101?.State is ProductState.InTransit or ProductState.AcceptedForDistribution or ProductState.Published)
            return EncPackageStatus.InTransit;
        if (IsHeld(s57) || IsHeld(s101))
            return EncPackageStatus.Held;
        if ((package.S57Discarded || s57?.State == ProductState.ReadyForDistribution) &&
            (package.S101Discarded || s101?.State == ProductState.ReadyForDistribution))
            return EncPackageStatus.Ready;
        return EncPackageStatus.Building;
    }

    /// <summary>Shows the failed product's diagnostic even when the package row has no error text.</summary>
    public static string? GetErrorMessage(EncPackage? package, ProductExportTrackRecord? s57, ProductExportTrackRecord? s101) {
        if (IsError(s101, package?.S101Discarded == true) && !string.IsNullOrWhiteSpace(s101?.ErrorMessage))
            return s101.ErrorMessage;
        if (IsError(s57, package?.S57Discarded == true) && !string.IsNullOrWhiteSpace(s57?.ErrorMessage))
            return s57.ErrorMessage;
        if (!string.IsNullOrWhiteSpace(package?.ErrorMessage))
            return package.ErrorMessage;
        if (IsError(s101, package?.S101Discarded == true))
            return "The S-101 candidate failed or was rejected. Review its validation artifacts and discard the failed candidate.";
        if (IsError(s57, package?.S57Discarded == true))
            return "The S-57 candidate failed or was rejected. Review its validation artifacts and discard the failed candidate.";
        return null;
    }

    private static bool IsError(ProductExportTrackRecord? track, bool discarded) => !discarded && track is { State: ProductState.Error or ProductState.Rejected };
    private static bool IsHeld(ProductExportTrackRecord? track) => track?.IsManuallyFrozen == true || track?.State == ProductState.Frozen;
}
