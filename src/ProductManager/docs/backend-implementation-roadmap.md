# Product Manager backend implementation roadmap

Planning baseline: `fd111863c3119b611ba8649db0be61b098ffdb73`.

This roadmap converts the current backend discussions into bounded implementation packages. It exists to prevent later work from introducing new architecture assumptions, database changes, or concurrency mechanisms without an explicit decision.

The contract source of truth is:

```text
src/ProductManager/BACKEND_CONTRACTS.md
```

The mandatory discovery checklist is:

```text
src/ProductManager/docs/backend-context-review-checklist.md
```

## Fixed project decisions

These decisions apply to every work package:

1. Windows file locking remains the real same-Product concurrency protection.
2. Do not add an application lock table, Product lock field, distributed Product lock, or replacement lock service.
3. Do not change Product database or geodatabase schema while the relevant administrators are unavailable.
4. Use the backend framework and background-job infrastructure that already exist.
5. Do not introduce a second background-job system.
6. Job status is an observability and recovery feature, not the concurrency authority.
7. Keep `datasetName` until the planned permanent Product ID is introduced by the database owners.
8. Reports remain blocked pending IC-ENC/internal validation process and API decisions.
9. Product History is an audit log, not a historical-map reconstruction system.
10. Global map timeline is deferred and must not be smuggled into Product History work.
11. Analyze continues to request one Product at a time.
12. Usage band labels use `ID - Description`, for example `4 - Approach`.
13. Backend changes must follow the existing controller/service/repository/job/error conventions after the full context review.
14. Frontend and backend changes for one contract should be delivered together or in a deployment-safe order.

## Work package status

| ID     | Area                                   | Status                       | Database/geodatabase change | Primary dependency                                          |
| ------ | -------------------------------------- | ---------------------------- | --------------------------- | ----------------------------------------------------------- |
| BE-101 | Full backend context review            | Ready                        | No                          | Current backend source and tests                            |
| BE-102 | Readable ExportTarget contract         | Ready after BE-101           | No                          | Verified export controller/service contract                 |
| FE-101 | Usage band label                       | Ready after payload check    | No                          | Existing Usage band ID + description payload                |
| BE-103 | AOI profiling and optimization         | Ready after BE-101           | No for first pass           | Measured request path                                       |
| BE-104 | Async Export/Rollback jobs             | Planned                      | No                          | Existing background-job framework                           |
| BE-105 | Product-level active job visibility    | Conditional                  | No                          | Existing job storage must support efficient metadata lookup |
| BE-106 | Dashboard server-side filtering/paging | Planned                      | No for first release        | Stable ordering/event key review                            |
| BE-107 | Product History failure hardening      | Planned with validation work | No assumption               | Validation/history producer contract                        |
| BE-108 | Report storage/content                 | Blocked                      | Unknown                     | IC-ENC and internal validation process/API                  |
| BE-109 | Permanent Product ID                   | Blocked                      | Yes                         | Database owners                                             |
| BE-110 | Historical global map timeline         | Deferred                     | Likely                      | Architecture and retention decision                         |

## Implementation order

Recommended order:

1. BE-101: Full backend context review and implementation map.
2. BE-102: Readable ExportTarget contract and prepared frontend export configuration.
3. FE-101: Usage band ID and description presentation.
4. BE-103: AOI performance instrumentation and low-risk optimization.
5. BE-104: Async Export/Rollback jobs using the existing job framework.
6. BE-105: Job status by ID and optional Product-level active-job visibility.
7. BE-106: Dashboard server-side filtering and pagination.
8. BE-107: Product History failure/event contract hardening when backend validation work begins.
9. Deferred: reports, permanent Product ID, and global map timeline.

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

Replace opaque public values `0`, `1`, and `2` with readable target names while preparing both backend and frontend for future All/S100/S57 support.

### Existing route concepts

```http
/export/{name}/newedition
/export/{name}/newupdate
/export/{name}/rollback
```

The context review must confirm exact route attributes and HTTP verbs before implementation.

### Contract decision

Retain the public parameter name `exportTarget` unless the current source shows a strong reason to change it.

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

Public API documentation must not require users to know that the internal enum may use numeric values.

