# DC-PERF-02 — Main Map Package metadata verification

## Controlled source and scope

- Frontend commit: `917aaef68f6c6297df78fbb1670f5b5231385579`.
- Change: an opportunistic, bounded metadata-list read, not a new API contract.
- Preserve Work Scope multi-select, Workspace membership, per-context Job
  status, full Package Details, AOI membership filtering and independent
  Workspace geometry loading. Mock mode and Package Assignment are unchanged.

## Focused automated checks

Run from `src/DataCatalogue`:

```powershell
npm run format
npm run check
```

The focused Node tests verify the member-count probe, bounded bulk eligibility,
concurrent targeted fallback, complete identity validation, no mixed projections,
abort, exact Severity, separate contextual Jobs and correct normalized API
queries. Run them directly if isolating a failure:

```powershell
node --test src/features/jobs/services/loadLivePackageMetadata.test.js
node --test src/features/jobs/services/liveJobServiceAdapter.test.js
node --test src/features/jobs/services/liveCatalogueReadiness.test.js
```

## Browser acceptance and measurement

1. Confirm the backend deployment supports paginated `GET /v1/packages` and
   the existing Workspace memberships. Open DevTools Network, preserve log,
   disable cache, then hard reload Main Map in live mode.
2. Record count, status, transfer size and elapsed time of requests grouped by
   `/v1/pipelines`, `/v1/workspaces`, `/workspaces/{id}/packages`,
   `/v1/packages?pageSize=1`, `/v1/packages?pageSize=N`, individual
   `/v1/packages/{id}`, and Workspace detail/geometry requests. Do not export
   cookies, Authorization headers, connection strings or private payloads.
3. In a catalogue with 12–200 distinct Workspace-member Packages and a small
   complete assigned list, verify one count probe and one bounded list page
   replace individual metadata calls. A large unrelated catalogue must issue
   only the one-item probe then individual targeted reads, not download all
   unrelated Package descriptions. Small lists use direct reads without a probe.
4. Switch `All pipelines`, one Pipeline, and Workspace multi-select; compare
   Packages, open Job counts, independent statuses and map AOIs with the
   pre-change version. Verify one Package in multiple contexts remains separate.
5. Test rapid Pipeline selections, a mid-load navigation, a failed list read,
   a changed/deleted Package, a simultaneous Package creation and manual
   Refresh. Failures must not display a successfully empty catalogue, restore
   an obsolete selection, or let a stale request publish after a new one.
6. Check both light/dark and Package Details while the independent Workspace
   geometry fetch is pending or fails. The live shell must still follow its
   existing non-blocking behavior; no unified loader was introduced.
7. Compare cold and warm reloads at the same backend/environment (at least
   three runs each); report total API count, bytes, time until first usable
   Package list, slowest request group, and visible map readiness. A reduction
   in HTTP count alone is **not** evidence of lower wall-clock latency.

## Remaining risks and follow-up

- `/v1/packages` lists the backend subscription projection, while
  `/v1/packages/{id}` reads the current event state. The UI verifies IDs and
  count stability, but has no revision token to prove metadata freshness.
  Check recent Severity/Title edits and binding changes manually.
- Per-Workspace membership and geometry calls remain independently bounded
  but are not batched by this frontend candidate. Discuss a verified bulk
  read with the backend owner only after measuring real deployment traces.
- The future unified startup gate is tracked separately as
  `DC-UX-LOADER-01`; never gate on on-demand detailed geometry or an
  unbounded ArcGIS tile load.
