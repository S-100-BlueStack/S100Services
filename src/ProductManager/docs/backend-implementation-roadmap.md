# Product Manager backend implementation roadmap

Current reviewed runtime baseline: `7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd`.

This roadmap converts the current backend discussions into bounded implementation packages. It exists to prevent later work from introducing new architecture assumptions, database changes, or concurrency mechanisms without an explicit decision.

The contract source-of-truth documents are:

```text
src/ProductManager/BACKEND_CONTRACTS.md
src/ProductManager/docs/backend-context-review-addendum.md
```

The addendum takes precedence when scope wording conflicts with the original BE-101 report or earlier roadmap wording.

The mandatory discovery checklist is:

```text
src/ProductManager/docs/backend-context-review-checklist.md
```

## Fixed project decisions

These decisions apply to every work package:

1. The current runtime uses `DatasetLockService` and the Windows lock-file framework under `%ProgramData%` as the final execution-time concurrency authority on the current single execution host.
2. The implemented active-job endpoint is visibility and preflight, not an atomic enqueue claim.
3. Do not add a second lock or operation registry without a separately approved distributed-ownership design package.
4. Do not change Product database or geodatabase schema while the relevant administrators are unavailable unless an explicitly approved operation-registry package requires separate persistence.
5. BE-106 confirms that ProductManagerAPI remains the public API/enqueue/status owner while worker hosting may later move to JobPlatform. No runtime move is approved by BE-106.
6. Do not introduce a competing background-job system.
7. Keep `datasetName` until the planned permanent Product ID is introduced by the database owners.
8. Reports remain blocked pending IC-ENC/internal validation process and API decisions.
9. Product History is an audit log, not a historical-map reconstruction system.
10. Global map timeline is deferred and must not be smuggled into Product History work.
11. Analyze continues to request one Product at a time.
12. Analyze geometry is unchanged in BE-102. A structured public response is a separate later contract task; internal ArcGIS `ToJson()`/`ImportFromJson()` use may remain.
13. Usage Band labels use the full form, for example `4 - Navigational Purpose Approach`.
14. Authentication and authorization remain intentionally open during development and are deferred to production-readiness work.
15. Backend changes must follow the existing controller/service/repository/job/error conventions after the full context review.
16. Frontend and backend changes for one contract should be delivered together or in a deployment-safe order.

## Work package status

| ID     | Area                                        | Status   | Database/geodatabase change | Primary dependency                                        |
| ------ | ------------------------------------------- | -------- | --------------------------- | --------------------------------------------------------- |
| BE-101 | Full backend context review                 | Complete | No                          | Current backend source and tests                          |
| BE-102 | Readable ExportTarget contract              | Complete | No                          | Verified export controller/service contract               |
| FE-101 | Usage band label                            | Complete | No                          | Existing Usage band ID + description payload              |
| BE-103 | AOI profiling and optimization              | Complete | No                          | Measured request path                                     |
| BE-104 | Async Export/Rollback jobs                  | Complete | No                          | Existing Hangfire SQL storage and Product operation code  |
| BE-105 | Backend-authoritative active job visibility | Complete | No                          | Product Manager Hangfire metadata and monitoring API      |
| BE-106 | External shared worker readiness review     | Complete | No                          | Product Manager baseline and JobPlatform target direction |
| BE-107 | Dashboard filtering and pagination          | Complete | No                          | Existing JobTable history and stable activity ID          |
| BE-108 | Product History failure hardening           | Planned  | No assumption               | Validation/history producer contract                      |
| BE-109 | Report storage/content                      | Blocked  | Unknown                     | IC-ENC and internal validation process/API                |
| BE-110 | Permanent Product ID                        | Blocked  | Yes                         | Database owners                                           |
| BE-111 | Historical global map timeline              | Deferred | Likely                      | Architecture and retention decision                       |

## Implementation order

Recommended order:

1. BE-101 through BE-107 are complete at the current implementation baseline `7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd`.
2. BE-108: Product History failure/event contract hardening when backend validation work begins.
3. Deferred: reports, permanent Product ID, global map timeline, shared-worker implementation and atomic Product-operation ownership.

Worker extraction is not the next runtime package. It remains deferred until JobPlatform is ready and a separate implementation package is explicitly approved.

