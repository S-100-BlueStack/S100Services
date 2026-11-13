using Hangfire;
using Microsoft.Extensions.Options;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Services.ValidationEmail;

namespace ProductCatalogueAPI.Services.Jobs;

/// <summary>Outcome in an independently verified IC-ENC notice.</summary>
public enum IcEncDecision { Accepted, Rejected }

/// <summary>Records which adapter supplied a notice; email ingestion is the intended primary adapter.</summary>
public enum IcEncAcknowledgementSource {
    /// <summary>A verified provider mailbox notice.</summary>
    Email,
    /// <summary>An authenticated operator's verified external notice.</summary>
    Manual,
    /// <summary>A generated reply bound to a permanently marked simulated reservation.</summary>
    Simulation
}

/// <summary>
/// One normalized notice for an exact product/version. A future email job supplies Email and a stable
/// source event ID; the Swagger fallback supplies Manual. Neither adapter can choose a revision ID.
/// </summary>
public sealed record IcEncAcknowledgement(string DatasetName, ProductSpecification Specification, int Edition, int Update,
    IcEncDecision Decision, string NoticeReference, IcEncAcknowledgementSource Source, string? SourceEventId = null,
    string? Reason = null, Guid? DeliveryId = null);

/// <summary>Returns the matched delivery and whether this acknowledgement made the package publishable.</summary>
public sealed record IcEncAcknowledgementResult(Guid DeliveryId, Guid? PackageId, bool ReadyForFinalization, bool AlreadyRecorded)
{
    /// <summary>Gets the owning package's S-101 source name for diagnostics, including notices for its S-57 member.</summary>
    public string? PackageName { get; init; }
}

/// <summary>Application boundary shared by future email ingestion and the manual recovery endpoint.</summary>
public interface IIcEncAcknowledgementService
{
    /// <summary>Records a verified acceptance or rejection for the current delivered revision.</summary>
    Task<IcEncAcknowledgementResult?> RecordAsync(IcEncAcknowledgement acknowledgement, CancellationToken cancellationToken);
}

/// <summary>Finalizes accepted pairs immediately in the worker; API requests queue worker execution and DPC recovers failures.</summary>
public sealed class IcEncAcknowledgementService(IEncPackageAcknowledgementRepository repository, IBackgroundJobClient jobs,
    IOptionsMonitor<SendToIcEncOptions> options, TimeProvider clock, ILogger<IcEncAcknowledgementService> logger, IOptions<ValidationEmailOptions>? emailOptions = null, IEncPackageFinalizationService? finalization = null) : IIcEncAcknowledgementService
{
    /// <inheritdoc/>
    public async Task<IcEncAcknowledgementResult?> RecordAsync(IcEncAcknowledgement acknowledgement, CancellationToken cancellationToken) {
        ArgumentNullException.ThrowIfNull(acknowledgement);
        var simulation = acknowledgement.Source == IcEncAcknowledgementSource.Simulation;
        if (simulation ? options.CurrentValue.Mode != SendToIcEncMode.Simulation || emailOptions?.Value.Mode != ValidationEmailMode.Simulation : options.CurrentValue.Mode != SendToIcEncMode.Live)
            throw new InvalidOperationException("The notice provenance does not match the configured delivery and email modes.");
        if (acknowledgement.Specification is not (ProductSpecification.S57 or ProductSpecification.S101) ||
            string.IsNullOrWhiteSpace(acknowledgement.DatasetName) || acknowledgement.DatasetName.Length > 64 ||
            acknowledgement.Edition < 0 || acknowledgement.Update < 0 ||
            !Enum.IsDefined(acknowledgement.Decision) || !Enum.IsDefined(acknowledgement.Source) ||
            string.IsNullOrWhiteSpace(acknowledgement.NoticeReference) || acknowledgement.NoticeReference.Length > 256 ||
            acknowledgement.Reason?.Length > 1000 ||
            (acknowledgement.Source is (IcEncAcknowledgementSource.Email or IcEncAcknowledgementSource.Simulation) &&
                (string.IsNullOrWhiteSpace(acknowledgement.SourceEventId) || acknowledgement.SourceEventId.Length > 256)) ||
            (acknowledgement.Source == IcEncAcknowledgementSource.Manual && acknowledgement.SourceEventId is not null) ||
            acknowledgement.DeliveryId == Guid.Empty)
            throw new ArgumentException("The IC-ENC acknowledgement requires an exact ENC product/version and a bounded notice reference.", nameof(acknowledgement));

        var result = await repository.RecordAsync(acknowledgement with { DatasetName = acknowledgement.DatasetName.Trim(), NoticeReference = acknowledgement.NoticeReference.Trim() },
            clock.GetUtcNow().UtcDateTime, cancellationToken);
        if (result is null) return null;

        if (acknowledgement.Source == IcEncAcknowledgementSource.Manual)
            logger.LogWarning("Manual IC-ENC {Decision} recorded for {DatasetName} edition {Edition} update {Update}; delivery {DeliveryId}; already recorded: {AlreadyRecorded}.",
                acknowledgement.Decision, acknowledgement.DatasetName, acknowledgement.Edition, acknowledgement.Update, result.DeliveryId, result.AlreadyRecorded);
        else
            logger.LogInformation("IC-ENC email {Decision} recorded for {DatasetName} edition {Edition} update {Update}; delivery {DeliveryId}; already recorded: {AlreadyRecorded}.",
                acknowledgement.Decision, acknowledgement.DatasetName, acknowledgement.Edition, acknowledgement.Update, result.DeliveryId, result.AlreadyRecorded);
        if (result.ReadyForFinalization && result.PackageId.HasValue) {
            // The finalizer is registered only in the worker, which owns ArcGIS execution.
            // Finish before returning from inbox processing so a successful simulated send is already Idle.
            if (finalization is not null) {
                try {
                    await finalization.FinalizeAsync(result.PackageId.Value, cancellationToken);
                    return result;
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
                catch (Exception ex) {
                    // Acceptance is durable; never erase it or retire the pair before S-128 and SQL agree.
                    logger.LogError(ex, "Accepted package {PackageName} could not be finalized immediately; queuing worker recovery.", result.PackageName ?? acknowledgement.DatasetName);
                }
            }
            try { jobs.Enqueue<FinalizeEncPackageJob>(job => job.RunAsync(result.PackageId.Value, CancellationToken.None)); }
            catch (Exception ex) {
                // The notice is committed first; the DPC scan re-queues pending publication without losing the acceptance.
                logger.LogError(ex, "Accepted package {PackageName} could not be queued for immediate publication; DPC will retry.", result.PackageName ?? acknowledgement.DatasetName);
            }
        }
        return result;
    }
}
