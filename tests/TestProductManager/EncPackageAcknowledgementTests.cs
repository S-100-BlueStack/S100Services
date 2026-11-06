using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Jobs;
using ProductCatalogueAPI.Services.Locking;
using S100FC.ProductCatalogue;
using System.Reflection;

namespace TestProductCatalogueAPI;

public sealed class EncPackageAcknowledgementTests
{
    [Fact]
    public async Task PublicationFailureLeavesSqlPendingAndDpcCanRetry() {
        var package = new EncPackagePublication(Guid.NewGuid(), "DK1TEST", 4, 0, "101DK001TEST", 1, 0, DateTime.UtcNow,
            "shared yaml", "index"u8.ToArray(), "signature"u8.ToArray());
        var repository = new RecordingAcknowledgementRepository(package) { FailNextCompletion = true };
        var products = DispatchProxy.Create<IElectronicProductManager, RecordingElectronicProducts>();
        var recorder = (RecordingElectronicProducts)(object)products;
        var service = new EncPackageFinalizationService(repository, new FakeManager(products), new AvailableLockService(),
            TimeProvider.System, NullLogger<EncPackageFinalizationService>.Instance);

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.FinalizeAsync(package.PackageId, CancellationToken.None));
        Assert.Equal(1, recorder.PublicationCalls);
        Assert.False(repository.Completed);

        await service.FinalizePendingAsync(CancellationToken.None);
        Assert.Equal(2, recorder.PublicationCalls);
        Assert.True(repository.Completed);
    }

    [Fact]
    public async Task UnacceptedPackageDoesNotPublishEitherProduct() {
        var repository = new RecordingAcknowledgementRepository(null);
        var products = DispatchProxy.Create<IElectronicProductManager, RecordingElectronicProducts>();
        var service = new EncPackageFinalizationService(repository, new FakeManager(products), new AvailableLockService(),
            TimeProvider.System, NullLogger<EncPackageFinalizationService>.Instance);

        await service.FinalizeAsync(Guid.NewGuid(), CancellationToken.None);

        Assert.Equal(0, ((RecordingElectronicProducts)(object)products).PublicationCalls);
        Assert.False(repository.Completed);
    }

    private sealed class RecordingAcknowledgementRepository(EncPackagePublication? publication) : IEncPackageAcknowledgementRepository
    {
        public bool FailNextCompletion { get; set; }
        public bool Completed { get; private set; }
        public Task<IcEncAcknowledgementResult?> RecordAsync(IcEncAcknowledgement acknowledgement, DateTime nowUtc, CancellationToken cancellationToken) =>
            throw new NotSupportedException();
        public Task<IReadOnlyList<Guid>> GetPendingAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<Guid>>(Completed || publication is null ? [] : [publication.PackageId]);
        public Task<EncPackagePublication?> GetPublicationAsync(Guid packageId, CancellationToken cancellationToken) =>
            Task.FromResult(publication?.PackageId == packageId && !Completed ? publication : null);
        public Task CompleteAsync(EncPackagePublication value, DateTime nowUtc, CancellationToken cancellationToken) {
            if (FailNextCompletion) {
                FailNextCompletion = false;
                throw new InvalidOperationException("System database unavailable");
            }
            Completed = true;
            return Task.CompletedTask;
        }
    }

    private sealed class FakeManager(IElectronicProductManager products) : IProductManager
    {
        public IElectronicProductManager ElectronicProductManager => products;
        public INauticalProductManager NauticalProductManager => throw new NotSupportedException();
    }

    public class RecordingElectronicProducts : DispatchProxy
    {
        public int PublicationCalls { get; private set; }
        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) {
            if (targetMethod?.Name != nameof(IElectronicProductManager.PublishAcceptedEncPackageAsync))
                throw new NotSupportedException(targetMethod?.Name);
            PublicationCalls++;
            return Task.CompletedTask;
        }
    }

    private sealed class AvailableLockService : IDatasetLockService
    {
        public Task<IAsyncDisposable?> TryAcquireAsync(string datasetName, CancellationToken cancellationToken = default) =>
            Task.FromResult<IAsyncDisposable?>(new Handle());
        private sealed class Handle : IAsyncDisposable
        {
            public ValueTask DisposeAsync() => ValueTask.CompletedTask;
        }
    }
}
