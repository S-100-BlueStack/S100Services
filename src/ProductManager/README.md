# Product Manager frontend

Product Manager is an ArcGIS/Vite frontend for managing product corrections for
nautical chart production.

The app loads product correction data from backend APIs, renders them as ArcGIS
graphics, and lets users perform product actions through a custom popup action
bar.

## Technology

Current frontend stack:

- ArcGIS Maps SDK for JavaScript
- Vite
- Calcite Components
- Bootstrap
- JavaScript
- HTML/CSS

Backend/API calls are consumed from the frontend through shared API helpers and
feature-specific API modules.

## Main routes

Product Manager currently has two main frontend routes:

- Main map route
- Analyze route

The main map route owns product correction management and popup actions.

The Analyze route owns analysis/report display for selected products.

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
- Product History panel shell and demo content
- Analyze page shell and demo fallback content

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

Layer definitions are static frontend metadata. Runtime layer registry state
should not be used as static config.

Each logical layer should have a stable `id`, `layerKind` and explicit
capabilities. UI systems should check capabilities instead of assuming every
graphic is a product correction.

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

It tracks local browser-tab operations and has a skeleton for future backend
operation state.

Documentation:

```txt
src/features/products/state/README.md
```

Product operation state is a UX guard only. The backend must still enforce real
business rules and operation conflicts.

### Export state

Export leaf-level state lives in:

```txt
src/features/map/popups/popupExportState.js
```

Export structure/configuration lives in:

```txt
src/features/map/popups/popupExportConfig.js
```

`popupExportState.js` owns export scope conflicts and leaf-level loading state.

`productOperationState.js` only tracks that the product has an export operation
running.

### Notices and API results

API result/error handling is centralized in:

```txt
src/shared/api/apiResult.js
src/features/notices/services/apiNoticeService.js
```

Do not parse API errors directly in UI files unless there is a strong reason.

### Analyze

Analyze feature files live in:

```txt
src/features/analyze
```

Analyze documentation:

```txt
src/features/analyze/README.md
```

Analyze owns product analysis/report display. It does not own product mutation
actions.

Product actions such as Freeze, Unfreeze, Send to IC-ENC, Export and Rollback
must stay in the product popup.

### Timeline and Product History

Timeline/Product History files live in:

```txt
src/features/timeline
```

Timeline documentation:

```txt
src/features/timeline/README.md
```

Current Product History content uses frontend demo data. Global map timeline is
not implemented yet.

## Frontend-only and demo behavior

Some current behavior is intentionally frontend-only:

- popup export state
- product operation state
- Product History content
- Analyze demo fallback data
- future S57/S100 export action placeholders

These features prepare the UI and architecture, but they are not backend source
of truth.

## Backend-dependent work

Do not implement the following fully until backend/database contracts are ready:

- backend active product operation state
- cross-user/cross-tab operation locking
- async export jobs
- job-status endpoint
- real Product History endpoint
- global map timeline
- S57/S100 export endpoints
- backend-driven export conflict state

## Refresh behavior

Refresh behavior should preserve:

- selected popup location
- active filters
- display-scale hiding state
- scale-dependent visibility
- popup action state where possible

Manual refresh uses button loading.

Auto-refresh should be silent.

Refresh should not use fullscreen loader.

## Analyze behavior

Analyze uses chunked layer creation and loader progress.

Analyze sidebar can show:

- dataset input
- loading state
- product cards
- XML/report content
- load warnings
- history placeholder content

Analyze sidebar should not show product mutation actions.

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

5. Avoid enabling product actions unless the layer truly supports product
   correction mutations.

## Build and formatting

From this folder:

```bash
npm run format
npm run build
```

Use `npm run format` before committing frontend changes.

Use `npm run build` before considering a ProductManager change ready.

## Current cleanup status

Recent frontend cleanup has focused on:

- custom popup action lifecycle
- product operation state
- backend operation-state skeleton
- export config extraction
- Product History content
- Analyze demo-mode cleanup
- Analyze lifecycle cleanup
- layer capability foundation

The frontend is now in a good state for either:

- backend contract work, or
- a final manual smoke test pass before continuing with larger features.
