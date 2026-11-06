using Microsoft.Extensions.Logging;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;

namespace ProductCatalogueAPI.Jobs;

/// <summary>
/// Recovers interrupted member exports owned by an exact active ENC package.
/// The caller must own ENC-DPC-GLOBAL and both mapped Product locks. A current
/// exporting process retains its Product lock, so it cannot be recovered here.
/// </summary>
internal static class EncPackageInterruptedExportRecovery
{
    internal static async Task<int> TryRecoverAsync(EncPackage expectedPackage,
        IProductWorkflowRepository workflow, IEncPackageRepository packages,
        TimeProvider clock, ILogger logger, CancellationToken cancellationToken) {
        ArgumentNullException.ThrowIfNull(expectedPackage);
        if (expectedPackage.Id == Guid.Empty)
            return 0;

        // Package ownership is re-read after taking the locks; a snapshot from an
        // earlier scan cannot authorize recovery of a replacement package.
        var package = await packages.GetByIdAsync(expectedPackage.Id, cancellationToken);
        if (package is null || !SamePackage(expectedPackage, package))
            return 0;

        var s101 = package.S101Discarded ? null :
            await workflow.GetTrackAsync(package.SourceDatasetName, ProductSpecification.S101, cancellationToken);
        var s57 = package.S57Discarded ? null :
            await workflow.GetTrackAsync(package.S57DatasetName, ProductSpecification.S57, cancellationToken);
        if (!CanRecover(package, s101, s57))
            return 0;

        var recovered = 0;
        foreach (var (name, specification, track) in new[] {
            (package.SourceDatasetName, ProductSpecification.S101, s101),
            (package.S57DatasetName, ProductSpecification.S57, s57)
        }) {
            if (track is null || track.State is not (ProductState.Exporting or ProductState.Validating))
                continue;

            // An optimistic, transactional SQL condition protects both the
            // Product candidate and current package identity from stale writes.
            var previousState = track.State;
            var applied = await workflow.TryFailInterruptedPackageExportAsync(
                package.Id, track.Id, name, specification, previousState,
                track.UpdatedAtUtc, track.CandidateEdition!.Value, track.CandidateUpdate!.Value,
                clock.GetUtcNow().UtcDateTime, cancellationToken);
            if (!applied)
                throw new InvalidOperationException($"ENC interrupted export recovery conflicted for '{name}'. The scan watermark and replay must be preserved.");

            recovered++;
            logger.LogWarning("Interrupted ENC package export recovered as Error. PackageId: {PackageId}. DatasetName: {DatasetName}. ProductSpecification: {ProductSpecification}. PreviousState: {PreviousState}. ErrorCode: {ErrorCode}.",
                package.Id, name, specification, previousState, "ENC_EXPORT_INTERRUPTED");
        }
        return recovered;
    }

    internal static bool CanRecover(EncPackage package, ProductExportTrackRecord? s101, ProductExportTrackRecord? s57) {
        if (!MemberIsSafe(s101, package.SourceDatasetName, ProductSpecification.S101, package.S101Discarded) ||
            !MemberIsSafe(s57, package.S57DatasetName, ProductSpecification.S57, package.S57Discarded))
            return false;
        return IsInterrupted(s101) || IsInterrupted(s57);
    }

    private static bool MemberIsSafe(ProductExportTrackRecord? track, string name,
        ProductSpecification specification, bool discarded) {
        if (discarded)
            return track is null;
        if (track is null)
            return true;
        if (!string.Equals(track.DatasetName, name, StringComparison.OrdinalIgnoreCase) ||
            track.ProductSpecification != specification || track.IsManuallyFrozen ||
            track.State is ProductState.Frozen or ProductState.InTransit or
                ProductState.AcceptedForDistribution or ProductState.Published or ProductState.Rejected)
            return false;
        return !IsInterrupted(track) ||
            (track.Id != Guid.Empty && track.CandidateEdition is >= 0 &&
             track.CandidateUpdate is >= 0 && track.UpdatedAtUtc != default);
    }

    private static bool IsInterrupted(ProductExportTrackRecord? track) =>
        track?.State is ProductState.Exporting or ProductState.Validating;

    private static bool SamePackage(EncPackage expected, EncPackage current) =>
        expected.Id == current.Id &&
        string.Equals(expected.SourceDatasetName, current.SourceDatasetName, StringComparison.OrdinalIgnoreCase) &&
        string.Equals(expected.S57DatasetName, current.S57DatasetName, StringComparison.OrdinalIgnoreCase) &&
        expected.S101Discarded == current.S101Discarded &&
        expected.S57Discarded == current.S57Discarded;
}
