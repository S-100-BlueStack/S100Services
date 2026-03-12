using ProductCatalogueService.Data.Models;

namespace ProductCatalogueService.Data.Repositories
{
    public interface IProductRepository
    {
        Task AppendAsync(string name, ProductState state, string? owner = null);

        Task<IEnumerable<ProductRecord>> GetCurrentAsync();

        Task<ProductRecord?> GetCurrentByNameAsync(string name);
    }
}