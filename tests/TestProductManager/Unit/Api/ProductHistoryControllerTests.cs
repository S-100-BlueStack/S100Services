using TestProductCatalogueAPI.Unit.History;
using System.Collections;
using System.Data;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using ProductCatalogueAPI.Contracts;
using ProductCatalogueAPI.Controllers;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.History;
using ProductCatalogueAPI.Services.ValidationEmail;
using S100FC.ProductCatalogue;
using S100FC.S128.FeatureTypes;
using static ProductCatalogueAPI.Contracts.ResponseTypes;

namespace TestProductCatalogueAPI.Unit.Api;

public class ProductHistoryControllerTests
{
    [Fact]
    public async Task HistoryPreservesLegacyEnvelopeFieldsAndAddsOnlyFinalizedExplicitEvents()
    {
        var states = new InMemoryProductRepository();
        await states.AppendAsync("101DK001", ProductState.Exported, "S-101", 2, 1, @"PROD\user", errorCode: "TEST_ERROR", errorMessage: "Test error message");
        var stateId = Assert.Single(await states.GetHistoryByNameAsync("101DK001")).Id;
        var events = new HistoryMemoryRepository();
        var service = ProductHistoryEventTests.CreateService(events);
        var operationId = Guid.NewGuid();
        await service.CreatePendingAsync(new(operationId, "101DK001", "Export"));
        await service.CreatePendingAsync(new(Guid.NewGuid(), "101DK001", "Rollback"));
        await service.FinalizeAsync(new(operationId, ProductHistoryResult.Succeeded, stateId));
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var controller = CreateController(cache, states, service);
        var response = Assert.IsType<ProductHistoryEnvelope>(Assert.IsType<OkObjectResult>(
            await controller.GetElectronicProductHistory("101DK001")).Value);
        var state = Assert.Single(response.Data!);
        Assert.Equal(1, response.TotalHits);
        Assert.Equal(stateId, state.Id);
        Assert.Equal("101DK001", state.Name);
        Assert.Equal("S-101", state.ProductSpecification);
        Assert.Equal(2, state.Edition);
        Assert.Equal(1, state.Update);
        Assert.Equal(ProductStatus.Exported, state.Status);
        Assert.Equal("USER", state.Owner);
        Assert.Equal("TEST_ERROR", state.ErrorCode);
        Assert.Equal(PublicExportError.GenericMessage, state.ErrorMessage);
        Assert.Equal(1, response.EventTotalHits);
        Assert.Equal(stateId, Assert.Single(response.Events).StateRecordId);
        Assert.True(response.Success);
        Assert.NotNull(response.DurationMs);
        using var json = JsonDocument.Parse(JsonSerializer.Serialize(response));
        foreach (var field in new[] { "Data", "TotalHits", "Success", "Message", "DurationMs", "Timestamp", "Events", "EventTotalHits" })
            Assert.True(json.RootElement.TryGetProperty(field, out _));
        Assert.Equal(stateId, json.RootElement.GetProperty("Data")[0].GetProperty("Id").GetGuid());
    }

    [Fact]
    public async Task HistoryWithEmptyAuditTablePreservesLegacyData()
    {
        var states = new InMemoryProductRepository();
        await states.AppendAsync("101DK001", ProductState.Idle, "S-101", 1, 0);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var controller = CreateController(cache, states, ProductHistoryEventTests.CreateService(new()));
        var response = Assert.IsType<ProductHistoryEnvelope>(Assert.IsType<OkObjectResult>(
            await controller.GetElectronicProductHistory("101DK001")).Value);
        Assert.Single(response.Data!);
        Assert.Equal(1, response.TotalHits);
        Assert.Empty(response.Events);
        Assert.Equal(0, response.EventTotalHits);
    }

    [Fact]
    public async Task AuditCanonicalizationDoesNotReinterpretLegacyNameQueries()
    {
        var states = new InMemoryProductRepository();
        await states.AppendAsync("101dk001", ProductState.Idle, "S-101", 1, 0);
        var events = new HistoryMemoryRepository();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var controller = CreateController(cache, states, ProductHistoryEventTests.CreateService(events));
        var response = Assert.IsType<ProductHistoryEnvelope>(Assert.IsType<OkObjectResult>(
            await controller.GetElectronicProductHistory("101dk001")).Value);
        Assert.Equal("101dk001", Assert.Single(response.Data!).Name);
        Assert.Equal("101DK001", events.LastQuery);
    }

