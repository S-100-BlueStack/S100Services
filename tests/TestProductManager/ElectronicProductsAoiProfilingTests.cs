using ArcGIS.Core.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using ProductCatalogueAPI.Controllers;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using S100FC.ProductCatalogue;
using S100FC.S128.FeatureTypes;
using System.Collections;
using System.Diagnostics;
using System.Reflection;
using static ProductCatalogueAPI.Models.ResponseTypes;

namespace TestProductCatalogueAPI
{
    public class ElectronicProductsAoiProfilingTests
    {
        [Fact]
        public async Task GlobalAoiActionPreservesResponseContractAndLogsProfilingMetrics() {
            const string firstDatasetName = "101DK0000001E";
            const string secondDatasetName = "101DK0000002E";
            const string missingDatasetName = "101DK0000003E";
            const string requestId = "be-103-test-request";

            var electronicProductManager = new FakeElectronicProductManager(
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) {
                    [firstDatasetName] = "{\"rings\":[[[10,55],[11,55],[11,56],[10,56],[10,55]]],\"spatialReference\":{\"wkid\":4326}}",
                    [secondDatasetName] = "{\"rings\":[[[11,55],[12,55],[12,56],[11,56],[11,55]]],\"spatialReference\":{\"wkid\":4326}}",
                    [missingDatasetName] = "{\"rings\":[[[12,55],[13,55],[13,56],[12,56],[12,55]]],\"spatialReference\":{\"wkid\":4326}}",
                },
                new Dictionary<string, ElectronicProduct>(StringComparer.OrdinalIgnoreCase) {
                    [firstDatasetName] = CreateElectronicProduct(firstDatasetName, 22_000, 4),
                    [secondDatasetName] = CreateElectronicProduct(secondDatasetName, 45_000, 3),
                }
            );
            var repository = new RecordingProductRepository(new Dictionary<string, ProductRecord?>(StringComparer.OrdinalIgnoreCase) {
                [firstDatasetName] = new ProductRecord {
                    Name = firstDatasetName,
                    State = ProductState.Frozen,
                },
                [secondDatasetName] = null,
            });
            var logger = new RecordingLogger<ElectronicProductsController>();
            using var cache = new MemoryCache(new MemoryCacheOptions());
            var controller = new ElectronicProductsController(
                logger,
                cache,
                new FakeProductManager(electronicProductManager),
                repository
            );
            var httpContext = new DefaultHttpContext {
                TraceIdentifier = requestId,
            };
            controller.ControllerContext = new ControllerContext {
                HttpContext = httpContext,
                RouteData = new RouteData(),
                ActionDescriptor = new ControllerActionDescriptor()
            };

            using var activity = new Activity("BE-103 AOI profiling test")
                .SetIdFormat(ActivityIdFormat.W3C)
                .Start();
            var expectedCorrelationId = activity.TraceId.ToString();

            var actionResult = await controller.GetAllElectronicProductsAOI();

            var okResult = Assert.IsType<OkObjectResult>(actionResult);
            var responses = Assert.IsType<List<AOIResponse>>(okResult.Value);
            Assert.Equal(2, responses.Count);

            var firstResponse = Assert.Single(
                responses.Where(response => response.Attributes?.DatasetName == firstDatasetName)
            );
            Assert.Equal(electronicProductManager.Aois[firstDatasetName], firstResponse.Geometry);
            Assert.Equal(ProductStatus.Frozen, firstResponse.Attributes?.Status);
            Assert.Equal(22_000, firstResponse.Attributes?.DisplayScale);
            Assert.Equal(4, firstResponse.Attributes?.UsageBand);

            var secondResponse = Assert.Single(
                responses.Where(response => response.Attributes?.DatasetName == secondDatasetName)
            );
            Assert.Equal(electronicProductManager.Aois[secondDatasetName], secondResponse.Geometry);
            Assert.Equal(ProductStatus.Idle, secondResponse.Attributes?.Status);
            Assert.Equal(45_000, secondResponse.Attributes?.DisplayScale);
            Assert.Equal(3, secondResponse.Attributes?.UsageBand);

            Assert.Equal(1, repository.BatchCallCount);
            Assert.Equal(new[] { firstDatasetName, secondDatasetName }, repository.RequestedNames);

            var completionEntry = Assert.Single(
                logger.Entries.Where(entry => entry.Properties.ContainsKey("ControllerDurationMs"))
            );
            Assert.Equal(requestId, Assert.IsType<string>(completionEntry.Properties["RequestId"]));
            Assert.Equal(expectedCorrelationId, Assert.IsType<string>(completionEntry.Properties["CorrelationId"]));
            Assert.True(Assert.IsType<bool>(completionEntry.Properties["Success"]));
            Assert.Equal(1, Assert.IsType<int>(completionEntry.Properties["RepositoryCallCount"]));
            Assert.Equal(3, Assert.IsType<int>(completionEntry.Properties["ProductCount"]));
            Assert.Equal(3, Assert.IsType<int>(completionEntry.Properties["GeometryCount"]));
            Assert.Equal(2, Assert.IsType<int>(completionEntry.Properties["ResponseItemCount"]));
            Assert.Equal(1, Assert.IsType<int>(completionEntry.Properties["SkippedProductCount"]));
            Assert.Equal("None", Assert.IsType<string>(completionEntry.Properties["CacheState"]));
            Assert.True(Assert.IsType<double>(completionEntry.Properties["ControllerDurationMs"]) >= 0d);
            Assert.True(Assert.IsType<double>(completionEntry.Properties["GeometryRetrievalMs"]) >= 0d);
            Assert.True(Assert.IsType<double>(completionEntry.Properties["ProductStateRetrievalMs"]) >= 0d);
            Assert.True(Assert.IsType<double>(completionEntry.Properties["MappingMs"]) >= 0d);
        }

