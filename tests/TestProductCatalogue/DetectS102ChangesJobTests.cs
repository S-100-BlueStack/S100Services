using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.BackgroundProcessing;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.BathymetricSurfaces;

namespace TestProductCatalogueAPI;

/// <summary>Verifies bathymetric surface checkpoint handling using in-memory storage and a fixed clock.</summary>
public sealed class DetectBathymetricSurfaceChangesJobTests
{
    private const string CheckpointKey = "DetectS102ChangesJob";
    private static readonly DateTime ScanThroughUtc = new(2026, 11, 24, 9, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime PreviousUtc = ScanThroughUtc.AddHours(-1);

    /// <summary>Only a completed scan advances the bathymetric surface row, independent of ENC state.</summary>
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task CompletedScanAdvancesBathymetricCheckpoint(bool hasPreviousCheckpoint) {
        var repository = new InMemoryProductRepository();
        var encUtc = PreviousUtc.AddMinutes(-5);
        DateTime? previous = hasPreviousCheckpoint ? PreviousUtc : null;
        await repository.SetSuccessfulRunUtcAsync(nameof(DetectProductChangesJob), encUtc);
        if (hasPreviousCheckpoint)
            await repository.SetSuccessfulRunUtcAsync(CheckpointKey, DateTime.SpecifyKind(PreviousUtc, DateTimeKind.Unspecified));

        using var cancellation = new CancellationTokenSource();
        var job = CreateJob(repository, new TestDetector(async (lastRunUtc, throughUtc, token) => {
            Assert.Equal(previous, lastRunUtc);
            Assert.Equal(hasPreviousCheckpoint ? DateTimeKind.Utc : (DateTimeKind?)null, lastRunUtc?.Kind);
            Assert.Equal(previous, await repository.GetLastSuccessfulRunUtcAsync(CheckpointKey));
            Assert.Equal(ScanThroughUtc, throughUtc);
            Assert.Equal(DateTimeKind.Utc, throughUtc.Kind);
            Assert.Equal(cancellation.Token, token);
        }));

        await job.RunAsync(cancellation.Token);

        Assert.Equal(ScanThroughUtc, await repository.GetLastSuccessfulRunUtcAsync(CheckpointKey));
        Assert.Equal(encUtc, await repository.GetLastSuccessfulRunUtcAsync(nameof(DetectProductChangesJob)));
    }

    /// <summary>The unfinished detector fails without saving a successful scan.</summary>
    [Fact]
    public async Task UnimplementedDetectorPreservesCheckpoint() {
        var repository = new InMemoryProductRepository();
        await repository.SetSuccessfulRunUtcAsync(CheckpointKey, PreviousUtc);
        var job = CreateJob(repository, new BathymetricSurfaceChangeDetector());

        await Assert.ThrowsAsync<NotImplementedException>(() => job.RunAsync(CancellationToken.None));

        Assert.Equal(PreviousUtc, await repository.GetLastSuccessfulRunUtcAsync(CheckpointKey));
    }

    /// <summary>Cancellation observed after detection still prevents the checkpoint write.</summary>
    [Fact]
    public async Task CancelledScanPreservesCheckpoint() {
        var repository = new InMemoryProductRepository();
        await repository.SetSuccessfulRunUtcAsync(CheckpointKey, PreviousUtc);
        using var cancellation = new CancellationTokenSource();
        var job = CreateJob(repository, new TestDetector((_, _, _) => {
            cancellation.Cancel();
            return Task.CompletedTask;
        }));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => job.RunAsync(cancellation.Token));

        Assert.Equal(PreviousUtc, await repository.GetLastSuccessfulRunUtcAsync(CheckpointKey));
    }

    /// <summary>A worker clock behind the saved boundary cannot move it backwards.</summary>
    [Fact]
    public async Task ClockBehindCheckpointDefersScan() {
        var repository = new InMemoryProductRepository();
        var futureUtc = ScanThroughUtc.AddMinutes(1);
        await repository.SetSuccessfulRunUtcAsync(CheckpointKey, futureUtc);
        var job = CreateJob(repository, new BathymetricSurfaceChangeDetector());

        await job.RunAsync(CancellationToken.None);

        Assert.Equal(futureUtc, await repository.GetLastSuccessfulRunUtcAsync(CheckpointKey));
    }

    /// <summary>Creates a job whose scan bound stays fixed while the detector runs.</summary>
    private static IBackgroundJob CreateJob(IProductRepository repository, IBathymetricSurfaceChangeDetector detector) =>
        new DetectBathymetricSurfaceChangesJob(repository, detector, new FixedClock(ScanThroughUtc), NullLogger<DetectBathymetricSurfaceChangesJob>.Instance);

    /// <summary>Supplies a fixed UTC upper bound for checkpoint assertions.</summary>
    private sealed class FixedClock(DateTimeOffset utcNow) : TimeProvider
    {
        /// <inheritdoc/>
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    /// <summary>Runs a test callback at the source detection boundary.</summary>
    private sealed class TestDetector(Func<DateTime?, DateTime, CancellationToken, Task> detect) : IBathymetricSurfaceChangeDetector
    {
        /// <inheritdoc/>
        public Task DetectAsync(DateTime? lastSuccessfulRunUtc, DateTime scanThroughUtc, CancellationToken cancellationToken) =>
            detect(lastSuccessfulRunUtc, scanThroughUtc, cancellationToken);
    }
}