    [Theory]
    [InlineData(" !example: alpha+beta (test) ")]
    [InlineData("..example")]
    [InlineData("example/name")]
    public async Task HistoryResolvesExistingNamesBeforeCanonicalAuditLookup(string name)
    {
        var states = new InMemoryProductRepository();
        await states.AppendAsync(name, ProductState.Idle, "S-101", 1, 0);
        var events = new HistoryMemoryRepository();
        var service = ProductHistoryEventTests.CreateService(events);
        var operationId = Guid.NewGuid();
        await service.CreatePendingAsync(new(operationId, name, "Export"));
        await service.FinalizeAsync(new(operationId, ProductHistoryResult.Succeeded));
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var controller = CreateController(cache, states, service, name);
        var response = Assert.IsType<ProductHistoryEnvelope>(Assert.IsType<OkObjectResult>(
            await controller.GetElectronicProductHistory(name)).Value);
        Assert.Equal(name, Assert.Single(response.Data!).Name);
        Assert.Equal(1, response.TotalHits);
        Assert.Equal(operationId, Assert.Single(response.Events).OperationId);
        Assert.Equal(name.Trim().ToUpperInvariant(), events.LastQuery);
    }

    [Fact]
    public async Task MissingProductPreservesLegacyNotFoundBeforeAuditValidation()
    {
        var events = new HistoryMemoryRepository();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var controller = CreateController(cache, new InMemoryProductRepository(), ProductHistoryEventTests.CreateService(events));
        foreach (var name in new[] { "   ", "UNKNOWN", "!missing:name", "name\0value", new string('A', 257) })
        {
            var response = Assert.IsType<ProductHistoryEnvelope>(Assert.IsType<NotFoundObjectResult>(
                await controller.GetElectronicProductHistory(name)).Value);
            Assert.False(response.Success);
            Assert.Equal($"No electronic product with name '{name}' was found.", response.Message);
        }
        Assert.Equal(0, events.Accesses);
    }

    [Fact]
    public async Task ExistingNamesOutsideAuditStorageBoundsRetainLegacyHistory()
    {
        foreach (var name in new[] { "   ", "name\0value", new string('A', 257) })
        {
            var states = new InMemoryProductRepository();
            await states.AppendAsync(name, ProductState.Idle, "S-101", 1, 0);
            var events = new HistoryMemoryRepository();
            using var cache = new MemoryCache(new MemoryCacheOptions());
            var controller = CreateController(cache, states, ProductHistoryEventTests.CreateService(events), name);
            var response = Assert.IsType<ProductHistoryEnvelope>(Assert.IsType<OkObjectResult>(
                await controller.GetElectronicProductHistory(name)).Value);
            Assert.True(response.Success);
            Assert.Equal(name, Assert.Single(response.Data!).Name);
            Assert.Equal(1, response.TotalHits);
            Assert.Empty(response.Events);
            Assert.Equal(0, response.EventTotalHits);
            Assert.Equal(0, events.Accesses);
        }
    }

    [Fact]
    public async Task DeliveryHistoryRequiresOptInAndAnExactCatalogueSpecification()
    {
        var projection = new DeliveryHistoryStub();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var controller = CreateDeliveryController(cache, projection);

        var legacy = DeliveryEnvelope(await controller.GetElectronicProductHistory("101DK001", specification: "S102"));
        Assert.False(JsonSerializer.SerializeToElement(legacy).TryGetProperty("IcEncDeliveries", out _));
        var mismatch = DeliveryEnvelope(await controller.GetElectronicProductHistory("101DK001", "true", "S57"));
        Assert.Equal("Unavailable", mismatch.IcEncDeliveries!.Availability);
        Assert.Null(mismatch.IcEncDeliveries.HasMore);
        Assert.IsType<NotFoundObjectResult>(await controller.GetElectronicProductHistory("UNKNOWN", "true", "S101"));
        Assert.Empty(projection.Calls);

        var exact = DeliveryEnvelope(await controller.GetElectronicProductHistory("101dk001", "true", "S101"));
        Assert.Equal(("101DK001", "S101"), Assert.Single(projection.Calls));
        Assert.Equal("Available", exact.IcEncDeliveries!.Availability);
        Assert.Empty(exact.IcEncDeliveries.Items);
        Assert.Empty(exact.Data!);
        Assert.Empty(exact.Events);
    }

