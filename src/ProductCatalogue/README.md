# Product Catalogue frontend

Current reviewed runtime baseline before FI-011C: `60e4854389ab16d3bd280f653998ea10eaa0b6ab`.

Product Catalogue is an ArcGIS/Vite frontend for managing product corrections for nautical chart production. The app loads product correction data from backend APIs, renders them as ArcGIS graphics, and lets users perform product actions through a custom popup action bar.

## Technology

Current frontend stack:

- ArcGIS Maps SDK for JavaScript
- Vite
- Calcite Components
- Bootstrap
- JavaScript
- HTML/CSS

Backend/API calls are consumed through shared API helpers and feature-specific API modules.

## Main routes

Product Catalogue currently has these main frontend routes:

- Main map route
- Dashboard route
- Analyze route
- Review route

The main map route owns product correction management, popup actions, map filters, Product History quick panel, Product Collection, and Product search. The Dashboard route owns read-only operational activity summaries for selected time ranges. It does not own product mutation actions, map popup state, Product Collection state, Analyze state, or Review state.

The Analyze route owns analysis/report display for selected products. The Review route owns side-by-side product review for multiple selected products.

## Terminology

Use `Product` and `Products` in user-facing UI text. Do not use `Dataset`, `Datasets`, `dataset`, or similar dataset-oriented labels in visible UI unless the backend/domain concept specifically requires a technical distinction.

Code may continue using stable technical identifiers such as `datasetName` where that matches backend contracts or existing normalized attribute names. The user-facing terminology audit is complete, and `userFacingTerminology.test.js` protects representative UI sources from reintroducing visible `Dataset` / `Datasets` labels.

## Stable frontend flows

The following flows are implemented and considered stable frontend behavior for controlled user testing:

- map creation and product correction rendering
- hover highlight
- popup details
- custom popup action bar
- Freeze / Unfreeze
- Send to IC-ENC
- source-aware popup actions resolved through central Product context
- flat `Export... > Edition / Update` menu
- compatibility AOI Edition export using the established S100 backend target
- disabled Edition/Update placeholders for Paper Charts and S-102
- Rollback
- popup export loading/conflict state
- backend-authoritative Product operation state with local caching and reload recovery
- asynchronous Export/Rollback polling, terminal notices and route refresh
- silent auto-refresh
- manual refresh button loading
- popup-preserving compatible refresh without popup, icon or dropdown flashing
- display-scale hiding
- main map filters constrained to `Display scale`, `Status` and `Usage band`
- Product search on the main map
- Product History quick panel with collapsed event rows
- Product Collection tray
- Analyze page
- Review workspace
- shared Product catalog picker for Analyze and Review
- Dashboard page with backend-driven activity data, Danish range builder, debounced server-side search, server-side filters, cursor pagination, actionable summary panels, polished Dashboard History panel, collapsed product history events, domain-oriented backend activity classification, summary cards and activity links
- release-readiness keyboard hardening for route/panel close behavior
- hover help/tooltips for common clickable controls and icon-only actions

## Important architecture

### Layers

Logical layer metadata is defined in:

```txt
src/features/map/config/layerDefinitions.js
```

Runtime ArcGIS layers are registered in:

```txt
src/features/map/core/layerRegistry.js
```

Layer definitions are static frontend metadata. Runtime layer registry state should not be used as static config. Each logical layer should have a stable `id`, `layerKind` and explicit capabilities. UI systems should check capabilities instead of assuming every graphic is a product correction.

### Popup actions

Popup actions are custom DOM actions. They do not use Esri `view.popup.actions`.

Main files:

```txt
src/features/map/popups/createPopup.js
src/features/map/popups/popupActionConfig.js
src/features/map/popups/popupProductActions.js
src/features/map/popups/popupActionDom.js
src/features/map/popups/popupActionDropdown.js
src/features/map/popups/popupExportState.js
src/features/map/popups/popupExportConfig.js
src/features/map/popups/popupExportContract.js
src/features/products/domain/productContext.js
src/features/data/domain/exportTarget.js
```

Popup action flow is documented in:

```txt
src/features/map/popups/README.md
```

Current popup action endpoint status:

- `Freeze` / `Unfreeze` use the existing product freeze-state API.
- `Send to IC-ENC` uses the existing product upload/send API.
- `Rollback` is enabled and calls `POST /export/{name}/rollback/jobs`.
- Compatibility AOI `Export... > Edition` is enabled and calls `POST /export/{name}/newedition/jobs?exportTarget=S100`.
- Compatibility AOI `Update` remains disabled because no implemented Update contract exists.
- Paper Charts and S-102 expose disabled Edition/Update placeholders with no handler or backend target.
- Job status uses `GET /jobs/{jobId}`.
- Shared active-operation discovery uses `GET /jobs/active?datasetName={datasetName}`.

BE-102 export target contract:

