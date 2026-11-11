using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DataCatalague.Api.Models;
using DataCatalague.Api.Models.V1;
using DataCatalogue.Api.Tests.Infrastructure;
using DataCatalague.Api.Services;
using Microsoft.Extensions.DependencyInjection;

namespace DataCatalogue.Api.Tests.Integration;

[Collection(CatalogueCollection.Name)]
[Trait("Category", "Integration")]
public sealed class WorkspaceAndRoutingTests(CatalogueFixture runtime) : CatalogueTest(runtime)
{
    [Fact]
    public async Task Iis_sub_application_uses_its_path_base_exactly_once() {
        await using var mounted = await CatalogueApplication.CreateAsync(this.Runtime, "/api");
        using var list = await mounted.Client.GetAsync("/api/v1/pipelines");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        using var duplicate = await mounted.Client.GetAsync("/api/api/v1/pipelines");
        Assert.Equal(HttpStatusCode.NotFound, duplicate.StatusCode);

        using var created = await mounted.Client.PostAsJsonAsync("/api/v1/pipelines", new {
            displayName = "Mounted pipeline",
            description = "PathBase integration check",
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.NotNull(created.Headers.Location);
        var pipeline = await created.Content.ReadFromJsonAsync<PipelineResponse>();
        Assert.NotNull(pipeline);
        Assert.Equal($"/api/v1/pipelines/{pipeline.Id}", created.Headers.Location!.AbsolutePath);
        using var followed = await mounted.Client.GetAsync(created.Headers.Location);
        Assert.Equal(HttpStatusCode.OK, followed.StatusCode);
        Assert.DoesNotContain("/api/api/v1/", created.Headers.Location.ToString());

        using var openApi = JsonDocument.Parse(await mounted.Client.GetStringAsync("/api/openapi/v1.json"));
        var paths = openApi.RootElement.GetProperty("paths");
        Assert.True(paths.TryGetProperty("/v1/pipelines", out _));
        Assert.False(paths.TryGetProperty("/api/v1/pipelines", out _));
        using var openApiV2 = JsonDocument.Parse(await mounted.Client.GetStringAsync("/api/openapi/v2.json"));
        // Check the document under PathBase without assuming optional sample endpoints are compiled.
        foreach (var path in openApiV2.RootElement.GetProperty("paths").EnumerateObject()) {
            Assert.False(path.Name.StartsWith("/api/", StringComparison.OrdinalIgnoreCase),
                $"OpenAPI v2 path includes the IIS application prefix: {path.Name}");
        }
    }

    // Create a workspace, read its polygon, list it and try duplicate names and invalid geometry.
    // Expected: Creation returns 201 with a Location; reads expose the workspace, duplicates return 409 and invalid geometry returns 400.
    [Fact]
    public async Task Create_list_and_read_workspace_and_polygon() {
        var pipeline = await this.PipelineAsync();
        var workspace = await this.WorkspaceAsync(pipeline.Id);
        var detail = await this.Client.GetFromJsonAsync<WorkspaceDetailResponse>($"/v1/pipelines/{pipeline.Id}/workspaces/{workspace.Id}");
        Assert.Equal(workspace.Id, detail!.Workspace.Id);
        Assert.Contains("rings", detail.EsriJSON);
        Assert.Single((await this.Client.GetFromJsonAsync<WorkspaceResponse[]>($"/v1/pipelines/{pipeline.Id}/workspaces"))!);
        Assert.Equal(HttpStatusCode.Conflict, (await this.Client.PostAsJsonAsync($"/v1/pipelines/{pipeline.Id}/workspaces", new { displayName = "Area", displayScale = new { maximumDisplayScale = 1, minimumDisplayScale = 2000 }, esriJSON = Geometry })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.PostAsJsonAsync($"/v1/pipelines/{pipeline.Id}/workspaces", new { displayName = "Bad", displayScale = new { maximumDisplayScale = 1, minimumDisplayScale = 2000 }, esriJSON = "invalid" })).StatusCode);
    }

    // Claim a workspace, retry, let another user take over and let a third user clear it.
    // Expected: Ownership uses normalized usernames, retries keep the timestamp, clearing removes owner/time and malformed IDs return 400.
    [Fact]
    public async Task Users_can_claim_take_over_and_clear_ownership() {
        var pipeline = await this.PipelineAsync();
        var workspace = await this.WorkspaceAsync(pipeline.Id);
        var path = $"/v1/pipelines/{pipeline.Id}/workspaces/{workspace.Id}";
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
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.PostAsync($"/v1/pipelines/{pipeline.Id}/workspaces/not-a-guid", null)).StatusCode);
    }

