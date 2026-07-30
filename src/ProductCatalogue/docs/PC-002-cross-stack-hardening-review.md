# PC-002 Product Catalogue Cross-Stack Hardening Review

## Executive summary

Status:

```text
Documentation-only review
No runtime implementation authorized
```

The review inspected the committed Product Catalogue frontend, API, core integration, tests, and current source-of-truth documentation at:

```text
8d4bf2ff57618c85f8e37619e47d6b367116a1c5
```

The supplied context records a clean working tree and contains the committed source from the exact baseline.

The review confirms:

- no Critical finding;
- seven High findings;
- five Medium findings;
- two Low findings;
- five items retained as `Needs evidence`;
- multiple concerns rejected or disproven after guards, tests, and execution paths were checked.

The highest-priority issues are:

1. the split-feature Export loop enumerates generated feature IDs but never uses the iterated ID, so each split iteration reuses the original FOID, geometry mapping, masks, and geometry;
2. untrusted notice text is inserted with `innerHTML`, creating a reachable DOM-injection/XSS path;
3. the global exception handler builds a non-200 `ProblemDetails` body but does not apply the HTTP status to the response;
4. Send to IC-ENC currently reports completed delivery although the background job contains no delivery implementation;
5. the Send job writes fabricated `Frozen / S-128 / edition 5 / update 0` state when its lock cannot be acquired or its Product lookup fails;
6. Export and Rollback failures after Product mutation begins are exposed as ordinary operation failures rather than uncertain outcomes requiring manual review;
7. mandatory ArcGIS/Product Catalogue initialization failure is swallowed, allowing a partially initialized API process to start.

No implementation is included in this report. PC-002 supersedes PM-001 for implementation planning at this baseline.

## Baseline and scope

### Verified baseline

```text
Repository: S-100-BlueStack/S100Services
Commit: 8d4bf2ff57618c85f8e37619e47d6b367116a1c5
Working tree: clean
Generated context: 2026-07-30T11:18:41.8428084+02:00
Included committed files: 304
Context artifact label: PC-001 was provisional; review ID is PC-002 because PC-001 is the committed frontend rename package.
```

### Reviewed areas

```text
Frontend: src/ProductCatalogue
Backend: src/ProductManagerAPI
Core: src/ProductManagerCore
Tests: tests/TestProductManager
```

### Fixed boundaries

- BE-108A remains documentation-only.
- No C#, JavaScript, HTML, CSS, SQL, tests, project files, package versions, or configuration were changed.
- Authentication and authorization remain deferred and are not reported merely because they are incomplete.
- Report storage, external worker extraction, distributed operation ownership, permanent Product IDs, and the global map timeline remain deferred or blocked.
- Dapper and handwritten SQL remain the approved persistence architecture.
- The existing dataset lock, readable ExportTarget values, async endpoint routes, active-job endpoint, Dashboard cursor contract, and popup-preserving refresh architecture are preserved unless a specific finding says otherwise.

### Changes included since the previous review baseline

The fresh baseline includes these commits after the previous static-review baseline:

```text
4d5596c  Replace local topology construction with the S100Framework.Topology package path
b3a79e5  Update Microsoft.AspNetCore.Authentication.Negotiate
156b608  Update topology package and split-feature Export handling
51cd37a  Commit the historical PM-001 review report
8d4bf2f  Rename the frontend to ProductCatalogue / Product Catalogue
```

The review therefore re-read the complete scoped source instead of treating PM-001 as current implementation evidence. The historical PM-001 report remains useful traceability but is superseded by PC-002 for implementation planning.

### Rename validation

The frontend path, package name, document titles, route titles, onboarding text, storage keys, and source-of-truth documentation paths now consistently use Product Catalogue. The backend and core project names remain `ProductManagerAPI` and `ProductManagerCore`; those are technical project and serialized-job identifiers rather than missed user-facing rename work.

One repository-boundary regression was confirmed: `.gitignore` contains renamed paths for non-existent `ProductCatalogueAPI`/`ProductCatalogueService` export folders while the actual backend remains `src/ProductManagerAPI`, whose generated `exports` directory is present in the committed manifest.

### Relationship to the historical PM-001 review

```text
Reconfirmed current findings: 12
New confirmed findings:       2
Resolved previous findings:   0
Previous findings rejected:   0
```

The previous documentation-baseline finding is expanded for the new rename/current-baseline situation. Backend finding numbers are shifted only to reserve `PC-002-BE-001` for the newly discovered topology defect; the report does not imply that the underlying older defects changed merely because their PC-002 IDs differ.

## Architecture map

### Host and backend dependencies

```text
ProductManagerAPI/Program.cs
  -> Registrations.AddS100ProductManager
      -> ArcGIS CoreHost
      -> ProductManagerGDB
      -> S-128 geodatabase
  -> Hangfire SQL storage and Hangfire Server
  -> controller, service, repository, and job registrations
  -> controllers
      -> ElectronicProductsController
      -> ExportController
      -> JobsController
      -> LookupController
      -> UploadController
```

```text
Controllers
  -> application/service layer
      -> ExportOperationService
      -> HangfireExportJobService
      -> HangfireJobStatusService
      -> DashboardQueryProcessor
      -> DatasetLockService
  -> infrastructure
      -> ProductRepository / SQL Server
      -> ProductManagerGDB / ArcGIS Core
      -> ExportService / filesystem and external compiler
      -> Hangfire storage
```

### Frontend dependencies

```text
main.js
  -> app/bootstrap.js
      -> route resolution
      -> initUI
      -> main map, Dashboard, Analyze, or Review initializer
```

```text
shared/api/apiClient.js
  -> feature API modules
  -> feature normalization/state
  -> map, popup, Dashboard, Analyze, Review, and notice UI
```

Central Product action state is divided between:

- `productActionAvailability.js`;
- `productOperationState.js`;
- `productJobService.js`;
- popup Export state;
- backend-authoritative active-job lookup.

## Critical-flow tracing

### Initial AOI load

```text
loadInitialData
  -> dataLoader
  -> GET /electronicproducts/aoi
  -> ElectronicProductsController.GetAllElectronicProductsAOI
  -> ProductManagerGDB.GetDatasetAOIs
  -> ProductRepository.GetCurrentByNamesAsync
  -> raw AOIResponse[] JSON
  -> esriJsonToGraphics
  -> GraphicsLayer creation and map binding
```

### Manual and automatic refresh

```text
refreshService.refresh
  -> capture map, filter, popup, and selection state
  -> reload layer data
  -> attempt reconcileGraphicsLayers
      -> preserve matching Graphic identity
      -> refresh popup through popupRefreshBridge
  -> fallback to full layer rebuild when reconciliation is unsafe
  -> restore state
```

### Freeze and Unfreeze

```text
popupProductActions
  -> productOperationSyncService
  -> PUT /upload/{datasetName}/freeze|unfreeze
  -> UploadController
  -> DatasetLockService
  -> ProductRepository.GetCurrentByNameAsync
  -> ProductRepository.AppendAsync
  -> frontend notice and refresh
```

### Send to IC-ENC

```text
popupProductActions
  -> PUT /upload/{datasetName}
  -> UploadController precheck and enqueue
  -> UploadSingularProductJob
  -> DatasetLockService
  -> current stub behavior and Product state append
  -> immediate frontend success notice
```

This flow contains two confirmed High findings.

### Async New Edition and Rollback

```text
popup action
  -> backend active-operation preflight
  -> POST /export/{datasetName}/newedition/jobs
     or POST /export/{datasetName}/rollback/jobs
  -> exact authoritative Product version lookup
  -> Hangfire enqueue with creation-time metadata
  -> ExportOperationJob
      -> dataset lock
      -> replay guard
      -> authoritative version recheck
      -> operation precondition
      -> ProductManagerExecutionStarted
      -> ExportOperationService
          -> ArcGIS Product mutation
          -> serialization/files/compiler/attachment
          -> ProductRepository append
  -> GET /jobs/{jobId} polling
  -> terminal notice and route refresh
```

### S-101 topology and split-feature Export mapping

```text
ExportOperationService.ExecuteNewEditionAsync
  -> ProductManagerGDB.CreateNewEditionAsync / CreateDatasetAsync
  -> Geodatabase.BuildTopology(filter)
  -> topology.mapper identifies generated feature IDs for split source features
  -> feature loop creates YAML.Feature and geometry references
  -> dataset.AddTopology(topology.matrix)
  -> Dataset.Serialize
  -> ExportService.CreateS100Export
  -> external S100 compiler
```

The current split branch contains a confirmed High finding because it enumerates generated IDs but continues to construct every iteration from the original source name.

### Active jobs

```text
GET /jobs/active?datasetName=...
  -> HangfireJobStatusService.GetActiveJobs
  -> scan active Hangfire job IDs
  -> read Product Catalogue metadata
  -> exact case-insensitive datasetName filter
  -> frontend external operation reconciliation
```

The endpoint remains informational rather than an atomic claim.

### Dashboard

```text
Dashboard frontend query
  -> GET /electronicproducts/dashboard
  -> ProductRepository.GetHistoryAsync
  -> activity mapping
  -> DashboardQueryProcessor filtering, summary, ordering, and cursor page
  -> ApiResponse<DashboardResponse>
  -> frontend paging/filter state and rendering
```

### Product History

```text
GET /electronicproducts/{datasetName}/history
  -> ProductRepository.GetHistoryByNameAsync
  -> legacy ProductHistoryResponse[]
  -> frontend adjacent-row inference
  -> shared Product History rendering
```

