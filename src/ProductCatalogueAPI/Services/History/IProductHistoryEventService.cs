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

/// <summary>Durable audit lifecycle shared by manual Export producers and terminal reconciliation.</summary>
public interface IProductHistoryEventService
{
    Task<Guid> CreatePendingAsync(ProductHistoryEventStart input);
    Task<bool> MarkExecutionStartedAsync(Guid operationId);
    Task<bool> FinalizeAsync(ProductHistoryEventCompletion input);
    Task<IReadOnlyList<ProductHistoryEventRecord>> GetFinalizedByDatasetNameAsync(string datasetName);
}
