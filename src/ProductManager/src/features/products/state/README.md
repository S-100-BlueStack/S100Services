# Product operation state

`productOperationState.js` contains frontend-only state for product mutations that
are currently running in this browser tab.

It is not a backend lock and it does not protect against:

- other browser tabs
- other users
- backend workers
- long-running server-side jobs

The state exists to keep the current UI consistent while a product action is in
progress.

## Current operation types

Supported operation types:

- `freeze`
- `unfreeze`
- `send`
- `export`
- `rollback`

Rollback is defined as an operation type for future use, but the UI action is
currently disabled.

## Responsibilities

`productOperationState.js` is responsible for:

- tracking active product operations by `datasetName`
- emitting state-change events when operations start or finish
- exposing the current operation state for popup action availability
- keeping action loading states visible until post-action refresh completes

It should not call backend APIs directly.

## Relationship with popup export state

`popupExportState.js` still owns export leaf-level state.

That includes:

- `All > Edition`
- `All > Update`
- `S57 > Edition`
- `S57 > Update`
- `S100 > Edition`
- `S100 > Update`

`productOperationState.js` only tracks export as a higher-level product operation.

This split is intentional:

- `popupExportState.js` decides which export leaf action is loading or blocked.
- `productOperationState.js` lets the rest of the product actions know that the
  product has an export operation running.

Do not move export scope-conflict logic into `productOperationState.js` unless
backend operation state later replaces both systems.

## Popup refresh lifecycle

Product operations should stay active until the post-action refresh is complete.

Expected flow:

```txt
User starts action
-> operation starts
-> API request runs
-> API result is shown as notice
-> selected product is refreshed
-> popup re-renders with fresh attributes
-> operation ends
```

This prevents the popup from briefly showing stale actions between the API
response and the refreshed feature data.

For example, after a successful freeze response, the button should remain in
`Freezing...` state until refreshed product attributes make the popup show
`Unfreeze`.

## Future backend operation state

When the backend exposes active operation state, the frontend should not replace
popup action logic directly with backend response handling.

Recommended future shape:

```js
{
  datasetName: "DK5...",
  operations: [
    {
      id: "job-id-or-operation-id",
      type: "export",
      label: "Exporting All Edition",
      startedAt: "2026-06-08T10:15:00Z",
      startedBy: "domain\\\\user",
      source: "backend"
    }
  ]
}
```

Expected integration path:

1. Keep `productOperationState.js` as the UI-facing state adapter.
2. Add a backend polling/fetch layer separately.
3. Merge backend operations and local optimistic operations into the same UI
   state shape.
4. Keep `popupExportState.js` until the backend can describe export scope
   conflicts accurately.

## Backend adapter skeleton

Backend operation state should enter the UI through:

- `features/products/api/productOperationApi.js`
- `features/products/services/productOperationSyncService.js`
- `features/products/state/productOperationState.js`

`productOperationApi.js` owns the backend response shape and endpoint integration.

`productOperationSyncService.js` owns when a product operation state is fetched and
how it is applied to frontend state.

`productOperationState.js` owns the UI-facing merged state for local optimistic
operations and backend operations.

The popup should continue reading only from `getProductOperationState(datasetName)`.
It should not call backend operation endpoints directly.

## Backend export operations

Backend export operations need special handling when backend operation sync is
activated.

Product operation state can show that an export is running for a product, but
export leaf conflicts are still owned by `popupExportState.js`.

When backend export operations become available, they must either be mapped into
popup export state or passed into export availability as backend export conflict
context. Otherwise the UI may know that an export is running without knowing which
export leaf actions should be blocked.

## Important constraints

Do not use this state as the source of truth for business rules.

The backend must still enforce:

- whether a product can be frozen
- whether a product can be sent
- whether an export can start
- whether two operations conflict
- whether a long-running operation is already active

Frontend operation state is only a UX guard.