Explicit Product History events remain deferred to BE-108A.

### Analyze and Review

```text
route dataset names
  -> Product catalog validation
  -> one Product API request per enabled Product
  -> Product History requests
  -> request-generation checks suppress stale continuations
  -> route-local rendering and cleanup
```

## Review method

The review:

1. verified the exact commit and clean state from the supplied context;
2. mapped the backend host, controllers, services, jobs, repositories, ArcGIS integration, frontend routes, state, and tests;
3. traced the required critical flows end-to-end;
4. searched for transaction boundaries, swallowed exceptions, external processes, unsafe DOM rendering, stale-response protection, job-state mapping, and response-contract drift;
5. mapped automated and manual verification coverage;
6. attempted to disprove every High candidate by checking guards, tests, alternate paths, and documented compatibility decisions;
7. separated current defects from deferred architecture and environment-dependent questions.

Static source inspection was completed against all 304 included committed files. The application, SQL Server, ArcGIS runtime, Hangfire SQL storage, compiler, and browser were not executed as part of this documentation-only review.

# Confirmed findings

## Critical

No Critical finding was confirmed.

## High

### PC-002-BE-001 — Split-feature Export ignores the generated feature ID

**Severity:** High  
**Area:** Backend Export correctness and S-101 topology mapping  
**Status:** Confirmed

**Evidence**

`src/ProductManagerCore/ProductManagerGDB.cs`, `CreateDatasetAsync`:

- lines 917-921 construct `features` from `topology.mapper` when a source feature has generated split IDs;
- line 923 iterates `foreach (var uid in features)`;
- the loop body never reads `uid`;
- lines 925-933 resolve geometry from the original `name`;
- line 939 constructs FOID from the original `name`;
- lines 975-982 resolve masks from the original `name`;
- lines 984-990 create the same YAML feature identity and geometry reference for every split iteration;
- lines 1073-1080 add each repeated feature and original geometry;
- no focused test references `topology.mapper`, `MappingFOID`, `BuildTopology`, or generated split IDs.

The comment says the source name is kept so FOIDs remain unique, but using the same source name in every loop iteration produces the same FOID rather than a unique one.

**Affected files and symbols**

```text
src/ProductManagerCore/ProductManagerGDB.cs
  CreateDatasetAsync

src/ProductManagerCore/ProductManagerCore.csproj
  S100Framework.Topology 4.3.2 reference

tests/TestProductManager/*
  no focused split-feature/YAML topology coverage
```

**Current behavior**

When `topology.mapper` supplies one or more generated IDs for a source feature, the code loops the generated IDs but emits each iteration using the original source feature identity and original mapping lookup.

For a real split into multiple generated IDs, the observable result must be one of these incorrect outcomes depending on downstream collection behavior:

- duplicate YAML features with the same FOID and geometry reference;
- deduplication that silently collapses required split parts;
- topology/geometry references that do not correspond to the generated split IDs;
- compiler rejection or accepted output with incorrect feature-to-geometry association.

**Why it matters**

This is on the active New Edition generation path and can create a technically successful export whose S-101 feature/topology relationship is wrong. That is more serious than a cosmetic YAML difference because the compiled dataset may represent the wrong geometry or omit required split parts.

**Execution or reproduction path**

Use a controlled Product known to produce multiple mapper keys for one source UID:

```text
1. Record source UID and topology.mapper entries.
2. Run New Edition generation without distributing the output.
3. Inspect generated YAML feature FOIDs and Geometry values.
4. Compare them with topology.mapper and MappingFOID.
5. Compile and inspect the resulting dataset with the normal validation tooling.
```

The regression test should isolate the mapping-to-YAML transformation so correctness does not depend exclusively on ArcGIS integration testing.

**False-positive challenge**

- If `features` contains only one value, the bug is dormant for that feature, but the branch was explicitly introduced to support split features.
- If downstream `AddFeature` deduplicates equal FOIDs, required split parts are still lost.
- If it does not deduplicate, duplicate identities remain incorrect.
- Package-internal topology generation cannot make the unused local `uid` affect FOID, masks, geometry lookup, or geometry collection.
- No later code rewrites feature identities from the generated ID.

**Recommended direction**

Extract a small, testable mapping boundary that constructs one emitted feature per generated topology feature ID. Define explicitly which identifier drives:

- emitted FOID;
- `MappingFOID` lookup;
- surface/mask association;
- geometry source/reference;
- deterministic ordering.

Do not reintroduce the removed local topology engine or broadly rewrite Product generation.

**Change risk:** High

The code is compact, but a wrong interpretation of package mapping direction can create another silent export defect.

**Suggested package boundary**

```text
PC-003 Export Topology Split Mapping Correctness
```

**Verification needs**

- focused test with at least two generated IDs for one source UID;
- unique and deterministic emitted FOIDs;
- each feature references the expected topology geometry;
- masks and geometry entries remain valid;
- unchanged output for non-split point, curve, and surface features;
- one controlled ArcGIS-backed New Edition export;
- compiler and validation-tool acceptance;
- Product edition/update and attachment behavior unchanged.

**Dependencies or blockers**

A representative Product with a real split feature is required for manual acceptance. The implementation must confirm the S100Framework.Topology 4.3.2 mapping contract before changing identifiers.

---

### PC-002-FE-001 — Untrusted notice content is rendered through `innerHTML`

**Severity:** High  
**Area:** Frontend security and UI robustness  
**Status:** Confirmed

**Evidence**

- `src/ProductCatalogue/src/features/notices/ui/noticePanel.js`, `render`, lines 15-34:
  - creates each notice row;
  - assigns a template containing `notice.title` and `notice.message` to `row.innerHTML`.
- `src/ProductCatalogue/src/features/notices/services/apiNoticeService.js`, lines 18-35:
  - stores messages extracted from backend responses.
- `src/ProductCatalogue/src/features/analyze/core/initAnalyzePage.js`, `notifyRejectedCatalogProducts`, lines 410-415:
  - builds a notice message from route/user-controlled Product names.
- `src/ProductCatalogue/src/features/analyze/routing/analyzeRoute.js`, lines 27-45:
  - decodes Product names from the URL.
- `src/ProductCatalogue/src/app/initUI.js`, lines 11-15:
  - initializes the notice panel subscription during normal startup.

**Affected files and symbols**

```text
src/ProductCatalogue/src/features/notices/ui/noticePanel.js
  render

src/ProductCatalogue/src/features/notices/services/apiNoticeService.js
  noticeApiFailure

src/ProductCatalogue/src/features/analyze/core/initAnalyzePage.js
  notifyRejectedCatalogProducts

src/ProductCatalogue/src/features/review/core/initReviewPage.js
  notifyRejectedCatalogProducts
```

**Current behavior**

Notice values are treated as HTML in the persistent notification panel. The toast renderer uses `textContent`, but the notification-center renderer does not.

A crafted Analyze or Review URL can supply a decoded Product name containing markup. Catalog rejection places that value in a notice, and the notice subscription renders it with `innerHTML`.

**Why it matters**

This creates a reachable DOM-injection path and can become same-origin script execution. Same-origin code can issue Product Catalogue requests using the user's browser context and can read or alter visible application state.

**Execution or reproduction path**

Use a controlled local environment only:

```text
1. Load an Analyze or Review URL containing an encoded HTML Product name.
2. Ensure Product catalog validation rejects the name.
3. Observe the generated "Product not found" notice.
4. Inspect the notification row DOM.
5. Verify whether a benign event-handler marker executes under the deployed CSP.
```

A safe verification marker should alter a test-only DOM attribute rather than performing a Product operation.

**False-positive challenge**

- The toast renderer was inspected and is safe because it uses `textContent`.
- The persistent panel is initialized even while visually collapsed, so hidden rendering does not remove the sink.
- The route parser decodes the input before the notice is generated.
- A deployed Content Security Policy may reduce exploitability, but no CSP evidence was included. CSP would be defense-in-depth and does not make the unsafe sink acceptable.

**Recommended direction**

Construct notice rows with DOM nodes and `textContent`. Do not sanitize a small set of fields while leaving the HTML template in place.

**Change risk:** Low

**Suggested package boundary**

```text
PC-004 Frontend Notice Rendering Safety
```

Limit scope to notification rendering and regression tests. Do not redesign the notice system.

**Verification needs**

- unit or DOM test proving markup is rendered as text;
- benign crafted Analyze and Review route test;
- API error message test;
- keyboard and screen-reader smoke check;
- light and dark mode;
- `cd src/ProductCatalogue && npm run check`.

**Dependencies or blockers**

None. Deployed CSP should be recorded during manual verification.

---

### PC-002-API-001 — Global exception responses can retain HTTP 200

**Severity:** High  
**Area:** API correctness, error handling, cross-stack contract  
**Status:** Confirmed

**Evidence**

- `src/ProductManagerAPI/CustomExceptionHandler.cs`, `TryHandleAsync`, lines 11-28:
  - calculates `400`, `401`, `409`, or `500`;
  - stores that value only in `ProblemDetails.Status`;
  - writes the body with `WriteAsJsonAsync`;
  - never sets `httpContext.Response.StatusCode`.
- `src/ProductCatalogue/src/shared/api/apiClient.js`, `parseResponse`, lines 48-53:
  - treats every HTTP-success response as `success: true`.
- `src/ProductManagerAPI/Program.cs` registers `app.UseExceptionHandler()`.

**Affected files and symbols**

