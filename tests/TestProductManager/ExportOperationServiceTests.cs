using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.Operations;
using S100FC.ProductCatalogue;
using S100FC.S128.FeatureTypes;
using System.Collections;
using static ProductCatalogueAPI.Models.RequestTypes;
using YamlDataset = S100FC.YAML.Dataset;

namespace TestProductCatalogueAPI
{
    public class ExportOperationServiceTests
    {
        [Fact]
        public async Task NewEditionUsesOneSharedOperationFlow() {
            var electronicProducts = new FakeElectronicProductManager();
            var productManager = new FakeProductManager(electronicProducts);
            var exports = new FakeExportService();
            var repository = RepositoryWithState(ProductState.Idle);
            var service = new TestExportOperationService(
                productManager,
                exports,
                repository,
                "dataset-yaml"
            );
            var guardSet = false;

            var result = await service.ExecuteNewEditionAsync(
                "101DK001",
                ExportFormat.S100,
                "test-user",
                beforeMutation: () => {
                    Assert.Equal(0, electronicProducts.NewEditionCalls);
                    guardSet = true;
                }
            );

            Assert.True(guardSet);
            Assert.Equal(ExportOperationContract.ExportCompletedCode, result.Code);
            Assert.Null(result.Warning);
            Assert.Equal(1, electronicProducts.NewEditionCalls);
            Assert.Equal(1, electronicProducts.AttachmentCalls);
            Assert.Equal(1, exports.CreateCalls);
            Assert.Equal("dataset-yaml", exports.LastYaml);
            Assert.Equal(ProductState.Exported, repository.LastState);
            Assert.Equal("S-101", repository.LastProductSpecification);
            Assert.Equal("test-user", repository.LastOwner);
        }

        [Fact]
        public async Task NewEditionRejectsInvalidStateBeforeExecutionGuardAndMutation() {
            var electronicProducts = new FakeElectronicProductManager();
            var repository = RepositoryWithState(ProductState.Frozen);
            var service = new TestExportOperationService(
                new FakeProductManager(electronicProducts),
                new FakeExportService(),
                repository,
                "dataset-yaml"
            );
            var guardSet = false;

            var exception = await Assert.ThrowsAsync<ExportOperationRejectedException>(() =>
                service.ExecuteNewEditionAsync(
                    "101DK001",
                    ExportFormat.S100,
                    null,
                    beforeMutation: () => guardSet = true
                )
            );

            Assert.Equal(
                "A New edition could not be created now. Current product state: Frozen.",
                exception.Message
            );
            Assert.False(guardSet);
            Assert.Equal(0, electronicProducts.NewEditionCalls);
        }

        [Fact]
        public async Task EmptySerializedDatasetRetainsTheSyncFailureSignal() {
            var service = new TestExportOperationService(
                new FakeProductManager(new FakeElectronicProductManager()),
                new FakeExportService(),
                RepositoryWithState(ProductState.Idle),
                string.Empty
            );

            await Assert.ThrowsAsync<ExportSourceUnavailableException>(() =>
                service.ExecuteNewEditionAsync(
                    "101DK001",
                    ExportFormat.S100,
                    null
                )
            );
        }

        [Fact]
        public async Task RollbackCleanupFailureReturnsPersistentSafeWarning() {
            var electronicProducts = new FakeElectronicProductManager();
            var exports = new FakeExportService { DeleteResult = false };
            var repository = RepositoryWithState(ProductState.Exported);
            var service = new TestExportOperationService(
                new FakeProductManager(electronicProducts),
                exports,
                repository,
                "unused"
            );
            var guardSet = false;

            var result = await service.ExecuteRollbackAsync(
                "101DK001",
                beforeMutation: () => {
                    Assert.Equal(0, electronicProducts.RollbackCalls);
                    guardSet = true;
                }
            );

            Assert.True(guardSet);
            Assert.Equal(ExportOperationContract.RollbackCompletedCode, result.Code);
            Assert.NotNull(result.Warning);
            Assert.Equal(
                ExportOperationContract.RollbackCleanupFailedCode,
                result.Warning!.Code
            );
            Assert.DoesNotContain("\\", result.Warning.Message);
            Assert.Equal(1, electronicProducts.RollbackCalls);
            Assert.Equal(ProductState.Idle, repository.LastState);
            Assert.Equal("S-128", repository.LastProductSpecification);
            Assert.Null(repository.LastOwner);
        }

        [Fact]
        public async Task RollbackRejectsInvalidStateBeforeExecutionGuardAndMutation() {
            var electronicProducts = new FakeElectronicProductManager();
            var service = new TestExportOperationService(
                new FakeProductManager(electronicProducts),
                new FakeExportService(),
                RepositoryWithState(ProductState.Idle),
                "unused"
            );
            var guardSet = false;

            var exception = await Assert.ThrowsAsync<ExportOperationRejectedException>(() =>
                service.ExecuteRollbackAsync(
                    "101DK001",
                    beforeMutation: () => guardSet = true
                )
            );

            Assert.Equal(
                "A rollback could not be performed now. Current product state: Idle.",
                exception.Message
            );
            Assert.False(guardSet);
            Assert.Equal(0, electronicProducts.RollbackCalls);
        }

