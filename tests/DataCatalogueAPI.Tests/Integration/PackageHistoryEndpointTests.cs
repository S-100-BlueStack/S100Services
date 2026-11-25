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
        Assert.All(items, item => Assert.Null(item.Actor));
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
}
