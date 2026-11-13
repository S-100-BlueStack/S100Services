using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Logging;
using Hangfire;
using System.Reflection;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.Locking;
using ProductCatalogueAPI.Services.History;
using ProductCatalogueAPI.Services.Operations;
using S100FC.ProductCatalogue;
using System.Collections;

namespace TestProductCatalogueAPI;

public sealed class ExportOperationJobTests
{
    /// <summary>The outer job owner logs findings as warnings while preserving the exception and failed job metadata.</summary>
    [Fact]
    public async Task Logging_StandaloneCriticalFindingsNeverEmitError() {
        var logger = new TestLogCapture<ExportOperationJob>();
        var operations = new RecordingOperations { Failure = ExportValidationException.Findings("101DK001", 0, 1, false) };
        var context = new FakeExecutionContext();
        await Assert.ThrowsAsync<ExportValidationException>(() => CreateJob(operations, logger).ExecuteAsync(Request(ExportOperationType.ExportEdition), context, default));
        Assert.Contains(logger.Entries, entry => entry.Level == LogLevel.Warning);
        Assert.DoesNotContain(logger.Entries, entry => entry.Level is LogLevel.Error or LogLevel.Critical);
        Assert.NotNull(context.Get<string>(ExportJobParameterNames.ErrorCode));
    }

    /// <summary>Safe package exception mapping retains expected severity without changing the public failure code.</summary>
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Logging_ManualPackageClassifiesFindingsAndOutages(bool finding) {
        var failure = finding ? ExportValidationException.Findings("101DK001", 2, 1, false) : ExportValidationException.Unavailable("101DK001", new IOException("Unavailable"));
        var logger = new TestLogCapture<ExportOperationJob>();
        var operations = new RecordingOperations();
        var job = new ExportOperationJob(new FakeProductManager(new FakeElectronicProductManager(new ElectronicProductVersion("101DK001", 4, 2))), new FakeLockService(), operations, logger, CreateHistory(operations), new FailingPackages(failure));
        var exception = await Assert.ThrowsAsync<ExportOperationJobException>(() => job.ExecuteAsync(Request(ExportOperationType.ExportEdition) with { BuildPackage = true }, new FakeExecutionContext(), default));
        Assert.Equal(ExportJobContract.ExportFailedCode, exception.Code);
        Assert.Equal(finding, exception.IsValidationFindingFailure);
        if (finding) {
            Assert.Contains(logger.Entries, entry => entry.Level == LogLevel.Warning);
            Assert.DoesNotContain(logger.Entries, entry => entry.Level is LogLevel.Error or LogLevel.Critical);
        }
        else Assert.Contains(logger.Entries, entry => entry.Level == LogLevel.Error);
    }

    /// <summary>The job owns terminal logging without enabling retries or converting failures into successes.</summary>
    [Fact]
    public void Logging_HangfireDoesNotAddAnUnclassifiedTerminalError() {
        var retry = typeof(ExportOperationJob).GetMethod(nameof(ExportOperationJob.RunAsync))!.GetCustomAttribute<AutomaticRetryAttribute>()!;
        Assert.Equal(0, retry.Attempts);
        Assert.False(retry.LogEvents);
        Assert.Equal(AttemptsExceededAction.Fail, retry.OnAttemptsExceeded);
    }

    /// <summary>Fails before any compiler or database work while exercising the real package job error mapping.</summary>
    private sealed class FailingPackages(Exception failure) : IEncPackageDetectionService
    {
        public Task RunAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<Guid> CreateManualAsync(string sourceName, int? expectedEdition, int? expectedUpdate, CancellationToken cancellationToken) => Task.FromException<Guid>(failure);
    }

    [Fact]
    public async Task ExportUpdateUsesIndependentTargetAndSetsExecutionGuard() {
        var context = new FakeExecutionContext();
        var operations = new RecordingOperations();
        var job = CreateJob(operations);

        await job.ExecuteAsync(Request(ExportOperationType.ExportUpdate), context, CancellationToken.None);

        Assert.Equal(ExportRevisionType.Update, operations.LastRevisionType);
        Assert.True(context.Get<bool?>(ExportJobParameterNames.ExecutionStarted));
        Assert.Equal(ExportOperationContract.ExportCompletedCode, context.Get<string>(ExportJobParameterNames.ResultCode));
    }

