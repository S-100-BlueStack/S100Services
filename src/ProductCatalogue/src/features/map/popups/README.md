# Popup actions

Current backend baseline: `345b79eef2a9225473d57db80243e731739cbc3a`.
See the [normalized contract review](../../../../docs/normalized-workflow-frontend-adaptation.md).

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
  refresh for implemented capability-gated operations.
- `popupExportState.js` tracks popup-local export leaf state by deterministic Product identity.
- `popupActionDom.js` creates and reconciles top-level action button DOM.
- `popupActionDropdown.js` creates the dropdown, disabled tooltip, keyboard, focus, Escape, and
  outside-click behavior.
- `createPopup.js` renders electronic Product popup content and subscribes to export and
  Product-operation state.
- `features/dataSources/map/createDataSourcePopup.js` selects the electronic popup for backend-refresh
  capable sources and keeps mock popups free of electronic requests/subscriptions.
- `popupExportConfig.js` creates declarative Edition/Update leaves from Product context.
- `popupExportContract.js` owns the source/capability/operation/specification dispatch guard.
- `features/data/api/exportApi.js` starts ExportEdition, ExportUpdate and CancelExport jobs through direct routes.
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

The isolated legacy `compatibility-aoi` layer adapter is not a production source or fallback.
Production S57/S101 now use independent registry-owned AOI contracts.

## Current action status

Electronic registry Products expose capability-gated actions:

- `Freeze` / `Unfreeze`;
- `Send to IC-ENC`;
- `Cancel Export`;
- `Analyze` and `History` through `Tools`;
- `Export...`.

Synthetic Paper Charts and S-102 definitions are retained only for explicit source-boundary tests.
They are no longer runtime-selectable or workspace-available. Their existing fail-closed ProductContext
and disabled Export contracts remain useful regression fixtures and still cannot dispatch electronic
backend mutations.

The popup-header collection action re-resolves the currently selected Graphic through Product context
before every add/remove mutation and guards both dataset name and source-aware identity. Selection
changes therefore cannot let a stale button mutate a different Product. Synthetic source fixtures may
exercise the same ProductContext-based Collection contract in tests. `Copy dataset name` remains
independent from Product Collection capability.

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

### Electronic Products

S57 and S101 expose Edition and Update against the selected Product's own specification:

```text
POST /export/{name}/newedition
POST /export/{name}/newupdate
POST /export/{name}/cancel-export
```

No target query or obsolete `/jobs` suffix is sent. Export creates an unverified candidate, not an
S-128 publication. Backend mapping/version/candidate checks remain authoritative. S57 Freeze and
Unfreeze remain disabled because the current upload routes explicitly write S-101.

### Synthetic Paper Charts and S-102 fixtures

These test-only source definitions declare visible `Edition` and `Update` leaves with:

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
allows implemented Edition/Update leaves whose capability and specification match their Product context.

## Product action lifecycle

`popupProductActions.js` owns implemented action execution.

For synchronous mutations such as Freeze and Unfreeze:

```text
confirm
-> start local Product operation
-> call API
-> show notice
-> refresh selected Product
-> end local Product operation
```

For asynchronous Export, Cancel Export and Send simulation:

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
from backend jobs. The normalized backend remains authoritative for job identity, specification resolution, locking,
version checks and execution guards.

## Source-local Product metadata

Electronic popup metadata renders one column for the selected Product source. Matching export-track
metadata may enrich that column with candidate edition/update, state, error and validation files, but
related tracks for another Product Specification are not rendered as additional columns. For example,
an S-57 Product never exposes an S-101 comparison column merely because the backend uses an S-101
relationship during export mapping.

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

## Cancel Export warnings

Terminal job responses may contain a safe backend warning. No legacy cleanup warning code is
assumed to be produced by the normalized CancelExport implementation.

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

Operation precondition failures are returned as `PRODUCT_OPERATION_REJECTED` with a backend-owned safe message, for example when a candidate is already ReadyForDistribution. Validation and execution failures retain the safe code/message supplied by the current backend.

## Backend-authoritative active job visibility

Active Export and Cancel Export jobs are now discovered from the shared backend through their existing backend operation identifiers with:

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

## BE-108A foundation and deferred producer design

BE-108A does not change popup action runtime at this baseline. The approved design is recorded in:

```text
src/ProductCatalogue/docs/be-108a-product-history-event-design.md
```

### Batch 1 boundary

The preserved Batch 1 foundation provides:

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
Initial host: ProductCatalogueAPI Hangfire Server
Future host: shared worker
```

Unknown Hangfire states remain pending and are logged; they are not automatically mapped to failures.

## Future external worker boundary

The current frontend contract does not depend on the Hangfire worker running inside ProductCatalogueAPI. A later migration to the shared Hangfire API/worker application can retain the start, status and active-job HTTP contracts, provided the shared worker can execute the Product Catalogue job assembly and access the required ArcGIS, compiler, connection-file and filesystem dependencies.

An external worker migration must be coordinated with the planned atomic operation-registry work. The current local dataset lock and Hangfire monitoring lookup are not sufficient as a final distributed ownership model across independently deployed workers.
