using System.Net;
using System.Net.Http.Json;
using DataCatalague.Api.Models.V1;
using DataCatalogue.Api.Tests.Infrastructure;

namespace DataCatalogue.Api.Tests.Integration;

[Collection(CatalogueCollection.Name)]
[Trait("Category", "Integration")]
public sealed class PackageHistoryEndpointTests(CatalogueFixture runtime) : CatalogueTest(runtime)
{
    [Fact]
    public async Task History_requires_catalogue_access_and_returns_only_the_selected_package_events() {
        await this.CategoryAsync();
        var package = await this.PackageAsync();
        var other = await this.PackageAsync(DistantGeometry);
        var pipeline = await this.PipelineAsync();
        var path = $"/v1/packages/{package.Id}/history";
        var binding = await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = package.Id, pipelineId = pipeline.Id });
        using var removed = await this.Client.DeleteAsync($"/v1/dispatcher/bindings/{Uri.EscapeDataString(binding.Id!)}");
        Assert.Equal(HttpStatusCode.NoContent, removed.StatusCode);
        await this.App.EventuallyAsync(async () => {
            var history = await this.Client.GetFromJsonAsync<PackageHistoryResponse>(path);
            return history!.Items.Any(item => item.PipelineName == pipeline.DisplayName);
        });
        var first = (await this.Client.GetFromJsonAsync<PackageHistoryResponse>(path + "?pageSize=1"))!;
        Assert.Equal(package.Id, first.PackageId);
        Assert.NotNull(first.NextBefore);
        var rest = (await this.Client.GetFromJsonAsync<PackageHistoryResponse>(path + $"?before={first.NextBefore}&pageSize=100"))!;
        var items = first.Items.Concat(rest.Items).ToArray();
        Assert.Contains(items, item => item.EventType == "pipelineAssigned" && item.PipelineId == pipeline.Id);
        Assert.Contains(items, item => item.EventType == "pipelineUnassigned" && item.PipelineName == pipeline.DisplayName);
        Assert.All(items, item => Assert.Equal(@"PROD\alice", item.Actor));
        Assert.Equal(items.Length, items.Select(item => item.Id).Distinct().Count());
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.GetAsync(path + "?pageSize=101")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.GetAsync($"/v1/packages/{other.Id}/history?before={first.NextBefore}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.GetAsync("/v1/packages/missing/history")).StatusCode);
        this.Client.DefaultRequestHeaders.Add("X-Test-DenyAccess", "true");
        Assert.Equal(HttpStatusCode.Forbidden, (await this.Client.GetAsync(path)).StatusCode);
        this.Client.DefaultRequestHeaders.Remove("X-Test-DenyAccess");
        this.Client.DefaultRequestHeaders.Remove(TestAuthentication.UserHeader);
        Assert.Equal(HttpStatusCode.Unauthorized, (await this.Client.GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task History_records_the_mutating_principal_not_the_reader_or_the_request_payload() {
        var automatic = await this.PipelineAsync();
        var manual = await this.PipelineAsync();
        await this.App.CreateAsync<CategoryResponse>("/v1/dispatcher/categories", new {
            id = "test", displayName = "Test", description = "Test fixtures", prefix = "TT", automaticPipelineIds = new[] { automatic.Id },
        });
        const string creator = @"PROD\B111111";
        const string assigner = @"PROD\B222222";
        const string remover = @"PROD\B333333";
        this.User(creator);
        var package = await this.App.CreateAsync<PackageResponse>("/v1/packages", new {
            category = "test", absoluteUri = "https://example.org/input.zip", esriJSON = Geometry, actor = "spoofed", username = "spoofed",
        });
        this.User(assigner);
        var binding = await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = package.Id, pipelineId = manual.Id, actor = "spoofed" });
        using var geometry = await this.Client.PutAsJsonAsync($"/v1/packages/{package.Id}/geometry", new { aoi = Geometry, surfaces = Geometry, actor = "spoofed" });
        Assert.Equal(HttpStatusCode.OK, geometry.StatusCode);
        this.User(remover);
        using var removed = await this.Client.DeleteAsync($"/v1/dispatcher/bindings/{Uri.EscapeDataString(binding.Id!)}");
        Assert.Equal(HttpStatusCode.NoContent, removed.StatusCode);
        this.User(creator);
        await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = package.Id, pipelineId = manual.Id });
        this.User(@"PROD\reader");
        var history = (await this.Client.GetFromJsonAsync<PackageHistoryResponse>($"/v1/packages/{package.Id}/history"))!;
        Assert.Equal(creator, Assert.Single(history.Items, item => item.EventType == "packageCreated").Actor);
        Assert.Equal(creator, Assert.Single(history.Items, item => item.EventType == "severityUpdated").Actor);
        Assert.Equal(creator, Assert.Single(history.Items, item => item.EventType == "pipelineAssigned" && item.PipelineId == automatic.Id).Actor);
        Assert.Equal(new[] { creator, assigner }, history.Items.Where(item => item.EventType == "pipelineAssigned" && item.PipelineId == manual.Id).Select(item => item.Actor).Order(StringComparer.Ordinal).ToArray());
        Assert.Equal(remover, Assert.Single(history.Items, item => item.EventType == "pipelineUnassigned").Actor);
        Assert.Equal(assigner, Assert.Single(history.Items, item => item.EventType == "geometryReplaced").Actor);
        Assert.DoesNotContain(history.Items, item => item.Actor is "spoofed" or @"PROD\reader");
    }
}
