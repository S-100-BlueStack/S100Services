# Job Manager Backend Contracts

This document tracks backend assumptions, draft contracts, open questions and integration decisions for Job Manager.

The backend does not exist yet. Do not treat any draft in this document as final until it has been confirmed with the backend implementation.

## 1. Current backend status

Status: Not available

Current assumptions:

- AOIs are loaded from an ArcGIS/Esri Feature Service.
- Jobs are initially loaded from mock data.
- AOI/Job relations are initially mocked or derived from mock Job data.
- The future backend may provide Jobs, Job mutations and AOI/Job relations.
- Automatic priority changes over time are owned by the backend, not the frontend.

## 2. Frontend integration principles

The frontend must not be tightly coupled to the future backend contract.

Rules:

- UI must use service functions, not raw backend or mock calls.
- Incoming data must be normalized before it reaches UI components.
- Mock backend behavior must stay isolated behind services.
- Backend-specific field names must not leak into UI components.
- The app must not commit private endpoints, tokens or credentials.

## 2.1 Phase 11 readiness review

Status: Reviewed after Phase 10

Current findings:

- `.env.example` contains placeholder URLs only.
- Runtime config only reads safe browser-exposed `VITE_` values.
- No private backend endpoint, token, credential or portal-specific secret is committed.
- Jobs are accessed through `features/jobs/services/jobService.js`.
- Mock Jobs remain isolated under `features/jobs/mock`.
- AOI Feature Service assumptions are centralized in `features/aoi/config/aoiFieldConfig.js`.
- AOI FeatureLayer readiness validation is isolated in `features/aoi/services/aoiService.js`.
- AOI map display is still owned by the ArcGIS FeatureLayer.
- AOI/Job relation source values already allow `mock`, `frontendGeometry` and `backend`.

Decision:

Do not add a backend API base URL or backend auth config until the backend exists. Keep browser-exposed runtime config limited to values that are safe to expose.

## 2.2 Phase 18 Job service adapter preparation

Status: Done

Current decision:

Job service now has an explicit adapter boundary.

Current behavior:

- Mock remains the default Job data source.
- `features/jobs/services/jobService.js` exposes the current service-facing methods.
- `features/jobs/services/mockJobServiceAdapter.js` adapts the existing mock backend.
- `features/jobs/services/unavailableHttpJobServiceAdapter.js` exists only as a future seam.
- No backend API base URL is introduced.
- No endpoint path is introduced.
- No authentication behavior is introduced.
- No final backend response contract is introduced.

Adapter expectation:

```txt
loadJobs()
  -> { jobs }

updateJobStatus(jobId, status)
  -> { job, createdJobs }
```

The adapter expectation mirrors the existing frontend service need and mock behavior. It should not be treated as a final backend contract until a real backend exists.

Backend implication:

Future backend work can implement an HTTP adapter behind the existing Job service without changing Jobs UI or map/list coordination first.

## 2.3 Current mock backend behavior

Status: Done for current mock/frontend phase

The mock backend exists to exercise frontend UX and service boundaries before the real backend exists.

Current behavior:

- Jobs are loaded through `features/jobs/services/jobService.js`.
- Mock implementation lives under `features/jobs/mock`.
- UI components must not import mock backend modules directly.
- Mock Jobs are normalized into the stable frontend Job model.
- Mock Jobs include point and polygon geometry.
- Mock Jobs include `relatedAoiIds` for relation testing.
- Mock load operations simulate latency.
- Mock load operations can fail.
- Mock status mutations simulate latency.
- Mock status mutations can fail.
- Completing a Job can create a generated Job.
- Generated Jobs are stored in the mock backend immediately.
- Generated Jobs are returned from the mutation result as `createdJobs`.
- Generated Jobs are not inserted into the current visible Jobs store immediately.
- Generated Jobs become visible after refresh or panel reopen.

Default mock configuration:

```txt
latencyMinMs: 250
latencyMaxMs: 1000
loadFailureRate: 0.05
mutationFailureRate: 0.15
cyclicJobCreationRate: 0.85
```

Generated Job behavior:

```txt
Job marked Done
  -> mock backend updates the completed Job
  -> mock backend may create a generated Job
  -> generated Job is stored in mock backend
  -> mutation result returns updated Job and createdJobs
  -> Jobs store updates the completed Job only
  -> created Job becomes visible after refresh or panel reopen
```

