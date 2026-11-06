using DataCatalague.Api.Domain;

namespace DataCatalague.Api.Repositories
{
    public interface IPipelineRepository
    {
        /// <summary>Returns the current subscription-projected pipelines in identifier order.</summary>
        Task<IReadOnlyList<PipelineState>> GetPipelinesAsync(CancellationToken cancellationToken);
    }
}
