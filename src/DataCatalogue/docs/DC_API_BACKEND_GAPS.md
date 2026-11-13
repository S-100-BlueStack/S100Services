## DC-BE-FE-02 — Follow-ups after Pipeline-scoped AOI correction

The selected Pipeline geometry read is available in the backend and now
used by the frontend candidate, but a Workspace-scoped **bulk geometry**
contract is not verified. Do not infer Workspace intersections from direct
Pipeline assignment or send an invented Workspace query parameter to
`/v1/packages/geometry`. The separate contextual Jobs loader still performs
one membership read per Workspace and Package metadata hydration per unique
Package; optimize only with a verified aggregate/batch backend contract.
Workspace auto-match display is derived from saved Pipeline bindings and
spatial intersection; manually assigning individual Workspaces has been
disallowed by the latest meeting requirement. Creator/Editor mutations and
external NM/WorkZone integration contracts are **not yet verified**.

---

## DC-BE-FE-01 — Backend read gaps reclassified (2026-11-12)

Source verified at backend commit `313ea65a4fc07276da587a3f0acb038b72190e66`. The earlier missing list-summary and bulk Package AOI read prerequisites have been supplied in backend source and are now integrated in a frontend candidate:

- **PAGE-01 assignment summary:** `GET /v1/packages` now returns direct `hasPipeline` and `pipelineBindings`, without per-row binding fan-out. Full-text search and historical Job status discovery are still unsupported.
- **GEO-01 bulk Package AOI:** `GET /v1/packages/geometry` now supplies paged stored Esri AOIs. The candidate's opt-in overview is not a Feature Service and does not alter selected Package geometry.
- **PAGE-02 remains open:** the main-map contextual Jobs loader still reads per-Workspace Package membership plus individual Package metadata. The new geometry page supplies no Workspace membership, so it cannot replace those reads.

Manual Workspace overrides, persistent comments and real Job workflow status remain independent backend gaps. Do not mark either newly available endpoint as deployed/accepted without live testing. Earlier statements below reflect the contracts available at their recorded dates. See [DC_BE_FE_01_VALIDATION.md](DC_BE_FE_01_VALIDATION.md).

---

## DC-UX-01 v5 — Per-page binding fan-out removed (2026-11-06)

`PAGE-01`: The live Package listing still does not provide authoritative saved
Pipeline names per row. V4 read every Package's bindings separately, causing
unacceptable browser performance. V5 returns to reading only a selected
Package and caching its confirmed status and Pipeline IDs for the lifetime of
the assignment page. Unselected/uninspected Packages remain without extra
saved-binding details. Cached data may be stale after concurrent changes by
other users and is refreshed on a new selection or confirmed readback. If full
page-wide details become necessary again, the backend owner should supply an
efficient, paginated/batch summary contract with identity and snapshot semantics.
No undocumented endpoint, persistence behavior or status inference was added.

Earlier v4 fan-out descriptions below are historical, not active behavior.

---

## DC-UX-01 v4 — Per-page Package binding summary fallback (2026-11-06)

`PAGE-01` / list-summary follow-up: the current `GET /api/v1/packages` page
response does not include assigned Pipeline names or an authoritative per-item
assignment flag. V4 shows these facts **before Package selection** by calling
existing `GET /api/v1/dispatcher/bindings?packageId=...` for each Package on the
current page, with at most four concurrent reads and cancellation on navigation.
It resolves user-facing Pipeline names through existing `GET /api/v1/pipelines`.
Binding read failures do not become `Not assigned` or silent partial success.

This is intentionally an interim frontend workaround; a 25-item page may need
up to 25 binding GETs plus its list and Pipeline catalogue GETs. Backend owners
should provide an authorized paged/batched summary with stable Package identity,
assignment status, Pipeline display names, consistent paging/snapshot semantics
and filtering, so large catalogues do not depend on per-row intersection reads.
No new endpoint is assumed and no global historical result is fabricated.