- missing `exportTarget` defaults to `S100`;
- parsing is case-insensitive;
- canonical values are `All`, `S100`, and `S57`;
- `Both`, numeric values, empty/whitespace values, and unknown text return `400` with `EXPORT_TARGET_INVALID` and `allowedTargets: ["All", "S100", "S57"]`;
- `All` and `S57` return `422` with `EXPORT_TARGET_NOT_SUPPORTED` and `supportedTargets: ["S100"]`;
- `GET /Lookup/exportformats` returns `[{ "Name": "All" }, { "Name": "S100" }, { "Name": "S57" }]`.

The frontend derives the two visible leaves from Product context and declarative source export configuration. Labels, operation kinds, capabilities, backend targets, and handlers remain separate. A central dispatch guard allows only the established compatibility Edition/S100 tuple and runs before confirmation, loading state, and API dispatch.

Deployment may be frontend-first or backend-first because missing target still defaults to `S100`; frontend-first is preferred so explicit target requests are visible before backend enforcement changes.

### Product context and source-aware actions

Selected Graphics are resolved through:

```txt
src/features/products/domain/productContext.js
```

Registry-backed Products require matching Graphic and layer source metadata. The current combined AOI path participates through an explicit internal compatibility adapter, not a permanent registry source or persisted toggle. Unknown or inconsistent source metadata fails closed for backend-dependent actions.

`productActionAvailability.js` combines Product context capabilities with Product status, active operations, backend capability state, and popup Export state. Paper Charts and S-102 retain popup attributes and disabled Export placeholders without gaining backend mutations or real Export execution. FI-011D also enables Product Collection, Analyze, Review, and visible History/report/validation surfaces for those sources; unsupported backend content is represented as unavailable and never authorizes compatibility API calls.

### Product operation state

Frontend operation state lives in:

```txt
src/features/products/state/productOperationState.js
```

It combines local mutations, persisted async jobs and backend-discovered active jobs. The backend active-job endpoint is the shared visibility source across browser profiles, users and computers. Local storage and `BroadcastChannel` provide fast same-browser synchronization only. The execution-time dataset lock remains authoritative, and the active-job preflight is not an atomic enqueue claim.

### Notices and API results

API result/error handling is centralized in:

```txt
src/shared/api/apiResult.js
src/features/notices/services/apiNoticeService.js
```

Do not parse API errors directly in UI files unless there is a strong reason.

### Product catalog and product picker

Analyze and Review share the source-aware workspace Product boundary:

```txt
src/features/products/services/workspaceProductService.js
```

The workspace catalog merges independent providers:

- the compatibility provider backed by `GET /electronicproducts`;
- Paper Charts when its registry workspace provider is runtime-available;
- S-102 when its registry workspace provider is runtime-available.

The compatibility endpoint is therefore one provider, not the permanent Product catalog architecture.
Registry-backed providers reuse their source loader and normalizer, preserve `sourceId`, `sourceLabel`,
`productKey`, `datasetName`, and `productType`, isolate provider failures, and reject stale provider
results through generation guards. `datasetName` is the authoritative globally unique workspace/route
identity; user-facing Product names remain separate metadata. A duplicate normalized `datasetName` across
providers violates that invariant, is omitted from the catalog, and resolves fail closed as ambiguous
instead of selecting a provider deterministically.

The workspace catalog is deliberately independent of Main map enabled-source state. A runtime-available
source can still resolve or appear in Analyze/Review after that source is disabled on the Main map.
S-57 and S-101 do not contribute independent workspace Products until authoritative read/catalog
contracts exist.

The shared picker is reused by Analyze and Review. Product name remains the primary visible label and
source metadata may be shown secondarily when useful. Existing route projection remains datasetName-only
until FI-019.

### Main map filters

Main map attribute filters are constrained to the intended operational filter set:

- `displayScale`
- `status`
- `usageBand`

Status filter options come from the full product state/status endpoint, not only from statuses currently present in rendered map features. Statuses with no matching visible products remain listed with count `0`, so users can trust that the list represents all possible status values.

Product popup attribute rendering is hardened so first-load popup details do not fall back to showing all raw feature attributes when field metadata is not ready yet.

### Main map Product search

The Main map has a route-local Product search overlay. FI-011B search is built from the currently active,
committed frontend Graphics and their source-aware Product contexts. It does **not** query or reuse the
Analyze/Review workspace catalog.

Search opens the selected rendered Product's popup on the map. Disabled sources are absent because their
Graphics are not part of the committed active Main map state. Product search is a map control, not global
navigation, and stays out of the navbar to avoid layout conflicts on smaller screens.

### Dashboard

Dashboard feature files live in:

```txt
src/features/dashboard
```

Dashboard documentation:

```txt
src/features/dashboard/README.md
```

