# Product Manager backend contracts

This document is a source-of-truth document for Product Manager backend integration work.

Planning baseline: `6d18fae743a67cdc85864aa68c51cf6d79921d0c`.

The permanent BE-101 scope corrections are recorded in:

```text
src/ProductManager/docs/backend-context-review-addendum.md
```

When scope wording conflicts, the committed BE-101 addendum takes precedence over the original BE-101 report and earlier roadmap wording.

The contracts below are implementation targets. Exact controller, service, repository, DTO, and route placement must be aligned with the current backend structure before code is changed.

## Confirmed constraints

The following decisions are fixed unless the project owners explicitly reopen them:

- `DatasetLockService` uses the existing separate Windows lock-file framework under `%ProgramData%`. It remains the authority that prevents concurrent operations on the same Product.
- Do not add database locks, lock tables, Product lock fields, distributed locks, a second Product lock, or a replacement lock service.
- Job state is for visibility, recovery, and frontend status. It must not replace or compete with the existing lock-file behavior.
- Use the background-job framework already present in the backend. Do not introduce a second job framework.
- Avoid Product database and geodatabase schema changes while database administrators are unavailable.
- Continue using `datasetName` as the temporary Product identifier until a permanent Product ID is introduced by the database owners.
- Do not implement report storage or report-content APIs until the IC-ENC and internal validation processes are defined.
- Product History is an audit log. It is not a mechanism for reconstructing historical map snapshots.
- Global map timeline is a separate, deferred feature that requires a deliberate snapshot/history architecture decision.
- Analyze continues to load one Product per request. A multi-Product Analyze endpoint is not planned.
- Analyze geometry is not changed in BE-102. A structured public geometry response remains the likely long-term direction and must be handled as a separate later API-contract task.
- Authentication and authorization remain intentionally open during development and are deferred to production-readiness work.
- User-facing Usage Band labels must use the full form, such as `4 - Navigational Purpose Approach`, without adding a `Usage band` prefix.

## Mandatory backend context review

Before implementing any contract in this document, complete the checklist in:

```text
src/ProductManager/docs/backend-context-review-checklist.md
```

The implementation must preserve the existing request flow, dependency injection, response wrappers, exception handling, job infrastructure, file operations, ArcGIS integration, and test conventions unless a change is explicitly approved.

## General API conventions

### Development authentication status

Authentication and authorization remain intentionally open during development because earlier integration work encountered authentication and CORS-related issues.

Do not add authentication or authorization acceptance criteria to BE-102. API and Hangfire Dashboard protection must be addressed later as part of production readiness.

### Preserve existing routes where practical

Prefer additive changes to existing endpoints over parallel replacement endpoints when the existing route already represents the correct operation.

Do not rename or move an endpoint before all current consumers have been identified.

### Success responses

Use the backend's established typed response convention. Do not introduce a second global response envelope only for Product Manager.

For newly asynchronous operations, the response must expose at least:

```json
{
  "jobId": "12345",
  "datasetName": "101DK0040943E",
  "operationType": "ExportEdition",
  "status": "Queued",
  "statusUrl": "/api/jobs/12345"
}
```

The actual casing and wrapper must match the established backend convention after the context review.

### Error responses

Touched endpoints must return a stable machine-readable error code in addition to a user-readable message.

Preferred HTTP semantics:

- `400 Bad Request`: malformed or invalid input.
- `404 Not Found`: Product or job does not exist.
- `409 Conflict`: the requested operation cannot proceed because the Product file is already in use or the operation conflicts with current Product state.
- `422 Unprocessable Entity`: the request is valid, but the requested export target or operation variant is not supported yet.
- `500 Internal Server Error`: unexpected backend failure.

Example unsupported-target problem:

```json
{
  "title": "Export target is not supported",
  "status": 422,
  "code": "EXPORT_TARGET_NOT_SUPPORTED",
  "detail": "Only S100 exports are currently available.",
  "supportedTargets": ["S100"]
}
```

Example file-in-use conflict:

```json
{
  "title": "Product is currently in use",
  "status": 409,
  "code": "PRODUCT_FILE_IN_USE",
  "detail": "Another Product operation is using 101DK0040943E. Try again when the current operation has completed.",
  "datasetName": "101DK0040943E"
}
```

Do not create an application-level lock to produce this response. Normalize the existing file-lock failure when the backend can identify it reliably.

## Export target contract

This section defines the BE-102 contract boundary. BE-102 implements only the readable ExportTarget contract and the matching frontend metadata.

It does not implement Hangfire jobs, job status, recovery, lock hardening, authentication, AOI changes, Dashboard changes, geometry changes, or the underlying S100 New Update operation.

### BE-102 implementation status

BE-102 is implemented with a targeted API action filter that validates `exportTarget` before the controller action runs.

Implemented public behavior:

- a missing `exportTarget` defaults to `S100`;
- an explicitly empty or whitespace-only value is invalid;
- names are matched case-insensitively;
- canonical documentation and metadata use `All`, `S100`, and `S57`;
- `Both`, numeric values, numeric-looking values, and unknown text return `400 Bad Request` with `code: EXPORT_TARGET_INVALID` and `allowedTargets: ["All", "S100", "S57"]`;
- `All` and `S57` return `422 Unprocessable Entity` with `code: EXPORT_TARGET_NOT_SUPPORTED` and `supportedTargets: ["S100"]`;
- validation completes before Product lookup, locking, ArcGIS/file work, attachments, and repository/history mutation;
- `S100` New Edition preserves the existing export operation;
- `S100` New Update preserves the existing `501 Not Implemented` `ApiResponse`.

`GET /Lookup/exportformats` now returns this exact response shape:

```json
[{ "Name": "All" }, { "Name": "S100" }, { "Name": "S57" }]
```

The lookup response no longer publishes `Both` or numeric request values.

Deployment is frontend-first or backend-first compatible because the current backend accepts the readable `S100` name and the implemented backend continues to default a missing target to `S100`. The frontend sends `exportTarget=S100` explicitly after BE-102.

### Existing operation routes

BE-102 applies the shared target parsing and validation contract to:

```http
POST /export/{name}/newedition
POST /export/{name}/newupdate
```

Rollback behavior is not changed by BE-102.

The HTTP verbs and route names remain aligned with the backend confirmed during BE-101.

### Readable export target

Limit the public `exportTarget` contract to the readable values `All`, `S100`, and `S57`.

Preferred query parameter:

```http
?exportTarget=S100
```

Public contract values:

```text
All
S100
S57
```

The internal enum may retain numeric assignments, but public requests and OpenAPI/Swagger documentation must use the readable names.

ASP.NET enum model binding previously accepted both enum names and numeric enum values. BE-102 validates the raw query value before controller execution, so numeric values and the legacy name `Both` are not part of the public contract.

Requests such as the following are rejected:

```http
?exportTarget=1
```

Consumer review found no verified numeric consumer and no deployment-order requirement. Numeric legacy support is not included.

### Shared parsing and validation

New Edition and New Update must use the same target parsing and target validation contract.

The expected validation order is:

1. Reject an invalid or numeric target.
2. Reject `All` and `S57` as valid but unsupported targets.
3. Allow a valid `S100` target to reach the operation-specific endpoint behavior.

For New Update, step 3 must retain the endpoint's existing not-implemented response.

If the current backend architecture makes this ordering unsuitable, implementation must not silently choose another order. The deviation must be documented as an open BE-102 question before runtime code is changed.

### New Update clarification

BE-102 implements only the readable ExportTarget contract.

The existing New Update operation remains unimplemented. For a valid `S100` target, the endpoint must retain its current not-implemented behavior until a separate work package implements S100 Update.

BE-102 must not add the underlying generation or export logic for New Update.

### Expected behavior after BE-102

