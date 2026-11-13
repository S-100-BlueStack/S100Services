using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using DataCatalague.Api.Configuration;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Mcp;
using DataCatalague.Api.Models;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Services;
using DataCatalogue.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using ModelContextProtocol;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;

namespace DataCatalogue.Api.Tests.Unit;

public sealed class McpReadOnlyTests
{
    private static readonly string[] ToolNames = ["get_package", "get_package_geometry", "get_pipeline", "get_workspace", "list_package_geometries", "list_packages", "list_pipelines", "list_workspace_packages", "list_workspaces"];

    [Theory]
    [InlineData(false, false, HttpStatusCode.Unauthorized)]
    [InlineData(true, true, HttpStatusCode.Forbidden)]
    public async Task Endpoint_requires_authenticated_access_group(bool signedIn, bool denied, HttpStatusCode expected) {
        await using var host = await TestHost.CreateAsync(signedIn, denied);
        using var response = await host.Http.PostAsJsonAsync("/catalogue/mcp", new { jsonrpc = "2.0", id = 1, method = "tools/list" });
        Assert.Equal(expected, response.StatusCode);
        Assert.Equal(0, host.Reads.Calls);
    }

    [Fact]
    public async Task Discovery_exposes_only_the_read_allowlist_and_hides_injected_services() {
        await using var host = await TestHost.CreateAsync();
        await using var client = await host.ConnectAsync();
        var tools = await client.ListToolsAsync();
        Assert.Equal(ToolNames, tools.Select(tool => tool.Name).Order(StringComparer.Ordinal));
        foreach (var tool in tools) {
            Assert.True(tool.ProtocolTool.Annotations!.ReadOnlyHint);
            Assert.False(tool.ProtocolTool.Annotations.DestructiveHint);
            Assert.True(tool.ProtocolTool.Annotations.IdempotentHint);
            Assert.False(tool.ProtocolTool.Annotations.OpenWorldHint);
            var schema = tool.ProtocolTool.InputSchema.GetRawText();
            Assert.DoesNotContain("cancellationToken", schema);
            Assert.DoesNotContain("currentUser", schema);
            Assert.DoesNotContain("httpContext", schema);
            Assert.NotNull(tool.ProtocolTool.OutputSchema);
        }
        Assert.Equal(0, host.Reads.Calls);
    }

    [Fact]
    public async Task Every_tool_can_be_called_over_streamable_http_under_an_IIS_path_base() {
        await using var host = await TestHost.CreateAsync();
        await using var client = await host.ConnectAsync();
        foreach (var tool in ToolNames) {
            var arguments = new Dictionary<string, object?>();
            if (tool is "get_package" or "get_package_geometry") { arguments["packageId"] = "package"; }
            if (tool is "get_pipeline" or "get_workspace" or "list_workspace_packages") { arguments["pipelineId"] = "pipeline"; }
            if (tool is "get_workspace" or "list_workspace_packages") { arguments["workspaceId"] = Guid.Empty.ToString("D"); }
            var result = await client.CallToolAsync(tool, arguments);
            Assert.NotEqual(true, result.IsError);
            Assert.NotNull(result.StructuredContent);
        }
        Assert.Equal(ToolNames.Length, host.Reads.Calls);
    }

    [Fact]
    public async Task Geometry_page_forwards_filters_and_details_and_preserves_Esri_JSON() {
        await using var host = await TestHost.CreateAsync();
        await using var client = await host.ConnectAsync();
        const string aoi = "{\"xmin\":12.4,\"ymin\":55.5,\"xmax\":12.7,\"ymax\":55.8,\"spatialReference\":{\"wkid\":4326}}";
        var result = await client.CallToolAsync("list_package_geometries", new Dictionary<string, object?> { ["category"] = "WorkZone", ["geometry"] = aoi, ["pipelineId"] = "pipeline", ["hasPipeline"] = true, ["page"] = 2, ["pageSize"] = 5, ["includeDetails"] = true });
        Assert.NotEqual(true, result.IsError);
        Assert.Equal(("WorkZone", aoi, 2, 5, true, "pipeline", true), host.Reads.Filters);
        var json = JsonSerializer.Serialize(result.StructuredContent);
        using var document = JsonDocument.Parse(json);
        var item = document.RootElement.GetProperty("items")[0];
        Assert.Equal(4326, item.GetProperty("aoi").GetProperty("spatialReference").GetProperty("wkid").GetInt32());
        Assert.Equal(JsonValueKind.Null, item.GetProperty("detailedGeometry").ValueKind);
    }

