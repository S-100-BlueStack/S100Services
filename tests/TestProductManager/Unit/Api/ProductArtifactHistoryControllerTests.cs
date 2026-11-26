using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Controllers;
using ProductCatalogueAPI.Data.Models;
using S100FC.S128.FeatureTypes;
using static ProductCatalogueAPI.Contracts.ResponseTypes;

namespace TestProductCatalogueAPI.Unit.Api;

public sealed class ProductArtifactHistoryControllerTests
{
    private const string S101Name = "101DK001";
    private const string S57Name = "DK000001";
    private const string OtherName = "101DK002";
    private static readonly DateTime CreatedAt = new(2026, 11, 20, 8, 0, 0, DateTimeKind.Utc);

    [Theory]
    [InlineData(S101Name)]
    [InlineData(S57Name)]
    public async Task HistoryIncludesPublishedAndDiscardedMappedTracksWithoutExposingOtherTracks(string requestedName)
    {
        var repository = new InMemoryProductRepository();
        var published = await CreateTrackAsync(repository, S101Name, ProductSpecification.S101);
        // Model the persisted post-publication state; publication itself is outside this read-side test.
        await repository.SetStateAsync(published.Id, ProductState.Published, null, CreatedAt);
        var publishedRevision = await AddRevisionAsync(repository, published.Id, 4, CreatedAt);
        await AddArtifactAsync(repository, published.Id, publishedRevision, ProductArtifactKind.IcEncReport, "published.doc", CreatedAt);

        var discarded = await CreateTrackAsync(repository, S57Name, ProductSpecification.S57);
        await repository.BeginExportAsync(discarded.Id, 5, 0, null, CreatedAt.AddMinutes(1));
        var discardedRevision = await AddRevisionAsync(repository, discarded.Id, 5, CreatedAt.AddMinutes(1));
        await AddArtifactAsync(repository, discarded.Id, discardedRevision, ProductArtifactKind.ValidationDiagnostic, "discarded.vld", CreatedAt.AddMinutes(2));
        await AddArtifactAsync(repository, discarded.Id, null, ProductArtifactKind.ValidationReport, "legacy.xml", CreatedAt.AddMinutes(-1));
        await AddArtifactAsync(repository, discarded.Id, discardedRevision, ProductArtifactKind.ExchangeSet, "exchange.zip", CreatedAt.AddMinutes(3));
        await repository.SetStateAsync(discarded.Id, ProductState.Error, null, CreatedAt.AddMinutes(4));
        await repository.DiscardCandidateAsync(discarded.Id, null, CreatedAt.AddMinutes(5));

        var unrelated = await CreateTrackAsync(repository, OtherName, ProductSpecification.S101);
        await AddArtifactAsync(repository, unrelated.Id, null, ProductArtifactKind.ValidationDiagnostic, "unrelated.vld", CreatedAt);
        var bathymetry = await repository.GetOrCreateTrackAsync(S101Name, ProductSpecification.S102, ExportEngineKind.Hdf5, 4, 0);
        await AddArtifactAsync(repository, bathymetry.Id, null, ProductArtifactKind.ValidationDiagnostic, "bathymetry.vld", CreatedAt);

        using var cache = new MemoryCache(new MemoryCacheOptions());
        var controller = CreateController(cache, repository);
        var history = await ReadHistoryAsync(controller, requestedName);
        Assert.Equal(new[] { "discarded.vld", "published.doc", "legacy.xml" }, history.Select(item => item.FileName));

        var expected = (await repository.GetValidationArtifactHistoryAsync(published.Id))
            .Concat(await repository.GetValidationArtifactHistoryAsync(discarded.Id))
            .ToDictionary(item => item.Id);
        Assert.Equal(expected.Count, history.Length);
        foreach (var item in history)
        {
            var stored = expected[item.Id];
            var owner = stored.TrackId == published.Id ? published : discarded;
            Assert.Equal(owner.Id, item.TrackId);
            Assert.Equal(owner.DatasetName, item.DatasetName);
            Assert.Equal(owner.ProductSpecification.ToString(), item.ProductSpecification);
            Assert.Equal(stored.RevisionId, item.RevisionId);
            Assert.Equal(stored.Kind.ToString(), item.Kind);
            Assert.Equal(stored.FileName, item.FileName);
            Assert.Equal(stored.MediaType, item.MediaType);
            Assert.Equal(stored.CreatedAtUtc, item.CreatedAtUtc);
            Assert.Equal($"/electronicproducts/{owner.DatasetName}/artifacts/{stored.Id:D}", item.Url);

            var download = Assert.IsType<FileContentResult>(await controller.DownloadValidationArtifact(owner.DatasetName, item.Id, CancellationToken.None));
            Assert.Equal(stored.FileName, download.FileDownloadName);
            Assert.Equal(stored.MediaType, download.ContentType);
            Assert.Equal("test-report"u8.ToArray(), download.FileContents);
            var wrongOwner = owner.DatasetName == S101Name ? S57Name : S101Name;
            Assert.IsType<NotFoundResult>(await controller.DownloadValidationArtifact(wrongOwner, item.Id, CancellationToken.None));
        }
        Assert.Null(Assert.Single(history, item => item.FileName == "legacy.xml").RevisionId);
        var detail = await ReadDetailAsync(controller, requestedName);
        Assert.Empty(detail.Exports!);
        Assert.NotNull(detail.Package);
        Assert.False(detail.Package!.HasActivePackage);
        Assert.Equal(ProductState.Published, detail.Package.S101.Status);
        Assert.Equal(ProductState.Idle, detail.Package.S57.Status);
        Assert.Null(detail.Package.S101.CandidateEdition);
        Assert.Null(detail.Package.S57.CandidateEdition);
    }

