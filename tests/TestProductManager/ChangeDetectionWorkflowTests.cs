using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.ExportRules;
using ProductCatalogueAPI.Services.Locking;
using ProductCatalogueAPI.Services.Operations;
using S100FC.ProductCatalogue;
using System.Collections;

namespace TestProductCatalogueAPI;

public sealed class ChangeDetectionWorkflowTests
{
    [Fact]
    public async Task DetectJobAccumulatesYamlForIndependentS101AndS57TracksWithoutExporting() {
        var repository = new InMemoryProductRepository();
        var products = new FakeElectronicProductManager();
        var job = new DetectProductChangesJob(repository, repository, new FakeProductManager(products), new FakeLockService(), new FixedTimeProvider(), NullLogger<DetectProductChangesJob>.Instance, EnabledDetectionState());

        await job.RunAsync(CancellationToken.None);
        await job.RunAsync(CancellationToken.None);

        var summaries = await repository.GetOpenChangeSummariesAsync();
        Assert.Equal(2, summaries.Count);
        Assert.Contains(summaries, summary => summary.ProductSpecification == ProductSpecification.S101 && summary.DatasetName == "101DK001");
        Assert.Contains(summaries, summary => summary.ProductSpecification == ProductSpecification.S57 && summary.DatasetName == "DK3BIDQE");
        Assert.All(summaries, summary => Assert.Contains("attributes.categoryOfLight", summary.Yaml));
    }

    [Fact]
    public async Task DetectJobReopensAClosedSummaryWhenMoreChangesArriveOnTheSameWorkDate() {
        var repository = new InMemoryProductRepository();
        var products = new FakeElectronicProductManager();
        var job = new DetectProductChangesJob(repository, repository, new FakeProductManager(products), new FakeLockService(), new FixedTimeProvider(), NullLogger<DetectProductChangesJob>.Instance, EnabledDetectionState());

        await job.RunAsync(CancellationToken.None);
        var firstSummary = Assert.Single(await repository.GetOpenChangeSummariesAsync(), summary => summary.ProductSpecification == ProductSpecification.S101);
        await repository.CloseChangeSummaryAsync(firstSummary.Id, DateTime.UtcNow);
        Assert.Empty(await repository.GetOpenChangeSummariesAsync());

        await job.RunAsync(CancellationToken.None);

        var reopenedSummary = Assert.Single(await repository.GetOpenChangeSummariesAsync(), summary => summary.ProductSpecification == ProductSpecification.S101);
        Assert.Equal(firstSummary.Id, reopenedSummary.Id);
        Assert.Contains("attributes.categoryOfLight", reopenedSummary.Yaml);
    }

    [Fact]
    public async Task ManualFreezePreservesStateAllowsDetectionAndDefersSummaryProcessing() {
        var repository = new InMemoryProductRepository();
        var track = await repository.GetOrCreateTrackAsync("101DK001", ProductSpecification.S101, ExportEngineKind.IsoIec8211, 4, 2);
        await repository.SetStateAsync(track.Id, ProductState.Exported, "system", DateTime.UtcNow);
        await repository.SetManualFreezeAsync(track.Id, "operator", DateTime.UtcNow);
        var products = new FakeElectronicProductManager();
        var detectionJob = new DetectProductChangesJob(repository, repository, new FakeProductManager(products), new FakeLockService(), new FixedTimeProvider(), NullLogger<DetectProductChangesJob>.Instance, EnabledDetectionState());

        await detectionJob.RunAsync(CancellationToken.None);

        Assert.True(track.IsManuallyFrozen);
        Assert.Equal(ProductState.Exported, track.State);
        var operations = new SuccessfulRecordingOperations();
        var processingJob = new ProcessChangeSummariesJob(repository, new ExportDecisionRuleSetRegistry([new NewEditionS101DecisionRuleSet()]), operations, new FakeLockService(), TimeProvider.System, NullLogger<ProcessChangeSummariesJob>.Instance);

        await processingJob.RunAsync(CancellationToken.None);

        Assert.Equal(0, operations.Calls);
        Assert.NotEmpty(await repository.GetOpenChangeSummariesAsync());

        Assert.True(await repository.ClearManualFreezeAsync(track.Id, "operator", DateTime.UtcNow));
        await processingJob.RunAsync(CancellationToken.None);

        Assert.Equal(1, operations.Calls);
        Assert.False(track.IsManuallyFrozen);
        Assert.Equal(ProductState.Exported, track.State);
        Assert.Empty(await repository.GetOpenChangeSummariesAsync());
    }

