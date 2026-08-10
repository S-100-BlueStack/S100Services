using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Controllers;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Models;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.Jobs;
using ProductCatalogueAPI.Services.Locking;
using ProductCatalogueAPI.Services.Operations;
using S100FC.ProductCatalogue;
using S100FC.S128.FeatureTypes;
using S100FC.YAML;
using YamlDataset = S100FC.YAML.Dataset;
using System.Collections;
using static ProductCatalogueAPI.Models.RequestTypes;

namespace TestProductCatalogueAPI
{
    public class ExportAsyncControllerTests
    {
        [Fact]
        public async Task NewEditionJobReturnsAcceptedLocationAndBody() {
            var products = new FakeElectronicProductManager(new ElectronicProductVersion(
                "101DK001",
                4,
                2
            ));
            var jobs = new RecordingJobService();
            var controller = CreateController(products, jobs);
            ExportTargetContract.SetValidatedTarget(controller.HttpContext, ExportFormat.S100);

            var result = await controller.NewEditionJob("101DK001", CancellationToken.None);

            var accepted = Assert.IsType<AcceptedResult>(result);
            Assert.Equal("/jobs/job-123", accepted.Location);
            var response = Assert.IsType<ExportJobStartResponse>(accepted.Value);
            Assert.Equal("job-123", response.JobId);
            Assert.Equal("ExportEdition", response.OperationType);
            Assert.Equal("S100", response.ExportTarget);
            Assert.Equal(ExportJobContract.QueuedStatus, response.Status);
            Assert.Equal(1, jobs.EnqueueCalls);
            Assert.Equal(0, products.MutationCalls);
            Assert.Equal(0, products.LockReads);
            Assert.Equal(4, jobs.LastRequest!.ExpectedEdition);
            Assert.Equal(2, jobs.LastRequest.ExpectedUpdate);
        }

        [Fact]
        public async Task RollbackJobReturnsAcceptedWithoutExportTarget() {
            var jobs = new RecordingJobService();
            var controller = CreateController(
                new FakeElectronicProductManager(new ElectronicProductVersion("101DK001", 4, 2)),
                jobs
            );

            var result = await controller.RollBackJob("101DK001", CancellationToken.None);

            var accepted = Assert.IsType<AcceptedResult>(result);
            var response = Assert.IsType<ExportJobStartResponse>(accepted.Value);
            Assert.Equal("Rollback", response.OperationType);
            Assert.Null(response.ExportTarget);
            Assert.Null(jobs.LastRequest!.ExportTarget);
        }

        [Fact]
        public async Task MissingProductReturnsNotFoundAndDoesNotEnqueue() {
            var jobs = new RecordingJobService();
            var controller = CreateController(new FakeElectronicProductManager((ElectronicProductVersion?)null), jobs);
            ExportTargetContract.SetValidatedTarget(controller.HttpContext, ExportFormat.S100);

            var result = await controller.NewEditionJob("MISSING", CancellationToken.None);

            var error = AssertProblem(result, StatusCodes.Status404NotFound, ExportJobContract.ProductNotFoundCode);
            Assert.Equal(ExportJobContract.ProductNotFoundStartMessage, error.Message);
            Assert.Equal(0, jobs.EnqueueCalls);
            Assert.Null(controller.Response.Headers.Location.FirstOrDefault());
        }

        [Theory]
        [InlineData(null, 0)]
        [InlineData(4, null)]
        [InlineData(null, null)]
        public async Task UnusableVersionReturnsConflictAndDoesNotEnqueue(
            int? edition,
            int? update
        ) {
            var jobs = new RecordingJobService();
            var controller = CreateController(
                new FakeElectronicProductManager(new ElectronicProductVersion(
                    "101DK001",
                    edition,
                    update
                )),
                jobs
            );
            ExportTargetContract.SetValidatedTarget(controller.HttpContext, ExportFormat.S100);

            var result = await controller.NewEditionJob("101DK001", CancellationToken.None);

            var error = AssertProblem(
                result,
                StatusCodes.Status409Conflict,
                ExportJobContract.ProductVersionUnavailableCode
            );
            Assert.Equal(ExportJobContract.ProductVersionUnavailableMessage, error.Message);
            Assert.Equal(0, jobs.EnqueueCalls);
            Assert.Null(controller.Response.Headers.Location.FirstOrDefault());
        }

        [Fact]
        public async Task AmbiguousProductReturnsDataIntegrityConflict() {
            var jobs = new RecordingJobService();
            var products = new FakeElectronicProductManager(
                new ProductDataIntegrityException("101DK001", 2)
            );
            var controller = CreateController(products, jobs);
            ExportTargetContract.SetValidatedTarget(controller.HttpContext, ExportFormat.S100);

            var result = await controller.NewEditionJob("101DK001", CancellationToken.None);

            var error = AssertProblem(
                result,
                StatusCodes.Status409Conflict,
                ExportJobContract.ProductDataIntegrityErrorCode
            );
            Assert.Equal(ExportJobContract.ProductDataIntegrityStartMessage, error.Message);
            Assert.Equal(0, jobs.EnqueueCalls);
            Assert.Equal(0, products.MutationCalls);
            Assert.Null(controller.Response.Headers.Location.FirstOrDefault());
        }

        [Fact]
        public async Task EnqueueFailureReturnsServiceUnavailableWithoutJobId() {
            var controller = CreateController(
                new FakeElectronicProductManager(new ElectronicProductVersion("101DK001", 4, 2)),
                new RecordingJobService { Fail = true }
            );
            ExportTargetContract.SetValidatedTarget(controller.HttpContext, ExportFormat.S100);

            var result = await controller.NewEditionJob("101DK001", CancellationToken.None);

            var problem = AssertProblem(
                result,
                StatusCodes.Status503ServiceUnavailable,
                ExportJobContract.JobEnqueueFailedCode
            );
            Assert.False(problem.Message.Contains("job-", StringComparison.OrdinalIgnoreCase));
            Assert.Null(controller.Response.Headers.Location.FirstOrDefault());
        }

