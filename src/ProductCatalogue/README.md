# Product Catalogue frontend

Historical normalized-workflow integration baseline: `345b79eef2a9225473d57db80243e731739cbc3a`.

The [normalized-workflow adaptation report](docs/normalized-workflow-frontend-adaptation.md)
records that integration phase. For current frontend behavior, use the explicit task baseline,
[development contract](AGENTS.md), [invariants](docs/INVARIANTS.md) and the owning feature README.
The [demo-readiness plan](docs/demo-readiness-plan.md) tracks verification rather than certifying a deployment.

Product Catalogue is an ArcGIS/Vite frontend for nautical-chart Products and ENC-package workflows. It loads source-owned AOIs and Product data through backend APIs, renders ArcGIS Graphics, and presents source- and capability-gated actions in the Product popup.

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

## Development contract and demo preparation (2026-11-10)

This documentation reconciliation uses the explicitly supplied committed snapshot
`63c89ff0d11899ef81a54dcd18b116de8c5dfdf4` (2026-11-10). The earlier
`c4b0f7e1108b40b2cb4f4b40f0ac95e2280d906c` reference was the October
planning baseline, not the current default for future tasks. Always use the **explicit
commit supplied by the next task** rather than either documentation snapshot.

- [AI development rules](AGENTS.md) govern baseline validation, source access and delivery.
- [Architecture invariants](docs/INVARIANTS.md) and [module map](docs/MODULE_MAP.md)
  identify preservation boundaries; baseline code/tests and owning feature READMEs
  determine current implementation behavior.
- [Demo readiness](docs/demo-readiness-plan.md), [hardening tracker](docs/frontend-hardening-tracker.md)
  and [UI/UX backlog](docs/ui-ux-design-backlog.md) distinguish committed changes from full
  manual browser/deployment acceptance.

FI-027 navbar search, FI-029 unified popup presentation and FI-043 Introduction are accepted
UI baselines. Subsequent November implementation commits cover aggregate `Package.Status`
map/popup presentation (`54436f7`), Basemap Gallery (`d09a1db`), initial map readiness
(`d400be0`), Analyze route loading (`1065291`), focus and reduced motion (`6f38fdb`),
Preferences simplification (`1ac36e4`), responsive navbar and Dashboard calendar accessibility
(`dfd38de`), and confirmation/Notice Center accessibility (`63c89ff0`). These commit
records are **not evidence of a new full-system demo smoke**. Verify browser behavior,
source permissions and server integrations independently.

Keep Product/package aggregate status distinct from S-101/S-57 Export Candidate status.
The shared Pause/Resume, Discard, Send/Accept and Tools action row is not universal backend
authorization: unsupported non-package mutations stay disabled. Preserve current workflows
and defer SDK upgrades, React, new test frameworks, FeatureEffect, Sonda and map-label
experiments to a separately approved scope.

## Terminology

Use `Product` and `Products` in user-facing UI text. Do not use `Dataset`, `Datasets`, `dataset`, or similar dataset-oriented labels in visible UI unless the backend/domain concept specifically requires a technical distinction.

Code may continue using stable technical identifiers such as `datasetName` where that matches backend contracts or existing normalized attribute names. The user-facing terminology audit is complete, and `userFacingTerminology.test.js` protects representative UI sources from reintroducing visible `Dataset` / `Datasets` labels.

## Stable frontend flows

These are implemented frontend surfaces to preserve during targeted demo stabilization;
the list does not claim complete backend or browser/deployment acceptance:

- Main-map AOI loading, ArcGIS Graphics, hover/overlap selection, modifier selection,
  refresh reconciliation, scale hiding and source-aware Product identity.
- Permanent Main-map navbar Product search and independent, on-demand geographic Locator.
- Source-aware Data sources, Filter facets, contextual counts and persisted preferences.
  ENC-package map colors and Package-status filters follow aggregate backend
  `Package.Status`, not S-101/S-57 candidate statuses. Mixed-status hatches are retired.
