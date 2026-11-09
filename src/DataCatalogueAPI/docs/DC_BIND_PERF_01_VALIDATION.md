# DC-BIND-PERF-01 — Binding Read Optimization and Validation

## Scope and source

- Repository: `S-100-BlueStack/S100Services`
- Verified archive commit: `20c6c4ab3d79600bf12b76cdaa2f8e8207ffa6f5`
- Previously supplied UI commit: `b867f9e2b545a53d78b1f9fbd64af6fd72d17541`
- The export metadata explicitly states `git archive at baselineCommit`; all 89 files and the outer ZIP SHA-256 were verified before changes. The archive is not an independent proof of commit ancestry.
- Backend scope only: `GET /api/v1/dispatcher/bindings` and reused Workspace intersection logic. No route, DTO, auth policy, persistence, or override/comment changes.

## Original issue and implementation

A reported `GET /api/v1/dispatcher/bindings` took approximately 4,402 ms, of which approximately 4,383 ms were inside the controller action. The old implementation re-opened the Workspace coverage and Package AOI geodatabases and feature classes once per Workspace. The measured request itself did not include per-operation timers, so this is a code-level bottleneck hypothesis, not a measured root cause.

`WorkspaceService.GetIntersectionsAsync` now calls two batch read methods while executing one existing dispatcher action. The first reads each Workspace polygon through a shared read-only coverage handle, and the second executes the original spatial `Intersects` filter for each polygon through a shared Package AOI handle. Both repositories retain separate connections because their database configurations may differ. The handles are created and disposed on the ArcGIS dispatcher thread, without caching any geometries or spatial results between requests. A zero-Workspace Pipeline does not open a geodatabase for matching.

Cancellation is checked before the request, before each geometry read and before/after each spatial query. Missing geometry, invalid references, database errors, and cancellation still fail rather than returning a partial success. The Package AOI predicate still filters by the current GlobalID and `PackageCoverage` code; old AOI rows cannot be matched.

## Structured diagnostics

`Bindings read` reports request `Outcome`, `Bindings`, `AssignmentReadMs`, and `TotalMs`. `Workspace intersection read` reports per-Pipeline `Outcome`, `PipelineId`, `Workspaces`, `Matches`, `EventStateMs`, `ArcGisQueueWaitMs`, `WorkspaceGeometryMs`, `AoiIntersectionMs`, and `TotalMs`.

The event-state stage includes the Pipeline and Package event-store reads. Queue wait is measured just before scheduling the ArcGIS action until it starts on the dedicated thread. Geometry and intersection durations each include opening their respective geodatabase and feature class once. In failure paths a stage can be 0 if it never began; the total still reflects wall-clock time. The log fields are observations, not promises of a specific latency improvement.

## Local verification (Windows x64)

The complete repository with its existing restored dependencies, ArcGIS Core Host/license, and test geodatabase is required. The handoff intentionally excludes binaries, sample ZIPs, and local runtime configuration. Do not invent the results of these commands.

```powershell
# From repository root
# Build first, then execute the targeted ArcGIS integration tests.
dotnet build src/DataCatalogueAPI/DataCatalogueAPI.csproj -p:Platform=x64
dotnet test tests/DataCatalogueAPI.Tests/DataCatalogueAPI.Tests.csproj -p:Platform=x64 --filter "FullyQualifiedName~WorkspaceAndRoutingTests"
```

### Functional checks

1. Create one Package and a Pipeline containing two overlapping Workspaces and one non-overlapping Workspace. Read bindings twice and verify only the intersecting Workspaces appear, in Pipeline Workspace order.
2. Create a second Pipeline and a Pipeline with no Workspaces. Verify their results are independent and empty matches are legitimate.
3. Replace the Package AOI with a distant AOI through the existing geometry route. Read bindings again and verify the new intersection set appears without a reload or persistent cache invalidation.
4. Issue a pre-cancelled service request and confirm an `OperationCanceledException`, with no ArcGIS work started for that request.
5. Repeat existing create/remove/restore binding tests and confirm unchanged IDs, 201/200/204/404/409 behavior, and DTO shape.
6. Inject an invalid geometry reference in a controlled test environment. Verify the request fails and does not publish a partial binding list.

### Timing / load checks

1. Use a Package with representative numbers of Workspaces and Pipelines. Keep the same data and configuration for before/after measurements.
2. Run at least 10 sequential warm `GET /api/v1/dispatcher/bindings?packageId=...` requests (authenticated) and record median and 95th percentile response time. Do not include the first cold request in the warm comparison.
3. Correlate each `Bindings read` event with all associated `Workspace intersection read` events. Compare `AssignmentReadMs`, queue wait, geometry reads, and intersections. Verify that no extra Pipeline/Workspace operations were introduced.
4. Repeat under concurrent API traffic to identify dispatcher contention, remembering that the ArcGIS worker intentionally serializes operations.
5. Test in both supported geodatabase connection modes if available (`.geodatabase`, `.gdb`, or `.sde`); connection reuse should be assessed under production-like storage, not only a sample database.

## Environment and remaining uncertainty

`dotnet` is unavailable in the implementation environment, so a .NET build, xUnit execution, ArcGIS initialization and latency benchmark have not run here. The existing repository test suite has been supplemented but cannot substitute for a local Windows run. Database opening and spatial-query timings are not known until the new instrumentation is run locally. No performance improvement is claimed yet.