`OVERRIDE-01`, `COMMENT-01` and durable Package completion/history remain open.
Local editable Workspace/comment drafts still cannot be saved by the verified v1
API; the editor does not claim otherwise. V4 does not change those contracts.

---

## DC-UX-01 v3 — Editable previews and comment drafts remain backend gaps (2026-11-06)

`OVERRIDE-01`: selected Pipeline rows now render scoped Workspace checkboxes
without an extra expansion action. The initial checked set comes from saved
automatic overlap. Differences are only draft previews, with no API write,
saved-summary change or map update. Reverting a checkbox to its original value
clears that override. The backend override contract is still missing.

`COMMENT-01`: each Pipeline has a `speech-bubble` editor for a local binding
comment. Live draft comments are protected by navigation and block Save; no
backend comment endpoint is called and no comment is represented as persisted.
The backend owner must provide verified binding-comment persistence, readback,
identity, author/time, update/cancel semantics and authorization before the
frontend can implement durable Save. Previous “no comment editor” notes below
refer to older candidates, not v3.

`PAGE-01`: the Package list response does not supply a collection of assigned
Pipeline names; v3 shows a selected Package's saved names after its binding
read, not fabricated names in all rows or an N+1 list-read pattern. A future
list summary or efficient batch read is required to show all Pipeline names
and precise assignment statuses across paginated results.

---

## DC-UX-01 v2 — OVERRIDE-01 UI preview, persistence still blocked (2026-11-06)

**OVERRIDE-01 remains blocked by backend**, but the frontend now lets users
try manually adding/removing Workspaces within an active Pipeline. Lazy catalogue
reads use existing `GET /api/v1/workspaces?pipelineId=...` paging; saved binding
Workspaces establish the initially checked automatic result. Manual choices are
kept only in the active browser draft, visibly marked `Preview change` and
resettable. They cannot be saved or reflected in the saved binding summary,
assignment map or Jobs. The Save operation rejects any outstanding manual
Workspace changes rather than silently persisting Pipelines alone. Backend
contract requirements below remain unchanged. The earlier statement that
there is no editable manual Workspace UI applies to older candidates.

---

## DC-UX-01 — Search and completed Package history gaps (2026-11-06)

`PAGE-01` remains open: v1 Package listing has no free-text query parameter
or content search. DC-UX-01 explicitly labels its client-side matching
**Search this page**; matching only covers the current server page's name,
short ID and title. Previous PAGE-01 notes saying “search disabled” document
older frontend behavior, not this candidate. Global title/details search needs
backend-supported query semantics and pagination-aware results.

`JOB-01` remains open: Done/No update are mutually exclusive, reversible
**temporary** statuses keyed by `(packageId, pipelineId, workspaceId)`, not
backend Package state. There is no verified durable completion history or
status-search/pagination contract. A backend owner must define lifecycle,
identity, persistence and ordering before frontend history queries can be
implemented. Until then, no UI may claim that old completed Packages are
retrievable after leaving the current loaded membership snapshot.

`PAGE-02` still applies: current live Packages in the main map expand all
Workspace membership pages, then hydrate individual Packages. That read path
is not a stable, globally searchable historical feed. Do not implement
client-only pagination of that snapshot as authoritative history.

---

## DC-API-06 geometry integration update (2026-11-05)

The previous read-contract blockers **GEO-01 and GEO-04 are resolved in source**.
Verified backend commit `58264e4297872b356001611473d7090bd1b5102d`
(introduced in snapshot `8960c5f815d4a4bb3a1af6733406250d024b2334`)
provides `GET /api/v1/packages/{id}/geometry` with actual Esri JSON fields
`aoi` and nullable `detailedGeometry` (`points`, `curves`, `surfaces`).

The DC-API-06 frontend candidate reads that **existing** route and renders
only the selected Package on the assignment map or the selected Job's Package
on the main map. Nullable detail groups are supported, geometry is projected,
and stale selections cannot replace later geometry. This change does **not**
implement automatic loading of every Package's AOI at startup, publish a
Feature Service, or change geometry persistence/authentication.

