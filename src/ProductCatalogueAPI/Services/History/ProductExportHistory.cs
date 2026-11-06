using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Operations;

namespace ProductCatalogueAPI.Services.History;

public interface IProductExportHistory
{
    /// <summary>Records lock rejection only for a fresh identity, without altering an existing operation.</summary>
    Task RecordNotStartedAsync(ExportOperationJobRequest request, IExportJobExecutionContext context);

    /// <summary>The caller must hold the existing Product track lock through completion and audit persistence.</summary>
    Task ExecuteAsync(ExportOperationJobRequest request, IExportJobExecutionContext context,
        Func<Func<Task>, Task<ExportOperationResult>> execute);
}

/// <summary>Owns manual Export audit lifecycle; neither package producers nor Discard enter this service.</summary>
public sealed class ProductExportHistory(
    IProductHistoryEventRepository repository,
    IProductHistoryEventService events,
    IProductHistoryRecoveryRepository recovery,
    ILogger<ProductExportHistory> logger) : IProductExportHistory
{
    public async Task RecordNotStartedAsync(ExportOperationJobRequest request, IExportJobExecutionContext context) {
        try {
            request = CanonicalRequest(request, context);
            // Lock contention must never finalize an event belonging to an execution
            // that already holds the lock, including a duplicate invocation of its job.
            if (await repository.GetByOperationIdAsync(request.OperationId) is not null) return;
            if (context.GetJobParameter<bool?>(ExportJobParameterNames.ExecutionStarted) == true) return;
            await events.CreatePendingAsync(new(request.OperationId, request.DatasetName, "Export",
                context.JobId, request.CorrelationId, request.ProductSpecification));
        }
        catch (Exception exception) {
            logger.LogError(exception, "Product History could not record a rejected Export. JobId: {JobId}.", context.JobId);
            throw SafeFailure(context, ExportJobContract.HistoryUnavailableCode, ExportJobContract.HistoryUnavailableMessage);
        }
        await FinishBestEffortAsync(ProductHistoryTerminal.Failure(request, context.JobId, ProductHistoryResult.Failed), context);
    }

    public async Task ExecuteAsync(ExportOperationJobRequest request, IExportJobExecutionContext context,
        Func<Func<Task>, Task<ExportOperationResult>> execute) {
        ProductHistoryEventRecord pending;
        bool existing;
        try {
            request = CanonicalRequest(request, context);
            ProductHistoryEventRecord? found;
            try {
                found = await repository.GetByOperationIdAsync(request.OperationId);
            }
            catch (Exception exception) {
                var receipt = context.GetJobParameter<ProductHistoryTerminal>(ExportJobParameterNames.HistoryTerminal);
                var expected = new ProductHistoryEventRecord { OperationId = request.OperationId,
                    DatasetName = request.DatasetName, ExportTarget = request.ProductSpecification,
                    EventType = "Export", JobId = context.JobId, CorrelationId = request.CorrelationId };
                if (receipt is not null && receipt.Matches(expected) && receipt.OperationType == request.OperationType.ToString() &&
                    (receipt.Result is ProductHistoryResult.Succeeded or ProductHistoryResult.SucceededWithWarning)) {
                    // Preserve proven business success during a SQL outage, but do not
                    // finalize an audit identity that could not be checked against SQL.
                    logger.LogError(exception, "Successful Export remains pending during audit read failure. OperationId: {OperationId}.", request.OperationId);
                    PublishSuccessBestEffort(context, receipt);
                    return;
                }
                throw;
            }
            existing = found is not null;
            if (found is null) {
                // A legacy job with a durable execution guard must never be adopted as a fresh operation.
                if (context.GetJobParameter<bool?>(ExportJobParameterNames.ExecutionStarted) == true)
                    throw SafeFailure(context, ExportJobContract.ManualReviewRequiredCode, ExportJobContract.ManualReviewRequiredMessage);
                await events.CreatePendingAsync(new(request.OperationId, request.DatasetName, "Export",
                    context.JobId, request.CorrelationId, request.ProductSpecification));
                found = await repository.GetByOperationIdAsync(request.OperationId);
            }
            pending = found ?? throw new InvalidOperationException("The pending event was not durably stored.");
            if (!ProductHistoryTerminal.Failure(request, context.JobId, ProductHistoryResult.Failed).Matches(pending))
                throw new InvalidOperationException("The operation identity belongs to a different Product or job.");
        }
        catch (ExportOperationJobException) { throw; }
        catch (Exception exception) {
            logger.LogError(exception, "Product History could not prepare the manual Export. JobId: {JobId}.", context.JobId);
            throw SafeFailure(context, ExportJobContract.HistoryUnavailableCode, ExportJobContract.HistoryUnavailableMessage);
        }

        if (existing) {
            ProductHistoryTerminal? terminal;
            try {
                terminal = context.GetJobParameter<ProductHistoryTerminal>(ExportJobParameterNames.HistoryTerminal);
            }
            catch (Exception exception) {
                logger.LogError(exception, "Existing Export receipt could not be read. OperationId: {OperationId}.", request.OperationId);
                throw SafeFailure(context, ExportJobContract.ManualReviewRequiredCode, ExportJobContract.ManualReviewRequiredMessage);
            }
            if (terminal is not null) {
                if (terminal.Matches(pending) && terminal.OperationType == request.OperationType.ToString() &&
                    (!pending.FinalizedAtUtc.HasValue ||
                        pending.Outcome == terminal.Result.ToString() && pending.StateRecordId == terminal.StateRecordId)) {
                    // Keep the durable receipt even if SQL is temporarily unavailable.
                    // Finalization still verifies the exact state reference; Export never repeats.
                    await FinishBestEffortAsync(terminal, context, persistTerminal: false);
                    if (terminal.Result is ProductHistoryResult.Succeeded or ProductHistoryResult.SucceededWithWarning)
                        return;
                }
                // Conflicting evidence must remain available for diagnosis, not be
                // overwritten with a newly inferred terminal outcome.
            }
            else if (!pending.FinalizedAtUtc.HasValue) {
                // A pending event without a checkpoint can be an interrupted attempt.
                await FinishBestEffortAsync(ProductHistoryTerminal.Failure(request, context.JobId, ProductHistoryResult.RequiresManualReview), context);
            }
            throw SafeFailure(context, ExportJobContract.ManualReviewRequiredCode, ExportJobContract.ManualReviewRequiredMessage);
        }

        var checkpointAttempted = false;
        var checkpointCompleted = false;
        ExportOperationResult result;
        try {
            result = await execute(async () => {
                if (checkpointAttempted) throw new InvalidOperationException("Execution may be checkpointed only once.");
                checkpointAttempted = true;
                // Write the replay guard before the SQL checkpoint. Any uncertain write
                // aborts the business call; a restart sees either the guard or the pending event.
                context.SetJobParameter(ExportJobParameterNames.ExecutionStarted, true);
                if (!await events.MarkExecutionStartedAsync(request.OperationId))
                    throw new InvalidOperationException("The execution-start checkpoint was not accepted.");
                checkpointCompleted = true;
            });
        }
        catch (Exception exception) {
            var outcome = !checkpointAttempted || (checkpointCompleted && exception is ExportOperationJobException { Code: ExportJobContract.ProductOperationRejectedCode, IsPreExecutionRejection: true })
                ? ProductHistoryResult.Failed : ProductHistoryResult.RequiresManualReview;
            await FinishBestEffortAsync(ProductHistoryTerminal.Failure(request, context.JobId, outcome), context);
            if (checkpointAttempted && !checkpointCompleted)
                throw SafeFailure(context, ExportJobContract.HistoryUnavailableCode, ExportJobContract.HistoryUnavailableMessage);
            throw;
        }

        // Business success has already committed. Recovery/audit failures below must
        // never bubble into Hangfire and invite an operator to repeat a successful export.
        try {
            if (!checkpointCompleted) throw new InvalidOperationException("Export returned without an execution checkpoint.");
            var terminal = ProductHistoryTerminal.Success(request, context.JobId, result);
            await FinishBestEffortAsync(terminal, context);
        }
        catch (Exception exception) {
            logger.LogError(exception, "Export completed but its audit evidence requires review. OperationId: {OperationId}. JobId: {JobId}.", request.OperationId, context.JobId);
            // Publish only the reviewed business message; leave the audit pending for recovery.
            PublishSuccessBestEffort(context, null);
        }
    }

    private static ExportOperationJobRequest CanonicalRequest(ExportOperationJobRequest request, IExportJobExecutionContext context) {
        if (!ProductHistoryTerminal.Supports(request.OperationType) || request.ProductSpecification is not ("S57" or "S101"))
            throw new ArgumentException("Unsupported manual Export audit operation.");
        var stored = context.GetJobParameter<Guid?>(ExportJobParameterNames.OperationId);
        if (stored == Guid.Empty || stored.HasValue && request.OperationId != Guid.Empty && stored != request.OperationId)
            throw new InvalidOperationException("The operation identifier does not match the queued job.");
        var operationId = stored ?? (request.OperationId == Guid.Empty ? Guid.NewGuid() : request.OperationId);
        if (!stored.HasValue)
            context.SetJobParameter(ExportJobParameterNames.OperationId, operationId);
        return request with { OperationId = operationId, DatasetName = ProductHistoryEventContract.NormalizeDatasetName(request.DatasetName) };
    }

    private async Task FinishBestEffortAsync(ProductHistoryTerminal terminal, IExportJobExecutionContext context, bool persistTerminal = true) {
        try {
            if (persistTerminal)
                context.SetJobParameter(ExportJobParameterNames.HistoryTerminal, terminal);
            if (terminal.Result is ProductHistoryResult.Succeeded or ProductHistoryResult.SucceededWithWarning)
                PublishSuccessBestEffort(context, terminal);
            if (terminal.StateRecordId is not null && !await recovery.HasExactCompletionAsync(terminal))
                throw new InvalidOperationException("The exact Product completion record could not be verified.");
            var finalized = await events.FinalizeAsync(terminal.Completion());
            if (!finalized)
                logger.LogWarning("Product History finalization made no transition. OperationId: {OperationId}.", terminal.OperationId);
        }
        catch (Exception exception) {
            logger.LogError(exception, "Product History terminal persistence requires reconciliation. OperationId: {OperationId}. JobId: {JobId}.", terminal.OperationId, context.JobId);
            if (terminal.Result is ProductHistoryResult.Succeeded or ProductHistoryResult.SucceededWithWarning)
                PublishSuccessBestEffort(context, terminal);
        }
    }

    private void PublishSuccessBestEffort(IExportJobExecutionContext context, ProductHistoryTerminal? terminal) {
        try {
            context.SetJobParameter(ExportJobParameterNames.ResultCode, ExportOperationContract.ExportCompletedCode);
            context.SetJobParameter(ExportJobParameterNames.ResultMessage, ExportOperationContract.ExportCompletedMessage);
            context.SetJobParameter(ExportJobParameterNames.WarningCode, terminal?.WarningCode);
            context.SetJobParameter(ExportJobParameterNames.WarningMessage, terminal?.WarningMessage);
            context.SetJobParameter(ExportJobParameterNames.ErrorCode, null);
            context.SetJobParameter(ExportJobParameterNames.ErrorMessage, null);
        }
        catch (Exception exception) {
            logger.LogError(exception, "Successful Export public job metadata could not be written. JobId: {JobId}.", context.JobId);
        }
    }

    private static ExportOperationJobException SafeFailure(IExportJobExecutionContext context, string code, string message) {
        try {
            context.SetJobParameter(ExportJobParameterNames.ErrorCode, code);
            context.SetJobParameter(ExportJobParameterNames.ErrorMessage, message);
        }
        catch { /* The safe exception remains usable even when Hangfire parameter storage is unavailable. */ }
        return new(code, message);
    }
}
