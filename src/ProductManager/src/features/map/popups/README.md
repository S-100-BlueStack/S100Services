# Popup actions

Popup actions are split into configuration, domain availability, execution, and UI rendering.

## Files

- `popupActionConfig.js`
  Defines which actions are shown in the popup and maps product state to UI action config.

- `productActionAvailability.js`
  Contains product action availability rules. This is the domain-level source of truth for whether actions are disabled.

- `popupProductActions.js`
  Executes product actions. This file owns confirmation dialogs, API calls, notices, and action locks.

- `popupExportState.js`
  Tracks long-running export actions and emits state change events so open popups can re-render.

- `popupActionDom.js`
  Creates top-level Calcite popup actions.

- `popupActionDropdown.js`
  Creates nested dropdown UI for grouped actions such as export.

## Action availability

Availability rules should stay in `productActionAvailability.js`.

Do not duplicate rules directly in popup UI files. UI files should only translate availability into Calcite action properties such as:

- `disabled`
- `disabledReason`
- `loading`
- `label`

## Export state

Exports can take a long time and must be tracked separately from normal button busy state.

`popupExportState.js` stores currently running exports by:

- dataset name
- export scope
- export type

The export root action stays open while an export is running. This allows the user to inspect which export is running and which export actions are blocked.

Leaf actions show the actual loading state.

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

While an export is running for a product, other product mutation actions are disabled:

- Freeze
- Unfreeze
- Send to IC-ENC
- Rollback

This avoids conflicting backend operations while export is processing.

## Popup re-rendering

Open popups listen for export-state changes via `onPopupExportStateChanged`.

When an export starts or finishes, the popup closes any open dropdown and re-renders the action bar. This prevents stale dropdown/action state.

## Analyze page

Analyze product actions should remain in the product popup, not in the Analyze sidebar.

The Analyze sidebar is for analysis details, reports, XML, and history placeholders. The popup action bar should remain the consistent place for product mutations.
