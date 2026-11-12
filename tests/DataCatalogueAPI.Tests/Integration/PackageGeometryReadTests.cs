using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Models;
using DataCatalogue.Api.Tests.Infrastructure;
using Eventuous;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace DataCatalogue.Api.Tests.Integration;

[Collection(CatalogueCollection.Name)]
[Trait("Category", "Integration")]
public sealed class PackageGeometryReadTests(CatalogueFixture runtime) : CatalogueTest(runtime)
{
    [Fact]
    public async Task AOI_only_package_returns_an_Esri_object_and_no_details() {
        await this.CategoryAsync();
        var package = await this.PackageAsync();
        using var response = await this.Client.GetAsync($"/v1/packages/{package.Id}/geometry");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var aoi = json.RootElement.GetProperty("aoi");
        Assert.Equal(JsonValueKind.Object, aoi.ValueKind);
        Assert.NotEmpty(aoi.GetProperty("rings").EnumerateArray());
        Assert.Equal(JsonValueKind.Object, aoi.GetProperty("spatialReference").ValueKind);
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("detailedGeometry").ValueKind);
    }

    // Both point-backed point sets and native multipoints must return every source coordinate.
    [Theory]
    [InlineData(1)]
    [InlineData(3)]
    public async Task All_detail_groups_and_point_members_are_resolved(int pointCount) {
        await this.CategoryAsync();
        var points = JsonSerializer.Serialize(new { points = Enumerable.Range(0, pointCount).Select(index => new[] { 12.2 + index * 0.2, 55.2 + index * 0.2 }), spatialReference = new { wkid = 4326 } });
        const string curves = "{\"paths\":[[[12.1,55.1],[12.3,55.3]],[[12.6,55.6],[12.9,55.9]]],\"spatialReference\":{\"wkid\":4326}}";
        // Clockwise shell and counterclockwise hole must both survive retrieval.
        const string surfaces = "{\"rings\":[[[12,55],[12,56],[13,56],[13,55],[12,55]],[[12.2,55.2],[12.8,55.2],[12.8,55.8],[12.2,55.8],[12.2,55.2]]],\"spatialReference\":{\"wkid\":4326}}";
        var package = await this.App.CreateAsync<PackageResponse>("/v1/packages", new { category = "test", absoluteUri = "https://example.org/input.zip", esriJSON = Geometry, detailedGeometry = new { aoi = Geometry, points, curves, surfaces } });
        var result = (await this.Client.GetFromJsonAsync<PackageGeometryResponse>($"/v1/packages/{package.Id}/geometry"))!;
        Assert.True(result.Aoi.HasValue);
        var details = Assert.IsType<PackageDetailedGeometryResponse>(result.DetailedGeometry);
        Assert.Equal(pointCount, details.Points.Sum(point => point.TryGetProperty("points", out var members) ? members.GetArrayLength() : point.TryGetProperty("x", out _) && point.TryGetProperty("y", out _) ? 1 : 0));
        Assert.All(details.Points, point => Assert.True(point.TryGetProperty("spatialReference", out _)));
        Assert.Equal(2, details.Curves!.Value.GetProperty("paths").GetArrayLength());
        Assert.True(details.Curves.Value.TryGetProperty("spatialReference", out _));
        Assert.Equal(2, details.Surfaces!.Value.GetProperty("rings").GetArrayLength());
        Assert.True(details.Surfaces.Value.TryGetProperty("spatialReference", out _));

        // The page endpoint must expose the same complete groups as the direct read.
        await this.App.EventuallyAsync(async () => {
            var page = (await this.Client.GetFromJsonAsync<PagedResponse<PackageGeometryItemResponse>>("/v1/packages/geometry?includeDetails=true"))!;
            return page.Items.SingleOrDefault()?.DetailedGeometry?.Surfaces is not null;
        });
        var page = (await this.Client.GetFromJsonAsync<PagedResponse<PackageGeometryItemResponse>>("/v1/packages/geometry?includeDetails=true"))!;
        var item = Assert.Single(page.Items);
        Assert.Equal(package.Id, item.PackageId);
        Assert.Equal(JsonSerializer.Serialize(result.DetailedGeometry), JsonSerializer.Serialize(item.DetailedGeometry));
    }

    [Fact]
    public async Task Read_after_replacement_uses_current_AOI_and_removes_old_groups() {
        await this.CategoryAsync();
        var package = await this.PackageAsync();
        var path = $"/v1/packages/{package.Id}/geometry";
        using var first = await this.Client.PutAsJsonAsync(path, new { aoi = Geometry, points = "{\"points\":[[7.2,55.2],[7.8,55.8]],\"spatialReference\":{\"wkid\":4326}}" });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var before = (await this.Client.GetFromJsonAsync<PackageGeometryResponse>(path))!;
        Assert.NotEmpty(before.DetailedGeometry!.Points);
        using var replacement = await this.Client.PutAsJsonAsync(path, new { aoi = Geometry, surfaces = Geometry });
        Assert.Equal(HttpStatusCode.OK, replacement.StatusCode);
        var after = (await this.Client.GetFromJsonAsync<PackageGeometryResponse>(path))!;
        Assert.Empty(after.DetailedGeometry!.Points);
        Assert.Null(after.DetailedGeometry.Curves);
        Assert.True(after.DetailedGeometry.Surfaces.HasValue);
        Assert.NotEqual(before.Aoi!.Value.GetRawText(), after.Aoi!.Value.GetRawText());
    }

    [Fact]
    public async Task Empty_detail_reference_set_returns_null_instead_of_an_empty_object() {
        await this.CategoryAsync();
        var package = await this.PackageAsync();
        using var scope = this.App.Services.CreateScope();
        var commands = scope.ServiceProvider.GetRequiredService<ICommandService<PackageState>>();
        (await commands.Handle(new PackagesCommands.AddDetailedGeometry(package.Id, null, null, null), default)).ThrowIfError();
        using var response = await this.Client.GetAsync($"/v1/packages/{package.Id}/geometry");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Object, json.RootElement.GetProperty("aoi").ValueKind);
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("detailedGeometry").ValueKind);
    }

    [Fact]
    public async Task Missing_package_returns_404_and_missing_referenced_geometry_returns_generic_500() {
        using var missing = await this.Client.GetAsync("/v1/packages/missing/geometry");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        await this.CategoryAsync();
        var package = await this.PackageAsync();
        using var scope = this.App.Services.CreateScope();
        var commands = scope.ServiceProvider.GetRequiredService<ICommandService<PackageState>>();
        var absentReference = $"surface::{Guid.NewGuid():B}";
        (await commands.Handle(new PackagesCommands.ReplaceGeometry(package.Id!, absentReference, new(null, null, null)), default)).ThrowIfError();
        using var broken = await this.Client.GetAsync($"/v1/packages/{package.Id}/geometry");
        Assert.Equal(HttpStatusCode.InternalServerError, broken.StatusCode);
        var problem = (await broken.Content.ReadFromJsonAsync<ProblemDetails>())!;
        Assert.Equal("Could not retrieve package geometry.", problem.Title);
        Assert.DoesNotContain(absentReference, await broken.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Geometry_read_requires_access_and_is_documented_in_OpenAPI() {
        using var document = JsonDocument.Parse(await this.Client.GetStringAsync("/openapi/v1.json"));
        var responses = document.RootElement.GetProperty("paths").GetProperty("/v1/packages/{id}/geometry").GetProperty("get").GetProperty("responses");
        Assert.True(responses.TryGetProperty("200", out _));
        Assert.True(responses.TryGetProperty("404", out _));
        Assert.True(responses.TryGetProperty("500", out _));
        this.Client.DefaultRequestHeaders.Remove(TestAuthentication.UserHeader);
        using var anonymous = await this.Client.GetAsync("/v1/packages/missing/geometry");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        this.User("PROD\\outsider");
        this.Client.DefaultRequestHeaders.Add("X-Test-DenyAccess", "true");
        using var forbidden = await this.Client.GetAsync("/v1/packages/missing/geometry");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
    }

    [Fact]
    public async Task Package_workspace_pipeline_and_binding_responses_omit_geometry_storage_references() {
        await this.CategoryAsync();
        var package = await this.PackageAsync();
        var pipeline = await this.PipelineAsync();
        var workspace = await this.WorkspaceAsync(pipeline.Id);
        var binding = await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = package.Id, pipelineId = pipeline.Id });
        await this.App.EventuallyAsync(async () => (await this.PackagesAsync()).TotalCount == 1);
        foreach (var path in new[] {
            $"/v1/packages/{package.Id}", "/v1/packages", $"/v1/pipelines/{pipeline.Id}",
            $"/v1/pipelines/{pipeline.Id}/workspaces", $"/v1/pipelines/{pipeline.Id}/workspaces/{workspace.Id}",
            $"/v1/dispatcher/bindings/{Uri.EscapeDataString(binding.Id)}",
            $"/v1/dispatcher/bindings?packageId={package.Id}",
        }) {
            using var json = JsonDocument.Parse(await this.Client.GetStringAsync(path));
            AssertNoStorageReference(json.RootElement);
            if (path.StartsWith("/v1/packages", StringComparison.Ordinal)) {
                var metadata = path.EndsWith(package.Id, StringComparison.Ordinal) ? json.RootElement : Assert.Single(json.RootElement.GetProperty("items").EnumerateArray());
                Assert.False(metadata.TryGetProperty("detailedGeometry", out _));
            }
        }

        static void AssertNoStorageReference(JsonElement element) {
            if (element.ValueKind == JsonValueKind.Object) {
                foreach (var property in element.EnumerateObject()) {
                    Assert.DoesNotContain(property.Name, new[] { "geometryRef", "pointRef", "pointRefs", "curveRef", "surfaceRef", "featureClass", "globalId" });
                    AssertNoStorageReference(property.Value);
                }
            }
            else if (element.ValueKind == JsonValueKind.Array) {
                foreach (var item in element.EnumerateArray()) { AssertNoStorageReference(item); }
            }
        }
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    public async Task Missing_AOI_reference_returns_an_error_instead_of_successful_null_geometry(string? aoi) {
        await this.CategoryAsync();
        var package = await this.PackageAsync();
        using var scope = this.App.Services.CreateScope();
        var commands = scope.ServiceProvider.GetRequiredService<ICommandService<PackageState>>();
        (await commands.Handle(new PackagesCommands.ReplaceGeometry(package.Id, aoi!, new(null, null, null)), default)).ThrowIfError();
        using var response = await this.Client.GetAsync($"/v1/packages/{package.Id}/geometry");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("Could not retrieve package geometry.", (await response.Content.ReadFromJsonAsync<ProblemDetails>())!.Title);
    }
}