```text
src/ProductManagerAPI/CustomExceptionHandler.cs
  CustomExceptionHandler.TryHandleAsync

src/ProductCatalogue/src/shared/api/apiClient.js
  parseResponse
```

**Current behavior**

An unhandled backend exception can produce a body whose `status` field says `500`, while the actual HTTP response remains successful. The frontend then classifies the request as successful.

This is especially damaging for:

- active-job lookup, where a ProblemDetails object can be interpreted as an empty list;
- data loading, where an error object can flow into permissive normalizers;
- mutation actions, where a success path can run after an exception.

**Why it matters**

HTTP status is the primary cross-stack success boundary. A body-only status can create false success, clear fail-closed UI state, or hide a backend outage.

**Execution or reproduction path**

```text
1. Trigger an unhandled BadHttpRequestException, DatasetLockedException, or generic exception.
2. Inspect the actual HTTP status and ProblemDetails body.
3. Call the same endpoint through apiRequest.
4. Confirm whether result.success is true.
```

**False-positive challenge**

- The middleware registration was verified.
- No later middleware or controller code applies the calculated status.
- `ProblemDetails.Status` is payload data; the handler does not assign it to the response.
- No exception-handler integration tests were found.

**Recommended direction**

Set the response status before writing the body and use the established problem-details content type. Add integration tests at the HTTP boundary rather than only unit testing the mapping function.

**Change risk:** Low

**Suggested package boundary**

```text
PC-005 API Exception Response Semantics
```

Do not rewrite all controller error envelopes in this package.

**Verification needs**

- API integration tests for every mapped exception;
- assert actual status, content type, and safe body;
- frontend contract test proving a handled exception yields `success: false`;
- active-job failure smoke test.

**Dependencies or blockers**

None.

---

### PC-002-BE-002 — Send job writes fabricated Product state after pre-execution failure

**Severity:** High  
**Area:** Backend correctness and persistence  
**Status:** Confirmed

**Evidence**

`src/ProductManagerAPI/Jobs/UploadSingularProductJob.cs`:

- lines 16-21:
  - if the dataset lock cannot be acquired, appends:
    - `Frozen`;
    - `"S-128"`;
    - edition `5`;
    - update `0`;
  - then returns successfully.
- lines 24-29:
  - if Product lookup returns null, appends the same fabricated state/version;
  - then returns successfully.
- no exception is thrown in either path.

`src/ProductManagerAPI/Controllers/UploadController.cs`:

- lines 37-54:
  - performs a lock/state precheck;
  - releases the request-owned lock when the action completes;
  - enqueues a later job whose lock acquisition can still fail.

No Upload controller or Upload job tests were found in `tests/TestProductManager`.

**Affected files and symbols**

```text
src/ProductManagerAPI/Jobs/UploadSingularProductJob.cs
  RunAsync

src/ProductManagerAPI/Controllers/UploadController.cs
  UploadSingularProduct

src/ProductManagerAPI/Data/Repositories/IProductRepository.cs
  AppendAsync
```

**Current behavior**

A lock conflict or missing Product during job execution mutates Product state/history using hard-coded values unrelated to the authoritative Product. Hangfire sees a successful return.

**Why it matters**

This can corrupt Product state and historical version information. It also hides the failed Send attempt from operational job state.

**Execution or reproduction path**

```text
1. Put a Product in Exported state.
2. Call PUT /upload/{datasetName}.
3. Let the request precheck succeed and enqueue the job.
4. Acquire the Product dataset lock before the job executes, or make the Product unavailable.
5. Execute the queued job.
6. Inspect JobTable and Hangfire outcome.
```

Expected current result:

```text
Job succeeds
JobTable receives Frozen / S-128 / 5 / 0
```

**False-positive challenge**

- The request lock does not span background execution.
- The job has its own later acquisition, so the failure path is reachable.
- The hard-coded append is not a test-only branch.
- No later code corrects the inserted row.
- No exception makes Hangfire mark the job failed.

**Recommended direction**

A pre-execution lock or lookup failure must perform no Product mutation. It should end in a truthful, machine-readable failed job outcome. Do not add a BE-108A event producer in this package.

**Change risk:** Medium

**Suggested package boundary**

```text
PC-006A Send Job State Safety
```

**Verification needs**

- lock-conflict test;
- missing-Product test;
- repository remains untouched;
- job becomes terminal failure with safe code;
- successful path preserves authoritative edition/update;
- manual Hangfire verification.

**Dependencies or blockers**

The current Send job/status contract must be defined. Actual IC-ENC delivery remains externally blocked.

---

### PC-002-API-002 — Send to IC-ENC reports completed delivery although no delivery occurs

**Severity:** High  
**Area:** API contract and user-visible correctness  
**Status:** Confirmed

**Evidence**

`src/ProductManagerAPI/Controllers/UploadController.cs`:

- lines 25-28 describe immediate Send to IC-ENC;
- lines 54-58 enqueue a background job and return HTTP 200.

`src/ProductManagerAPI/Jobs/UploadSingularProductJob.cs`:

- line 33 logs that implementation is incomplete;
- line 34 delays for `10` milliseconds despite the log saying ten seconds;
- line 35 appends `Idle`;
- contains no IC-ENC client, upload call, response validation, or delivery confirmation.

`src/ProductCatalogue/src/features/map/popups/popupProductActions.js`:

- lines 97-101 promise an immediate IC-ENC upload;
- lines 110-112 display `Product ... sent successfully` when enqueue returns HTTP success.

**Affected files and symbols**

```text
src/ProductManagerAPI/Controllers/UploadController.cs
  UploadSingularProduct

src/ProductManagerAPI/Jobs/UploadSingularProductJob.cs
  RunAsync

src/ProductCatalogue/src/features/map/popups/popupProductActions.js
  triggerSendProduct

src/ProductCatalogue/src/features/data/api/productApi.js
  uploadProduct
```

**Current behavior**

The UI reports delivery success when the backend has only accepted a stub background job. The stub then assumes acceptance and writes `Idle`.

**Why it matters**

Users can believe a nautical Product was delivered when no delivery was attempted. The Product state also ceases to communicate that delivery is pending or unavailable.

**Execution or reproduction path**

```text
1. Select an Exported Product.
2. Trigger Send to IC-ENC.
3. Observe the immediate success notice.
4. Inspect backend logs and network activity.
5. Confirm that no IC-ENC delivery request occurs.
6. Inspect the resulting Idle state.
```

**False-positive challenge**

- All constructor dependencies and the complete job body were inspected.
- No hidden delivery service is called.
- The ten-millisecond delay cannot represent an external delivery workflow.
- The frontend success text is delivery-specific rather than enqueue-specific.

**Recommended direction**

Until a real producer contract exists:

- do not report delivery success;
- return a truthful accepted/unavailable contract;
- do not transition Product state to a delivered-equivalent outcome;
- keep actual IC-ENC integration explicitly blocked.

**Change risk:** Medium

**Suggested package boundary**

```text
PC-006B Send Contract Truthfulness
```

This may be delivered with PC-006A if both remain limited to the current Send flow.

**Verification needs**

- API response contract test;
- frontend notice test;
- Product state remains truthful;
- no success wording before terminal delivery evidence;
- manual Network and JobTable verification.

**Dependencies or blockers**

A real IC-ENC delivery and acknowledgement contract is blocked. That does not block removing the false success claim.

---

### PC-002-BE-003 — Post-mutation Export and Rollback failures are classified as ordinary failures

**Severity:** High  
**Area:** Operation-state correctness and recovery  
**Status:** Confirmed

**Evidence**

`src/ProductManagerAPI/Services/Operations/ExportOperationService.cs`:

- New Edition:
  - line 42 invokes the execution-start callback;
  - line 44 performs `CreateNewEditionAsync`;
  - lines 46-77 perform serialization, compiler/export, attachment, and repository writes afterward.
- Rollback:
  - line 126 invokes the execution-start callback;
  - line 128 performs `RollBackAsync`;
  - lines 130-143 perform output cleanup and repository append afterward.

`src/ProductManagerAPI/Jobs/ExportOperationJob.cs`:

- lines 157-160 set `ProductManagerExecutionStarted`;
- lines 230-257 map every later generic exception to:
  - `EXPORT_FAILED`;
  - `ROLLBACK_FAILED`;
  - or `JOB_FAILED`.
- `MANUAL_REVIEW_REQUIRED` is used only when a later execution finds that the guard was already set before the attempt.

`tests/TestProductManager/ExportOperationJobTests.cs`:

- `OperationFailureStoresOnlySafeErrorMetadata`, lines 220-246, explicitly expects `EXPORT_FAILED` for an operation exception.

**Affected files and symbols**

```text
src/ProductManagerAPI/Services/Operations/ExportOperationService.cs
  ExecuteNewEditionAsync
  ExecuteRollbackAsync

src/ProductManagerAPI/Jobs/ExportOperationJob.cs
  ExecuteAsync

tests/TestProductManager/ExportOperationJobTests.cs
  OperationFailureStoresOnlySafeErrorMetadata
```

**Current behavior**

A failure after ArcGIS mutation begins is exposed as a confirmed failure even though the resulting Product, attachment, output files, and JobTable state may disagree.

**Why it matters**

An operator cannot distinguish:

```text
operation safely failed before mutation
```

from:

```text
mutation may have happened; final state is uncertain
```

That ambiguity can cause unsafe manual replay or an incorrect assumption that no Product change occurred.

**Execution or reproduction path**

Inject failures after:

- `CreateNewEditionAsync`;
- YAML serialization;
- compiler execution;
- attachment creation;
- Product repository append;
- `RollBackAsync`;
- rollback state append.

