# Product Catalogue frontend

Current normalized backend baseline: `345b79eef2a9225473d57db80243e731739cbc3a`.

Read the [current contract matrix and adaptation report](docs/normalized-workflow-frontend-adaptation.md)
for source transport, Export, diagnostics and verification. It supersedes older backend-contract notes.

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
- capability-gated Send to IC-ENC simulation
- source-aware popup actions resolved through central Product context
- flat `Export... > Edition / Update` menu
- independently resolved S-57 and S-101 Edition/Update candidate exports
- retained synthetic Paper Charts/S-102 fixtures for explicit source-boundary tests only
- Cancel Export
- popup export loading/conflict state
- backend-authoritative Product operation state with local caching and reload recovery
- asynchronous Export/Cancel Export polling, terminal notices and route refresh
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

- S101 Freeze/Unfreeze use the existing upload routes; S57 is capability-blocked because those routes write S-101.
- Send to IC-ENC is Disabled or Simulation only and requires ReadyForDistribution.
- Edition and Update use `POST /export/{name}/newedition` and `/newupdate`.
- Cancel Export uses `POST /export/{name}/cancel-export` with operation type `CancelExport`.
- The backend resolves specification from the exact Product. No exportTarget query or `/jobs` suffix is sent.
- Synthetic Paper Charts/S102 fixtures remain non-runtime test data with no handler or backend target.
- Status uses `GET /jobs/{jobId}`; active discovery uses `GET /jobs/active?datasetName=...`.

The dispatch guard validates registry capability, operation kind, handler and matching specification.
The old BE-102 target-selection description is not the current controller contract.
Export generates an unverified candidate; successful generation does not publish to S-128.

### Product context and source-aware actions

Selected Graphics are resolved through:

```txt
src/features/products/domain/productContext.js
```

Registry-backed Products require matching Graphic and layer source metadata. Production S57/S101 layers use the registry; an explicit legacy layer adapter remains isolated and is not a source or fallback. Unknown or inconsistent source metadata fails closed for backend-dependent actions.

`productActionAvailability.js` combines Product context capabilities with Product status, active operations, backend capability state, and popup Export state. Synthetic Paper Charts/S-102 definitions remain available only to explicit source-boundary tests; the application runtime does not register them as selectable or workspace sources.

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

The workspace catalog merges independent S57 and S101 providers backed by specification-scoped AOIs.
Paper Charts and S-102 synthetic definitions are retained only for explicit tests and are not runtime
workspace providers.

The untyped Product name-list endpoint is not used for production source discrimination.
Registry-backed providers reuse their source loader and normalizer, preserve `sourceId`, `sourceLabel`,
`productKey`, `datasetName`, and `productType`, isolate provider failures, and reject stale provider
results through generation guards. `datasetName` is the authoritative globally unique workspace/route
identity; user-facing Product names remain separate metadata. A duplicate normalized `datasetName` across
providers violates that invariant, is omitted from the catalog, and resolves fail closed as ambiguous
instead of selecting a provider deterministically.

The workspace catalog is deliberately independent of Main map enabled-source state. A runtime-available
source can still resolve or appear in Analyze/Review after that source is disabled on the Main map.
S-57 and S-101 contribute independent workspace Products through their authoritative AOI contracts.

The shared picker is reused by Analyze and Review. Product name remains the primary visible label and
source metadata may be shown secondarily when useful. Canonical route projection remains datasetName-only; source identity stays internal.

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
resolution. Runtime Products come from the authoritative S-57 and S-101 registry providers and read current
metadata and validation artifact history. Review uses the same Product context to avoid cross-source
History/report requests. Synthetic Paper Charts/S-102 fixtures are available only to explicit tests.

Analyze owns product analysis/report display and does not own mutation actions. Review owns multi-product
review; mixed workspaces isolate Product/provider failures and distinguish unavailable content from failed
loads. Review tabs remain independent and should not reintroduce BroadcastChannel/session picker workflows
without a clear UX reason.

