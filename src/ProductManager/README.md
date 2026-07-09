# Product Manager frontend

Product Manager is an ArcGIS/Vite frontend for managing product corrections for nautical chart production. The app loads product correction data from backend APIs, renders them as ArcGIS graphics, and lets users perform product actions through a custom popup action bar.

## Technology

Current frontend stack:

- ArcGIS Maps SDK for JavaScript
- Vite
- Calcite Components
- Bootstrap
- JavaScript
- HTML/CSS

Backend/API calls are consumed from the frontend through shared API helpers and feature-specific API modules.

## Main routes

Product Manager currently has these main frontend routes:

- Main map route
- Dashboard route
- Analyze route
- Review route

The main map route owns product correction management and popup actions.

The Dashboard route owns read-only operational activity summaries for selected time ranges. It does not own product mutation actions, map popup state, Product Collection state, Analyze state, or Review state.

The Analyze route owns analysis/report display for selected products.

The Review route owns side-by-side product review for multiple selected products.

## Terminology

Use `Product` and `Products` in user-facing UI text. Do not use `Dataset`, `Datasets`, `dataset`, or similar dataset-oriented labels in visible UI unless the backend/domain concept specifically requires a technical distinction.

Code may continue using stable technical identifiers such as `datasetName` where that matches backend contracts or existing normalized attribute names. UI labels, headings, buttons, empty states, help text and documentation intended for users should use product terminology.

A future terminology hardening task tracks a full UI audit to align Analyze, Review, Dashboard and main map labels around `Product` / `Products`.

## Stable frontend flows

The following flows are implemented and considered stable frontend behavior:

- map creation and product correction rendering
- hover highlight
- popup details
- custom popup action bar
- Freeze / Unfreeze
- Send to IC-ENC
- Export `All > Edition`
- Export `All > Update`
- disabled future export leaves for S57/S100
- popup export loading/conflict state
- product operation state
- refresh after successful and failed product actions
- silent auto-refresh
- manual refresh button loading
- display-scale hiding
- attribute filters
- Product History quick panel
- Product Collection tray
- Analyze page
- Review workspace
- Dashboard page with backend-driven activity data, range builder, client-side search, client-side filters, actionable summary panels, Dashboard History panel, summary cards and activity links

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

Layer definitions are static frontend metadata.