Current frontend mutation-to-map sync behavior:

```txt
Visible Job status updated
  -> Jobs store updates the visible Job snapshot
  -> app composition detects a successful jobStatusUpdated change
  -> map Job layers are refreshed from the shared Jobs store snapshot
  -> AOI renderer summaries are rebuilt from the same visible Jobs snapshot
  -> active map scope/highlight state is reapplied best-effort
```

Generated Job behavior remains intentionally different:

```txt
Generated mock Job created
  -> generated Job is stored in mock backend
  -> generated Job is returned for notice/future compatibility
  -> generated Job is not inserted into the visible Jobs store
  -> generated Job is not rendered on the map until refresh or panel reopen
```

Backend implication:

The future backend may choose whether status mutation responses can include newly created follow-up Jobs. The current frontend supports a `createdJobs` mutation result shape for notices and future compatibility, but treats returned generated Jobs as queued work for the current visible session. New Jobs should not appear in the current visible map/list snapshot until the frontend receives them through the normal load/refresh path, unless that product decision changes later.

## 2.4 Phase 23 hardened baseline review

Status: Reviewed

Current decision:

No backend contract changes are introduced by the hardened baseline review.

Current blockers remain unchanged:

- Job HTTP adapter implementation is blocked until a real endpoint shape, authentication behavior and guaranteed Job fields are known.
- Final AOI integration work is blocked until real AOI Feature Service fields, auth requirements, geometry type, spatial reference, service size and relation identifier ownership are confirmed.
- AOI details, canonical queried AOI state, selected-Job permanent AOI filtering and AOI clustering remain deferred until those inputs exist.

Backend implication:

The next safe frontend work should avoid adding endpoint paths, auth assumptions or final AOI relation assumptions.

## 2.5 Phase 25 UI polish review

Status: Reviewed

Current decision:

No backend contract changes are introduced by the Job popup, Jobs panel or panel layout polish.

Current behavior remains unchanged:

- Job data still flows through the Job service adapter boundary.
- AOIs still flow through the configured ArcGIS FeatureLayer.
- AOI/Job relations remain service/domain-derived and source-flexible.
- No Job endpoint paths, auth behavior, response shapes or AOI relation ownership assumptions are introduced.

Backend implication:

The next safe frontend work should continue to avoid endpoint paths, auth assumptions and final AOI relation assumptions unless real backend/AOI inputs are available.

## 2.6 Phase 26 Filters popover polish review

Status: Reviewed

Current decision:

No backend contract changes are introduced by the Filters popover layout, scrolling or close/focus polish.

Current behavior remains unchanged:

- Job filters still use the existing frontend Job filter state.
- AOI overview filters still use the existing map presentation state and relation-service snapshots.
- Job point clustering settings still use the existing map clustering state.
- No Job endpoint paths, auth behavior, response shapes or AOI relation ownership assumptions are introduced.

Backend implication:

Future backend/AOI work remains blocked by the same real endpoint, auth, field and relation-ownership inputs as before Phase 26.

## 2.7 Phase 27 map/list state transition polish review

Status: Reviewed

Current decision:

No backend contract changes are introduced by the map/list state transition polish.

Current behavior remains unchanged:

- Job data still flows through the Job service adapter boundary.
- AOIs still flow through the configured ArcGIS FeatureLayer.
- AOI/Job relations remain service/domain-derived and source-flexible.
- Map/list transition cleanup is frontend orchestration only.
- No Job endpoint paths, auth behavior, response shapes or AOI relation ownership assumptions are introduced.

Backend implication:

Future backend/AOI work remains blocked by the same real endpoint, auth, field and relation-ownership inputs as before Phase 27.

## 3. Expected backend responsibilities

Likely future backend responsibilities:

- return Jobs
- update Job status
- return or calculate AOI/Job relations
- manage automatic priority changes over time
- return user-safe errors
- possibly return operation conflict responses
- possibly support refresh or operation status endpoints later

## 4. Draft frontend Job model

The frontend should normalize backend or mock Job data into this shape:

