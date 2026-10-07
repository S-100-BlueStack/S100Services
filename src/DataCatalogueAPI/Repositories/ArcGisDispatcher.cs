using System.Collections.Concurrent;

namespace DataCatalague.Api.Repositories
{
    public sealed class ArcGisDispatcher : IDisposable
    {
        private readonly BlockingCollection<Func<Task>> _queue = [];
        private readonly Thread _thread;

        public ArcGisDispatcher() {
            this._thread = new Thread(this.Run) {
                IsBackground = true,
                Name = "ArcGIS Thread"
            };

            this._thread.Start();
        }

        private void Run() {
            ArcGIS.Core.Hosting.Host.Initialize();  // Initialize ONCE on the ArcGIS thread.

            foreach (Func<Task> work in this._queue.GetConsumingEnumerable()) {
                work().GetAwaiter().GetResult();
            }
        }

        public Task<T> ExecuteAsync<T>(Func<T> action) {
            TaskCompletionSource<T> tcs =
                new(TaskCreationOptions.RunContinuationsAsynchronously);

            this._queue.Add(() => {
                try {
                    T result = action();
                    tcs.SetResult(result);
                }
                catch (Exception ex) {
                    tcs.SetException(ex);
                }

                return Task.CompletedTask;
            });

            return tcs.Task;
        }

        public void Dispose() {
            this._queue.CompleteAdding();
            this._thread.Join();
            this._queue.Dispose();
        }
    }
}
