using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using ProductManagerAPI.Controllers;
using ProductManagerAPI.Services.Export;
using ProductManagerAPI.Services.Jobs;
using ProductManagerAPI.Services.Locking;
using ProductManagerAPI.Services.Operations;
using S100FC.ProductCatalogue;
using S100FC.S128.FeatureTypes;
using S100FC.YAML;
using YamlDataset = S100FC.YAML.Dataset;
using System.Collections;
using static ProductManagerAPI.Models.RequestTypes;
using static ProductManagerAPI.Models.ResponseTypes;

namespace TestProductManagerAPI
{
    public class ExportControllerSyncParityTests
    {
        [Fact]
        public async Task NewEditionSuccessKeepsOkApiResponse() {
            var operations = new RecordingOperationService();
            var controller = CreateController(
                new FakeElectronicProductManager(Product("101DK001", 4, 0)),
                new FakeLockService(acquired: true),
                operations
            );
            ExportTargetContract.SetValidatedTarget(controller.HttpContext, ExportFormat.S100);

            var result = await controller.NewEdition("101DK001", CancellationToken.None);

            var ok = Assert.IsType<OkObjectResult>(result);
            var response = Assert.IsType<ApiResponse>(ok.Value);
            Assert.True(response.Success);
            Assert.Equal(1, operations.NewEditionCalls);
        }

        [Fact]
        public async Task NewEditionMissingProductKeepsNotFoundBody() {
            var controller = CreateController(
                new FakeElectronicProductManager(null),
                new FakeLockService(acquired: true),
                new RecordingOperationService()
            );
            ExportTargetContract.SetValidatedTarget(controller.HttpContext, ExportFormat.S100);

            var result = await controller.NewEdition("MISSING", CancellationToken.None);

            var objectResult = Assert.IsType<ObjectResult>(result);
            Assert.Equal(StatusCodes.Status404NotFound, objectResult.StatusCode);
            var response = Assert.IsType<ApiResponse>(objectResult.Value);
            Assert.False(response.Success);
            Assert.Equal("No electronic product with name 'MISSING' was found.", response.Message);
        }

        [Fact]
        public async Task SyncLockConflictKeepsConflictApiResponse() {
            var operations = new RecordingOperationService();
            var controller = CreateController(
                new FakeElectronicProductManager(Product("101DK001", 4, 0)),
                new FakeLockService(acquired: false),
                operations
            );
            ExportTargetContract.SetValidatedTarget(controller.HttpContext, ExportFormat.S100);

            var result = await controller.NewEdition("101DK001", CancellationToken.None);

            var objectResult = Assert.IsType<ObjectResult>(result);
            Assert.Equal(StatusCodes.Status409Conflict, objectResult.StatusCode);
            var response = Assert.IsType<ApiResponse>(objectResult.Value);
            Assert.Equal("Dataset 101DK001 is already being processed.", response.Message);
            Assert.Equal(0, operations.NewEditionCalls);
        }

        [Fact]
        public async Task NewEditionRejectedStateKeepsBadRequestBody() {
            var operations = new RecordingOperationService {
                NewEditionRejectionMessage =
                    "A New edition could not be created now. Current product state: Frozen."
            };
            var controller = CreateController(
                new FakeElectronicProductManager(Product("101DK001", 4, 0)),
                new FakeLockService(acquired: true),
                operations
            );
            ExportTargetContract.SetValidatedTarget(controller.HttpContext, ExportFormat.S100);

            var result = await controller.NewEdition("101DK001", CancellationToken.None);

            var objectResult = Assert.IsType<ObjectResult>(result);
            Assert.Equal(StatusCodes.Status400BadRequest, objectResult.StatusCode);
            var response = Assert.IsType<ApiResponse>(objectResult.Value);
            Assert.Equal(operations.NewEditionRejectionMessage, response.Message);
            Assert.Equal(1, operations.NewEditionCalls);
        }

        [Fact]
        public async Task RollbackSuccessKeepsEmptyOkResponse() {
            var operations = new RecordingOperationService();
            var controller = CreateController(
                new FakeElectronicProductManager(Product("101DK001", 4, 0)),
                new FakeLockService(acquired: true),
                operations
            );

            var result = await controller.RollBack("101DK001", CancellationToken.None);

            Assert.IsType<OkResult>(result);
            Assert.Equal(1, operations.RollbackCalls);
        }

        [Fact]
        public async Task RollbackBelowEditionTwoKeepsBadRequestBody() {
            var operations = new RecordingOperationService {
                RollbackRejectionMessage = "Dataset cannot be rolled back further."
            };
            var controller = CreateController(
                new FakeElectronicProductManager(Product("101DK001", 1, 0)),
                new FakeLockService(acquired: true),
                operations
            );

            var result = await controller.RollBack("101DK001", CancellationToken.None);

            var objectResult = Assert.IsType<ObjectResult>(result);
            Assert.Equal(StatusCodes.Status400BadRequest, objectResult.StatusCode);
            var response = Assert.IsType<ApiResponse>(objectResult.Value);
            Assert.Equal("Dataset cannot be rolled back further.", response.Message);
            Assert.Equal(1, operations.RollbackCalls);
        }

