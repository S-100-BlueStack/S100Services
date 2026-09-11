using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;

namespace ProductCatalogueAPI.Services.History;

public sealed class ProductHistoryEventService(
    IProductHistoryEventRepository repository,
    TimeProvider timeProvider) : IProductHistoryEventService
{
    public async Task<Guid> CreatePendingAsync(ProductHistoryEventStart input)
    {
        ArgumentNullException.ThrowIfNull(input);
        ProductHistoryEventContract.RequireIdentity(input.OperationId, nameof(input.OperationId));
        var now = timeProvider.GetUtcNow().UtcDateTime;
        var record = new ProductHistoryEventRecord
        {
            Id = Guid.NewGuid(),
            OperationId = input.OperationId,
            DatasetName = ProductHistoryEventContract.NormalizeDatasetName(input.DatasetName),
            EventType = ProductHistoryEventContract.NormalizeEventType(input.EventType),
            JobId = ProductHistoryEventContract.NormalizeToken(input.JobId, ProductHistoryEventContract.JobIdMaxLength, nameof(input.JobId)),
            CorrelationId = ProductHistoryEventContract.NormalizeToken(input.CorrelationId, ProductHistoryEventContract.CorrelationIdMaxLength, nameof(input.CorrelationId)),
            ExportTarget = ProductHistoryEventContract.NormalizeExportTarget(input.ExportTarget),
            OperationMetadataJson = ProductHistoryEventContract.SerializeMetadata(input.OperationMetadata),
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };
        await repository.InsertPendingAsync(record);
        return record.Id;
    }

    public Task<bool> MarkExecutionStartedAsync(Guid operationId)
    {
        ProductHistoryEventContract.RequireIdentity(operationId, nameof(operationId));
        return repository.MarkExecutionStartedAsync(operationId, timeProvider.GetUtcNow().UtcDateTime);
    }

    public async Task<bool> FinalizeAsync(ProductHistoryEventCompletion input)
    {
        ArgumentNullException.ThrowIfNull(input);
        ProductHistoryEventContract.RequireIdentity(input.OperationId, nameof(input.OperationId));
        var safe = ProductHistorySafeMessages.Resolve(input.Result);
        if (input.StateRecordId.HasValue)
        {
            ProductHistoryEventContract.RequireIdentity(input.StateRecordId.Value, nameof(input.StateRecordId));
            if (input.Result is not (ProductHistoryResult.Succeeded or ProductHistoryResult.SucceededWithWarning))
                throw new ArgumentException("Only successful outcomes can reference a state-history row.", nameof(input));
        }
        var metadata = ProductHistoryEventContract.SerializeMetadata(input.OperationMetadata);
        var pending = await repository.GetByOperationIdAsync(input.OperationId);
        if (pending == null || pending.FinalizedAtUtc.HasValue) return false;
        var now = timeProvider.GetUtcNow().UtcDateTime;
        return await repository.TryFinalizeAsync(pending with
        {
            Outcome = safe.Outcome,
            Code = safe.Code,
            SafeMessage = safe.Message,
            StateRecordId = input.StateRecordId,
            OperationMetadataJson = metadata ?? pending.OperationMetadataJson,
            UpdatedAtUtc = now,
            FinalizedAtUtc = now,
            OccurredAtUtc = now
        });
    }

    public async Task<IReadOnlyList<ProductHistoryEventRecord>> GetFinalizedByDatasetNameAsync(string datasetName)
    {
        var canonical = ProductHistoryEventContract.NormalizeDatasetName(datasetName);
        var rows = await repository.GetFinalizedByDatasetNameAsync(canonical);
        // Keep the public visibility boundary even with another repository implementation.
        return rows.Where(row => row.FinalizedAtUtc.HasValue).ToArray();
    }
}
