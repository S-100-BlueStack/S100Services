using System.Net;
using System.Net.Http.Json;
using DataCatalague.Api.Models;
using DataCatalague.Api.Models.V1;
using DataCatalogue.Api.Tests.Infrastructure;

namespace DataCatalogue.Api.Tests.Integration;

[Collection(CatalogueCollection.Name)]
[Trait("Category", "Integration")]
public sealed class PackageCommentEndpointTests(CatalogueFixture runtime) : CatalogueTest(runtime)
{
    [Fact]
    public async Task Package_decisions_are_atomic_idempotent_and_independent_of_binding_comments() {
        await this.CategoryAsync();
        var package = await this.PackageAsync();
        var other = await this.PackageAsync(DistantGeometry);
        var pipeline = await this.PipelineAsync();
        var path = $"/v1/packages/{package.Id}";
        const string author = @"PROD\reader";
        this.User(author);

        using var standalone = await this.Client.PostAsJsonAsync(path + "/comments", new {
            operationId = Guid.NewGuid(), text = "Ordinary Package text",
        });
        Assert.Equal(HttpStatusCode.MethodNotAllowed, standalone.StatusCode);
        Assert.Empty((await this.Client.GetFromJsonAsync<PackageCommentPageResponse>(path + "/comments"))!.Items);

        var earlier = await this.PutDecision(path, new { operationId = Guid.NewGuid(), discarded = true, reason = "Earlier reason" });
        await this.PutDecision(path, new { operationId = Guid.NewGuid(), discarded = false });

        foreach (var reason in new[] { "", " \r\n ", new string('x', 4001) }) {
            using var invalid = await this.Client.PutAsJsonAsync(path + "/discarded", new {
                operationId = Guid.NewGuid(), discarded = true, reason,
            });
            Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        }
        var discard = new { operationId = Guid.NewGuid(), discarded = true, reason = " Review deferred ", actor = "spoofed" };
        var first = await this.PutDecision(path, discard);
        Assert.Equal("discarded", first.AssignmentStatus);
        Assert.Equal("Review deferred", first.Text);
        Assert.Equal(author, first.Actor);
        Assert.Equal(first, await this.PutDecision(path, discard));

        var foreign = await this.Client.PutAsJsonAsync($"/v1/packages/{other.Id}/discarded", discard);
        Assert.Equal(HttpStatusCode.Conflict, foreign.StatusCode);
        using var otherKind = await this.Client.PutAsJsonAsync(path + "/discarded", new { discard.operationId, discarded = false });
        Assert.Equal(HttpStatusCode.Conflict, otherKind.StatusCode);
        using var otherReason = await this.Client.PutAsJsonAsync(path + "/discarded", discard with { reason = "Different reason" });
        Assert.Equal(HttpStatusCode.Conflict, otherReason.StatusCode);
        this.User(@"PROD\other");
        using var actorConflict = await this.Client.PutAsJsonAsync(path + "/discarded", discard);
        Assert.Equal(HttpStatusCode.Conflict, actorConflict.StatusCode);
        this.User(author);

        var page = (await this.Client.GetFromJsonAsync<PackageCommentPageResponse>(path + "/comments?pageSize=1"))!;
        Assert.Equal<Guid?>(discard.operationId, page.NextBefore);
        var reasonItem = Assert.Single(page.Items);
        Assert.Equal("discardReason", reasonItem.Kind);
        Assert.Equal(first.HistoryEventId, reasonItem.HistoryEventId);
        var older = (await this.Client.GetFromJsonAsync<PackageCommentPageResponse>(path + $"/comments?before={page.NextBefore}"))!;
        Assert.Equal(earlier.Id, Assert.Single(older.Items).Id);
        Assert.Null(older.NextBefore);
        using var foreignCursor = await this.Client.GetAsync($"/v1/packages/{other.Id}/comments?before={page.NextBefore}");
        Assert.Equal(HttpStatusCode.BadRequest, foreignCursor.StatusCode);
        Assert.Empty((await this.Client.GetFromJsonAsync<BindingCommentPageResponse>(path + "/binding-comments"))!.Items);

        var history = (await this.Client.GetFromJsonAsync<PackageHistoryResponse>(path + "/history"))!;
        var historyDecision = Assert.Single(history.Items, item => item.EventType == "packageDiscarded" && item.OperationId == first.Id);
        Assert.Equal(first.HistoryEventId, historyDecision.Id);
        Assert.Equal<Guid?>(first.Id, historyDecision.OperationId);
        Assert.Equal(first.Text, historyDecision.CommentText);
        Assert.Single(history.Items, item => item.CommentText == first.Text);
        Assert.Null(historyDecision.PipelineId);

        using var deniedBind = await this.Client.PostAsJsonAsync("/v1/dispatcher/bindings", new { packageId = package.Id, pipelineId = pipeline.Id });
        Assert.Equal(HttpStatusCode.Conflict, deniedBind.StatusCode);
        using var invalidReopen = await this.Client.PutAsJsonAsync(path + "/discarded", new { operationId = Guid.NewGuid(), discarded = false, reason = "Ambiguous" });
        Assert.Equal(HttpStatusCode.BadRequest, invalidReopen.StatusCode);
        var reopen = await this.PutDecision(path, new { operationId = Guid.NewGuid(), discarded = false });
        Assert.Equal("notAssigned", reopen.AssignmentStatus);
        var binding = await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = package.Id, pipelineId = pipeline.Id });
        foreach (var forbiddenId in new[] { first.Id, reopen.Id }) {
            using var collision = await this.Client.PostAsJsonAsync(path + "/binding-comments", new {
                operationId = forbiddenId, pipelineId = pipeline.Id, text = "Must not be appended",
            });
            Assert.Equal(HttpStatusCode.Conflict, collision.StatusCode);
        }
        Assert.Empty((await this.Client.GetFromJsonAsync<BindingCommentPageResponse>(path + "/binding-comments"))!.Items);

        var bindingComment = new { operationId = Guid.NewGuid(), pipelineId = pipeline.Id, text = "Binding note" };
        using var bindingPost = await this.Client.PostAsJsonAsync(path + "/binding-comments", bindingComment);
        Assert.Equal(HttpStatusCode.OK, bindingPost.StatusCode);
        var bindingReceipt = (await bindingPost.Content.ReadFromJsonAsync<BindingCommentResponse>())!;
        Assert.Equal("assigned", (await this.PutDecision(path, discard)).AssignmentStatus);
        using var removal = await this.Client.DeleteAsync($"/v1/dispatcher/bindings/{Uri.EscapeDataString(binding.Id!)}");
        Assert.Equal(HttpStatusCode.NoContent, removal.StatusCode);
        Assert.Equal("notAssigned", (await this.Client.GetFromJsonAsync<PackageResponse>(path))!.AssignmentStatus);
        using var bindingRetry = await this.Client.PostAsJsonAsync(path + "/binding-comments", bindingComment);
        Assert.Equal(HttpStatusCode.OK, bindingRetry.StatusCode);
        Assert.Equal(bindingReceipt, await bindingRetry.Content.ReadFromJsonAsync<BindingCommentResponse>());
        using var reverseCollision = await this.Client.PutAsJsonAsync(path + "/discarded", new {
            bindingComment.operationId, discarded = true, reason = "Must not be appended",
        });
        Assert.Equal(HttpStatusCode.Conflict, reverseCollision.StatusCode);
        Assert.Equal(2, (await this.Client.GetFromJsonAsync<PackageCommentPageResponse>(path + "/comments"))!.Items.Count);


        this.Client.DefaultRequestHeaders.Add("X-Test-DenyAccess", "true");
        using var denied = await this.Client.GetAsync(path + "/comments");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        this.Client.DefaultRequestHeaders.Remove("X-Test-DenyAccess");
        this.Client.DefaultRequestHeaders.Remove(TestAuthentication.UserHeader);
        using var unauthorized = await this.Client.PutAsJsonAsync(path + "/discarded", discard);
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);
    }

    [Fact]
    public async Task Discard_and_bind_cannot_both_commit_and_listing_filters_before_paging() {
        var category = await this.CategoryAsync();
        var package = await this.PackageAsync();
        var other = await this.PackageAsync(DistantGeometry);
        var open = await this.PackageAsync();
        var pipeline = await this.PipelineAsync();
        var path = $"/v1/packages/{package.Id}";
        var operations = await Task.WhenAll(
            this.Client.PutAsJsonAsync(path + "/discarded", new { operationId = Guid.NewGuid(), discarded = true, reason = "Decision" }),
            this.Client.PostAsJsonAsync("/v1/dispatcher/bindings", new { packageId = package.Id, pipelineId = pipeline.Id })
        );
        using var discardResult = operations[0];
        using var bindResult = operations[1];
        Assert.NotEqual(discardResult.IsSuccessStatusCode, bindResult.IsSuccessStatusCode);
        Assert.Equal(HttpStatusCode.Conflict, discardResult.IsSuccessStatusCode ? bindResult.StatusCode : discardResult.StatusCode);
        if (discardResult.IsSuccessStatusCode) {
            await this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId = other.Id, pipelineId = pipeline.Id });
        }
        else {
            await this.PutDecision($"/v1/packages/{other.Id}", new { operationId = Guid.NewGuid(), discarded = true, reason = "Independent decision" });
        }
        var reopened = await this.Client.GetFromJsonAsync<PackageResponse>($"/v1/packages/{open.Id}");
        Assert.Equal("notAssigned", reopened!.AssignmentStatus);

        var list = $"/v1/packages?category={category.Id}&pageSize=1";
        await this.App.EventuallyAsync(async () => (await this.Client.GetFromJsonAsync<PagedResponse<PackageResponse>>(list))!.TotalCount == 3);
        foreach (var status in new[] { "notAssigned", "discarded", "assigned" }) {
            var result = (await this.Client.GetFromJsonAsync<PagedResponse<PackageResponse>>($"{list}&assignmentStatus={status}"))!;
            Assert.Equal(1, result.TotalCount);
            Assert.Equal(status, Assert.Single(result.Items).AssignmentStatus);
        }
        var legacy = (await this.Client.GetFromJsonAsync<PagedResponse<PackageResponse>>(list + "&hasPipeline=false"))!;
        Assert.Equal(2, legacy.TotalCount);
        var intersection = (await this.Client.GetFromJsonAsync<PagedResponse<PackageResponse>>(list + $"&pipelineId={pipeline.Id}&assignmentStatus=discarded"))!;
        Assert.Equal(0, intersection.TotalCount);
        using var invalid = await this.Client.GetAsync(list + "&assignmentStatus=unknown");
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }

    private async Task<PackageOperationResponse> PutDecision(string packagePath, object decision) {
        using var response = await this.Client.PutAsJsonAsync(packagePath + "/discarded", decision);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<PackageOperationResponse>())!;
    }
}
