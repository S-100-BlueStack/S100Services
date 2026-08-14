using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.Operations;
using ProductCatalogueAPI.Services.SevenCs;
using S100FC.ProductCatalogue;
using System.Collections;
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

        var result = await service.ExecuteExportAsync("101DK001", ProductSpecification.S101, ExportRevisionType.NewEdition, "developer");

        Assert.Equal(ExportOperationContract.ExportCompletedCode, result.Code);
        Assert.Equal(1, products.SnapshotCalls);
        Assert.Equal(0, products.AttachmentCalls);
        Assert.Equal((5, 0), products.LastSnapshotVersion);
        Assert.Equal(ProductState.ReadyForDistribution, repository.Track.State);
        Assert.Equal(1, engine.ExportCalls);
        Assert.Single(repository.Revisions);
    }

    [Fact]
    public async Task ValidationFailureDefaultsTrackToError() {
        var repository = new RecordingWorkflowRepository();
        var diagnostic = new SevenCsDiagnosticArtifact("101DK001.vld", "text/plain", "validation details"u8.ToArray());
        var service = CreateService(new RecordingElectronicProductManager(), repository, new RecordingExportEngine(), new SummaryResponse { Errors = 1 }, [diagnostic]);

        await Assert.ThrowsAsync<ExportValidationException>(() => service.ExecuteExportAsync("101DK001", ProductSpecification.S101, ExportRevisionType.Update, null));

        Assert.Equal(ProductState.Error, repository.Track.State);
        Assert.Equal("SEVENCS_VALIDATION_FAILED", repository.LastErrorCode);
        Assert.Contains("SevenCs validation failed", repository.LastErrorMessage);
        Assert.DoesNotContain(repository.Artifacts, artifact => artifact.Kind == ProductArtifactKind.ValidationReport);
        Assert.Contains(repository.Artifacts, artifact => artifact.Kind == ProductArtifactKind.ValidationDiagnostic && artifact.FileName == "101DK001.vld");
    }

    [Fact]
    public async Task FrozenCanOnlyBeClearedByTheUserFlowAndBlocksExportBeforeMutation() {
        var repository = new RecordingWorkflowRepository { InitialState = ProductState.Frozen };
        var products = new RecordingElectronicProductManager();
        var service = CreateService(products, repository, new RecordingExportEngine(), new SummaryResponse());
        var guardCalled = false;

        await Assert.ThrowsAsync<ExportOperationRejectedException>(() => service.ExecuteExportAsync("101DK001", ProductSpecification.S101, ExportRevisionType.NewEdition, null, beforeMutation: () => guardCalled = true));

        Assert.False(guardCalled);
        Assert.Equal(0, products.SnapshotCalls);
        Assert.Equal(ProductState.Frozen, repository.Track.State);
    }

    [Fact]
    public async Task CancelExportClearsOnlyTheSqlCandidateAndFilesystemOutput() {
        var repository = new RecordingWorkflowRepository { CandidateEdition = 5, CandidateUpdate = 0, InitialState = ProductState.ReadyForDistribution };
        var products = new RecordingElectronicProductManager();
        var engine = new RecordingExportEngine();
        var service = CreateService(products, repository, engine, new SummaryResponse());

        var result = await service.ExecuteCancelExportAsync("101DK001", ProductSpecification.S101, "developer");

        Assert.Equal(ExportOperationContract.CancelExportCompletedCode, result.Code);
        Assert.Equal(ProductState.Cancelled, repository.Track.State);
        Assert.Null(repository.Track.CandidateEdition);
        Assert.Equal(1, engine.DeleteCalls);
        Assert.Equal(0, products.AttachmentCalls);
    }

    private static TestExportOperationService CreateService(RecordingElectronicProductManager products, RecordingWorkflowRepository repository, RecordingExportEngine engine, SummaryResponse validation, IReadOnlyList<SevenCsDiagnosticArtifact>? diagnostics = null) => new(
        new FakeProductManager(products), new ExportEngineRegistry([engine]), repository, new FakeSevenCsService(validation, diagnostics ?? []),
        new FixedTimeProvider(DateTimeOffset.Parse("2026-08-10T20:00:00Z")), "dataset-yaml");

    private sealed class TestExportOperationService(IProductManager productManager, IExportEngineRegistry engines, IProductWorkflowRepository repository, ISevenCsService sevenCs, TimeProvider timeProvider, string yaml)
        : ExportOperationService(productManager, engines, repository, sevenCs, timeProvider, NullLogger<ExportOperationService>.Instance)
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
        public (int Edition, int Update) LastSnapshotVersion { get; private set; }
        public string OutputFolder => "output";
        public Task<ElectronicProductVersion?> ReadElectronicProductVersionAsync(string datasetName, CancellationToken cancellationToken = default) => Task.FromResult<ElectronicProductVersion?>(new(datasetName, 4, 2));
        public Task<YamlDataset> CreateExportSnapshotAsync(string name, ExportTypes exportType, int edition, int update, CancellationToken cancellationToken = default) { SnapshotCalls++; LastSnapshotVersion = (edition, update); return Task.FromResult<YamlDataset>(null!); }
        public Task CreateAttachmentAsync(string name, ExportTypes exportType, string yaml, string index, string sign) { AttachmentCalls++; return Task.CompletedTask; }
        public Task CreateS57AttachmentAsync(string name, ExportTypes exportType, string yaml) { AttachmentCalls++; return Task.CompletedTask; }
        public S100FC.S128.FeatureTypes.ElectronicProduct? ElectronicProduct(string name) => null;
        public S100FC.S128.FeatureTypes.ElectronicProduct? ElectronicProduct(string name, string productSpecification) => null;
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
        public bool Supports(ProductSpecification productSpecification) => productSpecification is ProductSpecification.S57 or ProductSpecification.S101;
        public Task<ExportEngineResult> ExportAsync(ExportEngineRequest request, CancellationToken cancellationToken = default) { ExportCalls++; return Task.FromResult(new ExportEngineResult("output", [])); }
        public Task DeleteOutputAsync(ExportOutputIdentity output, CancellationToken cancellationToken = default) { DeleteCalls++; return Task.CompletedTask; }
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
        public Task BeginExportAsync(Guid trackId, int candidateEdition, int candidateUpdate, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) { Track.State = ProductState.Exporting; Track.CandidateEdition = candidateEdition; Track.CandidateUpdate = candidateUpdate; return Task.CompletedTask; }
        public Task SetStateAsync(Guid trackId, ProductState state, string? owner, DateTime occurredAtUtc, string? errorCode = null, string? errorMessage = null, CancellationToken cancellationToken = default) { Track.State = state; LastErrorCode = errorCode; LastErrorMessage = errorMessage; return Task.CompletedTask; }
        public Task CancelCandidateAsync(Guid trackId, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) { Track.State = ProductState.Cancelled; Track.CandidateEdition = null; Track.CandidateUpdate = null; return Task.CompletedTask; }
        public Task<Guid> AddRevisionAsync(ProductRevisionWrite revision, CancellationToken cancellationToken = default) { Revisions.Add(revision); return Task.FromResult(Guid.NewGuid()); }
        public Task AddArtifactAsync(ProductArtifactWrite artifact, CancellationToken cancellationToken = default) { Artifacts.Add(artifact); return Task.CompletedTask; }
        public Task<ProductChangeSummary?> GetOpenChangeSummaryAsync(Guid trackId, DateOnly workDate, CancellationToken cancellationToken = default) => Task.FromResult<ProductChangeSummary?>(null);
        public Task SaveChangeSummaryAsync(ProductChangeSummary summary, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<IReadOnlyList<ProductChangeSummary>> GetOpenChangeSummariesAsync(CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<ProductChangeSummary>>([]);
        public Task CloseChangeSummaryAsync(Guid summaryId, DateTime closedAtUtc, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<IReadOnlyList<ProductExportTrackRecord>> GetTracksAsync(string datasetName, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<ProductExportTrackRecord>>([]);
        public Task<IReadOnlyList<ProductArtifactReference>> GetValidationArtifactsAsync(Guid trackId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<ProductArtifactReference>>([]);
        public Task<ProductArtifactContent?> GetValidationArtifactAsync(string datasetName, Guid artifactId, CancellationToken cancellationToken = default) => Task.FromResult<ProductArtifactContent?>(null);

        private ProductExportTrackRecord EnsureTrack(string datasetName, ProductSpecification specification) => Track ??= new ProductExportTrackRecord { Id = Guid.NewGuid(), DatasetName = datasetName, ProductSpecification = specification, Engine = ExportEngineKind.IsoIec8211, State = InitialState, PublishedEdition = 4, PublishedUpdate = 2, CandidateEdition = CandidateEdition, CandidateUpdate = CandidateUpdate };
    }

    private sealed class FakeSevenCsService(SummaryResponse response, IReadOnlyList<SevenCsDiagnosticArtifact> diagnostics) : ISevenCsService
    {
        public Task<SevenCsValidationResult> ValidateDatasetAsync(string datasetName, int edition, int update, string outputPath, CancellationToken cancellationToken = default) => Task.FromResult(new SevenCsValidationResult(response, diagnostics));
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }
}