Inspect Product state, files, Hangfire metadata, and public status.

**False-positive challenge**

- Automatic Hangfire retries are disabled, which prevents automatic replay but does not prove final Product state.
- The dataset lock prevents concurrent execution but does not provide a distributed transaction.
- ArcGIS mutation, filesystem work, compiler execution, attachment writes, and SQL state append do not share one transaction.
- Existing tests validate sanitization, not outcome certainty.

**Recommended direction**

Use the existing execution-start boundary:

- pre-start failure: existing normal failure code;
- post-start exception with unproven final state: `MANUAL_REVIEW_REQUIRED`;
- preserve internal exception detail only in logs;
- avoid implementing BE-108A persistence in this package.

**Change risk:** Medium to high

**Suggested package boundary**

```text
PC-007 Post-Mutation Outcome Classification
```

**Verification needs**

- failure injection before and after every irreversible boundary;
- assert safe public metadata;
- assert no automatic retry;
- manual review status shown correctly in frontend;
- sync compatibility endpoints reviewed separately;
- ArcGIS/compiler environment acceptance.

**Dependencies or blockers**

No database change is required. BE-108A later provides durable audit reconciliation but is not required to correct the current public classification.

---

### PC-002-BE-004 — Mandatory Product Catalogue initialization failure is swallowed

**Severity:** High  
**Area:** Startup reliability and observability  
**Status:** Confirmed

**Evidence**

`src/ProductManagerAPI/Registrations.cs`, `AddS100ProductManager`, lines 8-42:

- initializes ArcGIS CoreHost;
- validates the S-128 connection path;
- creates `ProductManagerGDB`;
- registers the singleton;
- catches every exception;
- logs and returns without rethrowing.

`src/ProductManagerAPI/Program.cs`:

- line 186 awaits the registration method;
- continues registering controllers, jobs, Hangfire Server, Swagger, and the request pipeline.

Controllers and jobs require `IProductManager`.

**Affected files and symbols**

```text
src/ProductManagerAPI/Registrations.cs
  AddS100ProductManager

src/ProductManagerAPI/Program.cs
  Main
```

**Current behavior**

The API can continue startup without its mandatory Product Catalogue service. Failures then occur when dependent controllers or jobs are activated.

**Why it matters**

The process, Swagger, Hangfire Dashboard, or host monitoring can appear available while core Product operations are unusable. The original startup failure becomes separated from later dependency-resolution failures.

**Execution or reproduction path**

```text
1. Use an inaccessible or invalid S-128 connection file in a controlled environment.
2. Start ProductManagerAPI.
3. Observe whether the process remains running.
4. Request a Product endpoint or execute a Product job.
5. Compare startup logs with the later failure.
```

**False-positive challenge**

- No fallback Product Catalogue implementation is registered in the catch path.
- The Product Catalogue dependency is mandatory for the reviewed controllers and jobs.
- Hangfire connection validation already fails startup, showing fail-fast startup is compatible with the host.
- No startup test covers the failed Product Catalogue registration path.

**Recommended direction**

Fail startup when mandatory ArcGIS/Product Catalogue initialization fails. Log the exception through the exception-aware logging overload before rethrowing. Optional subsystems should be isolated explicitly rather than inferred from a broad catch.

**Change risk:** Medium

**Suggested package boundary**

```text
PC-008 Mandatory Startup Validation
```

**Verification needs**

- valid startup test;
- missing/inaccessible S-128 path;
- invalid connection type;
- ArcGIS initialization failure where reproducible;
- service resolution smoke test;
- deployed health/startup observation.

**Dependencies or blockers**

Requires an ArcGIS-capable environment for full acceptance.

## Medium

### PC-002-API-003 — Hangfire storage failures are indistinguishable from missing jobs

**Severity:** Medium  
**Area:** Job status reliability and error semantics  
**Status:** Confirmed

**Evidence**

`src/ProductManagerAPI/Services/Jobs/HangfireJobStatusService.cs`:

- `GetJob`, lines 142-156:
  - catches every exception from storage access and metadata parsing;
  - logs it as incomplete/malformed metadata;
  - returns null.

`src/ProductManagerAPI/Controllers/JobsController.cs`:

- `GetJob`, lines 36-47:
  - converts every null to `404 JOB_NOT_FOUND`.

`src/ProductCatalogue/src/features/products/services/productJobService.js`:

- lines 280-294:
  - treats 404 as a final unavailable result;
  - removes the persisted job and local operation block.

**Affected files and symbols**

```text
src/ProductManagerAPI/Services/Jobs/HangfireJobStatusService.cs
  GetJob

src/ProductManagerAPI/Controllers/JobsController.cs
  GetJob

src/ProductCatalogue/src/features/products/services/productJobService.js
  pollProductJob
```

**Current behavior**

A transient Hangfire SQL/storage failure can be reported as an expired or unknown job. The frontend then stops polling and removes its local record.

**Why it matters**

The job may still be running while the initiating browser no longer tracks it. Shared active-job discovery may rediscover it later, but there is a window where the final result and local state are wrong.

**Execution or reproduction path**

```text
1. Start a Product job.
2. Cause IHangfireJobStorageAccessor.ReadJob to throw.
3. Call GET /jobs/{jobId}.
4. Observe 404 JOB_NOT_FOUND.
5. Observe frontend removal of the persisted job record.
```

**Recommended direction**

Distinguish:

```text
job absent or intentionally unsupported -> 404
metadata incomplete/non-Product Catalogue -> 404 or explicit unsupported result
storage unavailable -> 503 with a stable code
```

Do not expose storage exception text.

**Change risk:** Medium

**Suggested package boundary**

```text
PC-009A Job Status Availability Semantics
```

**Verification needs**

- storage exception test;
- malformed metadata test;
- true missing job test;
- frontend handling of 503 keeps fail-closed state;
- Hangfire SQL interruption smoke test.

**Dependencies or blockers**

Hangfire SQL environment for manual acceptance.

---

### PC-002-FE-002 — Persistent polling failure can block a Product indefinitely

**Severity:** Medium  
**Area:** Frontend state and recovery  
**Status:** Confirmed

**Evidence**

`src/ProductCatalogue/src/features/products/services/productJobService.js`:

- `pollProductJob`, lines 258-304:
  - retries every non-404 failure forever;
  - backs off only to ten seconds;
  - has no terminal reconciliation path.
- `synchronizeActiveProductJobs`, lines 145-160:
  - retains a local Product job when `activePolls.has(jobId)`;
  - therefore a successful authoritative active-job response that omits the job cannot clear the stale local record while polling continues.

**Affected files and symbols**

```text
src/ProductCatalogue/src/features/products/services/productJobService.js
  pollProductJob
  synchronizeActiveProductJobs
  trackProductJob
```

**Current behavior**

A permanent status-route failure can keep the Product mutation lock in local storage indefinitely, even if `/jobs/active` later succeeds and proves that no matching job is active.

**Why it matters**

Users can be permanently blocked from Product actions until browser state is manually reset. The current fail-closed approach is correct for transient uncertainty, but it has no evidence-based recovery boundary.

**Execution or reproduction path**

```text
1. Store or start a Product job.
2. Make GET /jobs/{jobId} return a persistent non-404 failure.
3. Make GET /jobs/active?datasetName=... return 200 with an empty list.
4. Leave the popup/watch active.
5. Observe that the stored job and Product block remain.
```

**False-positive challenge**

- Immediate unlock on timeout would be unsafe and is not recommended.
- The active endpoint is backend-authoritative for visible active work, although not an atomic claim.
- Recovery is safe only after a successful authoritative query proves no active job.
- No service-level tests cover this state machine.

**Recommended direction**

After bounded repeated status failures, reconcile with the active endpoint:

- successful active response still contains job: remain blocked;
- successful active response contains no job: remove the active block but retain/show a persistent final-result-unavailable notice;
- active response also fails: remain blocked.

**Change risk:** Medium

**Suggested package boundary**

```text
PC-009B Frontend Job Recovery Reconciliation
```

Coordinate deployment with PC-009A.

**Verification needs**

- deterministic fake-timer tests;
- persistent 500 plus active-empty recovery;
- transient failure remains blocked;
- both endpoints unavailable remain blocked;
- reload and cross-tab behavior;
- `cd src/ProductCatalogue && npm run check`.

**Dependencies or blockers**

Requires the stable status-unavailable error contract from PC-009A for best results.

---

### PC-002-BE-005 — External compiler execution has no timeout or cooperative cancellation

**Severity:** Medium  
**Area:** Backend reliability and resource use  
**Status:** Confirmed

**Evidence**

`src/ProductManagerAPI/Services/Export/ExportService.cs`, `CreateS100Export`:

- lines 50-68 start `s100compiler.exe` and call synchronous `WaitForExit()`;
- no timeout is supplied;
- no cancellation token reaches the service;
- process-tree termination is absent.

`src/ProductManagerAPI/Services/Export/IExportService.cs`:

- `CreateS100Export` has no cancellation parameter.

The call occurs while the async Product job owns the dataset lock.

**Affected files and symbols**

```text
src/ProductManagerAPI/Services/Export/IExportService.cs
  CreateS100Export

src/ProductManagerAPI/Services/Export/ExportService.cs
  CreateS100Export

src/ProductManagerAPI/Services/Operations/ExportOperationService.cs
  ExecuteNewEditionAsync
```

**Current behavior**

If the compiler hangs, the Hangfire worker thread and Product dataset lock can remain occupied indefinitely. Job cancellation does not interrupt the process wait.