| Operation   | Target                   | Expected backend behavior                    | Frontend state |
| ----------- | ------------------------ | -------------------------------------------- | -------------- |
| New Edition | `S100`                   | Execute the existing S100 Edition export     | Enabled        |
| New Edition | `All`                    | Return an explicit unsupported-target error  | Disabled       |
| New Edition | `S57`                    | Return an explicit unsupported-target error  | Disabled       |
| New Edition | numeric `0`, `1`, or `2` | Return `400` with `EXPORT_TARGET_INVALID`    | Not sent       |
| New Update  | `S100`                   | Retain the existing not-implemented response | Disabled       |
| New Update  | `All`                    | Return an explicit unsupported-target error  | Disabled       |
| New Update  | `S57`                    | Return an explicit unsupported-target error  | Disabled       |
| New Update  | numeric `0`, `1`, or `2` | Return `400` with `EXPORT_TARGET_INVALID`    | Not sent       |

Only S100 Edition is operational and enabled.

### Frontend export configuration

Every export leaf must have explicit metadata, even while the leaf is disabled:

```js
{
  target: "S100",
  exportType: "Edition",
  implemented: true,
}
```

Disabled future leaves must retain their intended metadata:

```js
{
  target: "S57",
  exportType: "Update",
  implemented: false,
}
```

The complete frontend leaf set is:

- All Edition;
- All Update;
- S100 Edition;
- S100 Update;
- S57 Edition;
- S57 Update.

Only S100 Edition is enabled. S100 Update remains disabled because the backend operation remains unimplemented. Disabled leaves must not dispatch requests.

### BE-102 acceptance boundary

BE-102 requires:

- readable `All`, `S100`, and `S57` target parsing;
- explicit support validation that allows only `S100`;
- shared parsing and validation for New Edition and New Update;
- correct OpenAPI/Swagger documentation;
- frontend metadata for all six leaves;
- only S100 Edition enabled;
- relevant backend and frontend tests.

BE-102 explicitly excludes:

- Hangfire or other async-job changes;
- job-status or active-job visibility changes;
- retry, idempotency, recovery, cleanup, or lock hardening;
- authentication or authorization changes;
- AOI, Dashboard, or geometry runtime changes;
- implementation of S100 New Update;
- Product database or geodatabase schema changes.

## Async operation and job-status contract

This contract belongs to BE-104 and BE-105. It is outside BE-102.

### Goal

Long-running Export and Rollback operations should be moved into the backend's existing background-job framework when the current synchronous behavior is no longer acceptable.

The first goal is reliable job visibility and recovery, not a new concurrency system.

### Non-goals

Do not:

- add a Product lock table;
- add lock fields to Product records;
- replace Windows file locking;
- introduce a second background-job framework;
- fabricate progress percentages when the underlying operation has no measurable stages;
- enable automatic retries before idempotency and partial-output behavior are understood.

### Start response

The existing operation endpoint may become asynchronous and return:

```http
202 Accepted
```

Minimum response data:

```json
{
  "jobId": "12345",
  "datasetName": "101DK0040943E",
  "operationType": "ExportEdition",
  "exportTarget": "S100",
  "status": "Queued",
  "createdAt": "2026-07-17T08:30:00Z",
  "statusUrl": "/api/jobs/12345"
}
```

Rollback uses the same model without `exportTarget`.

### Job status

A status endpoint must return at least:

```text
Queued
Running
Succeeded
Failed
Cancelled
```

Minimum response data:

```json
{
  "jobId": "12345",
  "datasetName": "101DK0040943E",
  "operationType": "ExportEdition",
  "exportTarget": "S100",
  "status": "Running",
  "createdAt": "2026-07-17T08:30:00Z",
  "startedAt": "2026-07-17T08:30:03Z",
  "completedAt": null,
  "message": "Export is running.",
  "error": null
}
```

A failed job must expose a safe user-facing message and a correlation identifier. Internal stack traces must remain in backend logs.

### Progress

Progress is optional.

Only add progress when the current export/rollback implementation has real, stable stages or measurable units. Valid progress examples include:

```json
{
  "current": 2,
  "total": 5,
  "label": "Creating S-100 package"
}
```

Do not return arbitrary percentages based only on elapsed time.

### Product-level active status

A Product-level active-job endpoint is useful but is phase 2 of the job work.

It may be implemented only when the existing job framework can expose or index Product metadata without a Product database schema change.

Conceptual response:

