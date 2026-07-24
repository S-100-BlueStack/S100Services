namespace ProductManagerAPI.Services.Locking
{
    public interface IDatasetLockService
    {
        Task<IAsyncDisposable?> TryAcquireAsync(
            string datasetName,
            CancellationToken cancellationToken = default
        );
    }

    public sealed class DatasetLockService : IDatasetLockService
    {
        private readonly string _lockDirectory;

        public DatasetLockService()
            : this(Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "ProductManager",
                "Locks"
            ))
        {
        }

        public DatasetLockService(string lockDirectory) {
            if (string.IsNullOrWhiteSpace(lockDirectory))
                throw new ArgumentException("A lock directory is required.", nameof(lockDirectory));

            _lockDirectory = lockDirectory;
            Directory.CreateDirectory(_lockDirectory);
        }

        public async Task<IAsyncDisposable?> TryAcquireAsync(
            string datasetName,
            CancellationToken cancellationToken = default
        ) {
            var lockPath = Path.Combine(
                _lockDirectory,
                BuildSafeLockFileName(datasetName)
            );

            FileStream stream;
            try {
                stream = new FileStream(
                    lockPath,
                    FileMode.OpenOrCreate,
                    FileAccess.ReadWrite,
                    FileShare.None,
                    bufferSize: 4096,
                    useAsync: true
                );
            }
            catch (IOException) {
                return null;
            }

            try {
                stream.SetLength(0);
                stream.Position = 0;

                await using (var writer = new StreamWriter(stream, leaveOpen: true)) {
                    var metadata = $"{DateTimeOffset.UtcNow:O}|{Environment.MachineName}|{Environment.ProcessId}";
                    await writer.WriteLineAsync(metadata.AsMemory(), cancellationToken);
                    await writer.FlushAsync(cancellationToken);
                }

                return new FileLockHandle(stream);
            }
            catch {
                await stream.DisposeAsync();
                throw;
            }
        }

        public static string BuildSafeLockFileName(string datasetName) {
            if (string.IsNullOrWhiteSpace(datasetName))
                throw new ArgumentException("A dataset name is required.", nameof(datasetName));

            var safeName = string.Join("_", datasetName.Trim().Split(Path.GetInvalidFileNameChars()));
            return $"{safeName}.lock";
        }

        private sealed class FileLockHandle(FileStream stream) : IAsyncDisposable
        {
            private FileStream? _stream = stream;

            public async ValueTask DisposeAsync() {
                var ownedStream = Interlocked.Exchange(ref _stream, null);
                if (ownedStream != null)
                    await ownedStream.DisposeAsync();
            }
        }
    }

    public sealed class DatasetLockedException(string datasetName)
        : Exception($"Dataset '{datasetName}' is already being processed.");
}
