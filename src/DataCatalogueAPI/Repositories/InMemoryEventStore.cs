using Eventuous;
using Eventuous.Subscriptions;
using Eventuous.Subscriptions.Checkpoints;
using Eventuous.Subscriptions.Context;
using Eventuous.Subscriptions.Filters;
using System.Collections.Concurrent;
using System.Runtime.CompilerServices;

namespace DataCatalague.Api.Repositories
{
    /// <summary>
    /// In-memory event store implementation intended for development and testing.
    /// </summary>
    public sealed class InMemoryEventStore : IEventStore
    {
        private readonly object _gate = new();
        private readonly ConcurrentDictionary<StreamName, InMemoryStream> _storage = new();
        private readonly List<InMemoryAllStreamEvent> _global = [];

        public InMemoryEventStore() {
            ;
        }

        /// <inheritdoc />
        public Task<bool> StreamExists(StreamName streamName, CancellationToken cancellationToken) {
            cancellationToken.ThrowIfCancellationRequested();

            lock (this._gate) {
                return Task.FromResult(this._storage.ContainsKey(streamName));
            }
        }

        /// <inheritdoc />
        public Task<AppendEventsResult> AppendEvents(
            StreamName stream,
            ExpectedStreamVersion expectedVersion,
            IReadOnlyCollection<NewStreamEvent> events,
            CancellationToken cancellationToken) {
            cancellationToken.ThrowIfCancellationRequested();
            ArgumentNullException.ThrowIfNull(events);

            if (events.Count == 0) {
                throw new ArgumentException("At least one event must be appended.", nameof(events));
            }

            lock (this._gate) {
                var existing = this._storage.GetOrAdd(stream, static s => new InMemoryStream(s));
                var appendedEvents = existing.AppendEvents(expectedVersion, events);
                var streamName = (string)stream;

                foreach (var streamEvent in appendedEvents) {
                    var globalPosition = (ulong)this._global.Count;
                    this._global.Add(new InMemoryAllStreamEvent(streamName, streamEvent, globalPosition));
                }

                return Task.FromResult(
                    new AppendEventsResult(
                        (ulong)(this._global.Count - 1),
                        existing.Version));
            }
        }

        /// <inheritdoc />
        public Task<AppendEventsResult[]> AppendEvents(
            IReadOnlyCollection<NewStreamAppend> appends,
            CancellationToken cancellationToken) {
            cancellationToken.ThrowIfCancellationRequested();
            ArgumentNullException.ThrowIfNull(appends);

            if (appends.Count == 0) {
                return Task.FromResult(Array.Empty<AppendEventsResult>());
            }

            lock (this._gate) {
                var results = new AppendEventsResult[appends.Count];
                var index = 0;

                foreach (var append in appends) {
                    if (append.Events.Count == 0) {
                        throw new ArgumentException("Each append must contain at least one event.", nameof(appends));
                    }

                    var existing = this._storage.GetOrAdd(
                        append.StreamName,
                        static s => new InMemoryStream(s));

                    var appendedEvents = existing.AppendEvents(
                        append.ExpectedVersion,
                        append.Events);

                    var streamName = (string)append.StreamName;

                    foreach (var streamEvent in appendedEvents) {
                        var globalPosition = (ulong)this._global.Count;
                        this._global.Add(new InMemoryAllStreamEvent(streamName, streamEvent, globalPosition));
                    }

                    results[index++] = new AppendEventsResult(
                        (ulong)(this._global.Count - 1),
                        existing.Version);
                }

                return Task.FromResult(results);
            }
        }

        /// <inheritdoc />
#pragma warning disable CS1998 // IEventReader requires IAsyncEnumerable; the in-memory snapshot is already available synchronously.
        public async IAsyncEnumerable<StreamEvent> ReadEvents(
            StreamName stream,
            StreamReadPosition start,
            int count,
            [EnumeratorCancellation] CancellationToken cancellationToken) {
            IReadOnlyList<StreamEvent> events;

            lock (this._gate) {
                events = this.FindStream(stream, true).GetEvents(start, count);
            }

            foreach (var streamEvent in events) {
                cancellationToken.ThrowIfCancellationRequested();
                yield return streamEvent;
            }
        }