```js
{
  id: "job-001",
  title: "Review affected AOIs",
  summary: "Short user-facing description of the work.",
  createdAt: "2026-06-15T10:00:00.000Z",
  deadline: "2026-06-30T00:00:00.000Z",
  priority: "medium",
  status: "todo",
  geometry: {
    type: "polygon",
    rings: [],
    spatialReference: {
      wkid: 4326
    }
  },
  relatedAoiIds: ["aoi-001", "aoi-002"]
}
```

Mock Jobs may use either point or polygon geometry. Geometry should be within Denmark or the surrounding Danish waters.

Initial geometry types:

```txt
point
polygon
```

Internal status values:

```txt
todo
inProgress
done
```

User-facing status labels:

```txt
To do
In Progress
Done
```

Internal priority values:

```txt
low
medium
high
```

User-facing priority labels:

```txt
Low
Medium
High
```

### Current frontend Job geometry map implementation

Status: Done for current mock/frontend phase

The frontend displays mock Job geometry on the map through read-only client-side FeatureLayers.

Current behavior:

- point Job geometry is displayed in a dedicated point layer
- polygon Job geometry is displayed in a dedicated polygon layer
- Job map attributes are derived from the normalized frontend Job model
- Job layer data is loaded through `jobs/services`
- Job geometry popup shows basic Job metadata
- Job popup action can open Job details in the Jobs panel
- selecting a Job can highlight the selected Job geometry and related AOIs
- Job point clustering is implemented for geographic overview
- Job cluster picker can open the normal Job feature popup for a cluster member Job

Current limitations:

- editing Job geometry is not supported
- Job polygon clustering is not supported
- final backend geometry ownership is not confirmed
- map Job layers are refreshed from the shared startup/manual-refresh Jobs snapshot and from successful visible Job status mutations
- generated mock Jobs are intentionally not inserted into map Job layers until they become part of the visible Jobs store after refresh or panel reopen

Backend assumptions remain unchanged:

- backend may later provide Jobs and Job geometry directly
- backend may later own authoritative Job/AOI relation calculation
- frontend should continue normalizing incoming Job geometry before UI or map use

Decision:

Keep AOI FeatureLayer ownership for map display until the real AOI Feature Service is confirmed. The AOI service should provide validation and normalization helpers, but should not eagerly query all AOIs into frontend state without a concrete UI/backend requirement.

## 5. Draft frontend AOI model

The frontend should normalize AOI data into a stable model before UI use.

```js
{
  id: "aoi-001",
  name: "Area of Interest 001",
  geometry: null,
  attributes: {},
  jobSummary: {
    total: 2,
    active: 1,
    highPriority: 1
  }
}
```

The actual source fields from the AOI Feature Service are not known yet.

### Current AOI Feature Service integration status

Status: In progress

The frontend has an AOI Feature Service configuration skeleton based on `VITE_AOI_FEATURE_SERVICE_URL`.

No private endpoint, token or credential is committed.

Current frontend implementation:

- resolves AOI source configuration from runtime config
- can create an ArcGIS `FeatureLayer` from the configured AOI Feature Service URL
- centralizes current test-service field names in `features/aoi/config/aoiFieldConfig.js`
- exposes an AOI service facade with a stable API result shape
- validates AOI FeatureLayer readiness after the layer loads
- validates required and recommended provisional AOI fields
- checks AOI feature count best-effort
- shows map warnings for missing config, field mismatch and empty AOI sources
- shows a user-facing notice when the AOI layer cannot be loaded
- filters AOI popup field rows to fields available in the loaded Feature Service
- includes AOI normalization helpers for current test-service field names and legacy/provisional fallbacks
- configures an AOI popup template using available test-service metadata

Current limitations:

- real AOI querying into AOI state is not implemented in the AOI service yet
- AOI FeatureLayer remains the owner of map AOI display
- AOI clustering is deferred until real geometry characteristics are known
- current field mapping is based on a temporary test Feature Service and must not be treated as the final backend contract
- normalized canonical AOI state is intentionally deferred until real AOI field, auth, geometry and service-size requirements are confirmed

Current required provisional AOI fields:

```txt
GlobalID
PRODUCTNAME
```

Current recommended provisional AOI fields:

```txt
OBJECTID
PRODUCTID
SERIES
EDITION
ISSUEDATE
```

