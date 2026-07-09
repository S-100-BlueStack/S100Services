using ProductManagerAPI.Data.Models;

namespace ProductManagerAPI.Data.Repositories
{
    public interface IProductRepository
    {
        Task AppendAsync(
            string name,
            ProductState state,
            string productSpecification,
            int editionNo,
            int updateNo,
            string? owner = null,
            byte[]? attachment = null,
            string? attachmentFileName = null);

        Task<IEnumerable<ProductRecord>> GetCurrentAsync();
        Task<ProductRecord?> GetCurrentByNameAsync(string name);
        Task<DateTime?> GetLastSuccessfulRunUtcAsync(string jobName);
        Task SetSuccessfulRunUtcAsync(string jobName, DateTime dateTime);
        Task<string[]> GetIneligbleProductsAsync();
        Task<string[]> GetEligibleProductsAsync();
        Task<IEnumerable<ProductRecord>> GetHistoryByNameAsync(string name);
        Task<IEnumerable<ProductRecord>> GetHistoryAsync(DateTime fromInclusive, DateTime toExclusive);
    }
}