**GEO-01/GEO-04 state:** Backend implemented / frontend implemented in DC-API-06
candidate; **real browser/API and performance acceptance pending**. The
existing source provides no geometry version or paging and reads all detailed
coordinates at once. Large Package payloads, actual SR/datum projections,
replacements made by other users, permission failures and IIS/SSO remain
runtime verification items. The frontend uses an 8-million-character / 150,000
coordinate display budget and a 20-second geometry-read deadline (not an API
contract). No cross-selection cache is used because version/ETag is absent.

**OVERRIDE-01 remains blocked**: manual effective Workspace membership still
needs separate backend read/write/concurrency semantics. Workspace coverage
and Package AOI are separate geographical entities and must not be conflated.
Historical “GEO-01 remains unresolved” statements below apply only to earlier
backend snapshots.

---

## DC-API-04 v3 browser-feedback follow-up (2026-10-29)

- **OVERRIDE-01 is now a confirmed requirement:** a user must be able to add/remove
  Workspace membership after automatic AOI intersection, including Workspaces outside the
  Package AOI. The current v1 API cannot persist this choice. This frontend candidate
  intentionally does not show editable manual membership controls until the backend supports
  a verified mutation and effective-membership read. This is not a denial of the requirement.
- **GEO-01 (generalized) and GEO-04 (detailed Features):** neither Package AOI coordinates nor
  detailed Feature coordinates are exposed through the verified v1 Package reads. A basemap
  plus Workspace polygons must not be confused with either geometry. No Feature Service is
  required for the proposed backend read APIs.
- **STORAGE-01 (frontend preferences):** basemap choice is now stored in browser localStorage
  as `dataCatalogue.basemap.v1`; persisting each map's last extent/center/zoom, reset UI and
  migration/validation rules remain a documented frontend follow-up. Storage contains no key.

### OVERRIDE-01 — required backend decision and contract

Agree a Package/Pipeline/Workspace identity and durable override representation with API owners.
The effective membership must combine auto-intersections with explicit inclusions and
exclusions, without turning the geographically automatic result into an immutable limit.
The backend must own all of the following, rather than the frontend guessing:

1. A read returning auto-matched IDs, explicit includes/excludes, effective Workspace IDs,
   their scope (`packageId`, `pipelineId`), and a version or precondition token.
2. Authorized create/update/delete or desired-set mutation semantics with validation and
   concurrency handling, plus defined behavior when a Pipeline binding is removed or restored.
3. The same **effective** membership in binding responses and in Workspace `packages` paging;
   otherwise the selected Package appears in assignment but not in Jobs.
4. Correct handling of stale workspace IDs, renames/deletions, no-overlap manual inclusions,
   removed auto-overlap, conflict responses and restart persistence (temporary event store
   during demo is acknowledged).
5. Exact reconciliation after every write, including partial and failed results, before a
   frontend draft may claim Saved. No fabricated local-only membership records.

The current `POST /api/v1/dispatcher/bindings` accepts only `packageId` and `pipelineId`;
`GET /api/v1/dispatcher/bindings?packageId=...` recomputes intersections. Neither is a
confirmed manual Workspace assignment contract. Backend teams choose the actual route and
response shapes before frontend work begins.

---

# DC-API backend and integration gap register

## Current correction notes (2026-10-29)

- **GEO-01 remains unresolved:** rendering all Workspaces cannot supply separate Package or
  Job AOI coordinates. A verified, read-only geometry contract is still required before
  drawing those footprints; a published ArcGIS Feature Service is not a prerequisite.
- **GEO-02 remains frontend-implemented, browser-verification pending:** main-map coverage
  now requests every available Workspace for enabled Pipelines, rather than a selected
  Workspace. Failed individual polygons must remain visible in notices; list/binding flows
  must continue independently. Verify performance against the actual Workspace catalogue.
- **PAGE-02 performance follow-up:** showing all Jobs by default reads all Workspace package
  memberships, then hydrates each unique Package. Requests are bounded but can be numerous.
  Measure real-world API volume and latency; batch/snapshot API extensions remain backend-owned.
