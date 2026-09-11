using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Data.Repositories;

/// <summary>Accepts only canonical, validated records from the History service.</summary>
public interface IProductHistoryEventRepository
{
    Task InsertPendingAsync(ProductHistoryEventRecord record);
    Task<ProductHistoryEventRecord?> GetByOperationIdAsync(Guid operationId);
    Task<bool> MarkExecutionStartedAsync(Guid operationId, DateTime nowUtc);
    Task<bool> TryFinalizeAsync(ProductHistoryEventRecord record);
    Task<IReadOnlyList<ProductHistoryEventRecord>> GetFinalizedByDatasetNameAsync(string canonicalDatasetName);
}
