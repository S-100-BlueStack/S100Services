using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Locking;
using ProductCatalogueAPI.Services.Operations;
using S100FC.ProductCatalogue;
using System.Collections;

namespace TestProductCatalogueAPI;

public sealed class ExportOperationJobTests
{
    [Fact]
    public async Task ExportUpdateUsesIndependentTargetAndSetsExecutionGuard() {
        var context = new FakeExecutionContext();
        var operations = new RecordingOperations();
        var job = CreateJob(operations);

        await job.ExecuteAsync(Request(ExportOperationType.ExportUpdate), context, CancellationToken.None);

        Assert.Equal(ProductSpecification.S101, operations.LastTarget);
        Assert.Equal(ExportRevisionType.Update, operations.LastRevisionType);
        Assert.True(context.Get<bool?>(ExportJobParameterNames.ExecutionStarted));
        Assert.Equal(ExportOperationContract.ExportCompletedCode, context.Get<string>(ExportJobParameterNames.ResultCode));
    }

    [Fact]
    public async Task CancelExportUsesRenamedOperationContract() {
        var operations = new RecordingOperations();
        var job = CreateJob(operations);

        await job.ExecuteAsync(Request(ExportOperationType.CancelExport), new FakeExecutionContext(), CancellationToken.None);

        Assert.Equal(1, operations.CancelCalls);
    }

    [Fact]
    public async Task StalePublicVersionStopsBeforeWorkflowMutation() {
        var operations = new RecordingOperations();
        var job = new ExportOperationJob(new FakeProductManager(new FakeElectronicProductManager(new ElectronicProductVersion("101DK001", 5, 2))), new FakeLockService(), operations, NullLogger<ExportOperationJob>.Instance);

        await Assert.ThrowsAsync<ExportOperationJobException>(() => job.ExecuteAsync(Request(ExportOperationType.ExportEdition), new FakeExecutionContext(), CancellationToken.None));

        Assert.Equal(0, operations.ExportCalls);
    }

    private static ExportOperationJob CreateJob(RecordingOperations operations) => new(new FakeProductManager(new FakeElectronicProductManager(new ElectronicProductVersion("101DK001", 4, 2))), new FakeLockService(), operations, NullLogger<ExportOperationJob>.Instance);
    private static ExportOperationJobRequest Request(ExportOperationType operationType) => new("101DK001", operationType, "S101", 4, 2, "correlation", DateTimeOffset.Parse("2026-08-10T20:00:00Z"));

    private sealed class RecordingOperations : IExportOperationService
    {
        public int ExportCalls { get; private set; }
        public int CancelCalls { get; private set; }
        public ProductSpecification? LastTarget { get; private set; }
        public ExportRevisionType? LastRevisionType { get; private set; }
        public Task<ExportOperationResult> ExecuteExportAsync(string datasetName, ProductSpecification productSpecification, ExportRevisionType revisionType, string? user, string? changeSummaryYaml = null, CancellationToken cancellationToken = default, Action? beforeMutation = null) { beforeMutation?.Invoke(); ExportCalls++; LastTarget = productSpecification; LastRevisionType = revisionType; return Task.FromResult(new ExportOperationResult(ExportOperationContract.ExportCompletedCode, ExportOperationContract.ExportCompletedMessage)); }
        public Task<ExportOperationResult> ExecuteCancelExportAsync(string datasetName, ProductSpecification productSpecification, string? user, CancellationToken cancellationToken = default, Action? beforeMutation = null) { beforeMutation?.Invoke(); CancelCalls++; LastTarget = productSpecification; return Task.FromResult(new ExportOperationResult(ExportOperationContract.CancelExportCompletedCode, ExportOperationContract.CancelExportCompletedMessage)); }
    }

    private sealed class FakeExecutionContext : IExportJobExecutionContext
    {
        private readonly Dictionary<string, object?> _values = [];
        public string JobId => "job";
        public T? GetJobParameter<T>(string name) => Get<T>(name);
        public void SetJobParameter(string name, object? value) => _values[name] = value;
        public T? Get<T>(string name) => _values.TryGetValue(name, out var value) ? (T?)value : default;
    }

    private sealed class FakeLockService : IDatasetLockService
    {
        public Task<IAsyncDisposable?> TryAcquireAsync(string datasetName, CancellationToken cancellationToken = default) => Task.FromResult<IAsyncDisposable?>(new Handle());
        private sealed class Handle : IAsyncDisposable { public ValueTask DisposeAsync() => ValueTask.CompletedTask; }
    }

    private sealed class FakeProductManager(IElectronicProductManager electronicProductManager) : IProductManager
    {
        public INauticalProductManager NauticalProductManager => null!;
        public IElectronicProductManager ElectronicProductManager { get; } = electronicProductManager;
    }

    private sealed class FakeElectronicProductManager(ElectronicProductVersion version) : IElectronicProductManager
    {
        public string OutputFolder => string.Empty;
        public Task<ElectronicProductVersion?> ReadElectronicProductVersionAsync(string datasetName, CancellationToken cancellationToken = default) => Task.FromResult<ElectronicProductVersion?>(version);
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
        public Task<Dictionary<string, Dictionary<string, ArchiveRow>>> GetPendingEditsAsync(DateTime sinceUtc) => throw new NotSupportedException();
        public Task<(string yaml, string index)> GetLatestDatasetYAML(string name, int edition) => throw new NotSupportedException();
        public Task CreateAttachmentAsync(string name, ExportTypes exportType, string yaml, string index, string sign) => throw new NotSupportedException();
        public Task CreateS57AttachmentAsync(string name, ExportTypes exportType, string yaml) => throw new NotSupportedException();
    }
}