    [Theory]
    [InlineData(0, 20)]
    [InlineData(1, 0)]
    [InlineData(1, 201)]
    public async Task Invalid_paging_is_a_tool_error_before_query_execution(int page, int pageSize) {
        await using var host = await TestHost.CreateAsync();
        await using var client = await host.ConnectAsync();
        foreach (var tool in new[] { "list_packages", "list_pipelines", "list_workspaces", "list_package_geometries", "list_workspace_packages" }) {
            var arguments = new Dictionary<string, object?> { ["page"] = page, ["pageSize"] = pageSize };
            if (tool == "list_workspace_packages") {
                arguments["pipelineId"] = "pipeline";
                arguments["workspaceId"] = Guid.Empty.ToString("D");
            }
            var result = await client.CallToolAsync(tool, arguments);
            Assert.True(result.IsError);
        }
        Assert.Equal(0, host.Reads.Calls);
    }

    [Fact]
    public async Task Invalid_geometry_length_and_workspace_ID_are_rejected_before_query_execution() {
        await using var host = await TestHost.CreateAsync();
        await using var client = await host.ConnectAsync();
        Assert.True((await client.CallToolAsync("list_packages", new Dictionary<string, object?> { ["geometry"] = new string('x', 16385) })).IsError);
        Assert.True((await client.CallToolAsync("get_workspace", new Dictionary<string, object?> { ["pipelineId"] = "pipeline", ["workspaceId"] = "invalid" })).IsError);
        Assert.True((await client.CallToolAsync("get_package", new Dictionary<string, object?> { ["packageId"] = " " })).IsError);
        Assert.Equal(0, host.Reads.Calls);
    }

    [Fact]
    public async Task Current_owner_uses_the_authenticated_request_identity() {
        await using var host = await TestHost.CreateAsync();
        await using var client = await host.ConnectAsync();
        Assert.NotEqual(true, (await client.CallToolAsync("list_workspaces", new Dictionary<string, object?> { ["owner"] = "current" })).IsError);
        Assert.Equal("PROD\\alice", host.Reads.CurrentUser);
        Assert.True((await client.CallToolAsync("list_workspaces", new Dictionary<string, object?> { ["owner"] = "current", ["unassigned"] = true })).IsError);
        Assert.Equal(1, host.Reads.Calls);
    }

