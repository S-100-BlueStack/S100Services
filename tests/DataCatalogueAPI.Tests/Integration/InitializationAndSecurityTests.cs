using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DataCatalague.Api.Models;
using DataCatalague.Api.Models.V1;
using DataCatalogue.Api.Tests.Infrastructure;

namespace DataCatalogue.Api.Tests.Integration;

[Collection(CatalogueCollection.Name)]
[Trait("Category", "Integration")]
public sealed class InitializationAndSecurityTests(CatalogueFixture runtime) : CatalogueTest(runtime)
{
    [Fact]
    public async Task Initialization_loads_file_workspaces_geometry_for_every_sample_and_half_assigned_packages() {
        var workspaceCounts = new Dictionary<string, int>();
        foreach (var (name, file) in new[] { ("ENC", "ENC.json"), ("Paper Chart", "PaperChart.json") }) {
            using var definitions = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Samples", "Workspaces", file)));
            workspaceCounts.Add(name, definitions.RootElement.GetArrayLength());
        }
        await this.App.SeedAsync();
        var extractionCount = Math.Min(10, Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "Samples", "MarineAggregateExtraction"), "*.zip").Length);
        var expected = Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "Samples", "NoticesToMariners"), "*.json").Length + 2 + extractionCount;
        await this.App.EventuallyAsync(async () => (await this.PackagesAsync()).TotalCount == expected);
        await this.App.EventuallyAsync(async () => {
            var page = (await this.Client.GetFromJsonAsync<PagedResponse<PipelineResponse>>("/v1/pipelines"))!;
            return page.TotalCount == 2 && page.Items.All(pipeline => pipeline.Workspaces.Count == workspaceCounts[pipeline.DisplayName]);
        });
        await this.App.EventuallyAsync(async () => (await this.Client.GetFromJsonAsync<PagedResponse<CategoryResponse>>("/v1/dispatcher/categories"))!.TotalCount == 3);
        var categories = (await this.Client.GetFromJsonAsync<PagedResponse<CategoryResponse>>("/v1/dispatcher/categories"))!;
        Assert.Equal(new[] { "GeneralSubmission", "MarineAggregateExtraction", "NoticeToMariners" }, categories.Items.Select(item => item.Id).Order().ToArray());
        Assert.All(categories.Items, category => Assert.NotNull(category.Specification));
        var pipelines = (await this.Client.GetFromJsonAsync<PagedResponse<PipelineResponse>>("/v1/pipelines"))!;
        Assert.Equal(new[] { "ENC", "Paper Chart" }, pipelines.Items.Select(item => item.DisplayName).Order().ToArray());
        var workspacePolygons = new List<string>();
        foreach (var pipeline in pipelines.Items) {
            var filename = pipeline.DisplayName == "ENC" ? "ENC.json" : "PaperChart.json";
            using var definitions = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Samples", "Workspaces", filename)));
            Assert.Equal(definitions.RootElement.EnumerateArray().Select(area => area.GetProperty("displayName").GetString()).Order().ToArray(), pipeline.Workspaces.Select(workspace => workspace.DisplayName).Order().ToArray());
            foreach (var workspace in pipeline.Workspaces) {
                Assert.True(Guid.TryParse(workspace.Id, out _));
                Assert.Null(workspace.Owner);
                Assert.Null(workspace.LockedAtUtc);
                var detail = (await this.Client.GetFromJsonAsync<WorkspaceDetailResponse>($"/v1/pipelines/{pipeline.Id}/workspaces/{workspace.Id}"))!;
                workspacePolygons.Add(detail.EsriJSON);
            }
        }
        Assert.Equal(workspacePolygons.Count, workspacePolygons.Distinct().Count());
        Assert.Equal(expected / 2, (await this.PackagesAsync("?hasPipeline=true&pageSize=200")).TotalCount);
        Assert.Equal(expected - expected / 2, (await this.PackagesAsync("?hasPipeline=false&pageSize=200")).TotalCount);
        var bindingCounts = pipelines.Items.ToDictionary(pipeline => pipeline.Id, _ => 0);
        foreach (var package in (await this.PackagesAsync("?pageSize=200")).Items) {
            var geometry = (await this.Client.GetFromJsonAsync<PackageGeometryResponse>($"/v1/packages/{package.Id}/geometry"))!;
            Assert.True(geometry.Aoi.HasValue, package.Id);
            Assert.NotEmpty(geometry.Aoi.Value.GetProperty("rings").EnumerateArray());
            var details = Assert.IsType<PackageDetailedGeometryResponse>(geometry.DetailedGeometry);
            Assert.True(details.Points.Count > 0 || details.Curves.HasValue || details.Surfaces.HasValue, package.Id);
            var bindings = (await this.Client.GetFromJsonAsync<BindingResponse[]>("/v1/dispatcher/bindings?packageId=" + package.Id))!;
            Assert.InRange(bindings.Length, 0, 1);
            foreach (var binding in bindings) { bindingCounts[binding.PipelineId!]++; }
        }
        Assert.Equal(expected / 2, bindingCounts.Values.Sum());
        Assert.InRange(bindingCounts.Values.Max() - bindingCounts.Values.Min(), 0, 1);
        Assert.Equal(2, (await this.PackagesAsync("?category=GeneralSubmission")).TotalCount);
        var extractionPage = await this.PackagesAsync("?category=MarineAggregateExtraction&pageSize=200");
        Assert.Equal(extractionCount, extractionPage.TotalCount);
        foreach (var package in extractionPage.Items) {
            Assert.StartsWith("MA-", package.MetaData!.ShortId);
            Assert.True(Guid.TryParse(package.MetaData.RefId, out _));
            Assert.StartsWith("database://", package.AbsoluteUri);
            Assert.EndsWith(".zip", package.FileName);
            var geometry = (await this.Client.GetFromJsonAsync<PackageGeometryResponse>($"/v1/packages/{package.Id}/geometry"))!;
            Assert.True(geometry.DetailedGeometry!.Surfaces.HasValue);
        }
    }

    // Create data in one application and start a second application using the same native runtime.
    // Expected: The second application has a different database directory, no packages and no inherited category.
    [Fact]
    public async Task A_fresh_application_has_a_fresh_event_store_projections_and_database() {
        await this.CategoryAsync();
        await this.PackageAsync();
        await this.App.EventuallyAsync(async () => (await this.PackagesAsync()).TotalCount == 1);
        await using var fresh = await CatalogueApplication.CreateAsync(this.Runtime);
        Assert.NotEqual(this.App.DirectoryPath, fresh.DirectoryPath);
        Assert.Equal(0, (await fresh.Client.GetFromJsonAsync<PagedResponse<PackageResponse>>("/v1/packages"))!.TotalCount);
        Assert.Equal(HttpStatusCode.NotFound, (await fresh.Client.GetAsync("/v1/dispatcher/categories/test")).StatusCode);
        Assert.Single(Directory.GetFiles(fresh.DirectoryPath, "*.geodatabase"));
    }

    // Read each protected resource without a user, then as a user denied access membership.
    // Expected: Anonymous requests return 401; authenticated requests without access return 403.
    [Theory]
    [InlineData("/v1/packages")]
    [InlineData("/v1/pipelines")]
    [InlineData("/v1/workspaces")]
    [InlineData("/v1/dispatcher/categories")]
    public async Task Access_policy_requires_authentication_and_membership(string path) {
        this.Client.DefaultRequestHeaders.Remove(TestAuthentication.UserHeader);
        Assert.Equal(HttpStatusCode.Unauthorized, (await this.Client.GetAsync(path)).StatusCode);
        this.User("PROD\\outsider");
        this.Client.DefaultRequestHeaders.Add("X-Test-DenyAccess", "true");
        Assert.Equal(HttpStatusCode.Forbidden, (await this.Client.GetAsync(path)).StatusCode);
    }

    // Create severity geometry, reject malformed geometry and inspect the generated OpenAPI document.
    // Expected: Creation returns 201 without exposing storage references; invalid input returns 400 and documented routes/statuses match the controllers.
    [Fact]
    public async Task Severity_creation_and_OpenAPI_describe_real_controller_actions() {
        using var created = await this.Client.PostAsJsonAsync("/v1/dispatcher/severity", new { severity = 1UL, esriJSON = Geometry });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var severity = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        Assert.Empty(severity.RootElement.EnumerateObject());
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.PostAsJsonAsync("/v1/dispatcher/severity", new { severity = 1UL, esriJSON = "invalid" })).StatusCode);
        using var document = JsonDocument.Parse(await this.Client.GetStringAsync("/openapi/v1.json"));
        var paths = document.RootElement.GetProperty("paths");
        Assert.True(paths.GetProperty("/v1/packages").TryGetProperty("post", out _));
        Assert.True(paths.GetProperty("/v1/packages/repository").GetProperty("post").GetProperty("responses").TryGetProperty("201", out _));
        Assert.True(paths.GetProperty("/v1/pipelines/{id}/workspaces/{workspace}").TryGetProperty("post", out _));
    }
}