Dashboard is a compatibility/backend activity surface. It loads bounded activity pages from
`/electronicproducts/dashboard`, sends search and filters to the backend, opens a route-local Product
History panel from activity rows, and links users onward to Review or Analyze. Dashboard intentionally
keeps the established one-argument `fetchProductHistory(datasetName)` compatibility adapter and is not
migrated to the generic workspace provider architecture in FI-011D. Paper Charts and S-102 Dashboard
behavior is not introduced here.

Dashboard must stay isolated from Main map popup state, Product Collection state, Analyze state and
Review state.

### Analyze and Review

Analyze feature files live in:

```txt
src/features/analyze
```

Review feature files live in:

```txt
src/features/review
```

Analyze and Review use `workspaceProductService` for source-aware Product catalog and route Product
resolution. Compatibility Products retain their established backend loaders. Paper Charts and S-102
resolve through runtime-available registry providers, so Analyze can use source-owned normalized data and
geometry without calling the compatibility AOI endpoint. Review uses the same Product context to avoid
cross-source History/report requests.

Analyze owns product analysis/report display and does not own mutation actions. Review owns multi-product
review; mixed workspaces isolate Product/provider failures and distinguish unavailable content from failed
loads. Review tabs remain independent and should not reintroduce BroadcastChannel/session picker workflows
without a clear UX reason.

Analyze/Review routes continue to project dataset names only. FI-019 owns the later route migration; source
identity remains internal to the workspace runtime model.

### Timeline and Product History

Timeline/Product History files live in:

```txt
src/features/timeline
```

Timeline documentation:

```txt
src/features/timeline/README.md
```

Product History deliberately exposes two call boundaries. The one-argument
`fetchProductHistory(datasetName)` contract is the retained compatibility adapter for existing
compatibility consumers such as Dashboard and calls the established backend History endpoint directly.
Source-aware Main map, Analyze, and Review callers provide an already resolved `ProductContext`.

Compatibility Product contexts use the same backend endpoint. Paper Charts and S-102 expose a visible
History surface but return a source-specific unavailable model without a compatibility History request.
An explicitly unresolved/invalid source context fails closed and must never reinterpret the dataset name
as a compatibility Product.

Product History rows are collapsed by default on both the Main map quick panel and Dashboard History
panel. Collapsed rows show the event title, timestamp and short description; row details such as
previous/new state are expanded only when the user opens that row.

Global map timeline is not implemented yet.

## Frontend-only and placeholder behavior

Some current behavior is intentionally frontend-only or placeholder-only:

- popup export leaf/scope presentation state
- same-browser job cache and cross-tab synchronization
- disabled source-configured Edition/Update placeholders for compatibility Update, Paper Charts and S-102
- truthful unavailable History, IC-ENC report, and Internal validation surfaces for Paper Charts and S-102
- Dashboard report actions until IC-ENC/internal validation report IDs or URLs exist

The backend active-job endpoint is the source of truth for shared visibility. Frontend state remains responsible for presentation, polling and responsive local reconciliation.

## Backend-dependent work

Do not implement the following fully until backend/database contracts are ready:

- atomic Product operation claim before enqueue
- external shared Hangfire worker migration
- global map timeline
- separate source-correct S-57 and S-101 Product/read and export contracts
- compatibility and source-specific Update export endpoints
- real Paper Charts and S-102 export endpoints
- real Dashboard IC-ENC report links
- real Dashboard internal validation report links

## User guidance and onboarding

Controlled user testing showed that users need concise explanations of what actions and controls do.

The frontend provides hover help/tooltips for common clickable controls and icon-only actions. Tooltip text should explain consequence or context, not just duplicate the visible label. New clickable controls should include explicit text, an `aria-label`, or a tooltip entry in the global hover-help registry.

The compact introduction flow is implemented and manually verified on Main map, Dashboard, Analyze and Review:

- each route has independent first-time state and can be replayed from Preferences
- Main map covers Product search, filters, popup actions, Product Collection, workspace navigation, Theme and Preferences
- Analyze requires a loaded Product before dependent guidance continues
- Review requires two loaded Products before side-by-side comparison guidance continues
- static text and disabled states carry the workflow in RDP/VDI environments without depending on animation
- the flow remains optional and does not automatically navigate between routes

## Refresh behavior

Refresh behavior preserves:

- selected popup location and selected Graphic identity when compatible
- active filters
- display-scale hiding state
- scale-dependent visibility
- popup action and open-dropdown state

Compatible refreshes reconcile existing layers and graphics in place and refresh popup details without closing the popup. The previous full rebuild/restore flow remains the fallback for structural or feature-identity changes. Manual refresh uses button loading. Auto-refresh is silent. Refresh does not use a fullscreen loader.

## Dashboard behavior

Dashboard is a separate route at `/dashboard`.

Dashboard can show:

- an always-visible range builder with `From`, optional `To`, `Refresh` and `Apply`
- quick range actions for `Since yesterday` and `Last 7 days`
- read-only operational summary cards
- compact activity list
- status summary
- operation summary
- debounced server-side search
- server-side filters
- cursor pagination with a fixed frontend page size of 50
- stale-request suppression and last-successful-result retention
- actionable status/operation summary rows that apply matching filters
- Dashboard History panel opened from activity-row `History`
- collapsed Product History event rows inside the Dashboard History panel
- onward links to Review and Analyze
- disabled or placeholder report actions until report endpoints exist

Dashboard filters run in the backend before summary calculation and cursor page selection. Summary cards, status summary, operation summary and total counts represent the complete filtered result, while the activity list contains only the current page. Filter or range changes reset cursor history.

Dashboard History panel is route-local. It replaces the right summary column while open, closes with `Close` or `Escape`, shows selected activity context, highlights the selected activity row, and reuses the shared product history API/renderers without interacting with main map popup state or Product Collection state.

## Adding future export endpoints

To activate a future source export operation:

1. Add the backend request function in:

   ```txt
   src/features/data/api/exportApi.js
   ```

2. Register its stable handler ID in:

   ```txt
   src/features/map/popups/popupExportConfig.js
   ```

3. Declare the source capability, operation kind, backend target, handler ID, and availability text in the source export configuration.
4. Keep endpoint mapping out of popup DOM and `popupActionConfig.js`.
5. Add or adjust confirmation text and focused contract tests.

Current implemented export leaf:

```txt
Export > Edition -> POST /export/{name}/newedition/jobs?exportTarget=S100
```

The generic Edition label preserves the established compatibility wire target. It is not an `All` export and does not infer separate S-57/S-101 source ownership.

Current implemented rollback action:

```txt
Rollback -> POST /export/{name}/rollback/jobs
```

## Background job deployment direction

ProductCatalogueAPI currently hosts both the Product Catalogue HTTP API and the Hangfire Server that executes Product Catalogue jobs.

BE-106 confirms the future direction without changing runtime:

- ProductCatalogueAPI remains the Product Catalogue API, enqueue and job-status owner;
- Product Catalogue worker execution may later move to `JobPlatform.Worker`;
- the frontend continues using the same ProductCatalogueAPI routes;
- scheduled tasks are reviewed and migrated separately;
- no worker move, queue change or shared operation registry is currently implemented.

Read the readiness review before changing worker hosting:

```text
src/ProductCatalogue/docs/be-106-external-worker-readiness.md
```

## Adding a new map layer

When adding a new logical map layer:

1. Add a layer definition in:

   ```txt
   src/features/map/config/layerDefinitions.js
   ```

2. Reference the layer from:

   ```txt
   src/features/map/config/layerConfigs.js
   ```

3. Set capabilities explicitly.
4. Ensure popup/filter/display-scale behavior checks layer capabilities.
5. Avoid enabling product actions unless the layer truly supports product correction mutations.

## Build and formatting

From this folder:

```bash
npm run format
npm run build
npm run check
```

Use `npm run check` before considering a ProductManager change ready.

## Current status

Recent frontend work has focused on:

- custom popup action lifecycle
- product operation state
- export config extraction
- Product History integration and collapsed history event rows
- Analyze lifecycle cleanup
- Review workspace foundation
- Product Collection workflow
- Dashboard phase 1 foundation
- Dashboard range builder, actionable summary panels and polished Dashboard History panel
- Dashboard backend activity classification
- BE-107 Dashboard server-side filtering and cursor pagination, manually verified at `7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd`
- shared source-aware workspace Product catalog/resolver for Analyze and Review
- source-aware Product Collection and workspace History/report availability
- main map filter hardening
- main map Product search
- asynchronous S100 Edition and Rollback activation
- persisted polling and reload recovery
- backend-authoritative active-job visibility across users and computers
- fail-closed mutation preflight
- popup-preserving layer, action and dropdown refresh
- release-readiness smoke-test hardening
- hover help/tooltips for clickable controls
- route-specific onboarding and Preferences replay
- user-facing Product/Products terminology audit
- layer capability foundation
- FI-011A configurable Product data-source foundation
- FI-011B source-aware Filters, Product search, and navbar coordination
- FI-011C source-aware Product context, popup actions, and flat Export menu
- FI-011D source-aware Product Collection, workspace resolution, and truthful History/report availability

The frontend is ready for controlled user testing with asynchronous Export/Rollback, shared active-operation visibility and the manually verified BE-107 Dashboard pagination baseline `7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd`. BE-106 documents—but does not implement—the future move of worker execution to JobPlatform. The next planned backend package is BE-108 Product History failure hardening when its producer contract is ready. Remaining backend-dependent work includes atomic enqueue ownership, any later shared-worker implementation, report contracts, future export variants and the global timeline.
