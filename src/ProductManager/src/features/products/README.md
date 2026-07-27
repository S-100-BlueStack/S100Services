# Products

The Products feature contains shared product-facing frontend helpers that are not owned by the main map, Analyze, Review or Dashboard routes.

## Product catalog picker

`GET /electronicproducts` is used as the lightweight product catalog endpoint for direct Analyze and Review workflows.

Expected lightweight shape:

```json
{ "Data": ["101DK0040943E", "101DK0040944E"] }
```

The shared picker lives in:

```text
src/features/products/api/productCatalogApi.js
src/features/products/domain/productCatalog.js
src/features/products/ui/productPicker.js
```

Current consumers:

- Analyze sidebar add product form
- Product Review sidebar add product form

The picker must remain lightweight. Do not fetch AOI geometry or full product details just to populate the dropdown.

Typed input is intentionally preserved as a fallback so users can still add products if the catalog endpoint fails or a product is not present in the returned list.

## Product operation jobs

New Edition export and Rollback use the asynchronous Product Manager job contract:

```text
POST /export/{datasetName}/newedition/jobs?exportTarget=S100
POST /export/{datasetName}/rollback/jobs
GET /jobs/{jobId}
```

The frontend persists active jobs in local storage, polls the status endpoint until a terminal status is returned and restores tracking after a reload. Persisted jobs are also projected into `productOperationState` as backend operations so mutation actions remain blocked while the job may still be active.

Relevant files:

```text
src/features/data/api/exportApi.js
src/features/data/api/productJobApi.js
src/features/products/domain/productJob.js
src/features/products/services/productJobService.js
src/features/products/state/productOperationState.js
```

Terminal statuses are:

```text
Succeeded
Failed
Cancelled
```

Transient polling errors do not clear the persisted operation. This is intentional: the frontend must not unlock conflicting actions while the backend job may still be running.

BE-104B only restores jobs created by this browser storage. Backend-provided active operation visibility across users and browsers remains a separate backend contract.

## Terminology

User-facing UI should use `Product` and `Products`, not `Dataset` or `Datasets`.

Code can keep technical identifiers such as `datasetName` where required by backend contracts or normalized product attributes.

## Cross-tab job synchronization

Active job records are synchronized between same-origin browser tabs through local storage, `BroadcastChannel`, focus/pageshow/visibility reconciliation and a short fallback reconciliation interval. This keeps popup action availability current even when a browser drops or delays a storage event. Cross-user and cross-browser-profile visibility still requires the later backend active-operation contract.

Operation precondition failures are returned as `PRODUCT_OPERATION_REJECTED` with a backend-owned safe message, for example when New Edition is requested while the product is already `Exported`. Unexpected internal failures remain sanitized as `EXPORT_FAILED` or `ROLLBACK_FAILED`.

## Backend-authoritative active operations

Cross-user and cross-computer operation visibility uses:

```text
GET /jobs/active?datasetName={datasetName}
```

`productJobService.js` watches products currently represented by open popups. It immediately fetches active jobs, repeats the lookup while the popup remains open and starts normal job-status polling for every discovered job.

The backend endpoint is the authoritative discovery source. Browser storage and `BroadcastChannel` only reduce latency between tabs in the same browser profile.

The action layer also runs a backend preflight before Freeze, Unfreeze, Send, Export or Rollback. A failed active-state lookup is treated as unavailable operation state, and the frontend does not dispatch the mutation. This prevents a temporary status-service failure from being interpreted as “no active operation.”
