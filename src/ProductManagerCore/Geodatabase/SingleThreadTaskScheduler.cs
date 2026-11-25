using System.Collections.Concurrent;

namespace S100FC.ProductCatalogue;

/// <summary>Runs ArcGIS calls on one STA thread so geodatabase work stays on its owning execution lane.</summary>
public sealed class SingleThreadTaskScheduler : TaskScheduler, IDisposable
{
    private readonly BlockingCollection<Task> _tasks;
    private readonly Thread _processingThread;

    /// <summary>Starts the STA thread that owns scheduled ArcGIS work.</summary>
    /// <param name="threadName">Name used to identify the execution lane in diagnostics.</param>
    /// <exception cref="ArgumentException">The thread name is empty.</exception>
    public SingleThreadTaskScheduler(string threadName = "SingleThreadTaskScheduler") {
        if (string.IsNullOrWhiteSpace(threadName))
            throw new ArgumentException("A scheduler thread name is required.", nameof(threadName));

        this._tasks = [];

        this._processingThread = new Thread(this.ProcessTasks) {
            IsBackground = true, // Allow the application to exit even if this thread is running
            Name = threadName
        };
        this._processingThread.SetApartmentState(ApartmentState.STA);
        this._processingThread.Start();
    }

    private void ProcessTasks() {
        try {
            foreach (var task in this._tasks.GetConsumingEnumerable()) {
                this.TryExecuteTask(task);
            }
        }
        catch (ObjectDisposedException) {
            // The collection was disposed, which is fine. The thread can exit.
        }
    }

    protected override void QueueTask(Task task) {
        if (this._tasks.IsAddingCompleted) return;
        this._tasks.Add(task);
    }

    protected override bool TryExecuteTaskInline(Task task, bool taskWasPreviouslyQueued) {
        if (Thread.CurrentThread == this._processingThread) {
            return this.TryExecuteTask(task);
        }

        // Otherwise, we cannot execute it inline. Let QueueTask handle it.
        return false;
    }

    protected override IEnumerable<Task> GetScheduledTasks() {
        return this._tasks.ToArray();
    }

    public override int MaximumConcurrencyLevel => 1;

    /// <summary>Drains scheduled work and joins the STA thread before releasing its queue.</summary>
    public void Dispose() {
        this._tasks.CompleteAdding();
        this._processingThread.Join();
        this._tasks.Dispose();
    }
}
