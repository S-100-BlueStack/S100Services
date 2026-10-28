using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.Operations;
using ProductCatalogueAPI.Services.SevenCs;
using S100FC.ProductCatalogue;
using System.Collections;
using System.Net.Sockets;
using static ProductCatalogueAPI.Services.SevenCs.SevenCsService;
using YamlDataset = S100FC.YAML.Dataset;

namespace TestProductCatalogueAPI;

public sealed class ExportOperationServiceTests
{
    [Fact]
    public async Task NewEditionUsesReadOnlySnapshotAndStopsBeforeS128Publication() {
        var products = new RecordingElectronicProductManager();
        var repository = new RecordingWorkflowRepository();
        var engine = new RecordingExportEngine();
        var service = CreateService(products, repository, engine, new SummaryResponse());

        var result = await service.ExecuteExportAsync("101DK001", ExportRevisionType.NewEdition, "developer");

        Assert.Equal(ExportOperationContract.ExportCompletedCode, result.Code);
        Assert.Equal(1, products.SnapshotCalls);
        Assert.Equal(0, products.AttachmentCalls);
        Assert.Equal((5, 0), products.LastSnapshotVersion);
        Assert.Equal(ProductState.ReadyForDistribution, repository.Track.State);
        Assert.Equal(1, engine.ExportCalls);
        Assert.Single(repository.Revisions);
    }

    [Fact]
    public async Task PackageExportUsesPersistedSharedYamlWithoutTakingAnotherSnapshot() {
        var products = new RecordingElectronicProductManager();
        var repository = new RecordingWorkflowRepository();
        var engine = new RecordingExportEngine();
        var service = CreateService(products, repository, engine, new SummaryResponse());

        await service.ExecutePackageExportAsync("DK3BIDQE", ExportRevisionType.NewEdition, "shared-enc-yaml", "summary-yaml");

        Assert.Equal(0, products.SnapshotCalls);
        Assert.Equal("shared-enc-yaml", engine.LastRequest?.DatasetYaml);
        Assert.Equal("101DK001", engine.LastRequest?.SourceDatasetName);
        Assert.Equal("summary-yaml", Assert.Single(repository.Revisions).ChangeSummaryYaml);
    }

    [Fact]
    public async Task CriticalValidationFindingsPersistSummaryAndDiagnostics() {
        var repository = new RecordingWorkflowRepository();
        var diagnostic = new SevenCsDiagnosticArtifact("101DK001.vld", "text/plain", "validation details"u8.ToArray());
        var service = CreateService(new RecordingElectronicProductManager(), repository, new RecordingExportEngine(), new SummaryResponse { Errors = 3, Critical = 2 }, [diagnostic]);

        var exception = await Assert.ThrowsAsync<ExportValidationException>(() => service.ExecuteExportAsync("101DK001", ExportRevisionType.Update, null));

        Assert.Equal(ProductState.Error, repository.Track.State);
        Assert.Equal("SEVENCS_VALIDATION_FAILED", repository.LastErrorCode);
        Assert.Contains("3 errors and 2 critical findings", exception.PublicMessage);
        Assert.Equal(exception.PublicMessage, repository.LastErrorMessage);
        Assert.DoesNotContain(repository.Artifacts, artifact => artifact.Kind == ProductArtifactKind.ValidationReport);
        Assert.Contains(repository.Artifacts, artifact => artifact.Kind == ProductArtifactKind.ValidationDiagnostic && artifact.FileName == "101DK001.vld");
    }

    [Fact]
    public async Task NonCriticalFindingsAllowExportToBeReadyForDistribution() {
        var repository = new RecordingWorkflowRepository();
        var diagnostic = new SevenCsDiagnosticArtifact("101DK001.vld", "text/plain", "validation details"u8.ToArray());
        var service = CreateService(new RecordingElectronicProductManager(), repository, new RecordingExportEngine(), new SummaryResponse { Errors = 3, ShallowIsolatedDangersUpdatedBathy = true }, [diagnostic]);

        await service.ExecuteExportAsync("101DK001", ExportRevisionType.Update, null);

        Assert.Equal(ProductState.ReadyForDistribution, repository.Track.State);
        Assert.Null(repository.LastErrorMessage);
        Assert.Contains(repository.Artifacts, artifact => artifact.Kind == ProductArtifactKind.ValidationDiagnostic && artifact.FileName == "101DK001.vld");
    }