    [Fact]
    public async Task ChangeSummaryJobDefaultsToNewEditionWhenRulesArePending() {
        var repository = new InMemoryProductRepository();
        var track = await repository.GetOrCreateTrackAsync("101DK001", ProductSpecification.S101, ExportEngineKind.IsoIec8211, 4, 2);
        var summary = new ProductChangeSummary(Guid.NewGuid(), track.Id, track.DatasetName, track.ProductSpecification, new DateOnly(2026, 8, 10), "changes: []\n", [], DateTime.UtcNow, DateTime.UtcNow);
        await repository.SaveChangeSummaryAsync(summary);
        var operations = new SuccessfulRecordingOperations();
        var job = new ProcessChangeSummariesJob(repository, new ExportDecisionRuleSetRegistry([new PendingS101ExportDecisionRuleSet()]), operations, new FakeLockService(), TimeProvider.System, NullLogger<ProcessChangeSummariesJob>.Instance);

        await job.RunAsync(CancellationToken.None);

        Assert.Equal(1, operations.Calls);
        Assert.Equal(ExportRevisionType.NewEdition, Assert.Single(operations.RevisionTypes));
        Assert.Empty(await repository.GetOpenChangeSummariesAsync());
    }

    [Theory]
    [InlineData(ProductSpecification.S101)]
    [InlineData(ProductSpecification.S57)]
    public void FormatSpecificFallbackRulesDefaultToNewEdition(ProductSpecification productSpecification) {
        var summary = new ProductChangeSummary(Guid.NewGuid(), Guid.NewGuid(), "TEST", productSpecification, new DateOnly(2026, 8, 10), "changes: []\n", [], DateTime.UtcNow, DateTime.UtcNow);
        IExportDecisionRuleSet ruleSet = productSpecification == ProductSpecification.S101
            ? new PendingS101ExportDecisionRuleSet()
            : new PendingS57ExportDecisionRuleSet();

        var decision = ruleSet.Evaluate(summary);

        Assert.Equal(ExportRevisionType.NewEdition, decision.RevisionType);
        Assert.Contains("defaulting to NewEdition", decision.Reason);
    }

    [Fact]
    public async Task ChangeSummaryJobDefersFrozenTracksAndContinuesWithOtherSummaries() {
        var repository = new InMemoryProductRepository();
        var frozenTrack = await repository.GetOrCreateTrackAsync("101DK001", ProductSpecification.S101, ExportEngineKind.IsoIec8211, 4, 2);
        var activeTrack = await repository.GetOrCreateTrackAsync("101DK002", ProductSpecification.S101, ExportEngineKind.IsoIec8211, 4, 2);
        var now = DateTime.UtcNow;
        await repository.SetStateAsync(frozenTrack.Id, ProductState.Frozen, "operator", now);

        var frozenSummary = new ProductChangeSummary(Guid.NewGuid(), frozenTrack.Id, frozenTrack.DatasetName, frozenTrack.ProductSpecification, new DateOnly(2026, 8, 10), "changes: []\n", [], now, now);
        var activeSummary = new ProductChangeSummary(Guid.NewGuid(), activeTrack.Id, activeTrack.DatasetName, activeTrack.ProductSpecification, new DateOnly(2026, 8, 10), "changes: []\n", [], now, now);
        await repository.SaveChangeSummaryAsync(frozenSummary);
        await repository.SaveChangeSummaryAsync(activeSummary);

        var operations = new SuccessfulRecordingOperations();
        var job = new ProcessChangeSummariesJob(repository, new ExportDecisionRuleSetRegistry([new NewEditionS101DecisionRuleSet()]), operations, new FakeLockService(), TimeProvider.System, NullLogger<ProcessChangeSummariesJob>.Instance);

        await job.RunAsync(CancellationToken.None);

        Assert.Equal(1, operations.Calls);
        Assert.Equal(ProductState.Frozen, frozenTrack.State);
        var openSummaries = await repository.GetOpenChangeSummariesAsync();
        Assert.Contains(openSummaries, summary => summary.Id == frozenSummary.Id);
        Assert.DoesNotContain(openSummaries, summary => summary.Id == activeSummary.Id);
    }

