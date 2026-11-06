using Hangfire;
using Microsoft.Extensions.Options;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Options;

namespace ProductCatalogueAPI.Services.Jobs;

/// <summary>Outcome in an independently verified IC-ENC notice.</summary>
public enum IcEncDecision { Accepted, Rejected }

/// <summary>Records which adapter supplied a notice; email ingestion is the intended primary adapter.</summary>
public enum IcEncAcknowledgementSource { Email, Manual }

/// <summary>
/// One normalized notice for an exact product/version. A future email job supplies Email and a stable
/// source event ID; the Swagger fallback supplies Manual. Neither adapter can choose a revision ID.
/// </summary>
public sealed record IcEncAcknowledgement(string DatasetName, ProductSpecification Specification, int Edition, int Update,
    IcEncDecision Decision, string NoticeReference, IcEncAcknowledgementSource Source, string? SourceEventId = null,
    string? Reason = null, Guid? DeliveryId = null);

/// <summary>Returns the matched delivery and whether this acknowledgement made the package publishable.</summary>
public sealed record IcEncAcknowledgementResult(Guid DeliveryId, Guid? PackageId, bool ReadyForFinalization, bool AlreadyRecorded);

/// <summary>Application boundary shared by future email ingestion and the manual recovery endpoint.</summary>
public interface IIcEncAcknowledgementService
{
    /// <summary>Records a verified acceptance or rejection for the current delivered revision.</summary>
    Task<IcEncAcknowledgementResult?> RecordAsync(IcEncAcknowledgement acknowledgement, CancellationToken cancellationToken);
}

/// <summary>Schedules publication only when both delivered products are accepted; DPC recovers missed enqueueing.</summary>
public sealed class IcEncAcknowledgementService(IEncPackageAcknowledgementRepository repository, IBackgroundJobClient jobs,
    IOptionsMonitor<SendToIcEncOptions> options, TimeProvider clock, ILogger<IcEncAcknowledgementService> logger) : IIcEncAcknowledgementService
{
    public async Task<IcEncAcknowledgementResult?> RecordAsync(IcEncAcknowledgement acknowledgement, CancellationToken cancellationToken) {
        ArgumentNullException.ThrowIfNull(acknowledgement);
        if (options.CurrentValue.Mode != SendToIcEncMode.Live)
            throw new InvalidOperationException("IC-ENC notices can be applied only to live deliveries.");
        if (acknowledgement.Specification is not (ProductSpecification.S57 or ProductSpecification.S101) ||
            string.IsNullOrWhiteSpace(acknowledgement.DatasetName) || acknowledgement.DatasetName.Length > 64 ||
            acknowledgement.Edition < 0 || acknowledgement.Update < 0 ||
            !Enum.IsDefined(acknowledgement.Decision) || !Enum.IsDefined(acknowledgement.Source) ||
            string.IsNullOrWhiteSpace(acknowledgement.NoticeReference) || acknowledgement.NoticeReference.Length > 256 ||
            acknowledgement.Reason?.Length > 1000 ||
            (acknowledgement.Source == IcEncAcknowledgementSource.Email &&
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
        if (result.ReadyForFinalization && result.PackageId.HasValue && !result.AlreadyRecorded) {
            try { jobs.Enqueue<FinalizeEncPackageJob>(job => job.RunAsync(result.PackageId.Value, CancellationToken.None)); }
            catch (Exception ex) {
                // The notice is committed first; the DPC scan re-queues pending publication without losing the acceptance.
                logger.LogError(ex, "Accepted package {PackageId} could not be queued for immediate publication; DPC will retry.", result.PackageId);
            }
        }
        return result;
    }
}