    [Fact]
    public async Task DiscardAndReplacementKeepHistoryIndependentOfCurrentCandidateLinks()
    {
        var repository = new InMemoryProductRepository();
        var track = await CreateTrackAsync(repository, S101Name, ProductSpecification.S101);
        await repository.BeginExportAsync(track.Id, 5, 0, null, CreatedAt);
        var firstRevision = await AddRevisionAsync(repository, track.Id, 5, CreatedAt);
        await AddArtifactAsync(repository, track.Id, firstRevision, ProductArtifactKind.ValidationDiagnostic, "first.vld", CreatedAt);
        await repository.SetStateAsync(track.Id, ProductState.ReadyForDistribution, null, CreatedAt.AddMinutes(1));
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var controller = CreateController(cache, repository);

        var first = Assert.Single(await ReadHistoryAsync(controller, S101Name));
        var firstExport = Assert.Single((await ReadDetailAsync(controller, S101Name)).Exports!);
        Assert.Equal(ProductStatus.ReadyForDistribution, firstExport.Status);
        Assert.Equal(5, firstExport.Edition);
        Assert.Equal(first.Id, Assert.Single(firstExport.ValidationArtifacts!).Id);

        await repository.DiscardCandidateAsync(track.Id, null, CreatedAt.AddMinutes(2));
        Assert.Equal(first, Assert.Single(await ReadHistoryAsync(controller, S101Name)));
        Assert.Empty((await ReadDetailAsync(controller, S101Name)).Exports!);

        // Rebuilding the same edition/update must not conflate distinct revision identities.
        await repository.BeginExportAsync(track.Id, 5, 0, null, CreatedAt.AddMinutes(3));
        var replacementRevision = await AddRevisionAsync(repository, track.Id, 5, CreatedAt.AddMinutes(3));
        await AddArtifactAsync(repository, track.Id, replacementRevision, ProductArtifactKind.ValidationDiagnostic, "replacement.vld", CreatedAt.AddMinutes(3));
        await repository.SetStateAsync(track.Id, ProductState.ReadyForDistribution, null, CreatedAt.AddMinutes(4));

        var history = await ReadHistoryAsync(controller, S101Name);
        Assert.Equal(2, history.Length);
        Assert.Equal(first, history[1]);
        Assert.Equal(replacementRevision, history[0].RevisionId);
        Assert.NotEqual(first.Id, history[0].Id);
        var replacementExport = Assert.Single((await ReadDetailAsync(controller, S101Name)).Exports!);
        Assert.Equal(ProductStatus.ReadyForDistribution, replacementExport.Status);
        Assert.Equal(5, replacementExport.Edition);
        Assert.Equal(history[0].Id, Assert.Single(replacementExport.ValidationArtifacts!).Id);
    }

    [Theory]
    [InlineData(ProductState.Error, ProductStatus.Error)]
    [InlineData(ProductState.Rejected, ProductStatus.Rejected)]
    public async Task CandidateLessFailuresRemainInCurrentExportsWithoutHistoricalLinks(ProductState state, ProductStatus status)
    {
        var repository = new InMemoryProductRepository();
        var track = await CreateTrackAsync(repository, S101Name, ProductSpecification.S101);
        var revision = await AddRevisionAsync(repository, track.Id, 4, CreatedAt);
        await AddArtifactAsync(repository, track.Id, revision, ProductArtifactKind.ValidationDiagnostic, "previous.vld", CreatedAt);
        await repository.SetStateAsync(track.Id, state, null, CreatedAt.AddMinutes(1));

        using var cache = new MemoryCache(new MemoryCacheOptions());
        var controller = CreateController(cache, repository);
        Assert.Single(await ReadHistoryAsync(controller, S101Name));
        var export = Assert.Single((await ReadDetailAsync(controller, S101Name)).Exports!);
        Assert.Equal(status, export.Status);
        Assert.Equal(4, export.Edition);
        Assert.Empty(export.ValidationArtifacts!);
    }

