# Product operation state

`productOperationState.js` is the UI adapter for local mutations and backend-discovered or
browser-restored jobs. `productJobService.js` owns requests, storage, polling and reconciliation.
The state adapter makes no backend calls and is not a database lock.

Internal operation types remain freeze, unfreeze, send, export and rollback. The normalized public
CancelExport operation maps to internal rollback and is presented as Cancel Export. ExportEdition
and ExportUpdate preserve the backend-resolved S57/S101 specification.

`popupExportState.js` owns source-aware Edition/Update leaf presentation; operation state blocks
conflicting Product actions. Local operations remain active until post-action refresh completes.
Compatible source refresh preserves selected Graphic and popup action DOM.

Before a mutation the action service verifies `GET /jobs/active?datasetName=...`. Failure or invalid
identity fails closed. Job status uses `GET /jobs/{jobId}`, finite request timeouts and bounded retry
backoff. A transient polling error never clears an unresolved backend operation. Persisted tracking
resumes after reload and synchronizes between tabs. The backend remains authoritative for locking,
state transitions, candidate versions, source mapping and operation rejection.

See the [current contract review](../../../../docs/normalized-workflow-frontend-adaptation.md).