    [Theory]
    [InlineData("yes", "S101")]
    [InlineData("", "S101")]
    [InlineData("true", null)]
    [InlineData("true", "S102")]
    public async Task InvalidDeliveryOptionsReturnBadRequestBeforeProjection(string option, string? specification)
    {
        var projection = new DeliveryHistoryStub();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var controller = CreateDeliveryController(cache, projection);

        Assert.IsType<BadRequestObjectResult>(await controller.GetElectronicProductHistory("101DK001", option, specification));
        Assert.Empty(projection.Calls);
    }

    [Theory]
    [InlineData("?includeIcEncDeliveries", null, null)]
    [InlineData("?includeIcEncDeliveries=true&includeIcEncDeliveries=false", "true", "S101")]
    [InlineData("?includeIcEncDeliveries=true&specification=S101&specification=S57", "true", "S101")]
    public async Task EmptyOrRepeatedQueryParametersCannotOptIn(string query, string? option, string? specification)
    {
        var projection = new DeliveryHistoryStub();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var controller = CreateDeliveryController(cache, projection);
        controller.ControllerContext.HttpContext = new DefaultHttpContext();
        controller.Request.QueryString = new QueryString(query);
        Assert.IsType<BadRequestObjectResult>(await controller.GetElectronicProductHistory("101DK001", option, specification));
        Assert.Empty(projection.Calls);
    }

    [Fact]
    public async Task DeliveryFailureRetainsStateHistoryAndCancellationPropagates()
    {
        var fixture = new InMemoryProductRepository();
        await fixture.AppendAsync("101DK001", ProductState.Idle, "S-101", 1, 0);
        var projection = new DeliveryHistoryStub { Failure = new InvalidOperationException("private fixture") };
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var controller = CreateDeliveryController(cache, projection, fixture);
        var response = DeliveryEnvelope(await controller.GetElectronicProductHistory("101DK001", "true", "S101"));
        Assert.Single(response.Data!);
        Assert.Equal("Unavailable", response.IcEncDeliveries!.Availability);
        Assert.DoesNotContain("private fixture", JsonSerializer.Serialize(response));

        projection.Failure = new OperationCanceledException();
        await Assert.ThrowsAsync<OperationCanceledException>(() => controller.GetElectronicProductHistory("101DK001", "true", "S101"));
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            controller.GetElectronicProductHistory("101DK001", "true", "S101", cancelled.Token));
        Assert.Equal(2, projection.Calls.Count);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task InvalidOrUnresolvableModeLeavesLegacyHistoryAndNeverOpensTheProjectionDatabase(bool bindingFails)
    {
        var settingsReads = 0;
        var services = new ServiceCollection();
        services.AddOptions<SendToIcEncOptions>().Configure(options =>
        {
            settingsReads++;
            if (bindingFails) throw new InvalidOperationException("private fixture");
            options.Mode = (SendToIcEncMode)99;
        });
        services.AddOptions<ValidationEmailOptions>().Configure(options => options.Mode = ValidationEmailMode.Simulation);
        using var provider = services.BuildServiceProvider();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var connection = new UnusedHistoryConnectionFactory();
        var projection = new ProductIcEncDeliveryHistoryRepository(
            connection, NullLogger<ProductIcEncDeliveryHistoryRepository>.Instance,
            provider.GetRequiredService<IOptionsMonitor<SendToIcEncOptions>>(),
            provider.GetRequiredService<IOptions<ValidationEmailOptions>>());
        var controller = CreateDeliveryController(cache, projection);

        var legacy = DeliveryEnvelope(await controller.GetElectronicProductHistory("101DK001"));
        Assert.Null(legacy.IcEncDeliveries);
        Assert.Equal(0, settingsReads);

        var optedIn = DeliveryEnvelope(await controller.GetElectronicProductHistory("101DK001", "true", "S101"));
        Assert.True(optedIn.Success);
        Assert.Equal("Unavailable", optedIn.IcEncDeliveries!.Availability);
        Assert.Empty(optedIn.IcEncDeliveries.Items);
        Assert.DoesNotContain("private fixture", JsonSerializer.Serialize(optedIn));
        Assert.Equal(1, settingsReads);
        Assert.Equal(0, connection.Calls);
    }

    private sealed class UnusedHistoryConnectionFactory() : DbConnectionFactory(new ConfigurationBuilder().Build())
    {
        public int Calls { get; private set; }

        public override IDbConnection Create()
        {
            Calls++;
            throw new InvalidOperationException("The delivery history database must not be opened.");
        }
    }

    private static ProductHistoryEnvelope DeliveryEnvelope(IActionResult result) =>
        Assert.IsType<ProductHistoryEnvelope>(Assert.IsType<OkObjectResult>(result).Value);