    [Fact]
    public async Task NewDatasetUsesNewEditionProcessingWhenEditionIsZero() {
        var context = new FakeExecutionContext();
        var operations = new RecordingOperations();
        var job = new ExportOperationJob(
            new FakeProductManager(new FakeElectronicProductManager(new ElectronicProductVersion("101DK001", 0, 0))),
            new FakeLockService(),
            operations,
            NullLogger<ExportOperationJob>.Instance, CreateHistory(operations)
        );

        await job.ExecuteAsync(Request(ExportOperationType.NewDataset, 0, 0), context, CancellationToken.None);

        Assert.Equal(ExportRevisionType.NewEdition, operations.LastRevisionType);
        Assert.Equal(ExportOperationContract.ExportCompletedCode, context.Get<string>(ExportJobParameterNames.ResultCode));
    }

    [Fact]
    public async Task LegacyCancelExportOperationStillDiscards() {
        var operations = new RecordingOperations();
        var job = CreateJob(operations);

        await job.ExecuteAsync(Request(ExportOperationType.CancelExport), new FakeExecutionContext(), CancellationToken.None);

        Assert.Equal(1, operations.DiscardCalls);
    }

    [Fact]
    public async Task StalePublicVersionStopsBeforeWorkflowMutation() {
        var operations = new RecordingOperations();
        var job = new ExportOperationJob(new FakeProductManager(new FakeElectronicProductManager(new ElectronicProductVersion("101DK001", 5, 2))), new FakeLockService(), operations, NullLogger<ExportOperationJob>.Instance, CreateHistory(operations));

        await Assert.ThrowsAsync<ExportOperationJobException>(() => job.ExecuteAsync(Request(ExportOperationType.ExportEdition), new FakeExecutionContext(), CancellationToken.None));

        Assert.Equal(0, operations.ExportCalls);
    }

    [Fact]
    public async Task CancellationAfterExecutionStartsCannotRecordSuccessfulCompletion() {
        using var cancellation = new CancellationTokenSource();
        var context = new FakeExecutionContext();
        var operations = new RecordingOperations { CancelDuringExport = cancellation };
        var job = CreateJob(operations);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            job.ExecuteAsync(
                Request(ExportOperationType.ExportEdition),
                context,
                cancellation.Token
            )
        );

