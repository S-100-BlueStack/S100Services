# Read-only DataCatalogue MCP

The API hosts a stateless MCP Streamable HTTP endpoint at `<API base URL>/mcp`.
For an IIS application mounted at `/DataCatalogue`, use
`https://<server>/DataCatalogue/mcp`. The endpoint is independent of REST API
versioning. Existing REST routes and response contracts are unchanged.

The transport uses the official `ModelContextProtocol.AspNetCore` SDK, pinned
to version `2.4.0`. There are no session IDs, server-initiated requests, legacy
SSE endpoints, resource subscriptions, prompts, or mutation tools. The SDK handles
protocol negotiation, discovery, tool schemas and JSON-RPC transport; HTTP POST
requests carry read-only tool calls rather than catalogue changes.

## Authentication

Every MCP HTTP request requires the existing Windows Negotiate authentication
and `datacatalogue:access` authorization policy. Anonymous requests are challenged;
authenticated users outside the configured access groups receive 403. No new
credentials, anonymous access or alternative authentication scheme is introduced.

The client must support Windows Negotiate and reach the API over HTTPS. A hosted
MCP client that requires OAuth/Bearer authentication cannot use this endpoint
directly. Adding this server does not automatically connect it to ChatGPT or
another client.

`owner="current"` uses the authenticated HTTP request identity. The tool schema
does not expose a `currentUser` parameter. Read-only annotations describe the
tools, while the explicit tool allowlist and query-only service contract enforce
which operations clients can call. Existing write-capable REST endpoints retain
their existing authorization and behavior.

## Tools

| Tool | Parameters | Result |
| --- | --- | --- |
| `list_packages` | `category?`, `geometry?`, `page=1`, `pageSize=20`, `hasPipeline?`, `pipelineId?` | Package metadata, active pipeline bindings and page totals |
| `get_package` | `packageId` | One package with all active pipeline bindings |
| `list_pipelines` | `page=1`, `pageSize=20` | Pipelines with workspace summaries and page totals |
| `get_pipeline` | `pipelineId` | Current pipeline state and workspace ownership |
| `list_workspaces` | `pipelineId?`, `owner?`, `unassigned?`, `page=1`, `pageSize=20` | Workspaces with their pipeline IDs, ownership and page totals |
| `get_workspace` | `pipelineId`, `workspaceId` | Workspace summary and complete Esri JSON polygon |
| `list_workspace_packages` | `pipelineId`, `workspaceId`, `page=1`, `pageSize=20` | Bound packages intersecting the workspace, including simple AOIs |
| `get_package_geometry` | `packageId` | Current AOI and nullable `detailedGeometry` with points, curves and surfaces |
| `list_package_geometries` | Same filters as `list_packages`, plus `includeDetails=false` | Package IDs, current AOIs and optional detail groups, with page totals |

All tools advertise `readOnlyHint=true`, `destructiveHint=false`,
`idempotentHint=true`, and `openWorldHint=false`, with structured output schemas.
Page sizes are bounded to 1–200; page numbers start at 1. Package and pipeline
IDs are catalogue IDs from the listing tools, not display names or short IDs.
Workspace IDs are GUIDs and must belong to the supplied pipeline.

`geometry` is an Esri JSON envelope or polygon **string**, with an explicit
`spatialReference.wkid` or `wkt`, limited to 16,384 characters. Existing ArcGIS
queries project it as necessary and intersect the current package AOIs. Only the
selected page is hydrated when coordinates are requested. Detailed geometry is
omitted by default from geometry lists, and all coordinate groups retain their
stored spatial references. Workspace details retain the REST `esriJSON` string;
package AOIs and detail groups are JSON objects.

Lists use the existing subscription projections and may briefly lag a new event.
Single-package and single-pipeline reads load their current event state. No MCP
call repairs geometry, creates sample data, claims a workspace, binds a package,
uploads a file or appends catalogue events.

Validation and missing-resource failures return MCP tool errors (`isError=true`).
Unexpected failures are logged server-side and return a generic message without
exception details. Cancellation propagates through existing readers and ArcGIS
dispatching. Existing API startup/sample initialization is unchanged and is not
triggered by MCP requests.

## Windows client example

Use the `ModelContextProtocol` NuGet package version `2.4.0` in a client project.
Run as a Windows account authorized to access DataCatalogue:

```csharp
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;

using var handler = new HttpClientHandler { UseDefaultCredentials = true };
using var http = new HttpClient(handler);
await using var transport = new HttpClientTransport(new() {
    Endpoint = new Uri("https://<server>/DataCatalogue/mcp"),
    TransportMode = HttpTransportMode.StreamableHttp,
}, http, ownsHttpClient: false);
await using var client = await McpClient.CreateAsync(transport);

var tools = await client.ListToolsAsync();
var result = await client.CallToolAsync("list_packages", new Dictionary<string, object?> {
    ["category"] = "WorkZone",
    ["page"] = 1,
    ["pageSize"] = 20,
});
foreach (var block in result.Content.OfType<TextContentBlock>()) {
    Console.WriteLine(block.Text);
}
```

For an AOI around Copenhagen, pass this string as the `geometry` argument:

```json
{"xmin":12.4,"ymin":55.5,"xmax":12.7,"ymax":55.8,"spatialReference":{"wkid":4326}}
```

## Implementation and verification

`McpConfiguration` registers the transport and maps the protected endpoint.
`CatalogueReadTools` is the explicit allowlist, validates arguments and translates
query failures to safe MCP errors. `IDataCatalogueReadService` exposes only reads;
`DataCatalogueReadService` delegates to existing repositories, event state,
`WorkspaceQueryService`, `WorkspaceService`, and `PackageGeometryService` without
calling controllers or creating alternate repositories.

`McpReadOnlyTests` uses TestServer and the actual MCP SDK transport with a
deterministic fake read service. It covers authorization, discovery, tool schemas,
all nine tools, IIS PathBase, argument validation, filter forwarding, authenticated
ownership, structured Esri JSON, mutation rejection, safe errors and cancellation.
It does not require a shared database or exercise ArcGIS native geometry queries.

On the configured Windows development machine:

```powershell
dotnet test tests/DataCatalogueAPI.Tests/DataCatalogueAPI.Tests.csproj -p:Platform=x64 --filter FullyQualifiedName~McpReadOnlyTests
```

Then smoke-test the deployed HTTPS endpoint with an authorized Windows MCP client
and compare packages, pipeline/workspace IDs and geometry to their REST reads.