        private static ExportController CreateController(
            IElectronicProductManager electronicProductManager,
            IExportJobService jobService
        ) {
            var controller = new ExportController(
                NullLogger<ExportController>.Instance,
                new MemoryCache(new MemoryCacheOptions()),
                null!,
                new FakeProductManager(electronicProductManager),
                null!,
                new NeverLockService(),
                null!,
                jobService,
                TimeProvider.System
            );
            controller.ControllerContext = new ControllerContext {
                HttpContext = new DefaultHttpContext(),
                RouteData = new RouteData(),
                ActionDescriptor = new ControllerActionDescriptor()
            };
            controller.HttpContext.TraceIdentifier = "test-correlation";
            return controller;
        }

        private static ExportJobErrorResponse AssertProblem(
            IActionResult result,
            int status,
            string code
        ) {
            var objectResult = Assert.IsType<ObjectResult>(result);
            Assert.Equal(status, objectResult.StatusCode);
            Assert.Contains("application/json", objectResult.ContentTypes);
            var error = Assert.IsType<ExportJobErrorResponse>(objectResult.Value);
            Assert.Equal(code, error.Code);
            return error;
        }

        private sealed class RecordingJobService : IExportJobService
        {
            public int EnqueueCalls { get; private set; }
            public bool Fail { get; init; }
            public ExportOperationJobRequest? LastRequest { get; private set; }

            public ExportJobStartResponse Enqueue(ExportOperationJobRequest request) {
                EnqueueCalls++;
                LastRequest = request;
                if (Fail)
                    throw new JobEnqueueException("test failure");

                return new ExportJobStartResponse {
                    JobId = "job-123",
                    DatasetName = request.DatasetName,
                    OperationType = ExportOperationContract.ToPublicValue(request.OperationType),
                    ExportTarget = request.ExportTarget,
                    Status = ExportJobContract.QueuedStatus,
                    CreatedAt = request.CreatedAtUtc,
                    CorrelationId = request.CorrelationId,
                    StatusUrl = "/jobs/job-123"
                };
            }
        }

        private sealed class NeverLockService : IDatasetLockService
        {
            public Task<IAsyncDisposable?> TryAcquireAsync(string datasetName, CancellationToken cancellationToken = default) =>
                throw new InvalidOperationException("Async start endpoints must not acquire dataset locks.");
        }

        private sealed class FakeProductManager(IElectronicProductManager electronicProductManager) : IProductManager
        {
            public INauticalProductManager NauticalProductManager => null!;
            public IElectronicProductManager ElectronicProductManager { get; } = electronicProductManager;
        }

        private sealed class FakeElectronicProductManager : IElectronicProductManager
        {
            private readonly ElectronicProductVersion? _version;
            private readonly ProductDataIntegrityException? _integrityException;

            public FakeElectronicProductManager(ElectronicProductVersion? version) {
                _version = version;
            }

            public FakeElectronicProductManager(ProductDataIntegrityException integrityException) {
                _integrityException = integrityException;
            }

            public int MutationCalls { get; private set; }
            public int LockReads { get; private set; }
            public string OutputFolder => string.Empty;

            public Task<ElectronicProductVersion?> ReadElectronicProductVersionAsync(string datasetName, CancellationToken cancellationToken = default) {
                if (_integrityException != null)
                    throw _integrityException;
                return Task.FromResult(_version);
            }

            public ElectronicProduct? ElectronicProduct(string name) => null;
            public Task<YamlDataset> CreateNewEditionAsync(string name) { MutationCalls++; throw new NotSupportedException(); }
            public Task<bool> RollBackAsync(string name) { MutationCalls++; throw new NotSupportedException(); }
            public IEnumerator<string> GetEnumerator() => Array.Empty<string>().AsEnumerable().GetEnumerator();
            IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
            public Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, int? specificUsage, string boundary, string? ProductMapping, int? optimumDisplayScale = null) => throw new NotSupportedException();
            public Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, string boundary, int edition, int update, byte[] zipfile) => throw new NotSupportedException();
            public Task<YamlDataset> CreateNewDatasetAsync(string name) => throw new NotSupportedException();
            public Task<YamlDataset> CreateNewUpdateAsync(string name) => throw new NotSupportedException();
            public Task<YamlDataset> ReissueAsync(string name) => throw new NotSupportedException();
            public Task<Dictionary<string, string>> GetDatasetAOIs() => throw new NotSupportedException();
            public Task<bool> IsDirtyAsync(string name) => throw new NotSupportedException();
            public Task<string> GetDatasetBoundary(string name) => throw new NotSupportedException();
            public Task<Dictionary<string, ArchiveRow>> GetPendingEditsAsync(string name) => throw new NotSupportedException();
            public Task<Dictionary<string, Dictionary<string, ArchiveRow>>> GetPendingEditsAsync(DateTime sinceUtc) => throw new NotSupportedException();
            public Task<(string yaml, string index)> GetLatestDatasetYAML(string name, int edition) => throw new NotSupportedException();
            public Task CreateAttachmentAsync(string name, ExportTypes exportType, string yaml, string index, string sign) => throw new NotSupportedException();
            public Task CreateS57AttachmentAsync(string name, ExportTypes exportType, string yaml) => throw new NotSupportedException();
        }
    }
}
