using System.Net.Http.Json;
using DataCatalague.Api.Models;
using DataCatalague.Api.Models.V1;

namespace DataCatalogue.Api.Tests.Infrastructure;

[Collection(CatalogueCollection.Name)]
public abstract class CatalogueTest(CatalogueFixture runtime) : IAsyncLifetime
{
    protected CatalogueFixture Runtime { get; } = runtime;
    protected CatalogueApplication App { get; private set; } = null!;
    protected HttpClient Client => this.App.Client;
    public async Task InitializeAsync() { this.App = await CatalogueApplication.CreateAsync(this.Runtime); }
    public async Task DisposeAsync() { if (this.App is not null) { await this.App.DisposeAsync(); } }

    protected Task<CategoryResponse> CategoryAsync(string id = "test", string prefix = "TT") => this.App.CreateAsync<CategoryResponse>("/api/v1/dispatcher/categories", new { id, displayName = "Test category", description = "Test fixtures", prefix });
    protected Task<PipelineResponse> PipelineAsync() => this.App.CreateAsync<PipelineResponse>("/api/v1/pipelines", new { displayName = "Test pipeline", description = "Test fixtures" });
    protected async Task<WorkspaceResponse> WorkspaceAsync(string pipelineId, string geometry = Geometry, string name = "Area") {
        var pipeline = await this.App.CreateAsync<PipelineResponse>($"/api/v1/pipelines/{pipelineId}/workspaces", new { displayName = name, displayScale = new { maximumDisplayScale = 1, minimumDisplayScale = 20000000 }, esriJSON = geometry });
        return pipeline.Workspaces.Single(w => w.DisplayName == name);
    }
    protected async Task<PackageResponse> PackageAsync(string geometry = Geometry, string category = "test", object? metadata = null) {
        return await this.App.CreateAsync<PackageResponse>("/api/v1/packages", new { category, absoluteUri = "https://example.org/input.zip", esriJSON = geometry, metaData = metadata });
    }
    protected async Task<PagedResponse<PackageResponse>> PackagesAsync(string query = "") => (await this.Client.GetFromJsonAsync<PagedResponse<PackageResponse>>("/api/v1/packages" + query))!;
    protected void User(string username) {
        this.Client.DefaultRequestHeaders.Remove(TestAuthentication.UserHeader);
        this.Client.DefaultRequestHeaders.Add(TestAuthentication.UserHeader, username);
    }
    public const string Geometry = "{\"rings\":[[[12,55],[12,56],[13,56],[13,55],[12,55]]],\"spatialReference\":{\"wkid\":4326}}";
    public const string DistantGeometry = "{\"rings\":[[[7,55],[7,56],[8,56],[8,55],[7,55]]],\"spatialReference\":{\"wkid\":4326}}";
}
