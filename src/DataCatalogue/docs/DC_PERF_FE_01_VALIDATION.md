# DC-PERF-FE-01 — Main Map combined Workspace overview integration

## Controlled inputs and scope

- Frontend baseline: `bcd52ce9192b82f629a9fc2e1e20e1cf40a3b851`.
- Context export: `DC-PERF-FE-01-Frontend-Context-bcd52ce9-20261116-114920-429.zip`.
- Context SHA-256: `FAB846189EB825830873E10E6ABDB150749F3605A11458B45E9A0BB60FD0679E`.
- Backend candidate: `DC-PERF-BE-02-CombinedWorkspaceOverview-bcd52ce9-20261116(1).zip`.
- Backend SHA-256: `ED38EFC038CCC0CDFD90FE36BC8ABFECBBD8036426DC23EE61E18946F565D460`.
- Preserve local, uncommitted edits to `docs/BACKEND_CONTRACTS.md` and
  `docs/PROJECT_TRACKER.md` from the context export.
- Scope is frontend consumption only. No backend, authentication, dependency,
  API contract, persisted mock status, Package assignment UI or ArcGIS SDK change.

## Runtime read ownership

1. Live `createPipelineVisibility` retains catalogue generation, cancellation,
   stale-response rejection and the existing Pipeline/Workspace grouping UI.
   Its injected `loadWorkspaceOverview` reader first fetches the existing
   Pipeline list, then the new per-Pipeline overview pages (zero-based in the
   normalized service, one-based on the wire). Pages are bounded to 20
   Workspaces; two Pipeline readers may execute concurrently. Duplicate IDs,
   changing totals, wrong Pipeline identity and incomplete pages fail visibly.
2. `createCatalogueService.workspaceOverview` normalizes each
   `{ workspace, esriJSON, packages }` entry, preserving Pipeline context and
   distinguishing nullable components from empty valid Package membership.
3. The accepted overview generation is distributed to both the map controller
   and `liveJobServiceAdapter` without another overview request. Initial
   `loadJobs` consumes the embedded first-200 Package page. For `packages: null`
   it calls the existing Workspace membership route; when `totalCount > 200`,
   only the remaining pages are loaded from that route. Cross-page consistency
   and Package ID uniqueness checks remain in `collectPages`.
4. The map's `createWorkspaceGeometrySource` consumes an overview polygon only
   when the `(pipelineId, workspaceId)` and geometry-reference context match.
   It normalizes/validates that Esri JSON using the existing polygon adapter.
   `esriJSON: null` or a changed geometry reference triggers the existing
   Workspace detail route; a malformed non-null polygon reports a scoped map
   error, not a fabricated footprint. The overlay still controls SDK rendering,
   generation ownership and disposal.
5. The overview is used for the **first** Jobs membership read only; manual
   Packages refresh continues querying current Workspace membership. A new
   catalogue reload replaces the entire overview generation; map visibility
   toggles do not trigger additional reads. Assignment-page endpoints remain
   unchanged. No long-lived or cross-refresh membership cache is introduced.

## Environment and verification

The uploaded 281-file frontend export passed every manifest SHA-256/length check.
The local source snapshot records two dirty documentation files; they were not
reconstructed from memory. Backend candidate checksum also matched.

The available Linux/Node environment has no `node_modules`, ArcGIS SDK package
or source `package-lock.json` (excluded by the exporter). The full project gate
`npm run check` cannot complete because `prettier` is not installed. The direct
Node tests and `node --check` run independently. Actual numeric test totals and
results are recorded in the accompanying delivery report. Do not infer a passing
full check from focused tests.

## Local verification (required before commit)

From `src/DataCatalogue`, against the deployed DC-PERF-BE-02 backend:

```powershell
npm run format
npm run check
```

Test the live Main Map (not the separate Package assignment map) with browser
Network recording enabled, Disable cache selected, and preserve log across
navigation only when investigating transitions:

1. Cold load with 15 ENC and 18 Paper Chart Workspaces. Expect one Pipeline list
   and **two** `GET /v1/pipelines/{id}/workspaces/overview?page=1&pageSize=20`
   requests. In the no-failure sample, expect no individual Workspace detail
   or membership GETs during this first load. Package metadata/AOI overview
   calls remain separate and are not part of the 66-request reduction.
2. Verify all 33 Workspace outlines, Pipeline visibility, open-Package color
   counts, Pipeline/Workspace filters, contextual Package identity, exact
   Severity, mock status persistence across list refresh, and selected Package
   geometry. Switch Pipeline/Workspace filters without new geometry reads.
3. Refresh the Packages list manually and verify membership is read anew; a
   new server-side Package binding must be reflected after refresh. This
   intentionally uses existing member routes and must not reuse the startup
   snapshot as a stale membership cache.
4. Create more than 20 Workspaces in one Pipeline (or use a test fixture) and
   verify `page=2`, no missing Workspaces and correct counts. Create more than
   200 intersecting Packages in one Workspace (or use a fixture) and verify
   subsequent membership `page=2&pageSize=200` without rereading page one.
5. Return `esriJSON: null` for one Workspace: confirm one targeted geometry
   retry and truthful partial/error map status if that retry fails. Return
   `packages: null` independently: confirm one targeted membership retry and
   no successful partial Packages list if that retry fails. Valid
   `packages.items=[]`, `totalCount=0` must not trigger a retry.
6. Deny or remove the overview endpoint and confirm a visible live catalogue
   error; it must not silently switch to mock or show an authoritative empty
   list. Test Windows SSO challenges and actual IIS base-URL behavior.
7. Trigger a Pipeline catalogue reload while requests are pending, quickly
   change Package scope, navigate between Main Map and Package assignment,
   and destroy the map during a read. Only the latest generation may publish.
8. Repeat three comparable cold and three warm Network/HAR captures; record
   network-completion time, frontend readiness, request count and payload
   sizes. Compare with 17.23 seconds cold and 14.66/14.59 seconds warm, but do
   not assume a proportional wall-clock speedup from HTTP request elimination.
9. Confirm light/dark rendering, keyboard navigation, focus/Escape behavior,
   reduced-motion preference and independent Package assignment workflows.

## Deferred or environment-dependent verification

- Real browser ArcGIS geometry rendering and Windows authentication are not
  available in this code-only environment.
- The contract currently requires backend DC-PERF-BE-02 deployment; no
  capability negotiation or automatic 404 fallback is introduced. Rolling back
  to the previous frontend returns to the unchanged individual API routes.
- A full `npm run check` and live backend/ArcGIS integration test must run on
  the development machine with its actual project dependencies and lockfile.
- End-to-end startup performance is not measured by the isolated Node tests.
