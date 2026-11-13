using DataCatalague.Api.Models.V1;
using DataCatalague.Api.PackageTypes;
using DataCatalague.Api.Services;
using DataCatalogue.Api.Tests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;

namespace DataCatalogue.Api.Tests.Integration;

[Collection(CatalogueCollection.Name)]
[Trait("Category", "Integration")]
public sealed class WorkZoneArchiveImportTests(CatalogueFixture runtime) : CatalogueTest(runtime)
{
    [Fact]
    public async Task Uploaded_WorkZone_preserves_its_archive_and_imports_metadata_summary_and_geometry() {
        await this.CategoryAsync("WorkZone", "WZ");
        var file = Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "Samples", "WorkZone"), "*.zip").Order(StringComparer.Ordinal).First();
        var bytes = await File.ReadAllBytesAsync(file);
        var stored = await this.UploadAsync(bytes, Path.GetFileName(file));
        var created = await this.App.CreateAsync<PackageResponse>("/v1/packages", new { category = "WorkZone", absoluteUri = stored.AbsoluteUri, importFromArchive = true });
        Assert.StartsWith("WZ-", created.MetaData!.ShortId);
        Assert.Equal(Path.GetFileName(file), created.FileName);
        Assert.Equal(stored.AbsoluteUri, created.AbsoluteUri);
        using var input = new MemoryStream(bytes);
        var zone = await WorkZoneArchive.ReadAsync(input, default);
        Assert.Equal(zone.MetaData.Title, created.MetaData.Title);
        Assert.Equal("WorkZone", created.MetaData.Source);
        Assert.Equal(zone.Manifest.CaseNumber, created.MetaData.RefId);
        Assert.Equal(zone.MetaData.RefId, created.MetaData.RefId);
        Assert.Equal(zone.Descriptions, created.Descriptions);
        Assert.Equal("WorkZone", created.MetaData.Type);
        Assert.All(zone.Manifest.Documents!, document => Assert.Contains(document.DocumentId, Assert.Single(created.Descriptions!).Description));
        var geometry = (await this.Client.GetFromJsonAsync<PackageGeometryResponse>($"/v1/packages/{created.Id}/geometry"))!;
        Assert.True(geometry.Aoi.HasValue);
        Assert.True(geometry.DetailedGeometry!.Surfaces.HasValue);
        Assert.NotNull((await this.PackageStateAsync(created.Id)).DetailedGeometry!.SurfaceRef);
        var resources = this.App.Services.GetRequiredService<DispatcherResourceService>();
        var original = await resources.ReadArchiveAsync(Guid.Parse(new Uri(stored.AbsoluteUri!).Host), WorkZoneArchive.MaximumArchiveBytes, default);
        Assert.NotNull(original);
        Assert.Equal(bytes, original.Value.Data);
        Assert.Equal(Path.GetFileName(file), original.Value.FileName);
    }

    [Fact]
    public async Task Missing_upload_and_cross_category_archive_are_rejected_without_package_writes() {
        await this.CategoryAsync("WorkZone", "WZ");
        using var missing = await this.Client.PostAsJsonAsync("/v1/packages", new { category = "WorkZone", absoluteUri = $"database://{Guid.NewGuid():D}", importFromArchive = true });
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        var file = Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "Samples", "MarineAggregateExtraction"), "*.zip").Order(StringComparer.Ordinal).First();
        var stored = await this.UploadAsync(await File.ReadAllBytesAsync(file), Path.GetFileName(file));
        using var invalid = await this.Client.PostAsJsonAsync("/v1/packages", new { category = "WorkZone", absoluteUri = stored.AbsoluteUri, importFromArchive = true });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Equal(0, (await this.PackagesAsync()).TotalCount);
    }

    private async Task<FileResponse> UploadAsync(byte[] bytes, string name) {
        using var content = new MultipartFormDataContent();
        content.Add(new ByteArrayContent(bytes), "File", name);
        using var response = await this.Client.PostAsync("/v1/packages/repository", content);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<FileResponse>())!;
    }
}