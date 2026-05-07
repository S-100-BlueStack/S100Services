using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Data.Repositories
{
    public interface IProductRepository
    {
        Task AppendAsync(string name, ProductState state, string? owner = null, byte[]? attachment = null, string? attachmentFileName = null);

        Task<IEnumerable<ProductRecord>> GetCurrentAsync();

        Task<ProductRecord?> GetCurrentByNameAsync(string name);

        Task<DateTime?> GetLastSuccessfulRunUtcAsync(string jobName);
        Task SetSuccessfulRunUtcAsync(string jobName, DateTime dateTime);

        Task<string[]> GetIneligbleProductsAsync();
        Task<string[]> GetEligibleProductsAsync();

    }
}