Canonical public routes are `/Analyze?Datasets=ProductA,ProductB` and
`/Review?Datasets=ProductA,ProductB`. Dataset names are globally unique; source identity remains
internal to the workspace runtime model. See [workspace routing](src/shared/routing/README.md)
for serialization, picker synchronization, and temporary legacy-path compatibility.

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

S57/S101 and explicit compatibility Product contexts use the same backend History endpoint. Synthetic
Paper Charts/S-102 test contexts retain their fail-closed unavailable History behavior without a compatibility
History request, but those sources are no longer runtime-selectable.
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
- synthetic Paper Charts/S-102 source contracts retained for explicit fail-closed tests only
- Dashboard report actions until IC-ENC/internal validation report IDs or URLs exist

The backend active-job endpoint is the source of truth for shared visibility. Frontend state remains responsible for presentation, polling and responsive local reconciliation.

## Backend-dependent work

Do not implement the following fully until backend/database contracts are ready:

- atomic Product operation claim before enqueue
- external shared Hangfire worker migration
- global map timeline
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
- cursor pagination with a browser-persisted `25 / 50 / 100 / 200` page-size selector, defaulting to 50
- stale-request suppression and last-successful-result retention
- actionable status/operation summary rows that apply matching filters
- Dashboard History panel opened from activity-row `History`
- collapsed Product History event rows inside the Dashboard History panel
- onward links to Review and Analyze
- disabled or placeholder report actions until report endpoints exist

Dashboard filters run in the backend before summary calculation and cursor page selection. Summary cards, status summary, operation summary and total counts represent the complete filtered result, while the activity list contains only the current page. Filter, range, or page-size changes reset cursor history. Page size is browser-local Dashboard state and is not added to the route URL.

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

Current implemented export leaves:

```text
Edition -> POST /export/{name}/newedition
Update -> POST /export/{name}/newupdate
Cancel Export -> POST /export/{name}/cancel-export
```

Each request is resolved to the Product's own specification by the normalized backend.

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

## Synthetic source fixtures

Paper Charts and S-102 synthetic fixtures are no longer exposed by the application runtime. The
zero-argument source registry used by the Main map and workspace services exposes only authoritative
backend sources, currently S-57 and S-101. `VITE_ENABLE_MOCK_DATA_SOURCES` is no longer a frontend
runtime/deployment switch.

The retained Paper Charts/S-102 registry definitions exist only for explicit unit-test construction.
Backend `/mock/paper-charts` and `/mock/s102` endpoints are not called by the frontend runtime. Future
production Paper Charts or S-102 support requires authoritative source contracts and a separate
integration change.

## ArcGIS portal configuration

`VITE_ARCGIS_PORTAL_URL` is an optional, non-secret Vite build-time deployment value for the
ArcGIS Maps SDK portal. `src/shared/config/arcgisConfig.js` is the single environment-read boundary;
map, theme, Locator, and UI code do not read this value directly.

The supported contract is:

| Configured value                                            | Portal behavior                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| Missing, empty, or whitespace-only                          | Uses `https://www.arcgis.com`.                                             |
| Absolute `https://` URL                                     | Uses the configured portal.                                                |
| Absolute `http://` URL                                      | Uses the configured portal, for deployments that intentionally allow HTTP. |
| Relative, malformed, unsupported scheme, or URL credentials | Uses `https://www.arcgis.com`.                                             |

The value is compiled into the frontend by Vite. Changing it requires **rebuild + redeploy**; the
application does not fetch runtime configuration and does not preflight the portal during startup. A
custom portal that parses correctly may still fail later through normal ArcGIS resource loading.

Do not put credentials, tokens, or other secrets in `VITE_ARCGIS_PORTAL_URL`. Organization deployments
that require their own ArcGIS portal should provide the value through deployment-local configuration,
such as `.env.development.local` or `.env.production.local`, rather than committing
organization-specific values. The repository-wide `*.local` ignore rule keeps these Vite local
override files untracked.

Portal configuration is independent from `VITE_ARCGIS_LOCATOR_URL`. The Locator keeps its existing
provider/service contract and DK/GL scope. The existing `Map` / `MapView` and basemap behavior are not
changed by this configuration boundary.

## Branding configuration

