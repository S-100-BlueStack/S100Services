using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;

namespace TestProductCatalogueAPI;

public sealed class EncPackageInterruptedExportRecoveryTests
{
    private static readonly DateTime StartedUtc = new(2026, 10, 19, 10, 7, 25, DateTimeKind.Utc);

    [Theory]
    [InlineData(ProductState.Exporting)]
    [InlineData(ProductState.Validating)]
    public async Task InterruptedCandidateIsMarkedErrorWithoutChangingItsVersionOrOtherMember(ProductState interruptedState) {
        var fixture = await CreateFixtureAsync(interruptedState);
        Assert.True(EncPackageDetectionService.IsRefreshBlocked(fixture.S101));

        var recovered = await fixture.RecoverAsync();

        Assert.Equal(1, recovered);
        Assert.Equal(ProductState.Error, fixture.S101.State);
        Assert.Equal<int?>(1, fixture.S101.CandidateEdition);
        Assert.Equal<int?>(0, fixture.S101.CandidateUpdate);
        Assert.Equal("ENC_EXPORT_INTERRUPTED", fixture.S101.ErrorCode);
        Assert.Equal(ProductState.ReadyForDistribution, fixture.S57.State);
        Assert.False(EncPackageDetectionService.IsRefreshBlocked(fixture.S101));
        Assert.Equal(0, await fixture.RecoverAsync());
    }

    [Fact]
    public async Task BothIncompletePackageMembersAreRecoveredIndependently() {
        var fixture = await CreateFixtureAsync(ProductState.Validating, ProductState.Exporting);

        var recovered = await fixture.RecoverAsync();

        Assert.Equal(2, recovered);
        Assert.Equal(ProductState.Error, fixture.S101.State);
        Assert.Equal(ProductState.Error, fixture.S57.State);
        Assert.NotNull(fixture.S101.CandidatePreviousState);
        Assert.NotNull(fixture.S57.CandidatePreviousState);
    }

    [Fact]
    public async Task ManualFreezeOrSubmittedMemberPreventsRecoveryOfEitherSide() {
        var held = await CreateFixtureAsync(ProductState.Validating);
        held.S101.IsManuallyFrozen = true;
        Assert.Equal(0, await held.RecoverAsync());
        Assert.Equal(ProductState.Validating, held.S101.State);

        var submitted = await CreateFixtureAsync(ProductState.Validating, ProductState.InTransit);
        Assert.Equal(0, await submitted.RecoverAsync());
        Assert.Equal(ProductState.Validating, submitted.S101.State);

        var rejected = await CreateFixtureAsync(ProductState.Validating, ProductState.Rejected);
        Assert.Equal(0, await rejected.RecoverAsync());
    }

    [Fact]
    public async Task MissingCandidateIdentityDoesNotAuthorizeARecovery() {
        var fixture = await CreateFixtureAsync(ProductState.Validating);
        fixture.S101.CandidateUpdate = null;

        Assert.Equal(0, await fixture.RecoverAsync());
        Assert.Equal(ProductState.Validating, fixture.S101.State);
    }

    [Fact]
    public async Task ReplacedPackageAndDiscardedMemberCannotBeRecovered() {
        var replaced = await CreateFixtureAsync(ProductState.Validating);
        replaced.StoredPackage = new EncPackage {
            Id = replaced.Package.Id,
            SourceDatasetName = replaced.Package.SourceDatasetName,
            S57DatasetName = "DIFFERENT-S57"
        };
        Assert.Equal(0, await replaced.RecoverAsync());

        var discarded = await CreateFixtureAsync(ProductState.Validating);
        discarded.StoredPackage = new EncPackage {
            Id = discarded.Package.Id,
            SourceDatasetName = discarded.Package.SourceDatasetName,
            S57DatasetName = discarded.Package.S57DatasetName,
            S101Discarded = true
        };
        Assert.Equal(0, await discarded.RecoverAsync());
    }

    [Fact]
    public async Task NoActivePackageOrCompletedExportIsNeverRecovered() {
        var missing = await CreateFixtureAsync(ProductState.Validating);
        missing.StoredPackage = null;
        Assert.Equal(0, await missing.RecoverAsync());

        var completed = await CreateFixtureAsync(ProductState.ReadyForDistribution);
        Assert.Equal(0, await completed.RecoverAsync());
        Assert.Equal(ProductState.ReadyForDistribution, completed.S101.State);
    }

