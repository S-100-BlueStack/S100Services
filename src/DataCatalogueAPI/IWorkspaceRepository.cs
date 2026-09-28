using DataCatalague.Api.Domain;

namespace DataCatalague.Api.Services
{
    public interface IWorkspaceRepository
    {
        Task<(IReadOnlyList<Workspace> Items, int TotalCount)> GetPageAsync(int skip, int take, CancellationToken cancellationToken = default);
    }
}