The small frontend Usage band task may be completed in parallel with backend work after the current payload shape is confirmed.

---

## BE-101: Full backend context review

### Purpose

Create a verified map of the current backend before changing any Product Manager endpoint.

This is a required implementation step, not optional documentation cleanup.

### Why it comes first

The backend is shared and contains existing conventions that must be preserved. Earlier planning identified possible Hangfire, repository, ProblemDetails, ArcGIS, and serialization behavior, but implementation must not rely on partial repository views or memory.

The review must establish the actual current state at the selected commit.

### Required output

Create a context report containing:

- backend baseline commit;
- local working-tree status;
- relevant project and solution paths;
- controller-to-service-to-repository flow for Export, Rollback, AOI, Dashboard, Analyze, Product History, Freeze/Unfreeze, and Send to IC-ENC;
- current background-job framework and configuration;
- current file-lock failure behavior;
- current response and exception conventions;
- current DTOs and enum binding behavior;
- current tests and test project conventions;
- known consumers of each endpoint;
- safe extension points;
- explicit items that require administrator or architecture-owner involvement.

Use the template in `backend-context-review-checklist.md`.

### Prohibited during this work package

Do not change runtime code while the context report is incomplete.

Do not infer missing backend behavior from frontend code alone.

### Acceptance criteria

- Every route touched by the later work packages has a traced request path.
- The actual export target parameter name, type, default, and current numeric behavior are documented.
- The actual HTTP verbs for `newedition`, `newupdate`, and `rollback` are documented.
- The current job framework is confirmed from code and configuration.
- File lock exceptions are reproduced or traced to their current handling path.
- Current error wrappers and global exception handling are documented.
- Current backend tests can be run, or the reason they cannot be run is documented.
- No runtime files are changed.

### Estimated effort

Approximately 0.5-1.5 working days, depending on backend size and test setup.

---

## BE-102: Readable ExportTarget contract

### Purpose

Status: Implemented against baseline `fcbcaacd85f5c802bf76d6ec3c73cb5d9097c888`.

Limit the public `exportTarget` contract to the readable values `All`, `S100`, and `S57` while preparing frontend metadata for all export leaves.

BE-102 changes the target contract only. It does not implement async jobs, job status, recovery, lock hardening, authentication, AOI work, Dashboard work, geometry changes, or S100 New Update generation.

### Existing routes

```http
POST /export/{name}/newedition
POST /export/{name}/newupdate
```

Rollback runtime behavior is unchanged by BE-102.

### Contract decision

The public parameter name remains `exportTarget`. A missing value defaults to `S100`, while an explicitly empty or whitespace-only value is invalid. Parsing is case-insensitive, and documentation uses the canonical forms `All`, `S100`, and `S57`.

Consumer review found no numeric compatibility requirement. `Both`, numeric and numeric-looking values, and unknown text return `400` with `EXPORT_TARGET_INVALID`. `All` and `S57` return `422` with `EXPORT_TARGET_NOT_SUPPORTED`.

Public values:

```text
All
S100
S57
```

Preferred request:

```http
/export/101DK0040943E/newedition?exportTarget=S100
```

OpenAPI/Swagger must present the readable values rather than requiring API consumers to know internal enum assignments.

ASP.NET enum model binding previously accepted enum names and numeric values. BE-102 validates the raw query value before controller execution. Numeric values and the legacy name `Both` are invalid, and consumer review found no reason to add temporary compatibility.

### New Update boundary

BE-102 implements only the readable ExportTarget contract.

The existing New Update operation remains unimplemented. For a valid `S100` target, the endpoint must retain its current not-implemented behavior until a separate work package implements S100 Update.

BE-102 must not add the underlying generation or export logic for New Update.

### Shared validation order

New Edition and New Update must share target parsing and validation.

The expected order is:

1. Reject an invalid or numeric target.
2. Reject `All` and `S57` as valid but unsupported targets.
3. Allow a valid `S100` request to reach the operation-specific behavior.

For New Update, the operation-specific behavior in step 3 is the existing not-implemented response.

If current backend architecture makes this order unsuitable, do not change it silently. Record the deviation as an open BE-102 question before implementation.

