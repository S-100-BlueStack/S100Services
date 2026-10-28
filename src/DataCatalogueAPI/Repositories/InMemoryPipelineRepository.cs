using DataCatalague.Api.Domain;
using Eventuous;
using Eventuous.Subscriptions;
using Eventuous.Subscriptions.Context;
using System.Collections.Concurrent;

namespace DataCatalague.Api.Repositories
{
    /// <summary>Maintains the pipeline listing from subscription events.</summary>
    public sealed class InMemoryPipelineRepository(ILogger<InMemoryPipelineRepository> logger) : IPipelineRepository, IEventHandler
    {
        private readonly ConcurrentDictionary<string, PipelineState> _pipelines = new(StringComparer.Ordinal);

        public string DiagnosticName => nameof(InMemoryPipelineRepository);

        public Task<IReadOnlyList<PipelineState>> GetPipelinesAsync(CancellationToken cancellationToken) {
            cancellationToken.ThrowIfCancellationRequested();
            IReadOnlyList<PipelineState> pipelines = this._pipelines.ToArray().OrderBy(entry => entry.Key, StringComparer.Ordinal).Select(entry => entry.Value).ToArray();
            return Task.FromResult(pipelines);
        }

        public ValueTask<EventHandlingStatus> HandleEvent(IMessageConsumeContext context) {
            var status = context.Message switch {
                PipelineEvents.V1.PipelineCreated evt => this.HandleCreated(evt),
                PipelineEvents.V1.WorkspaceAdded evt => this.HandleUpdated(context.Stream.GetId(), evt),
                PipelineEvents.V1.WorkspaceLocked evt => this.HandleUpdated(context.Stream.GetId(), evt),
                PipelineEvents.V1.WorkspaceUnlocked evt => this.HandleUpdated(context.Stream.GetId(), evt),
                _ => EventHandlingStatus.Ignored,
            };
            return ValueTask.FromResult(status);
        }

        private EventHandlingStatus HandleCreated(PipelineEvents.V1.PipelineCreated evt) {
            this._pipelines.TryAdd(evt.PipelineId, new PipelineState().When(evt));
            return EventHandlingStatus.Handled;
        }

        private EventHandlingStatus HandleUpdated(string pipelineId, object evt) {
            // Fold updates into the existing state so listing timestamps agree with individual reads.
            while (this._pipelines.TryGetValue(pipelineId, out var state)) {
                if (this._pipelines.TryUpdate(pipelineId, state.When(evt), state)) {
                    return EventHandlingStatus.Handled;
                }
            }
            logger.LogError("Cannot project pipeline event before pipeline creation. PipelineId: {PipelineId}, EventType: {EventType}.", pipelineId, evt.GetType().Name);
            return EventHandlingStatus.Failure;
        }
    }
}