    [Fact]
    public async Task ChangeSummaryJobDefersWhenTrackBecomesFrozenDuringExport() {
        var repository = new InMemoryProductRepository();
        var track = await repository.GetOrCreateTrackAsync("101DK001", ProductSpecification.S101, ExportEngineKind.IsoIec8211, 4, 2);
        var now = DateTime.UtcNow;
        var summary = new ProductChangeSummary(Guid.NewGuid(), track.Id, track.DatasetName, track.ProductSpecification, new DateOnly(2026, 8, 10), "changes: []\n", [], now, now);
        await repository.SaveChangeSummaryAsync(summary);

        var operations = new FreezingRecordingOperations(repository, track.Id);
        var job = new ProcessChangeSummariesJob(repository, new ExportDecisionRuleSetRegistry([new NewEditionS101DecisionRuleSet()]), operations, new FakeLockService(), TimeProvider.System, NullLogger<ProcessChangeSummariesJob>.Instance);

        await job.RunAsync(CancellationToken.None);

        Assert.Equal(1, operations.Calls);
        Assert.Equal(ProductState.Frozen, track.State);
        Assert.Contains(await repository.GetOpenChangeSummariesAsync(), item => item.Id == summary.Id);
    }

    [Fact]
    public async Task DetectJobPreservesWatermarkWhenAProductCannotBeProcessed() {
        var repository = new InMemoryProductRepository();
        var products = new FakeElectronicProductManager();
        var job = new DetectProductChangesJob(repository, repository, new FakeProductManager(products), new RejectingLockService(), new FixedTimeProvider(), NullLogger<DetectProductChangesJob>.Instance, EnabledDetectionState());

        await Assert.ThrowsAsync<InvalidOperationException>(() => job.RunAsync(CancellationToken.None));

        Assert.Null(await repository.GetLastSuccessfulRunUtcAsync(nameof(DetectProductChangesJob)));
        Assert.Empty(await repository.GetOpenChangeSummariesAsync());
    }

    /// <summary>Explicitly opts workflow tests into detection without changing the disabled production default.</summary>
    private static DetectProductChangesState EnabledDetectionState() => DetectProductChangesState.FromConfiguration(new ConfigurationManager { ["EnableDetectProductChanges"] = "true" });

    private sealed class SuccessfulRecordingOperations : IExportOperationService
    {
        public int Calls { get; private set; }
        public List<ExportRevisionType> RevisionTypes { get; } = [];
        public Task<ExportOperationResult> ExecuteExportAsync(string datasetName, ExportRevisionType revisionType, string? user, string? changeSummaryYaml = null, CancellationToken cancellationToken = default, Action? beforeMutation = null) {
            Calls++;
            RevisionTypes.Add(revisionType);
            return Task.FromResult(new ExportOperationResult(ExportOperationContract.ExportCompletedCode, ExportOperationContract.ExportCompletedMessage));
        }

        public Task<ExportOperationResult> ExecuteCancelExportAsync(string datasetName, string? user, CancellationToken cancellationToken = default, Action? beforeMutation = null) => throw new NotSupportedException();
    }

    private sealed class NewEditionS101DecisionRuleSet : IExportDecisionRuleSet
    {
        public ProductSpecification ProductSpecification => ProductSpecification.S101;
        public ExportDecision Evaluate(ProductChangeSummary summary) => new(ExportRevisionType.NewEdition, "test");
    }

    private sealed class FreezingRecordingOperations(InMemoryProductRepository repository, Guid trackId) : IExportOperationService
    {
        public int Calls { get; private set; }

        public async Task<ExportOperationResult> ExecuteExportAsync(string datasetName, ExportRevisionType revisionType, string? user, string? changeSummaryYaml = null, CancellationToken cancellationToken = default, Action? beforeMutation = null) {
            Calls++;
            await repository.SetStateAsync(trackId, ProductState.Frozen, "operator", DateTime.UtcNow, cancellationToken: cancellationToken);
            throw new ExportOperationRejectedException("The test simulates a concurrent freeze.");
        }

        public Task<ExportOperationResult> ExecuteCancelExportAsync(string datasetName, string? user, CancellationToken cancellationToken = default, Action? beforeMutation = null) => throw new NotSupportedException();
    }

