namespace ProductManagerAPI.Services.Locking
{
    public interface IDatasetLockService
    {
        Task<IAsyncDisposable> TryAcquireAsync(string datasetName, CancellationToken cancellationToken = default);
    }

    public sealed class DatasetLockService : IDatasetLockService
    {
        private readonly string _lockDirectory;

        public DatasetLockService() {
            _lockDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "ProductManager", "Locks");
            Directory.CreateDirectory(_lockDirectory);
        }

        public async Task<IAsyncDisposable?> TryAcquireAsync(string datasetName, CancellationToken cancellationToken = default) {
            var safeName = string.Join("_", datasetName.Split(Path.GetInvalidFileNameChars()));
            var lockPath = Path.Combine(_lockDirectory, $"{safeName}.lock");

            if (File.Exists(lockPath)) {
                var age = DateTime.UtcNow - File.GetCreationTimeUtc(lockPath);

                if (age > TimeSpan.FromMinutes(30))
                    File.Delete(lockPath);
            }

            try {
                var stream = new FileStream(lockPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
                await using var writer = new StreamWriter(stream, leaveOpen: true);

                await writer.WriteLineAsync(DateTimeOffset.UtcNow.ToString("O").AsMemory(), cancellationToken);
                await writer.FlushAsync(cancellationToken);

                return new FileLockHandle(lockPath, stream);
            }
            catch (IOException) {
                return null;
            }
        }

        private sealed class FileLockHandle(string lockPath, FileStream stream) : IAsyncDisposable
        {
            private readonly string _lockPath = lockPath;
            private readonly FileStream _stream = stream;

            public async ValueTask DisposeAsync() {
                await _stream.DisposeAsync();

                if (File.Exists(_lockPath))
                    File.Delete(_lockPath);
            }
        }
    }

    public sealed class DatasetLockedException(string datasetName) : Exception($"Dataset '{datasetName}' is already being processed.");
}