    [Fact]
    public async Task ExpectedStateTimestampOrCandidateMismatchFailsClosed() {
        var fixture = await CreateFixtureAsync(ProductState.Validating);
        var workflow = fixture.Workflow;
        var current = fixture.S101;

        Assert.False(await workflow.TryFailInterruptedPackageExportAsync(
            fixture.Package.Id, current.Id, current.DatasetName, ProductSpecification.S101,
            ProductState.Exporting, current.UpdatedAtUtc, 1, 0, DateTime.UtcNow));
        Assert.False(await workflow.TryFailInterruptedPackageExportAsync(
            fixture.Package.Id, current.Id, current.DatasetName, ProductSpecification.S101,
            ProductState.Validating, current.UpdatedAtUtc.AddTicks(-1), 1, 0, DateTime.UtcNow));
        Assert.False(await workflow.TryFailInterruptedPackageExportAsync(
            fixture.Package.Id, current.Id, current.DatasetName, ProductSpecification.S101,
            ProductState.Validating, current.UpdatedAtUtc, 2, 0, DateTime.UtcNow));
        Assert.Equal(ProductState.Validating, current.State);
    }

    private static async Task<Fixture> CreateFixtureAsync(ProductState s101State,
        ProductState s57State = ProductState.ReadyForDistribution) {
        var workflow = new InMemoryProductRepository();
        var s101 = await workflow.GetOrCreateTrackAsync("101DK0020157C", ProductSpecification.S101,
            ExportEngineKind.IsoIec8211, 0, 0);
        var s57 = await workflow.GetOrCreateTrackAsync("DK20157C", ProductSpecification.S57,
            ExportEngineKind.IsoIec8211, 5, 2);
        await workflow.BeginExportAsync(s101.Id, 1, 0, "system", StartedUtc.AddSeconds(-1));
        await workflow.SetStateAsync(s101.Id, s101State, "system", StartedUtc);
        await workflow.BeginExportAsync(s57.Id, 6, 0, "system", StartedUtc.AddSeconds(-1));
        await workflow.SetStateAsync(s57.Id, s57State, "system", StartedUtc);
        var package = new EncPackage {
            Id = Guid.NewGuid(), SourceDatasetName = s101.DatasetName,
            S57DatasetName = s57.DatasetName,
            ScanFromUtc = StartedUtc.AddDays(-2), DetectedAtUtc = StartedUtc
        };
        return new Fixture(package, workflow, s101, s57);
    }

    private sealed class Fixture(EncPackage package, InMemoryProductRepository workflow,
        ProductExportTrackRecord s101, ProductExportTrackRecord s57) {
        public EncPackage Package { get; } = package;
        public InMemoryProductRepository Workflow { get; } = workflow;
        public ProductExportTrackRecord S101 { get; } = s101;
        public ProductExportTrackRecord S57 { get; } = s57;
        public EncPackage? StoredPackage { get; set; } = package;

        public Task<int> RecoverAsync() => EncPackageInterruptedExportRecovery.TryRecoverAsync(
            Package, Workflow, new PackageRepository(this), TimeProvider.System,
            NullLogger.Instance, CancellationToken.None);
    }

    private sealed class PackageRepository(Fixture fixture) : IEncPackageRepository {
        public Task<EncPackage?> GetByIdAsync(Guid packageId, CancellationToken cancellationToken = default) =>
            Task.FromResult(fixture.StoredPackage?.Id == packageId ? fixture.StoredPackage : null);
        public Task<EncPackageDiscardResult> TryDiscardPackageAsync(Guid expectedPackageId, string actor, DateTime nowUtc,
            CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<IReadOnlyDictionary<string, EncPackage>> GetActiveAsync(IEnumerable<string> sourceDatasetNames,
            CancellationToken cancellationToken = default, bool includeSourceYaml = true) => throw new NotSupportedException();
        public Task<DateTime?> GetReplayFromUtcAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<IReadOnlyDictionary<string, DateTime>> GetReplayBoundsAsync(CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task MarkReplayAsync(string sourceDatasetName, DateTime scanFromUtc,
            CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task ClearReplayAsync(string sourceDatasetName,
            CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<bool> TryCreateAsync(EncPackage package,
            CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task SetErrorAsync(Guid packageId, string message,
            CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task DiscardAsync(string datasetName, ProductSpecification specification,
            CancellationToken cancellationToken = default, bool preserveScanBound = false) => throw new NotSupportedException();
    }
}