- **DEPLOY-01 (hosting):** direct `GET /assignments` and Package deep-link URLs need the
  production host to serve the application entry page for client routes. Vite local SPA
  fallback is not production proof. No IIS/router changes are included here.

This is a frontend correction. No backend endpoints, contracts or auth rules have changed.

Baseline: `829bb6ee9ff9b6925431d5f040f9a1b55eba297d`. Updated: 2026-10-29.
Backend projects were read only. Confirmed product decisions are not reopened here.

| ID          | Status                                            | Evidence / precise gap                                                                                                                                                                                                                                             | Candidate behavior / verification needed                                                                                                                                                                                                                                                                |
| ----------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API-01      | Blocked runtime verification                      | Program.cs configures Windows Negotiate and the access policy. No approved deployment origin, SSO session, rights, proxy/CORS setup or representative live response capture is supplied.                                                                           | Configurable native-fetch client; same-origin credentials default; explicit `include` opt-in. Validate GETs and one controlled POST/DELETE with the real permitted user. No mock fallback or login invention.                                                                                           |
| GEO-01      | Blocked Package/Job generalized AOI coordinates   | Package GET returns stored geometry references, not coordinates; `{id}/geometry` is PUT only. No verified read-only AOI route in bundled executable v1 controller source.                                                                                          | Workspace geography is implemented independently. No Package/Job footprint or Feature Service dependency. See the actionable read-only proposal below.                                                                                                                                                  |
| GEO-04      | Blocked detailed Feature geometry coordinates     | PackageResponse.DetailedGeometry exposes metadata/references but no verified browser-readable detailed Feature coordinates or SR. A generalized rectangular Package AOI is not a substitute for its detailed Features.                                             | Backend owners define read-only authorized geometry access for Feature identities and a bounded browser-friendly response. No synthetic detail AOIs or Feature Service dependency is introduced.                                                                                                        |
| GEO-02      | Frontend implemented; browser acceptance pending  | Existing Workspace detail route returns actual stored Esri JSON. Coverage SR is determined by the geodatabase, not assumed to be WGS84.                                                                                                                            | Both maps consume v1 detail via shared validation and GraphicsLayer overlays. Four concurrent reads per map; scoped errors and lifecycle guards. No service mapping required. Verify actual SR/projection and rendering locally.                                                                        |
| SEV-01      | Source verified; wire test pending                | `PackageResponse.Severity` is `ulong?`; ApplicationServicesConfiguration adds enum conversion only, with no uint64 string converter. OpenAPI represents Severity numerically. Deployed bytes have not been captured.                                               | Raw decimal JSON integers are preserved before normalization; decimal strings also work. Test `0`, `9007199254740993` and `18446744073709551615` from real response text. A proxy that already rounded a number cannot be repaired by the browser. Unsafe numeric/exponent encodings fail explicitly.   |
| SEV-02      | Deferred business detail                          | Numeric priority bands are not agreed.                                                                                                                                                                                                                             | Exact numeric labels/order only. No High/Medium/Low live thresholds. Null is visibly unspecified, separate from the sentinel.                                                                                                                                                                           |
| JOB-01      | Intentionally mock-only                           | No v1 Job aggregate or workflow status persistence. Temporary labels are accepted; final lifecycle remains undecided.                                                                                                                                              | In-memory status keyed by the full three-part tuple; resettable, visible mock notice; no API status writes. Final lifecycle/storage requires a backend contract.                                                                                                                                        |
| JOB-02      | Deferred unsupported live fields                  | No proven deadline or automatic follow-up contract.                                                                                                                                                                                                                | Deadline marked unavailable; no generated live follow-up Jobs. Demo behavior remains separate.                                                                                                                                                                                                          |
| BIND-01     | Source verified; live write acceptance pending    | DispatcherController and PipelineAssignmentService implement independent POST/DELETE, active binding GET and intersection-derived Workspaces. Conflicts return 409; no transaction endpoint.                                                                       | Sequential independent mutations with individual outcomes and authoritative reconciliation. Validate mixed 201/204/403/409/network outcomes locally. A browser abort is not treated as rollback.                                                                                                        |
| BIND-02     | Deferred concurrency extension                    | Binding responses expose update time but no ETag/precondition or atomic desired-set update.                                                                                                                                                                        | Re-read before every save/retry, avoid duplicate local Save, reconcile after writes. Concurrent users can still change bindings between reads; no lost-update guarantee is claimed. Require agreed version/precondition semantics for stronger concurrency.                                             |
| PAGE-01     | Deferred search extension                         | Package GET supports category, geometry, hasPipeline, pipelineId and paging, not name search or Severity sort.                                                                                                                                                     | Package list uses server filters and paging; name search disabled. No page-only filter masquerades as global search. Jobs sort complete membership across all discovered Workspaces, independent of map visibility.                                                                                     |
| PAGE-02     | Performance / snapshot follow-up                  | Workspace membership is paged, Package details require individual reads, and no snapshot token or batch Package read is documented.                                                                                                                                | Six concurrent hydrations; no partial success list. Duplicate identities, changing totals or premature empty pages fail and request reload. Concurrent changes preserving totals cannot always be detected; large Workspaces need local performance tests and potentially a backend batch/snapshot API. |
| COMMENT-01  | Deferred backend extension                        | No comment persistence endpoint in verified v1.                                                                                                                                                                                                                    | Comments and saved history remain demo-only; no live comment editor or persistence claims.                                                                                                                                                                                                              |
| STORE-01    | Accepted for testing only                         | Source uses temporary in-memory event storage.                                                                                                                                                                                                                     | Integration tests may lose API data on restart. No claim of durable binding/Package/Workspace storage. Production persistence remains backend-owned.                                                                                                                                                    |
| OWNER-01    | Out of current scope                              | Workspace owner/lockedAtUtc and claim/release routes exist; they describe responsibility, not progress.                                                                                                                                                            | Fields retained in normalized Workspace values, never mapped to Job status. Claim/release mutations are not implemented.                                                                                                                                                                                |
| OVERRIDE-01 | Confirmed requirement; backend contract missing   | Manual Workspace inclusions and exclusions per bound Package/Pipeline must coexist with automatic AOI overlap. Current BindRequest has only PackageId/PipelineId; GET bindings and Workspace package queries calculate intersections without override persistence. | No misleading manual Workspace editor until an authorized read/write/reconciliation contract is agreed and implemented by backend owners. See proposal below.                                                                                                                                           |
| V2-01       | Excluded                                          | DataCatalogueAPI.csproj excludes ProductsController.cs and related v2 product files.                                                                                                                                                                               | Only executable v1 routes are used. No v2 dependency.                                                                                                                                                                                                                                                   |
| QA-01       | Pending local quality gate and browser acceptance | The verified DC-STAB-01 source handoff included `src/styles/tokens.css`. Offline `npm run check` stopped at missing Prettier; three test-file imports failed without installed `@arcgis/core`.                                                                     | There was no baseline CSS-token import failure in that audit. Run the full local `npm run check` and authenticated browser/ArcGIS/SSO tests. Offline syntax and test counts do not establish browser acceptance.                                                                                        |