Decision:

Use `GlobalID` as the provisional frontend AOI identifier for the test Feature Service. Use `PRODUCTNAME` as the provisional display name. Use `OBJECTID` for ArcGIS/service mechanics only. Do not treat this as the final backend contract until the real AOI Feature Service is created.

Keep AOI FeatureLayer ownership for map display until the real AOI Feature Service is confirmed. The AOI service should provide validation and normalization helpers, but should not eagerly query all AOIs into frontend state without a concrete UI/backend requirement.

### Phase 19 AOI service readiness review

Status: Reviewed

Current decision:

AOI FeatureLayer ownership remains the right current approach.

Current behavior to preserve:

- AOI FeatureLayer owns current map AOI display.
- AOI service owns readiness validation for the configured FeatureLayer.
- AOI service exposes a stable `loadAois()` facade but does not query all AOIs into canonical frontend state.
- AOI field mapping remains based on the current test service only.
- `GlobalID` remains the provisional AOI identifier.
- `PRODUCTNAME` remains the provisional AOI display field.
- `OBJECTID` remains ArcGIS/service mechanics only.
- AOI overview filtering can only safely filter AOIs when relation ids are compatible with the configured AOI identifier field.

Deferred until real AOI/backend inputs exist:

- canonical queried AOI state
- AOI details
- AOI clustering or representative-point overview layer
- selected-Job permanent AOI layer filtering
- AOI auth handling
- final AOI relation identifier ownership

Backend implication:

A future backend or relation service should return AOI identifiers compatible with the configured AOI Feature Service identifier field if those relations are expected to drive AOI map filtering.

## 6. Draft relation model

AOI/Job relation data should be represented independently of its source.

```js
{
  jobId: "job-001",
  aoiIds: ["aoi-001", "aoi-002"],
  source: "mock"
}
```

Possible relation sources:

```txt
mock
frontendGeometry
backend
```

The `source` field is intended for diagnostics and development. It should normally not be shown to users.

## 7. Draft Job API assumptions

These are draft assumptions only.

### Load Jobs

Expected frontend service need:

```txt
loadJobs()
```

Possible backend shape later:

```txt
GET /jobs
```

Expected result:

```js
{
  jobs: [];
}
```

### Update Job status

Expected frontend service need:

```txt
updateJobStatus(jobId, status)
```

Possible backend shape later:

```txt
PATCH /jobs/{jobId}/status
```

Expected request:

```js
{
  status: "inProgress";
}
```

Expected result:

```js
{
  job: {},
  createdJobs: []
}
```

`createdJobs` supports the cyclic work scenario where completing one Job may create follow-up Jobs.

## 8. Draft AOI/Job relation API assumptions

Expected frontend service needs:

```txt
loadAoiJobRelations()
getJobsForAoi(aoiId)
getAoisForJob(jobId)
```

Possible backend options:

1. Backend returns relations with Jobs.
2. Backend returns a dedicated relation endpoint.
3. Backend calculates spatial intersections and returns affected AOIs per Job.
4. Frontend temporarily derives relations from mock data.

No option is final yet.

### Current frontend relation implementation

Status: Done for current mock/frontend phase

The frontend has a relation foundation under `features/relations`.

Current behavior:

- relation model uses `jobId`, `aoiIds` and `source`
- initial relation source is `mock`
- mock relations are derived from normalized Job `relatedAoiIds`
- AOI summaries can be derived from Jobs and relations
- relation lookup supports both AOI-to-Jobs and Job-to-AOIs direction
- map renderer consumes AOI summaries as best-effort data
- Jobs panel can show Jobs scoped to a selected AOI using relation helpers
- map Job layers can be scoped to Jobs related to a selected AOI
- relation snapshots can apply current Job filters before summaries are built

Current AOI summary fields:

```txt
total
active
highPriority
activeHighPriority
jobIds
```

Field meaning:

- `total` counts all related Jobs.
- `active` counts related Jobs that are not `Done`.
- `highPriority` counts all related high-priority Jobs.
- `activeHighPriority` counts related high-priority Jobs that are not `Done`.
- `jobIds` is intended for frontend lookup and diagnostics.

User-facing AOI summaries should normally display counts, not raw IDs.

Backend assumptions remain unchanged:

- backend may later return AOI/Job relations directly
- backend may later calculate spatial intersections
- frontend relation source can change from `mock` to `frontendGeometry` or `backend`
- UI should not need to change when the relation source changes

### Current AOI overview filtering implication

Status: Done for current frontend phase

AOI overview filters currently use relation service snapshots to derive which AOIs should remain visible on the map.

Current frontend behavior:

- AOI overview filtering is controlled by frontend map state.
- Relation membership is derived behind `features/relations`.
- Current Job filters are applied before AOI membership is calculated.
- AOI FeatureLayer filtering uses provisional `GlobalID` matching.
- If relation AOI ids do not look compatible with `GlobalID`, the frontend falls back to showing all AOIs.
- The frontend does not call ArcGIS `queryFeatures` to validate generated AOI filter expressions.

Backend implications:

- A future backend relation contract should provide AOI identifiers that match the configured AOI Feature Service identifier field.
- If the backend provides AOI/Job relations directly, those relation ids should be stable and documented.
- If the backend calculates spatial intersections, the returned AOI ids should be compatible with the frontend AOI id field.
- Final AOI identifier ownership remains open until the real AOI Feature Service and backend relation direction are confirmed.

Phase 17 frontend UX implication:

The frontend now distinguishes between two AOI overview edge cases:

```txt
Active AOI overview filter has compatible AOI ids but no matches
  -> AOI FeatureLayer can be filtered to no AOIs
  -> map status explains that no AOIs match the active AOI overview and Job filters

Active AOI overview filter has relation AOI ids that are incompatible with the current AOI service id field
  -> AOI FeatureLayer is not destructively filtered
  -> all AOIs remain visible
  -> map status explains that the AOI overview filter could not be safely applied
```

Backend implication remains unchanged: future relation ids should match the configured AOI Feature Service identifier field if backend-provided AOI/Job relations are expected to drive AOI map filtering.

## 9. Error handling assumptions

Backend errors should eventually be normalized into user-safe frontend errors.

The frontend should distinguish at least:

- load failure
- mutation failure
- validation failure
- conflict
- unauthorized
- unavailable backend
- unknown error

User-facing error messages must be English.

## 10. Open backend questions

| ID     | Question                                                |      Status | Notes                                                                                                                    |
| ------ | ------------------------------------------------------- | ----------: | ------------------------------------------------------------------------------------------------------------------------ |
| BE-001 | Will the backend provide AOI/Job relations directly?    |        Open | Important for relation service design.                                                                                   |
| BE-002 | Will backend calculate spatial intersections?           |        Open | Preferred if backend has authoritative geometry access.                                                                  |
| BE-003 | What Job fields are guaranteed?                         |        Open | Needed before final normalization.                                                                                       |
| BE-004 | Can updating a Job return newly created follow-up Jobs? |        Open | Useful for cyclic work UX.                                                                                               |
| BE-005 | Will status updates support conflict responses?         |        Open | Useful for multi-user safety.                                                                                            |
| BE-006 | Will AOI Feature Service require authentication?        |        Open | Important for config/security. Do not add tokens or credentials to source code.                                          |
| BE-007 | Which AOI fields are stable identifiers?                | In progress | Test service uses `GlobalID` provisionally. Final service identifier is not confirmed.                                   |
| BE-008 | Will priority be returned as a current computed value?  |        Open | Frontend should not compute long-term priority.                                                                          |
| BE-009 | What AOI field should be used as the display name?      | In progress | Test service uses `PRODUCTNAME` provisionally. Final display field is not confirmed.                                     |
| BE-010 | What is the AOI geometry type and spatial reference?    |        Open | Required before deciding renderer, selection behavior and clustering strategy.                                           |
| BE-011 | How large and dense is the AOI Feature Service?         |        Open | Required before deciding whether to query all AOIs eagerly or page/filter.                                               |
| BE-012 | Should `PRODUCTID` participate in AOI/Job relations?    |        Open | It may be domain-relevant, but current test field is nullable, so it should not replace `GlobalID` without confirmation. |

## 11. Notes for future updates

When backend work begins, update this document with:

- confirmed endpoints
- request/response examples
- error response shapes
- authentication assumptions
- relation calculation ownership
- known limitations

```

```