**Why it matters**

The affected Product becomes unavailable for later operations, and enough hung processes can consume worker capacity.

**Execution or reproduction path**

Use a controlled fake or wrapper compiler that never exits, then start New Edition and attempt cancellation or another Product operation.

**False-positive challenge**

- The process wait has no bound in source.
- The outer cancellation token is checked before mutation but is not observed during compiler execution.
- Normal compiler completion does not remove the hang path.
- No process-execution abstraction or timeout test was found.

**Recommended direction**

Introduce a bounded, cancellable process runner:

- asynchronous wait;
- configured timeout;
- cancellation;
- process-tree termination;
- bounded stderr capture;
- outcome classification coordinated with PC-007.

**Change risk:** Medium

**Suggested package boundary**

```text
PC-010 Compiler Process Execution Hardening
```

**Verification needs**

- successful process;
- non-zero exit;
- timeout;
- cancellation;
- child-process cleanup;
- lock release;
- safe logs and public error;
- real compiler acceptance.

**Dependencies or blockers**

Compiler-capable Windows environment.

---

### PC-002-BE-006 — AOI row failures are silently converted into partial success

**Severity:** Medium  
**Area:** AOI correctness and observability  
**Status:** Confirmed

**Evidence**

`src/ProductManagerCore/ProductManagerGDB.cs`, `GetDatasetAOIs`, lines 1507-1554:

- wraps Product name parsing, geometry access, rectangle creation, and serialization in a broad catch;
- increments `rowsFailed`;
- omits the row and continues;
- does not log the Product/row identity or exception.

Lines 1588-1610 log only aggregate counts.

`src/ProductManagerAPI/Controllers/ElectronicProductsController.cs` returns the resulting list with HTTP 200.

**Affected files and symbols**

```text
src/ProductManagerCore/ProductManagerGDB.cs
  GetDatasetAOIs

src/ProductManagerAPI/Controllers/ElectronicProductsController.cs
  GetAllElectronicProductsAOI
```

**Current behavior**

A malformed attribute binding, geometry, extent, or serialization failure removes a Product from the main map while the request still succeeds. Operations see only a count of failed rows.

**Why it matters**

A missing Product can look like legitimate absence rather than a data/runtime problem. The current aggregate metric cannot identify the affected Product for remediation.

**Execution or reproduction path**

Insert or simulate one S-128 AOI row with malformed `attributebindings` or invalid geometry and call `/electronicproducts/aoi`.

**False-positive challenge**

- Partial response behavior may be intentional availability hardening.
- The finding does not require fail-all behavior.
- The defect is the silent and non-identifiable omission, not the choice to continue.
- Existing profiling tests assert aggregate metrics, not per-row diagnostics or user-visible partial state.

**Recommended direction**

Preserve partial availability if desired, but:

- log a safe row identifier and internal exception;
- emit an explicit partial-result metric/diagnostic;
- decide whether the API should expose a safe omitted-count indicator without breaking the existing raw-list contract.

**Change risk:** Low to medium

**Suggested package boundary**

```text
PC-011A AOI Partial-Failure Diagnostics
```

**Verification needs**

- malformed attributes;
- missing Product name;
- invalid geometry;
- valid rows remain returned;
- failed row is identifiable in structured logs;
- no full geometry or sensitive payload logging.

**Dependencies or blockers**

ArcGIS test fixture or environment for full verification.

---

### PC-002-OPS-001 — Rename left generated backend exports outside the effective ignore boundary

**Severity:** Medium  
**Area:** Repository hygiene, generated artifacts, and operational data handling  
**Status:** Confirmed

**Evidence**

`.gitignore`:

- lines 447-450 ignore `/src/ProductCatalogueService/exports`, `/src/ProductCatalogueAPI/exports`, `/src/ProductCatalogueAPI/config`, and `/src/ProductCatalogueAPI/appsettings.Development.json`;
- the reviewed solution contains no `ProductCatalogueAPI` or `ProductCatalogueService` project;
- the actual backend remains `src/ProductManagerAPI`;
- `src/ProductManagerAPI` configuration files are separately ignored at lines 463-469, but its `exports` directory is not.

The committed file manifest contains generated output under:

```text
src/ProductManagerAPI/exports/101DK003BODKE/0/...
src/ProductManagerAPI/exports/101DK003BODKE/1/...
```

including compiled `.000` files, catalogues, signatures, and temporary YAML.

`src/ProductManagerAPI/ProductManagerAPI.csproj`, lines 13-24, removes `exports/**` from compile/content/resource items, confirming that the directory is runtime/generated output rather than normal source input.

**Affected files and symbols**

```text
.gitignore
src/ProductManagerAPI/ProductManagerAPI.csproj
src/ProductManagerAPI/exports/**
```

**Current behavior**

New or modified backend export artifacts are visible to Git under the real API path. Existing tracked files also remain versioned regardless of future ignore rules.

**Why it matters**

Export packages and temporary YAML can be large, change frequently, and contain operational Product content. They can be committed accidentally, create noisy diffs, increase repository size, and blur the boundary between reproducible fixtures and generated runtime output.

**Execution or reproduction path**

```text
1. Run a controlled New Edition export.
2. Execute git status --short.
3. Observe changes or new files under src/ProductManagerAPI/exports.
4. Compare the path with the current .gitignore entries.
```

**False-positive challenge**

- `.csproj` exclusion prevents build inclusion but does not prevent Git tracking.
- An ignore rule does not remove files already tracked.
- If some current files are intentional fixtures, they need an explicit fixture location and ownership; their presence does not justify leaving the entire runtime output directory unbounded.
- Backend technical project names were intentionally not renamed, so `ProductCatalogueAPI/exports` cannot cover the current runtime directory.

**Recommended direction**

Restore an ignore rule for the actual backend output path. Inventory existing tracked export files before removing them from the index:

- if generated only, remove them from version control while preserving local files as needed;
- if required test fixtures, move the smallest deterministic set into an explicit test-fixture directory and document the consumer.

Do not delete operational output blindly as part of the package.

**Change risk:** Low to medium

**Suggested package boundary**

```text
PC-012 Generated Export Artifact Boundary
```

**Verification needs**

- controlled export followed by clean/expected `git status`;
- build and tests do not depend on removed tracked artifacts;
- any retained fixture has a documented test consumer;
- no connection files, secrets, or production-only data are added;
- repository-size impact recorded if tracked binaries are removed.

**Dependencies or blockers**

The project owner must confirm whether any currently tracked export is an intentional fixture before index cleanup.

---

## Low

### PC-002-API-004 — AOI OpenAPI response type does not match the wire contract

**Severity:** Low  
**Area:** API contract documentation  
**Status:** Confirmed

**Evidence**

`src/ProductManagerAPI/Controllers/ElectronicProductsController.cs`:

- lines 62-63 declare `ApiResponse` for the AOI endpoint;
- line 174 returns raw `List<AOIResponse>`.

`src/ProductCatalogue/src/features/data/api/layerDataApi.js` and `esriJsonToGraphics.js` consume the raw array.

**Affected files and symbols**

```text
src/ProductManagerAPI/Controllers/ElectronicProductsController.cs
  GetAllElectronicProductsAOI
```

**Current behavior**

Swagger/generated clients are told to expect an envelope that the endpoint does not return.

**Why it matters**

It creates avoidable consumer errors and hides the actual compatibility contract.

**Execution or reproduction path**

Generate or inspect the OpenAPI document for `GET /electronicproducts/aoi`, compare its declared success schema with an actual successful response, and verify that the frontend consumes the raw array.

**Recommended direction**

Document the existing raw array type. Do not change the wire shape merely to match the incorrect attribute.

**Change risk:** Low

**Suggested package boundary**

```text
PC-011B AOI OpenAPI Alignment
```

May be combined with PC-011A.

**Verification needs**

- OpenAPI snapshot/operation test;
- endpoint serialization test;
- frontend AOI load regression.

**Dependencies or blockers**

None.

---

### PC-002-DOC-001 — Source-of-truth baseline headers do not identify the current Product Catalogue baseline

**Severity:** Low  
**Area:** Documentation traceability  
**Status:** Confirmed

**Evidence**

At verified baseline `8d4bf2ff57618c85f8e37619e47d6b367116a1c5`:

- `src/ProductCatalogue/README.md` identifies `7eb0fe25...` as the current reviewed runtime baseline;
- `src/ProductCatalogue/BACKEND_CONTRACTS.md` identifies runtime baseline `7eb0fe25...` and BE-108A documentation baseline `8caf5f77...`;
- `src/ProductCatalogue/docs/backend-implementation-roadmap.md` and `frontend-hardening-tracker.md` repeat those older baseline headers;
- `src/ProductCatalogue/docs/be-108a-product-history-event-design.md` identifies `8caf5f77...` rather than the final documentation-only commit `e1c247f...`;
- `src/ProductCatalogue/docs/PM-001-cross-stack-hardening-review.md` is a historical report for `e1c247f...`, although it now resides under the renamed frontend path.

**Affected files and symbols**

```text
src/ProductCatalogue/README.md
src/ProductCatalogue/BACKEND_CONTRACTS.md
src/ProductCatalogue/docs/backend-implementation-roadmap.md
src/ProductCatalogue/docs/frontend-hardening-tracker.md
src/ProductCatalogue/docs/be-108a-product-history-event-design.md
src/ProductCatalogue/docs/PM-001-cross-stack-hardening-review.md
```

**Current behavior**

Different documents accurately describe historical milestones but do not clearly separate:

```text
last feature/runtime milestone
final BE-108A documentation baseline
historical PM-001 review baseline
current Product Catalogue review baseline
```

A reader can therefore select an older commit while believing it is the current source baseline.

**Why it matters**

Implementation packages are required to start from an exact reviewed baseline. Ambiguous headers increase the chance that later work is generated against stale source or that a historical review is treated as current evidence.

**Execution or reproduction path**

Search the source-of-truth documents for `Current reviewed runtime baseline`, `documentation baseline`, and the old commit IDs, then compare them with repository HEAD.

**Recommended direction**

After PC-002 is accepted, update documentation only to distinguish historical milestone commits from the current reviewed baseline. Keep PM-001 as an explicitly historical report and add PC-002 as the implementation-planning source of truth.

**Change risk:** Low

**Suggested package boundary**

```text
PC-013 Documentation Baseline Alignment
```

**Verification needs**

- repository-wide search for stale baseline headers;
- rendered Markdown review;
- confirm no runtime, SQL, tests, project, package, or configuration files are included;
- commit the documentation package and then record its final commit separately.

**Dependencies or blockers**

Documentation-owner approval.

# Needs-evidence register

## PC-002-BE-NE-001 — Mutation lookup uses broader ArcGIS row selection than version capture

**Concern**

`ReadElectronicProductVersionAsync` uses an S-128 ElectronicProduct-only query and exact parsed dataset-name matching. `GetElectronicProductAsync` and Rollback-related paths use a quoted `LIKE` search and consume the first row.

**Why it is not confirmed**

The originally suspected `101DK001` versus `101DK001A` prefix collision is prevented by the trailing quote in the pattern. No repository fixture proves that the broad query returns a wrong row in current data.

**Smallest missing evidence**

- row counts and parsed row identities for both predicates;
- fixture with duplicate or alternate rows containing the same quoted value;
- confirmation of table constraints and row uniqueness.

**Status:** Needs evidence

---

## PC-002-BE-NE-002 — DetectProductChangesJob may bypass current operation safety

**Concern**

When enabled, `DetectProductChangesJob`:

- does not use `DatasetLockService`;
- directly mutates Products;
- treats SevenCs exceptions as successful validation;
- always chooses New Edition;
- uses separate orchestration from interactive async operations.

**Why it is not confirmed as a current finding**

The effective non-secret value of `EnableDetectProductChanges` and current recurring-job registration were not included.

**Smallest missing evidence**

```text
Effective EnableDetectProductChanges value
Whether detect-product-changes-job exists/enabled in Hangfire
Last execution result, without sensitive logs
```

If enabled, this concern should be re-evaluated immediately and is likely High.

**Status:** Needs evidence

---

## PC-002-DB-NE-001 — Current-row uniqueness and deterministic tie ordering are not verified

**Concern**

`ProductRepository` assumes:

- current rows can be identified through open-ended dates or latest timestamps;
- `date_from DESC` produces a deterministic latest row;
- name equality has acceptable case semantics.

The table definition, constraints, column precision, indexes, and collation were not supplied.

**Smallest missing evidence**

- `dbo.JobTable` column definitions;
- primary/unique constraints and relevant indexes;
- `date_from` precision;
- name collation;
- query result for duplicate open-ended rows.

**Status:** Needs evidence / database-owner dependency

---

## PC-002-PERF-NE-001 — Active-job lookup may become expensive with shared Hangfire volume

**Concern**

`ReadActiveJobIds` pages through every queue plus processing and scheduled jobs, then reads metadata per job. The frontend invokes active reconciliation every three seconds while a Product is watched.

**Why it is not confirmed**

No active-job volume, query timing, Hangfire database load, or worker topology evidence was provided.

**Smallest missing evidence**

- active job counts by queue;
- endpoint duration and SQL load at representative volume;
- number of simultaneous watched Products/clients.

**Status:** Needs evidence

---

## PC-002-OPS-NE-001 — Deployed CSP may alter the exploitability, not the existence, of PC-002-FE-001

**Concern**

No deployed `Content-Security-Policy` evidence was included.

**Required evidence**

- effective response headers from the deployed frontend;
- IIS/reverse-proxy CSP configuration;
- controlled browser reproduction.

The unsafe HTML sink remains a confirmed finding regardless.

**Status:** Needs evidence

# Rejected or disproven concerns

## Automatic Export/Rollback replay

Rejected. `ExportOperationJob` explicitly disables automatic retry, and automated tests assert it.

## Active-job lookup as concurrency authority

Rejected as a defect. Documentation and runtime correctly treat it as informational. `DatasetLockService` remains execution-time authority.

## Prefix overlap in exact version capture

Disproven. The authoritative version path has an explicit test showing that `101DK001` is not confused with `101DK001A`.

## Dataset lock stale-file ownership

Rejected. The current implementation uses the exclusive open handle as ownership, keeps lock files persistent, and has targeted concurrency/disposal tests.

## Popup-preserving refresh architecture

No defect confirmed. Reconciliation validates structure and feature identity before mutation and retains the existing full-rebuild fallback.

## Dashboard response paging only the visible page

Disproven. Backend tests confirm filtering and summaries use the complete filtered result before page selection.

## Analyze and Review stale async continuation overwrite

No defect confirmed. Both routes increment request-generation identifiers, check them after awaits, and invalidate them during destroy.

## Missing BE-108A runtime implementation

Rejected as a finding. The baseline is intentionally documentation-only.

## Backend technical names remaining `ProductManager*`

Rejected as a rename defect. `ProductManagerAPI`, `ProductManagerCore`, application-owned Hangfire parameter names, and serialized job type identities are technical compatibility boundaries. The frontend path and user-facing product name changed without authorizing backend project or job-contract renames.

## Missing migration from old frontend storage keys

Rejected as a current defect. The rename intentionally uses new `productCatalogue.*` keys, and the user accepted leaving the small number of old local keys unused. No data or operation authority depends exclusively on those legacy keys.

## Duplicate rewrite condition in `public/web.config`

Rejected as a finding. The repeated `electronicproducts` condition is redundant but has no demonstrated runtime or maintenance impact that warrants a standalone hardening package.

# Contract drift matrix

| Contract | Backend source and wire shape | Frontend consumer | Result |
| --- | --- | --- | --- |
| AOI list | Raw `AOIResponse[]` | Accepts raw arrays | Runtime aligned; OpenAPI mismatch in PC-002-API-004 |
| S-101 topology output | `topology.mapper` + `MappingFOID` to generated YAML | External compiler and downstream consumers | Split-feature mapping is incorrect in PC-002-BE-001 |
| Product details | `ApiResponse<ProductResponse>` | Wrapper-aware normalization | Aligned |
| Product History | Legacy `ApiResponse<ProductHistoryResponse[]>` | Legacy adjacent-row inference | Aligned for current baseline; explicit events deferred |
| Dashboard | `ApiResponse<DashboardResponse>` with paging/filter options | Server-filter and cursor consumer | Aligned |
| Async job start | `ExportJobStartResponse`, 202 and Location | Persistent job normalization | Aligned |
| Job status | `ExportJobStatusResponse` | Polling and terminal normalization | Shape aligned; availability semantics finding PC-002-API-003 |
| Active jobs | Raw status array | Expects array and reconciles external state | Aligned on success; exception semantics depend on PC-002-API-001 |
| Export target | `All`, `S100`, `S57`; only S100 supported | Sends readable S100 | Aligned |
| Freeze/Unfreeze | Empty success and ad hoc string errors | Generic API result handling | Compatible but not strongly typed |
| Send | HTTP 200 enqueue string and stub background job | Interpreted as completed delivery | Misaligned; PC-002-API-002 |
| Global exception | ProblemDetails body with intended status | HTTP status determines success | Misaligned; PC-002-API-001 |

# Test and verification coverage map

| Flow | Unit tested | Integration tested | Manual only | Environment-dependent | Not covered / material gap |
| --- | --- | --- | --- | --- | --- |
| Initial AOI load | Controller profiling/query-filter tests | No full HTTP/ArcGIS integration in supplied suite | Existing smoke coverage | ArcGIS and S-128 | Per-row failure behavior |
| Manual/auto refresh | Layer reconciliation and popup bridge tests | No browser E2E | Smoke-tested | ArcGIS browser runtime | Full overlapping refresh lifecycle E2E |
| Popup Product selection | Product graphic search tests | No browser E2E | Smoke-tested | ArcGIS popup runtime | None promoted |
| Freeze/Unfreeze | Action availability only | None found | Smoke-tested | SQL/ArcGIS app | Controller/repository contract |
| Send to IC-ENC | Action availability only | None found | Existing UI smoke only | Hangfire and future IC-ENC | Controller, job, state, terminal outcome |
| Async New Edition | Controller, metadata, job, operation service, target tests | Paused-worker SQL acceptance is documented, not represented in supplied test suite | Previously verified | Hangfire SQL, ArcGIS, compiler, files | Post-mutation failure classification |
| Split-feature topology Export | None found for mapper/FOID/YAML association | None | Required | ArcGIS, topology package, compiler, representative Product | Generated ID is ignored in current loop |
| Async Rollback | Controller, job, operation service, warning tests | Same limitation | Previously verified | Hangfire SQL, ArcGIS, files | Post-mutation failure classification |
| Job status | Mapping/controller unit tests | No storage-outage integration | Previously verified | Hangfire SQL | Storage exception semantics |
| Active jobs | Service/controller unit tests | Cross-profile behavior manually verified | Yes | Shared Hangfire storage | Volume/performance |
| Dashboard | Query processor and frontend query/paging tests | No SQL query-plan integration | Paging manually verified | SQL data volume | Ambiguous DST hour and large-volume evidence remain unpromoted |
| Product History | No dedicated backend controller test found | None found | Existing UI smoke | SQL history data | Failure/outcome representation intentionally deferred |
| Analyze | Domain normalizers and onboarding tests | None | Smoke-tested | ArcGIS and backend | DOM-injection regression |
| Review | Product-list and onboarding tests | None | Smoke-tested | Backend | DOM-injection regression |
| Startup | None found | None found | Normal startup observed | ArcGIS, files, SQL | Mandatory dependency failure |
| Compiler process | No timeout/process-runner tests | None | Real export exercised | Windows compiler | Hang/cancellation/process cleanup |
| Frontend rename | Terminology and onboarding tests updated | No deployment-path integration test | Rename manually applied | Hosting/rewrite environment | Generated-output ignore boundary |
| Accessibility | Some interaction/domain coverage | No automated accessibility suite | Smoke-tested | Browser/Calcite/ArcGIS | Notice announcement and injected-content safety |