Runtime layer registry state should not be used as static config. Each logical layer should have a stable `id`, `layerKind` and explicit capabilities. UI systems should check capabilities instead of assuming every graphic is a product correction.

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
```

Popup action flow is documented in:

```txt
src/features/map/popups/README.md
```

### Action availability

Product action availability rules live in:

```txt
src/features/products/domain/productActionAvailability.js
```

Do not duplicate action availability rules in popup DOM or UI rendering code.

### Product operation state

Frontend operation state lives in:

```txt
src/features/products/state/productOperationState.js
```

It tracks local browser-tab operations and has a skeleton for future backend operation state.

Documentation:

```txt
src/features/products/state/README.md
```

Product operation state is a UX guard only. The backend must still enforce real business rules and operation conflicts.

### Export state

Export leaf-level state lives in:

```txt
src/features/map/popups/popupExportState.js
```

Export structure/configuration lives in:

```txt
src/features/map/popups/popupExportConfig.js
```

`popupExportState.js` owns export scope conflicts and leaf-level loading state. `productOperationState.js` only tracks that the product has an export operation running.

### Notices and API results

API result/error handling is centralized in:

```txt
src/shared/api/apiResult.js
src/features/notices/services/apiNoticeService.js
```

Do not parse API errors directly in UI files unless there is a strong reason.

### Product catalog and product picker

A future shared product picker should use the lightweight product catalog endpoint:

```http
GET /electronicproducts
```

Current expected lightweight shape:

```json
{ "Data": ["101DK0040943E", "101DK0040944E"] }
```

The shared picker should be implemented once and reused by Analyze and Review so users can open those routes directly and add products without first using the main map or Product Collection.

Do not use the AOI/map geometry endpoint for product picker lists. A product picker only needs identifiers and optional light metadata when backend supports it.

### Dashboard

Dashboard feature files live in:

```txt
src/features/dashboard
```

Dashboard documentation:

```txt
src/features/dashboard/README.md
```

Dashboard is a read-only operational activity route. It loads activity data from `/electronicproducts/dashboard`, applies local search and filters to the loaded payload, opens a route-local Product History panel from activity rows, and links users onward to Review or Analyze.

Dashboard must stay isolated from main map popup state, Product Collection state, Analyze state and Review state.

### Analyze

Analyze feature files live in:

```txt
src/features/analyze
```

Analyze documentation:

```txt
src/features/analyze/README.md
```

Analyze owns product analysis/report display. It does not own product mutation actions. Product actions such as Freeze, Unfreeze, Send to IC-ENC, Export and Rollback must stay in the product popup.

### Review

Review feature files live in:

```txt
src/features/review
```

Review documentation:

```txt
src/features/review/README.md
```

Review owns multi-product review. Review tabs are independent and should not reintroduce BroadcastChannel/session picker workflows without a clear UX reason.

### Timeline and Product History

Timeline/Product History files live in:

```txt
src/features/timeline
```

Timeline documentation:

```txt
src/features/timeline/README.md
```

Product History uses the backend product history endpoint for product-level history views. Global map timeline is not implemented yet.

## Frontend-only and placeholder behavior

Some current behavior is intentionally frontend-only or placeholder-only:

- popup export state
- product operation state
- future S57/S100 export action placeholders
- Dashboard report actions until IC-ENC/internal validation report IDs or URLs exist

These features prepare the UI and architecture, but they are not backend source of truth.

## Backend-dependent work

Do not implement the following fully until backend/database contracts are ready:

- backend active product operation state
- cross-user/cross-tab operation locking
- async export jobs
- job-status endpoint
- global map timeline
- S57/S100 export endpoints
- backend-driven export conflict state
- real Dashboard IC-ENC report links
- real Dashboard internal validation report links

## Refresh behavior

Refresh behavior should preserve:

- selected popup location
- active filters
- display-scale hiding state
- scale-dependent visibility
- popup action state where possible

Manual refresh uses button loading.

Auto-refresh should be silent. Refresh should not use fullscreen loader.

## Analyze behavior

Analyze uses chunked layer creation and loader progress. Analyze sidebar can show:

- product input/list
- loading state
- product cards
- XML/report content
- load warnings
- history content
- internal validation placeholder content

Analyze sidebar should not show product mutation actions.

Analyze should later use the shared product picker/catalog workflow instead of requiring users to know exact product identifiers.

## Dashboard behavior

Dashboard is a separate route at `/dashboard`.

Dashboard can show:

- an always-visible range builder with `From`, optional `To`, `Refresh` and `Apply`
- quick range actions for `Since yesterday` and `Last 7 days`
- read-only operational summary cards
- compact activity list
- status summary
- operation summary
- client-side search
- client-side filters
- actionable status/operation summary rows that apply matching filters
- Dashboard History panel opened from activity-row `History`
- onward links to Review and Analyze
- disabled or placeholder report actions until report endpoints exist

Dashboard filters run on the loaded activity payload. Summary cards, status summary and operation summary should stay derived from the same filtered activity set as the visible list.

## Adding future export endpoints

To activate a future export leaf action:

1. Add the backend request function in:

```txt
src/features/data/api/exportApi.js
```

2. Import that request in:

```txt
src/features/map/popups/popupExportConfig.js
```

3. Set the relevant leaf action to `implemented: true`.
4. Assign the request function.
5. Add or adjust confirm text if needed.

Do not add endpoint wiring directly in `popupActionConfig.js`.

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
- backend operation-state skeleton
- export config extraction
- Product History integration
- Analyze lifecycle cleanup
- Review workspace foundation
- Product Collection workflow
- Dashboard phase 1 foundation
- Dashboard range builder, actionable summary panels and Dashboard History panel
- layer capability foundation

The frontend is ready for either:

- shared product picker/catalog work for Analyze and Review
- report endpoint integration when backend report IDs/storage contracts exist
- backend operation/job state work
- final manual smoke test pass before continuing with larger features
