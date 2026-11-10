# DC-PERF-03 — Bounded Workspace Packages Read Batching

## Source, scope and previous measurements

- Authoritative commit-pinned baseline: `dfd38deb3990c184f6c096486650364d8c7802c3`.
- Previously accepted performance commit: `ef93e3b914c164bc6a08ebbe0fe11eb28e9e1ec8` (DC-PERF-02).
- Handoff verification: outer ZIP SHA-256 and all 240 source checksums matched. The previous commit is an ancestor of the baseline; no exported DataCatalogue file differs from that commit.
- These are implementation-candidate notes, not evidence of a new measured speedup.

DC-PERF-02 local testing reported all 10 focused integration tests passed and 20/20 Workspace-Packages HTTP requests returned 200. With four frontend workers, the 20 requests averaged approximately 1,333 ms (range 642–1,736 ms) and mean ArcGIS queue wait was approximately 924 ms. Mean Workspace geometry time was ~168 ms, spatial query ~142 ms, and Package hydration ~15 ms. These timings came from a particular sample-data run; they are not a controlled baseline for a different dataset.

## Implementation

- The existing `GET /api/v1/pipelines/{pipelineId}/workspaces/{workspaceId}/packages` route, authorization policy, query validation, response envelope and JSON schema are unchanged. The frontend retains its four-worker load and abort/generation handling; no extra logical HTTP requests are introduced.
- `WorkspaceService` continues to validate the Pipeline/Workspace pair directly from the event state **before** submitting an ArcGIS read. The new singleton `WorkspacePackageReadBatcher` groups up to four independent reads arriving within a six-millisecond collection window.
- One `ArcGisDispatcher.ExecuteAsync` action processes each bounded batch on the existing STA thread. The Workspace repository reuses one Dispatcher geodatabase/feature-class scope for the batch's Workspace polygon reads. The Package repository reuses one Package geodatabase/feature-class scope for its spatial queries and current AOI hydration. The two repositories retain their independent configured data sources.
- Each read uses its own Pipeline ID, Workspace geometry reference, one-based page and page size, active binding filter, and cancellation token. Results use the existing ordinal Package-ID ordering. The Package repository still rejects historical AOI rows by matching each candidate against the current projected `PackageState.GeometryRef`. Only page rows are hydrated, and AOIs preserve their stored spatial references.
- Geometries, ArcGIS feature classes and geodatabase handles remain on the STA thread. Only raw JSON strings leave the dispatcher; `JsonElement` parsing remains outside it.
- Cancellation is registered for each request, including while it is waiting to be batched or queued. A canceled request cannot receive a successful response. Workspace geometry and per-page query/hydration errors are isolated to their own request; failure opening a **shared** read scope affects the batch because all reads depend on that scope. No cross-request result cache is introduced.
- Pending batches are cleared on disposal. The generation counter prevents an expired collection timer from submitting the next batch twice. The six-millisecond window and batch size are intentionally bounded to avoid long hold times on an otherwise shared ArcGIS worker.

## Timing fields

`Workspace packages read` retains the previous fields and adds:

| Field | Interpretation |
| --- | --- |
| `BatchSize` | Number of non-canceled reads processed in the same dispatcher action (1–4). |
| `BatchWaitMs` | Time from admission to the batch until the dispatcher call is submitted; includes the bounded collection window. |
| `ArcGisQueueWaitMs` | Time between submission of the batch dispatcher action and the start of its execution on the ArcGIS thread. Shared by the batch, not additive across requests. |
| `WorkspaceScopeMs` | **Shared** Workspace connection/feature-class setup time for that batch. Not an independently incurred cost per request. |
| `WorkspaceGeometryMs` | Per-request Workspace polygon lookup in the shared scope. |
| `PackageScopeMs` | **Shared** Package connection/feature-class setup time for that batch. Not additive across requests. |
| `SpatialQueryMs` | Per-request spatial query, Pipeline binding/current-AOI filtering and ordinal sort. |
| `PackageHydrationMs` | Per-request current AOI geometry read for the returned page. |
| `ResponseBuildMs` | Per-request DTO/`JsonElement` construction after ArcGIS dispatch. |
| `TotalMs` | Per-request service wall time, including batch wait and dispatcher queue wait. |

