using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Services.History;

public sealed record ProductHistoryEventStart(
    Guid OperationId,
    string DatasetName,
    string EventType,
    string? JobId = null,
    string? CorrelationId = null,
    string? ExportTarget = null,
    IReadOnlyDictionary<string, string?>? OperationMetadata = null);

public sealed record ProductHistoryEventCompletion(
    Guid OperationId,
    ProductHistoryResult Result,
    Guid? StateRecordId = null,
    IReadOnlyDictionary<string, string?>? OperationMetadata = null);

/// <summary>Unconnected lifecycle foundation; Product jobs do not call this in Batch 1.</summary>
public interface IProductHistoryEventService
{
    Task<Guid> CreatePendingAsync(ProductHistoryEventStart input);
    Task<bool> MarkExecutionStartedAsync(Guid operationId);
    Task<bool> FinalizeAsync(ProductHistoryEventCompletion input);
    Task<IReadOnlyList<ProductHistoryEventRecord>> GetFinalizedByDatasetNameAsync(string datasetName);
}