- One popup row with Pause/Resume, Discard, Send/Accept and Tools for resolved Products;
  package actions require verified backend eligibility, and unsupported mutations fail closed.
  The former Freeze/Export/Cancel Export endpoints remain internal compatibility contracts,
  **not** a separate current popup action row.
- Popup Product metadata, Package status and independent Export Candidate member states,
  error-message details, confirmation focus/Escape and application-owned tooltips.
- Product Collection, Product History/Timeline and source-aware Analyze/Review workspaces.
- Dashboard range/calendar, committed filtering, sorting, cursor pagination, operational
  summaries and route-local History panel.
- Shared navbar, Theme/Preferences, Basemap Gallery on Main Map and Analyze, route-specific
  onboarding, notices, light/dark interaction and reduced-motion behavior.
- Initial Main-map and Analyze loading/readiness safeguards. Final acceptance still needs
  a browser smoke with the actual basemap, source services and deployment environment.

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

Current visible popup workflow:

- Every resolved Product has the same compact icon-only presentation: Pause/Resume,
  Discard, Send/Accept, and Tools. The owning source, backend action snapshot and current
  Product state govern whether a button is enabled.
- ENC-package Pause/Resume and Discard use the package-owned action session when the
  backend authorizes them. Send/Accept is normally disabled and may be simulated only
  in an explicitly configured local development environment, without backend mutation.
- Non-package Products do **not** inherit package dispatch: controls remain disabled
  unless a verified source-owned workflow contract supports them.
- The Main-map package popup distinguishes aggregate `Package.Status` from S-101 and
  S-57 Export Candidate ProductState. Candidate state does not determine map color
  or the package Status filter.

Retained internal operation contracts (not the current visible action row):

- S-101 Freeze/Unfreeze use existing upload routes; S-57 remains capability-blocked
  because those routes write S-101.
- Direct Edition/Update use `POST /export/{name}/newedition` and `/newupdate`;
  Cancel Export uses `POST /export/{name}/cancel-export` with operation type `CancelExport`.
- The backend resolves specification from the exact Product. No `exportTarget` query or
  obsolete `/jobs` suffix is sent. Export produces an unverified candidate, not S-128 publication.
- Historic Product job status uses `GET /jobs/{jobId}` and active lookup uses
  `GET /jobs/active?datasetName=...`; package popup freshness has its own source-owned lifecycle.
- Synthetic Paper Charts/S-102 fixtures are test-only and cannot use electronic
  mutation dispatch.

See [popup actions](src/features/map/popups/README.md) and
[Data sources](src/features/dataSources/README.md) before changing either boundary.

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

Main-map filters use provider-specific dimensions:

- `displayScale` and `usageBand`, when supported by the source;
- `packageStatus` for ENC packages, matching only aggregate backend `Package.Status`;
- `status` for single-product sources, matching their own ProductState.

The package options are the backend aggregate enum Idle, Ready, InTransit, Error and Hold;
these values are **not** Export Candidate ProductState values. Source-appropriate option
lists remain visible with contextual counts, including zero-count choices, and the
package's default exclusion applies to aggregate Idle. See [filter contracts](src/features/map/filters/README.md).

Product popup attribute rendering is hardened so first-load popup details do not fall back to showing all raw feature attributes when field metadata is not ready yet.

### Main map Product search

Main-map Product search is permanently mounted in the Main-map **navbar**, alongside
its separate expandable Locator control (FI-027). It indexes currently committed
active frontend Graphics and their source-aware Product contexts, not the Analyze/Review
workspace catalog or backend place search.

Selecting a currently valid, filter-visible Product navigates to its Graphic and opens
its popup. Disabled sources are not indexed, and a stale or filtered-out result cannot
open an unrelated Product. Geographic Locator owns place search/map navigation only,
with no Product popup or marker side effect. See [Product search](src/features/map/search/README.md)
and [Locator](src/features/map/locator/README.md).

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

FI-043 status: **Developer-accepted** at `9280c650`, with Back/Forward replay correction accepted at `69b0d329`. A new full-system demo smoke is still pending.