`VITE_APP_LOGO_URL`, `VITE_APP_LOGO_ALT`, and `VITE_APP_FAVICON_URL` are optional,
non-secret client-side Vite build variables. Use the existing `.env.example` as a template.
The tracked `.env.development` stays neutral; put organization-specific Development branding in
`.env.development.local`. Do not put secrets in these values or commit organization-specific
environment settings.

The configured URLs and alt text are build-time inputs; the browser loads the images at runtime:

- Changing a configured URL or alt value requires **rebuild + redeploy**. It does not update
  an already-built deployment dynamically.
- Replacing a file served at an **unchanged configured URL** requires no frontend rebuild,
  redeployment, or application restart. Refresh the browser to see the replacement, subject
  to deployment and browser cache policy. Favicon caches may retain an older icon longer.
- Cache headers belong to the deployment/web server. The frontend adds no cache-busting,
  polling, or configuration fetch.

A deployment can provide independent files for the navbar logo and favicon:

```dotenv
VITE_APP_LOGO_URL=/branding/organisation-logo.png
VITE_APP_LOGO_ALT=Example Hydrographic Office
VITE_APP_FAVICON_URL=/branding/organisation-favicon.png
```

`/branding` may be served from a local directory, a network/UNC share, or another static asset
location. An IIS Virtual Directory is one valid implementation, not an application requirement.
The web server maps the URL to its storage location; do not configure a UNC or filesystem path
as the browser URL. Keep deployment-owned files outside build output if they must survive
frontend redeployments.

Values are trimmed. Missing, empty, or whitespace-only logo or favicon URLs select their
neutral bundled fallback. Invalid URLs also select fallback. Logo and favicon configuration
are independent: the logo URL is never used implicitly as the favicon URL. Missing or blank
`VITE_APP_LOGO_ALT` uses `Product Catalogue`. A configured alt applies only to a usable custom
logo URL and never renames the generic fallback.

Both URL variables use the same resolution contract:

| Configured URL                        | URL behavior                                                      |
| ------------------------------------- | ----------------------------------------------------------------- |
| `branding/logo.svg`                   | Relative to Vite's `import.meta.env.BASE_URL`.                    |
| `./branding/favicon.png`              | Also relative to the application base.                            |
| `/branding/favicon.png`               | Relative to the origin root, independent of the application base. |
| `https://cdn.example.org/favicon.png` | Uses the absolute external URL directly.                          |
| `http://localhost:8080/logo.svg`      | HTTP remains supported for local/non-TLS deployments.             |

For example, with Vite base `/product-catalogue/`, `branding/logo.svg` resolves beneath
`/product-catalogue/branding/`; `/branding/logo.svg` still resolves from the origin root.
Vite's relative base (`./`) resolves against the document URL. Configure the Vite base
through the existing build tooling (for example, `npm run build -- --base=/product-catalogue/`).
The default Vite configuration does not override `base`.

Supply custom files at their configured locations. The variables are URLs, not source imports
or local filesystem paths. An optional `public/branding/logo.svg` is copied by Vite to
`branding/logo.svg` in the build output; the repository does not include that example asset.
Unsupported explicit schemes (including `javascript:`, `data:`, and `file:`), malformed absolute
URLs, protocol-relative URLs, backslashes, and embedded control characters select fallback.

The browser loads custom images passively, without preflight requests or startup waits.
A custom logo image error switches once to the bundled logo and resets alt to `Product Catalogue`.
If the bundled logo also fails, the listener and image source are removed, retaining the
generic alt and reserved space without retrying, throwing, or creating notices.
Both custom and fallback logos fit proportionally inside the existing 42 × 42 px logo space;
the navbar height remains 50 px. Very wide logos therefore appear smaller within that space.
The neutral fallback has its own contrasting background and works in both application themes.

The favicon starts as the same neutral source-owned catalogue SVG in `index.html`. Vite owns
the asset URL, filename, and base path. `src/app/startApp.js` applies a usable custom favicon
as an independent HTML module script before the normal static `src/main.js` module entry.
The branding bootstrap does not import or launch the application. Favicon selection does not
depend on navbar loading, ArcGIS initialization, Product data, or authentication completion.
The favicon link has no fixed MIME type or size restriction, allowing deployment-owned formats.

