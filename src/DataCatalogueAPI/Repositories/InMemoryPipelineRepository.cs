using DataCatalague.Api.Domain;
using System.Collections.Concurrent;

namespace DataCatalague.Api.Repositories
{
    public class InMemoryPipelineRepository : IPipelineRepository
    {
        private readonly ConcurrentDictionary<Guid, Pipeline> pipelines = new();
        private readonly int nextId;

        public InMemoryPipelineRepository() {
            var seed = new[]
            {
                new Pipeline
                {
                    Uuid = Guid.NewGuid(),
                    Name = "ENC",
                },
            };

            foreach (var product in seed) {
                this.pipelines[product.Uuid] = product;
            }

            this.nextId = seed.Length;
        }

        public Task<(IReadOnlyList<Pipeline> Items, int TotalCount)> GetPageAsync(int skip, int take, CancellationToken cancellationToken = default) {
            ArgumentOutOfRangeException.ThrowIfNegative(skip);
            ArgumentOutOfRangeException.ThrowIfNegativeOrZero(take);

            cancellationToken.ThrowIfCancellationRequested();

            var ordered = this.pipelines.Values.OrderBy(pipeline => pipeline.Uuid).ToList();

            IReadOnlyList<Pipeline> page = ordered.Skip(skip).Take(take).ToList();

            return Task.FromResult((page, ordered.Count));
        }
    }
}
