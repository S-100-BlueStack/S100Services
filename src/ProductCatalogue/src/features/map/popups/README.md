# Popup actions

Current implementation baseline: `60e4854389ab16d3bd280f653998ea10eaa0b6ab`.

Popup actions are implemented as a custom DOM action bar instead of Esri `view.popup.actions`.
FI-011C keeps the established action lifecycle while resolving every selected Product through a
source-aware Product context before rendering or dispatching an action.

The action UI provides:

- capability-specific action visibility;
- a flat `Export...` menu with `Edition` and `Update` leaves;
- leaf-level export loading state for implemented operations;
- visible disabled placeholders with action-specific availability reasons;
- shared action availability rules and backend-authoritative Product-operation blocking.

## File responsibilities

- `features/products/domain/productContext.js` resolves a Graphic into the central source-aware
  Product context and owns the explicit compatibility-AOI adapter.
- `popupActionConfig.js` creates action descriptors from Product context, Product state, active jobs,
  and export state.
- `features/products/domain/productActionAvailability.js` is the domain-level source of truth for
  action visibility and availability.
- `popupProductActions.js` owns confirmation, API calls, notices, operation lifecycle, and post-action
  refresh for implemented compatibility operations.
- `popupExportState.js` tracks popup-local export leaf state by deterministic Product identity.
- `popupActionDom.js` creates and reconciles top-level action button DOM.
- `popupActionDropdown.js` creates the dropdown, disabled tooltip, keyboard, focus, Escape, and
  outside-click behavior.
- `createPopup.js` renders compatibility Product popup content and subscribes to export and
  Product-operation state.
- `features/dataSources/map/createDataSourcePopup.js` renders registry-backed source popups without
  compatibility API refresh or job subscriptions.
- `popupExportConfig.js` creates declarative Edition/Update leaves from Product context.
- `popupExportContract.js` owns the implemented compatibility dispatch guard.
- `features/data/api/exportApi.js` starts asynchronous Export and Rollback jobs.
- `features/data/api/productJobApi.js` calls the job start and status endpoints.
- `features/products/services/productJobService.js` persists, resumes, and polls active jobs.
- `features/products/state/productOperationState.js` combines local operations with restored backend
  jobs.

## Product context resolution

The popup and action layers consume a resolved Product context equivalent to:

```js
{
  sourceId,
  productKey,
  identityKey,
  datasetName,
  productType,
  layerId,
  capabilities,
  exportConfiguration,
  graphic,
}
```

Registry-backed Products must carry matching Graphic attributes and layer metadata installed by the
data-source map adapter. Attribute-only or stale source metadata fails closed. UI code must not infer
a source from layer title, popup DOM, or dataset-name patterns.

The combined AOI path participates through the internal `compatibility-aoi` adapter. This adapter ID
is not a registry source, user toggle, or persisted source value. It may be removed when authoritative
separate S-57 and S-101 Product/read contracts exist.

## Current action status

Compatibility AOI retains the established actions:

- `Freeze` / `Unfreeze`;
- `Send to IC-ENC`;
- `Rollback`;
- `Analyze` and `History` through `Tools`;
- `Export...`.

Paper Charts and S-102 expose only the configured `Export...` root with disabled placeholders. Their
layer capability `supportsPopupActions: true` permits that safe action-bar content without granting
backend Product workflows. Product Collection is independently gated by the resolved Product
context's `productCollection` capability, which is `false` for both mock sources. They do not expose
Freeze, Unfreeze, Send to IC-ENC, Rollback, History, reports, Analyze, Review, or Product Collection
actions.

The popup-header collection action re-resolves the currently selected Graphic through Product context
before every add/remove mutation. Selection changes therefore remove stale buttons, and a stale AOI
button cannot mutate Product Collection after the selected feature becomes a mock Product. `Copy
dataset name` remains independent from Product Collection capability.

Unknown Product context or unknown capability fails closed and renders no backend-dependent action.
Product-search selection uses the same resolution and availability path and cannot bypass these
checks.

## Simplified Export menu

The visible popup structure is:

```text
Export...
  Edition
  Update
```

There are no visible `All`, `S57`, `S100`, `S101`, `Paper Charts`, or `S-102` menu groups. Backend
wire targets remain independent from labels and operation kinds.

### Compatibility AOI

`Edition` remains the only implemented compatibility export. It keeps the baseline backend behavior:

```text
POST /export/{name}/newedition/jobs?exportTarget=S100
```

The generic `Edition` label is a UI simplification only. FI-011C does not change the wire target to
`All`, S-57, or S-101, and it does not invent a source split. `Update` remains a disabled placeholder
because no implemented frontend/backend Update contract exists on the baseline.

Separate source-correct S-57 and S-101 targets require authoritative independent Product/read
contracts and are deferred.

### Paper Charts and S-102

Both sources declare visible `Edition` and `Update` leaves with:

- `implemented: false`;
- no backend target;
- no handler;
- source-specific availability text.