### Expected behavior after BE-102

| Operation   | Target                   | Expected backend behavior                    | Frontend state |
| ----------- | ------------------------ | -------------------------------------------- | -------------- |
| New Edition | `S100`                   | Execute the existing S100 Edition export     | Enabled        |
| New Edition | `All`                    | Explicit unsupported-target error            | Disabled       |
| New Edition | `S57`                    | Explicit unsupported-target error            | Disabled       |
| New Edition | numeric `0`, `1`, or `2` | Return `400` with `EXPORT_TARGET_INVALID`    | Not sent       |
| New Update  | `S100`                   | Retain the existing not-implemented response | Disabled       |
| New Update  | `All`                    | Explicit unsupported-target error            | Disabled       |
| New Update  | `S57`                    | Explicit unsupported-target error            | Disabled       |
| New Update  | numeric `0`, `1`, or `2` | Return `400` with `EXPORT_TARGET_INVALID`    | Not sent       |

### Backend tasks

1. Review all current consumers and deployment order.
2. Add one shared parser and validator for New Edition and New Update.
3. Limit public values to `All`, `S100`, and `S57`.
4. Allow only `S100` as a supported target.
5. Reject `All` and `S57` with the established explicit unsupported-target response.
6. Reject numeric targets and the legacy name `Both` with `EXPORT_TARGET_INVALID`.
7. Preserve New Edition's existing S100 behavior.
8. Preserve New Update's existing not-implemented behavior for a valid S100 target.
9. Document the contract and examples in OpenAPI/Swagger.
10. Add backend tests for valid names, casing policy, missing target behavior, invalid target, numeric target, unsupported target, and New Update's retained not-implemented behavior.

### Frontend tasks

1. Give every export leaf explicit `target` and `exportType` metadata:
   - All Edition;
   - All Update;
   - S100 Edition;
   - S100 Update;
   - S57 Edition;
   - S57 Update.
2. Send `exportTarget=S100` for the enabled S100 Edition action.
3. Keep only S100 Edition enabled.
4. Keep S100 Update disabled because the backend operation remains unimplemented.
5. Keep All Edition, All Update, S57 Edition, and S57 Update disabled.
6. Ensure disabled leaves cannot dispatch requests through keyboard, stale DOM, or direct action handling.
7. Preserve current loading, conflict, confirmation, refresh, and notice behavior.
8. Add or update frontend metadata, availability, and API request tests.

### Response handling

Unsupported target responses must become normal user-facing notices, not generic unexpected errors.

Recommended stable code:

```text
EXPORT_TARGET_NOT_SUPPORTED
```

### Out of scope

- Implementing All export behavior.
- Implementing S57 export behavior.
- Implementing S100 New Update generation or export behavior.
- Enabling the S100 Update frontend leaf.
- Hangfire or other async-job changes.
- Job-status or Product-level active-job visibility changes.
- Retry, idempotency, recovery, cleanup, or lock-hardening changes.
- Authentication or authorization changes.
- AOI profiling or optimization.
- Dashboard filtering or pagination.
- Analyze or other geometry runtime changes.
- Product database or geodatabase schema changes.

### Acceptance criteria

- Swagger/OpenAPI shows `All`, `S100`, and `S57` as the public target values.
- S100 New Edition continues to execute the existing export.
- `All` and `S57` receive an explicit unsupported-target response for both New Edition and New Update.
- Numeric `0`, `1`, and `2` and the legacy name `Both` are rejected with `EXPORT_TARGET_INVALID`.
- New Edition and New Update use the same target parsing and validation contract.
- S100 New Update remains unimplemented and its frontend leaf remains disabled.
- BE-102 only applies the shared target parsing and validation contract to the New Update endpoint.
- Frontend metadata exists for all six export leaves.
- Only S100 Edition is enabled.
- Relevant backend and frontend tests pass.
- No Hangfire, job-status, lock, recovery, authentication, AOI, Dashboard, or geometry runtime changes are included.
- BE-102 requires no database or geodatabase schema changes.

### Estimated effort

Approximately 1-2 working days including consumer review, frontend, backend, tests, and manual verification.

---

## FE-101: Usage band ID and description

### Purpose

