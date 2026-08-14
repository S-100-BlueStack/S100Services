using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Data.Repositories;

/// <summary>
/// Provides the legacy dashboard-shaped view over the normalized product workflow schema.
/// </summary>
public interface IProductRepository
{
    /// <summary>Appends a state transition to the normalized track history.</summary>
    Task AppendAsync(string name, ProductState state, string productSpecification, uint editionNo, uint? updateNo, string? owner = null, byte[]? attachment = null, string? attachmentFileName = null, string? errorCode = null, string? errorMessage = null);

    /// <summary>Gets the current preferred track for every product.</summary>
    Task<IEnumerable<ProductRecord>> GetCurrentAsync();

    /// <summary>Gets the current preferred track for a product.</summary>
    Task<ProductRecord?> GetCurrentByNameAsync(string name);

    /// <summary>Gets current preferred tracks for the requested products.</summary>
    Task<IEnumerable<ProductRecord>> GetCurrentByNamesAsync(IEnumerable<string> names);

    /// <summary>Gets current tracks for the requested products in one product specification.</summary>
    Task<IEnumerable<ProductRecord>> GetCurrentByNamesAsync(IEnumerable<string> names, ProductSpecification productSpecification);

    /// <summary>Gets a job's last successful scan watermark.</summary>
    Task<DateTime?> GetLastSuccessfulRunUtcAsync(string jobName);

    /// <summary>Persists a job's successful scan watermark.</summary>
    Task SetSuccessfulRunUtcAsync(string jobName, DateTime dateTime);

    /// <summary>Gets products whose current state prevents automatic processing.</summary>
    Task<string[]> GetIneligbleProductsAsync();

    /// <summary>Gets products eligible for automatic processing.</summary>
    Task<string[]> GetEligibleProductsAsync();

    /// <summary>Gets state history for a product across all independent tracks.</summary>
    Task<IEnumerable<ProductRecord>> GetHistoryByNameAsync(string name);

    /// <summary>Gets state history occurring in a UTC interval.</summary>
    Task<IEnumerable<ProductRecord>> GetHistoryAsync(DateTime fromInclusive, DateTime toExclusive);
}
