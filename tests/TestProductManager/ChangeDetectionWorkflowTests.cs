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
        var job = new DetectProductChangesJob(repository, repository, new FakeProductManager(products), new FakeLockService(), new FixedTimeProvider(), NullLogger<DetectProductChangesJob>.Instance);

        await job.RunAsync(CancellationToken.None);
        await job.RunAsync(CancellationToken.None);

        var summaries = await repository.GetOpenChangeSummariesAsync();
        Assert.Equal(2, summaries.Count);
        Assert.Contains(summaries, summary => summary.ProductSpecification == ProductSpecification.S101);
        Assert.Contains(summaries, summary => summary.ProductSpecification == ProductSpecification.S57);
        Assert.All(summaries, summary => Assert.Contains("attributes.categoryOfLight", summary.Yaml));
    }

    [Fact]
    public async Task NightlyJobDoesNotInventAnEditionDecisionWhileRulesArePending() {
        var repository = new InMemoryProductRepository();
        var track = await repository.GetOrCreateTrackAsync("101DK001", ProductSpecification.S101, ExportEngineKind.IsoIec8211, 4, 2);
        var summary = new ProductChangeSummary(Guid.NewGuid(), track.Id, track.DatasetName, track.ProductSpecification, new DateOnly(2026, 8, 10), "changes: []\n", [], DateTime.UtcNow, DateTime.UtcNow);
        await repository.SaveChangeSummaryAsync(summary);
        var operations = new RecordingOperations();
        var job = new NightlyExportBuildJob(repository, new ExportDecisionRuleSetRegistry([new PendingS101ExportDecisionRuleSet()]), operations, new FakeLockService(), TimeProvider.System, NullLogger<NightlyExportBuildJob>.Instance);

        await job.RunAsync(CancellationToken.None);

        Assert.Equal(0, operations.Calls);
        Assert.Single(await repository.GetOpenChangeSummariesAsync());
    }

    [Fact]
    public async Task DetectJobPreservesWatermarkWhenAProductCannotBeProcessed() {
        var repository = new InMemoryProductRepository();
        var products = new FakeElectronicProductManager();
        var job = new DetectProductChangesJob(repository, repository, new FakeProductManager(products), new RejectingLockService(), new FixedTimeProvider(), NullLogger<DetectProductChangesJob>.Instance);

        await Assert.ThrowsAsync<InvalidOperationException>(() => job.RunAsync(CancellationToken.None));

        Assert.Null(await repository.GetLastSuccessfulRunUtcAsync(nameof(DetectProductChangesJob)));
        Assert.Empty(await repository.GetOpenChangeSummariesAsync());
    }

    private sealed class RecordingOperations : IExportOperationService
    {
        public int Calls { get; private set; }
        public Task<ExportOperationResult> ExecuteExportAsync(string datasetName, ProductSpecification productSpecification, ExportRevisionType revisionType, string? user, string? changeSummaryYaml = null, CancellationToken cancellationToken = default, Action? beforeMutation = null) { Calls++; throw new InvalidOperationException("Pending rules must not start an export."); }
        public Task<ExportOperationResult> ExecuteCancelExportAsync(string datasetName, ProductSpecification productSpecification, string? user, CancellationToken cancellationToken = default, Action? beforeMutation = null) => throw new NotSupportedException();
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
        public IEnumerator<string> GetEnumerator() => Array.Empty<string>().AsEnumerable().GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
        public S100FC.S128.FeatureTypes.ElectronicProduct? ElectronicProduct(string name) => null;
        public Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, int? specificUsage, string boundary, string? ProductMapping, int? optimumDisplayScale = null) => throw new NotSupportedException();
        public Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, string boundary, int edition, int update, byte[] zipfile) => throw new NotSupportedException();
        public Task<S100FC.YAML.Dataset> CreateNewDatasetAsync(string name) => throw new NotSupportedException();
        public Task<S100FC.YAML.Dataset> CreateNewEditionAsync(string name) => throw new NotSupportedException();
        public Task<S100FC.YAML.Dataset> CreateNewUpdateAsync(string name) => throw new NotSupportedException();
        public Task<S100FC.YAML.Dataset> ReissueAsync(string name) => throw new NotSupportedException();
        public Task<S100FC.YAML.Dataset> CreateExportSnapshotAsync(string name, ExportTypes exportType, int edition, int update, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<Dictionary<string, string>> GetDatasetAOIs() => throw new NotSupportedException();
        public Task<bool> IsDirtyAsync(string name) => throw new NotSupportedException();
        public Task<string> GetDatasetBoundary(string name) => throw new NotSupportedException();
        public Task<Dictionary<string, ArchiveRow>> GetPendingEditsAsync(string name) => throw new NotSupportedException();
        public Task<(string yaml, string index)> GetLatestDatasetYAML(string name, int edition) => throw new NotSupportedException();
        public Task CreateAttachmentAsync(string name, ExportTypes exportType, string yaml, string index, string sign) => throw new NotSupportedException();
        public Task CreateS57AttachmentAsync(string name, ExportTypes exportType, string yaml) => throw new NotSupportedException();
    }
}