```json
{
  "datasetName": "101DK0040943E",
  "activeJobs": [
    {
      "jobId": "12345",
      "operationType": "ExportEdition",
      "exportTarget": "S100",
      "status": "Running",
      "startedAt": "2026-07-17T08:30:03Z"
    }
  ]
}
```

This endpoint is informational. It must not be treated as the concurrency authority. A race can still occur between reading status and starting an operation, and the existing file-lock behavior remains decisive.

If the current job framework cannot support efficient Product lookup without new persistence, retain job-by-ID status first and defer cross-user pre-visibility.

### Retry policy

Export and Rollback jobs must not use automatic retries until all of the following are confirmed:

- the operation is idempotent, or a retry-safe operation key exists;
- partial files are cleaned up safely;
- a repeated ArcGIS operation cannot corrupt or duplicate output;
- the current backend can distinguish transient failures from business failures.

Until then, configure the operation according to existing backend conventions with automatic retry disabled or explicitly limited.

## AOI endpoint performance contract

### Current goal

Reduce time to first usable map state without changing Product or geodatabase schema.

### Required measurement

Before optimization, instrument the current request path and capture timings for:

- controller entry to response completion;
- AOI/geometric data retrieval;
- Product state retrieval;
- per-Product mapping and normalization;
- ArcGIS or file-based dispatch;
- JSON serialization;
- payload size before and after compression.

### Optimization order

Apply changes in this order:

1. Confirm whether a sequential per-Product lookup or other N+1 pattern exists in the current committed backend.
2. Replace confirmed N+1 reads with an existing or new batch repository method that uses the current schema.
3. Remove duplicate mapping, parsing, and serialization work.
4. Confirm response compression for the actual hosting path.
5. Evaluate short-lived caching only for data whose freshness rules are understood.
6. Re-measure.
7. Consider incremental loading or pagination only if the measured source can produce real subsets without first loading the complete result.

Do not implement fake pagination that loads the full dataset before applying `Skip`/`Take`; it reduces response size but not backend latency.

### Incremental loading

Incremental loading is valuable when it improves time to first rendered Products.

Possible designs must be selected only after the data source is understood:

- metadata-first response followed by geometry pages;
- true source-level paging;
- server-side cached result with page retrieval;
- streaming/chunked response if compatible with the hosting and frontend stack.

The frontend already supports progressive rendering patterns and should preserve map viewpoint, filters, popup state where possible, and a clear progress model.

## Dashboard paging and server-side filtering

### Goal

Prepare the Dashboard for a larger audit-log volume before activity growth becomes a user-visible problem.

### Required behavior

The backend must support:

- date range;
- search text;
- Product filter;
- activity/operation type;
- status/outcome;
- important-only filter;
- report availability filter when report metadata exists;
- deterministic descending ordering;
- bounded page size;
- continuation information;
- summary values calculated across the complete filtered result, not only the returned page.

### Paging strategy decision

Use cursor paging when the current activity source has a stable immutable tie-breaker such as an event ID.

If no stable event ID exists yet, use deterministic offset/page paging temporarily and document its limitations. Do not invent the future permanent Product ID as an activity tie-breaker.

The context review must identify:

- the current activity source;
- the current ordering fields;
- whether events have a stable unique ID;
- whether summaries are computed in SQL, repository code, or application memory;
- all current consumers of `/electronicproducts/dashboard`.

### Conceptual paged response

```json
{
  "items": [],
  "page": {
    "limit": 100,
    "nextCursor": null,
    "hasMore": false,
    "total": 0
  },
  "summary": {},
  "statusSummary": [],
  "operationSummary": []
}
```

The exact wrapper and property casing must match the backend's established conventions.

### Backward compatibility

Do not change the response shape of the current Dashboard endpoint until all consumers are known.

Choose one of these approaches after discovery:

1. additive optional paging parameters with a coordinated frontend migration;
2. a versioned/paged endpoint while the existing endpoint remains temporarily available;
3. a single breaking change only when Product Manager is confirmed as the sole consumer and backend/frontend are deployed together.

## Usage Band presentation

The API must continue to preserve both the numeric ID and the full description.

Conceptual data:

```json
{
  "id": 4,
  "description": "Navigational Purpose Approach"
}
```