Show the value users already know while preserving the descriptive terminology they are expected to learn.

Required label:

```text
4 - Navigational Purpose Approach
```

Do not display:

```text
Usage band 4 - Navigational Purpose Approach
```

### Discovery

Confirm whether the current backend payload already contains both:

- numeric/stable ID;
- description.

If both already exist, this is frontend-only.

If one field is missing, add it to the existing lookup response without changing the filter's stable value semantics.

### Frontend tasks

1. Identify the normalization path for Usage band options.
2. Preserve ID and description separately in normalized data.
3. Format visible option labels as `${id} - ${description}`, where `description` contains the full Navigational Purpose text.
4. Continue filtering by the stable ID.
5. Define fallback behavior:
   - ID only when description is absent;
   - description only only when a legacy payload lacks ID;
   - never render `undefined - value`.
6. Confirm ordering remains numeric by ID when appropriate.
7. Add tests for ID + description, missing description, missing ID, zero-count options, and persisted filter restoration.

### Acceptance criteria

- Main map filter shows `4 - Navigational Purpose Approach`.
- Existing saved filter values continue to work.
- Counts and zero-count options remain correct.
- No visible `Usage band` prefix is added to each option.
- Light/dark mode and compact layout remain correct.

### Estimated effort

Approximately 0.5-1 working day.

---

## BE-103: AOI performance instrumentation and optimization

### Purpose

Reduce the approximately observed long initial AOI load time and prepare for more Products without prematurely introducing ineffective pagination.

### Phase 1: Instrumentation

Add structured timings around the real current request path.

Minimum measurements:

- complete endpoint duration;
- AOI geometry/data source duration;
- Product state/history/status lookup duration;
- number of Products;
- number of repository/data-source calls;
- mapping/normalization duration;
- serialization duration;
- response payload bytes;
- compressed response bytes when available;
- ArcGIS/file dispatch duration where applicable.

Use the current logging framework and include a correlation/request identifier.

Do not log full geometries or sensitive file paths.

### Phase 2: Confirm actual bottleneck

The context review and timings must answer:

- Is geometry retrieval slow?
- Is there a sequential per-Product lookup?
- Is there a confirmed N+1 pattern?
- Is JSON string parsing repeated?
- Is geometry serialized more than once?
- Is ArcGIS dispatch single-threaded or serialized?
- Is response compression active end to end?
- Is network transfer or backend compute dominant?

### Phase 3: Low-risk optimization

Apply only confirmed fixes.

Potential fixes:

1. Replace a confirmed sequential per-Product repository loop with a batch read using the current schema.
2. Materialize lookup results once and reuse dictionaries.
3. Avoid repeated geometry parse/serialize cycles.
4. Avoid requesting unused Product fields.
5. Enable or verify response compression through the actual hosting path.
6. Cache stable lookup data separately from frequently changing Product state.
7. Cache AOI geometry only when freshness and invalidation are clear.
8. Preserve current endpoint response compatibility unless a coordinated change is approved.

### Phase 4: Incremental loading decision

Incremental loading is justified only when the source can return a real first subset faster than the full result.

Do not implement:

```text
load everything -> Skip/Take -> return page
```

That pattern changes payload size but not backend work or time to first response.

Evaluate these options after measurement:

- true source-level paging;
- metadata-first endpoint plus geometry pages;
- server-side cached snapshot plus page retrieval;
- streamed/chunked result if the hosting stack and frontend can consume it safely.

### Frontend considerations

If incremental loading is selected:

- render Products in stable chunks;
- keep loader progress based on actual received/rendered units;
- avoid duplicate Graphics;
- preserve filters, display-scale hiding, map viewpoint, and popup restore behavior;
- prevent auto-refresh from overlapping an incomplete initial load;
- make partial-load failure visible without discarding successfully loaded Products unless consistency requires it.

### Database constraint

Do not add indexes or schema changes during the first optimization pass.

If measurement shows a missing index is the primary bottleneck, document:

- exact query;
- execution-plan evidence;
- proposed index;
- expected benefit;
- owner/admin action required.

### Acceptance criteria

