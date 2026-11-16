# DC-PERF-BE-02 — Bounded combined Workspace overview

## Provenance and purpose

- Authoritative backend baseline: `bcd52ce9192b82f629a9fc2e1e20e1cf40a3b851`.
- Controlled previous candidate: DC-PERF-BE-01 ZIP, SHA-256 `0FE0B46ACD8E9A0F955297806492083522950545ED6E9F1E5CB3424EB246B201`.
- Client-visible scope: new, optional, versioned read endpoint. No changes to existing endpoints, authentication, mutation, persistent data or external dependencies.
- Source measurements: backend log of three HAR runs; 66 Workspace read requests, 53/50/49 ArcGIS dispatches, zero batches reusing geometry between Details and Packages for the same Workspace. Median native geometry lookup ~3 ms, Workspace scope setup ~120 ms, Package scope setup ~120 ms, queue wait often 0.6–0.9 s.

## API contract

`GET /v1/pipelines/{pipelineId}/workspaces/overview?page=1&pageSize=20`

- The controller retains the existing `datacatalogue:access` authorization policy.
- `page` is 1-based; `pageSize` is 1–20. Page beyond end returns an empty `items` array and the correct `totalCount`.
- `PagedResponse<WorkspaceOverviewResponse>` has `items` as `{ workspace, esriJSON, packages }`.
- `workspace` is the existing Pipeline Workspace metadata; `esriJSON` is the existing complete polygon JSON string; `packages` is the first 200-membership page using the existing Package AOI JSON response type.
- Each Workspace membership still filters by active direct Pipeline binding and **current** AOI reference. Each Workspace's matches are sorted by Package ID, as before.
- For more than 200 Packages in one Workspace, fetch subsequent pages via the unchanged per-Workspace membership endpoint; **do not** treat the first page as complete.
- `esriJSON: null` or `packages: null` indicates that the specific component could not be read. The client must retry the corresponding unchanged individual endpoint; it must not interpret these as valid empty geometry or membership.
- Package/Workspace event-state consistency is equivalent to existing separate queries, not an atomic snapshot across concurrent writes. On concurrent writes, clients should re-read the latest details before mutating.

## Native execution

One Pipeline event-state read determines Workspaces and their order. The backend selects at most 20 and enqueues one action on the existing single ArcGIS STA dispatcher. Within that action it calls `DispatchRepository.ReadWorkspaceGeometryBatch` once, then `PackageRepository.ReadWorkspacePackagePages` once for valid Workspaces; JSON DTOs are fully materialized on the STA thread. This avoids the repeated scope openings observed in the HAR logs. No ArcGIS object, connection, feature handle or event store aggregate is exposed to the HTTP serializer.

The limit of 20 prevents one request from monopolizing the ArcGIS dispatcher indefinitely. It is a starting bound, not a performance guarantee; measure its impact on competing requests. A canceled page does not publish a successful result. Geometry/Package failures for individual Workspaces are isolated as unavailable components; exceptions are logged on the server.

## Local verification (required)

The candidate was authored in an environment without a Windows x64/ArcGIS CoreHost test runtime or .NET SDK. These tests have **not** been executed here:

```powershell
# From the repository root, on Windows x64 with .NET 10 and licensed ArcGIS Pro:
dotnet build src/DataCatalogueAPI/DataCatalogueAPI.csproj -p:Platform=x64
dotnet test tests/DataCatalogueAPI.Tests/DataCatalogueAPI.Tests.csproj -p:Platform=x64 --filter "FullyQualifiedName~WorkspaceAndRoutingTests"
```

Check these cases against the old endpoints: two Pipelines must not cross-leak memberships; distant Workspaces have empty but non-null Package pages; empty and out-of-range pages work; invalid `pageSize` receives HTTP 400; pre-canceled reads do not publish; a missing Pipeline receives 404. Validate AOI and polygon spatial references. Exercise middleware cancellation with the single ArcGIS dispatcher under load.

## Measured acceptance steps

1. Confirm the backend ZIP preimage hashes match the local working tree containing DC-PERF-BE-01; do not apply over an unrelated later backend change.
2. Build and run the focused tests above. Run the new route for each Pipeline and compare its Workspace IDs, exact geometry, `totalCount`, Package IDs, AOI JSON and order to the existing 66 GET results. Verify the first page of every Workspace contains all members if `totalCount <= 200`.
3. Verify the new `Workspace overview read` logs show one ArcGIS queue wait, one Workspace scope setup and one Package scope setup per page. Confirm no CoreHost reinitialization.
4. Integrate the new endpoint into the DataCatalogue **services/adapters**, with bounded fallback on null components, additional Package pages and safe cancellation/generation ownership. Do not embed contract normalization in UI components.
5. Re-run three cold and three warm browser HAR captures in comparable conditions, then compare with 17.23 s cold and 14.66/14.59 s warm; also measure frontend readiness independently.
6. Roll back by returning to the existing individual endpoints if coverage, memberships, cancellation or authorization differ.

## Known limits

- Frontend is not integrated; a backend-only candidate cannot reduce current HTTP request counts until the frontend changes.
- Same Workspace may have more than 200 Packages; the overview deliberately returns only the first page and needs the legacy follow-up path.
- One large request may delay unrelated ArcGIS work; 20 Workspaces is a bounded but unbenchmarked limit.
- Distinct read scopes can observe different revisions under concurrent mutation, as in the current API. No atomic geodatabase transaction across Workspace and Package reads is claimed.
- Partial error responses require frontend fallback; do not render them as authoritative empty memberships.
