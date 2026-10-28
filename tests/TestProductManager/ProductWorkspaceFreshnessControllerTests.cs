using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Controllers;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Models;
using S100FC.S128.FeatureTypes;
using static ProductCatalogueAPI.Models.ResponseTypes;

namespace TestProductCatalogueAPI;

public sealed class ProductWorkspaceFreshnessControllerTests
{
    [Fact]
    public async Task WorkspaceFreshnessReturnsOpaqueRevisionAndFailsClosedForUnknownProducts()
    {
        const string datasetName = "101DK001";
        var product = new ElectronicProduct
        {
            datasetName = datasetName,
            editionNumber = 4,
            updateNumber = 2,
            issueDate = new DateOnly(2026, 9, 15),
            specificUsage = 3,
            optimumDisplayScale = 90000,
            productSpecification = new S100FC.S128.ComplexAttributes.productSpecification { name = "S-101" }
        };
        var states = new InMemoryProductRepository();
        var freshness = new RecordingFreshnessRepository(CreateSnapshot(datasetName, eventCount: 1));
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var controller = new ElectronicProductsController(
            NullLogger<ElectronicProductsController>.Instance,
            cache,
            new ProductHistoryControllerTests.FakeProductManager(
                new ProductHistoryControllerTests.FakeElectronicProductManager(
                    new(),
                    new Dictionary<string, ElectronicProduct>(StringComparer.OrdinalIgnoreCase)
                    {
                        [datasetName] = product
                    })),
            states,
            states,
            ProductHistoryEventTests.CreateService(new()),
            freshness);

        var first = Assert.IsType<ApiResponse<ProductWorkspaceFreshnessResponse[]>>(
            Assert.IsType<OkObjectResult>(
                await controller.GetWorkspaceFreshness([datasetName, "UNKNOWN"], CancellationToken.None)).Value);

        Assert.Equal(2, first.TotalHits);
        var available = Assert.Single(first.Data!, item => item.Available);
        Assert.Equal(datasetName, available.DatasetName);
        Assert.StartsWith("v1:", available.Revision);
        Assert.Equal(67, available.Revision!.Length);
        var unavailable = Assert.Single(first.Data!, item => !item.Available);
        Assert.Equal("UNKNOWN", unavailable.DatasetName);
        Assert.Null(unavailable.Revision);
        Assert.Equal(new[] { datasetName }, freshness.RequestedNames);

        var firstRevision = available.Revision;
        product.updateNumber = 3;
        var metadataChanged = Assert.IsType<ApiResponse<ProductWorkspaceFreshnessResponse[]>>(
            Assert.IsType<OkObjectResult>(
                await controller.GetWorkspaceFreshness([datasetName], CancellationToken.None)).Value);
        var metadataRevision = Assert.Single(metadataChanged.Data!).Revision;
        Assert.NotEqual(firstRevision, metadataRevision);

        freshness.Snapshot = CreateSnapshot(datasetName, eventCount: 2);
        var auditChanged = Assert.IsType<ApiResponse<ProductWorkspaceFreshnessResponse[]>>(
            Assert.IsType<OkObjectResult>(
                await controller.GetWorkspaceFreshness([datasetName], CancellationToken.None)).Value);
        Assert.NotEqual(metadataRevision, Assert.Single(auditChanged.Data!).Revision);
    }

    [Fact]
    public async Task WorkspaceFreshnessRejectsEmptyOrOversizedRequestsBeforePersistence()
    {
        var states = new InMemoryProductRepository();
        var freshness = new RecordingFreshnessRepository(CreateSnapshot("101DK001", eventCount: 0));
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var controller = new ElectronicProductsController(
            NullLogger<ElectronicProductsController>.Instance,
            cache,
            new ProductHistoryControllerTests.FakeProductManager(
                new ProductHistoryControllerTests.FakeElectronicProductManager(new(), new())),
            states,
            states,
            ProductHistoryEventTests.CreateService(new()),
            freshness);

        Assert.IsType<BadRequestObjectResult>(
            await controller.GetWorkspaceFreshness([], CancellationToken.None));
        Assert.IsType<BadRequestObjectResult>(
            await controller.GetWorkspaceFreshness(
                Enumerable.Range(1, 51).Select(index => $"P{index:00}").ToArray(),
                CancellationToken.None));
        Assert.Equal(0, freshness.Calls);
    }

    private static ProductWorkspaceFreshnessStoreSnapshot CreateSnapshot(string datasetName, long eventCount)
    {
        var trackId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        return new ProductWorkspaceFreshnessStoreSnapshot(
            [
                new ProductWorkspaceFreshnessTrackSnapshot(
                    trackId,
                    datasetName,
                    "S101",
                    State: 11,
                    PublishedEdition: 3,
                    PublishedUpdate: 1,
                    CandidateEdition: 4,
                    CandidateUpdate: 0,
                    UpdatedAtUtc: DateTime.Parse("2026-09-15T06:00:00Z").ToUniversalTime(),
                    RowVersion: [0, 0, 0, 0, 0, 0, 0, 7],
                    StateHistoryCount: 3,
                    LatestStateHistoryId: Guid.Parse("22222222-2222-2222-2222-222222222222"),
                    LatestStateHistoryAtUtc: DateTime.Parse("2026-09-15T06:00:00Z").ToUniversalTime(),
                    ValidationArtifactCount: 1,
                    LatestValidationArtifactId: Guid.Parse("33333333-3333-3333-3333-333333333333"),
                    LatestValidationArtifactAtUtc: DateTime.Parse("2026-09-15T06:01:00Z").ToUniversalTime())
            ],
            eventCount == 0
                ? []
                : [new ProductWorkspaceFreshnessAuditSnapshot(datasetName, eventCount, DateTime.Parse("2026-09-15T06:02:00Z").ToUniversalTime())]);
    }

    private sealed class RecordingFreshnessRepository(ProductWorkspaceFreshnessStoreSnapshot snapshot)
        : IProductWorkspaceFreshnessRepository
    {
        public ProductWorkspaceFreshnessStoreSnapshot Snapshot { get; set; } = snapshot;
        public int Calls { get; private set; }
        public IReadOnlyList<string> RequestedNames { get; private set; } = [];

        public Task<ProductWorkspaceFreshnessStoreSnapshot> GetSnapshotAsync(
            IReadOnlyCollection<string> datasetNames,
            CancellationToken cancellationToken = default)
        {
            Calls += 1;
            RequestedNames = datasetNames.ToArray();
            return Task.FromResult(Snapshot);
        }
    }
}
