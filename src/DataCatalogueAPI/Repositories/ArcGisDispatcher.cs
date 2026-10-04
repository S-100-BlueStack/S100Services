using System.Collections.Concurrent;

namespace DataCatalague.Api.Repositories
{
    public sealed class ArcGisDispatcher : IDisposable
    {
        private readonly BlockingCollection<Func<Task>> _queue = new();
        private readonly Thread _thread;

        public ArcGisDispatcher() {
            _thread = new Thread(Run) {
                IsBackground = true,
                Name = "ArcGIS Thread"
            };

            _thread.Start();
        }

        private void Run() {            
            ArcGIS.Core.Hosting.Host.Initialize();  // Initialize ONCE on the ArcGIS thread.

            foreach (Func<Task> work in _queue.GetConsumingEnumerable()) {
                work().GetAwaiter().GetResult();
            }
        }

        public Task<T> ExecuteAsync<T>(Func<T> action) {
            TaskCompletionSource<T> tcs =
                new(TaskCreationOptions.RunContinuationsAsynchronously);

            _queue.Add(() => {
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
            _queue.CompleteAdding();
            _thread.Join();
            _queue.Dispose();
        }
    }
}