The dropdown renders these leaves disabled. They cannot enter loading state, dispatch an API request,
create a notice, or block an unrelated Product. A future source can activate a leaf by supplying its
capability, handler ID, and backend target without changing popup DOM construction.

## Declarative Export contract

Export leaves keep these concerns separate:

```js
{
  id,
  label,
  operationKind,
  capability,
  visible,
  implemented,
  backendTarget,
  availabilityReason,
  handlerId,
}
```

`popupExportConfig.js` resolves the handler registry and creates UI descriptors. UI code does not map
source IDs to endpoints. `popupExportContract.js` remains a final direct-dispatch guard and currently
allows only the established compatibility Edition operation with the S100 wire target.

## Product action lifecycle

`popupProductActions.js` owns implemented action execution.

For synchronous mutations such as Freeze, Unfreeze, and Send:

```text
confirm
-> start local Product operation
-> call API
-> show notice
-> refresh selected Product
-> end local Product operation
```

For asynchronous Export and Rollback:

```text
confirm
-> reconcile backend-authoritative active jobs
-> start popup-local export state where applicable
-> enqueue backend job
-> persist job metadata
-> project job into external Product-operation state
-> poll GET /jobs/{jobId}
-> receive terminal status
-> remove persisted job
-> show success, warning, or failure notice
-> refresh affected Product data
-> end local Product operation
```

Product operations remain active until post-action refresh completes. This prevents stale
intermediate UI states.

## Persistent job tracking

Active Product Catalogue jobs are stored under the established versioned local-storage key. On
application startup, the job service restores and polls persisted jobs, keeps conflicting actions
disabled, publishes terminal notices, and refreshes active route data. Backend active-job lookup
remains authoritative across users and computers.

## Product operation state

`productOperationState.js` combines local operations and external operations restored or discovered
from backend jobs. FI-011C does not change backend job identity, endpoint contracts, locking, version
checks, or execution guards.

## Export state

Exports remain represented by two systems:

- `productOperationState.js` tracks a running Product export and backend-authoritative active job;
- `popupExportState.js` tracks popup-local leaf loading and scope conflicts.

The popup state API accepts Product context, source-aware identity, or the established dataset name.
Dataset names remain globally unique on the current contract, so dataset-based callers retain their
existing key. Source-aware identity is used when no dataset name exists. Loading is isolated by
Product, scope, and operation kind.

The existing scope-conflict model remains available for backend compatibility. The simplified UI no
longer exposes scope groups, but the `All` overlap rule is retained internally until backend contracts
replace it.

Source deactivation clears only popup-local UI state for that source. It does not cancel or delete a
backend-authoritative job.

## Rollback warnings

A successful Rollback can return a warning, currently including:

```text
ROLLBACK_CLEANUP_FAILED
```

The frontend treats this as a successful operation and shows a warning notice with the safe backend message.

## Popup action reconciliation

Open popups listen for:

- export-state changes via `onPopupExportStateChanged`;
- product-operation-state changes via `onProductOperationStateChanged`.

When relevant state changes, the popup reconciles the existing action buttons in place. Stable `calcite-action` elements retain their DOM identity while label, icon, loading, disabled state and dropdown configuration are updated. If a dropdown is already open, it is synchronously refreshed on the same anchor so remote job start and terminal refreshes do not collapse the menu. Keyboard focus is restored to the same enabled leaf when possible. The dropdown closes only when its action is removed or no longer exposes menu items. Subscriptions must be cleaned up when popup DOM is disconnected.

## Route refresh behavior

When a restored job reaches a terminal state:

- the main map uses the existing refresh service;
- Analyze reloads the current Analyze product set without a fullscreen loader;
- Dashboard refreshes the current range;
- Review reloads the current Review product set.

Direct popup actions continue to use their existing `afterResult` refresh callback.

## Analyze page

Analyze product actions remain in the product popup, not in the Analyze sidebar. The sidebar is reserved for analysis details, reports, XML and history content.

## Visibility boundaries

BE-105 is implemented. Product Catalogue no longer depends on browser storage to discover jobs started by another user, browser profile or computer.

`GET /jobs/active?datasetName={datasetName}` is the shared visibility source. Local storage and same-origin browser messaging remain latency and reload-recovery optimizations.

The active-job lookup is not an atomic enqueue reservation. The backend dataset lock remains the execution-time authority until a future atomic Product-operation registry is explicitly designed.

## Cross-tab job synchronization

Active job records are synchronized between same-origin browser tabs through local storage, `BroadcastChannel`, focus/pageshow/visibility reconciliation and a short fallback reconciliation interval. This keeps popup action availability responsive when a browser drops or delays a storage event. Cross-user and cross-computer visibility comes from the backend active-job endpoint.

Operation precondition failures are returned as `PRODUCT_OPERATION_REJECTED` with a backend-owned safe message, for example when New Edition is requested while the product is already `Exported`. Unexpected internal failures remain sanitized as `EXPORT_FAILED` or `ROLLBACK_FAILED`.

