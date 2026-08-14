using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Controllers;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Models;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.Jobs;
using ProductCatalogueAPI.Services.Locking;
using ProductCatalogueAPI.Services.Operations;
using S100FC.ProductCatalogue;
using System.Collections;

namespace TestProductCatalogueAPI;

public sealed class ExportAsyncControllerTests
{
    [Fact]
    public async Task NewEditionJobQueuesCanonicalIndependentProductTarget() {
        var jobs = new RecordingJobService();
        var controller = CreateController(new RecordingOperations(), jobs);
        ExportTargetContract.SetValidatedTarget(controller.HttpContext, ProductSpecification.S101);

        var result = await controller.NewEditionJob("101DK001", CancellationToken.None);

        Assert.IsType<AcceptedResult>(result);
        Assert.Equal("S101", jobs.Request!.ExportTarget);
        Assert.Equal(ExportOperationType.ExportEdition, jobs.Request.OperationType);
    }

    [Fact]
    public async Task CancelExportCallsRenamedOperationForSelectedTrack() {
        var operations = new RecordingOperations();
        var controller = CreateController(operations, new RecordingJobService());
        ExportTargetContract.SetValidatedTarget(controller.HttpContext, ProductSpecification.S57);

        var result = await controller.CancelExport("101DK001", CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
        Assert.Equal(ProductSpecification.S57, operations.CancelTarget);
    }

    private static ExportController CreateController(RecordingOperations operations, RecordingJobService jobs) {
        var controller = new ExportController(NullLogger<ExportController>.Instance, new FakeProductManager(new FakeElectronicProductManager()), new FakeLockService(), operations, jobs, TimeProvider.System) {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        controller.HttpContext.TraceIdentifier = "trace";
        return controller;
    }

    private sealed class RecordingOperations : IExportOperationService
    {
        public ProductSpecification? CancelTarget { get; private set; }
        public Task<ExportOperationResult> ExecuteExportAsync(string datasetName, ProductSpecification productSpecification, ExportRevisionType revisionType, string? user, string? changeSummaryYaml = null, CancellationToken cancellationToken = default, Action? beforeMutation = null) => Task.FromResult(new ExportOperationResult(ExportOperationContract.ExportCompletedCode, ExportOperationContract.ExportCompletedMessage));
        public Task<ExportOperationResult> ExecuteCancelExportAsync(string datasetName, ProductSpecification productSpecification, string? user, CancellationToken cancellationToken = default, Action? beforeMutation = null) { CancelTarget = productSpecification; return Task.FromResult(new ExportOperationResult(ExportOperationContract.CancelExportCompletedCode, ExportOperationContract.CancelExportCompletedMessage)); }
    }

    private sealed class RecordingJobService : IExportJobService
    {
        public ExportOperationJobRequest? Request { get; private set; }
        public ExportJobStartResponse Enqueue(ExportOperationJobRequest request) { Request = request; return new ExportJobStartResponse { JobId = "1", DatasetName = request.DatasetName, OperationType = request.OperationType.ToString(), ExportTarget = request.ExportTarget, Status = "Queued", CreatedAt = request.CreatedAtUtc, CorrelationId = request.CorrelationId, StatusUrl = "/jobs/1" }; }
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

    private sealed class FakeElectronicProductManager : IElectronicProductManager
    {
        public string OutputFolder => string.Empty;
        public Task<ElectronicProductVersion?> ReadElectronicProductVersionAsync(string datasetName, CancellationToken cancellationToken = default) => Task.FromResult<ElectronicProductVersion?>(new(datasetName, 4, 2));
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
