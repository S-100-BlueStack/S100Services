using DataCatalague.Api.Models.V1;
using DataCatalague.Api.PackageTypes;
using DataCatalague.Api.Services;
using DataCatalogue.Api.Tests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace DataCatalogue.Api.Tests.Integration;

[Collection(CatalogueCollection.Name)]
[Trait("Category", "Integration")]
public sealed class MarineAggregateArchiveImportTests(CatalogueFixture runtime) : CatalogueTest(runtime)
{
    [Fact]
    public async Task Uploaded_MA_archive_creates_full_geometry_and_preserves_its_original_bytes() {
        await this.CategoryAsync("MarineAggregateExtraction", "MA");
        var file = Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "Samples", "MarineAggregateExtraction"), "*.zip").Order(StringComparer.Ordinal).First();
        var bytes = await File.ReadAllBytesAsync(file);
        var stored = await this.UploadAsync(bytes, Path.GetFileName(file));
        var created = await this.App.CreateAsync<PackageResponse>("/api/v1/packages", new { category = "MarineAggregateExtraction", absoluteUri = stored.AbsoluteUri, importFromArchive = true });
        Assert.StartsWith("MA-", created.MetaData!.ShortId);
        Assert.Equal(Path.GetFileName(file), created.FileName);
        Assert.Equal(stored.AbsoluteUri, created.AbsoluteUri);
        Assert.NotNull((await this.PackageStateAsync(created.Id)).DetailedGeometry!.SurfaceRef);
        using var input = new MemoryStream(bytes);
        var archive = await MarineAggregateArchive.ReadAsync(input, default);
        Assert.Equal(archive.Site.MetaData.RefId, created.MetaData.RefId);
        Assert.Null(created.MetaData.CreatedUTC);

        var geometry = (await this.Client.GetFromJsonAsync<PackageGeometryResponse>($"/api/v1/packages/{created.Id}/geometry"))!;
        Assert.True(geometry.Aoi.HasValue);
        Assert.True(geometry.DetailedGeometry!.Surfaces.HasValue);
        var resources = this.App.Services.GetRequiredService<DispatcherResourceService>();
        var original = await resources.ReadArchiveAsync(Guid.Parse(new Uri(stored.AbsoluteUri!).Host), MarineAggregateArchive.MaximumArchiveBytes, default);
        Assert.NotNull(original);
        Assert.Equal(bytes, original.Value.Data);
        Assert.Equal(Path.GetFileName(file), original.Value.FileName);
    }

    [Fact]
    public async Task Missing_upload_and_invalid_archive_fail_without_creating_packages() {
        await this.CategoryAsync("MarineAggregateExtraction", "MA");
        using var missing = await this.Client.PostAsJsonAsync("/api/v1/packages", new { category = "MarineAggregateExtraction", absoluteUri = $"database://{Guid.NewGuid():D}", importFromArchive = true });
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        using var bytes = new MemoryStream();
        using (var archive = new System.IO.Compression.ZipArchive(bytes, System.IO.Compression.ZipArchiveMode.Create, leaveOpen: true)) {
            using var writer = new StreamWriter(archive.CreateEntry("contract.txt").Open());
            writer.Write("Not an MA submission");
        }
        var stored = await this.UploadAsync(bytes.ToArray(), "invalid-ma.zip");
        using var invalid = await this.Client.PostAsJsonAsync("/api/v1/packages", new { category = "MarineAggregateExtraction", absoluteUri = stored.AbsoluteUri, importFromArchive = true });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Equal(0, (await this.PackagesAsync()).TotalCount);
    }

    [Fact]
    public async Task OpenAPI_documents_archive_import_on_the_existing_JSON_creation_route() {
        using var document = JsonDocument.Parse(await this.Client.GetStringAsync("/openapi/v1.json"));
        var post = document.RootElement.GetProperty("paths").GetProperty("/api/v1/packages").GetProperty("post");
        Assert.True(post.GetProperty("requestBody").GetProperty("content").TryGetProperty("application/json", out _));
        Assert.Contains("importFromArchive", document.RootElement.GetRawText());
        Assert.True(post.GetProperty("responses").TryGetProperty("404", out _));
    }

    private async Task<FileResponse> UploadAsync(byte[] bytes, string name) {
        using var content = new MultipartFormDataContent();
        content.Add(new ByteArrayContent(bytes), "File", name);
        using var response = await this.Client.PostAsync("/api/v1/packages/repository", content);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<FileResponse>())!;
    }
}