If the browser dispatches an `error` event for the configured favicon, a one-shot listener
restores the bundled neutral URL. It cannot retry the fallback. Browsers do not consistently
report favicon loading failures through link events: without an event, a failed custom favicon
may leave the previous icon or no icon. Guaranteed recovery from that browser behavior is not
provided. No preflight, retry, notice, or startup wait is added. Missing/invalid configuration
always retains the initial neutral favicon without assigning a custom URL.

`src/shared/config/brandingConfig.js` owns independent logo and favicon configuration functions
and their shared URL resolver. `src/features/layout/services/navbarLoader.js` imports the
source-owned `src/assets/product-catalogue-logo.svg` through Vite with `?no-inline`.
`navbarBranding.js` owns the existing image lifecycle; `faviconBranding.js` in the same layout
folder owns the favicon link lifecycle. The HTML fallback and app entry reuse the same SVG
through Vite rather than adding a duplicate favicon asset. Branding does not change navigation,
application title, themes, or Product workflows.

No CSP is configured in the supplied frontend `index.html` or `public/web.config`.
Deployment-owned `img-src` policy may need to permit configured external image hosts;
HTTPS pages may also block HTTP images. Logo failures use their normal fallback path;
favicon recovery follows the event limitation above. FI-017 does not relax deployment policy.
The bundled fallback is emitted as a same-origin asset for normal same-origin builds,
rather than an inline data URL.

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
- asynchronous S-101 Edition and Cancel Export activation
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

The normalized workflow adaptation is implemented without committing. Dependency-free tests run in
Work; the Windows `npm run format` / `npm run check` and manual acceptance plan remain required.
BE-108A Batch 1 is preserved. Batch 2 producers/recovery, real distribution, production mock-source
replacements, Dashboard report associations and global timeline remain separate backend work.

## Shared Preferences

FI-044 status: **Implemented; manual verification pending**.

The shared panel presents **Theme** as a standard runtime setting with a Light (sun) / Dark (moon) icon-flanked switch, alongside Main-map-only Scale hiding when available, followed by **Saved preferences**. The Introduction replay is a separate secondary button at the bottom of the panel rather than part of the settings hierarchy. Redundant visible Introduction and Settings headings are intentionally omitted.
Theme remains owned by `themeService.js` on every shared-navigation route. Main map injects
`createMainMapPreferences` for Scale hiding, Map view and Filters; the shared panel imports no
Main-map service. Main-map startup modules load only in the Main-map bootstrap branch.
Scale hiding remains opt-in OFF with the existing strict saved boolean format and immediate
visibility behavior. Workspace Preferences does not initialize Main-map Scale hiding or filters.

Auto-save ON remembers the preference. Auto-save OFF removes that preference's stored value
without changing its current runtime value. There is no separate saved-value status or clear action.
**Reset** invokes the named owner's existing runtime reset without changing Auto-save. Theme reset
selects Light (and saves when enabled); Scale hiding reset selects OFF and removes storage.
Map view retains its existing reset/save behavior. Filters Reset restores the declarative
first-visit defaults (including the conservative Idle exclusion) rather than the Filter panel's
explicit `Clear all` state. Dashboard page-size reset clears storage and restores 50.
The aggregate reset retains its existing route scope, explicitly including Main-map source defaults.

Changes update controls in place, preserving focus. Context replacement uses application-owned
focus identity. Escape and click-away preserve route lifecycle priorities and focus restoration.
Theme uses one compact public `calcite-switch`, visually framed by the public `brightness` (Light) and `moon` (Dark) icons while `themeService.js` remains the state owner.
The active route, pointer hover and keyboard `:focus-visible` use the compact underline affordance; the previous full-link highlight/outline remains removed. Plain pointer focus does not retain an underline, so route state still settles immediately after navigation.
The existing Introduction callback/lifecycle is unchanged. FI-043 remains the deferred owner of
the consolidated onboarding-content refresh.

See [FI-044 verification and manual checklist](docs/fi-044-verification.md).