- A before/after timing report exists using the same environment and representative payload.
- The bottleneck is evidenced rather than guessed.
- Any N+1 behavior is either removed or proven not to exist.
- Response compatibility is preserved or migrated together with the frontend.
- No Product/geodatabase schema changes.
- No duplicate Products or layers appear during initial load or refresh.
- `npm run check` passes for frontend changes.
- Relevant backend tests pass.

### Estimated effort

- Instrumentation and low-risk optimization: 1-3 working days.
- Genuine incremental backend/frontend loading, if still needed: an additional 4-7 working days.

---

## BE-104: Async Export/Rollback jobs

### Implementation status

BE-104 is complete. BE-104A backend work is committed at `7fe500aafb5831e71dd766f07bb118b3d8e08aea`. BE-104B frontend activation and the related BE-105 visibility integration are committed at `279fe6a761229fd99af437d0f8401508985afafc`. Popup-preserving terminal refresh is committed at `69752605d935212e89ca7ad4286ca3e46ecb4abe`.

The implementation provides additive async start endpoints, application-owned Hangfire metadata, job-by-ID status, authoritative Product-version validation, a persistent-handle dataset lock, an execution guard, zero automatic retries, persisted frontend polling, reload recovery and terminal route refresh. The existing synchronous endpoints remain available for compatibility, but normal popup Export/Rollback actions use the async contract.

### Purpose

Stop long-running Export/Rollback work from depending on one open HTTP request and provide recoverable backend job state.

### Required architectural rule

Use the background-job framework already configured in the current backend.

If the current framework is Hangfire, extend the existing Hangfire setup. If the context review finds a different current framework, use that framework.

Do not add another job system.

### Concurrency rule

Windows file locking remains authoritative.

Do not add a Product lock registry.

A queued or running job status may inform users that work is active, but it must not be assumed to prevent a race. The file operation still decides whether another action can proceed.

### BE-101 risks and prerequisites

BE-101 recorded the following items for BE-104 or separate hardening work. They are not BE-102 implementation tasks:

- Export and Rollback are not currently proven idempotent.
- Default Hangfire retry behavior must not be accepted without an explicit retry decision.
- Edition/update state may be mutated before later compiler, attachment, file, or repository failures.
- The 30-minute stale-lock cleanup requires review before long-running jobs are introduced.
- `DetectProductChangesJob` does not currently use the Product lock-file framework.
- Rollback cleanup errors can be ignored by the current flow.
- SevenCs exceptions may be interpreted incorrectly by existing job code.
- ArcGIS work is serialized through the current single-thread execution model.
- Recovery and partial-output behavior must be documented before automatic retries are enabled.

These findings are prerequisites and risks. They do not authorize unrelated runtime changes without explicit BE-104 or hardening scope approval.

### Phase 1: Job execution boundary

1. Identify the current synchronous Export and Rollback service methods.
2. Keep business logic in the existing service layer.
3. Add a thin background-job entry point that invokes the existing service.
4. Pass stable primitive/DTO arguments, not request-scoped services or complex runtime objects.
5. Preserve authenticated requester information only in the form supported by the current job framework and audit model.
6. Use the existing job queue configuration.
7. If ArcGIS/file processing requires serialized execution, use the existing queue/worker controls rather than adding Product locks.
8. Determine safe cancellation behavior; do not expose Cancel until the operation can actually stop safely.

### Phase 2: Start endpoint

Convert or add an additive async path that returns `202 Accepted` and:

- job ID;
- Product name;
- operation type;
- export target where relevant;
- queued status;
- status URL.

Deployment order must prevent an old frontend from misreading a new response shape.

Choose one after consumer review:

- coordinated breaking change;
- optional async mode;
- versioned/additive endpoint.

### Phase 3: Job status by ID

Expose job state through an application-owned endpoint rather than exposing the job framework dashboard or raw storage model.

Map framework-specific states to Product Manager states:

```text
Queued
Running
Succeeded
Failed
Cancelled
```

Return safe messages and a correlation ID for failures.

### Retry decision

Review existing automatic retry behavior.

Until idempotency is proven:

- disable automatic retry for Export and Rollback, or
- limit it explicitly according to existing project conventions;
- document partial-output cleanup;
- test process restart and worker failure behavior.

### History integration

When Product History supports the required event model:

- create one meaningful start/queued event only if operationally useful;
- create final success or failure event;
- do not flood history with polling/progress records;
- include job ID/correlation ID where useful.

### Frontend tasks

1. Accept `202` job-start responses.
2. Store job ID in the central Product operation state.
3. Poll status with bounded backoff and abort support.
4. Resume polling after a route reload when a known job ID is available.
5. Stop polling on terminal state.
6. Refresh the selected Product and relevant map data after success.
7. Show a persistent error notice after failure.
8. Keep static loading/status text for RDP/VDI.
9. Preserve current action availability behavior.
10. Do not show fake progress when backend only returns state.

### Acceptance criteria

- HTTP request returns quickly with `202` and a job ID.
- Export or Rollback continues after the initiating browser tab closes.
- Job status survives API process restart according to the existing framework's persistence behavior.
- Frontend reaches a terminal state without an indefinite spinner.
- Failure exposes a safe message and correlation ID.
- Existing file-lock conflicts remain correctly handled.
- No new Product lock or Product DB field exists.
- Automatic retry behavior is explicit and tested.
- S100 Edition and Rollback results match the previous synchronous business behavior.

### Estimated effort

Approximately 3-6 working days after the context review, depending on current job abstractions and deployment compatibility requirements.

---

## BE-105: Product-level active job visibility

### Status

Complete at `279fe6a761229fd99af437d0f8401508985afafc`.

### Implemented contract

```http
GET /jobs/active?datasetName={datasetName}
```

The endpoint returns active Product Manager jobs for one exact, case-insensitive Product name when public status is `Queued` or `Running`. It uses application-owned job metadata from the shared Hangfire storage.

The frontend reconciles this state when a popup opens, while it remains open, on relevant browser lifecycle events and before any Product mutation. Local storage and `BroadcastChannel` remain same-browser optimizations. Backend state provides shared visibility across users and computers.

### Remaining limitation

The lookup is not atomic with enqueue. Two near-simultaneous clients can both pass preflight before either job is visible. The dataset lock prevents simultaneous execution, but an extra job may be queued and later fail with `DATASET_BUSY`.

This limitation is accepted until a separately approved atomic Product-operation ownership package defines persistence, recovery and ownership semantics.

### Acceptance status

- Cross-tab visibility: verified.
- Cross-browser-profile/user/computer visibility: verified against shared backend storage.
- Reload recovery and terminal polling: verified.
- Fail-closed preflight when active-job status is unavailable: implemented.
- Stable popup/action/dropdown refresh: verified at `69752605d935212e89ca7ad4286ca3e46ecb4abe`.

---

## BE-106: External worker readiness review

### Status

Complete as documentation/readiness analysis against Product Manager baseline `0e79bf9fd95b606256160fe98d1daaa6011ceb7c`.

Detailed review:

```text
src/ProductManager/docs/be-106-external-worker-readiness.md
```

### Confirmed direction

- ProductManagerAPI remains the Product Manager HTTP API.
- ProductManagerAPI continues to own enqueue validation and public job/status responses.
- Hangfire Server/worker execution may later move to `JobPlatform.Worker`.
- Selected scheduled tasks may later move, but each task requires an explicit migration decision.
- BE-106 makes no runtime, queue, project-reference, storage or scheduled-task changes.

### Primary findings

1. The async Export/Rollback API contract can remain unchanged when worker hosting moves.
2. The current strongly typed Hangfire job requires compatible type/method identity, serializer settings and assemblies in the future worker.
3. Product Manager execution depends on Windows/x64, ArcGIS Core/CoreHost, ProductManagerCore, Product Manager databases, compiler/export assets, connection files and shared filesystem access.
4. The current `%ProgramData%` dataset lock is machine-local unless all executions use the same lock namespace. Dual-host or multi-worker Product mutations require an approved shared ownership design.
5. `DetectProductChangesJob` is a high-risk scheduled-task candidate and must not be moved automatically with initial worker extraction.
6. The current JobPlatform separation is a suitable future host pattern, but its implementation baseline and final module/queue design must be recorded when the platform is ready.

### Boundary

No worker extraction is approved. Do not remove `AddHangfireServer()`, add a Product Manager queue, move jobs, change Hangfire storage, add an operation registry or modify scheduled-task registration under BE-106.

