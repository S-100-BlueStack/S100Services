using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Models;
using DataCatalague.Api.Models.V1;
using DataCatalogue.Api.Tests.Infrastructure;
using Eventuous;
using Microsoft.Extensions.DependencyInjection;

namespace DataCatalogue.Api.Tests.Integration;

[Collection(CatalogueCollection.Name)]
[Trait("Category", "Integration")]
public sealed class PackageGeometryPageTests(CatalogueFixture runtime) : CatalogueTest(runtime)
{
    private async Task<PagedResponse<PackageGeometryItemResponse>> GeometriesAsync(string query = "") => (await this.Client.GetFromJsonAsync<PagedResponse<PackageGeometryItemResponse>>("/v1/packages/geometry" + query))!;

    [Fact]
    public async Task Literal_route_returns_an_empty_geometry_page() {
        var page = await this.GeometriesAsync();
        Assert.Empty(page.Items);
        Assert.Equal(0, page.TotalCount);
        Assert.Equal(1, page.Page);
    }

    [Fact]
    public async Task Package_status_includes_all_active_bindings_despite_pipeline_or_AOI_filters() {
        await this.CategoryAsync();
        var package = await this.PackageAsync();
        var unassigned = await this.Client.GetFromJsonAsync<PackageResponse>($"/v1/packages/{package.Id}");
        Assert.False(unassigned!.HasPipeline);
        Assert.Empty(unassigned.PipelineBindings);
        var first = await this.PipelineAsync();
        var second = await this.PipelineAsync();
        // A spatially unrelated workspace must not hide an explicit pipeline binding.
        await this.WorkspaceAsync(first.Id, DistantGeometry);
        var firstBinding = await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = package.Id, pipelineId = first.Id });
        await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = package.Id, pipelineId = second.Id });
        Assert.Empty(firstBinding.Workspaces);
        var direct = (await this.Client.GetFromJsonAsync<PackageResponse>($"/v1/packages/{package.Id}"))!;
        Assert.True(direct.HasPipeline);
        Assert.Equal(new[] { first.Id, second.Id }.Order(StringComparer.Ordinal), direct.PipelineBindings.Select(binding => binding.PipelineId));
        await this.App.EventuallyAsync(async () => (await this.PackagesAsync()).TotalCount == 1);
        var filtered = Assert.Single((await this.PackagesAsync("?pipelineId=" + first.Id + "&geometry=" + Uri.EscapeDataString(Geometry))).Items);
        Assert.Equal(direct.PipelineBindings.ToArray(), filtered.PipelineBindings.ToArray());
        using var removed = await this.Client.DeleteAsync("/v1/dispatcher/bindings/" + Uri.EscapeDataString(firstBinding.Id));
        Assert.Equal(HttpStatusCode.NoContent, removed.StatusCode);
        var remaining = (await this.Client.GetFromJsonAsync<PackageResponse>($"/v1/packages/{package.Id}"))!;
        Assert.Equal(second.Id, Assert.Single(remaining.PipelineBindings).PipelineId);
    }

    [Fact]
    public async Task Geometry_page_combines_category_spatial_and_assignment_filters_with_stable_paging() {
        await this.CategoryAsync();
        await this.CategoryAsync("other", "ZZ");
        var first = await this.PackageAsync();
        var second = await this.PackageAsync();
        await this.PackageAsync(DistantGeometry);
        await this.PackageAsync(category: "other");
        var pipeline = await this.PipelineAsync();
        foreach (var package in new[] { first, second }) {
            await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = package.Id, pipelineId = pipeline.Id });
        }
        await this.App.EventuallyAsync(async () => (await this.PackagesAsync()).TotalCount == 4);
        var query = "?category=test&pipelineId=" + pipeline.Id + "&hasPipeline=true&geometry=" + Uri.EscapeDataString(Geometry) + "&pageSize=1";
        var one = await this.GeometriesAsync(query);
        var two = await this.GeometriesAsync(query + "&page=2");
        var sorted = new[] { first.Id, second.Id }.Order(StringComparer.Ordinal).ToArray();
        Assert.Equal(2, one.TotalCount);
        Assert.Equal(2, two.TotalPages);
        Assert.Equal(sorted[0], Assert.Single(one.Items).PackageId);
        Assert.Equal(sorted[1], Assert.Single(two.Items).PackageId);
        Assert.All(one.Items.Concat(two.Items), item => { Assert.True(item.Aoi.HasValue); Assert.Null(item.DetailedGeometry); });
        Assert.Empty((await this.GeometriesAsync(query + "&page=3")).Items);
        Assert.Empty((await this.GeometriesAsync("?pipelineId=" + pipeline.Id + "&hasPipeline=false")).Items);
        Assert.Equal(2, (await this.GeometriesAsync("?hasPipeline=false")).TotalCount);
    }

    [Fact]
    public async Task Only_requested_detail_and_page_are_hydrated_and_broken_references_fail_without_partial_success() {
        await this.CategoryAsync();
        var one = await this.PackageAsync();
        var two = await this.PackageAsync();
        var sorted = new[] { one.Id, two.Id }.Order(StringComparer.Ordinal).ToArray();
        using var scope = this.App.Services.CreateScope();
        var commands = scope.ServiceProvider.GetRequiredService<ICommandService<PackageState>>();
        var missing = $"curve::{Guid.NewGuid():B}";
        (await commands.Handle(new PackagesCommands.AddDetailedGeometry(sorted[1], null, missing, null), default)).ThrowIfError();
        await this.App.EventuallyAsync(async () => {
            using var response = await this.Client.GetAsync("/v1/packages/geometry?includeDetails=true&pageSize=1&page=2");
            return response.StatusCode == HttpStatusCode.InternalServerError;
        });
        var simple = await this.GeometriesAsync();
        Assert.Equal(2, simple.TotalCount);
        Assert.All(simple.Items, item => Assert.Null(item.DetailedGeometry));
        Assert.Single((await this.GeometriesAsync("?includeDetails=true&pageSize=1")).Items);
        using var broken = await this.Client.GetAsync("/v1/packages/geometry?includeDetails=true");
        Assert.Equal(HttpStatusCode.InternalServerError, broken.StatusCode);
        Assert.DoesNotContain(missing, await broken.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Replaced_geometry_excludes_retained_historical_AOIs_from_the_page() {
        await this.CategoryAsync();
        var package = await this.PackageAsync();
        using var replacement = await this.Client.PutAsJsonAsync($"/v1/packages/{package.Id}/geometry", new { aoi = DistantGeometry, surfaces = DistantGeometry });
        Assert.Equal(HttpStatusCode.OK, replacement.StatusCode);
        var distant = "?includeDetails=true&geometry=" + Uri.EscapeDataString(DistantGeometry);
        await this.App.EventuallyAsync(async () => (await this.GeometriesAsync(distant)).Items.Any(item => item.PackageId == package.Id));
        Assert.Empty((await this.GeometriesAsync("?geometry=" + Uri.EscapeDataString(Geometry))).Items);
        var item = Assert.Single((await this.GeometriesAsync(distant)).Items);
        Assert.NotNull(item.DetailedGeometry);
        Assert.True(item.DetailedGeometry.Surfaces.HasValue);
    }

    [Theory]
    [InlineData("?page=0")]
    [InlineData("?pageSize=201")]
    [InlineData("?geometry=invalid-json")]
    [InlineData("?includeDetails=invalid")]
    public async Task Invalid_queries_return_400(string query) {
        using var response = await this.Client.GetAsync("/v1/packages/geometry" + query);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Geometry_page_requires_access_and_documents_filters() {
        using var document = JsonDocument.Parse(await this.Client.GetStringAsync("/openapi/v1.json"));
        var get = document.RootElement.GetProperty("paths").GetProperty("/v1/packages/geometry").GetProperty("get");
        var parameters = get.GetProperty("parameters").EnumerateArray().Select(parameter => parameter.GetProperty("name").GetString()).ToArray();
        foreach (var name in new[] { "category", "geometry", "page", "pageSize", "pipelineId", "hasPipeline", "includeDetails" }) { Assert.Contains(name, parameters); }
        Assert.True(get.GetProperty("responses").TryGetProperty("500", out _));
        this.Client.DefaultRequestHeaders.Remove(TestAuthentication.UserHeader);
        Assert.Equal(HttpStatusCode.Unauthorized, (await this.Client.GetAsync("/v1/packages/geometry")).StatusCode);
        this.User("PROD\\outsider");
        this.Client.DefaultRequestHeaders.Add("X-Test-DenyAccess", "true");
        Assert.Equal(HttpStatusCode.Forbidden, (await this.Client.GetAsync("/v1/packages/geometry")).StatusCode);
    }
}
