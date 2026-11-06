using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.Locking;

namespace ProductCatalogueAPI.Services.History;

/// <summary>Observes audit/job/state evidence while holding the same lock as manual Export.</summary>
public sealed class ProductHistoryReconciliation(
    IProductHistoryEventRepository repository,
    IProductHistoryEventService events,
    IProductHistoryRecoveryRepository recovery,
    IProductHistoryJobReader jobs,
    IDatasetLockService locks,
    TimeProvider timeProvider,
    ILogger<ProductHistoryReconciliation> logger)
{
    public async Task RunAsync(CancellationToken cancellationToken) {
        var cutoff = timeProvider.GetUtcNow().UtcDateTime.AddMinutes(-15);
        DateTime? afterCreated = null;
        Guid? afterId = null;
        while (true) {
            cancellationToken.ThrowIfCancellationRequested();
            var page = await recovery.GetPendingPageAsync(cutoff, afterCreated, afterId, cancellationToken);
            if (page.Count == 0) return;
            foreach (var row in page) {
                cancellationToken.ThrowIfCancellationRequested();
                await ReconcileAsync(row, cancellationToken);
            }
            // Keyset pagination lets an old unknown job remain pending without starving later rows.
            afterCreated = page[^1].CreatedAtUtc;
            afterId = page[^1].Id;
        }
    }

    public async Task ReconcileAsync(ProductHistoryEventRecord candidate, CancellationToken cancellationToken) {
        try {
            if (candidate.EventType != "Export" || candidate.ExportTarget is not ("S57" or "S101") ||
                string.IsNullOrWhiteSpace(candidate.JobId)) {
                LogPending(candidate.OperationId, "incomplete audit identity");
                return;
            }
            var specification = Enum.Parse<ProductSpecification>(candidate.ExportTarget);
            await using var handle = await locks.TryAcquireAsync(
                ProductTrackLockKey.For(candidate.DatasetName, specification), cancellationToken);
            if (handle is null) return;

            var pending = await repository.GetByOperationIdAsync(candidate.OperationId);
            if (pending is null || pending.FinalizedAtUtc.HasValue) return;
            if (pending.Id != candidate.Id || pending.DatasetName != candidate.DatasetName ||
                pending.ExportTarget != candidate.ExportTarget || pending.JobId != candidate.JobId) {
                LogPending(candidate.OperationId, "changed audit identity");
                return;
            }
            var job = jobs.Read(pending.JobId!);
            if (job is null || !Matches(pending, job)) {
                LogPending(pending.OperationId, "missing or mismatched job identity");
                return;
            }
            if (job.State is "Enqueued" or "Scheduled" or "Processing" or "Awaiting") return;
            if (job.State is not ("Succeeded" or "Failed" or "Deleted")) {
                LogPending(pending.OperationId, "unknown job state");
                return;
            }

            ProductHistoryEventCompletion completion;
            if (job.Terminal is { } terminal) {
                if (!terminal.Matches(pending) || terminal.OperationType != job.OperationType ||
                    terminal.StateRecordId is not null && !await recovery.HasExactCompletionAsync(terminal)) {
                    LogPending(pending.OperationId, "invalid terminal evidence");
                    return;
                }
                completion = terminal.Completion();
            }
            else {
                var uncertain = pending.ExecutionStartedAtUtc.HasValue || job.ExecutionStarted == true || job.State == "Succeeded";
                completion = new(pending.OperationId, uncertain
                    ? ProductHistoryResult.RequiresManualReview : ProductHistoryResult.Failed);
            }
            if (await events.FinalizeAsync(completion))
                logger.LogInformation("Product History reconciled. OperationId: {OperationId}. Outcome: {Outcome}.", pending.OperationId, completion.Result);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception exception) {
            logger.LogError(exception, "Product History remains pending after reconciliation failure. OperationId: {OperationId}.", candidate.OperationId);
        }
    }

    private static bool Matches(ProductHistoryEventRecord pending, ProductHistoryJobState job) =>
        job.OperationId != Guid.Empty && job.OperationId == pending.OperationId &&
        (job.Request.OperationId == Guid.Empty || job.Request.OperationId == job.OperationId) &&
        ProductHistoryTerminal.Supports(job.Request.OperationType) && job.OperationType == job.Request.OperationType.ToString() &&
        ProductHistoryEventContract.NormalizeDatasetName(job.DatasetName) == pending.DatasetName &&
        ProductHistoryEventContract.NormalizeDatasetName(job.Request.DatasetName) == pending.DatasetName &&
        job.ExportTarget == pending.ExportTarget && job.Request.ProductSpecification == pending.ExportTarget &&
        job.CorrelationId == pending.CorrelationId && job.Request.CorrelationId == pending.CorrelationId;

    private void LogPending(Guid operationId, string reason) =>
        logger.LogWarning("Product History remains pending. OperationId: {OperationId}. Reason: {Reason}.", operationId, reason);
}