### Future implementation gate

A later shared-worker package may begin only after:

- JobPlatform has a stable recorded deployment baseline;
- the external host can run Product Manager's ArcGIS and native dependencies;
- shared storage, serialization, queue and service-identity decisions are approved;
- dataset ownership/concurrency is safe across hosts;
- queue drain, cutover and rollback procedures are defined.

Atomic Product-operation ownership remains deferred and unnumbered until its persistence owner and recovery contract are approved.

---

## BE-107: Dashboard filtering and pagination

Status: Complete and manually verified against baseline `7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd`.

### Implemented contract

The existing `GET /electronicproducts/dashboard` endpoint now accepts additive server-side filters for search, Product, type, status, importance, and reports plus optional cursor paging.

The Product Manager frontend uses `pageSize=50`; the backend accepts `1-200`. Omitting `pageSize` preserves the complete filtered activity list for existing consumers. A cursor is opaque and valid only together with `pageSize`.

Filtering is applied before summaries and page selection. Summary cards, status summary, operation summary, `TotalHits`, and `Paging.Total` represent the complete filtered result. Only `Activities` and `Paging.Returned` are page-bounded.

Ordering is deterministic:

```text
Timestamp DESC
Activity Id DESC
```

The persisted `ProductRecord.Id` GUID is used as the stable activity key when available.

### Frontend behavior

- Search requests are debounced by 300 ms.
- Search text preserves the user's casing while backend matching remains case-insensitive.
- Rapid search edits supersede stale responses without routinely aborting requests in the browser Network panel.
- Immediate range, select-filter, page and manual-refresh requests abort stale in-flight requests.
- Filter and range changes reset cursor history.
- Previous/Next navigation uses an in-memory stack of opaque backend cursors.
- The last successful result stays visible during loading and individual request failures.
- Dashboard History and direct URL/reload range behavior are preserved.

### Current repository boundary

The first release keeps the existing date-bounded `GetHistoryAsync` repository query and performs mapping, filtering, summaries, and page selection in the API process. This bounds response size and browser work without a schema change, but it does not yet reduce repository row materialization.

The endpoint now logs source/filtered/returned counts and repository, mapping, filtering/paging, and total durations. SQL predicate pushdown or indexes remain evidence-driven follow-up work only if measured volume/query plans justify it.

### Acceptance status

- Paging requests are bounded to at most 200 activities.
- Legacy requests without `pageSize` remain compatible.
- Ordering and cursor boundaries are deterministic.
- Summary values use the complete filtered result.
- Filter options remain available from the complete date-bounded source.
- Frontend requests prevent stale results, and rapid search edits remain silent to the user.
- Empty results, legacy full results, invalid paging, stable equal-timestamp ordering, report filters, and paging normalization have automated coverage.
- Manual Dashboard verification confirmed that pagination works as intended at commit `7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd`.
- No Product database or geodatabase schema change is included.

### Deferred Dashboard enhancements

The following improvements are recorded for later work and are not part of BE-107 acceptance:

- user-selectable page size; the backend already accepts `1-200`, while the frontend intentionally remains fixed at `50`;
- sortable activity columns; this requires an explicit server-side sort contract and cursor semantics tied to the selected sort.

---

## BE-108: Product History failure/event hardening

### Purpose

Ensure future Validation and other important backend failures can be diagnosed through Product History.

### Current domain decision

Product History is an audit log showing what happened to one Product.

Users do not need to select a historical timestamp to reconstruct Product state from this view.

### Required event capabilities

Events must be able to represent:

- event type;
- outcome: success/failure where relevant;
- timestamp;
- actor or system process;
- concise title and description;
- safe failure reason;
- correlation ID;
- optional job ID;
- optional report ID when reports exist;
- previous/new Product values for state changes.

### Priority failures

History must support:

- internal validation failure and reason;
- Export failure;
- Rollback failure;
- report processing failure;
- Send to IC-ENC failure when operationally useful.

The backend may record Freeze/Unfreeze failures as normal audit events. The frontend can choose lower visual prominence.

### Event volume rule

Do not write every job polling state or low-level retry attempt as a separate user-facing event.

Record meaningful milestones and final outcomes.

