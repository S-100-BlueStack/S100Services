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
    // Run development initialization against a fresh application and database.
    // Expected: Two categories, two pipelines, two unowned workspaces per pipeline and all sample packages exist; no package has a binding.
    [Fact]
    public async Task Initialization_loads_categories_pipelines_workspaces_and_unassigned_sample_packages() {
        await this.App.SeedAsync();
        var expected = Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "Samples", "NoticesToMariners"), "*.json").Length + 2;
        await this.App.EventuallyAsync(async () => (await this.PackagesAsync()).TotalCount == expected);
        await this.App.EventuallyAsync(async () => {
            var page = (await this.Client.GetFromJsonAsync<PagedResponse<PipelineResponse>>("/api/v1/pipelines"))!;
            return page.TotalCount == 2 && page.Items.All(pipeline => pipeline.Workspaces.Count == 2);
        });
        await this.App.EventuallyAsync(async () => (await this.Client.GetFromJsonAsync<PagedResponse<CategoryResponse>>("/api/v1/dispatcher/categories"))!.TotalCount == 2);
        var categories = (await this.Client.GetFromJsonAsync<PagedResponse<CategoryResponse>>("/api/v1/dispatcher/categories"))!;
        Assert.Equal(new[] { "GeneralSubmission", "NoticeToMariners" }, categories.Items.Select(item => item.Id).Order().ToArray());
        Assert.All(categories.Items, category => Assert.NotNull(category.Specification));
        var pipelines = (await this.Client.GetFromJsonAsync<PagedResponse<PipelineResponse>>("/api/v1/pipelines"))!;
        Assert.Equal(new[] { "ENC", "Paper Chart" }, pipelines.Items.Select(item => item.DisplayName).Order().ToArray());
        Assert.All(pipelines.Items, pipeline => {
            Assert.Equal(new[] { "Eastern Denmark", "Western Denmark" }, pipeline.Workspaces.Select(workspace => workspace.DisplayName).Order().ToArray());
            Assert.All(pipeline.Workspaces, workspace => {
                Assert.True(Guid.TryParse(workspace.Id, out _));
                Assert.NotNull(workspace.GeometryRef);
                Assert.Null(workspace.Owner);
                Assert.Null(workspace.LockedAtUtc);
            });
        });
        Assert.Equal(4, pipelines.Items.SelectMany(pipeline => pipeline.Workspaces).Select(workspace => workspace.Id).Distinct().Count());
        Assert.Equal(expected, (await this.PackagesAsync("?hasPipeline=false&pageSize=200")).TotalCount);
        Assert.Empty((await this.PackagesAsync("?hasPipeline=true")).Items);
        foreach (var package in (await this.PackagesAsync("?pageSize=200")).Items) {
            Assert.NotNull(package.GeometryRef);
            Assert.NotNull(package.DetailedGeometry);
            Assert.Empty((await this.Client.GetFromJsonAsync<BindingResponse[]>("/api/v1/dispatcher/bindings?packageId=" + package.Id))!);
        }
        Assert.Equal(2, (await this.PackagesAsync("?category=GeneralSubmission")).TotalCount);
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
        Assert.Equal(0, (await fresh.Client.GetFromJsonAsync<PagedResponse<PackageResponse>>("/api/v1/packages"))!.TotalCount);
        Assert.Equal(HttpStatusCode.NotFound, (await fresh.Client.GetAsync("/api/v1/dispatcher/categories/test")).StatusCode);
        Assert.Single(Directory.GetFiles(fresh.DirectoryPath, "*.geodatabase"));
    }

    // Read each protected resource without a user, then as a user denied access membership.
    // Expected: Anonymous requests return 401; authenticated requests without access return 403.
    [Theory]
    [InlineData("/api/v1/packages")]
    [InlineData("/api/v1/pipelines")]
    [InlineData("/api/v1/workspaces")]
    [InlineData("/api/v1/dispatcher/categories")]
    public async Task Access_policy_requires_authentication_and_membership(string path) {
        this.Client.DefaultRequestHeaders.Remove(TestAuthentication.UserHeader);
        Assert.Equal(HttpStatusCode.Unauthorized, (await this.Client.GetAsync(path)).StatusCode);
        this.User("PROD\\outsider");
        this.Client.DefaultRequestHeaders.Add("X-Test-DenyAccess", "true");
        Assert.Equal(HttpStatusCode.Forbidden, (await this.Client.GetAsync(path)).StatusCode);
    }

    // Create severity geometry, reject malformed geometry and inspect the generated OpenAPI document.
    // Expected: Creation returns 201 with a geometry reference; invalid input returns 400 and documented routes/statuses match the controllers.
    [Fact]
    public async Task Severity_creation_and_OpenAPI_describe_real_controller_actions() {
        using var created = await this.Client.PostAsJsonAsync("/api/v1/dispatcher/severity", new { severity = 1UL, esriJSON = Geometry });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.False(string.IsNullOrWhiteSpace((await created.Content.ReadFromJsonAsync<SeverityResponse>())!.GeometryRef));
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.PostAsJsonAsync("/api/v1/dispatcher/severity", new { severity = 1UL, esriJSON = "invalid" })).StatusCode);
        using var document = JsonDocument.Parse(await this.Client.GetStringAsync("/openapi/v1.json"));
        var paths = document.RootElement.GetProperty("paths");
        Assert.True(paths.GetProperty("/api/v1/packages").TryGetProperty("post", out _));
        Assert.True(paths.GetProperty("/api/v1/packages/repository").GetProperty("post").GetProperty("responses").TryGetProperty("201", out _));
        Assert.True(paths.GetProperty("/api/v1/pipelines/{id}/workspaces/{workspace}").TryGetProperty("post", out _));
    }
}
