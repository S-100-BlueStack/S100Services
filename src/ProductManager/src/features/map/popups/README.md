# Popup actions

Popup actions are implemented as a custom DOM action bar instead of Esri `view.popup.actions`.

This keeps the action UI consistent with Product Manager requirements:

- two action rows
- nested export dropdowns
- leaf-level export loading state
- action-specific disabled reasons
- shared action availability rules

## File responsibilities

- `popupActionConfig.js` defines the actions shown in the popup and maps product state to UI action config.
- `productActionAvailability.js` is the domain-level source of truth for action availability.
- `popupProductActions.js` owns confirmation, API calls, notices, operation lifecycle and post-action refresh.
- `popupExportState.js` tracks the active export leaf while the current page remains open.
- `popupActionDom.js` creates top-level action button DOM.
- `popupActionDropdown.js` creates nested dropdown UI.
- `createPopup.js` renders popup content and subscribes to export and product-operation state.
- `popupExportConfig.js` defines canonical export target/type metadata and request wiring.
- `popupExportContract.js` owns the supported-leaf rule and direct-dispatch guard.
- `features/data/api/exportApi.js` starts asynchronous Export and Rollback jobs.
- `features/data/api/productJobApi.js` calls the job start and status endpoints.
- `features/products/services/productJobService.js` persists, resumes and polls active jobs.
- `features/products/state/productOperationState.js` combines local operations with restored backend jobs.

## Current action status

Implemented product mutations:

- `Freeze`
- `Unfreeze`
- `Send to IC-ENC`
- `Rollback`

Implemented export leaf:

```text
Export > S100 > Edition
```

Disabled export leaves:

```text
Export > All > Edition
Export > All > Update
Export > S57 > Edition
Export > S57 > Update
Export > S100 > Update
```

`Export > All` remains intentionally disabled. The current workflow only exposes `S100 > Edition`.

## Current endpoint wiring

New Edition export and Rollback use the asynchronous BE-104 job contract:

```text
POST /export/{name}/newedition/jobs?exportTarget=S100
POST /export/{name}/rollback/jobs
GET /jobs/{jobId}
```

The existing synchronous backend endpoints remain available for compatibility, but the frontend does not use them for normal popup actions.

Endpoint wiring belongs in `features/data/api/exportApi.js` and `popupExportConfig.js`. Do not add endpoint wiring directly in `popupActionConfig.js`.

## BE-102 export target contract

Backend parsing is case-insensitive and uses the canonical public names `All`, `S100`, and `S57`.

- Missing target defaults to `S100`.
- Explicit empty or whitespace values are invalid.
- `Both`, numeric values, numeric-looking values and unknown text return `400 EXPORT_TARGET_INVALID`.
- `All` and `S57` return `422 EXPORT_TARGET_NOT_SUPPORTED`.

Every export leaf has explicit `target` and `exportType` metadata. `popupExportContract.js` owns the single supported-leaf rule. `triggerExport` applies that guard before confirmation, loading state and request dispatch.

## Product action lifecycle

`popupProductActions.js` owns action execution.

For synchronous mutations such as Freeze, Unfreeze and Send:

```text
confirm
-> start local product operation
-> call API
-> show notice
-> refresh selected product
-> end local product operation
```

For asynchronous Export and Rollback:

```text
confirm
-> start local product operation
-> enqueue backend job
-> persist job metadata
-> project job into external product-operation state
-> poll GET /jobs/{jobId}
-> receive terminal status
-> remove persisted job
-> show success, warning or failure notice
-> refresh affected product data
-> end local product operation
```

Product operations remain active until post-action refresh completes. This prevents stale intermediate UI states.

## Persistent job tracking

Active Product Manager jobs are stored under a versioned local-storage key.

On application startup, the job service:

1. reads persisted job metadata;
2. projects each job into `productOperationState` as an external operation;
3. resumes status polling;
4. keeps conflicting product actions disabled;
5. shows the terminal notice when the job finishes;
6. refreshes the active route data.

A transient polling failure does not remove the stored job. Status polling retries with bounded backoff because the backend operation may still be running.

A `404 JOB_NOT_FOUND` response clears the local record and reports that the final result is unavailable.

The job start request deliberately has no frontend timeout. Timing out after the backend has enqueued a job could leave the browser without its `jobId`. Status requests use a finite timeout and are safe to retry.

## Product operation state

`productOperationState.js` combines:

- local operations started in the current page;
- external operations restored from persisted backend jobs.

It is used to:

- show loading labels such as `Freezing...`, `Sending...`, `Rolling back...` and export labels;
- block conflicting product mutations;
- keep state active through post-action refresh;
- re-render an open popup when operation state changes.

This state remains a UX guard. The backend still owns authoritative locking, version checks and execution guards.

## Export state

Exports are tracked in two systems for different purposes:

- `productOperationState.js` tracks that the product has an export operation running;
- `popupExportState.js` tracks the active export leaf and scope conflicts on the current page.

Do not move export scope-conflict logic into product-level operation state unless a future backend contract replaces both systems.

Export scope conflicts remain:

- `All` conflicts with every export scope;
- a specific scope conflicts with itself and `All`;
- specific scopes do not conflict with each other.

Only `S100 > Edition` is currently enabled.

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

## BE-105 boundary

BE-104B can only restore jobs created by browser storage that is available to the current browser profile.

It does not discover operations started by:

- another user;
- another browser profile;
- a backend worker without a locally persisted job record.

BE-105 should provide authoritative active product-operation visibility from the backend. That state should enter the UI through `productOperationState`, not through popup-specific state.


## Cross-tab job synchronization

Active job records are synchronized between same-origin browser tabs through local storage, `BroadcastChannel`, focus/pageshow/visibility reconciliation and a short fallback reconciliation interval. This keeps popup action availability current even when a browser drops or delays a storage event. Cross-user and cross-browser-profile visibility still requires the later backend active-operation contract.

Operation precondition failures are returned as `PRODUCT_OPERATION_REJECTED` with a backend-owned safe message, for example when New Edition is requested while the product is already `Exported`. Unexpected internal failures remain sanitized as `EXPORT_FAILED` or `ROLLBACK_FAILED`.

## Backend-authoritative active job visibility

Active Export and Rollback jobs are now discovered from the shared backend with:

```text
GET /jobs/active?datasetName={datasetName}
```

The endpoint reads active Product Manager jobs from the existing Hangfire storage and returns only exact, case-insensitive product matches whose public status is `Queued` or `Running`.

Popup behavior:

1. opening a product popup starts an immediate backend reconciliation;
2. the popup repeats reconciliation while it remains open;
3. discovered jobs enter `productOperationState` as backend operations;
4. Export jobs are also projected into export leaf state;
5. conflicting actions remain disabled until the job is terminal;
6. normal `GET /jobs/{jobId}` polling owns terminal completion and notices.

Local storage, storage events and `BroadcastChannel` remain same-browser performance optimizations. They are not the source of truth. The backend active-job endpoint provides visibility across browser profiles, users and computers that share the same Product Manager backend and Hangfire storage.

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