        /// <inheritdoc />
        public async IAsyncEnumerable<StreamEvent> ReadEventsBackwards(
            StreamName stream,
            StreamReadPosition start,
            int count,
            [EnumeratorCancellation] CancellationToken cancellationToken) {
            IReadOnlyList<StreamEvent> events;

            lock (this._gate) {
                events = this.FindStream(stream, true).GetEventsBackwards(start, count);
            }

            foreach (var streamEvent in events) {
                cancellationToken.ThrowIfCancellationRequested();
                yield return streamEvent;
            }
        }
#pragma warning restore CS1998

        /// <inheritdoc />
        public Task TruncateStream(
            StreamName stream,
            StreamTruncatePosition truncatePosition,
            ExpectedStreamVersion expectedVersion,
            CancellationToken cancellationToken) {
            cancellationToken.ThrowIfCancellationRequested();

            lock (this._gate) {
                this.FindStream(stream, expectedVersion.ExistingStream)
                    .Truncate(expectedVersion, truncatePosition);
            }

            return Task.CompletedTask;
        }

        /// <inheritdoc />
        public Task DeleteStream(
            StreamName stream,
            ExpectedStreamVersion expectedVersion,
            CancellationToken cancellationToken) {
            cancellationToken.ThrowIfCancellationRequested();

            lock (this._gate) {
                var existing = this.FindStream(stream, expectedVersion.ExistingStream);
                existing.CheckVersion(expectedVersion);
                this._storage.TryRemove(stream, out _);
            }

            return Task.CompletedTask;
        }

        internal IReadOnlyList<InMemoryAllStreamEvent> ReadAll(
            ulong? afterPosition,
            int maxCount) {
            ArgumentOutOfRangeException.ThrowIfLessThan(maxCount, 1);

            lock (this._gate) {
                var start = afterPosition.HasValue
                    ? checked((long)afterPosition.Value + 1)
                    : 0L;

                if (start >= this._global.Count) {
                    return [];
                }

                var count = Math.Min(maxCount, this._global.Count - (int)start);
                return this._global.GetRange((int)start, count);
            }
        }

        internal ulong? GetLastGlobalPosition() {
            lock (this._gate) {
                return this._global.Count == 0
                    ? null
                    : (ulong)(this._global.Count - 1);
            }
        }

        private InMemoryStream FindStream(StreamName stream, bool failIfNotFound)
            => !this._storage.TryGetValue(stream, out var existing)
                ? failIfNotFound
                    ? throw new StreamNotFound(stream)
                    : new InMemoryStream(stream)
                : existing;
    }

    internal sealed record InMemoryAllStreamEvent(
        string Stream,
        StreamEvent Event,
        ulong GlobalPosition);

    internal sealed record StoredEvent(StreamEvent Event, int Position);

    internal sealed class InMemoryStream(StreamName name)
    {
        private readonly List<StoredEvent> _events = [];

        public int Version { get; private set; } = -1;

        public string Name { get; } = name;

        public void CheckVersion(ExpectedStreamVersion expectedVersion) {
            if (expectedVersion != ExpectedStreamVersion.Any &&
                expectedVersion.Value != this.Version) {
                throw new WrongVersion(expectedVersion, this.Version);
            }
        }

        public IReadOnlyList<StreamEvent> AppendEvents(
            ExpectedStreamVersion expectedVersion,
            IReadOnlyCollection<NewStreamEvent> events) {
            this.CheckVersion(expectedVersion);

            var appendedEvents = new List<StreamEvent>(events.Count);

            foreach (var newEvent in events) {
                var version = ++this.Version;
                var streamEvent = new StreamEvent(
                    newEvent.Id,
                    newEvent.Payload,
                    newEvent.Metadata,
                    "application/json",
                    version,
                    DateTime.UtcNow);

                this._events.Add(new StoredEvent(streamEvent, version));
                appendedEvents.Add(streamEvent);
            }

            return appendedEvents;
        }

        public IReadOnlyList<StreamEvent> GetEvents(StreamReadPosition from, int count) {
            IEnumerable<StoredEvent> selected = this._events
                .SkipWhile(x => x.Position < from.Value);

            if (count > 0) {
                selected = selected.Take(count);
            }

            return selected
                .Select(x => x.Event with { Revision = x.Position })
                .ToArray();
        }

