# Products

The Products feature contains shared product-facing frontend helpers that are not owned by the main map, Analyze, Review or Dashboard routes.

## Product catalog and workspace resolution

`services/workspaceProductService.js` is the current shared Product catalog and resolution boundary for
Analyze and Review. It combines independent providers:

```txt
workspaceProductService
  -> compatibility catalog provider (`GET /electronicproducts`)
  -> Paper Charts registry provider when runtime-available
  -> S-102 registry provider when runtime-available
```

`GET /electronicproducts` remains the lightweight compatibility catalog provider; it is not the permanent
multi-source Product catalog architecture. Registry providers reuse their source loader/normalizer and
preserve source-aware Product metadata. `datasetName` is the authoritative globally unique workspace
identity while display/Product names remain separate metadata. A duplicate normalized `datasetName`
across providers is invalid and fails closed as ambiguous rather than choosing the first or compatibility
provider. One provider failure does not reject the full catalog, and generation guards prevent stale
provider results from replacing newer state.

The workspace catalog is independent of Main map enabled-source state. S-57 and S-101 remain unavailable
as independent workspace providers until their authoritative backend read/catalog contracts exist.

Analyze and Review reuse the shared Product picker UI over this catalog. Product name is the primary label,
already-added Products are hidden, and source metadata remains available for compact secondary labeling.
Typed input is intentionally preserved as a fallback where the existing workspace UI permits it.

## Product operation jobs

New Edition export and Rollback use the asynchronous Product Catalogue job contract:

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

## FI-011D workspace contract

FI-011D makes Product Collection and workspace runtime identity source-aware while routes continue to
project globally unique `datasetName` values only. `compatibility-aoi` remains an internal adapter, never
a registry source or storage key. Paper Charts and S-102 resolve through registry-backed workspace
providers and must not fall through to compatibility AOI/History calls. ProductContext separately models
visible History/IC-ENC/Internal validation surfaces and backend implementation permission. FI-019 owns
the later route migration.