    [Fact]
    public async Task HistoryDistinguishesKnownProductsWithNoReportsFromUnknownProducts()
    {
        var repository = new InMemoryProductRepository();
        await CreateTrackAsync(repository, S101Name, ProductSpecification.S101);
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var controller = CreateController(cache, repository);
        Assert.Empty(await ReadHistoryAsync(controller, S101Name));
        var unknown = Assert.IsType<NotFoundObjectResult>(await controller.GetValidationArtifactHistory("UNKNOWN", CancellationToken.None));
        Assert.False(Assert.IsType<ApiResponse<ProductArtifactHistoryResponse[]>>(unknown.Value).Success);
    }

    private static Task<ProductExportTrackRecord> CreateTrackAsync(InMemoryProductRepository repository, string name, ProductSpecification specification) =>
        repository.GetOrCreateTrackAsync(name, specification, ExportEngineKind.IsoIec8211, 4, 0);

    private static Task<Guid> AddRevisionAsync(InMemoryProductRepository repository, Guid trackId, int edition, DateTime createdAt) =>
        repository.AddRevisionAsync(new ProductRevisionWrite(trackId, ExportRevisionType.NewEdition, edition, 0, "dataset", null, "test", createdAt));

    private static Task AddArtifactAsync(InMemoryProductRepository repository, Guid trackId, Guid? revisionId, ProductArtifactKind kind, string fileName, DateTime createdAt) =>
        repository.AddArtifactAsync(new ProductArtifactWrite(trackId, revisionId, kind, fileName, "application/octet-stream", "test-report"u8.ToArray(), createdAt));

    private static async Task<ProductArtifactHistoryResponse[]> ReadHistoryAsync(ElectronicProductsController controller, string name)
    {
        var response = Assert.IsType<ApiResponse<ProductArtifactHistoryResponse[]>>(Assert.IsType<OkObjectResult>(await controller.GetValidationArtifactHistory(name, CancellationToken.None)).Value);
        Assert.True(response.Success);
        Assert.NotNull(response.Data);
        Assert.Equal(response.Data!.Length, response.TotalHits);
        return response.Data;
    }

    private static async Task<ProductResponse> ReadDetailAsync(ElectronicProductsController controller, string name)
    {
        var response = Assert.IsType<ApiResponse<ProductResponse>>(Assert.IsType<OkObjectResult>(await controller.GetElectronicProduct(name)).Value);
        Assert.True(response.Success);
        return Assert.IsType<ProductResponse>(response.Data);
    }

    private static ElectronicProductsController CreateController(IMemoryCache cache, InMemoryProductRepository repository)
    {
        var s101 = CreateProduct(S101Name, "S-101");
        var s57 = CreateProduct(S57Name, "S-57");
        var products = new Dictionary<string, ElectronicProduct>(StringComparer.OrdinalIgnoreCase) { [S101Name] = s101, [S57Name] = s57 };
        var mappings = new Dictionary<(string Name, string Specification), IReadOnlyList<ElectronicProduct>>
        {
            [(S101Name, "S57")] = [s57],
            [(S57Name, "S101")] = [s101]
        };
        return new ElectronicProductsController(NullLogger<ElectronicProductsController>.Instance, cache,
            new ProductHistoryControllerTests.FakeProductManager(new ProductHistoryControllerTests.FakeElectronicProductManager(new(), products, mappings)),
            repository, repository) { Url = new FallbackUrlHelper() };
    }

    private static ElectronicProduct CreateProduct(string name, string specification) => new()
    {
        datasetName = name,
        editionNumber = 4,
        updateNumber = 0,
        productSpecification = new S100FC.S128.ComplexAttributes.productSpecification { name = specification }
    };

    // Exercise the controller's existing owner-specific fallback URL without an MVC route table.
    private sealed class FallbackUrlHelper : IUrlHelper
    {
        public ActionContext ActionContext { get; } = new();
        public string? Action(UrlActionContext actionContext) => null;
        public string? Content(string? contentPath) => throw new NotSupportedException();
        public bool IsLocalUrl(string? url) => throw new NotSupportedException();
        public string? Link(string? routeName, object? values) => throw new NotSupportedException();
        public string? RouteUrl(UrlRouteContext routeContext) => throw new NotSupportedException();
    }
}