### Backend tasks

1. Locate the current export target enum or numeric parameter.
2. Preserve existing internal enum numeric assignments when they are used elsewhere.
3. Configure public binding and OpenAPI output to use readable names.
4. Determine whether numeric query values are used by any current consumer.
5. Reject numeric values after compatibility is verified.
6. Validate the target before invoking export services.
7. Allow only currently supported targets.
8. Return a structured `422` response for a valid but unsupported target.
9. Apply the same readable target contract to `newedition` and `newupdate`.
10. Do not claim that a target/mode combination is operational until the underlying service is verified.
11. Add tests for every target name, casing policy, missing target behavior, invalid target, numeric target, and unsupported target.
12. Update OpenAPI/Swagger examples.

### Current support policy

- `New edition + S100`: supported and used by the frontend.
- `New edition + All`: understood but rejected as unsupported.
- `New edition + S57`: understood but rejected as unsupported.
- `New update + S100`: contract prepared; frontend remains disabled until backend behavior is explicitly verified and approved.
- `New update + All`: rejected as unsupported.
- `New update + S57`: rejected as unsupported.

### Frontend tasks

1. Inspect the current export API module and popup export configuration.
2. Give every leaf explicit `target` and `exportType` metadata.
3. Send `exportTarget=S100` for the enabled S100 Edition action.
4. Prepare All/S57/S100 Update request metadata without enabling the leaves.
5. Keep all leaves disabled except S100 Edition.
6. Ensure disabled actions cannot trigger requests through keyboard, stale DOM, or direct action dispatch.
7. Preserve current loading, conflict, confirmation, and refresh behavior.
8. Add or update export configuration and API request tests.

### Response handling

Unsupported target responses must become normal user-facing notices, not generic unexpected errors.

Recommended stable code:

```text
EXPORT_TARGET_NOT_SUPPORTED
```

### Out of scope

- Implementing real All export behavior.
- Implementing real S57 export behavior.
- Enabling S100 Update in the frontend.
- Async job conversion.
- Database changes.
- New locking.

### Acceptance criteria

- Swagger shows `All`, `S100`, and `S57` rather than only `0`, `1`, and `2`.
- S100 Edition continues to work.
- The frontend request visibly contains the readable target.
- All other export leaves remain disabled.
- Direct unsupported requests receive a stable `422` response.
- Numeric values are either rejected or temporarily accepted only with a documented compatibility reason and removal plan.
- Existing Product action refresh and notices still work.
- No Product database/geodatabase schema changes.

### Estimated effort

Approximately 1-2 working days including frontend, backend, tests, and manual verification.

---

## FE-101: Usage band ID and description

### Purpose

Show the value users already know while preserving the descriptive terminology they are expected to learn.

Required label:

```text
4 - Approach
```

Do not display:

```text
Usage band 4 - Approach
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
3. Format visible option labels as `${id} - ${description}`.
4. Continue filtering by the stable ID.
5. Define fallback behavior:
   - ID only when description is absent;
   - description only only when a legacy payload lacks ID;
   - never render `undefined - value`.
6. Confirm ordering remains numeric by ID when appropriate.
7. Add tests for ID + description, missing description, missing ID, zero-count options, and persisted filter restoration.

### Acceptance criteria

- Main map filter shows `4 - Approach`.
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

## BE-104: Async Export and Rollback using the existing job framework

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

## BE-105: Active job visibility per Product

### Purpose

Let another browser/user see that an Export or Rollback job is queued or running before attempting an action, when this can be implemented inside the existing job framework without Product schema changes.

### Important limitation

This is visibility only.

The response can become stale immediately. The existing file lock remains the final concurrency control.

### Phase 1 requirement

Job-by-ID status from BE-104 must exist first.

### Discovery questions

- Does the current job framework support custom job parameters or metadata?
- Can active jobs be indexed by `datasetName` without scanning all jobs?
- Can the mapping live in the existing job storage without schema changes?
- How are stale mappings cleaned after success, failure, deletion, or worker crash?
- Is the current monitoring API appropriate for application use, or should an application-owned index be maintained in existing job storage?

### Allowed implementation

A lightweight Product-to-job status index may use the existing job storage when supported.

It must:

- store only status/lookup metadata;
- never acquire or represent a lock;
- be rebuildable from authoritative job data where possible;
- clean up terminal/stale entries;
- include job ID, Product, operation type, state, and timestamps.

### Fallback

If efficient Product lookup requires a new database table or Product schema change, defer this work.

Keep:

- job-by-ID recovery;
- local frontend operation state;
- normal handling of file-lock conflict responses.

### Frontend tasks

1. Read active job state when a Product popup opens or refreshes.
2. Optionally batch-read status for visible/selected Products if the backend supports it efficiently.
3. Merge backend job state into the existing central action-availability model.
4. Mark the state as informational.
5. Recheck on manual refresh and terminal polling events.
6. Preserve conflict handling because status can race.

### Acceptance criteria

- Another browser can see queued/running state when the optional endpoint is supported.
- A stale status cannot permanently disable actions.
- Terminal jobs disappear from active state.
- No application-level Product lock is introduced.
- File-lock conflicts remain correctly surfaced even when active-state lookup said no job was running.

### Estimated effort

Approximately 1-3 working days after BE-104 when the existing job storage supports the required lookup cleanly.

---

## BE-106: Dashboard server-side filtering and pagination

### Purpose

Prepare the Dashboard for growing audit-log volume before 50+ users create enough history to make the current full-payload client filtering expensive.

### Phase 1: Source and ordering review

Document:

- current Dashboard endpoint path and consumers;
- current activity source and query;
- current date/time semantics;
- current stable unique event key, if any;
- current sort order;
- current summary calculation;
- current filter classification logic;
- current maximum/typical payload size;
- current query duration and serialization duration.

### Contract capabilities

Server-side request should support the existing frontend filters:

- From and optional To;
- search;
- Product;
- activity type;
- status/outcome;
- important-only;
- report availability when real report metadata exists;
- page size;
- continuation token or page number.

### Paging choice

Preferred:

- cursor paging with stable ordering `OccurredAt DESC, EventId DESC` when a stable immutable event ID exists.

Temporary fallback:

- offset/page paging with deterministic ordering when no stable ID exists yet.

Do not use the future permanent Product ID as a substitute for an activity event ID.

### Summary semantics

Summary cards, status summary, and operation summary must represent the complete filtered result.

They must not be calculated from only the visible page.

The backend may return:

- page items;
- total/continuation metadata;
- summary;
- status summary;
- operation summary;
- available filter options when useful.

### Backward compatibility

Before changing the current response envelope:

1. identify all consumers;
2. decide additive parameters versus a versioned endpoint;
3. coordinate frontend/backend deployment;
4. preserve the current date handling in Europe/Copenhagen;
5. keep an explicit migration/removal plan for the legacy full-payload path.

### Frontend migration

1. Move filter state into request parameters.
2. Debounce search requests.
3. Cancel stale requests.
4. Keep the last successful result visible while a new page/filter request loads when appropriate.
5. Reset pagination when filters or range change.
6. Load more or paginate without duplicate events.
7. Keep summary and visible list synchronized with the same filter snapshot.
8. Preserve Dashboard History panel behavior.
9. Preserve direct URL/reload range behavior.
10. Add unavailable/error states for individual request failures.

### Indexes and administrator dependency

Implement against current schema first.

If query plans show indexes are needed, document the proposed index and measured evidence for administrators. Do not silently add schema/index changes during this work package while owners are unavailable.

### Acceptance criteria

- The endpoint never returns an unbounded activity list when paging is requested.
- Ordering is deterministic.
- No duplicates or missing events occur during normal next-page loading for the selected strategy.
- Summary values reflect all filtered events.
- Search/filter requests cancel stale in-flight requests.
- Current small datasets still feel immediate.
- Backend and frontend tests cover range, filters, empty results, page boundaries, invalid cursors/pages, and stable ordering.
- No schema change is required for the first release.

### Estimated effort

Approximately 5-9 working days including backend, frontend, compatibility handling, and tests.

---

## BE-107: Product History failure/event hardening

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
- Preserve current authentication and authorization behavior.
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
- authentication behavior;
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