        [Theory]
        [InlineData("{\"datasetName\":\"101DK0000001E\"}", "101DK0000001E")]
        [InlineData("{\"attributes\":{\"DatasetName\":\"101DK0000002E\"}}", "101DK0000002E")]
        [InlineData("[{\"ignored\":true},{\"datasetName\":\"101DK0000003E\"}]", "101DK0000003E")]
        public void DatasetNameFastPathReadsDirectAndNestedJson(
            string attrBindings,
            string expectedDatasetName
        ) {
            var method = typeof(ProductManagerGDB).GetMethod(
                "TryReadDatasetNameFromJson",
                BindingFlags.NonPublic | BindingFlags.Static
            );
            Assert.NotNull(method);

            object?[] arguments = [attrBindings, null];
            var success = Assert.IsType<bool>(method.Invoke(null, arguments));

            Assert.True(success);
            Assert.Equal(expectedDatasetName, Assert.IsType<string>(arguments[1]));
        }

        [Fact]
        public void DatasetAoiQueryFilterRestrictsRowsAndHydratedFields() {
            var method = typeof(ProductManagerGDB).GetMethod(
                "CreateDatasetAoiQueryFilter",
                BindingFlags.NonPublic | BindingFlags.Static
            );
            Assert.NotNull(method);

            var filter = Assert.IsType<QueryFilter>(method.Invoke(null, null));

            Assert.Equal(
                "upper(ps) = 'S-128' AND code = 'ElectronicProduct'",
                filter.WhereClause
            );
            Assert.Equal("attributebindings, shape", filter.SubFields);
        }

        [Fact]
        public async Task SingleThreadTaskSchedulerPreservesActivityCorrelation() {
            using var scheduler = new SingleThreadTaskScheduler();
            var taskFactory = new TaskFactory(scheduler);
            using var activity = new Activity("BE-103 scheduler correlation test")
                .SetIdFormat(ActivityIdFormat.W3C)
                .Start();
            var expectedCorrelationId = activity.TraceId.ToString();

            var observedCorrelationId = await taskFactory.StartNew(
                () => Activity.Current?.TraceId.ToString()
            );

            Assert.Equal(expectedCorrelationId, observedCorrelationId);
        }

        private static ElectronicProduct CreateElectronicProduct(
            string datasetName,
            int optimumDisplayScale,
            int specificUsage
        ) {
            return new ElectronicProduct {
                datasetName = datasetName,
                optimumDisplayScale = optimumDisplayScale,
                specificUsage = specificUsage,
            };
        }

        private sealed class FakeProductManager(
            IElectronicProductManager electronicProductManager
        ) : IProductManager
        {
            public INauticalProductManager NauticalProductManager { get; } = new EmptyNauticalProductManager();
            public IElectronicProductManager ElectronicProductManager { get; } = electronicProductManager;
        }

        private sealed class EmptyNauticalProductManager : INauticalProductManager
        {
        }