`Workspace packages result executed` remains MVC result execution including response writing. `Request finished` is the outer HTTP wall time. Stage values may be zero on early validation, cancellation or shared-scope failure. **Do not sum shared scope fields across HTTP requests** to derive an ArcGIS total; measure individual batch actions or map loading wall time instead.

## Windows x64 verification

From the repository root, using the local ArcGIS Pro CoreHost, licensed runtime and test geodatabase template:

```powershell
# Clean first to ensure that a ZIP replacement is recompiled.
dotnet clean tests/DataCatalogueAPI.Tests/DataCatalogueAPI.Tests.csproj -p:Platform=x64
dotnet build src/DataCatalogueAPI/DataCatalogueAPI.csproj -p:Platform=x64
dotnet test tests/DataCatalogueAPI.Tests/DataCatalogueAPI.Tests.csproj -p:Platform=x64 --filter "FullyQualifiedName~WorkspaceAndRoutingTests"
```

New regression tests exercise four simultaneous per-Workspace requests spanning two Pipelines, empty and populated memberships, current AOI JSON, concurrent pages 1–4 with stable ordinal order, isolation of a missing Workspace from a valid request, and cancellation of one read while the ArcGIS dispatcher is deliberately occupied by a bounded test gate. Existing tests cover an already canceled request, refreshed AOI membership, Pipeline scoping and historical reference exclusion. Also verify cancellation during a live burst in the browser; client disconnect/network abort behavior still requires manual verification.

### Browser checks

1. Start API and frontend with the same ENC and Paper Chart sample data, and open Jobs main map with both Pipelines and every Workspace enabled.
2. Compare Package memberships, contextual Jobs counts, map geometry, Pipeline filters, Package popup details and overlapping Workspaces with the previous accepted application. Refresh after changing active Pipelines and confirm no stale Jobs or duplicated contextual identities.
3. With DevTools Network and server console open, reload at least 10 times after warm-up. Confirm the same 20 Workspace-Packages calls, all returning HTTP 200, with no unexpected 400/404/500. Verify log `BatchSize` is often greater than one during the burst (otherwise the workload did not exercise batching).
4. Rapidly navigate away, change Workspace visibility and reload while requests are in flight. Canceled requests must not overwrite newer Jobs or turn into HTTP 200 partial results. One invalid Workspace should retain its normal 404 without affecting unrelated Workspace reads.
5. Verify a Package AOI replacement with the existing valid geometry API changes Workspace memberships and restoring the original AOI restores them. Do not compare old references or synthetic geographies.

### Apples-to-apples performance benchmark

Compare the accepted DC-PERF-02 commit and the DC-PERF-03 candidate with **identical** committed sample fixtures, Pipeline/Package bindings, server configuration, authenticated client and warm-up behavior. Prefer preserving the sample database and deterministic IDs across runs. Run ten or more warm page-load bursts with both Pipelines enabled, record DevTools overall Jobs ready time and the per-request median/p95 HTTP duration; separately run ten sequential Workspace requests with zero and nonzero Package matches. Record `BatchSize`, `BatchWaitMs`, `ArcGisQueueWaitMs`, `WorkspaceScopeMs`, `SpatialQueryMs`, `PackageHydrationMs` and outer request duration. If average queue wait decreases but map load wall time does not, report that distinction; do not claim a speedup from reduced queue wait alone. Watch other ArcGIS geometry endpoint latency for starvation during a four-read batch.

## Risks / constraints

- The in-memory scheduler coalesces requests opportunistically. A solitary request waits up to six milliseconds before its dispatcher operation is submitted. If requests arrive farther apart than the window, batch size remains one, and a small overhead may result.
- The dispatcher is still a single STA thread. Batching reduces repeated opening of Workspace and Package read scopes; it does **not** parallelize ArcGIS calls or eliminate spatial queries per Workspace. Very large batches could starve other ArcGIS operations, hence the limit of four.
- Changes to active Package bindings while a batch is executing follow the same live projection/current-AOI checks as individual requests; the HTTP endpoint does not promise a multi-Workspace snapshot transaction.
- The archive does not include Windows/.NET/ArcGIS runtime or restored NuGet packages. No .NET build, xUnit test, API runtime or browser performance measurement was possible in this environment; local Windows verification is required before acceptance.