        [Fact]
        public async Task RollbackRejectsEditionOneBeforeExecutionGuardAndMutation() {
            var electronicProducts = new FakeElectronicProductManager(edition: 1, update: 0);
            var service = new TestExportOperationService(
                new FakeProductManager(electronicProducts),
                new FakeExportService(),
                RepositoryWithState(ProductState.Exported),
                "unused"
            );
            var guardSet = false;

            var exception = await Assert.ThrowsAsync<ExportOperationRejectedException>(() =>
                service.ExecuteRollbackAsync(
                    "101DK001",
                    beforeMutation: () => guardSet = true
                )
            );

            Assert.Equal("Dataset cannot be rolled back further.", exception.Message);
            Assert.False(guardSet);
            Assert.Equal(0, electronicProducts.RollbackCalls);
        }

        private static RecordingRepository RepositoryWithState(ProductState state) => new() {
            CurrentRecord = new ProductRecord {
                Name = "101DK001",
                State = state,
                EditionNo = 4,
                UpdateNo = 2
            }
        };

        private sealed class TestExportOperationService(
            IProductManager productManager,
            IExportService exportService,
            IProductRepository productRepository,
            string serializedDataset
        ) : ExportOperationService(
            productManager,
            exportService,
            productRepository,
            NullLogger<ExportOperationService>.Instance
        )
        {
            protected override string SerializeDataset(YamlDataset dataset) => serializedDataset;
        }

        private sealed class FakeProductManager(
            IElectronicProductManager electronicProductManager
        ) : IProductManager
        {
            public INauticalProductManager NauticalProductManager => null!;
            public IElectronicProductManager ElectronicProductManager { get; } = electronicProductManager;
        }

        private sealed class FakeElectronicProductManager(
            int edition = 4,
            int update = 2
        ) : IElectronicProductManager
        {
            private readonly ElectronicProduct _product = new() {
                datasetName = "101DK001",
                editionNumber = edition,
                updateNumber = update
            };

            public string OutputFolder => "output";
            public int NewEditionCalls { get; private set; }
            public int RollbackCalls { get; private set; }
            public int AttachmentCalls { get; private set; }

            public ElectronicProduct? ElectronicProduct(string name) => _product;

            public Task<ElectronicProductVersion?> ReadElectronicProductVersionAsync(
                string datasetName,
                CancellationToken cancellationToken = default
            ) => Task.FromResult<ElectronicProductVersion?>(new(
                _product.datasetName!,
                _product.editionNumber,
                _product.updateNumber
            ));

            public Task<YamlDataset> CreateNewEditionAsync(string name) {
                NewEditionCalls++;
                _product.editionNumber = 5;
                _product.updateNumber = 0;
                return Task.FromResult(new YamlDataset {
                    Edition = 5,
                    Update = 0
                });
            }

            public Task<bool> RollBackAsync(string name) {
                RollbackCalls++;
                _product.updateNumber = Math.Max(0, _product.updateNumber.GetValueOrDefault() - 1);
                return Task.FromResult(true);
            }

            public Task CreateAttachmentAsync(
                string name,
                ExportTypes exportType,
                string yaml,
                string index,
                string sign
            ) {
                AttachmentCalls++;
                return Task.CompletedTask;
            }

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
            public Task CreateS57AttachmentAsync(string name, ExportTypes exportType, string yaml) => throw new NotSupportedException();
        }

        private sealed class FakeExportService : IExportService
        {
            public int CreateCalls { get; private set; }
            public string? LastYaml { get; private set; }
            public bool DeleteResult { get; set; } = true;

            public ExportResult CreateS100Export(string datasetName, uint editionNo, uint? updateNo, string outputFolder, string yaml, string prevIndex = "") {
                CreateCalls++;
                LastYaml = yaml;
                return new ExportResult("index", "sign");
            }

            public bool DeleteExport(string datasetName, string outputFolder, uint editionNo, uint? updateNo = 0) => DeleteResult;
            public int CreateS57Export(string datasetName, uint editionNo, uint? updateNo, string outputFolder, string yaml) => throw new NotSupportedException();
        }

        private sealed class RecordingRepository : IProductRepository
        {
            public ProductRecord? CurrentRecord { get; init; }
            public ProductState? LastState { get; private set; }
            public string? LastProductSpecification { get; private set; }
            public string? LastOwner { get; private set; }

            public Task AppendAsync(string name, ProductState state, string productSpecification, uint editionNo, uint? updateNo, string? owner = null, byte[]? attachment = null, string? attachmentFileName = null) {
                LastState = state;
                LastProductSpecification = productSpecification;
                LastOwner = owner;
                return Task.CompletedTask;
            }

            public Task<IEnumerable<ProductRecord>> GetCurrentAsync() => throw new NotSupportedException();
            public Task<ProductRecord?> GetCurrentByNameAsync(string name) => Task.FromResult(CurrentRecord);
            public Task<IEnumerable<ProductRecord>> GetCurrentByNamesAsync(IEnumerable<string> names) => throw new NotSupportedException();
            public Task<DateTime?> GetLastSuccessfulRunUtcAsync(string jobName) => throw new NotSupportedException();
            public Task SetSuccessfulRunUtcAsync(string jobName, DateTime dateTime) => throw new NotSupportedException();
            public Task<string[]> GetIneligbleProductsAsync() => throw new NotSupportedException();
            public Task<string[]> GetEligibleProductsAsync() => throw new NotSupportedException();
            public Task<IEnumerable<ProductRecord>> GetHistoryByNameAsync(string name) => throw new NotSupportedException();
            public Task<IEnumerable<ProductRecord>> GetHistoryAsync(DateTime fromInclusive, DateTime toExclusive) => throw new NotSupportedException();
        }
    }
}
