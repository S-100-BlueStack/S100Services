using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text;
using DataCatalague.Api.Controllers;
using DataCatalague.Api.Models.V1;
using DataCatalogue.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc;

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
        using var acknowledgment = JsonDocument.Parse(await firstReply.Content.ReadAsStringAsync());
        Assert.False(acknowledgment.RootElement.TryGetProperty("historyEventId", out _));
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
        Assert.Equal(Assert.Single(page.Items).Id, page.NextBefore);
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
        var item = Assert.Single(page.Items.Concat(remaining.Items), item => item.Id == operationId);
        Assert.Equal(entry.Id, item.HistoryEventId);
        Assert.NotEqual(operationId, item.HistoryEventId);
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

    [Fact]
    public async Task Batch_availability_is_scoped_retained_and_read_only() {
        const string path = "/v1/packages/binding-comments/availability";
        await this.CategoryAsync();
        var package = await this.PackageAsync();
        var other = await this.PackageAsync(DistantGeometry);
        var pipeline = await this.PipelineAsync();
        var binding = await this.BindAsync(package.Id!, pipeline.Id!);
        var enc = await this.PipelineAsync();
        await this.BindAsync(package.Id!, enc.Id!);
        await this.BindAsync(other.Id!, pipeline.Id!);
        var bindings = new BindingCommentScope[] {
            new(package.Id!, pipeline.Id!), new(package.Id!, enc.Id!), new(other.Id!, pipeline.Id!),
            new(other.Id!, enc.Id!), new("missing", pipeline.Id!),
        };

        async Task CheckAsync(bool present) {
            using var response = await this.Client.PostAsJsonAsync(path, new { bindings });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.True(response.Headers.CacheControl?.NoStore == true);
            var results = (await response.Content.ReadFromJsonAsync<BindingCommentAvailabilityResponse>())!.Items
                .ToDictionary(item => (item.PackageId, item.PipelineId), item => item.HasBindingComments);
            Assert.Equal(5, results.Count);
            Assert.Equal(present, results[(package.Id!, pipeline.Id!)]);
            Assert.Equal(false, results[(package.Id!, enc.Id!)]);
            Assert.Equal(false, results[(other.Id!, pipeline.Id!)]);
            Assert.Null(results[(other.Id!, enc.Id!)]);
            Assert.Null(results[("missing", pipeline.Id!)]);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            Assert.Contains(json.RootElement.GetProperty("items").EnumerateArray(),
                item => item.GetProperty("packageId").GetString() == "missing" &&
                    item.GetProperty("hasBindingComments").ValueKind == JsonValueKind.Null);
        }

        await CheckAsync(false);
        var commentPath = $"/v1/packages/{package.Id}/binding-comments";
        var comment = new { pipelineId = pipeline.Id, operationId = Guid.NewGuid(), text = "Retained" };
        await this.ExpectPostAsync(HttpStatusCode.OK, commentPath, comment);
        await CheckAsync(true);
        using var removal = await this.Client.DeleteAsync($"/v1/dispatcher/bindings/{Uri.EscapeDataString(binding.Id!)}");
        Assert.Equal(HttpStatusCode.NoContent, removal.StatusCode);
        await CheckAsync(true);
        await this.ExpectPostAsync(HttpStatusCode.OK, commentPath, comment);
        Assert.Equal(binding.Id, (await this.BindAsync(package.Id!, pipeline.Id!)).Id);

        var historyPath = $"/v1/packages/{package.Id}/history";
        var before = await this.Client.GetFromJsonAsync<PackageHistoryResponse>(historyPath);
        await CheckAsync(true);
        var after = await this.Client.GetFromJsonAsync<PackageHistoryResponse>(historyPath);
        Assert.Equal(before!.Items.Select(item => item.Id), after!.Items.Select(item => item.Id));
        var scoped = (await this.Client.GetFromJsonAsync<BindingCommentPageResponse>($"{commentPath}?pipelineId={pipeline.Id}"))!;
        Assert.Equal(pipeline.Id, scoped.PipelineId);
        Assert.Equal(comment.operationId, Assert.Single(scoped.Items).Id);
        var empty = (await this.Client.GetFromJsonAsync<BindingCommentPageResponse>($"{commentPath}?pipelineId={enc.Id}"))!;
        Assert.Equal(enc.Id, empty.PipelineId);
        Assert.Empty(empty.Items);
    }

    [Fact]
    public async Task Batch_availability_enforces_bounds_identifiers_and_access() {
        const string path = "/v1/packages/binding-comments/availability";
        var max = Enumerable.Range(0, 200)
            .Select(index => new BindingCommentScope($"{new string('ࠀ', 197)}{index:D3}", new string('ࠀ', 200)))
            .ToArray();
        var json = JsonSerializer.Serialize(new { bindings = max }, JsonSerializerOptions.Web);
        Assert.InRange(Encoding.UTF8.GetByteCount(json), 256 * 1024 + 1, 512 * 1024);
        using var successful = await this.Client.PostAsJsonAsync(path, new { bindings = max });
        Assert.Equal(HttpStatusCode.OK, successful.StatusCode);
        Assert.Equal(200, (await successful.Content.ReadFromJsonAsync<BindingCommentAvailabilityResponse>())!.Items.Count);

        var valid = new BindingCommentScope("package", "enc");
        foreach (var bindings in new BindingCommentScope?[][] {
            [], [valid, valid], [null], [new(null, "enc")], [new("package", null)],
            [new("", "enc")], [new("package", " padded")], [new("bad::id", "enc")],
            [new("package", "bad\tID")], [new(new string('x', 201), "enc")], [.. max, valid],
        }) {
            await this.ExpectPostAsync(HttpStatusCode.BadRequest, path, new { bindings });
        }
        await this.ExpectPostAsync(HttpStatusCode.BadRequest, path, new { packageIds = new[] { "package" } });
        await this.ExpectPostAsync(HttpStatusCode.BadRequest, path, new { bindings = "missing" });
        var request = new { bindings = new[] { valid } };
        this.Client.DefaultRequestHeaders.Add("X-Test-DenyAccess", "true");
        await this.ExpectPostAsync(HttpStatusCode.Forbidden, path, request);
        this.Client.DefaultRequestHeaders.Remove("X-Test-DenyAccess");
        this.Client.DefaultRequestHeaders.Remove(TestAuthentication.UserHeader);
        await this.ExpectPostAsync(HttpStatusCode.Unauthorized, path, request);
    }

    [Fact]
    public async Task Filtered_comments_apply_binding_scope_before_pagination_and_cursor_validation() {
        await this.CategoryAsync();
        var package = await this.PackageAsync();
        var caris = await this.PipelineAsync();
        var esri = await this.PipelineAsync();
        var binding = await this.BindAsync(package.Id!, caris.Id!);
        await this.BindAsync(package.Id!, esri.Id!);
        var path = $"/v1/packages/{package.Id}/binding-comments";
        var selected = new List<Guid>();
        for (var index = 0; index < 51; index++) {
            var operationId = Guid.NewGuid();
            selected.Add(operationId);
            await this.ExpectPostAsync(HttpStatusCode.OK, path, new { pipelineId = caris.Id, operationId, text = $"CARIS {index}" });
        }
        Guid foreign = Guid.Empty;
        for (var index = 0; index < 52; index++) {
            foreign = Guid.NewGuid();
            await this.ExpectPostAsync(HttpStatusCode.OK, path, new { pipelineId = esri.Id, operationId = foreign, text = $"ESRI {index}" });
        }

        var unfiltered = (await this.Client.GetFromJsonAsync<BindingCommentPageResponse>(path))!;
        Assert.Null(unfiltered.PipelineId);
        Assert.All(unfiltered.Items, item => Assert.Equal(esri.Id, item.PipelineId));
        var scoped = $"{path}?pipelineId={Uri.EscapeDataString(caris.Id!)}";
        var first = (await this.Client.GetFromJsonAsync<BindingCommentPageResponse>(scoped))!;
        Assert.Equal(caris.Id, first.PipelineId);
        Assert.Equal(50, first.Items.Count);
        Assert.All(first.Items, item => Assert.Equal(caris.Id, item.PipelineId));
        Assert.Equal<Guid?>(first.Items[^1].Id, first.NextBefore);
        var next = (await this.Client.GetFromJsonAsync<BindingCommentPageResponse>($"{scoped}&before={first.NextBefore}"))!;
        Assert.Null(next.NextBefore);
        Assert.Single(next.Items);
        Assert.Equal(selected.Order(), first.Items.Concat(next.Items).Select(item => item.Id).Order());

        foreach (var invalid in new[] { "?pipelineId=", "?pipelineId=bad%3A%3Aid", "?pipelineId=one&pipelineId=two",
            $"?pipelineId={caris.Id}&before={foreign}" }) {
            Assert.Equal(HttpStatusCode.BadRequest, (await this.Client.GetAsync(path + invalid)).StatusCode);
        }
        Assert.Equal(HttpStatusCode.NotFound, (await this.Client.GetAsync(path + "?pipelineId=missing")).StatusCode);

        using var removal = await this.Client.DeleteAsync($"/v1/dispatcher/bindings/{Uri.EscapeDataString(binding.Id!)}");
        Assert.Equal(HttpStatusCode.NoContent, removal.StatusCode);
        var inactive = (await this.Client.GetFromJsonAsync<BindingCommentPageResponse>(scoped))!;
        Assert.Equal(first.Items.ToArray(), inactive.Items.ToArray());
        Assert.Equal(binding.Id, (await this.BindAsync(package.Id!, caris.Id!)).Id);
        var restored = (await this.Client.GetFromJsonAsync<BindingCommentPageResponse>(scoped))!;
        Assert.Equal(first.Items.ToArray(), restored.Items.ToArray());

        this.Client.DefaultRequestHeaders.Add("X-Test-DenyAccess", "true");
        Assert.Equal(HttpStatusCode.Forbidden, (await this.Client.GetAsync(scoped)).StatusCode);
        this.Client.DefaultRequestHeaders.Remove("X-Test-DenyAccess");
        this.Client.DefaultRequestHeaders.Remove(TestAuthentication.UserHeader);
        Assert.Equal(HttpStatusCode.Unauthorized, (await this.Client.GetAsync(scoped)).StatusCode);
    }

    [Fact]
    public void Batch_availability_declares_the_request_body_cap() {
        var action = typeof(BindingCommentAvailabilityController).GetMethod(nameof(BindingCommentAvailabilityController.Read))!;
        var cap = Assert.Single(action.CustomAttributes, attribute => attribute.AttributeType == typeof(RequestSizeLimitAttribute));
        Assert.Equal(512L * 1024, Assert.IsType<long>(Assert.Single(cap.ConstructorArguments).Value));
    }

    private Task<BindingResponse> BindAsync(string packageId, string pipelineId)
        => this.App.CreateAsync<BindingResponse>("/v1/dispatcher/bindings", new { packageId, pipelineId });

    private async Task ExpectPostAsync(HttpStatusCode expected, string path, object request) {
        using var response = await this.Client.PostAsJsonAsync(path, request);
        Assert.Equal(expected, response.StatusCode);
    }
}
