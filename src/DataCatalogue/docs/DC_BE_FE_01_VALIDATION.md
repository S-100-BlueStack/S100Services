> **Historical v1 candidate.** The unscoped `Layers` popup and its browser
> steps were rejected during the 2026-11-12 review. Use
> [DC_BE_FE_02_VALIDATION.md](DC_BE_FE_02_VALIDATION.md) for the corrected
> Pipeline-scoped Main Map behavior. The Package Assignment summary steps
> below remain relevant.

# DC-BE-FE-01 — Backend Assignment Summaries and Package AOI Overview

**Frontend baseline:** `01ad3b4646f66143f01db09b59cd47dda57795f0`  
**Backend contract source:** `313ea65a4fc07276da587a3f0acb038b72190e66`  
**State:** Implementation candidate; local full check, deployed API and browser acceptance pending.

## Implemented

1. Package list pages now consume `hasPipeline` and `pipelineBindings` from the verified `GET /v1/packages` contract. Active Pipeline assignments are visible without individual binding reads per Package. `Assigned` means at least one active direct Pipeline binding, not Workspace intersection or Job completion. Missing summary fields remain `Unknown`; partial or contradictory summaries fail visibly.
2. Pipeline names are resolved from the existing Pipeline catalogue once a visible page contains bound Pipeline IDs. Name resolution does not block the Package page, and an unsuccessful lookup leaves the IDs visible. Selected-Package binding reads, Save, independent mutations, uncertain-write reconciliation and Workspace preview remain unchanged.
3. The live main map has a compact **Layers** control with an opt-in **Package AOIs** layer. It reads `GET /v1/packages/geometry` with `includeDetails=false`, page size 200, uses validated stored Esri polygons, and places a transparent overview GraphicLayer below existing operational overlays. No Feature Service is needed.
4. The overview starts disabled. Enabling loads the catalogue once; hiding keeps the last successful graphics for reuse, and **Refresh AOIs** explicitly fetches again. The entire set replaces previous graphics only after successful complete paging. Total-count changes, repeated identities, missing pages, authentication failures, invalid geometries and limit violations are errors, not empty success. Superseded and teardown operations cannot publish.
5. The overview is capped at 5,000 Package AOIs to avoid unbounded browser graphics. This is an explicit limitation rather than silent truncation; a future viewport/filtered overview may be needed for larger catalogues.

## Local verification

From `src/DataCatalogue`:

```powershell
npm run format
npm run check
```

The context archive omitted the installed frontend dependencies and some main-map modules, so these commands are a required local gate. They were not completed in the implementation environment.

## Browser acceptance

1. Run the API build containing `313ea65a...` with real authorization. Verify a `GET /v1/packages?pageSize=2` response includes `hasPipeline` and `pipelineBindings`. Confirm an unassigned Package has `false` and an empty array, and that a Package bound to multiple Pipelines has both IDs even with no intersecting Workspaces.
2. Open **Package Assignment**. Confirm newly loaded Packages show `Assigned` or `Not assigned` before selection. Confirm Pipeline names resolve, the list does not issue one `GET /dispatcher/bindings` per row, and server-side Assigned/Not assigned filters still work on different pages.
3. Select a Package, Save a Pipeline binding, and verify the selected row and subsequent list refresh. Fail an uncertain Save and verify the row says `Unknown` until read-only reconciliation. Check rapid Package changes, pagination, cancellation and tab navigation.
4. Open **Main Map → Layers**, enable **Package AOIs**, and confirm exactly one geometry-page request for up to 200 AOIs, then two for 201–400. Verify there are **no** per-Package geometry or metadata requests from the overview.
5. Confirm every overview polygon is drawn with its stored Esri JSON spatial reference, and that Workspace layers and selected Package highlights remain visible above it. Disable and re-enable without a new fetch; use **Refresh AOIs** to request fresh data.
6. Test network offline, 401/403, 500, invalid spatial reference, empty catalogue, missing page, and changes during pagination. The previous valid graphics must remain during a failed refresh; the Layers panel must report an error.
7. Switch light/dark with the Layers panel open, change basemaps, navigate to Package Assignment and back, use keyboard Tab/Space/Enter/Escape, and verify map lifecycle cleanup (no duplicate GraphicsLayers or requests).
8. Test a deployment hosted under an IIS subapplication. The existing API client applies its configured base path exactly once; the new route is `/v1/packages/geometry` relative to that base.
9. Run a representative large dataset. The overview stops with a clear message above 5,000 AOIs rather than silently omitting items. Collect actual network and map-rendering timings before raising or removing that limit.

## Known gaps and preservation

- The new geometry page is **not** a Workspace membership or Job batch endpoint. The existing main-map Packages loader still performs separate Workspace membership and Package metadata reads. Do not merge contextual Jobs by Package ID. `PAGE-02` remains open.
- Manual effective Workspace overrides, persisted binding comments, persisted Job status/history, global name search and selected-Package geometry behavior remain separate scopes.
- There is no cross-page snapshot token in the backend contract. A constant `totalCount` cannot prove that pages have not been reordered concurrently. The client rejects detectable inconsistencies, but cannot guarantee atomicity across pages.
- The UI uses native, application-owned controls and a public Calcite icon inside `MapView.ui` to avoid undocumented widget/shadow-DOM integration. `CALCITE_USAGE_LOG.md` must be reconciled with the current authoritative file before commit because it was not included in the export archive.
- The backend commit was verified as source, **not** as deployed. Browser acceptance and live auth remain required.