    [Fact]
    public async Task SevenCsTimeoutFailsTheS101CandidateInsteadOfMarkingItReady() {
        var repository = new RecordingWorkflowRepository();
        var timeout = new HttpRequestException("SevenCs timed out", new SocketException((int)SocketError.TimedOut));
        var service = CreateService(new RecordingElectronicProductManager(), repository, new RecordingExportEngine(), new SummaryResponse(), validationFailure: timeout);

        var error = await Assert.ThrowsAsync<ExportValidationException>(() => service.ExecutePackageExportAsync("101DK001", ExportRevisionType.NewEdition, "shared-yaml", "summary-yaml"));

        Assert.Equal("SEVENCS_VALIDATION_UNAVAILABLE", error.Code);
        Assert.Equal(ProductState.Error, repository.Track.State);
        Assert.Equal(error.PublicMessage, repository.LastErrorMessage);
    }

    [Fact]
    public async Task FrozenCanOnlyBeClearedByTheUserFlowAndBlocksExportBeforeMutation() {
        var repository = new RecordingWorkflowRepository { InitialState = ProductState.Frozen };
        var products = new RecordingElectronicProductManager();
        var service = CreateService(products, repository, new RecordingExportEngine(), new SummaryResponse());
        var guardCalled = false;

        await Assert.ThrowsAsync<ExportOperationRejectedException>(() => service.ExecuteExportAsync("101DK001", ExportRevisionType.NewEdition, null, beforeMutation: () => guardCalled = true));

        Assert.False(guardCalled);
        Assert.Equal(0, products.SnapshotCalls);
        Assert.Equal(ProductState.Frozen, repository.Track.State);
    }

    [Fact]
    public async Task DiscardRestoresThePreviousStateAndClearsOnlyTheSqlCandidateAndFilesystemOutput() {
        var repository = new RecordingWorkflowRepository { CandidateEdition = 5, CandidateUpdate = 0, InitialState = ProductState.ReadyForDistribution };
        var products = new RecordingElectronicProductManager();
        var engine = new RecordingExportEngine();
        var service = CreateService(products, repository, engine, new SummaryResponse());

        var result = await service.ExecuteDiscardAsync("101DK001", "developer");

        Assert.Equal(ExportOperationContract.DiscardCompletedCode, result.Code);
        Assert.Equal(ProductState.ReadyForDistribution, repository.Track.State);
        Assert.Null(repository.Track.CandidateEdition);
        Assert.Null(repository.Track.CandidatePreviousState);
        Assert.Equal(1, engine.DeleteCalls);
        Assert.Equal(0, products.SnapshotCalls);
        Assert.Equal(0, products.AttachmentCalls);
    }

    [Fact]
    public async Task DiscardRestoresPreviousStateAndPreservesManualHold() {
        var repository = new RecordingWorkflowRepository { CandidateEdition = 5, CandidateUpdate = 0, InitialState = ProductState.ChangesDetected };
        var track = await repository.GetTrackAsync("101DK001", ProductSpecification.S101);
        track!.IsManuallyFrozen = true;
        var products = new RecordingElectronicProductManager();
        var engine = new RecordingExportEngine();
        var service = CreateService(products, repository, engine, new SummaryResponse());

        await service.ExecuteDiscardAsync("101DK001", "developer");

        Assert.Equal(ProductState.ChangesDetected, repository.Track.State);
        Assert.True(repository.Track.IsManuallyFrozen);
        Assert.Null(repository.Track.CandidateEdition);
        Assert.Null(repository.Track.CandidatePreviousState);
        Assert.Equal(1, engine.DeleteCalls);
        Assert.Equal(0, products.SnapshotCalls);
        Assert.Equal(0, products.AttachmentCalls);
    }

