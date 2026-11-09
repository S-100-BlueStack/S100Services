# DC-PERF-02 — Workspace Packages Read Performance

## Authoritative source and scope

- Repository: `S-100-BlueStack/S100Services`
- Pinned implementation baseline: `6ef4ec5406217396b1bbb4bcbab09a8471cf0ec1` (`git archive` handoff)
- Previously accepted optimization: `97b0bb62d3a95459d0d6e0db70a94aaa03f9f52a` (`DC-BIND-PERF-01`)
- Integrity: source handoff outer ZIP and all 164 exported source-file SHA-256 values were verified.
- Current implementation is a **candidate** until Windows/.NET/ArcGIS verification and local acceptance.

The handoff's `changes-since-perf-commit.txt` lists no changed paths in the targeted subtree. The later merge commits primarily affect ProductCatalogue and do not authorize changes to its code. Do not infer subsequent Git state from this snapshot.

## Evidence and issue

The Nov 9, 2026 local API log showed up to four concurrent Workspace packages requests for the main map. Successful `GET /api/v1/pipelines/{pipelineId}/workspaces/{workspaceId}/packages` requests took approximately **779–1,742 ms** during that burst. Those are end-to-end HTTP timings with shared ArcGIS dispatcher contention, **not** measurements of the individual spatial operations.

The pinned frontend `createLiveJobServiceAdapter` still uses up to four workers, and each reads all pages of every selected Workspace, with Package metadata hydrated separately. The endpoint also returns Esri JSON AOIs, even though the current Jobs adapter only consumes Package IDs and short IDs. Omitting AOIs would require a verified API contract change, so the response is retained.

Before this candidate, the API read each Workspace polygon once, ran an indexed spatial Package AOI query, and then reopened the Package geodatabase **for every returned Package** to hydrate the AOI. These operations were serialized by the existing STA `ArcGisDispatcher`.

## Optimization and behavior preservation

- One dispatcher action still owns the complete ArcGIS read and all ArcGIS objects are disposed on that thread.
- Workspace coverage is read through `DispatchRepository` using its own configured geodatabase.
- The Package spatial query and returned-page AOI reads now **share one PackageRepository geodatabase connection** during the same request. Other Package geometry endpoints keep their original read behavior.
- The existing spatial `Intersects` filter, `PackageCoverage` code check, active Pipeline binding check, Package ID ordinal ordering, one-based pagination and **current** AOI reference filtering are preserved. Historical AOI rows cannot satisfy membership after geometry replacement.
- Only Packages in the requested page are hydrated. The Package AOIs retain their stored spatial references. Invalid or missing geometry still fails the request; it is never replaced with an empty AOI.
- The service materializes `JsonElement` objects **after** leaving the ArcGIS dispatcher, so plain JSON parsing does not block subsequent ArcGIS reads. It still occurs before returning a successful result.
- Existing cancellation, 400/404 behavior, `datacatalogue:access` authorization, response type and endpoint path remain unchanged.
- No cross-request caching, background processing, new endpoints or dependencies have been introduced. Frontend request concurrency remains four until the timing evidence justifies changing it.

## Timing fields

The service writes `Workspace packages read` with one structured event per request, including failures and cancellations:

| Field | Interpretation |
| --- | --- |
| `EventStateMs` | Pipeline event-store fetch and Workspace lookup |
| `ArcGisQueueWaitMs` | From scheduling the dispatcher call until it begins; may include dispatcher initialization |
| `WorkspaceGeometryMs` | Read of one Workspace polygon, including its geodatabase open |
| `SpatialQueryMs` | Package spatial lookup, Package repository connection open, binding/current-reference filtering and sorting |
| `PackageHydrationMs` | Materialization of AOIs for the requested page, using the same Package connection |
| `ResponseBuildMs` | DTO construction and JSON string to `JsonElement` parsing after the dispatcher action |
| `TotalMs` | Complete service operation, including time not shown in individual fields |

`Workspace packages result executed` logs `ResultExecutionMs` from an MVC result filter for the selected endpoint. This measures **result execution, JSON serialization and response writing together**; it is not a pure serializer-only metric. ASP.NET HTTP middleware and MVC's action logging provide the outer end-to-end duration. Stage durations can remain zero if the request fails before that stage.

## Local verification — Windows x64

From the repository root, with restored dependencies, ArcGIS Pro Core Host, valid license and the local test template:

```powershell
dotnet build src/DataCatalogueAPI/DataCatalogueAPI.csproj -p:Platform=x64
dotnet test tests/DataCatalogueAPI.Tests/DataCatalogueAPI.Tests.csproj -p:Platform=x64 --filter "FullyQualifiedName~WorkspaceAndRoutingTests"
```

Focused regression tests verify current AOI hydration, stable page sizes and ordering, empty out-of-range pages, Pipeline scoping, removal/restoration of memberships, replacement of AOIs (including historical-row exclusion), and cancellation before dispatcher queuing. Do not claim success until executed locally.

### Browser checks

1. Start the API and DataCatalogue in the same configuration used for the original measurements.
2. Open the Jobs main map with the ENC and Paper Chart Pipelines and all their Workspaces enabled.
3. Verify that each Workspace's Package list and resulting Jobs count match the previously accepted behavior. In particular, verify that Packages bound to another Pipeline do not appear and that overlapping Workspaces retain separate contextual Jobs.
4. Navigate between Packages and the assignment view. Confirm there are no unexpected 400/404/500 errors, no missing map geometries and no new duplicate Jobs.
5. Replace one Package's AOI with a distant valid polygon using the existing API, refresh, and confirm that Workspace membership reflects the **current** AOI. Restore the AOI and verify it returns.
6. Reload with DevTools network throttling or abort the page load. A stale or canceled operation must not publish a successful partial Jobs list.

### Before/after timing protocol

1. Use the same workspace, dataset size, pipeline bindings, server configuration and authenticated client for both baselines. Do not compare an empty binding list to a populated Workspace or cold startup to warm steady state.
2. Capture at least 10 warm sequential requests for one Workspace with matches and one Workspace without matches. Record HTTP latency median and p95. Then repeat the original four-concurrent Workspace pattern (at least 10 runs) and record overall Jobs loading time.
3. Correlate `Workspace packages read`, `Workspace packages result executed` and the ASP.NET request log by Pipeline/Workspace and timestamp. Inspect `ArcGisQueueWaitMs` first: four concurrent calls share one ArcGIS worker, so per-request wall time may mostly be waiting.
4. Compare `SpatialQueryMs` and `PackageHydrationMs`. Read-scope reuse can help nonempty pages; **empty result pages may see little or no improvement** because they already required no AOI hydration.
5. Watch for HTTP 500, cancellation, missing Package AOI, empty/duplicate pages, and changes in result counts or page ordering. If queue wait remains the main bottleneck, investigate frontend request scheduling separately rather than parallelizing ArcGIS SDK work.
6. If available, benchmark against a version without this candidate using the *same* test data. A difference from the earlier 779–1,742 ms log alone is directional evidence, not a controlled speedup percentage.

## Environment and open questions

The handoff includes no usable Windows ArcGIS runtime or restored .NET toolchain. The candidate has not been compiled or benchmarked in this environment. Changes to Package read scopes are expected to reduce repeated geodatabase opening on populated pages, but the actual effect on total map loading and STA queue contention is unmeasured. Preserving the current response payload is intentional pending an explicit API optimization contract.
