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
- exposes an AOI service facade with a stable API result shape
- includes provisional AOI normalization helpers for likely identifier and display fields

Current limitations:

- real AOI querying is not implemented in the AOI service yet
- AOI popup content is placeholder-only
- AOI renderer is not connected to Job summaries yet
- AOI load/empty/error states are only partially represented through map status
- AOI clustering is deferred until real geometry characteristics are known

Provisional AOI field candidates:

```txt
Identifier:
id
aoiId
aoi_id
globalId
GlobalID
OBJECTID
ObjectID
objectid

Display name:
name
Name
title
Title
aoiName
aoi_name
```

These field candidates are not a backend contract. They are only temporary frontend fallbacks until the actual Feature Service fields are confirmed.

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

| ID     | Question                                                | Status | Notes                                                                           |
| ------ | ------------------------------------------------------- | -----: | ------------------------------------------------------------------------------- |
| BE-001 | Will the backend provide AOI/Job relations directly?    |   Open | Important for relation service design.                                          |
| BE-002 | Will backend calculate spatial intersections?           |   Open | Preferred if backend has authoritative geometry access.                         |
| BE-003 | What Job fields are guaranteed?                         |   Open | Needed before final normalization.                                              |
| BE-004 | Can updating a Job return newly created follow-up Jobs? |   Open | Useful for cyclic work UX.                                                      |
| BE-005 | Will status updates support conflict responses?         |   Open | Useful for multi-user safety.                                                   |
| BE-006 | Will AOI Feature Service require authentication?        |   Open | Important for config/security. Do not add tokens or credentials to source code. |
| BE-007 | Which AOI fields are stable identifiers?                |   Open | Required for relations and popups. Current frontend candidates are provisional. |
| BE-008 | Will priority be returned as a current computed value?  |   Open | Frontend should not compute long-term priority.                                 |
| BE-009 | What AOI field should be used as the display name?      |   Open | Required before replacing placeholder AOI popup content.                        |
| BE-010 | What is the AOI geometry type and spatial reference?    |   Open | Required before deciding renderer, selection behavior and clustering strategy.  |
| BE-011 | How large and dense is the AOI Feature Service?         |   Open | Required before deciding whether to query all AOIs eagerly or page/filter.      |

## 11. Notes for future updates

When backend work begins, update this document with:

- confirmed endpoints
- request/response examples
- error response shapes
- authentication assumptions
- relation calculation ownership
- known limitations
