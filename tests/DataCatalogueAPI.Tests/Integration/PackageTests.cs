using System.Net;
using System.Net.Http.Json;
using DataCatalague.Api.Models.V1;
using DataCatalogue.Api.Tests.Infrastructure;

namespace DataCatalogue.Api.Tests.Integration;

[Collection(CatalogueCollection.Name)]
[Trait("Category", "Integration")]
public sealed class PackageTests(CatalogueFixture runtime) : CatalogueTest(runtime)
{
    // Create two packages, read generated metadata and request a one-item second page.
    // Expected: Creation returns 201; IDs and geometry are present, paging reports two items, and invalid paging returns 400.
    [Fact]
    public async Task Create_read_and_paginate_packages() {
        await this.CategoryAsync();
        var created = await this.PackageAsync();
        var read = await this.Client.GetFromJsonAsync<PackageResponse>($"/api/v1/packages/{created.Id}");
        Assert.NotNull(read!.GeometryRef);
        Assert.Matches(@"^TT-[0-9]{3,}-[0-9]{2}$", read.MetaData!.ShortId!);
        await this.PackageAsync(DistantGeometry);
        await this.App.EventuallyAsync(async () => (await this.PackagesAsync()).TotalCount == 2);
        var page = await this.PackagesAsync("?category=test&page=2&pageSize=1");
        Assert.Single(page.Items);
        Assert.Equal(2, page.TotalCount);
        Assert.Equal(2, page.TotalPages);
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.GetAsync("/api/v1/packages?page=0")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.GetAsync("/api/v1/packages?pageSize=201")).StatusCode);
    }

    // Create packages in different areas and categories, then combine both filters.
    // Expected: Only the matching package is listed; malformed geometry filters return 400.
    [Fact]
    public async Task Spatial_and_category_filters_use_the_current_package_AOI() {
        await this.CategoryAsync();
        await this.CategoryAsync("other", "ZZ");
        var selected = await this.PackageAsync();
        await this.PackageAsync(DistantGeometry);
        await this.PackageAsync(category: "other");
        await this.App.EventuallyAsync(async () => (await this.PackagesAsync()).TotalCount == 3);
        var page = await this.PackagesAsync("?category=test&geometry=" + Uri.EscapeDataString(Geometry));
        Assert.Equal(selected.Id, Assert.Single(page.Items).Id);
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.GetAsync("/api/v1/packages?geometry=invalid-json")).StatusCode);
    }

    // Submit a package with an unknown category, reuse a reserved source ID and read a missing ID.
    // Expected: The API returns 400, 409 and 404 respectively.
    [Fact]
    public async Task Unknown_categories_and_duplicate_source_identifiers_are_rejected() {
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.PostAsJsonAsync("/api/v1/packages", new { category = "missing", absoluteUri = "https://example.org/input.zip", esriJSON = Geometry })).StatusCode);
        await this.CategoryAsync();
        var metadata = new { shortId = "TT-123-26" };
        await this.PackageAsync(metadata: metadata);
        Assert.Equal(HttpStatusCode.Conflict, (await this.Client.PostAsJsonAsync("/api/v1/packages", new { category = "test", absoluteUri = "https://example.org/input.zip", esriJSON = Geometry, metaData = metadata })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.GetAsync("/api/v1/packages/missing")).StatusCode);
    }

    // Fail package creation with incomplete detail geometry, then reuse the same source ID.
    // Expected: The first request returns 400; the corrected request returns 201 and retains that short ID.
    [Fact]
    public async Task Failed_geometry_validation_releases_the_source_identifier() {
        await this.CategoryAsync();
        var metadata = new { shortId = "TT-333-26" };
        using var failed = await this.Client.PostAsJsonAsync("/api/v1/packages", new { category = "test", absoluteUri = "https://example.org/input.zip", esriJSON = Geometry, metaData = metadata, detailedGeometry = new { aoi = Geometry } });
        Assert.Equal(HttpStatusCode.BadRequest, failed.StatusCode);
        var retry = await this.PackageAsync(metadata: metadata);
        Assert.Equal("TT-333-26", retry.MetaData!.ShortId);
    }

    // Replace complete detail groups, retry the request, change it and submit the original again.
    // Expected: Identical retries keep references and timestamps; changed requests replace rows, omitted groups disappear and spatial queries use the new AOI.
    [Fact]
    public async Task Replace_geometry_removes_omitted_groups_recomputes_AOI_and_supports_retry() {
        await this.CategoryAsync();
        var package = await this.PackageAsync();
        var path = $"/api/v1/packages/{package.Id}/geometry";
        var request = new { aoi = Geometry, points = "{\"points\":[[7.2,55.2],[7.8,55.8]],\"spatialReference\":{\"wkid\":4326}}" };
        using var first = await this.Client.PutAsJsonAsync(path, request);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var replaced = (await first.Content.ReadFromJsonAsync<PackageResponse>())!;
        Assert.NotNull(replaced.DetailedGeometry);
        Assert.Null(replaced.DetailedGeometry.CurveRef);
        Assert.Null(replaced.DetailedGeometry.SurfaceRef);
        Assert.NotEmpty(replaced.DetailedGeometry.PointRefs);
        Assert.NotEqual(package.GeometryRef, replaced.GeometryRef);
        using var retry = await this.Client.PutAsJsonAsync(path, request);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        var same = (await retry.Content.ReadFromJsonAsync<PackageResponse>())!;
        Assert.Equal(replaced.GeometryRef, same.GeometryRef);
        Assert.Equal(replaced.LastUpdatedUtc, same.LastUpdatedUtc);
        Assert.Equal(replaced.DetailedGeometry.PointRefs.ToArray(), same.DetailedGeometry!.PointRefs.ToArray());
        Assert.Null(same.DetailedGeometry.CurveRef);
        Assert.Null(same.DetailedGeometry.SurfaceRef);
        var read = (await this.Client.GetFromJsonAsync<PackageResponse>($"/api/v1/packages/{package.Id}"))!;
        Assert.Equal(replaced.GeometryRef, read.GeometryRef);
        Assert.Equal(replaced.LastUpdatedUtc, read.LastUpdatedUtc);
        await this.App.EventuallyAsync(async () => (await this.PackagesAsync("?geometry=" + Uri.EscapeDataString(DistantGeometry))).Items.Any(item => item.Id == package.Id));
        Assert.Empty((await this.PackagesAsync("?geometry=" + Uri.EscapeDataString(Geometry))).Items);
        using var surfaces = await this.Client.PutAsJsonAsync(path, new { aoi = Geometry, surfaces = Geometry });
        Assert.Equal(HttpStatusCode.OK, surfaces.StatusCode);
        var full = (await surfaces.Content.ReadFromJsonAsync<PackageResponse>())!;
        Assert.NotEqual(replaced.GeometryRef, full.GeometryRef);
        Assert.Empty(full.DetailedGeometry!.PointRefs);
        Assert.NotNull(full.DetailedGeometry.SurfaceRef);
        using var originalAgain = await this.Client.PutAsJsonAsync(path, request);
        Assert.Equal(HttpStatusCode.OK, originalAgain.StatusCode);
        var restored = (await originalAgain.Content.ReadFromJsonAsync<PackageResponse>())!;
        Assert.NotEqual(full.GeometryRef, restored.GeometryRef);
        Assert.NotEmpty(restored.DetailedGeometry!.PointRefs);
        Assert.Null(restored.DetailedGeometry.SurfaceRef);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.PutAsJsonAsync("/api/v1/packages/missing/geometry", request)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.PutAsJsonAsync(path, new { aoi = "invalid" })).StatusCode);
    }

    // Upload a real ZIP and use its returned database URI to create a package.
    // Expected: Both requests return 201; the upload URI starts with database:// and the package has an ID.
    [Fact]
    public async Task Upload_ZIP_and_create_package_using_its_storage_URI() {
        await this.CategoryAsync();
        using var bytes = new MemoryStream();
        using (var archive = new System.IO.Compression.ZipArchive(bytes, System.IO.Compression.ZipArchiveMode.Create, leaveOpen: true)) {
            using var writer = new StreamWriter(archive.CreateEntry("contract.txt").Open());
            writer.Write("Test contract");
        }
        using var content = new MultipartFormDataContent();
        content.Add(new ByteArrayContent(bytes.ToArray()), "File", "input.zip");
        using var uploaded = await this.Client.PostAsync("/api/v1/packages/repository", content);
        Assert.Equal(HttpStatusCode.Created, uploaded.StatusCode);
        var stored = await uploaded.Content.ReadFromJsonAsync<FileResponse>();
        Assert.StartsWith("database://", stored!.AbsoluteUri);
        var created = await this.App.CreateAsync<PackageResponse>("/api/v1/packages", new { category = "test", absoluteUri = stored.AbsoluteUri, esriJSON = Geometry });
        Assert.NotNull(created.Id);
    }

    // Upload an empty ZIP or a non-ZIP filename.
    // Expected: Each invalid upload returns 400.
    [Theory]
    [InlineData("empty.zip", 0)]
    [InlineData("input.txt", 1)]
    public async Task Invalid_uploads_are_rejected(string filename, int length) {
        using var form = new MultipartFormDataContent();
        form.Add(new ByteArrayContent(new byte[length]), "File", filename);
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.PostAsync("/api/v1/packages/repository", form)).StatusCode);
    }
}