        public IReadOnlyList<StreamEvent> GetEventsBackwards(StreamReadPosition from, int count) {
            if (count <= 0 || this._events.Count == 0) {
                return [];
            }

            var requestedPosition = from.Value;
            var position = requestedPosition >= this._events.Count
                ? this._events.Count - 1
                : (int)requestedPosition;

            var result = new List<StreamEvent>(Math.Min(count, position + 1));

            while (count-- > 0 && position >= 0) {
                result.Add(this._events[position--].Event);
            }

            return result;
        }

        public void Truncate(
            ExpectedStreamVersion version,
            StreamTruncatePosition position) {
            this.CheckVersion(version);
            this._events.RemoveAll(x => x.Position <= position.Value);
        }
    }

    public sealed class WrongVersion(
        ExpectedStreamVersion expected,
        int actual)
        : Exception($"Wrong stream version. Expected {expected.Value}, actual {actual}");

    /// <summary>
    /// Existing single-checkpoint implementation retained for compatibility.
    /// Prefer <see cref="InMemoryCheckpointStore"/> when more than one subscription can be registered.
    /// </summary>
    public sealed class NoOpCheckpointStore(ulong? start = null) : ICheckpointStore
    {
        private Checkpoint _start = new(string.Empty, start);

        public ValueTask<Checkpoint> GetLastCheckpoint(
            string checkpointId,
            CancellationToken cancellationToken) {
            cancellationToken.ThrowIfCancellationRequested();
            return ValueTask.FromResult(this._start with { Id = checkpointId });
        }

        public ValueTask<Checkpoint> StoreCheckpoint(
            Checkpoint checkpoint,
            bool force,
            CancellationToken cancellationToken) {
            cancellationToken.ThrowIfCancellationRequested();

            this._start = checkpoint;
            CheckpointStored?.Invoke(this, checkpoint);

            return ValueTask.FromResult(checkpoint);
        }

        public event EventHandler<Checkpoint>? CheckpointStored;
    }
}

namespace DataCatalague.Api.Repositories
{
    public sealed record InMemoryAllStreamSubscriptionOptions : SubscriptionWithCheckpointOptions
    {
        /// <summary>
        /// Maximum number of messages that Eventuous can process concurrently.
        /// </summary>
        public int ConcurrencyLimit { get; set; } = 1;

        /// <summary>
        /// Maximum number of events read from the global in-memory log per poll.
        /// </summary>
        public int BatchSize { get; set; } = 100;

        /// <summary>
        /// Delay used when no new events are available.
        /// </summary>
        public TimeSpan PollInterval { get; set; } = TimeSpan.FromMilliseconds(50);
    }
}

namespace DataCatalague.Api.Repositories
{
    /// <summary>
    /// Stores checkpoints independently for each subscription for the lifetime of the process.
    /// </summary>
    public sealed class InMemoryCheckpointStore : ICheckpointStore
    {
        private readonly ConcurrentDictionary<string, Checkpoint> _checkpoints = new();
        private readonly ulong? _startPosition;

        public InMemoryCheckpointStore(ulong? startPosition = null) {
            this._startPosition = startPosition;
        }

        public ValueTask<Checkpoint> GetLastCheckpoint(
            string checkpointId,
            CancellationToken cancellationToken) {
            cancellationToken.ThrowIfCancellationRequested();

            var checkpoint = this._checkpoints.TryGetValue(checkpointId, out var existing)
                ? existing
                : new Checkpoint(checkpointId, this._startPosition);

            return ValueTask.FromResult(checkpoint);
        }

        public ValueTask<Checkpoint> StoreCheckpoint(
            Checkpoint checkpoint,
            bool force,
            CancellationToken cancellationToken) {
            cancellationToken.ThrowIfCancellationRequested();

            this._checkpoints[checkpoint.Id] = checkpoint;
            CheckpointStored?.Invoke(this, checkpoint);

            return ValueTask.FromResult(checkpoint);
        }

        public event EventHandler<Checkpoint>? CheckpointStored;
    }
}