One shared Introduction owner provides route-specific guidance on Main map, Dashboard, Analyze
and Review. Start introduction at the bottom of Preferences replays the current route. Existing
route completion/dismissal state is preserved.

- Main map separates Product search from Locator and covers sources, filters, hover/normal click,
  overlap selection, optional Ctrl/Cmd-click and Ctrl+Enter/Cmd+Enter on the current transient
  highlighted Product, popup actions, Product Collection and workspace navigation.
- Dashboard covers automatic valid range changes, Refresh/last-successful time, filtering,
  sorting, page size and Product workflow links.
- Analyze covers composition, enabled Products, cards/content and Refresh. Review covers
  composition, workspace History/IC-ENC/Validation toggles, per-Product overrides and Refresh.
- All routes explain FI-044 Theme, Auto-save and independent Reset. Only Main map describes
  Scale hiding. Relevant Data sources, Filters and Preferences panels open through their existing
  application-owned triggers for the step; the tour never changes settings or Product state, and
  panels opened by the tour are closed when their guidance ends.
- Missing/hidden targets are skipped. Native Back/Next buttons remain keyboard accessible;
  Escape closes directly and restores focus. Re-entry and route teardown supersede old callbacks.

See [FI-043 baseline audit, target ownership and manual verification](docs/fi-043-onboarding-refresh.md).

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

- compact `From` and optional `To` date/time controls that apply valid committed changes automatically
- `Refresh` and the last-successful load time
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

Retained direct Export API operations (not the FI-029 visible popup row):

```text
Edition -> POST /export/{name}/newedition
Update -> POST /export/{name}/newupdate
Cancel Export -> POST /export/{name}/cancel-export
```

Any future UI activation requires an explicit new workflow decision and matching source-owned
backend authority. Existing direct requests resolve to the Product's specification through
the normalized backend; do not route package actions through these Product endpoints.

## Background job deployment direction

The earlier [BE-106 readiness review](docs/be-106-external-worker-readiness.md)
recorded ProductCatalogueAPI as the HTTP/Hangfire host and proposed future
JobPlatform worker extraction. That is a **dated backend snapshot**, not a
fresh verification of the latest process or deployment topology. The later
normalized workflow integration also established separate background ArcGIS
execution boundaries. Verify current hosting against the explicit backend baseline
before making worker, queue or process changes.

BE-106 records this direction without authorizing a new hosting change:

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

2. Register the layer through the current owning map/source architecture rather than
   adding a non-existent `layerConfigs.js` file. Relevant verified locations include:

   ```txt
   src/features/map/core/layerRegistry.js
   src/features/dataSources/config/dataSourceRegistry.js
   src/features/dataSources/map/dataSourceMapAdapter.js
   ```

   The exact choice depends on whether the layer is source-owned or a static logical layer.

3. Declare capabilities explicitly and maintain stable Product/source identity.
4. Verify popup/filter/display-scale behavior against those capabilities.
5. Keep unsupported Product/backend mutations disabled and fail closed.

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
provider/service contract and DK/GL scope. The separate basemap-styles key does not authorize Locator
or Product API requests. See [Basemap selection](src/features/map/basemaps/README.md).

## Basemap gallery configuration

Main Map and Analyze support Topographic, Oceans, Dark Gray and (when a browser
basemap-styles key is configured) Human Geography Dark. The existing `Map` / `MapView`
architecture is retained. Theme changes choose an automatic basemap until the user
chooses one manually; Preferences can remember/reset the manual selection.

Optional local Vite build configuration: `VITE_ARCGIS_BASEMAP_API_KEY`. This is a
public browser key and should be restricted by service privileges and approved
referrers. It is scoped to `esriConfig.apiKeys.basemapStyles`, not Product API calls.
Do not commit the key. See [Basemap selection and verification](src/features/map/basemaps/README.md).

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

Run `npm run format` and `npm run check` locally before accepting a Product Catalogue documentation or frontend change. A full browser/deployment smoke is a separate gate.

## Current status