# Recommended implementation packages

No package below is authorized by this report.

## PC-003 Export Topology Split Mapping Correctness

**Problem statement:** Generated split-feature IDs are enumerated but ignored while building S-101 YAML features and geometry references.

**Confirmed evidence:** PC-002-BE-001.

**In scope**

- confirm the package mapping direction;
- use each generated split ID consistently for emitted identity and topology/geometry association;
- extract the smallest testable mapping boundary;
- add focused regression tests;
- preserve non-split output.

**Out of scope**

- reintroducing the removed local topology implementation;
- broad S-101 generator redesign;
- Export/Rollback outcome semantics;
- compiler process hardening;
- package upgrades unrelated to the confirmed mapping fix.

**Files likely affected**

```text
src/ProductManagerCore/ProductManagerGDB.cs
tests/TestProductManager/* focused topology/YAML tests
```

**Contract changes:** No HTTP contract change. Generated S-101/YAML content is corrected.

**Compatibility/deployment order:** Backend/core package before relying on further New Edition exports. Frontend remains compatible.

**Automated tests:** multi-ID split mapping, unique deterministic FOIDs, expected geometry IDs, masks, and non-split regression.

**Manual acceptance:** one Product with a real split feature, YAML inspection, compiler run, validation-tool result, attachment/state verification.

**Rollback notes:** Keep the previous package versions available; do not distribute output generated by a failed acceptance build.

**Risk:** High.

**Suggested commit message**

```text
Fix split-feature topology mapping in Product Catalogue exports
```

---

## PC-004 Frontend Notice Rendering Safety

**Problem statement:** Persistent notices render untrusted values as HTML.

**Confirmed evidence:** PC-002-FE-001.

**In scope**

- replace notice `innerHTML` interpolation with safe DOM construction;
- add regression tests;
- preserve compact layout and notice behavior.

**Out of scope**

- notice-system redesign;
- changing backend error messages;
- CSP rollout.

**Files likely affected**

```text
src/ProductCatalogue/src/features/notices/ui/noticePanel.js
new focused notice rendering test
```

**Contract changes:** None.

**Compatibility/deployment order:** Frontend-only, independently deployable.

**Automated tests:** HTML-like title/message remain text; normal formatting preserved.

**Manual acceptance:** crafted local Analyze/Review input; light/dark; keyboard; toast and panel.

**Rollback notes:** Revert frontend package; no persisted contract change.

**Risk:** Low.

**Suggested commit message**

```text
Harden Product Catalogue notice rendering
```

---

## PC-005 API Exception Response Semantics

**Problem statement:** Intended exception status is not applied to HTTP responses.

**Confirmed evidence:** PC-002-API-001.

**In scope**

- set status and content type;
- preserve safe ProblemDetails body;
- add HTTP integration tests.

**Out of scope**

- repository-wide response-envelope redesign;
- authentication.

**Files likely affected**

```text
src/ProductManagerAPI/CustomExceptionHandler.cs
tests/TestProductManager/*
```

**Contract changes:** Actual HTTP status becomes consistent with the existing body.

**Compatibility/deployment order:** Backend-first. Consumers already expect non-2xx failures.

**Automated tests:** 400, 401, 409, 500 and safe body.

**Manual acceptance:** trigger a controlled exception and inspect Network/frontend notice.

**Rollback notes:** Reverting restores incorrect success semantics; no data migration.

**Risk:** Low.

**Suggested commit message**

```text
Apply HTTP status in Product Catalogue exception handler
```

---

## PC-006 Send to IC-ENC Truthfulness and State Safety

**Problem statement:** The current stub reports delivery and mutates Product state incorrectly on job failure.

**Confirmed evidence:** PC-002-BE-002 and PC-002-API-002.

**In scope**

- remove fabricated state writes;
- return truthful enqueue/unavailable semantics;
- prevent delivery-success text without terminal evidence;
- add controller/job/frontend tests.

**Out of scope**

- implementing IC-ENC delivery;
- report storage;
- BE-108A producer;
- new operation registry.

**Files likely affected**

```text
src/ProductManagerAPI/Controllers/UploadController.cs
src/ProductManagerAPI/Jobs/UploadSingularProductJob.cs
src/ProductCatalogue/src/features/data/api/productApi.js
src/ProductCatalogue/src/features/map/popups/popupProductActions.js
tests/TestProductManager/*
frontend focused tests
```

**Contract changes:** Send response and success meaning must be made explicit.

**Compatibility/deployment order:** Backend-first or coordinated. Do not leave a frontend that calls a removed route without a compatibility response.

**Automated tests:** lock conflict, missing Product, stub/unavailable result, no repository mutation, UI wording.

**Manual acceptance:** Network, Hangfire, JobTable, popup state, refresh, notices.

**Rollback notes:** No schema change. Record queued jobs before rollback.

**Risk:** Medium.

**Suggested commit message**

```text
Make Send to IC-ENC state and messaging truthful
```

---

## PC-007 Post-Mutation Outcome Classification

**Problem statement:** Failures after the execution checkpoint are presented as proven operation failures.

**Confirmed evidence:** PC-002-BE-003.

**In scope**

- classify post-start unproven outcomes as manual review;
- preserve pre-start failure behavior;
- update tests and frontend safe messaging.

**Out of scope**

- BE-108A persistence/reconciliation;
- automatic retry;
- distributed ownership.

**Files likely affected**

```text
src/ProductManagerAPI/Jobs/ExportOperationJob.cs
src/ProductManagerAPI/Models/ExportJobResponses.cs
src/ProductCatalogue/src/features/products/domain/productJob.js
tests/TestProductManager/ExportOperationJobTests.cs
frontend domain tests
```

**Contract changes:** Some terminal failures gain `MANUAL_REVIEW_REQUIRED`.

**Compatibility/deployment order:** Backend-first; frontend already displays backend safe code/message but should receive a focused regression test.

**Automated tests:** before/after execution checkpoint and every injected failure stage.

**Manual acceptance:** failure-injection matrix with Product/file/state inspection.

**Rollback notes:** No schema change; older frontend receives safe failed job metadata.

**Risk:** Medium to high.

**Suggested commit message**

```text
Classify uncertain Product operation outcomes for manual review
```

---

## PC-008 Mandatory Startup Validation

**Problem statement:** Product Catalogue dependency initialization can fail without stopping the host.

**Confirmed evidence:** PC-002-BE-004.

**In scope**

- fail fast for mandatory Product Catalogue dependencies;
- preserve complete exception logging;
- startup tests.

**Out of scope**

- health-check framework redesign;
- making Product Catalogue optional;
- authentication.

**Files likely affected**

```text
src/ProductManagerAPI/Registrations.cs
src/ProductManagerAPI/Program.cs
tests/TestProductManager/*
```

**Contract changes:** Host readiness becomes truthful.

**Compatibility/deployment order:** Backend-only; verify all deployment connection paths first.

**Automated tests:** invalid path and service resolution where possible.

**Manual acceptance:** deployed service startup with valid/invalid access.

**Rollback notes:** Configuration failures will again produce a partial host if reverted.

**Risk:** Medium.

**Suggested commit message**

```text
Fail Product Catalogue API startup on mandatory initialization errors
```

---

## PC-009 Job Status Availability and Frontend Recovery

**Problem statement:** Status infrastructure failures can look like missing jobs, while persistent non-404 failures can block forever.

**Confirmed evidence:** PC-002-API-003 and PC-002-FE-002.

**In scope**

- distinguish missing job from storage unavailable;
- add stable availability code;
- bounded frontend reconciliation through successful active-job evidence;
- retain fail-closed behavior when both sources are unavailable.

**Out of scope**

- atomic enqueue claim;
- Product operation registry;
- Hangfire retention redesign.

**Files likely affected**

```text
src/ProductManagerAPI/Services/Jobs/HangfireJobStatusService.cs
src/ProductManagerAPI/Controllers/JobsController.cs
src/ProductManagerAPI/Models/ExportJobResponses.cs
src/ProductCatalogue/src/features/products/services/productJobService.js
tests/TestProductManager/HangfireJobStatusServiceTests.cs
new frontend service tests
```

**Contract changes:** Storage outage returns a stable non-404 error.

**Compatibility/deployment order:** Backend-first, then frontend recovery.

**Automated tests:** true missing, malformed metadata, storage outage, persistent frontend failures, active-empty proof, cross-tab.

