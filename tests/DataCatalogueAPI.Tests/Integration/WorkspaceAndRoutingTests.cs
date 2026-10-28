using System.Net;
using System.Net.Http.Json;
using DataCatalague.Api.Models;
using DataCatalague.Api.Models.V1;
using DataCatalogue.Api.Tests.Infrastructure;

namespace DataCatalogue.Api.Tests.Integration;

[Collection(CatalogueCollection.Name)]
[Trait("Category", "Integration")]
public sealed class WorkspaceAndRoutingTests(CatalogueFixture runtime) : CatalogueTest(runtime)
{
    // Create a workspace, read its polygon, list it and try duplicate names and invalid geometry.
    // Expected: Creation returns 201 with a Location; reads expose the workspace, duplicates return 409 and invalid geometry returns 400.
    [Fact]
    public async Task Create_list_and_read_workspace_and_polygon() {
        var pipeline = await this.PipelineAsync();
        var workspace = await this.WorkspaceAsync(pipeline.Id);
        var detail = await this.Client.GetFromJsonAsync<WorkspaceDetailResponse>($"/api/v1/pipelines/{pipeline.Id}/workspaces/{workspace.Id}");
        Assert.Equal(workspace.Id, detail!.Workspace.Id);
        Assert.Contains("rings", detail.EsriJSON);
        Assert.Single((await this.Client.GetFromJsonAsync<WorkspaceResponse[]>($"/api/v1/pipelines/{pipeline.Id}/workspaces"))!);
        Assert.Equal(HttpStatusCode.Conflict, (await this.Client.PostAsJsonAsync($"/api/v1/pipelines/{pipeline.Id}/workspaces", new { displayName = "Area", displayScale = new { maximumDisplayScale = 1, minimumDisplayScale = 2000 }, esriJSON = Geometry })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.PostAsJsonAsync($"/api/v1/pipelines/{pipeline.Id}/workspaces", new { displayName = "Bad", displayScale = new { maximumDisplayScale = 1, minimumDisplayScale = 2000 }, esriJSON = "invalid" })).StatusCode);
    }

    // Claim a workspace, retry, let another user take over and let a third user clear it.
    // Expected: Ownership uses normalized usernames, retries keep the timestamp, clearing removes owner/time and malformed IDs return 400.
    [Fact]
    public async Task Users_can_claim_take_over_and_clear_ownership() {
        var pipeline = await this.PipelineAsync();
        var workspace = await this.WorkspaceAsync(pipeline.Id);
        var path = $"/api/v1/pipelines/{pipeline.Id}/workspaces/{workspace.Id}";
        using var claimed = await this.Client.PostAsync(path, null);
        Assert.Equal(HttpStatusCode.OK, claimed.StatusCode);
        var alice = (await claimed.Content.ReadFromJsonAsync<PipelineResponse>())!.Workspaces.Single();
        Assert.Equal("alice", alice.Owner);
        using var retry = await this.Client.PostAsync(path, null);
        Assert.Equal(alice.LockedAtUtc, (await retry.Content.ReadFromJsonAsync<PipelineResponse>())!.Workspaces.Single().LockedAtUtc);
        this.User("PROD\\bob");
        using var takeover = await this.Client.PostAsync(path, null);
        Assert.Equal("bob", (await takeover.Content.ReadFromJsonAsync<PipelineResponse>())!.Workspaces.Single().Owner);
        this.User("PROD\\carol");
        using var cleared = await this.Client.DeleteAsync(path + "/lock");
        Assert.Equal(HttpStatusCode.OK, cleared.StatusCode);
        var empty = (await cleared.Content.ReadFromJsonAsync<PipelineResponse>())!.Workspaces.Single();
        Assert.Null(empty.Owner);
        Assert.Null(empty.LockedAtUtc);
        Assert.Equal(HttpStatusCode.OK, (await this.Client.DeleteAsync(path + "/lock")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.PostAsync($"/api/v1/pipelines/{pipeline.Id}/workspaces/not-a-guid", null)).StatusCode);
    }