    [Fact]
    public async Task DiscardAcknowledgesFailureBeforeCandidateCreationAndDoesNotReplayUnchangedPackage() {
        var repository = new RecordingWorkflowRepository { InitialState = ProductState.Error };
        var packages = new RecordingPackageRepository();
        var engine = new RecordingExportEngine();
        var service = CreateService(new RecordingElectronicProductManager(), repository, engine, new SummaryResponse(), packages: packages);

        await service.ExecuteDiscardAsync("101DK001", "developer");

        Assert.Equal(ProductState.Idle, repository.Track.State);
        Assert.Null(repository.Track.CandidateEdition);
        Assert.Equal(0, engine.DeleteCalls);
        Assert.Equal(1, packages.DiscardCalls);
        Assert.False(packages.PreserveScanBound);
    }

    [Fact]
    public async Task FailedTrackWithoutCandidateCanBeResetByRepository() {
        var repository = new InMemoryProductRepository();
        var track = await repository.GetOrCreateTrackAsync("101DK001", ProductSpecification.S101, ExportEngineKind.IsoIec8211, 4, 2);
        await repository.SetStateAsync(track.Id, ProductState.Error, "system", DateTime.UtcNow, "ENC_CANDIDATE_FAILED", "Build failed before candidate creation");

        await repository.DiscardCandidateAsync(track.Id, "developer", DateTime.UtcNow);

        var restored = await repository.GetTrackAsync("101DK001", ProductSpecification.S101);
        Assert.Equal(ProductState.Idle, restored!.State);
        Assert.Null(restored.CandidateEdition);
    }

    [Fact]
    public async Task InternalRefreshPreservesScanBoundWhenDiscardingItsReadyCandidate() {
        var repository = new RecordingWorkflowRepository { CandidateEdition = 5, CandidateUpdate = 0, InitialState = ProductState.ReadyForDistribution };
        var packages = new RecordingPackageRepository();
        var service = CreateService(new RecordingElectronicProductManager(), repository, new RecordingExportEngine(), new SummaryResponse(), packages: packages);

        await service.ExecuteDiscardAsync("101DK001", "system", preservePackageScanBound: true);

        Assert.True(packages.PreserveScanBound);
    }

    [Fact]
    public async Task S57ExportUsesProductMappingInsteadOfDerivingTheDatasetName() {
        var products = new RecordingElectronicProductManager();
        var repository = new RecordingWorkflowRepository();
        var engine = new RecordingExportEngine();
        var service = CreateService(products, repository, engine, new SummaryResponse());

        await service.ExecuteExportAsync("DK3BIDQE", ExportRevisionType.NewEdition, "developer");

        Assert.Equal("DK3BIDQE", repository.Track.DatasetName);
        Assert.Equal("101DK001", products.LastSnapshotDatasetName);
        Assert.Equal("DK3BIDQE", engine.LastRequest!.DatasetName);
        Assert.Equal("101DK001", engine.LastRequest.SourceDatasetName);
    }

    [Fact]
    public async Task CancellationDuringSnapshotLeavesTrackInErrorAndNeverReportsSuccess() {
        using var cancellation = new CancellationTokenSource();
        var products = new RecordingElectronicProductManager {
            CancelDuringSnapshot = cancellation
        };
        var repository = new RecordingWorkflowRepository();
        var engine = new RecordingExportEngine();
        var service = CreateService(products, repository, engine, new SummaryResponse());

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            service.ExecuteExportAsync(
                "101DK001",
                ExportRevisionType.NewEdition,
                "developer",
                cancellationToken: cancellation.Token
            )
        );

