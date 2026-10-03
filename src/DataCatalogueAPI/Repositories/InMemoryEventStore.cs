using Eventuous;
using Eventuous.Subscriptions.Checkpoints;
using System.Collections.Concurrent;
using System.Runtime.CompilerServices;

namespace DataCatalague.Api.Repositories;

/// <summary>
/// In-memory event store implementation for testing purposes
/// </summary>
public class InMemoryEventStore : IEventStore
{
    readonly ConcurrentDictionary<StreamName, InMemoryStream> _storage = new();
    readonly List<StreamEvent> _global = [];

    /// <inheritdoc />
    public Task<bool> StreamExists(StreamName streamName, CancellationToken cancellationToken)
        => Task.FromResult(this._storage.ContainsKey(streamName));

    /// <inheritdoc />
    public Task<AppendEventsResult> AppendEvents(
            StreamName stream,
            ExpectedStreamVersion expectedVersion,
            IReadOnlyCollection<NewStreamEvent> events,
            CancellationToken cancellationToken
        ) {
        var existing = this._storage.GetOrAdd(stream, s => new(s));
        existing.AppendEvents(expectedVersion, events);
        var now = DateTime.UtcNow;
        this._global.AddRange(events.Select((x, i) => new StreamEvent(x.Id, x.Payload, x.Metadata, "application/json", this._global.Count + i, now)));

        return Task.FromResult(new AppendEventsResult((ulong)(this._global.Count - 1), existing.Version));
    }

    /// <inheritdoc />
    public Task<AppendEventsResult[]> AppendEvents(IReadOnlyCollection<NewStreamAppend> appends, CancellationToken cancellationToken) {
        var results = new AppendEventsResult[appends.Count];
        var i = 0;

        foreach (var append in appends) {
            var now = DateTime.UtcNow;
            var existing = this._storage.GetOrAdd(append.StreamName, s => new(s));
            existing.AppendEvents(append.ExpectedVersion, append.Events);
            this._global.AddRange(append.Events.Select((x, j) => new StreamEvent(x.Id, x.Payload, x.Metadata, "application/json", this._global.Count + j, now)));
            results[i++] = new((ulong)(this._global.Count - 1), existing.Version);
        }

        return Task.FromResult(results);
    }

    /// <inheritdoc />
#pragma warning disable CS1998 // Async method lacks 'await' operators
    // ReSharper disable once AsyncMethodWithoutAwait
    public async IAsyncEnumerable<StreamEvent> ReadEvents(StreamName stream, StreamReadPosition start, int count, [EnumeratorCancellation] CancellationToken cancellationToken) {
        foreach (var evt in this.FindStream(stream, true).GetEvents(start, count)) {
            yield return evt;
        }
    }

    /// <inheritdoc />
    // ReSharper disable once AsyncMethodWithoutAwait
    public async IAsyncEnumerable<StreamEvent> ReadEventsBackwards(StreamName stream, StreamReadPosition start, int count, [EnumeratorCancellation] CancellationToken cancellationToken) {
        foreach (var evt in this.FindStream(stream, true).GetEventsBackwards(start, count)) {
            yield return evt;
        }
    }
#pragma warning restore CS1998

    /// <inheritdoc />
    public Task TruncateStream(
            StreamName stream,
            StreamTruncatePosition truncatePosition,
            ExpectedStreamVersion expectedVersion,
            CancellationToken cancellationToken
        ) {
        this.FindStream(stream, expectedVersion.ExistingStream).Truncate(expectedVersion, truncatePosition);

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task DeleteStream(StreamName stream, ExpectedStreamVersion expectedVersion, CancellationToken cancellationToken) {
        var existing = this.FindStream(stream, expectedVersion.ExistingStream);
        existing.CheckVersion(expectedVersion);
        this._storage.Remove(stream, out _);

        return Task.CompletedTask;
    }

    // ReSharper disable once ReturnTypeCanBeEnumerable.Local
    InMemoryStream FindStream(StreamName stream, bool failIfNotFound)
        => !this._storage.TryGetValue(stream, out var existing)
            ? failIfNotFound
                ? throw new StreamNotFound(stream)
                : new(stream)
            : existing;
}

record StoredEvent(StreamEvent Event, int Position);

class InMemoryStream(StreamName name)
{
    public int Version { get; private set; } = -1;
    public string Name { get; } = name;

    readonly List<StoredEvent> _events = [];

    public void CheckVersion(ExpectedStreamVersion expectedVersion) {
        if (expectedVersion != ExpectedStreamVersion.Any && expectedVersion.Value != this.Version) throw new WrongVersion(expectedVersion, this.Version);
    }

    public void AppendEvents(ExpectedStreamVersion expectedVersion, IReadOnlyCollection<NewStreamEvent> events) {
        this.CheckVersion(expectedVersion);

        foreach (var newEvent in events) {
            var version = ++this.Version;
            var streamEvent = new StreamEvent(newEvent.Id, newEvent.Payload, newEvent.Metadata, "application/json", version, DateTime.UtcNow);
            this._events.Add(new(streamEvent, version));
        }
    }

    public IEnumerable<StreamEvent> GetEvents(StreamReadPosition from, int count) {
        var selected = this._events.SkipWhile(x => x.Position < from.Value);

        if (count > 0) selected = selected.Take(count);

        return selected.Select(x => x.Event with { Revision = x.Position });
    }

    public IEnumerable<StreamEvent> GetEventsBackwards(StreamReadPosition from, int count) {
        var position = (int)from.Value;

        while (count-- > 0) {
            yield return this._events[position--].Event;
        }
    }

    public void Truncate(ExpectedStreamVersion version, StreamTruncatePosition position) {
        this.CheckVersion(version);
        this._events.RemoveAll(x => x.Position <= position.Value);
    }
}

public class WrongVersion(ExpectedStreamVersion expected, int actual) : Exception($"Wrong stream version. Expected {expected.Value}, actual {actual}");

public class NoOpCheckpointStore(ulong? start = null) : ICheckpointStore
{
    Checkpoint _start = new("", start);

    public ValueTask<Checkpoint> GetLastCheckpoint(string checkpointId, CancellationToken cancellationToken) {
        var checkpoint = this._start with { Id = checkpointId };
        //Logger.Current.CheckpointLoaded(this, checkpoint);

        return new(checkpoint);
    }

    public ValueTask<Checkpoint> StoreCheckpoint(Checkpoint checkpoint, bool force, CancellationToken cancellationToken) {
        this._start = checkpoint;
        CheckpointStored?.Invoke(this, checkpoint);
        //Logger.Current.CheckpointStored(this, checkpoint, force);

        return new(checkpoint);
    }

    public event EventHandler<Checkpoint>? CheckpointStored;
}