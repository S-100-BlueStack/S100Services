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
| PAGE-01     | Deferred search extension                         | Package GET supports category, geometry, hasPipeline, pipelineId and paging, not name search or Severity sort.                                                                                                                                                     | Package list uses server filters and paging; name search disabled. No page-only filter masquerades as global search. Jobs sort a completely loaded selected Workspace.                                                                                                                                  |
| PAGE-02     | Performance / snapshot follow-up                  | Workspace membership is paged, Package details require individual reads, and no snapshot token or batch Package read is documented.                                                                                                                                | Six concurrent hydrations; no partial success list. Duplicate identities, changing totals or premature empty pages fail and request reload. Concurrent changes preserving totals cannot always be detected; large Workspaces need local performance tests and potentially a backend batch/snapshot API. |
| COMMENT-01  | Deferred backend extension                        | No comment persistence endpoint in verified v1.                                                                                                                                                                                                                    | Comments and saved history remain demo-only; no live comment editor or persistence claims.                                                                                                                                                                                                              |
| STORE-01    | Accepted for testing only                         | Source uses temporary in-memory event storage.                                                                                                                                                                                                                     | Integration tests may lose API data on restart. No claim of durable binding/Package/Workspace storage. Production persistence remains backend-owned.                                                                                                                                                    |
| OWNER-01    | Out of current scope                              | Workspace owner/lockedAtUtc and claim/release routes exist; they describe responsibility, not progress.                                                                                                                                                            | Fields retained in normalized Workspace values, never mapped to Job status. Claim/release mutations are not implemented.                                                                                                                                                                                |
| OVERRIDE-01 | Confirmed requirement; backend contract missing   | Manual Workspace inclusions and exclusions per bound Package/Pipeline must coexist with automatic AOI overlap. Current BindRequest has only PackageId/PipelineId; GET bindings and Workspace package queries calculate intersections without override persistence. | No misleading manual Workspace editor until an authorized read/write/reconciliation contract is agreed and implemented by backend owners. See proposal below.                                                                                                                                           |
| V2-01       | Excluded                                          | DataCatalogueAPI.csproj excludes ProductsController.cs and related v2 product files.                                                                                                                                                                               | Only executable v1 routes are used. No v2 dependency.                                                                                                                                                                                                                                                   |
| QA-01       | Pending local quality gate and browser acceptance | Dependencies and ArcGIS/browser/backend session are absent. The snapshot also omits imported `src/styles/tokens.css`.                                                                                                                                              | Full Node run reproduces baseline CSS-token failure and three missing-SDK test-file failures. New focused geometry tests pass; exact logs/counts are in the candidate delivery. Run format/check against the complete local repository, then geometry browser checks.                                   |

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
