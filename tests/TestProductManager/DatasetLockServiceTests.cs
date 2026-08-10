using ProductCatalogueAPI.Services.Locking;

namespace TestProductCatalogueAPI
{
    public class DatasetLockServiceTests : IDisposable
    {
        private readonly string _directory = Path.Combine(
            Path.GetTempPath(),
            "ProductManagerTests",
            Guid.NewGuid().ToString("N")
        );

        public DatasetLockServiceTests() {
            Directory.CreateDirectory(_directory);
        }

        [Fact]
        public async Task ExistingUnlockedLockFileCanBeAcquiredAndRemainsPersistent() {
            var path = LockPath("101DK001");
            await File.WriteAllTextAsync(path, "old metadata");
            var service = new DatasetLockService(_directory);

            await using (var handle = await service.TryAcquireAsync("101DK001")) {
                Assert.NotNull(handle);
                Assert.True(File.Exists(path));
            }

            Assert.True(File.Exists(path));
            var metadata = await File.ReadAllTextAsync(path);
            Assert.DoesNotContain("old metadata", metadata);
        }

        [Fact]
        public async Task ActiveLockCannotBeAcquiredRegardlessOfFileAge() {
            var path = LockPath("101DK001");
            await File.WriteAllTextAsync(path, "old metadata");
            File.SetCreationTimeUtc(path, DateTime.UtcNow.AddHours(-2));
            var service = new DatasetLockService(_directory);

            await using var owner = await service.TryAcquireAsync("101DK001");
            var contender = await service.TryAcquireAsync("101DK001");

            Assert.NotNull(owner);
            Assert.Null(contender);
            Assert.True(File.Exists(path));
        }

        [Fact]
        public async Task ConcurrentAcquisitionProducesExactlyOneOwner() {
            var service = new DatasetLockService(_directory);

            var results = await Task.WhenAll(
                service.TryAcquireAsync("101DK001"),
                service.TryAcquireAsync("101DK001")
            );

            Assert.Equal(1, results.Count(result => result != null));
            Assert.Equal(1, results.Count(result => result == null));

            foreach (var result in results) {
                if (result != null)
                    await result.DisposeAsync();
            }
        }

        [Fact]
        public async Task DisposalReleasesOwnershipAndPathCanBeReacquired() {
            var service = new DatasetLockService(_directory);
            var first = await service.TryAcquireAsync("101DK001");
            Assert.NotNull(first);

            await first!.DisposeAsync();

            await using var second = await service.TryAcquireAsync("101DK001");
            Assert.NotNull(second);
            Assert.True(File.Exists(LockPath("101DK001")));
        }

        [Fact]
        public async Task CancellationDuringInitializationLeavesReusablePersistentFile() {
            var service = new DatasetLockService(_directory);
            using var cancellation = new CancellationTokenSource();
            cancellation.Cancel();

            await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
                service.TryAcquireAsync("101DK001", cancellation.Token)
            );

            Assert.True(File.Exists(LockPath("101DK001")));
            await using var next = await service.TryAcquireAsync("101DK001");
            Assert.NotNull(next);
        }

        [Fact]
        public async Task PriorOwnerCannotDeleteOrReleaseSuccessorOwnership() {
            var service = new DatasetLockService(_directory);
            var first = await service.TryAcquireAsync("101DK001");
            Assert.NotNull(first);
            await first!.DisposeAsync();

            await using var successor = await service.TryAcquireAsync("101DK001");
            Assert.NotNull(successor);

            await first.DisposeAsync();
            var contender = await service.TryAcquireAsync("101DK001");

            Assert.Null(contender);
            Assert.True(File.Exists(LockPath("101DK001")));
        }

        [Fact]
        public void PathNormalizationIsDeterministic() {
            var first = DatasetLockService.BuildSafeLockFileName(" 101DK001 ");
            var second = DatasetLockService.BuildSafeLockFileName(" 101DK001 ");

            Assert.Equal(first, second);
            Assert.True(first.EndsWith(".lock", StringComparison.Ordinal));
        }

        private string LockPath(string datasetName) => Path.Combine(
            _directory,
            DatasetLockService.BuildSafeLockFileName(datasetName)
        );

        public void Dispose() {
            if (Directory.Exists(_directory))
                Directory.Delete(_directory, recursive: true);
        }
    }
}
