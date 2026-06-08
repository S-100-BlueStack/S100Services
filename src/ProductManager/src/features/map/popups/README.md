# Popup actions

Popup actions are implemented as a custom DOM action bar instead of Esri
`view.popup.actions`.

This keeps the action UI consistent with Product Manager requirements:

- two action rows
- nested export dropdowns
- leaf-level export loading state
- action-specific disabled reasons
- shared action availability rules

## File responsibilities

- `popupActionConfig.js`  
  Defines which actions are shown in the popup and maps product state to UI action
  config.

- `productActionAvailability.js`  
  Contains product action availability rules. This is the domain-level source of
  truth for whether actions are disabled.

- `popupProductActions.js`  
  Executes product actions. This file owns confirmation dialogs, API calls,
  notices, operation lifecycle and post-action refresh.

- `popupExportState.js`  
  Tracks long-running export leaf actions and emits state change events so open
  popups can re-render.

- `popupActionDom.js`  
  Creates the top-level action button DOM.

- `popupActionDropdown.js`  
  Creates nested dropdown UI for grouped actions such as export.

- `createPopup.js`  
  Renders popup content and subscribes to export-state and product-operation-state
  changes.
- `popupExportConfig.js`  
  Defines popup export groups, scopes, export types, labels and endpoint wiring.
  S57/S100 exports should be activated here when backend endpoints become available.

## Action availability

Availability rules should stay in `productActionAvailability.js`.

Do not duplicate business rules directly in popup UI files.

UI files should only translate availability into action properties such as:

- `disabled`
- `disabledReason`
- `loading`
- `label`

## Product action lifecycle

`popupProductActions.js` owns the action execution lifecycle.

Expected flow:

```txt
User clicks action
-> confirmation dialog opens
-> user confirms
-> product operation starts
-> API request runs
-> success/failure notice is shown
-> selected product is refreshed
-> popup re-renders with fresh attributes
-> product operation ends
```

Product operations must stay active until post-action refresh is complete.

This prevents stale intermediate UI states. For example, after a successful freeze
response, the popup should keep showing `Freezing...` until the refreshed product
attributes arrive and the action changes to `Unfreeze`.

Do not move post-action refresh back into `popupActionConfig.js`. Action config
should describe UI actions; action execution should own the full lifecycle.

## Product operation state

`productOperationState.js` tracks product-level operations currently running in
this browser tab.

It is used to:

- show loading labels such as `Freezing...`, `Unfreezing...` and `Sending...`
- block conflicting product mutations while an operation runs
- keep operation state active until refresh completes
- provide a future adapter point for backend operation state

This state is a UX guard only. The backend must still enforce real operation
rules and conflicts.

## Export state

Exports have additional leaf-level state and conflict rules.

`popupExportState.js` stores currently running exports by:

- dataset name
- export scope
- export type

The export root action stays open while an export is running. This allows the
user to inspect which export is running and which export actions are blocked.

Leaf actions show the actual export loading/conflict state.

## Relationship between product operation state and export state

Export is tracked in both systems for different reasons:

- `productOperationState.js` tracks that the product has an export operation
  running.
- `popupExportState.js` tracks which export leaf action is running or blocked.

Do not move export scope-conflict logic into `productOperationState.js` unless
backend operation state later replaces both systems.

## Export scope conflicts

Export locking is scope-based:

- `All` conflicts with every other export scope.
- Any specific scope conflicts with itself and `All`.
- Specific scopes do not conflict with each other.

Examples:

- Running `All Edition` blocks `All`, `S57`, and `S100`.
- Running `S57 Edition` blocks `S57` and `All`.
- Running `S57 Edition` does not block `S100`, if `S100` is implemented.
- Running `S100 Update` blocks `S100` and `All`.

This keeps the model extensible when more export formats are added.

## Product mutations during export

While an export is running for a product, other product mutation actions are
disabled:

- Freeze
- Unfreeze
- Send to IC-ENC
- Rollback

This avoids conflicting backend operations while export is processing.

The export root remains openable during export so users can inspect export leaf
state.

## Popup re-rendering

Open popups listen for:

- export-state changes via `onPopupExportStateChanged`
- product-operation-state changes via `onProductOperationStateChanged`

When relevant state changes, the popup closes any open dropdown and re-renders the
action bar.

Subscriptions must be cleaned up when popup DOM content is disconnected.

## Analyze page

Analyze product actions should remain in the product popup, not in the Analyze
sidebar.

The Analyze sidebar is for analysis details, reports, XML, and history content.
The popup action bar should remain the consistent place for product mutations.

## Backend operation state

Popup export state and product operation state are currently frontend-only and
scoped to the current browser tab.

They do not protect against:

- other browser tabs
- other users
- backend workers
- long-running server-side jobs

Backend operation state or async export jobs should later become the source of
truth. When that happens, backend state should enter the UI through the product
operation state adapter, not through direct popup-specific API calls.
