# DC-CANCEL-01 — Expected HTTP Client Cancellation Handling

## Baseline and scope

- Authoritative source: `f10d9fca276aab93fff645cf0d181efac3a5ef72`, exported with `git archive` (99/99 hashes verified).
- Previous known accepted DC-PERF-03 commit: `790fa8854473df21d47d8c9cc18f9282c2240a80`.
- Scope: middleware classification of client-aborted HTTP requests; no API contract, controller, authorization, ArcGIS, frontend, or dependency changes.

## Reproduction and observed behavior

During rapid Package selection, the accepted DC-PERF-03 browser log showed two `GET /api/v1/packages/{id}/geometry` requests and two `GET /api/v1/dispatcher/bindings` requests throwing `OperationCanceledException`. The Serilog request log recorded `500` Error stack traces while the outer HTTP completion logged `499`. The cancellations were expected; lengthy request durations coincided with Visual Studio debugger breaks and must not be used for performance comparisons.

## Implementation

`Configuration/ClientCancellationMiddleware.cs` is placed directly after `UseSerilogRequestLogging()` in `Configuration/RequestPipelineConfiguration.cs`. It catches an `OperationCanceledException` **only** when `HttpContext.RequestAborted.IsCancellationRequested`. Before returning to the outer request logger, it disables `IStatusCodePagesFeature` and sets status `499` when the response has not started. It does not write a response body to a disconnected client. Expected client disconnects therefore no longer propagate as server exceptions into Serilog's request middleware. If response headers already started, the HTTP status cannot be changed, but the expected cancellation is still suppressed.

Unrelated exceptions, and cancellation without an aborted HTTP request, remain unhandled by this middleware and proceed through the existing error pipeline. In Development, developer exception details remain available for actual errors; outside Development, existing exception handling continues to produce ProblemDetails for actual unhandled failures. The behavior of `CancellationToken` propagation in repositories/services is unchanged.

## Local verification (Windows x64)

From the repository root:

```powershell
dotnet build src/DataCatalogueAPI/DataCatalogueAPI.csproj -p:Platform=x64

dotnet test tests/DataCatalogueAPI.Tests/DataCatalogueAPI.Tests.csproj -p:Platform=x64 --filter "FullyQualifiedName~ClientCancellationMiddlewareTests"

dotnet test tests/DataCatalogueAPI.Tests/DataCatalogueAPI.Tests.csproj -p:Platform=x64 --filter "FullyQualifiedName~WorkspaceAndRoutingTests|FullyQualifiedName~PackageGeometryReadTests|FullyQualifiedName~InitializationAndSecurityTests"
```

The five focused unit tests are independent of ArcGIS runtime initialization. The broader integration suite still requires licensed ArcGIS Pro, its native libraries, and the complete sample geodatabase supplied by the local checkout.

## Browser acceptance

1. Start the API normally and load the DataCatalogue frontend. Confirm ordinary Jobs, Package details, bindings and map geometry requests still work.
2. Navigate to Package assignment. Open individual Packages and confirm data and geometries appear correctly.
3. Rapidly select four or more Packages while previous geometry/bindings requests are in flight. Use `Ctrl+F5` or a release/debug session without first-chance exception breaking if the debugger skews timings.
4. Check the API log: completed client-aborted requests may show informational `499`; there must be no `500` Error stack traces for `OperationCanceledException` caused by `RequestAborted`. The last selected Package remains displayed, and non-aborted requests continue to complete successfully.
5. Check Chrome DevTools Network for aborted requests and verify the browser does not render stale Package details. Confirm that an ordinary healthy request continues to return `200`.
6. Verify that a genuine server exception remains an Error through the non-aborted/other-exception unit tests; do **not** inject an artificial production fault.

## Verification status

Archive SHA-256 and 99/99 source-file hashes were checked in the implementation environment. .NET SDK and native ArcGIS runtime are unavailable there; no `dotnet build`, xUnit execution, or browser run is claimed. See the candidate delivery report for exact static checks and remaining local acceptance tasks.
