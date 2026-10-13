using Hangfire;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using S100FC.ProductCatalogue;

namespace ProductCatalogueAPI.Services.Operations;

/// <summary>Exact, server-authoritative package actions; Send/Accept intentionally absent.</summary>
public interface IEncPackageActionService
{
    bool Enabled { get; }
    Task<EncPackageActionSnapshot?> ReadAsync(string sourceName, CancellationToken cancellationToken = default);
    Task<EncPackagePauseWriteResult> SetPausedAsync(string sourceName, Guid packageId, byte[]? expectedVersion, bool paused, CancellationToken cancellationToken = default);
    Task<string?> QueueDiscardAsync(string sourceName, Guid packageId, CancellationToken cancellationToken = default);
}

public sealed record EncPackageEligibleMember(string Key, string DatasetName);
public sealed record EncPackageActionSnapshot(
    Guid PackageId,
    string SourceDatasetName,
    bool Paused,
    string? ControlVersion,
    bool CanPause,
    bool CanResume,
    bool CanDiscard,
    IReadOnlyList<EncPackageEligibleMember> EligibleMembers,
    string? RestrictionCode);

public sealed class EncPackageActionService(
    IEncPackageRepository packages,
    IEncPackageControlRepository controls,
    IProductWorkflowRepository workflows,
    IBackgroundJobClient jobs,
    IConfiguration configuration,
    IHostEnvironment environment,
    TimeProvider clock) : IEncPackageActionService
{
    public bool Enabled => DiscardEncPackageJob.EncPackageActionsEnabled(configuration, environment);

    public async Task<EncPackageActionSnapshot?> ReadAsync(string sourceName, CancellationToken cancellationToken = default) {
        if (!Enabled || string.IsNullOrWhiteSpace(sourceName)) return null;
        var name = sourceName.Trim().ToUpperInvariant();
        var active = (await packages.GetActiveAsync([name], cancellationToken, includeSourceYaml: false)).GetValueOrDefault(name);
        if (active is null || !string.Equals(active.SourceDatasetName, name, StringComparison.OrdinalIgnoreCase)) return null;
        var control = await controls.GetForPackageAsync(active.Id, cancellationToken);
        if (control is null || !string.Equals(control.SourceDatasetName, active.SourceDatasetName, StringComparison.OrdinalIgnoreCase)) return null;
        var s101 = await workflows.GetTrackAsync(active.SourceDatasetName, ProductSpecification.S101, cancellationToken);
        var s57 = await workflows.GetTrackAsync(active.S57DatasetName, ProductSpecification.S57, cancellationToken);
        // Missing tracks still produce a readable package snapshot, but no mutation
        // permission. Both the Pause SQL guard and Discard transaction fail closed.
        var tracksReady = EncPackageActionEligibility.CanActOnUnsentPackage(s101, s57);
        var canAct = !active.S101Discarded && !active.S57Discarded && tracksReady;
        var canDiscard = EncPackageActionEligibility.CanDiscard(active, s101, s57);
        var eligible = new List<EncPackageEligibleMember>(2);
        if (tracksReady && !active.S101Discarded && s101!.State == ProductState.ReadyForDistribution)
            eligible.Add(new("s101", active.SourceDatasetName));
        if (tracksReady && !active.S57Discarded && s57!.State == ProductState.ReadyForDistribution)
            eligible.Add(new("s57", active.S57DatasetName));
        var restriction = s101 is null || s57 is null ? "MEMBER_TRACK_MISSING" :
            !tracksReady ? "MEMBERS_NOT_READY" : null;
        return new(active.Id, active.SourceDatasetName, control.IsPaused,
            control.RowVersion is null ? null : Convert.ToBase64String(control.RowVersion),
            canAct && !control.IsPaused, canAct && control.IsPaused, canDiscard, eligible, restriction);
    }

    public async Task<EncPackagePauseWriteResult> SetPausedAsync(string sourceName, Guid packageId, byte[]? expectedVersion, bool paused, CancellationToken cancellationToken = default) {
        if (!Enabled) return new(EncPackagePauseWriteStatus.NotEligible, null);
        var snapshot = await ReadAsync(sourceName, cancellationToken);
        if (snapshot is null || snapshot.PackageId != packageId || (paused ? !snapshot.CanPause : !snapshot.CanResume))
            return new(EncPackagePauseWriteStatus.NotEligible, null);
        return await controls.TrySetPausedAsync(packageId, expectedVersion, paused,
            clock.GetUtcNow().UtcDateTime, cancellationToken, requirePreSend: true);
    }

    public async Task<string?> QueueDiscardAsync(string sourceName, Guid packageId, CancellationToken cancellationToken = default) {
        if (!Enabled) return null;
        var snapshot = await ReadAsync(sourceName, cancellationToken);
        if (snapshot is null || snapshot.PackageId != packageId || !snapshot.CanDiscard) return null;
        return jobs.Enqueue<DiscardEncPackageJob>(job => job.RunAsync(packageId, CancellationToken.None));
    }
}

/// <summary>Pure pre-send rules; SQL transactions repeat the final guards at commit time.</summary>
public static class EncPackageActionEligibility
{
    public static bool CanActOnUnsentPackage(ProductExportTrackRecord? s101, ProductExportTrackRecord? s57) =>
        s101 is not null && s57 is not null && IsPreSendFinal(s101) && IsPreSendFinal(s57);

    public static bool CanDiscard(EncPackage package, ProductExportTrackRecord? s101, ProductExportTrackRecord? s57) =>
        s101 is not null && s57 is not null &&
        (package.S101Discarded ? IsAlreadyDiscarded(s101) : IsPreSendFinal(s101)) &&
        (package.S57Discarded ? IsAlreadyDiscarded(s57) : IsPreSendFinal(s57)) &&
        ((!package.S101Discarded && HasCandidate(s101)) || (!package.S57Discarded && HasCandidate(s57)));

    private static bool IsAlreadyDiscarded(ProductExportTrackRecord track) =>
        !track.IsManuallyFrozen && !track.CandidateEdition.HasValue && !track.CandidateUpdate.HasValue &&
        !track.CandidatePreviousState.HasValue &&
        track.State is not (ProductState.InTransit or ProductState.AcceptedForDistribution or
            ProductState.Exporting or ProductState.Validating or ProductState.Frozen);

    private static bool IsPreSendFinal(ProductExportTrackRecord track) =>
        !track.IsManuallyFrozen && track.State is (ProductState.ReadyForDistribution or ProductState.Error or ProductState.Rejected);

    private static bool HasCandidate(ProductExportTrackRecord track) =>
        track.CandidateEdition.HasValue && track.CandidateUpdate.HasValue ||
        track.State is (ProductState.Error or ProductState.Rejected);
}