        Assert.Equal(ProductState.Error, repository.Track.State);
        Assert.Equal(ExportJobContract.OperationCancelledCode, repository.LastErrorCode);
        Assert.Equal(1, products.SnapshotCalls);
        Assert.Empty(repository.Revisions);
        Assert.Equal(0, engine.ExportCalls);
    }

    private static TestExportOperationService CreateService(RecordingElectronicProductManager products, RecordingWorkflowRepository repository, RecordingExportEngine engine, SummaryResponse validation, IReadOnlyList<SevenCsDiagnosticArtifact>? diagnostics = null, Exception? validationFailure = null, IEncPackageRepository? packages = null) => new(
        new FakeProductManager(products), new ExportEngineRegistry([engine]), repository, new FakeSevenCsService(validation, diagnostics ?? [], validationFailure),
        new FixedTimeProvider(DateTimeOffset.Parse("2026-08-10T20:00:00Z")), "dataset-yaml", packages);

    private sealed class TestExportOperationService(IProductManager productManager, IExportEngineRegistry engines, IProductWorkflowRepository repository, ISevenCsService sevenCs, TimeProvider timeProvider, string yaml, IEncPackageRepository? packages)
        : ExportOperationService(productManager, engines, repository, sevenCs, timeProvider, NullLogger<ExportOperationService>.Instance, packages)
    {
        protected override string SerializeDataset(YamlDataset dataset) => yaml;
    }

    private sealed class FakeProductManager(IElectronicProductManager electronicProductManager) : IProductManager
    {
        public INauticalProductManager NauticalProductManager => null!;
        public IElectronicProductManager ElectronicProductManager { get; } = electronicProductManager;
    }

    private sealed class RecordingElectronicProductManager : IElectronicProductManager
    {
        public int SnapshotCalls { get; private set; }
        public int AttachmentCalls { get; private set; }
        public CancellationTokenSource? CancelDuringSnapshot { get; init; }
        public (int Edition, int Update) LastSnapshotVersion { get; private set; }
        public string? LastSnapshotDatasetName { get; private set; }
        public string OutputFolder => "output";
        public Task<ElectronicProductVersion?> ReadElectronicProductVersionAsync(string datasetName, CancellationToken cancellationToken = default) => Task.FromResult<ElectronicProductVersion?>(new(datasetName, 4, 2));
        public Task<YamlDataset> CreateExportSnapshotAsync(string name, ExportTypes exportType, int edition, int update, CancellationToken cancellationToken = default) {
            SnapshotCalls++;
            LastSnapshotDatasetName = name;
            LastSnapshotVersion = (edition, update);
            CancelDuringSnapshot?.Cancel();
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult<YamlDataset>(null!);
        }
        public Task CreateAttachmentAsync(string name, ExportTypes exportType, string yaml, string index, string sign) { AttachmentCalls++; return Task.CompletedTask; }
        public Task CreateS57AttachmentAsync(string name, ExportTypes exportType, string yaml) { AttachmentCalls++; return Task.CompletedTask; }
        public S100FC.S128.FeatureTypes.ElectronicProduct? ElectronicProduct(string name) => null;
        public S100FC.S128.FeatureTypes.ElectronicProduct? ElectronicProduct(string name, string productSpecification) => null;
        public S100FC.S128.FeatureTypes.ElectronicProduct? ResolveExportProduct(string name) => name == "DK3BIDQE"
            ? new S100FC.S128.FeatureTypes.ElectronicProduct { datasetName = "DK3BIDQE", productSpecification = new S100FC.S128.ComplexAttributes.productSpecification { name = "S-57" } }
            : new S100FC.S128.FeatureTypes.ElectronicProduct { datasetName = "101DK001", productSpecification = new S100FC.S128.ComplexAttributes.productSpecification { name = "S-101" } };
        public IReadOnlyList<S100FC.S128.FeatureTypes.ElectronicProduct> GetMappedElectronicProducts(string name, string productSpecification) => name == "DK3BIDQE" && productSpecification == "S101"
            ? [new S100FC.S128.FeatureTypes.ElectronicProduct { datasetName = "101DK001", productSpecification = new S100FC.S128.ComplexAttributes.productSpecification { name = "S-101" } }]
            : [];
        public IEnumerator<string> GetEnumerator() => Array.Empty<string>().AsEnumerable().GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
        public Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, int? specificUsage, string boundary, string? ProductMapping, int? optimumDisplayScale = null) => throw new NotSupportedException();
        public Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, string boundary, int edition, int update, byte[] zipfile) => throw new NotSupportedException();
        public Task<YamlDataset> CreateNewDatasetAsync(string name) => throw new NotSupportedException();
        public Task<YamlDataset> CreateNewEditionAsync(string name) => throw new NotSupportedException();
        public Task<YamlDataset> CreateNewUpdateAsync(string name) => throw new NotSupportedException();
        public Task<YamlDataset> ReissueAsync(string name) => throw new NotSupportedException();
        public Task<Dictionary<string, string>> GetDatasetAOIs() => throw new NotSupportedException();
        public Task<Dictionary<string, string>> GetDatasetAOIs(string productSpecification) => throw new NotSupportedException();
        public Task<bool> IsDirtyAsync(string name) => throw new NotSupportedException();
        public Task<string> GetDatasetBoundary(string name) => throw new NotSupportedException();
        public Task<Dictionary<string, ArchiveRow>> GetPendingEditsAsync(string name) => throw new NotSupportedException();
        public Task<Dictionary<string, Dictionary<string, ArchiveRow>>> GetPendingEditsAsync(DateTime sinceUtc) => throw new NotSupportedException();
        public Task<(string yaml, string index)> GetLatestDatasetYAML(string name, int edition) => throw new NotSupportedException();
    }

    private sealed class RecordingExportEngine : IExportEngine
    {
        public ExportEngineKind Kind => ExportEngineKind.IsoIec8211;
        public int ExportCalls { get; private set; }
        public int DeleteCalls { get; private set; }
        public ExportEngineRequest? LastRequest { get; private set; }
        public bool Supports(ProductSpecification productSpecification) => productSpecification is ProductSpecification.S57 or ProductSpecification.S101;
        public Task<ExportEngineResult> ExportAsync(ExportEngineRequest request, CancellationToken cancellationToken = default) { ExportCalls++; LastRequest = request; return Task.FromResult(new ExportEngineResult("output", [])); }
        public Task DeleteOutputAsync(ExportOutputIdentity output, CancellationToken cancellationToken = default) { DeleteCalls++; return Task.CompletedTask; }
    }

    private sealed class RecordingPackageRepository : IEncPackageRepository
    {
        public int DiscardCalls { get; private set; }
        public bool PreserveScanBound { get; private set; }
        public Task<IReadOnlyDictionary<string, EncPackage>> GetActiveAsync(IEnumerable<string> sourceDatasetNames, CancellationToken cancellationToken = default, bool includeSourceYaml = true) =>
            Task.FromResult<IReadOnlyDictionary<string, EncPackage>>(new Dictionary<string, EncPackage> {
                ["101DK001"] = new() { Id = Guid.NewGuid(), SourceDatasetName = "101DK001", S57DatasetName = "DK3BIDQE", ErrorMessage = "Failed export" }
            });
        public Task<DateTime?> GetReplayFromUtcAsync(CancellationToken cancellationToken = default) => Task.FromResult<DateTime?>(null);
        public Task<IReadOnlyDictionary<string, DateTime>> GetReplayBoundsAsync(CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyDictionary<string, DateTime>>(new Dictionary<string, DateTime>());
        public Task MarkReplayAsync(string sourceDatasetName, DateTime scanFromUtc, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<bool> TryCreateAsync(EncPackage package, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task SetErrorAsync(Guid packageId, string message, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task DiscardAsync(string datasetName, ProductSpecification specification, CancellationToken cancellationToken = default, bool preserveScanBound = false) { DiscardCalls++; PreserveScanBound = preserveScanBound; return Task.CompletedTask; }
        public Task ReleaseAcceptedAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;
    }

    private sealed class RecordingWorkflowRepository : IProductWorkflowRepository
    {
        public ProductState InitialState { get; init; } = ProductState.Idle;
        public int? CandidateEdition { get; init; }
        public int? CandidateUpdate { get; init; }
        public ProductExportTrackRecord Track { get; private set; } = null!;
        public List<ProductRevisionWrite> Revisions { get; } = [];
        public List<ProductArtifactWrite> Artifacts { get; } = [];
        public string? LastErrorCode { get; private set; }
        public string? LastErrorMessage { get; private set; }

        public Task<ProductExportTrackRecord?> GetTrackAsync(string datasetName, ProductSpecification productSpecification, CancellationToken cancellationToken = default) => Task.FromResult<ProductExportTrackRecord?>(EnsureTrack(datasetName, productSpecification));
        public Task<ProductExportTrackRecord> GetOrCreateTrackAsync(string datasetName, ProductSpecification productSpecification, ExportEngineKind engine, int publishedEdition, int publishedUpdate, CancellationToken cancellationToken = default) => Task.FromResult(EnsureTrack(datasetName, productSpecification));
        public Task BeginExportAsync(Guid trackId, int candidateEdition, int candidateUpdate, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) { Track.CandidatePreviousState = Track.State; Track.State = ProductState.Exporting; Track.CandidateEdition = candidateEdition; Track.CandidateUpdate = candidateUpdate; return Task.CompletedTask; }
        public Task SetStateAsync(Guid trackId, ProductState state, string? owner, DateTime occurredAtUtc, string? errorCode = null, string? errorMessage = null, CancellationToken cancellationToken = default) { Track.State = state; LastErrorCode = errorCode; LastErrorMessage = errorMessage; return Task.CompletedTask; }
        public Task<bool> SetManualFreezeAsync(Guid trackId, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) { var changed = !Track.IsManuallyFrozen; Track.IsManuallyFrozen = true; return Task.FromResult(changed); }
        public Task<bool> ClearManualFreezeAsync(Guid trackId, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) { var changed = Track.IsManuallyFrozen; Track.IsManuallyFrozen = false; return Task.FromResult(changed); }
        public Task DiscardCandidateAsync(Guid trackId, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) { Track.State = Track.CandidatePreviousState ?? ProductState.Idle; Track.CandidateEdition = null; Track.CandidateUpdate = null; Track.CandidatePreviousState = null; return Task.CompletedTask; }
        public Task<Guid> AddRevisionAsync(ProductRevisionWrite revision, CancellationToken cancellationToken = default) { Revisions.Add(revision); return Task.FromResult(Guid.NewGuid()); }
        public Task AddArtifactAsync(ProductArtifactWrite artifact, CancellationToken cancellationToken = default) { Artifacts.Add(artifact); return Task.CompletedTask; }
        public Task<IReadOnlyList<ProductExportTrackRecord>> GetTracksAsync(string datasetName, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<ProductExportTrackRecord>>([]);
        public Task<Guid?> GetLatestRevisionIdAsync(Guid trackId, CancellationToken cancellationToken = default) => Task.FromResult<Guid?>(null);
        public Task<IReadOnlyList<ProductArtifactReference>> GetValidationArtifactsAsync(Guid productRevisionId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<ProductArtifactReference>>([]);
        public Task<IReadOnlyList<ProductArtifactReference>> GetValidationArtifactHistoryAsync(Guid trackId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<ProductArtifactReference>>([]);
        public Task<ProductArtifactContent?> GetValidationArtifactAsync(string datasetName, Guid artifactId, CancellationToken cancellationToken = default) => Task.FromResult<ProductArtifactContent?>(null);

        private ProductExportTrackRecord EnsureTrack(string datasetName, ProductSpecification specification) => Track ??= new ProductExportTrackRecord { Id = Guid.NewGuid(), DatasetName = datasetName, ProductSpecification = specification, Engine = ExportEngineKind.IsoIec8211, State = InitialState, PublishedEdition = 4, PublishedUpdate = 2, CandidateEdition = CandidateEdition, CandidateUpdate = CandidateUpdate };
    }

    private sealed class FakeSevenCsService(SummaryResponse response, IReadOnlyList<SevenCsDiagnosticArtifact> diagnostics, Exception? failure) : ISevenCsService
    {
        public Task<SevenCsValidationResult> ValidateDatasetAsync(string datasetName, int edition, int update, string outputPath, CancellationToken cancellationToken = default) => failure is null
            ? Task.FromResult(new SevenCsValidationResult(response, diagnostics))
            : Task.FromException<SevenCsValidationResult>(failure);
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }
}
