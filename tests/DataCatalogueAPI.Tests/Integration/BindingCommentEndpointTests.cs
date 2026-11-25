using System.Net;
using System.Net.Http.Json;
using DataCatalague.Api.Models.V1;
using DataCatalogue.Api.Tests.Infrastructure;

namespace DataCatalogue.Api.Tests.Integration;

[Collection(CatalogueCollection.Name)]
[Trait("Category", "Integration")]
public sealed class BindingCommentEndpointTests(CatalogueFixture runtime) : CatalogueTest(runtime)
{
    [Fact]
    public async Task Comments_are_idempotent_scoped_retained_and_exposed_as_committed_history() {
        await this.CategoryAsync();
        var package = await this.PackageAsync();
        var other = await this.PackageAsync(DistantGeometry);
        var pipeline = await this.PipelineAsync();
        var secondPipeline = await this.PipelineAsync();
        var path = $"/v1/packages/{package.Id}/binding-comments";
        var otherPath = $"/v1/packages/{other.Id}/binding-comments";
        var binding = await this.BindAsync(package.Id!, pipeline.Id!);
        await this.BindAsync(package.Id!, secondPipeline.Id!);
        await this.BindAsync(other.Id!, pipeline.Id!);

        const string author = @"PROD\B123456";
        this.User(author);
        var operationId = Guid.NewGuid();
        const string text = "<img src=x onerror=alert(1)>\nTwo lines";
        var request = new { pipelineId = pipeline.Id, operationId, text = $"  {text}  ", actor = "spoofed", occurredAtUtc = "2000-01-01T00:00:00Z" };
        var started = DateTimeOffset.UtcNow;
        var replies = await Task.WhenAll(this.Client.PostAsJsonAsync(path, request), this.Client.PostAsJsonAsync(path, request));
        using var firstReply = replies[0];
        using var retryReply = replies[1];
        Assert.Equal(HttpStatusCode.OK, firstReply.StatusCode);
        Assert.Equal(HttpStatusCode.OK, retryReply.StatusCode);
        var first = (await firstReply.Content.ReadFromJsonAsync<BindingCommentResponse>())!;
        Assert.Equal(first, await retryReply.Content.ReadFromJsonAsync<BindingCommentResponse>());
        Assert.Equal(operationId, first.Id);
        Assert.Equal(text, first.Text);
        Assert.Equal(author, first.Actor);
        Assert.Equal(TimeSpan.Zero, first.OccurredAtUtc.Offset);
        Assert.InRange(first.OccurredAtUtc, started, DateTimeOffset.UtcNow);

        await this.ExpectPostAsync(HttpStatusCode.Conflict, path, new { pipelineId = pipeline.Id, operationId, text = "Different" });
        await this.ExpectPostAsync(HttpStatusCode.Conflict, path, new { pipelineId = secondPipeline.Id, operationId, text });
        await this.ExpectPostAsync(HttpStatusCode.Conflict, otherPath, new { pipelineId = pipeline.Id, operationId, text });
        this.User(@"PROD\B654321");
        await this.ExpectPostAsync(HttpStatusCode.Conflict, path, request);

        var secondId = Guid.NewGuid();
        await this.ExpectPostAsync(HttpStatusCode.OK, path, new { pipelineId = pipeline.Id, operationId = secondId, text = "Second comment" });
        var otherPipelineId = Guid.NewGuid();
        await this.ExpectPostAsync(HttpStatusCode.OK, path, new { pipelineId = secondPipeline.Id, operationId = otherPipelineId, text = "Independent Workstream" });
        var otherPackageId = Guid.NewGuid();
        await this.ExpectPostAsync(HttpStatusCode.OK, otherPath, new { pipelineId = pipeline.Id, operationId = otherPackageId, text = "Independent Package" });

        var page = (await this.Client.GetFromJsonAsync<BindingCommentPageResponse>(path + "?pageSize=1"))!;
        Assert.NotNull(page.NextBefore);
        var remaining = (await this.Client.GetFromJsonAsync<BindingCommentPageResponse>(path + $"?before={page.NextBefore}"))!;
        Assert.Null(remaining.NextBefore);
        Assert.Equal(3, page.Items.Concat(remaining.Items).Select(item => item.Id).Distinct().Count());
        Assert.Equal(secondPipeline.Id, Assert.Single(page.Items.Concat(remaining.Items), item => item.Id == otherPipelineId).PipelineId);
        Assert.Equal(otherPackageId, Assert.Single((await this.Client.GetFromJsonAsync<BindingCommentPageResponse>(otherPath))!.Items).Id);
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.GetAsync(otherPath + $"?before={page.NextBefore}")).StatusCode);

        using var removal = await this.Client.DeleteAsync($"/v1/dispatcher/bindings/{Uri.EscapeDataString(binding.Id!)}");
        Assert.Equal(HttpStatusCode.NoContent, removal.StatusCode);
        Assert.DoesNotContain((await this.Client.GetFromJsonAsync<BindingResponse[]>($"/v1/dispatcher/bindings?packageId={package.Id}"))!, relation => relation.Id == binding.Id);
        await this.ExpectPostAsync(HttpStatusCode.Conflict, path, new { pipelineId = pipeline.Id, operationId = Guid.NewGuid(), text = "Inactive" });
        Assert.Equal(2, (await this.Client.GetFromJsonAsync<BindingCommentPageResponse>(path))!.Items.Count(item => item.PipelineId == pipeline.Id));
        this.User(author);
        await this.ExpectPostAsync(HttpStatusCode.OK, path, request);
        Assert.Equal(binding.Id, (await this.BindAsync(package.Id!, pipeline.Id!)).Id);
        Assert.Equal(3, (await this.Client.GetFromJsonAsync<BindingCommentPageResponse>(path))!.Items.Count);

        await this.App.EventuallyAsync(async () => {
            var history = await this.Client.GetFromJsonAsync<PackageHistoryResponse>($"/v1/packages/{package.Id}/history");
            return history!.Items.Any(item => item.CommentText == text && item.PipelineName == pipeline.DisplayName);
        });
        var timeline = (await this.Client.GetFromJsonAsync<PackageHistoryResponse>($"/v1/packages/{package.Id}/history"))!;
        var entry = Assert.Single(timeline.Items, item => item.EventType == "bindingCommentAdded" && item.CommentText == text);
        Assert.Equal(first.PipelineId, entry.PipelineId);
        Assert.Equal(first.Actor, entry.Actor);
        Assert.Equal(first.OccurredAtUtc, entry.OccurredAtUtc);
        Assert.Equal(3, timeline.Items.Count(item => item.EventType == "bindingCommentAdded"));
    }

    [Fact]
    public async Task Comments_use_catalogue_access_validate_input_and_require_an_existing_binding() {
        await this.CategoryAsync();
        var package = await this.PackageAsync();
        var pipeline = await this.PipelineAsync();
        var path = $"/v1/packages/{package.Id}/binding-comments";
        var request = new { pipelineId = pipeline.Id, operationId = Guid.NewGuid(), text = "First" };

        Assert.Empty((await this.Client.GetFromJsonAsync<BindingCommentPageResponse>(path))!.Items);
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.GetAsync("/v1/packages/missing/binding-comments")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.GetAsync(path + "?pageSize=101")).StatusCode);
        await this.ExpectPostAsync(HttpStatusCode.NotFound, path, request);
        await this.BindAsync(package.Id!, pipeline.Id!);
        await this.ExpectPostAsync(HttpStatusCode.BadRequest, path, request with { pipelineId = "invalid::id" });
        await this.ExpectPostAsync(HttpStatusCode.BadRequest, path, request with { operationId = Guid.Empty });
        await this.ExpectPostAsync(HttpStatusCode.BadRequest, path, request with { text = " \r\n " });
        await this.ExpectPostAsync(HttpStatusCode.BadRequest, path, request with { text = new string('x', 4001) });
        Assert.Empty((await this.Client.GetFromJsonAsync<BindingCommentPageResponse>(path))!.Items);

        this.Client.DefaultRequestHeaders.Add("X-Test-DenyAccess", "true");
        Assert.Equal(HttpStatusCode.Forbidden, (await this.Client.GetAsync(path)).StatusCode);
        await this.ExpectPostAsync(HttpStatusCode.Forbidden, path, request);
        this.Client.DefaultRequestHeaders.Remove("X-Test-DenyAccess");
        this.Client.DefaultRequestHeaders.Remove(TestAuthentication.UserHeader);
        Assert.Equal(HttpStatusCode.Unauthorized, (await this.Client.GetAsync(path)).StatusCode);
        await this.ExpectPostAsync(HttpStatusCode.Unauthorized, path, request);
    }

    private Task<BindingResponse> BindAsync(string packageId, string pipelineId)
        => this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId, pipelineId });

    private async Task ExpectPostAsync(HttpStatusCode expected, string path, object request) {
        using var response = await this.Client.PostAsJsonAsync(path, request);
        Assert.Equal(expected, response.StatusCode);
    }
}