    // Read and claim a workspace through another pipeline, and list workspaces for a missing pipeline.
    // Expected: Every request returns 404; a workspace is accessible only through its assigned pipeline.
    [Fact]
    public async Task Workspace_must_belong_to_the_requested_pipeline() {
        var first = await this.PipelineAsync();
        var second = await this.PipelineAsync();
        var workspace = await this.WorkspaceAsync(first.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.PostAsync($"/api/v1/pipelines/{second.Id}/workspaces/{workspace.Id}", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.GetAsync($"/api/v1/pipelines/{second.Id}/workspaces/{workspace.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.GetAsync("/api/v1/pipelines/missing/workspaces")).StatusCode);
    }

    // Claim one of two workspaces and query current, explicit and unassigned owner filters.
    // Expected: Owner queries return the claimed workspace; unassigned returns the other, and conflicting filters return 400.
    [Fact]
    public async Task Workspace_filters_support_current_owner_explicit_owner_and_unassigned() {
        var pipeline = await this.PipelineAsync();
        var owned = await this.WorkspaceAsync(pipeline.Id);
        await this.WorkspaceAsync(pipeline.Id, DistantGeometry, "Unassigned");
        await this.Client.PostAsync($"/api/v1/pipelines/{pipeline.Id}/workspaces/{owned.Id}", null);
        await this.App.EventuallyAsync(async () => (await this.Client.GetFromJsonAsync<PagedResponse<WorkspaceListResponse>>("/api/v1/workspaces"))!.TotalCount == 2);
        foreach (var owner in new[] { "current", "alice", "PROD\\ALICE" }) {
            var page = await this.Client.GetFromJsonAsync<PagedResponse<WorkspaceListResponse>>("/api/v1/workspaces?owner=" + Uri.EscapeDataString(owner));
            Assert.Equal(owned.Id, Assert.Single(page!.Items).Workspace.Id);
        }
        var unassigned = await this.Client.GetFromJsonAsync<PagedResponse<WorkspaceListResponse>>($"/api/v1/workspaces?pipelineId={pipeline.Id}&unassigned=true");
        Assert.Null(Assert.Single(unassigned!.Items).Workspace.Owner);
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.GetAsync("/api/v1/workspaces?owner=current&unassigned=true")).StatusCode);
    }

    // Assign a package to two pipelines, inspect AOI intersections, remove bindings and restore one.
    // Expected: Only intersecting workspaces match; removal returns 204, restoration reuses the binding ID and pipeline filters reflect each change.
    [Fact]
    public async Task Assign_remove_and_restore_pipeline_bindings_and_intersections() {
        await this.CategoryAsync();
        var package = await this.PackageAsync();
        var first = await this.PipelineAsync();
        var second = await this.PipelineAsync();
        var matching = await this.WorkspaceAsync(first.Id);
        await this.WorkspaceAsync(first.Id, DistantGeometry, "Elsewhere");
        var request = new { packageId = package.Id, pipelineId = first.Id };
        var binding = await this.App.CreateAsync<BindingResponse>("/api/v1/dispatcher/bindings", request);
        Assert.Equal(matching.Id, Assert.Single(binding.Workspaces).Id);
        Assert.Equal(binding.Id, (await this.Client.GetFromJsonAsync<BindingResponse>("/api/v1/dispatcher/bindings/" + Uri.EscapeDataString(binding.Id)))!.Id);
        Assert.Equal(HttpStatusCode.Conflict, (await this.Client.PostAsJsonAsync("/api/v1/dispatcher/bindings", request)).StatusCode);
        await this.App.CreateAsync<BindingResponse>("/api/v1/dispatcher/bindings", new { packageId = package.Id, pipelineId = second.Id });
        Assert.Equal(2, (await this.Client.GetFromJsonAsync<BindingResponse[]>("/api/v1/dispatcher/bindings?packageId=" + package.Id))!.Length);
        await this.App.EventuallyAsync(async () => (await this.PackagesAsync("?pipelineId=" + first.Id)).TotalCount == 1);
        var intersecting = await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>($"/api/v1/pipelines/{first.Id}/workspaces/{matching.Id}/packages");
        Assert.Equal(package.Id, Assert.Single(intersecting!.Items).PackageId);
        var path = "/api/v1/dispatcher/bindings/" + Uri.EscapeDataString(binding.Id);
        Assert.Equal(HttpStatusCode.NoContent, (await this.Client.DeleteAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await this.Client.DeleteAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.GetAsync(path)).StatusCode);
        Assert.Empty((await this.PackagesAsync("?pipelineId=" + first.Id)).Items);
        Assert.Single((await this.PackagesAsync("?pipelineId=" + second.Id)).Items);
        Assert.Empty((await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>($"/api/v1/pipelines/{first.Id}/workspaces/{matching.Id}/packages"))!.Items);
        var restored = await this.App.CreateAsync<BindingResponse>("/api/v1/dispatcher/bindings", request);
        Assert.Equal(binding.Id, restored.Id);
        Assert.Single((await this.PackagesAsync("?hasPipeline=true")).Items);
        await this.Client.DeleteAsync(path);
        var other = (await this.Client.GetFromJsonAsync<BindingResponse[]>("/api/v1/dispatcher/bindings?packageId=" + package.Id))!.Single();
        await this.Client.DeleteAsync("/api/v1/dispatcher/bindings/" + Uri.EscapeDataString(other.Id));
        Assert.Single((await this.PackagesAsync("?hasPipeline=false")).Items);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.PostAsJsonAsync("/api/v1/dispatcher/bindings", new { packageId = "missing", pipelineId = first.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.DeleteAsync("/api/v1/dispatcher/bindings/missing")).StatusCode);
    }
}