## Confirmed decisions

Package-level assignment, multiple Pipelines, overlap-derived Workspaces, Workspace-backed
Jobs, context-scoped mock status and lower-is-higher Severity including the `Not prioritized`
sentinel are confirmed. Historical v4 uncertainty about these points is superseded.

## GEO-01 — read-only generalized Package AOI retrieval proposal

This is a backend follow-up proposal, **not** an implemented or assumed endpoint.
A published Feature Service and direct browser geodatabase access are not prerequisites.

1. Expose actual generalized rectangular AOI coordinates through an authorized read-only
   Package read extension or dedicated GET chosen by the API owner. Do not return only a
   featureClass/GlobalID reference, detailed Features or a browser-calculated envelope.
2. Include the canonical Package ID, current generalized geometry reference and a geometry
   revision/updated timestamp. Return Esri JSON polygon with an explicit valid horizontal
   spatial reference (WKID/latestWKID or WKT), either as a documented string or object.
   Define null/no-geometry separately from missing Package and unavailable storage.
3. Apply the existing catalogue authorization and visibility rules. No extra browser ArcGIS
   credentials or new authentication/CORS model should be needed. Do not expose storage paths.
4. Define 400 invalid identity/input, 401/403 authorization, 404 missing Package, and a clear
   error for unavailable geometry storage. Specify whether absent geometry is a nullable 200
   or a separate response. Return user-safe ProblemDetails, never a successful empty polygon.
