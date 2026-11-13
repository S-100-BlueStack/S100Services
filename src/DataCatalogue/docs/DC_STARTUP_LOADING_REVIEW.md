# DC-PERF-01 — DataCatalogue Main Map startup loading review

**Date:** 2026-11-13  
**Review type:** Read-only source review; no runtime performance changes  
**Authoritative frontend baseline:** `17ff86537bd7041cb1a025d113862898e1814046`  
**Accepted DataCatalogue commit in merge:** `a2f2f36df08f99e4bcd12479d6e276a79b9c62fa`

## 1. Scope and evidence limits

This review covers the live Main Map bootstrap, Package list and Workspace
coverage reads. It is based on 247 verified committed source files, including
`createApp.js`, `createPipelineVisibility.js`, `liveJobServiceAdapter.js`,
`jobStore.js`, `mapController.js`, `createWorkspaceGeometrySource.js` and the
front-end catalogue transport/normalization layer. The exporter did **not**
include the `features/map/packages/` implementation sources, so the exact
number of HTTP pages, caching policy and refresh behavior of the Package AOI
overview cannot be independently confirmed here. No deployed API, browser
waterfall, actual timings, backend implementation or ProductCatalogue runtime
source were included. Request counts below are **conditional source-derived
estimates**, not observed production network counts.

## 2. Current startup sequence (live mode)

| Phase                            | Owner and source lines                                                                                                                     | Data/read behavior                                                                                                                                                                                                          | Critical path today                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Pipeline and Workspace catalogue | `features/map/workspaces/createPipelineVisibility.js:166-218`                                                                              | `catalogue.pipelines()` and paginated `catalogue.workspaces()` start together; `ensureLoaded()` joins an existing initial request.                                                                                          | Prerequisite for contextual Jobs.          |
| Package membership               | `features/jobs/services/liveJobServiceAdapter.js:36-71`                                                                                    | Every verified Workspace loads its paginated Package memberships; concurrency is bounded at four Workspaces.                                                                                                                | Prerequisite for Jobs list.                |
| Package metadata                 | `features/jobs/services/liveJobServiceAdapter.js:72-116`                                                                                   | Each distinct member `packageId` gets `catalogue.package(id)`, bounded at six in parallel. One metadata read per distinct Package within the load, not per contextual Job.                                                  | Prerequisite for Jobs list.                |
| Main Map startup                 | `app/createApp.js:568-590`; `features/map/core/mapController.js:83-177`                                                                    | `MapView.when()` is awaited and the Workspace overlay is constructed. Map readiness and Package data are independent.                                                                                                       | Does not gate live list or shell.          |
| Workspace geometry               | `app/createApp.js:319-339`; `features/map/core/mapController.js:303-316`; `features/map/workspaces/createWorkspaceGeometrySource.js:19-76` | All loaded Workspace geometries are requested separately, with four concurrent Workspace detail requests. Visibility changes do not suppress the initial geometry fetch.                                                    | Async map enrichment; not a shell gate.    |
| Package AOI overview             | `app/createApp.js:575-590` and `shared/api/catalogueService.js:141-162`                                                                    | The overview is attached after the MapView becomes ready; the API exposes paginated `GET /v1/packages/geometry` filtered by Pipeline binding. Exact overview page flow requires the omitted `features/map/packages` source. | Async map enrichment; not a shell gate.    |
| Shell/loader                     | `app/createApp.js:568-606`; `app/startup/createStartupController.js:18-49`                                                                 | Live mode marks startup complete and releases the shell before awaiting map or Jobs; mock mode has a separate sequential required startup gate.                                                                             | Explains visually fragmented live loading. |

The default live Packages panel starts its list request at
`app/createApp.js:511-519`. The initial `createPipelineVisibility()` call has
already initiated the catalogue read, and the Jobs adapter calls
`ensureLoaded()` rather than opening an independent duplicate Pipeline read.
`app/createApp.js:319-339` also avoids an unconditional second Jobs load if
one is already in progress. Do not remove either guard without race tests.

## 3. Expected request amplification

Define:

- `W`: number of distinct verified Pipeline/Workspace contexts loaded at startup.
- `M_i`: number of Package memberships in Workspace `i`.
- `U`: number of **unique** Package IDs across all memberships.
- `P`: number of selected Pipelines whose assigned Package AOI overview is fetched.

For a successful initial live list/Workspace coverage load, **excluding
ArcGIS basemap/auth/tile traffic and Package AOI pages**, the source can cause:

| Category                  | Conditional number of API calls                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Pipeline catalogue        | `1`                                                                                                           |
| Workspace catalogue       | `ceil(W / 200)` for a complete populated catalogue; the API still receives one page request for an empty list |
| Workspace membership      | `sum(max(1, ceil(M_i / 200)))` for `i = 1..W`                                                                 |
| Distinct Package metadata | `U`                                                                                                           |
| Workspace geometry        | Up to `W` (the source deduplicates by Workspace context key)                                                  |

The metadata wave follows completion of the membership wave. Bounded parallelism
(four membership and four geometry requests, six metadata requests) prevents an
unlimited burst but does **not** reduce total request count. The currently
selected Pipelines additionally cause separate paginated geometry reads, whose
precise count is not confirmed from this partial source export.

Example **illustrating the formula, not an observed session**: with 18 unique
Workspaces, one membership page each and 30 unique Packages, the above
categories account for 1 Pipeline + 1 Workspace list + 18 membership + 30
metadata + 18 Workspace geometry = 68 HTTP requests before considering any
Package AOI pages, basemap or UI-triggered requests. Real counts depend on
catalogue size and users' chosen scope.

## 4. What is already optimized or guarded

- Pipeline/Workspace catalogue initial reads are shared by `ensureLoaded()`
  (`createPipelineVisibility.js:212-218`).
