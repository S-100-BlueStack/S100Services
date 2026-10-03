using DataCatalague.Api.Domain;
using Eventuous;
using System.Collections.Concurrent;
using System.Reflection.Metadata;

namespace DataCatalague.Api.Repositories
{
    public class InMemoryPipelineRepository : IPipelineRepository
    {
        private readonly IEventStore _eventStore;
        //private readonly ConcurrentDictionary<Guid, Pipeline> pipelines = new();
        //private readonly int nextId;

        public InMemoryPipelineRepository(IEventStore eventStore) {
            this._eventStore = eventStore;

            //var seed = new[] {
            //    new Pipeline {
            //        Uuid = Guid.Parse("{f7dc3482-4523-4fce-9a09-426111f6a0d8}"),
            //        DisplayName = "ENC",
            //        Description = "An ENC & ECDIS | IHO provides official international standards and guidelines for Electronic Navigational Charts used in marine navigation.",
            //        LastUpdatedUtc = DateTime.UtcNow,
            //    },
            //};

            //foreach (var product in seed) {
            //    this.pipelines[product.Uuid] = product;
            //}

            //this.nextId = seed.Length;
        }

        //public Task<(IReadOnlyList<Pipeline> Items, int TotalCount)> GetPipelinesAsync(int skip, int take, CancellationToken cancellationToken = default) {
        //    ArgumentOutOfRangeException.ThrowIfNegative(skip);
        //    ArgumentOutOfRangeException.ThrowIfNegativeOrZero(take);

        //    cancellationToken.ThrowIfCancellationRequested();

        //    var ordered = this.pipelines.Values.OrderBy(pipeline => pipeline.Uuid).ToList();

        //    IReadOnlyList<Pipeline> page = ordered.Skip(skip).Take(take).ToList();

        //    return Task.FromResult((page, ordered.Count));
        //}

        //public Task<Pipeline?> GetByUuidAsync(Guid uui, CancellationToken cancellationToken = default) {
        //    throw new NotImplementedException();
        //}

        //public Task<Pipeline> AddAsync(Pipeline pipeline, CancellationToken cancellationToken = default) {
        //    ArgumentNullException.ThrowIfNull(pipeline);
        //    cancellationToken.ThrowIfCancellationRequested();

        //    pipeline.Uuid = Guid.NewGuid();            
        //    pipeline.LastUpdatedUtc = DateTimeOffset.UtcNow;

        //    this.pipelines[pipeline.Uuid] = pipeline;

        //    return Task.FromResult(pipeline);
        //}
    }
}
