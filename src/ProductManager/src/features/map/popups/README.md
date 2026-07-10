# Popup actions

Popup actions are implemented as a custom DOM action bar instead of Esri `view.popup.actions`.

This keeps the action UI consistent with Product Manager requirements:

- two action rows
- nested export dropdowns
- leaf-level export loading state
- action-specific disabled reasons
- shared action availability rules

## File responsibilities

- `popupActionConfig.js`
  Defines which actions are shown in the popup and maps product state to UI action config.
- `productActionAvailability.js`
  Contains product action availability rules. This is the domain-level source of truth for whether actions are disabled.
- `popupProductActions.js`
  Executes product actions. This file owns confirmation dialogs, API calls, notices, operation lifecycle and post-action refresh.
- `popupExportState.js`
  Tracks long-running export leaf actions and emits state change events so open popups can re-render.
- `popupActionDom.js`
  Creates the top-level action button DOM.
- `popupActionDropdown.js`
  Creates nested dropdown UI for grouped actions such as export.
- `createPopup.js`
  Renders popup content and subscribes to export-state and product-operation-state changes.
- `popupExportConfig.js`
  Defines popup export groups, scopes, export types, labels and endpoint wiring. Future export actions should be activated here when backend endpoints become available.

## Current action status

Implemented product mutations:

- `Freeze`
- `Unfreeze`
- `Send to IC-ENC`
- `Rollback`

Implemented export leaves:

```txt
Export > S100 > Edition
```

Disabled export leaves:

```txt
Export > All > Edition
Export > All > Update
Export > S57 > Edition
Export > S57 > Update
Export > S100 > Update
```

`Export > All` is intentionally disabled even though earlier frontend versions wired `All > Edition` and `All > Update`. The current workflow only exposes `S100 > Edition`.

## Current endpoint wiring

Current implemented export endpoint:

```http
POST /export/{name}/newedition
```

Used by:

```txt
Export > S100 > Edition
```

Current implemented rollback endpoint:

```http
POST /export/{name}/rollback
```

Used by:

```txt
Rollback
```

Endpoint wiring belongs in `features/data/api/exportApi.js` and `features/map/popups/popupExportConfig.js`. Do not add export endpoint wiring directly in `popupActionConfig.js`.

## Action availability

Availability rules should stay in `productActionAvailability.js`.

Do not duplicate business rules directly in popup UI files. UI files should only translate availability into action properties such as:

- `disabled`
- `disabledReason`
- `loading`
- `label`

## Product action lifecycle

`popupProductActions.js` owns the action execution lifecycle.

Expected flow:

```txt
User clicks action -> confirmation dialog opens -> user confirms -> product operation starts -> API request runs -> success/failure notice is shown -> selected product is refreshed -> popup re-renders with fresh attributes -> product operation ends
```

Product operations must stay active until post-action refresh is complete. This prevents stale intermediate UI states.

For example, after a successful freeze response, the popup should keep showing `Freezing...` until the refreshed product attributes arrive and the action changes to `Unfreeze`.

Rollback follows the same lifecycle and should keep showing rollback loading state until the selected product refresh has completed.

Do not move post-action refresh back into `popupActionConfig.js`. Action config should describe UI actions; action execution should own the full lifecycle.

## Product operation state

`productOperationState.js` tracks product-level operations currently running in this browser tab.

It is used to:

- show loading labels such as `Freezing...`, `Unfreezing...`, `Sending...`, `Rolling back...` and export labels
- block conflicting product mutations while an operation runs
- keep operation state active until refresh completes
- provide a future adapter point for backend operation state

This state is a UX guard only. The backend must still enforce real operation rules and conflicts.

## Export state

Exports have additional leaf-level state and conflict rules.

`popupExportState.js` stores currently running exports by:

- dataset name
- export scope
- export type

The export root action stays open while an export is running. This allows the user to inspect which export is running and which export actions are blocked. Leaf actions show the actual export loading/conflict state.

## Relationship between product operation state and export state

Export is tracked in both systems for different reasons:

- `productOperationState.js` tracks that the product has an export operation running.
- `popupExportState.js` tracks which export leaf action is running or blocked.

Do not move export scope-conflict logic into `productOperationState.js` unless backend operation state later replaces both systems.

## Export scope conflicts

Export locking is scope-based:

- `All` conflicts with every other export scope.
- Any specific scope conflicts with itself and `All`.
- Specific scopes do not conflict with each other.

Examples:

- Running `All Edition` blocks `All`, `S57`, and `S100`.
- Running `S57 Edition` blocks `S57` and `All`.
- Running `S57 Edition` does not block `S100`, if `S100` is implemented.
- Running `S100 Edition` blocks `S100` and `All`.

This keeps the model extensible when more export formats are added, even though only `S100 > Edition` is currently implemented.

## Export configuration

Popup export structure is defined in `popupExportConfig.js`.

To activate a future export leaf action:

1. Add the backend request function in `features/data/api/exportApi.js`.
2. Import that request in `popupExportConfig.js`.
3. Set the leaf action to `implemented: true`.
4. Assign the request function.
5. Add a confirm message if the default wording is not specific enough.

Do not add export endpoint wiring directly in `popupActionConfig.js`. That file should build UI actions from export config, not define export formats.

## Product mutations during export

While an export is running for a product, other product mutation actions are disabled:

- Freeze
- Unfreeze
- Send to IC-ENC
- Rollback

This avoids conflicting backend operations while export is processing. The export root remains openable during export so users can inspect export leaf state.

## Rollback during other operations

Rollback is treated as a product mutation. It should be blocked while another local product operation or export operation is running for the same product.

Rollback currently calls:

```http
POST /export/{name}/rollback
```

If rollback later becomes an async backend job, it should enter the same backend operation state model as export/send/freeze.

## Popup re-rendering

Open popups listen for:

- export-state changes via `onPopupExportStateChanged`
- product-operation-state changes via `onProductOperationStateChanged`

When relevant state changes, the popup closes any open dropdown and re-renders the action bar. Subscriptions must be cleaned up when popup DOM content is disconnected.

## Analyze page

Analyze product actions should remain in the product popup, not in the Analyze sidebar.

The Analyze sidebar is for analysis details, reports, XML, and history content. The popup action bar should remain the consistent place for product mutations.

## Backend operation state

Popup export state and product operation state are currently frontend-only and scoped to the current browser tab.

They do not protect against:

- other browser tabs
- other users
- backend workers
- long-running server-side jobs

Backend operation state or async export jobs should later become the source of truth. When that happens, backend state should enter the UI through the product operation state adapter, not through direct popup-specific API calls.