    private sealed class FakeLockService : IDatasetLockService
    {
        public Task<IAsyncDisposable?> TryAcquireAsync(string datasetName, CancellationToken cancellationToken = default) => Task.FromResult<IAsyncDisposable?>(new Handle());
        private sealed class Handle : IAsyncDisposable { public ValueTask DisposeAsync() => ValueTask.CompletedTask; }
    }

    private sealed class RejectingLockService : IDatasetLockService
    {
        public Task<IAsyncDisposable?> TryAcquireAsync(string datasetName, CancellationToken cancellationToken = default) => Task.FromResult<IAsyncDisposable?>(null);
    }

    private sealed class FixedTimeProvider : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => DateTimeOffset.Parse("2026-08-10T12:00:00Z");
    }

    private sealed class FakeProductManager(IElectronicProductManager electronicProductManager) : IProductManager
    {
        public INauticalProductManager NauticalProductManager => null!;
        public IElectronicProductManager ElectronicProductManager { get; } = electronicProductManager;
    }

    private sealed class FakeElectronicProductManager : IElectronicProductManager
    {
        public string OutputFolder => string.Empty;
        public Task<Dictionary<string, Dictionary<string, ArchiveRow>>> GetPendingEditsAsync(DateTime sinceUtc) => Task.FromResult(new Dictionary<string, Dictionary<string, ArchiveRow>> {
            ["101DK001"] = new() {
                ["feature-1"] = new ArchiveRow { Code = "LightAllAround", AttributeBindings = "{\"categoryOfLight\":1}", EditDate = DateTime.Parse("2026-08-10T10:00:00Z").ToUniversalTime() }
            }
        });
        public Task<ElectronicProductVersion?> ReadElectronicProductVersionAsync(string datasetName, CancellationToken cancellationToken = default) => Task.FromResult<ElectronicProductVersion?>(new(datasetName, 4, 2));
        public IReadOnlyList<S100FC.S128.FeatureTypes.ElectronicProduct> GetMappedElectronicProducts(string name, string productSpecification) => productSpecification == "S57"
            ? [new S100FC.S128.FeatureTypes.ElectronicProduct { datasetName = "DK3BIDQE", productSpecification = new S100FC.S128.ComplexAttributes.productSpecification { name = "S-57" } }]
            : [];
        public IEnumerator<string> GetEnumerator() => Array.Empty<string>().AsEnumerable().GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
        public S100FC.S128.FeatureTypes.ElectronicProduct? ElectronicProduct(string name) => null;
        public S100FC.S128.FeatureTypes.ElectronicProduct? ElectronicProduct(string name, string productSpecification) => null;
        public Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, int? specificUsage, string boundary, string? ProductMapping, int? optimumDisplayScale = null) => throw new NotSupportedException();
        public Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, string boundary, int edition, int update, byte[] zipfile) => throw new NotSupportedException();
        public Task<S100FC.YAML.Dataset> CreateNewDatasetAsync(string name) => throw new NotSupportedException();
        public Task<S100FC.YAML.Dataset> CreateNewEditionAsync(string name) => throw new NotSupportedException();
        public Task<S100FC.YAML.Dataset> CreateNewUpdateAsync(string name) => throw new NotSupportedException();
        public Task<S100FC.YAML.Dataset> ReissueAsync(string name) => throw new NotSupportedException();
        public Task<S100FC.YAML.Dataset> CreateExportSnapshotAsync(string name, ExportTypes exportType, int edition, int update, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<Dictionary<string, string>> GetDatasetAOIs() => throw new NotSupportedException();
        public Task<Dictionary<string, string>> GetDatasetAOIs(string productSpecification) => throw new NotSupportedException();
        public Task<bool> IsDirtyAsync(string name) => throw new NotSupportedException();
        public Task<string> GetDatasetBoundary(string name) => throw new NotSupportedException();
        public Task<Dictionary<string, ArchiveRow>> GetPendingEditsAsync(string name) => throw new NotSupportedException();
        public Task<(string yaml, string index)> GetLatestDatasetYAML(string name, int edition) => throw new NotSupportedException();
        public Task CreateAttachmentAsync(string name, ExportTypes exportType, string yaml, string index, string sign) => throw new NotSupportedException();
        public Task CreateS57AttachmentAsync(string name, ExportTypes exportType, string yaml) => throw new NotSupportedException();
    }
}