### Timing

Do not implement speculative Validation report logic before the validation process exists.

Implement the general event contract when the backend validation/history producer work begins.

### Acceptance criteria

- A failed Validation can show a useful reason in Product History.
- A failed async Export/Rollback links to its job/correlation ID.
- Existing history rendering remains backward compatible during migration.
- User-facing messages do not expose stack traces or internal file paths.

---

## Separate future contract task: Analyze geometry response

### Scope

No Analyze geometry runtime change is part of BE-102.

The likely long-term public API direction is a structured geometry value rather than a JSON-encoded string, so the frontend does not have to parse backend serialization.

Internal ArcGIS `ToJson()` and `ImportFromJson()` use may remain unchanged. A later contract task must review all consumers and separate the public DTO from internal ArcGIS serialization where practical.

Analyze continues to load one Product per request.

### Required discovery

- Confirm every backend and frontend consumer of the current geometry string.
- Confirm why the public DTO currently exposes a JSON-encoded string.
- Confirm whether a dedicated response DTO can return structured geometry without changing internal ArcGIS/file operations.
- Define a coordinated migration and tests before changing the response shape.

Status: unscheduled separate API-contract task.

---

## Deferred: report storage and IC-ENC integration

Status: blocked by external process/API decisions.

Do not implement permanent storage or placeholder backend models that will become de facto contracts.

Maintain only the documented future metadata requirements.

Frontend actions remain disabled or unavailable.

---

## Deferred: permanent Product ID

Status: blocked by database readiness.

Continue using `datasetName`.

New DTOs should allow `productId` to be added later without immediately removing `datasetName`.

---

## Deferred: historical global map timeline

### Desired user outcome

A user can ask:

```text
How did the map look on 13 July at 12:00?
```

### Why it is separate from Product History

An audit log may describe actions but does not necessarily contain complete geometry and attribute state for every point in time.

Historical map reconstruction requires one of:

- periodic full snapshots;
- temporal database history plus reconstruction;
- ArcGIS/geodatabase archiving;
- complete spatial event sourcing/deltas.

### Decision owners

This requires Product, database/geodatabase, retention, storage, and ArcGIS architecture decisions.

It may require administrator access.

### Status

Very nice to have. Do not start during the current backend hardening sequence.

---

## Standard completion checklist for every package

### Before implementation

- Confirm latest baseline commit.
- Confirm whether local uncommitted changes exist.
- Complete relevant sections of the backend context report.
- Identify all endpoint consumers.
- Record current behavior with tests or reproducible requests.
- Confirm no database/geodatabase schema change is included.

### During implementation

- Follow existing architecture boundaries.
- Use full DTOs and shared error conventions.
- Add tests with the change.
- Do not change authentication or authorization unless the work package explicitly covers production readiness.
- Avoid unrelated cleanup.
- Keep frontend technical identifiers aligned with current backend contracts.

### Backend verification

Run the repository's actual backend build/test commands discovered during BE-101.

Also verify through Swagger or direct requests:

- success;
- invalid input;
- unsupported target/variant;
- Product not found;
- file-in-use conflict where reproducible;
- unexpected service failure;
- response casing and error code.

### Frontend verification

From the Product Manager folder:

```powershell
cd src/ProductManager
npm run check
```

Perform targeted manual tests for the changed workflow in light and dark mode and in the actual RDP/VDI environment when loading state is involved.

### Package delivery

Provide:

- ZIP with full replacement/new files in repository structure;
- implementation summary;
- changed contract summary;
- backend test commands;
- `cd src/ProductManager && npm run check` when frontend files changed;
- manual test steps;
- rollback notes;
- suggested commit message.

### BE-104/BE-105 deployment acceptance

The paused-worker metadata acceptance remains required: create a job, immediately read `GET /jobs/{jobId}`, verify complete `Queued` metadata and verify zero Product mutation before the worker resumes.

Also verify `GET /jobs/active?datasetName={datasetName}` from a second browser profile or computer while a job is queued/running, and verify that mutation preflight sends no mutation when active status cannot be read.

Before an external worker migration, repeat the complete acceptance matrix with ProductManagerAPI acting only as client/status API and the shared worker processing the dedicated Product Manager queue.