## Backend-authoritative active job visibility

Active Export and Rollback jobs are now discovered from the shared backend with:

```text
GET /jobs/active?datasetName={datasetName}
```

The endpoint reads active Product Catalogue jobs from the existing Hangfire storage and returns only exact, case-insensitive product matches whose public status is `Queued` or `Running`.

Popup behavior:

1. opening a product popup starts an immediate backend reconciliation;
2. the popup repeats reconciliation while it remains open;
3. discovered jobs enter `productOperationState` as backend operations;
4. Export jobs are also projected into export leaf state;
5. conflicting actions remain disabled until the job is terminal;
6. normal `GET /jobs/{jobId}` polling owns terminal completion and notices.

Local storage, storage events and `BroadcastChannel` remain same-browser performance optimizations. They are not the source of truth. The backend active-job endpoint provides visibility across browser profiles, users and computers that share the same Product Catalogue backend and Hangfire storage.

Before any product mutation is dispatched, `popupProductActions.js` performs a backend reconciliation. If active-operation status cannot be verified, the action fails closed and no mutation request is sent.

## Popup-preserving map refresh

The main map refresh service now attempts an in-place GraphicsLayer reconciliation before using the full rebuild flow.

For structurally compatible refreshes:

- existing GraphicsLayer instances are retained;
- matching Graphic instances are retained by `featureKey`;
- geometry, attributes and symbols are updated in place;
- new graphics are added and removed graphics are deleted;
- the selected popup Graphic keeps object identity;
- the popup refreshes its product details through `popupRefreshBridge.js` without closing and reopening.

The existing full rebuild and popup restore flow remains the fallback when:

- the layer set or layer metadata changes;
- a layer index is invalid;
- a feature is missing a stable `featureKey`;
- duplicate feature identities are detected;
- candidate layer creation cannot use the in-place path.

The popup action bar is also retained during compatible refreshes. Action buttons are updated in place instead of being removed and recreated, preventing Calcite icons from flashing while still allowing real state transitions such as `Exporting...` to appear.

This keeps normal auto, manual and product-job refreshes visually stable while preserving the previous behavior for structural or integrity edge cases.

## Planned BE-108A Product History integration

BE-108A does not change popup action runtime at this baseline. The approved design is recorded in:

```text
src/ProductCatalogue/docs/be-108a-product-history-event-design.md
```

### Batch 1 boundary

The later foundation batch prepares:

- application-owned `OperationId`;
- endpoint-specific Product History responses;
- additive explicit event normalization;
- deterministic `StateRecordId` association.

It does not connect terminal popup jobs to the audit lifecycle.

### Batch 2 boundary

The later producer/recovery batch connects Export and Rollback jobs to one public audit event per logical operation.

Canonical outcomes:

```text
Succeeded
Failed
SucceededWithWarning
RequiresManualReview
```

A terminal popup notice and a Product History event are separate concerns:

- popup polling owns immediate current-session feedback and route refresh;
- Product History owns durable audit visibility;
- an audit finalization failure after business success must not turn the popup job into `Failed`;
- reconciliation later completes the pending audit event.

### Identity

The future flow preserves:

```text
OperationId
JobId
CorrelationId
StateRecordId
```

`StateRecordId` participates in deterministic association, but an ID match alone is insufficient. A legacy entry is suppressed only for matching Export/Export or Rollback/Rollback types when the explicit outcome is `Succeeded` or `SucceededWithWarning`; failure/manual-review outcomes, missing or mismatched IDs, different operation types, and status/note entries remain separate. Frontend timestamp-based deduplication is prohibited.

### Execution and audit failure policy

Before irreversible side effects in Batch 2:

```text
pending audit event exists
→ ProductManagerExecutionStarted is set
→ audit ExecutionStartedAtUtc is persisted
→ business side effects begin
```

Pending audit creation failure stops the job before execution with a distinct safe audit-unavailable result. If the audit execution checkpoint fails after the Hangfire execution flag is set, business execution does not begin and the event is treated conservatively as `RequiresManualReview`.

Audit persistence must not replace the dataset lock, active-job visibility, or any future operation ownership registry.

### Reconciliation ownership

Planned Batch 2 configuration:

```text
Recurring job ID: product-history-reconciliation
Initial schedule: every 15 minutes
Dedicated queue: productmanager-maintenance
Initial host: ProductManagerAPI Hangfire Server
Future host: shared worker
```

Unknown Hangfire states remain pending and are logged; they are not automatically mapped to failures.

## Future external worker boundary

The current frontend contract does not depend on the Hangfire worker running inside ProductManagerAPI. A later migration to the shared Hangfire API/worker application can retain the start, status and active-job HTTP contracts, provided the shared worker can execute the Product Catalogue job assembly and access the required ArcGIS, compiler, connection-file and filesystem dependencies.

An external worker migration must be coordinated with the planned atomic operation-registry work. The current local dataset lock and Hangfire monitoring lookup are not sufficient as a final distributed ownership model across independently deployed workers.
