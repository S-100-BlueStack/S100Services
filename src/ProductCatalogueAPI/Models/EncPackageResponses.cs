using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Models;

/// <summary>Summarizes the state shared by the two exports of one ENC AOI.</summary>
public enum EncPackageStatus
{
    /// <summary>No ready pair or outstanding delivery; candidate build progress is exposed on the members.</summary>
    Idle = 0,
    /// <summary>A candidate failed, IC-ENC rejected a member, or the active pair is inconsistent.</summary>
    Error = 4,
    /// <summary>Package delivery is paused or one of the products has an operator hold.</summary>
    Hold = 5,
    /// <summary>Both required candidates are ready for distribution.</summary>
    Ready = 2,
    /// <summary>Delivery or acceptance finalization remains outstanding for at least one member.</summary>
    InTransit = 3
}

/// <summary>Exposes public and candidate versions separately for one mapped product.</summary>
/// <param name="IssueDate">The issue date of the current product in the S-128 catalogue.</param>
public sealed record EncPackageProductResponse(string DatasetName, ProductSpecification ProductSpecification, int CurrentEdition, int CurrentUpdate, DateOnly? IssueDate, int? CandidateEdition, int? CandidateUpdate, ProductState Status, bool Held, bool Discarded, string? ErrorMessage);

/// <summary>Exposes one S-101 AOI with its shared package and two independent export tracks.</summary>
public sealed record EncPackageResponse(PackageLayer Layer, string SourceDatasetName, int? UsageBand, int? DisplayScale, DateTime? DetectedAtUtc, EncPackageStatus Status, string? ErrorMessage, EncPackageProductResponse S57, EncPackageProductResponse S101)
{
    /// <summary>True only when an active EncPackage exists; never inferred from member track states.</summary>
    public bool HasActivePackage { get; init; }
    /// <summary>UTC creation time of the current shared snapshot, refreshed only when a replacement package is saved.</summary>
    public DateTime? BuiltAtUtc { get; init; }
}

/// <summary>Computes a package status from both tracks so send and acceptance changes are visible immediately.</summary>
public static class EncPackageStatusResolver
{
    /// <summary>Prioritizes package Pause over candidate failures; otherwise preserves the member-state precedence.</summary>
    /// <param name="package">The active paired snapshot, if one exists.</param>
    /// <param name="s57">The S-57 workflow track.</param>
    /// <param name="s101">The S-101 workflow track.</param>
    /// <returns>The aggregate status, independent of member edition and update numbers.</returns>
    public static EncPackageStatus Resolve(EncPackage? package, ProductExportTrackRecord? s57, ProductExportTrackRecord? s101) {
        if (package?.IsPaused == true)
            return EncPackageStatus.Hold;
        if (!string.IsNullOrWhiteSpace(package?.ErrorMessage) || IsError(s57, package?.S57Discarded == true) || IsError(s101, package?.S101Discarded == true) ||
            IsUncertain(s57) || IsUncertain(s101))
            return EncPackageStatus.Error;
        if (package is null)
            return IsHeld(s57) || IsHeld(s101) ? EncPackageStatus.Hold : EncPackageStatus.Idle;
        if (s57 is null || s101 is null || package.S57Discarded || package.S101Discarded)
            return EncPackageStatus.Error;
        if (IsHeld(s57) || IsHeld(s101))
            return EncPackageStatus.Hold;
        if (s57.State == ProductState.ReadyForDistribution && s101.State == ProductState.ReadyForDistribution)
            return EncPackageStatus.Ready;
        if (IsAwaitingCompletion(s57) || IsAwaitingCompletion(s101))
            return EncPackageStatus.InTransit;
        if (IsIdlePresentation(s57) || IsIdlePresentation(s101))
            return EncPackageStatus.Idle;
        return EncPackageStatus.Error;
    }

    /// <summary>Shows the failed product's diagnostic even when the package row has no error text.</summary>
    public static string? GetErrorMessage(EncPackage? package, ProductExportTrackRecord? s57, ProductExportTrackRecord? s101) {
        var rejection = GetRejectionMessage(package, s57, s101);
        if (rejection is not null) return rejection;
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

    /// <summary>Reports IC-ENC rejection explicitly, including when the stored rejection reason is empty.</summary>
    /// <param name="package">The active snapshot and any historical member-discard flags.</param>
    /// <param name="s57">The S-57 track.</param>
    /// <param name="s101">The S-101 track.</param>
    /// <returns>The rejection marker and member-specific reasons, or null if neither current member was rejected.</returns>
    private static string? GetRejectionMessage(EncPackage? package, ProductExportTrackRecord? s57, ProductExportTrackRecord? s101) {
        var reasons = new List<string>();
        if (package?.S101Discarded != true && s101?.State == ProductState.Rejected)
            reasons.Add($"S-101: {PublicExportError.For(s101) ?? "The candidate was rejected."}");
        if (package?.S57Discarded != true && s57?.State == ProductState.Rejected)
            reasons.Add($"S-57: {PublicExportError.For(s57) ?? "The candidate was rejected."}");
        return reasons.Count == 0 ? null : "RejectedByIC-ENC. " + string.Join("; ", reasons);
    }

    /// <summary>Preserves a delivery status until accepted candidates have completed package finalization.</summary>
    /// <param name="track">The current candidate track.</param>
    /// <returns>Whether delivery or acceptance is still outstanding.</returns>
    private static bool IsAwaitingCompletion(ProductExportTrackRecord track) => track.State is ProductState.InTransit or ProductState.AcceptedForDistribution;

    /// <summary>Maps detailed build progress and completed/cancelled candidates to the simplified Idle presentation.</summary>
    /// <param name="track">The candidate whose detailed status remains available on the member response.</param>
    /// <returns>Whether this state has no separate package-level label.</returns>
    private static bool IsIdlePresentation(ProductExportTrackRecord track) => track.State is ProductState.ChangesDetected or ProductState.Exporting or ProductState.Validating or ProductState.Published or ProductState.Cancelled;

    private static bool IsError(ProductExportTrackRecord? track, bool discarded) => !discarded && track is { State: ProductState.Error or ProductState.Rejected };
    private static bool IsUncertain(ProductExportTrackRecord? track) => track?.ErrorCode == "IC_ENC_DELIVERY_UNCERTAIN" && track.State == ProductState.InTransit;
    private static bool IsHeld(ProductExportTrackRecord? track) => track?.IsManuallyFrozen == true || track?.State == ProductState.Frozen;
}
