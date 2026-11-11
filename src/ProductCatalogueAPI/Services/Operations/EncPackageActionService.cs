using Hangfire;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Services.ValidationEmail;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Models;
using S100FC.ProductCatalogue;

namespace ProductCatalogueAPI.Services.Operations;

/// <summary>Exact, server-authoritative package actions; send eligibility is restricted to the configured simulation workflow.</summary>
public interface IEncPackageActionService
{
    bool Enabled { get; }
    /// <summary>Queues both eligible members of the verified current package for simulated delivery.</summary>
    Task<string?> QueueSendAsync(string sourceName, Guid packageId, CancellationToken cancellationToken = default) => Task.FromResult<string?>(null);
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
    string? RestrictionCode)
{
    /// <summary>Server-owned permission to queue generated-response delivery for the current ready members.</summary>
    public bool CanSend { get; init; }
    /// <summary>The aggregate status of both export members at the time eligibility was read.</summary>
    public EncPackageStatus Status { get; init; }
    /// <summary>UTC creation time of the active shared package snapshot, when recorded.</summary>
    public DateTime? BuiltAtUtc { get; init; }
    /// <summary>The safe package or member diagnostic, when available.</summary>
    public string? ErrorMessage { get; init; }
}

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

    /// <summary>Reads package actions and presents an active delivery Pause as Hold without changing candidate states.</summary>
    /// <param name="sourceName">The S-101 dataset identifying the active package.</param>
    /// <param name="cancellationToken">Cancels the package, control and candidate reads.</param>
    /// <returns>The current action snapshot, or null when actions or the package control are unavailable.</returns>
    public async Task<EncPackageActionSnapshot?> ReadAsync(string sourceName, CancellationToken cancellationToken = default) {
        if (!Enabled || string.IsNullOrWhiteSpace(sourceName)) return null;
        var name = sourceName.Trim().ToUpperInvariant();
        var active = (await packages.GetActiveAsync([name], cancellationToken, includeSourceYaml: false)).GetValueOrDefault(name);
        if (active is null || !string.Equals(active.SourceDatasetName, name, StringComparison.OrdinalIgnoreCase)) return null;
        var control = await controls.GetForPackageAsync(active.Id, cancellationToken);
        if (control is null || !string.Equals(control.SourceDatasetName, active.SourceDatasetName, StringComparison.OrdinalIgnoreCase)) return null;
        // Use this control read if Pause changed after the package projection was loaded.
        active.IsPaused = control.IsPaused;
        var s101 = await workflows.GetTrackAsync(active.SourceDatasetName, ProductSpecification.S101, cancellationToken);
        var s57 = await workflows.GetTrackAsync(active.S57DatasetName, ProductSpecification.S57, cancellationToken);
        // Missing tracks still produce a readable package snapshot, but no mutation
        // permission. Both the Pause SQL guard and Discard transaction fail closed.
        var tracksReady = EncPackageActionEligibility.CanActOnUnsentPackage(s101, s57);
        var canAct = !active.S101Discarded && !active.S57Discarded && tracksReady;
        var canDiscard = EncPackageActionEligibility.CanDiscard(active, s101, s57);
        var eligible = new List<EncPackageEligibleMember>(2);
        if (!active.S101Discarded && s101?.State == ProductState.ReadyForDistribution)
            eligible.Add(new("s101", active.SourceDatasetName));
        if (!active.S57Discarded && s57?.State == ProductState.ReadyForDistribution)
            eligible.Add(new("s57", active.S57DatasetName));
        var restriction = s101 is null || s57 is null ? "MEMBER_TRACK_MISSING" :
            !tracksReady ? "MEMBERS_NOT_READY" : null;
        return new(active.Id, active.SourceDatasetName, control.IsPaused,
            control.RowVersion is null ? null : Convert.ToBase64String(control.RowVersion),
            canAct && !control.IsPaused, canAct && control.IsPaused, canDiscard, eligible, restriction) {
            CanSend = SimulationEnabled() && !control.IsPaused && !active.S101Discarded && !active.S57Discarded &&
                s101 is { IsManuallyFrozen: false, State: not ProductState.Frozen } && s57 is { IsManuallyFrozen: false, State: not ProductState.Frozen } && eligible.Count > 0,
            Status = EncPackageStatusResolver.Resolve(active, s57, s101),
            BuiltAtUtc = active.BuiltAtUtc,
            ErrorMessage = EncPackageStatusResolver.GetErrorMessage(active, s57, s101)
        };
    }

    /// <summary>Both modes are server configuration; no frontend build flag grants send permission.</summary>
    private bool SimulationEnabled() {
        var email = new ValidationEmailOptions();
        ValidationEmailOptions.BindSettings(configuration, email);
        return configuration.GetValue<SendToIcEncMode>("SendToIcEnc:Mode") == SendToIcEncMode.Simulation && email.Mode == ValidationEmailMode.Simulation;
    }

    /// <inheritdoc/>
    public async Task<string?> QueueSendAsync(string sourceName, Guid packageId, CancellationToken cancellationToken = default) {
        var snapshot = await ReadAsync(sourceName, cancellationToken);
        if (snapshot is null || snapshot.PackageId != packageId || !snapshot.CanSend) return null;
        var members = new List<EncPackageSendMember>();
        foreach (var member in snapshot.EligibleMembers) {
            var specification = member.Key == "s101" ? ProductSpecification.S101 : ProductSpecification.S57;
            var track = await workflows.GetTrackAsync(member.DatasetName, specification, cancellationToken);
            var revision = track is null ? null : await workflows.GetLatestRevisionIdAsync(track.Id, cancellationToken);
            if (track is null || track.State != ProductState.ReadyForDistribution || track.CandidateEdition is null || track.CandidateUpdate is null || revision is null) return null;
            members.Add(new(member.DatasetName, specification, track.CandidateEdition.Value, track.CandidateUpdate.Value, revision.Value));
        }
        return jobs.Enqueue<SendEncPackageJob>(job => job.RunAsync(snapshot.SourceDatasetName, packageId, members.ToArray(), CancellationToken.None, null));
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
        track.State is (ProductState.Idle or ProductState.ChangesDetected or ProductState.Error or ProductState.Rejected);

    private static bool IsPreSendFinal(ProductExportTrackRecord track) =>
        !track.IsManuallyFrozen && ProductCandidateRecovery.CanDiscard(track.State, track.CandidatePreviousState, track.CandidateEdition, track.CandidateUpdate);

    private static bool HasCandidate(ProductExportTrackRecord track) =>
        track.CandidateEdition.HasValue && track.CandidateUpdate.HasValue ||
        track.State is (ProductState.Error or ProductState.Rejected);
}