namespace DataCatalague.Api.Repositories
{
    public sealed class InMemoryAllStreamSubscription
        : EventSubscriptionWithCheckpoint<InMemoryAllStreamSubscriptionOptions>
    {
        private readonly InMemoryEventStore _eventStore;
        private readonly IEventSerializer _eventSerializer;
        private readonly ConcurrentDictionary<Type, string> _eventTypes = new();

        public InMemoryAllStreamSubscription(
            InMemoryEventStore eventStore,
            InMemoryAllStreamSubscriptionOptions options,
            ICheckpointStore checkpointStore,
            ConsumePipe consumePipe,
            ILoggerFactory? loggerFactory = null,
            IEventSerializer? eventSerializer = null,
            IMetadataSerializer? metadataSerializer = null)
            : base(
                options,
                checkpointStore,
                consumePipe,
                options.ConcurrencyLimit,
                SubscriptionKind.All,
                loggerFactory,
                eventSerializer,
                metadataSerializer) {
            this._eventStore = eventStore;
            this._eventSerializer = eventSerializer ?? EventSerializer.Default;
        }

        protected override async ValueTask Connect(SubscriptionRun run) {
            this.ValidateOptions();

            var checkpoint = await this.GetCheckpoint(run).ConfigureAwait(false);
            var position = checkpoint.Position;

            if (position is null && this.Options.StartFrom == InitialPosition.Latest) {
                position = this._eventStore.GetLastGlobalPosition();

                if (position.HasValue) {
                    await this.CheckpointStore.StoreCheckpoint(
                            new Checkpoint(this.SubscriptionId, position),
                            true,
                            run.Token)
                        .ConfigureAwait(false);
                }
            }

            var pumping = Task.Run(
                async () => {
                    try {
                        await this.Poll(position, run).ConfigureAwait(false);
                    }
                    catch (Exception) when (run.Token.IsCancellationRequested) {
                        // The subscription run requested shutdown; this is not a transport failure.
                    }
                    catch (Exception exception) {
                        run.Fail(DropReason.ServerError, exception);
                    }
                },
                CancellationToken.None);

            // Waiting for the pump during disconnect prevents a replacement run from
            // reading while the previous run is still dispatching messages.
            run.OnDisconnect(_ => new ValueTask(pumping));
        }

        private async Task Poll(
            ulong? position,
            SubscriptionRun run) {
            while (!run.Token.IsCancellationRequested) {
                var events = this._eventStore.ReadAll(position, this.Options.BatchSize);

                if (events.Count == 0) {
                    await Task.Delay(this.Options.PollInterval, run.Token)
                        .ConfigureAwait(false);

                    continue;
                }

                foreach (var storedEvent in events) {
                    run.Token.ThrowIfCancellationRequested();

                    var context = this.CreateContext(storedEvent, run);

                    await this.HandleInternal(run, context)
                        .ConfigureAwait(false);

                    position = storedEvent.GlobalPosition;
                }
            }
        }

        private MessageConsumeContext CreateContext(
            InMemoryAllStreamEvent storedEvent,
            SubscriptionRun run) {
            var streamEvent = storedEvent.Event;
            var payload = streamEvent.Payload
                ?? throw new InvalidOperationException(
                    $"Event {streamEvent.Id} in stream '{storedEvent.Stream}' has no payload.");

            return new MessageConsumeContext(
                streamEvent.Id.ToString(),
                this.GetEventType(payload),
                streamEvent.ContentType,
                storedEvent.Stream,
                (ulong)streamEvent.Revision,
                (ulong)streamEvent.Revision,
                storedEvent.GlobalPosition,
                run.NextSequence(),
                streamEvent.Created,
                payload,
                streamEvent.Metadata,
                this.SubscriptionId,
                run.Token);
        }

        private string GetEventType(object payload)
            => this._eventTypes.GetOrAdd(
                payload.GetType(),
                _ => this._eventSerializer.SerializeEvent(payload).EventType);

        private void ValidateOptions() {
            ArgumentOutOfRangeException.ThrowIfLessThan(this.Options.ConcurrencyLimit, 1);
            ArgumentOutOfRangeException.ThrowIfLessThan(this.Options.BatchSize, 1);

            if (this.Options.PollInterval <= TimeSpan.Zero) {
                throw new ArgumentOutOfRangeException(
                    nameof(this.Options.PollInterval),
                    this.Options.PollInterval,
                    "Poll interval must be greater than zero.");
            }
        }
    }
}