    // Read and claim a workspace through another pipeline, and list workspaces for a missing pipeline.
    // Expected: Every request returns 404; a workspace is accessible only through its assigned pipeline.
    [Fact]
    public async Task Workspace_must_belong_to_the_requested_pipeline() {
        var first = await this.PipelineAsync();
        var second = await this.PipelineAsync();
        var workspace = await this.WorkspaceAsync(first.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.PostAsync($"/v1/pipelines/{second.Id}/workspaces/{workspace.Id}", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.GetAsync($"/v1/pipelines/{second.Id}/workspaces/{workspace.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.GetAsync("/v1/pipelines/missing/workspaces")).StatusCode);
    }

    // Claim one of two workspaces and query current, explicit and unassigned owner filters.
    // Expected: Owner queries return the claimed workspace; unassigned returns the other, and conflicting filters return 400.
    [Fact]
    public async Task Workspace_filters_support_current_owner_explicit_owner_and_unassigned() {
        var pipeline = await this.PipelineAsync();
        var owned = await this.WorkspaceAsync(pipeline.Id);
        await this.WorkspaceAsync(pipeline.Id, DistantGeometry, "Unassigned");
        await this.Client.PostAsync($"/v1/pipelines/{pipeline.Id}/workspaces/{owned.Id}", null);
        await this.App.EventuallyAsync(async () => (await this.Client.GetFromJsonAsync<PagedResponse<WorkspaceListResponse>>("/v1/workspaces"))!.TotalCount == 2);
        foreach (var owner in new[] { "current", "alice", "PROD\\ALICE" }) {
            var page = await this.Client.GetFromJsonAsync<PagedResponse<WorkspaceListResponse>>("/v1/workspaces?owner=" + Uri.EscapeDataString(owner));
            Assert.Equal(owned.Id, Assert.Single(page!.Items).Workspace.Id);
        }
        var unassigned = await this.Client.GetFromJsonAsync<PagedResponse<WorkspaceListResponse>>($"/v1/workspaces?pipelineId={pipeline.Id}&unassigned=true");
        Assert.Null(Assert.Single(unassigned!.Items).Workspace.Owner);
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.GetAsync("/v1/workspaces?owner=current&unassigned=true")).StatusCode);
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
        var binding = await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", request);
        Assert.Equal(matching.Id, Assert.Single(binding.Workspaces).Id);
        Assert.Equal(binding.Id, (await this.Client.GetFromJsonAsync<BindingResponse>("/v1/dispatcher/bindings/" + Uri.EscapeDataString(binding.Id)))!.Id);
        Assert.Equal(HttpStatusCode.Conflict, (await this.Client.PostAsJsonAsync("/v1/dispatcher/bindings", request)).StatusCode);
        await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = package.Id, pipelineId = second.Id });
        Assert.Equal(2, (await this.Client.GetFromJsonAsync<BindingResponse[]>("/v1/dispatcher/bindings?packageId=" + package.Id))!.Length);
        await this.App.EventuallyAsync(async () => (await this.PackagesAsync("?pipelineId=" + first.Id)).TotalCount == 1);
        var intersecting = await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>($"/v1/pipelines/{first.Id}/workspaces/{matching.Id}/packages");
        var item = Assert.Single(intersecting!.Items);
        Assert.Equal(package.Id, item.PackageId);
        var geometry = (await this.Client.GetFromJsonAsync<PackageGeometryResponse>($"/v1/packages/{package.Id}/geometry"))!;
        Assert.Equal(geometry.Aoi!.Value.GetRawText(), item.Aoi.GetRawText());
        var path = "/v1/dispatcher/bindings/" + Uri.EscapeDataString(binding.Id);
        Assert.Equal(HttpStatusCode.NoContent, (await this.Client.DeleteAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await this.Client.DeleteAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.GetAsync(path)).StatusCode);
        Assert.Empty((await this.PackagesAsync("?pipelineId=" + first.Id)).Items);
        Assert.Single((await this.PackagesAsync("?pipelineId=" + second.Id)).Items);
        Assert.Empty((await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>($"/v1/pipelines/{first.Id}/workspaces/{matching.Id}/packages"))!.Items);
        var restored = await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", request);
        Assert.Equal(binding.Id, restored.Id);
        Assert.Single((await this.PackagesAsync("?hasPipeline=true")).Items);
        await this.Client.DeleteAsync(path);
        var other = (await this.Client.GetFromJsonAsync<BindingResponse[]>("/v1/dispatcher/bindings?packageId=" + package.Id))!.Single();
        await this.Client.DeleteAsync("/v1/dispatcher/bindings/" + Uri.EscapeDataString(other.Id));
        Assert.Single((await this.PackagesAsync("?hasPipeline=false")).Items);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.PostAsJsonAsync("/v1/dispatcher/bindings", new { packageId = "missing", pipelineId = first.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.DeleteAsync("/v1/dispatcher/bindings/missing")).StatusCode);
    }

    [Fact]
    public async Task Binding_reads_keep_order_and_recalculate_current_AOI_intersections() {
        await this.CategoryAsync();
        var package = await this.PackageAsync();
        var first = await this.PipelineAsync();
        var intersecting = await this.WorkspaceAsync(first.Id, Geometry, "Intersecting");
        var distantWorkspace = await this.WorkspaceAsync(first.Id, DistantGeometry, "Elsewhere");
        var alsoIntersecting = await this.WorkspaceAsync(first.Id, Geometry, "Intersecting again");
        var second = await this.PipelineAsync();
        var secondWorkspace = await this.WorkspaceAsync(second.Id, DistantGeometry, "Second pipeline area");
        var emptyPipeline = await this.PipelineAsync();

        var firstBinding = await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = package.Id, pipelineId = first.Id });
        var secondBinding = await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = package.Id, pipelineId = second.Id });
        var emptyBinding = await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = package.Id, pipelineId = emptyPipeline.Id });
        Assert.Empty(emptyBinding.Workspaces);
        Assert.Equal(new[] { intersecting.Id, alsoIntersecting.Id }, firstBinding.Workspaces.Select(workspace => workspace.Id));
        Assert.Empty(secondBinding.Workspaces);

        var path = "/v1/dispatcher/bindings?packageId=" + package.Id;
        var before = (await this.Client.GetFromJsonAsync<BindingResponse[]>(path))!;
        Assert.Equal(new[] { intersecting.Id, alsoIntersecting.Id }, before.Single(binding => binding.PipelineId == first.Id).Workspaces.Select(workspace => workspace.Id));
        Assert.Empty(before.Single(binding => binding.PipelineId == second.Id).Workspaces);
        Assert.Empty(before.Single(binding => binding.PipelineId == emptyPipeline.Id).Workspaces);

        // Moving the AOI must exclude historical matches and select only the distant Workspace
        // in each bound Pipeline, while leaving the Pipeline without Workspaces empty.
        using var replaced = await this.Client.PutAsJsonAsync($"/v1/packages/{package.Id}/geometry", new { aoi = DistantGeometry, points = DistantDetailPoints });
        await AssertGeometryReplacementSucceededAsync(replaced);
        var after = (await this.Client.GetFromJsonAsync<BindingResponse[]>(path))!;
        Assert.Equal(new[] { distantWorkspace.Id }, after.Single(binding => binding.PipelineId == first.Id).Workspaces.Select(workspace => workspace.Id));
        Assert.Equal(new[] { secondWorkspace.Id }, after.Single(binding => binding.PipelineId == second.Id).Workspaces.Select(workspace => workspace.Id));
        Assert.Empty(after.Single(binding => binding.PipelineId == emptyPipeline.Id).Workspaces);
    }

    [Fact]
    public async Task Cancelled_intersection_read_does_not_enter_the_ArcGIS_queue() {
        await this.CategoryAsync();
        var package = await this.PackageAsync();
        var pipeline = await this.PipelineAsync();
        await this.WorkspaceAsync(pipeline.Id);
        using var scope = this.App.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<WorkspaceService>();
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => service.GetIntersectionsAsync(package.Id, pipeline.Id, cancelled.Token));
    }

    [Fact]
    public async Task Workspace_packages_recalculate_membership_after_AOI_replacement_and_preserve_pipeline_scope() {
        await this.CategoryAsync();
        var first = await this.PipelineAsync();
        var second = await this.PipelineAsync();
        var firstWorkspace = await this.WorkspaceAsync(first.Id);
        var secondWorkspace = await this.WorkspaceAsync(second.Id);
        var firstPackage = await this.PackageAsync();
        var secondPackage = await this.PackageAsync();
        await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = firstPackage.Id, pipelineId = first.Id });
        await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = secondPackage.Id, pipelineId = second.Id });

        var firstPath = $"/v1/pipelines/{first.Id}/workspaces/{firstWorkspace.Id}/packages";
        var secondPath = $"/v1/pipelines/{second.Id}/workspaces/{secondWorkspace.Id}/packages";
        // The subscription projection is asynchronous; wait for the created Packages to be visible.
        await this.App.EventuallyAsync(async () =>
            (await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(firstPath))!.TotalCount == 1
            && (await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(secondPath))!.TotalCount == 1);
        var before = (await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(firstPath))!;
        Assert.Equal(firstPackage.Id, Assert.Single(before.Items).PackageId);
        Assert.Equal(1, before.TotalCount);
        Assert.Equal(secondPackage.Id, Assert.Single((await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(secondPath))!.Items).PackageId);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.GetAsync($"/v1/pipelines/{second.Id}/workspaces/{firstWorkspace.Id}/packages")).StatusCode);

        // The new AOI is derived from distant detail points, not from any retained historical row.
        using var replaced = await this.Client.PutAsJsonAsync($"/v1/packages/{firstPackage.Id}/geometry", new { aoi = DistantGeometry, points = DistantDetailPoints });
        await AssertGeometryReplacementSucceededAsync(replaced);
        await this.App.EventuallyAsync(async () =>
            (await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(firstPath))!.TotalCount == 0);
        var distant = (await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(firstPath))!;
        Assert.Equal(0, distant.TotalCount);
        Assert.Empty(distant.Items);
        Assert.Equal(secondPackage.Id, Assert.Single((await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(secondPath))!.Items).PackageId);

        using var restored = await this.Client.PutAsJsonAsync($"/v1/packages/{firstPackage.Id}/geometry", new { aoi = Geometry, points = OriginalDetailPoints });
        await AssertGeometryReplacementSucceededAsync(restored);
        await this.App.EventuallyAsync(async () =>
            (await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(firstPath))!.TotalCount == 1);
        var current = (await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(firstPath))!;
        var item = Assert.Single(current.Items);
        Assert.Equal(firstPackage.Id, item.PackageId);
        var geometry = (await this.Client.GetFromJsonAsync<PackageGeometryResponse>($"/v1/packages/{firstPackage.Id}/geometry"))!;
        Assert.Equal(geometry.Aoi!.Value.GetRawText(), item.Aoi.GetRawText());
    }

    [Fact]
    public async Task Cancelled_workspace_packages_read_does_not_enter_the_ArcGIS_queue() {
        var pipeline = await this.PipelineAsync();
        var workspace = await this.WorkspaceAsync(pipeline.Id);
        using var scope = this.App.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<WorkspaceService>();
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => service.GetPackagesAsync(pipeline.Id, workspace.Id, 1, 200, cancelled.Token));
    }

    [Fact]
    public async Task Workspace_packages_return_current_AOIs_with_stable_pagination() {
        await this.CategoryAsync();
        var pipeline = await this.PipelineAsync();
        var workspace = await this.WorkspaceAsync(pipeline.Id);
        var packageIds = new List<string>();
        for (var index = 0; index < 3; index++) {
            var package = await this.PackageAsync();
            packageIds.Add(package.Id);
            await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = package.Id, pipelineId = pipeline.Id });
        }
        var path = $"/v1/pipelines/{pipeline.Id}/workspaces/{workspace.Id}/packages";
        await this.App.EventuallyAsync(async () => (await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(path))!.TotalCount == 3);
        var ordered = packageIds.Order(StringComparer.Ordinal).ToArray();
        for (var page = 1; page <= 3; page++) {
            var result = (await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(path + $"?page={page}&pageSize=1"))!;
            Assert.Equal(3, result.TotalCount);
            var item = Assert.Single(result.Items);
            Assert.Equal(ordered[page - 1], item.PackageId);
            Assert.Equal(JsonValueKind.Object, item.Aoi.ValueKind);
            Assert.True(item.Aoi.TryGetProperty("spatialReference", out _));
        }
        var empty = (await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(path + "?page=4&pageSize=1"))!;
        Assert.Equal(3, empty.TotalCount);
        Assert.Empty(empty.Items);
        var id = ordered[0];
        using var replaced = await this.Client.PutAsJsonAsync($"/v1/packages/{id}/geometry", new { aoi = Geometry, points = "{\"points\":[[12.4,55.4],[12.6,55.6]],\"spatialReference\":{\"wkid\":4326}}" });
        Assert.Equal(HttpStatusCode.OK, replaced.StatusCode);
        var current = (await this.Client.GetFromJsonAsync<PackageGeometryResponse>($"/v1/packages/{id}/geometry"))!;
        await this.App.EventuallyAsync(async () => {
            var result = (await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(path + "?pageSize=1"))!;
            return result.Items.Count == 1 && result.Items[0].Aoi.GetRawText() == current.Aoi!.Value.GetRawText();
        });
    }

    [Fact]
    public async Task Concurrent_workspace_package_reads_isolate_pipelines_and_empty_memberships() {
        await this.CategoryAsync();
        var first = await this.PipelineAsync();
        var second = await this.PipelineAsync();
        var firstNear = await this.WorkspaceAsync(first.Id);
        var firstFar = await this.WorkspaceAsync(first.Id, DistantGeometry, "First distant");
        var secondNear = await this.WorkspaceAsync(second.Id);
        var secondFar = await this.WorkspaceAsync(second.Id, DistantGeometry, "Second distant");
        var nearPackage = await this.PackageAsync();
        var farPackage = await this.PackageAsync(DistantGeometry);
        await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = nearPackage.Id, pipelineId = first.Id });
        await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = farPackage.Id, pipelineId = second.Id });

        var urls = new[] {
            $"/v1/pipelines/{first.Id}/workspaces/{firstNear.Id}/packages?page=1&pageSize=1",
            $"/v1/pipelines/{first.Id}/workspaces/{firstFar.Id}/packages?page=1&pageSize=1",
            $"/v1/pipelines/{second.Id}/workspaces/{secondNear.Id}/packages?page=1&pageSize=1",
            $"/v1/pipelines/{second.Id}/workspaces/{secondFar.Id}/packages?page=1&pageSize=1",
        };
        await this.App.EventuallyAsync(async () => {
            var pages = await Task.WhenAll(urls.Select(url => this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(url)));
            return pages[0]!.TotalCount == 1 && pages[1]!.TotalCount == 0
                && pages[2]!.TotalCount == 0 && pages[3]!.TotalCount == 1;
        });

        // Repeat a full burst: all four HTTP results must retain their own Pipeline and AOI.
        var results = await Task.WhenAll(urls.Select(url => this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(url)));
        Assert.Equal(nearPackage.Id, Assert.Single(results[0]!.Items).PackageId);
        Assert.Empty(results[1]!.Items);
        Assert.Empty(results[2]!.Items);
        Assert.Equal(farPackage.Id, Assert.Single(results[3]!.Items).PackageId);
        Assert.All(results, result => {
            Assert.Equal(1, result!.Page);
            Assert.Equal(1, result.PageSize);
        });
        Assert.True(results[0]!.Items[0].Aoi.TryGetProperty("spatialReference", out _));
        Assert.True(results[3]!.Items[0].Aoi.TryGetProperty("spatialReference", out _));
    }

    [Fact]
    public async Task Concurrent_workspace_package_pages_preserve_order_and_failed_request_isolation() {
        await this.CategoryAsync();
        var pipeline = await this.PipelineAsync();
        var workspace = await this.WorkspaceAsync(pipeline.Id);
        var packageIds = new List<string>();
        for (var index = 0; index < 3; index++) {
            var package = await this.PackageAsync();
            packageIds.Add(package.Id);
            await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = package.Id, pipelineId = pipeline.Id });
        }
        var path = $"/v1/pipelines/{pipeline.Id}/workspaces/{workspace.Id}/packages";
        await this.App.EventuallyAsync(async () =>
            (await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(path))!.TotalCount == 3);

        var results = await Task.WhenAll(Enumerable.Range(1, 4).Select(page =>
            this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(path + $"?page={page}&pageSize=1")));
        var ordered = packageIds.Order(StringComparer.Ordinal).ToArray();
        for (var index = 0; index < 3; index++) {
            Assert.Equal(3, results[index]!.TotalCount);
            Assert.Equal(index + 1, results[index]!.Page);
            Assert.Equal(ordered[index], Assert.Single(results[index]!.Items).PackageId);
        }
        Assert.Equal(3, results[3]!.TotalCount);
        Assert.Empty(results[3]!.Items);

        // A rejected Workspace request must not invalidate a concurrent valid page.
        var missing = this.Client.GetAsync($"/v1/pipelines/{pipeline.Id}/workspaces/{Guid.NewGuid():D}/packages");
        var validTask = this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(path + "?page=2&pageSize=1");
        using var missingResult = await missing;
        var valid = await validTask;
        Assert.Equal(HttpStatusCode.NotFound, missingResult.StatusCode);
        Assert.Equal(ordered[1], Assert.Single(valid!.Items).PackageId);
    }

    [Fact]
    public async Task Cancelling_one_queued_workspace_package_read_keeps_another_request_valid() {
        await this.CategoryAsync();
        var pipeline = await this.PipelineAsync();
        var workspace = await this.WorkspaceAsync(pipeline.Id);
        var package = await this.PackageAsync();
        await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = package.Id, pipelineId = pipeline.Id });
        var path = $"/v1/pipelines/{pipeline.Id}/workspaces/{workspace.Id}/packages";
        await this.App.EventuallyAsync(async () =>
            (await this.Client.GetFromJsonAsync<PagedResponse<WorkspacePackageResponse>>(path))!.TotalCount == 1);

        using var entered = new ManualResetEventSlim(false);
        using var release = new ManualResetEventSlim(false);
        // Hold the shared dispatcher briefly so cancellation happens while a read is pending.
        // A sibling read must still complete after that dispatcher work is released.
        var blocked = this.Runtime.Dispatcher.ExecuteAsync(() => {
            entered.Set();
            return release.Wait(TimeSpan.FromSeconds(5));
        });
        try {
            Assert.True(entered.Wait(TimeSpan.FromSeconds(3)));
            using var cancelled = new CancellationTokenSource();
            using var scope = this.App.Services.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<WorkspaceService>();
            var canceledRead = service.GetPackagesAsync(pipeline.Id, workspace.Id, 1, 1, cancelled.Token);
            var validRead = service.GetPackagesAsync(pipeline.Id, workspace.Id, 1, 1, CancellationToken.None);
            await Task.Delay(20);
            cancelled.Cancel();
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => canceledRead);
            release.Set();
            Assert.True(await blocked);
            Assert.Equal(package.Id, Assert.Single((await validRead).Items).PackageId);
        }
        finally {
            release.Set();
            await blocked;
        }
    }

    private const string DistantDetailPoints = "{\"points\":[[7.2,55.2],[7.8,55.8]],\"spatialReference\":{\"wkid\":4326}}";
    private const string OriginalDetailPoints = "{\"points\":[[12.2,55.2],[12.8,55.8]],\"spatialReference\":{\"wkid\":4326}}";

    private static async Task AssertGeometryReplacementSucceededAsync(HttpResponseMessage response) {
        // Include the server's validation response so a future contract change is diagnosable from test output.
        var error = response.StatusCode == HttpStatusCode.OK ? null : await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK,
            $"Expected HTTP 200 OK for package geometry replacement, got {(int)response.StatusCode} {response.StatusCode}. Response: {error}");
    }
}
