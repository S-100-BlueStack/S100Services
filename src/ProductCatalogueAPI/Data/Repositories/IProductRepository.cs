using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Data.Repositories
{
    public interface IProductRepository
    {
        Task AppendAsync(string name, ProductState state, string? owner = null, byte[]? attachment = null, string? attachmentFileName = null);

        Task<IEnumerable<ProductRecord>> GetCurrentAsync();

        Task<ProductRecord?> GetCurrentByNameAsync(string name);
        Task<string[]> GetIneligbleProductsAsync();
        Task<string[]> GetEligibleProductsAsync();

    }
}