        Assert.True(context.Get<bool?>(ExportJobParameterNames.ExecutionStarted));
        Assert.Equal(
            ExportJobContract.OperationCancelledCode,
            context.Get<string>(ExportJobParameterNames.ErrorCode)
        );
        Assert.Null(context.Get<string>(ExportJobParameterNames.ResultCode));
    }

    [Fact]
    public async Task ActualJobRequeueProducesOneEventAndOneBusinessCall() {
        var operations = new RecordingOperations();
        var fixture = new HistoryRecoveryFixture();
        fixture.Store.StateId = operations.StateId;
        var job = new ExportOperationJob(new FakeProductManager(new FakeElectronicProductManager(new ElectronicProductVersion("101DK001", 4, 2))),
            fixture.Locks, operations, NullLogger<ExportOperationJob>.Instance, fixture.Producer);
        var context = new FakeExecutionContext();
        var request = Request(ExportOperationType.ExportEdition) with { OperationId = Guid.NewGuid() };
        await job.ExecuteAsync(request, context, CancellationToken.None);
        await job.ExecuteAsync(request, context, CancellationToken.None);
        Assert.Equal(1, operations.ExportCalls);
        Assert.Equal(operations.StateId, Assert.Single(fixture.Store.Rows).StateRecordId);
        Assert.Equal(ProductHistoryEventContract.Succeeded, fixture.Store.Rows[0].Outcome);
    }

    [Fact]
    public async Task ActualJobVersionRejectionCreatesSafeFailedEventWithoutExecution() {
        var operations = new RecordingOperations();
        var fixture = new HistoryRecoveryFixture();
        var job = new ExportOperationJob(new FakeProductManager(new FakeElectronicProductManager(new ElectronicProductVersion("101DK001", 99, 2))),
            fixture.Locks, operations, NullLogger<ExportOperationJob>.Instance, fixture.Producer);
        await Assert.ThrowsAsync<ExportOperationJobException>(() => job.ExecuteAsync(Request(ExportOperationType.ExportEdition), new FakeExecutionContext(), CancellationToken.None));
        var row = Assert.Single(fixture.Store.Rows);
        Assert.Equal(ProductHistoryEventContract.Failed, row.Outcome);
        Assert.Null(row.ExecutionStartedAtUtc);
        Assert.Equal(0, operations.ExportCalls);
    }

    [Fact]
    public async Task ActualDiscardNeverCreatesAnExportOrRollbackAuditEvent() {
        var operations = new RecordingOperations();
        var fixture = new HistoryRecoveryFixture();
        var job = new ExportOperationJob(new FakeProductManager(new FakeElectronicProductManager(new ElectronicProductVersion("101DK001", 4, 2))),
            fixture.Locks, operations, NullLogger<ExportOperationJob>.Instance, fixture.Producer);
        await job.ExecuteAsync(Request(ExportOperationType.Discard), new FakeExecutionContext(), CancellationToken.None);
        Assert.Empty(fixture.Store.Rows);
        Assert.Equal(1, operations.DiscardCalls);
    }

    private static IProductExportHistory CreateHistory(RecordingOperations operations) {
        var fixture = new HistoryRecoveryFixture();
        fixture.Store.StateId = operations.StateId;
        return fixture.Producer;
    }

    private static ExportOperationJob CreateJob(RecordingOperations operations, ILogger<ExportOperationJob>? logger = null) => new(new FakeProductManager(new FakeElectronicProductManager(new ElectronicProductVersion("101DK001", 4, 2))), new FakeLockService(), operations, logger ?? NullLogger<ExportOperationJob>.Instance, CreateHistory(operations));
    private static ExportOperationJobRequest Request(ExportOperationType operationType, int edition = 4, int update = 2) => new("101DK001", operationType, "S101", edition, update, "correlation", DateTimeOffset.Parse("2026-08-10T20:00:00Z"));

    private sealed class RecordingOperations : IExportOperationService
    {
        public Exception? Failure { get; init; }
        public Guid StateId { get; } = Guid.NewGuid();
        public int ExportCalls { get; private set; }
        public int DiscardCalls { get; private set; }
        public ExportRevisionType? LastRevisionType { get; private set; }
        public CancellationTokenSource? CancelDuringExport { get; init; }
        public Task<ExportOperationResult> ExecuteExportAsync(string datasetName, ExportRevisionType revisionType, string? user, string? changeSummaryYaml = null, CancellationToken cancellationToken = default, Action? beforeMutation = null) {
            beforeMutation?.Invoke();
            ExportCalls++;
            if (Failure is not null) throw Failure;
            LastRevisionType = revisionType;
            CancelDuringExport?.Cancel();
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult(new ExportOperationResult(ExportOperationContract.ExportCompletedCode, ExportOperationContract.ExportCompletedMessage) {
                StateRecordId = StateId, DatasetName = datasetName, ExportTarget = "S101", ResultEdition = 5, ResultUpdate = 0
            });
        }
        public Task<ExportOperationResult> ExecutePackageExportAsync(string datasetName, ExportRevisionType revisionType, string datasetYaml, string changeSummaryYaml, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<ExportOperationResult> ExecuteDiscardAsync(string datasetName, string? user, CancellationToken cancellationToken = default, Action? beforeMutation = null, bool preservePackageScanBound = false) { beforeMutation?.Invoke(); DiscardCalls++; return Task.FromResult(new ExportOperationResult(ExportOperationContract.DiscardCompletedCode, ExportOperationContract.DiscardCompletedMessage)); }
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
        public S100FC.S128.FeatureTypes.ElectronicProduct? ResolveExportProduct(string name) => new() { datasetName = "101DK001", productSpecification = new S100FC.S128.ComplexAttributes.productSpecification { name = "S-101" } };
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
