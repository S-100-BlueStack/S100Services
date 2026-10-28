using System.Net;
using System.Net.Http.Json;
using DataCatalague.Api.Models;
using DataCatalague.Api.Models.V1;
using DataCatalogue.Api.Tests.Infrastructure;

namespace DataCatalogue.Api.Tests.Integration;

[Collection(CatalogueCollection.Name)]
[Trait("Category", "Integration")]
public sealed class CategoryAndPipelineTests(CatalogueFixture runtime) : CatalogueTest(runtime)
{
    // Create a category through HTTP, then read it directly and in the projected list.
    // Expected: Creation returns 201 with a Location; the saved prefix and category ID are returned.
    [Fact]
    public async Task Create_read_and_list_categories() {
        var category = await this.CategoryAsync();
        var read = await this.Client.GetFromJsonAsync<CategoryResponse>($"/api/v1/dispatcher/categories/{category.Id}");
        Assert.Equal("TT", read!.Prefix);
        await this.App.EventuallyAsync(async () => (await this.Client.GetFromJsonAsync<PagedResponse<CategoryResponse>>("/api/v1/dispatcher/categories"))!.Items.Any(item => item.Id == category.Id));
    }

    // Submit a duplicate category, an invalid prefix and a read for a missing category.
    // Expected: The API returns 409, 400 and 404 respectively.
    [Fact]
    public async Task Category_duplicates_and_invalid_prefixes_are_rejected() {
        await this.CategoryAsync();
        Assert.Equal(HttpStatusCode.Conflict, (await this.Client.PostAsJsonAsync("/api/v1/dispatcher/categories", new { id = "test", displayName = "Duplicate", description = "Duplicate", prefix = "ZZ" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.PostAsJsonAsync("/api/v1/dispatcher/categories", new { displayName = "Invalid", description = "Invalid", prefix = "too-long" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.GetAsync("/api/v1/dispatcher/categories/missing")).StatusCode);
    }

    // Create a specification, retry it unchanged, replace it and submit invalid or missing targets.
    // Expected: Creation returns 201; updates return 200, retries keep the timestamp, and failures return 400/404.
    [Fact]
    public async Task Specification_creation_replacement_and_retries_have_correct_status_and_state() {
        await this.CategoryAsync();
        const string path = "/api/v1/dispatcher/categories/test/specification";
        var request = new { version = "1.0", markdown = "# Specification" };
        using var created = await this.Client.PutAsJsonAsync(path, request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.NotNull(created.Headers.Location);
        var first = await created.Content.ReadFromJsonAsync<CategoryResponse>();
        using var repeated = await this.Client.PutAsJsonAsync(path, request);
        Assert.Equal(HttpStatusCode.OK, repeated.StatusCode);
        Assert.Equal(first!.LastUpdatedUtc, (await repeated.Content.ReadFromJsonAsync<CategoryResponse>())!.LastUpdatedUtc);
        Assert.Equal(HttpStatusCode.OK, (await this.Client.PutAsJsonAsync(path, new { version = "2.0", markdown = "# Updated" })).StatusCode);
        var read = await this.Client.GetFromJsonAsync<CategoryResponse>("/api/v1/dispatcher/categories/test");
        Assert.Equal("2.0", read!.Version);
        Assert.Equal("# Updated", read.Specification);
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.PutAsJsonAsync(path, new { version = "invalid", markdown = "text" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.PutAsJsonAsync("/api/v1/dispatcher/categories/missing/specification", request)).StatusCode);
    }

    // Create a pipeline and retrieve it directly and through the projected list.
    // Expected: Creation returns 201 with a Location; missing pipelines return 404 and empty names return 400.
    [Fact]
    public async Task Create_read_and_list_pipelines() {
        var pipeline = await this.PipelineAsync();
        Assert.Equal(pipeline.Id, (await this.Client.GetFromJsonAsync<PipelineResponse>($"/api/v1/pipelines/{pipeline.Id}"))!.Id);
        await this.App.EventuallyAsync(async () => (await this.Client.GetFromJsonAsync<PagedResponse<PipelineResponse>>("/api/v1/pipelines"))!.Items.Any(item => item.Id == pipeline.Id));
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.GetAsync("/api/v1/pipelines/missing")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.PostAsJsonAsync("/api/v1/pipelines", new { displayName = "", description = "Invalid" })).StatusCode);
    }
}