The frontend-visible labels must use the full text:

```text
1 - Navigational Purpose Overview
2 - Navigational Purpose General
3 - Navigational Purpose Coastal
4 - Navigational Purpose Approach
5 - Navigational Purpose Harbour
6 - Navigational Purpose Berthing
```

The filter value should continue to use the stable ID.

This is expected to be a frontend formatting change unless the current endpoint drops either field.

## Product History contract

Product History is an audit log for one Product.

It must answer:

- what happened;
- when it happened;
- who or what initiated it;
- whether it succeeded or failed;
- why it failed when that information is useful and safe to expose.

Conceptual event:

```json
{
  "eventId": "event-123",
  "datasetName": "101DK0040943E",
  "eventType": "InternalValidation",
  "outcome": "Failed",
  "occurredAt": "2026-07-17T08:30:00Z",
  "actor": "DOMAIN\\user",
  "title": "Internal validation failed",
  "description": "The Product did not pass internal validation.",
  "reason": "Invalid feature association",
  "correlationId": "correlation-456",
  "jobId": null,
  "reportId": null
}
```

Failed Validation, Export, Rollback, report processing, and similar operationally important events must be representable.

The backend may also record lower-priority failures such as Freeze failures. The frontend decides how prominently each event is displayed; the persistence model should not prevent useful diagnostics.

Job progress updates should not become separate history events unless they represent meaningful milestones. Final success or failure should be recorded.

## Analyze geometry contract

Analyze geometry is not changed in BE-102.

The likely long-term public API shape is a structured JSON geometry value rather than a JSON-encoded string:

```json
{
  "aoiGeometry": {
    "rings": [],
    "spatialReference": {
      "wkid": 4326
    }
  }
}
```

Internal ArcGIS `ToJson()` and `ImportFromJson()` use may remain unchanged. The later contract task should separate internal ArcGIS serialization from the public response DTO where practical.

Do not change the current public geometry serialization until a separate API-contract task confirms:

- why the current shape exists;
- every backend and frontend consumer;
- whether the same DTO is reused elsewhere;
- whether ArcGIS or file integrations require the string representation;
- whether a dedicated response DTO can improve the Product Manager contract without changing internal models.

Analyze continues to perform one Product lookup per request.

## Reports

Report implementation is blocked pending IC-ENC and internal validation process decisions.

Do not build permanent report storage, report IDs, or report-content endpoints yet.

Keep the future contract requirements documented:

- report identifier;
- report type;
- Product reference;
- job/history/activity references where applicable;
- generation status;
- generated timestamp;
- safe error details;
- content or download URL.

Frontend report actions remain disabled or unavailable until real metadata exists.

## Global map timeline

The desired feature is historical map reconstruction, for example:

```text
Show how the map looked on 13 July at 12:00.
```

This cannot be derived reliably from the current Product audit log unless every spatial and attribute change is reconstructable.

Potential architectures include:

- periodic full snapshots;
- database temporal history plus a reconstruction layer;
- ArcGIS/geodatabase archiving;
- event sourcing with complete spatial deltas.

This is not considered out-of-the-box functionality for the current application. It requires an architecture and data-retention decision by the relevant owners and may require database or geodatabase administration.

Status: deferred, very nice to have.

## Permanent Product ID

A permanent Product ID is planned but depends on database readiness.

Until then:

- keep `datasetName` as the API and frontend key;
- do not invent a frontend-only permanent ID;
- do not add a replacement ID field as part of unrelated backend work;
- design new DTOs so a future `productId` can be added without removing `datasetName` immediately.

## Standardization across backend developers

Standardization must be incremental and must use the current backend framework.

For each touched endpoint:

- use the established success wrapper or typed response convention;
- use one established error mechanism;
- include stable machine-readable error codes;
- include correlation IDs for unexpected and job failures;
- document request and response DTOs in OpenAPI;
- add tests for validation, unsupported variants, conflicts, and unexpected failures;
- avoid controller-specific ad hoc JSON objects when a shared convention already exists.

Do not perform a repository-wide response rewrite as part of the first Product Manager backend task.