- Concurrent Workspace reads and Package metadata reads are bounded and unique
  Package IDs are deduplicated (`liveJobServiceAdapter.js:54-86`).
- `jobStore.js:47-82` aborts and supersedes stale loads before publishing.
- Opening Packages within 60 seconds of a successful list read reuses the
  snapshot; opening during a load does not replace that request
  (`app/ui/createJobsOverlay.js:5,134-152`). Manual Refresh intentionally bypasses
  the reuse policy.
- `createWorkspaceGeometrySource.js:26` deliberately avoids cross-selection
  caching because the backend provides no verified geometry freshness token.
- `setVisibleWorkspaces()` changes presentation state instead of refetching
  geometry (`features/map/core/mapController.js:312-316`).

These safeguards mean some apparent duplicated _logical operations_ may already
join one network request. They need network correlation before refactoring.

## 5. Findings and recommended next changes

| Priority | Finding                                                                                                       | Recommendation                                                                                                                                                                                                                            | Boundary/verification                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Initial list path scales with `W` membership pages plus `U` Package details.                                  | Capture a cold/warm waterfall. Check whether existing paged `/v1/packages` provides adequate metadata to join locally without loading unrelated Packages; if not, discuss a batch membership/Package-summary read with the backend owner. | Do not invent or implement backend routes without a confirmed contract; preserve `(packageId, pipelineId, workspaceId)` and honest membership semantics. |
| P1       | Live UI is released before necessary data/map layers finish, producing multiple independent loading surfaces. | Plan one live-mode readiness lifecycle after data-load optimization; define required first-view readiness separately from optional details and slow basemap tiles.                                                                        | Do not block users indefinitely or misrepresent failed optional reads as successful. Keep mock path untouched.                                           |
| P2       | Each Workspace can require one separate geometry detail read even if hidden by current Work Scope.            | Measure how much geometry contributes to the waterfall. Consider a backend batch coverage read or a verified visibility-aware loading strategy with cancellation, without losing instant filter switches.                                 | Current API contract has only individual Workspace geometry reads in this source. Renderer must remain under map feature boundaries.                     |
| P2       | Main Map AOI overview adds its own geometry pages for selected Pipelines.                                     | Correlate pipeline-switch and startup traffic with the overview owner's lifecycle, deduplication and pagination; avoid repeated reads for unchanged scopes if freshness semantics permit.                                                 | Exact behavior is unverified because the overview module was omitted from this export.                                                                   |
| P2       | Reopening or reloading the catalogue can cause new membership/metadata waves by design.                       | Verify refresh/invalidation requirements and distinguish manual Refresh, successful Save, catalogue reload and simple panel open.                                                                                                         | Keep existing stale-response protection and 60-second conditional list reuse until evidence supports change.                                             |

**Backend gap assessment:** There is no verified bulk Workspace-membership or
Package-summary aggregation method exposed by the reviewed frontend service
(`shared/api/catalogueService.js:127-252`). This is **not proof** that a suitable
backend endpoint does not exist. The backend owner should confirm capabilities
before any new endpoint is proposed. A new bulk contract, if needed, should
support bounded pagination, stable identities, Pipeline/Workspace membership,
Package summary fields, cancellation, and explicit consistency/freshness behavior.

## 6. Measurement plan (DC-PERF-02)

1. In a local browser connected to a confirmed backend deployment, record
   `Performance`/`Network` with a cold reload (`Disable cache`) and a warm
   reload. Preserve request initiators, paths, status codes, transferred bytes,
   start/end times, and total DOM/map readiness time. Do not export credentials.
2. Record `W`, `U`, selected Pipeline IDs, Workspace count, and whether
   Package AOIs are active. Group requests by `/v1/pipelines`, `/v1/workspaces`,
   `/workspaces/{id}/packages`, `/v1/packages/{id}` and `/v1/packages/geometry`.
3. Compare total requests, concurrent waves, 95th-percentile latency by group,
   failed/aborted requests and time to usable Package list vs. visible map.
4. Repeat with one Pipeline, `All pipelines`, a Workspace selection, subsequent
   panel open, and manual Refresh to detect duplicate or unnecessary requests.
5. Apply focused frontend-only optimizations only when measured; otherwise
   specify a small backend read contract with the colleague and retain existing
   pagination/identity semantics.

## 7. Future unified startup loader (DC-UX-LOADER-01)

Design after measurement, not as a substitute for it. Reuse the existing
`createStartupLoader()` presentation and one authoritative live startup
lifecycle/generation owner. Define a first-view readiness contract for the
Pipeline/Workspace catalogue, initial contextual Jobs snapshot, MapView and the
visible Workspace/Package AOI layers that are essential to the selected
workflow. Optional or on-demand reads (selected Package detailed geometry,
secondary basemaps, non-visible Workspaces, background enrichment) must not
indefinitely gate entry. Expose failures with Retry and cancellation rather
than displaying false `100%` progress. Avoid unrelated rerenders or focus
changes when initial data publishes. Reconcile this with the accepted rule
that the live Packages list can be accessible if map geometry is temporarily
unavailable; agree on which data are _truly required_ before enabling a gate.

## 8. Verification performed and not performed

- Source archive and manifest verification proves the exported bytes and
  recorded Git blob hashes. The exporter reports a clean DataCatalogue
  working tree and verifies the accepted commit is contained in the merge.
- Focused tests and syntax checks for the independent Details correction are
  recorded in the delivery report; the review itself did not modify the
  startup, service, map, API or backend code.
- No network waterfall, server latency, backend capacity test, ArcGIS
  integration test, production telemetry, or complete Vite build was available
  for this source-only review. Do not treat illustrative call counts as timing
  measurements or claim a performance improvement from the Details change.