    [Fact]
    public async Task Mutation_names_are_not_callable() {
        await using var host = await TestHost.CreateAsync();
        await using var client = await host.ConnectAsync();
        await Assert.ThrowsAsync<McpProtocolException>(() => client.CallToolAsync("create_package", new Dictionary<string, object?>()).AsTask());
        Assert.Equal(0, host.Reads.Calls);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Missing_resources_and_unexpected_failures_are_safe_tool_errors(bool missing) {
        await using var host = await TestHost.CreateAsync();
        host.Reads.Failure = missing ? new KeyNotFoundException("private path") : new InvalidOperationException("secret connection string");
        await using var client = await host.ConnectAsync();
        var result = await client.CallToolAsync("get_package", new Dictionary<string, object?> { ["packageId"] = "package" });
        Assert.True(result.IsError);
        var text = string.Join(" ", result.Content.OfType<TextContentBlock>().Select(block => block.Text));
        Assert.DoesNotContain("private path", text);
        Assert.DoesNotContain("secret connection string", text);
        Assert.Contains(missing ? "not found" : "Could not read", text);
    }

    [Fact]
    public async Task Cancellation_reaches_the_read_service_without_becoming_a_tool_error() {
        var reads = new FakeReads();
        var tools = new CatalogueReadTools(reads, new HttpContextAccessor(), NullLogger<CatalogueReadTools>.Instance);
        using var cancellation = new CancellationTokenSource();
        await tools.GetPackage("package", cancellation.Token);
        Assert.Equal(cancellation.Token, reads.Token);
        reads.Failure = new OperationCanceledException(cancellation.Token);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => tools.GetPackage("package", cancellation.Token));
        cancellation.Cancel();
        var before = reads.Calls;
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => tools.GetPackage("package", cancellation.Token));
        Assert.Equal(before, reads.Calls);
    }

    private sealed class TestHost(WebApplication app, HttpClient http, FakeReads reads) : IAsyncDisposable
    {
        public HttpClient Http { get; } = http;
        public FakeReads Reads { get; } = reads;

        public static async Task<TestHost> CreateAsync(bool signedIn = true, bool denied = false) {
            var builder = WebApplication.CreateBuilder();
            builder.Logging.ClearProviders();
            builder.WebHost.UseTestServer();
            var reads = new FakeReads();
            builder.Services.AddSingleton<IDataCatalogueReadService>(reads);
            builder.Services.AddCatalogueMcp();
            builder.Services.AddAuthentication(TestAuthentication.SchemeName).AddScheme<AuthenticationSchemeOptions, TestAuthentication>(TestAuthentication.SchemeName, _ => { });
            builder.Services.AddAuthorization(options => options.AddPolicy("datacatalogue:access", policy => policy.RequireAuthenticatedUser().RequireClaim("catalogue-test-access", "allowed")));
            var app = builder.Build();
            app.UsePathBase("/catalogue");
            app.UseRouting();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapCatalogueMcp();
            await app.StartAsync();
            var http = app.GetTestClient();
            if (signedIn) { http.DefaultRequestHeaders.Add(TestAuthentication.UserHeader, "PROD\\alice"); }
            if (denied) { http.DefaultRequestHeaders.Add("X-Test-DenyAccess", "true"); }
            return new(app, http, reads);
        }

        public Task<McpClient> ConnectAsync() {
            var transport = new HttpClientTransport(new() { Endpoint = new Uri(this.Http.BaseAddress!, "/catalogue/mcp"), TransportMode = HttpTransportMode.StreamableHttp }, this.Http, ownsHttpClient: false);
            return McpClient.CreateAsync(transport);
        }

        public async ValueTask DisposeAsync() {
            this.Http.Dispose();
            await app.DisposeAsync();
        }
    }

    private sealed class FakeReads : IDataCatalogueReadService
    {
        public int Calls { get; private set; }
        public Exception? Failure { get; set; }
        public CancellationToken Token { get; private set; }
        public string? CurrentUser { get; private set; }
        public (string? Category, string? Geometry, int Page, int PageSize, bool? HasPipeline, string? PipelineId, bool Details) Filters { get; private set; }

        private Task<T> Result<T>(T value, CancellationToken token) {
            this.Calls++;
            this.Token = token;
            return this.Failure is null ? Task.FromResult(value) : Task.FromException<T>(this.Failure);
        }

        private static PagedResponse<T> Page<T>(int page = 1, int pageSize = 20) => new() { Items = [], Page = page, PageSize = pageSize, TotalCount = 0 };
        public Task<PagedResponse<PackageResponse>> GetPackagesAsync(string? category, string? geometry, int page, int pageSize, bool? hasPipeline, string? pipelineId, CancellationToken cancellationToken) => Result(Page<PackageResponse>(page, pageSize), cancellationToken);
        public Task<PackageResponse> GetPackageAsync(string packageId, CancellationToken cancellationToken) => Result(new PackageResponse { Id = packageId, Category = "WorkZone", FileName = "case.zip", AbsoluteUri = "database://case" }, cancellationToken);
        public Task<PagedResponse<PipelineResponse>> GetPipelinesAsync(int page, int pageSize, CancellationToken cancellationToken) => Result(Page<PipelineResponse>(page, pageSize), cancellationToken);
        public Task<PipelineResponse> GetPipelineAsync(string pipelineId, CancellationToken cancellationToken) => Result(new PipelineResponse { Id = pipelineId, DisplayName = "ENC", Description = "ENC", LastUpdatedUtc = DateTimeOffset.UnixEpoch }, cancellationToken);
        public Task<PagedResponse<WorkspaceListResponse>> GetWorkspacesAsync(string? pipelineId, string? owner, bool? unassigned, string? currentUser, int page, int pageSize, CancellationToken cancellationToken) {
            this.CurrentUser = currentUser;
            return Result(Page<WorkspaceListResponse>(page, pageSize), cancellationToken);
        }
        public Task<WorkspaceDetailResponse> GetWorkspaceAsync(string pipelineId, string workspaceId, CancellationToken cancellationToken) => Result(new WorkspaceDetailResponse(new(workspaceId, "Workspace", new DisplayScale(), null, null), "{\"rings\":[],\"spatialReference\":{\"wkid\":4326}}"), cancellationToken);
        public Task<PagedResponse<WorkspacePackageResponse>> GetWorkspacePackagesAsync(string pipelineId, string workspaceId, int page, int pageSize, CancellationToken cancellationToken) => Result(Page<WorkspacePackageResponse>(page, pageSize), cancellationToken);
        public Task<PackageGeometryResponse> GetPackageGeometryAsync(string packageId, CancellationToken cancellationToken) => Result(new PackageGeometryResponse(null, null), cancellationToken);
        public Task<PagedResponse<PackageGeometryItemResponse>> GetPackageGeometriesAsync(string? category, string? geometry, int page, int pageSize, bool? hasPipeline, string? pipelineId, bool includeDetails, CancellationToken cancellationToken) {
            this.Filters = (category, geometry, page, pageSize, hasPipeline, pipelineId, includeDetails);
            var aoi = JsonSerializer.SerializeToElement(new { xmin = 12.4, ymin = 55.5, xmax = 12.7, ymax = 55.8, spatialReference = new { wkid = 4326 } });
            return Result(new PagedResponse<PackageGeometryItemResponse> { Items = [new("package", "WZ-001-26", aoi, null)], Page = page, PageSize = pageSize, TotalCount = 6 }, cancellationToken);
        }
    }
}