        private static ExportController CreateController(
            IElectronicProductManager electronicProductManager,
            IDatasetLockService lockService,
            IExportOperationService operationService
        ) {
            var controller = new ExportController(
                NullLogger<ExportController>.Instance,
                new MemoryCache(new MemoryCacheOptions()),
                null!,
                new FakeProductManager(electronicProductManager),
                null!,
                lockService,
                operationService,
                new NeverEnqueueJobService(),
                TimeProvider.System
            );
            controller.ControllerContext = new ControllerContext {
                HttpContext = new DefaultHttpContext(),
                RouteData = new RouteData(),
                ActionDescriptor = new ControllerActionDescriptor()
            };
            return controller;
        }

        private static ElectronicProduct Product(string name, int edition, int update) => new() {
            datasetName = name,
            editionNumber = edition,
            updateNumber = update
        };

        private sealed class RecordingOperationService : IExportOperationService
        {
            public int NewEditionCalls { get; private set; }
            public int RollbackCalls { get; private set; }
            public string? NewEditionRejectionMessage { get; init; }
            public string? RollbackRejectionMessage { get; init; }

            public Task<ExportOperationResult> ExecuteNewEditionAsync(
                string datasetName,
                ExportFormat exportTarget,
                string? user,
                CancellationToken cancellationToken = default,
                Action? beforeMutation = null
            ) {
                NewEditionCalls++;
                if (NewEditionRejectionMessage != null)
                    throw new ExportOperationRejectedException(NewEditionRejectionMessage);

                beforeMutation?.Invoke();
                return Task.FromResult(new ExportOperationResult(
                    ExportOperationContract.ExportCompletedCode,
                    ExportOperationContract.ExportCompletedMessage
                ));
            }

            public Task<ExportOperationResult> ExecuteRollbackAsync(
                string datasetName,
                CancellationToken cancellationToken = default,
                Action? beforeMutation = null
            ) {
                RollbackCalls++;
                if (RollbackRejectionMessage != null)
                    throw new ExportOperationRejectedException(RollbackRejectionMessage);

                beforeMutation?.Invoke();
                return Task.FromResult(new ExportOperationResult(
                    ExportOperationContract.RollbackCompletedCode,
                    ExportOperationContract.RollbackCompletedMessage
                ));
            }
        }

        private sealed class FakeLockService(bool acquired) : IDatasetLockService
        {
            public Task<IAsyncDisposable?> TryAcquireAsync(string datasetName, CancellationToken cancellationToken = default) =>
                Task.FromResult<IAsyncDisposable?>(acquired ? new Handle() : null);

            private sealed class Handle : IAsyncDisposable
            {
                public ValueTask DisposeAsync() => ValueTask.CompletedTask;
            }
        }

        private sealed class NeverEnqueueJobService : IExportJobService
        {
            public ProductManagerAPI.Models.ExportJobStartResponse Enqueue(ProductManagerAPI.Jobs.ExportOperationJobRequest request) =>
                throw new InvalidOperationException("Sync endpoints must not enqueue jobs.");
        }

        private sealed class FakeProductManager(IElectronicProductManager electronicProductManager) : IProductManager
        {
            public INauticalProductManager NauticalProductManager => null!;
            public IElectronicProductManager ElectronicProductManager { get; } = electronicProductManager;
        }

        private sealed class FakeElectronicProductManager(ElectronicProduct? product) : IElectronicProductManager
        {
            public string OutputFolder => string.Empty;
            public ElectronicProduct? ElectronicProduct(string name) => product;
            public Task<ElectronicProductVersion?> ReadElectronicProductVersionAsync(string datasetName, CancellationToken cancellationToken = default) => Task.FromResult(product == null ? null : new ElectronicProductVersion(product.datasetName!, product.editionNumber, product.updateNumber));
            public IEnumerator<string> GetEnumerator() => Array.Empty<string>().AsEnumerable().GetEnumerator();
            IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
            public Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, int? specificUsage, string boundary, string? ProductMapping, int? optimumDisplayScale = null) => throw new NotSupportedException();
            public Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, string boundary, int edition, int update, byte[] zipfile) => throw new NotSupportedException();
            public Task<YamlDataset> CreateNewDatasetAsync(string name) => throw new NotSupportedException();
            public Task<YamlDataset> CreateNewEditionAsync(string name) => throw new NotSupportedException();
            public Task<YamlDataset> CreateNewUpdateAsync(string name) => throw new NotSupportedException();
            public Task<YamlDataset> ReissueAsync(string name) => throw new NotSupportedException();
            public Task<bool> RollBackAsync(string name) => throw new NotSupportedException();
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