    private static ElectronicProductsController CreateDeliveryController(
        IMemoryCache cache, IProductIcEncDeliveryHistoryRepository projection, InMemoryProductRepository? fixture = null)
    {
        var states = fixture ?? new InMemoryProductRepository();
        return new(NullLogger<ElectronicProductsController>.Instance, cache,
            new FakeProductManager(new FakeElectronicProductManager(new(), new(StringComparer.OrdinalIgnoreCase)
            {
                ["101DK001"] = new ElectronicProduct
                {
                    datasetName = "101DK001",
                    productSpecification = new S100FC.S128.ComplexAttributes.productSpecification { name = "S-101" }
                }
            })), states, states, ProductHistoryEventTests.CreateService(new()), deliveryHistoryRepository: projection);
    }

    private sealed class DeliveryHistoryStub : IProductIcEncDeliveryHistoryRepository
    {
        public Exception? Failure { get; set; }
        public List<(string Dataset, string Specification)> Calls { get; } = [];

        public Task<ProductIcEncDeliveryHistoryResponse> GetAsync(string datasetName, string specification,
            Func<Guid, string> downloadUrl, CancellationToken cancellationToken)
        {
            Calls.Add((datasetName, specification));
            return Failure is null
                ? Task.FromResult(new ProductIcEncDeliveryHistoryResponse(datasetName, specification, "Available", false, []))
                : Task.FromException<ProductIcEncDeliveryHistoryResponse>(Failure);
        }
    }

    internal static ElectronicProductsController CreateController(
        IMemoryCache cache, InMemoryProductRepository states, IProductHistoryEventService events, string datasetName = "101DK001") => new(
            NullLogger<ElectronicProductsController>.Instance, cache,
            new FakeProductManager(new FakeElectronicProductManager(new(), new(StringComparer.OrdinalIgnoreCase) {
                [datasetName] = new ElectronicProduct { datasetName = datasetName }
            })), states, states, events);

        internal sealed class FakeProductManager(
            IElectronicProductManager electronicProductManager
        ) : IProductManager
        {
            public INauticalProductManager NauticalProductManager { get; } = new EmptyNauticalProductManager();
            public IElectronicProductManager ElectronicProductManager { get; } = electronicProductManager;
        }

        internal sealed class EmptyNauticalProductManager : INauticalProductManager
        {
        }

        internal sealed class FakeElectronicProductManager(
            Dictionary<string, string> aois,
            Dictionary<string, ElectronicProduct> products,
            IReadOnlyDictionary<(string Name, string Specification), IReadOnlyList<ElectronicProduct>>? mappedProducts = null
        ) : IElectronicProductManager
        {
            public IReadOnlyDictionary<string, string> Aois { get; } = aois;
            public string OutputFolder => string.Empty;

            public ElectronicProduct? ElectronicProduct(string name) {
                return products.GetValueOrDefault(name);
            }

            public ElectronicProduct? ElectronicProduct(string name, string productSpecification) {
                var product = products.GetValueOrDefault(name);
                var requested = productSpecification.Replace("-", string.Empty, StringComparison.OrdinalIgnoreCase);
                var actual = product?.productSpecification?.name?.Replace("-", string.Empty, StringComparison.OrdinalIgnoreCase);
                return string.Equals(requested, actual, StringComparison.OrdinalIgnoreCase) ? product : null;
            }

            public IReadOnlyList<ElectronicProduct> GetMappedElectronicProducts(string name, string productSpecification) =>
                mappedProducts?.GetValueOrDefault((name, productSpecification)) ?? [];

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

            public Task<Dictionary<string, string>> GetDatasetAOIs(string productSpecification) {
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
            public Task<bool> RollBackAsync(string name) => throw new NotSupportedException();
            public Task<bool> IsDirtyAsync(string name) => throw new NotSupportedException();
            public Task<string> GetDatasetBoundary(string name) => throw new NotSupportedException();
            public Task<Dictionary<string, ArchiveRow>> GetPendingEditsAsync(string name) => throw new NotSupportedException();
            public Task<Dictionary<string, Dictionary<string, ArchiveRow>>> GetPendingEditsAsync(DateTime sinceUtc) => throw new NotSupportedException();
            public Task<(string yaml, string index)> GetLatestDatasetYAML(string name, int edition) => throw new NotSupportedException();
            public Task CreateAttachmentAsync(string name, ExportTypes exportType, string yaml, string index, string sign) => throw new NotSupportedException();
            public Task CreateS57AttachmentAsync(string name, ExportTypes exportType, string yaml) => throw new NotSupportedException();
        }

}