The last planned general UI polish is committed at `63c89ff0d11899ef81a54dcd18b116de8c5dfdf4`.
Next work is targeted real-usage feedback and demo regression verification, not new UI features.
For package aggregate status, navigation and accessibility changes since October, see the
[hardening tracker](docs/frontend-hardening-tracker.md) and
[UI/UX backlog](docs/ui-ux-design-backlog.md).

The earlier implementation history below is preserved for reference:

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

The normalized workflow adaptation was accepted in the earlier integration at
`aaf635571503c780517cfc3a76a4fa5e4894f447` and remains documented in
`docs/normalized-workflow-frontend-adaptation.md`. Later UI changes are recorded above and in
the frontend tracker; the current demo baseline still requires its own browser/deployment smoke.
BE-108A Batch 1 and the later developer-reported Batch 2 manual Export/recovery acceptance
at `0cab4e4f08a88717c25794a85fb691e8d64a7fbd` are separate backend history,
not evidence of frontend popup dispatch. Real distribution, production mock-source replacements,
Dashboard report associations and the global timeline remain deferred.

## Shared Preferences

FI-044 status: **Done**.  
Implementation commit: `79616f8af0cda91db8e4b1fa90c0248aef4fef41`.  
Accepted merged baseline: `82f69c1d082773c110b48404d716d99cdc32de02`.

The shared panel groups Theme, Basemap (when available), and Main-map-only Scale hiding under **Display**, followed by **Saved preferences**. Theme uses a Light (sun) / Dark (moon) icon-flanked switch. Basemap keeps a dedicated **Use theme default** action alongside the current selection; this restores automatic theme-based selection without resetting other settings. The panel header has a keyboard-accessible close button, and Introduction replay remains a separate secondary action at the bottom.
Theme remains owned by `themeService.js` on every shared-navigation route. Main map injects
`createMainMapPreferences` for Scale hiding, Map view and Filters; the shared panel imports no
Main-map service. Main-map startup modules load only in the Main-map bootstrap branch.
Scale hiding remains opt-in OFF with the existing strict saved boolean format and immediate
visibility behavior. Workspace Preferences does not initialize Main-map Scale hiding or filters.

Auto-save ON remembers the preference. Auto-save OFF removes that preference's stored value
without changing its current runtime value. There is no separate saved-value status or clear action.
The individual Reset buttons have been consolidated into a single understated **Restore defaults**
action. It invokes the existing route-scoped aggregate reset and leaves Auto-save selections
unchanged: Main map restores viewpoint, declarative Filters (including conservative Idle exclusion),
Scale hiding (OFF), source defaults, Basemap and Theme (Light); Dashboard restores Theme and
page size (50); Analyze/Review restore Theme and available Basemap. Restoring settings uses the
same domain owners and storage behavior as before. The separate Basemap **Use theme default**
action changes only the basemap choice, without affecting Auto-save or the other preferences.

Changes update controls in place, preserving focus. Context replacement uses application-owned
focus identity. Escape and click-away preserve route lifecycle priorities and focus restoration.
Theme uses one compact public `calcite-switch`, visually framed by the public `brightness` (Light) and `moon` (Dark) icons while `themeService.js` remains the state owner.
The active route, pointer hover and keyboard `:focus-visible` use the compact underline affordance; the previous full-link highlight/outline remains removed. Plain pointer focus does not retain an underline, so route state still settles immediately after navigation.
The FI-044 Introduction callback is preserved. FI-043 updates its shared content and lifecycle;
manual verification is pending. See `docs/fi-043-onboarding-refresh.md`.

FI-044 was manually accepted on 2026-09-21. Browser verification confirmed the final compact Theme switch with Light/sun and Dark/moon endpoints, the secondary Introduction button, restored navbar hover/current-route underline behavior, and Filters Reset restoring the conservative Idle default. The implementation was committed at `79616f8af0cda91db8e4b1fa90c0248aef4fef41` and is preserved in merged baseline `82f69c1d082773c110b48404d716d99cdc32de02`. Local frontend check passed and formatting was run before commit.

See [FI-044 verification and manual checklist](docs/fi-044-verification.md).