**Manual acceptance:** pause SQL access without stopping a running worker; restore and reconcile.

**Rollback notes:** No schema change.

**Risk:** Medium.

**Suggested commit message**

```text
Harden Product job status availability and recovery
```

---

## PC-010 Compiler Process Execution Hardening

**Problem statement:** Compiler execution can hang indefinitely and ignores cancellation.

**Confirmed evidence:** PC-002-BE-005.

**In scope**

- process-runner boundary;
- timeout and cancellation;
- process-tree termination;
- safe bounded output;
- tests.

**Out of scope**

- compiler replacement;
- export pipeline redesign;
- retry enablement.

**Files likely affected**

```text
src/ProductManagerAPI/Services/Export/IExportService.cs
src/ProductManagerAPI/Services/Export/ExportService.cs
src/ProductManagerAPI/Services/Operations/ExportOperationService.cs
tests/TestProductManager/*
```

**Contract changes:** Timeout produces a safe failure/manual-review result according to PC-007.

**Compatibility/deployment order:** Implement after or with PC-007.

**Automated tests:** fake process runner.

**Manual acceptance:** real compiler success plus controlled hang wrapper.

**Rollback notes:** No schema change; restore previous process invocation if necessary.

**Risk:** Medium.

**Suggested commit message**

```text
Bound and cancel Product Catalogue compiler execution
```

---

## PC-011 AOI Partial-Failure Diagnostics and Contract Alignment

**Problem statement:** Failed rows disappear without identity, and OpenAPI documents the wrong success type.

**Confirmed evidence:** PC-002-BE-006 and PC-002-API-004.

**In scope**

- structured safe per-row diagnostics;
- aggregate partial-result metric;
- correct OpenAPI type;
- focused tests.

**Out of scope**

- AOI pagination/caching;
- geometry contract redesign;
- changing raw-list response unless separately approved.

**Files likely affected**

```text
src/ProductManagerCore/ProductManagerGDB.cs
src/ProductManagerAPI/Controllers/ElectronicProductsController.cs
tests/TestProductManager/ElectronicProductsAoiProfilingTests.cs
```

**Contract changes:** OpenAPI only, unless an additive partial-result signal is approved.

**Compatibility/deployment order:** Backend-only.

**Automated tests:** valid plus malformed row; OpenAPI operation type.

**Manual acceptance:** map remains usable and affected Product can be diagnosed.

**Rollback notes:** No schema change.

**Risk:** Low to medium.

**Suggested commit message**

```text
Improve AOI partial-failure diagnostics and OpenAPI contract
```

---

## PC-012 Generated Export Artifact Boundary

**Problem statement:** The actual backend export directory is outside the effective ignore boundary and generated output is committed.

**Confirmed evidence:** PC-002-OPS-001.

**In scope**

- restore ignore coverage for `src/ProductManagerAPI/exports`;
- inventory tracked files;
- remove generated-only artifacts from version control;
- relocate and document any required deterministic fixtures.

**Out of scope**

- deleting local or production output without owner confirmation;
- changing Export runtime paths;
- changing deployment storage architecture;
- broad `.gitignore` cleanup.

**Files likely affected**

```text
.gitignore
src/ProductManagerAPI/exports/** index entries
optional explicit test-fixture documentation/location
```

**Contract changes:** None.

**Compatibility/deployment order:** Repository-only package; can be delivered independently after fixture ownership is confirmed.

**Automated tests:** Existing build and test suite must not depend on removed artifacts.

**Manual acceptance:** controlled export followed by expected `git status`; verify no required fixture disappeared.

**Rollback notes:** Files removed only from the index can be restored from the package commit if ownership was classified incorrectly.

**Risk:** Low to medium.

**Suggested commit message**

```text
Restore generated export artifact boundaries
```

---

## PC-013 Documentation Baseline Alignment

**Problem statement:** Current source-of-truth headers do not clearly identify the current Product Catalogue review baseline.

**Confirmed evidence:** PC-002-DOC-001.

**In scope:** Documentation-only baseline references and precedence review.

**Out of scope:** Any runtime, SQL, test, project, or configuration file.

**Files likely affected**

```text
src/ProductCatalogue/README.md
src/ProductCatalogue/BACKEND_CONTRACTS.md
src/ProductCatalogue/docs/backend-implementation-roadmap.md
src/ProductCatalogue/docs/frontend-hardening-tracker.md
src/ProductCatalogue/docs/be-108a-product-history-event-design.md
src/ProductCatalogue/docs/PM-001-cross-stack-hardening-review.md
```

**Contract changes:** None.

**Compatibility/deployment order:** Independent documentation package.

**Automated tests:** Not applicable.

**Manual acceptance:** repository search and rendered Markdown review.

**Rollback notes:** Revert documentation commit only.

**Risk:** Low.

**Suggested commit message**

```text
Align Product Catalogue documentation baselines after PC-002
```

# Production-readiness backlog

These items are important but are not authorized as PC-002 implementation packages:

- production authentication and authorization;
- Hangfire Dashboard authorization;
- external worker deployment;
- shared/distributed Product operation ownership;
- operational health checks and alerting;
- Hangfire retention policy evidence;
- database query-plan/index review at measured volume;
- CSP deployment and reporting;
- IC-ENC producer and acknowledgement contract;
- report storage/content;
- permanent Product ID;
- global historical timeline.

# Deferred and blocked areas

The following remain intentionally deferred or blocked and were not counted as defects:

```text
BE-108A runtime event persistence and producers
Internal validation producer/process
IC-ENC report processing and content storage
Send-to-IC-ENC Product History producer
Dashboard integration with future explicit events
external shared-worker extraction
distributed Product operation ownership
permanent Product ID
historical global map timeline
production authentication and authorization decisions
structured Analyze geometry contract
```

PC-006 is limited to removing false success and unsafe state mutation. It does not implement the deferred IC-ENC producer.

# Areas reviewed with no recommended change

- Main map remains Product Collection owner.
- Product actions remain in popup UI.
- Product History quick panel remains separate from Analyze and Review.
- Review tabs remain independent workspaces.
- Popup-preserving refresh keeps reconciliation plus full-rebuild fallback.
- Dataset lock ownership remains the exclusive open file handle.
- Async Export/Rollback routes remain additive and stable.
- Application-owned Hangfire creation metadata remains the correct status source.
- Automatic retry remains disabled.
- Backend-authoritative active-job lookup remains informational.
- Readable ExportTarget values remain unchanged.
- Dashboard cursor ordering and complete-filtered summary semantics remain unchanged.
- Dapper and handwritten SQL remain the database architecture.
- Analyze and Review request-generation guards remain in place.
- Frontend route titles, onboarding text, package name, documentation paths, and versioned storage keys consistently use Product Catalogue.
- Backend/core project names and Hangfire parameter names remain stable technical identifiers.
- The Negotiate package update to `10.0.10` introduces no repository-visible contract change requiring a PC-002 package.
- The historical PM-001 report remains preserved as historical evidence rather than overwritten.
- BE-108A remains documentation-only.

# Documentation updates required

After the review is accepted, documentation should record:

1. PC-002 as the current implementation-planning review and PM-001 as historical.
2. The exact current runtime/review baseline and the final BE-108A documentation commit.
3. Split-feature topology mapping semantics once PC-003 is implemented.
4. Send-to-IC-ENC as unavailable/stub until a real producer contract exists.
5. Post-mutation manual-review semantics once PC-007 is implemented.
6. Job-status unavailable semantics once PC-009 is implemented.
7. AOI partial-failure operational diagnostics once PC-011 is implemented.
8. Generated-output ownership and fixture policy once PC-012 is completed.

No source-of-truth documentation should describe a recommended package as already implemented.

# Verification commands

The review did not execute these commands. Later implementation packages should use the repository's current commands and environment requirements.

## Backend

```powershell
dotnet restore Nexus.slnx
dotnet build Nexus.slnx --configuration Debug
dotnet test tests/TestProductManager/TestProductManager.csproj --configuration Debug
```

Full backend acceptance may require:

```text
Windows/x64
ArcGIS Core/CoreHost and licensing
S-128 connection
Product Catalogue system SQL Server
Hangfire SQL storage
compiler and artifacts
configured output/filesystem permissions
representative Product data
```

## Frontend

```powershell
cd src/ProductCatalogue
npm run check
```

## Manual cross-stack matrix

At minimum, later packages should verify:

- HTTP status and safe error body;
- Product state before/after failure;
- Hangfire state and application-owned metadata;
- lock release;
- reload and cross-tab recovery;
- light and dark mode;
- keyboard/focus behavior;
- RDP/VDI-readable loading states;
- browser Network behavior;
- no raw exception, internal path, SQL, compiler command, or secret in public responses.

# Review conclusion

The reviewed baseline contains a strong foundation around async Export/Rollback creation metadata, replay prevention, dataset locking, active-job visibility, deterministic Dashboard paging, popup-preserving refresh, and route-level stale-response suppression.

The most urgent work is not broad refactoring. It is a small set of bounded correctness packages:

```text
PC-003 Export topology split mapping correctness
PC-004 notice rendering safety
PC-005 HTTP exception semantics
PC-006 Send truthfulness/state safety
PC-007 post-mutation outcome classification
PC-008 startup validation
PC-009 job-status availability/recovery
PC-010 compiler process bounds
PC-011 AOI diagnostics/contract
PC-012 generated export artifact boundary
PC-013 documentation baseline alignment
```

No runtime implementation, SQL migration, test change, project change, package change, or configuration change is authorized by this report.
