using DataCatalague.Api.Domain;

namespace DataCatalague.Api.Repositories
{
    public interface IPipelineRepository
    {
        Task<(IReadOnlyList<Pipeline> Items, int TotalCount)> GetPageAsync(int skip, int take, CancellationToken cancellationToken = default);
    }
}