        private sealed class FakeElectronicProductManager(
            Dictionary<string, string> aois,
            Dictionary<string, ElectronicProduct> products
        ) : IElectronicProductManager
        {
            public IReadOnlyDictionary<string, string> Aois { get; } = aois;
            public string OutputFolder => string.Empty;

            public ElectronicProduct? ElectronicProduct(string name) {
                return products.GetValueOrDefault(name);
            }

            public Task<ElectronicProductVersion?> ReadElectronicProductVersionAsync(
                string datasetName,
                CancellationToken cancellationToken = default
            ) {
                cancellationToken.ThrowIfCancellationRequested();
                var product = products.GetValueOrDefault(datasetName);
                return Task.FromResult(product == null
                    ? null
                    : new ElectronicProductVersion(
                        product.datasetName ?? datasetName,
                        product.editionNumber,
                        product.updateNumber
                    ));
            }

            public Task<Dictionary<string, string>> GetDatasetAOIs() {
                return Task.FromResult(new Dictionary<string, string>(aois, StringComparer.OrdinalIgnoreCase));
            }

            public IEnumerator<string> GetEnumerator() {
                return products.Keys.GetEnumerator();
            }

            IEnumerator IEnumerable.GetEnumerator() {
                return GetEnumerator();
            }

            public Task CreateElectronicProductAsync(
                string name,
                S100FC.S128.ComplexAttributes.productSpecification productSpecification,
                int? specificUsage,
                string boundary,
                string? productMapping,
                int? optimumDisplayScale = null
            ) => throw new NotSupportedException();

            public Task CreateElectronicProductAsync(
                string name,
                S100FC.S128.ComplexAttributes.productSpecification productSpecification,
                string boundary,
                int edition,
                int update,
                byte[] zipfile
            ) => throw new NotSupportedException();

            public Task<S100FC.YAML.Dataset> CreateNewDatasetAsync(string name) => throw new NotSupportedException();
            public Task<S100FC.YAML.Dataset> CreateNewEditionAsync(string name) => throw new NotSupportedException();
            public Task<S100FC.YAML.Dataset> CreateNewUpdateAsync(string name) => throw new NotSupportedException();
            public Task<S100FC.YAML.Dataset> ReissueAsync(string name) => throw new NotSupportedException();
            public Task<S100FC.YAML.Dataset> CreateExportSnapshotAsync(string name, ExportTypes exportType, int edition, int update, CancellationToken cancellationToken = default) => throw new NotSupportedException();
            public Task<bool> IsDirtyAsync(string name) => throw new NotSupportedException();
            public Task<string> GetDatasetBoundary(string name) => throw new NotSupportedException();
            public Task<Dictionary<string, ArchiveRow>> GetPendingEditsAsync(string name) => throw new NotSupportedException();
            public Task<Dictionary<string, Dictionary<string, ArchiveRow>>> GetPendingEditsAsync(DateTime sinceUtc) => throw new NotSupportedException();
            public Task<(string yaml, string index)> GetLatestDatasetYAML(string name, int edition) => throw new NotSupportedException();
            public Task CreateAttachmentAsync(string name, ExportTypes exportType, string yaml, string index, string sign) => throw new NotSupportedException();
            public Task CreateS57AttachmentAsync(string name, ExportTypes exportType, string yaml) => throw new NotSupportedException();
        }

        private sealed class RecordingProductRepository(
            Dictionary<string, ProductRecord?> products
        ) : IProductRepository
        {
            private readonly List<string> _requestedNames = [];

            public int BatchCallCount { get; private set; }
            public IReadOnlyList<string> RequestedNames => _requestedNames;

            public Task<ProductRecord?> GetCurrentByNameAsync(string name) {
                throw new InvalidOperationException("The global AOI action must use the batch repository method.");
            }

            public Task<IEnumerable<ProductRecord>> GetCurrentByNamesAsync(IEnumerable<string> names) {
                BatchCallCount++;
                var requestedNames = names.ToArray();
                _requestedNames.AddRange(requestedNames);

                var records = requestedNames
                    .Select(name => products.GetValueOrDefault(name))
                    .Where(product => product != null)
                    .Cast<ProductRecord>()
                    .ToArray();

                return Task.FromResult<IEnumerable<ProductRecord>>(records);
            }

            public Task AppendAsync(
                string name,
                ProductState state,
                string productSpecification,
                uint editionNo,
                uint? updateNo,
                string? owner = null,
                byte[]? attachment = null,
                string? attachmentFileName = null
            ) => throw new NotSupportedException();

            public Task<IEnumerable<ProductRecord>> GetCurrentAsync() => throw new NotSupportedException();
            public Task<DateTime?> GetLastSuccessfulRunUtcAsync(string jobName) => throw new NotSupportedException();
            public Task SetSuccessfulRunUtcAsync(string jobName, DateTime dateTime) => throw new NotSupportedException();
            public Task<string[]> GetIneligbleProductsAsync() => throw new NotSupportedException();
            public Task<string[]> GetEligibleProductsAsync() => throw new NotSupportedException();
            public Task<IEnumerable<ProductRecord>> GetHistoryByNameAsync(string name) => throw new NotSupportedException();
            public Task<IEnumerable<ProductRecord>> GetHistoryAsync(DateTime fromInclusive, DateTime toExclusive) => throw new NotSupportedException();
        }

        private sealed class RecordingLogger<T> : ILogger<T>
        {
            public List<LogEntry> Entries { get; } = [];

            public IDisposable? BeginScope<TState>(TState state) where TState : notnull {
                return NullScope.Instance;
            }

            public bool IsEnabled(LogLevel logLevel) {
                return true;
            }

            public void Log<TState>(
                LogLevel logLevel,
                EventId eventId,
                TState state,
                Exception? exception,
                Func<TState, Exception?, string> formatter
            ) {
                var properties = state is IEnumerable<KeyValuePair<string, object?>> values
                    ? values.ToDictionary(pair => pair.Key, pair => pair.Value)
                    : new Dictionary<string, object?>();

                Entries.Add(new LogEntry(
                    logLevel,
                    formatter(state, exception),
                    properties,
                    exception
                ));
            }
        }

        private sealed record LogEntry(
            LogLevel Level,
            string Message,
            IReadOnlyDictionary<string, object?> Properties,
            Exception? Exception
        );

        private sealed class NullScope : IDisposable
        {
            public static NullScope Instance { get; } = new();

            public void Dispose() {
            }
        }
    }
}
