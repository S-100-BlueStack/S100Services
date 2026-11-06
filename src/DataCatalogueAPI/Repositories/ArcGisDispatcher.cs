using System.Collections.Concurrent;

namespace DataCatalague.Api.Repositories;

public sealed class ArcGisDispatcher : IDisposable
{
    private readonly BlockingCollection<Func<Task>> _queue = [];
    private readonly TaskCompletionSource _ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly Thread _thread;
    private int _disposed;

    public ArcGisDispatcher() {
        this._thread = new Thread(this.Run) { IsBackground = true, Name = "ArcGIS Thread" };
        this._thread.SetApartmentState(ApartmentState.STA);
        this._thread.Start();
    }

    private void Run() {
        try {
            ArcGIS.Core.Hosting.Host.Initialize();
            this._ready.SetResult();
        }
        catch (Exception exception) {
            // Propagate licensing/initialization failures to callers instead of leaving queued work hanging.
            this._ready.SetException(exception);
            return;
        }
        foreach (var work in this._queue.GetConsumingEnumerable()) { work().GetAwaiter().GetResult(); }
    }

    public async Task<T> ExecuteAsync<T>(Func<T> action) {
        ArgumentNullException.ThrowIfNull(action);
        await this._ready.Task.ConfigureAwait(false);
        ObjectDisposedException.ThrowIf(Volatile.Read(ref this._disposed) != 0, this);
        var completion = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        try {
            this._queue.Add(() => {
                try { completion.SetResult(action()); }
                catch (Exception exception) { completion.SetException(exception); }
                return Task.CompletedTask;
            });
        }
        catch (InvalidOperationException) when (Volatile.Read(ref this._disposed) != 0) {
            throw new ObjectDisposedException(nameof(ArcGisDispatcher));
        }
        return await completion.Task.ConfigureAwait(false);
    }

    public void Dispose() {
        if (Interlocked.Exchange(ref this._disposed, 1) != 0) { return; }
        this._queue.CompleteAdding();
        this._thread.Join();
        this._queue.Dispose();
    }
}