5. Define payload/vertex limits and cancellation behavior. Jobs can include many Packages;
   agree a bounded batch/scoped response or efficient on-demand detail policy before broad
   Job footprint loading. A revision/ETag permits conditional reads and safe bounded caching;
   do not claim geometryRef alone changes whenever coordinates change.
6. Verify exact Package-to-reference identity; correct rectangular generalized AOI even where
   detailed Features differ; null/missing/forbidden/storage-error responses; multipart/holes
   only if permitted by the generalized contract; finite coordinates and SR preservation;
   changes/revision invalidation; paging/batch identity isolation; large payloads and aborts.
   Add API integration tests plus browser overlay alignment and stale-selection tests.

Until supplied, both live maps show Workspace coverage only. Job status, Severity and binding
operations remain independent and available. No proposed route is called by this candidate.

## GEO-03 — geometry format and projection acceptance

Frontend limitation / runtime verification, not a required backend implementation change.
The source accepts curve polygons; this adapter deliberately rejects `curveRings` with a scoped
message. Straight rings with holes/multipart are supported. Supporting curves later requires
validated public SDK conversion/densification and fixtures; no silent linearization is used.
WKID/latestWKID and WKT are passed to SDK projection. Unknown/unsupported references, unavailable
projection assets and non-simple projected polygons fail visibly. Client projection uses SDK
default equation-based transformations; grid-based transformations/vertical projection are not
provided. Validate alignment with actual Denmark/Greenland coverage and datum requirements.
The 2 MB / 100,000-vertex limits are frontend display bounds, not new backend contracts.

### DC-API-04 v4 — confirmed backend dependencies and shortId identity (2026-10-29)

- **OVERRIDE-01 remains backend-owned.** Users must be able to add and exclude
  individual Workspaces for a Package/Pipeline even outside automatic AOI overlap.
  Automatic membership remains the default. Backend must define authoritative
  effective-membership read, explicit override mutation(s), authorization,
  conflict handling, and persistence before editable UI can be implemented.
- **GEO-01 and GEO-04 remain backend-owned.** The assignment map must render the
  currently selected Package's generalized and, when requested, detailed geometry.
  Both require actual Esri JSON coordinates and spatial references in verified
  read-only API contracts. A Feature Service is not required. Do not draw all
  Packages on assignment, infer coordinates from a Workspace polygon, or dereference
  `geometryRef` directly from the browser. Jobs-map Package geometry is also pending.
- **PAGE-01 identity clarification:** there is no Package name or name-search
  contract. The frontend uses `shortId` for user-facing list identity, with
  canonical Package ID reserved for API reads, mutations and deep links.

There are no backend changes or invented routes in this frontend candidate.

### DC-STAB-02D binding outcome limitation (2026-11-04)

Frontend request deadlines and read-only reconciliation improve recovery, but a
client-side timeout or abort does not prove that a Package–Pipeline binding write
was rejected or rolled back. A mutation may complete on the backend after a
subsequent GET. `BIND-02` therefore remains open: a server operation identifier,
idempotent mutation semantics and/or version preconditions are needed to guarantee
that the authoritative read and later writes cannot race a previously timed-out
mutation. Do not represent an unknown outcome as a successful rollback or invent
an API status endpoint.
