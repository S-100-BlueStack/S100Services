# Live Workspace geometry

The live Main Map uses Packages Work Scope to select Workstreams and
Workspaces. Workstream labels the backend Pipeline in the UI. Workspace
identity and map layer identifiers keep their existing meaning. Main Map reuses
the combined Workspace overview. Package Assignment reads Workspace geometry
for the selected Package's saved binding matches. Both maps use backend Esri
JSON. Their separate Package geometry overlays use the verified Package reads.
See [live scope](../../../../docs/FEATURE_WORKSPACE_SCOPE.md) and
[architecture](../../../../docs/ARCHITECTURE.md). Earlier visibility, panel
and geometry limits below describe the original DC-API-04 integration.

## Data and lifecycle

[Workspace geometry normalization](../../../../src/shared/api/workspaceGeometry.js)
validates the backend Esri JSON string as a 2D horizontal polygon.
`createWorkspaceGeometrySource` deduplicates each batch by the Pipeline/Workspace
tuple. On Main Map it reuses matching Workspace geometry from the overview.
Missing components fall back to `catalogueService.workspace()`. Package
Assignment uses that detail read directly. Detail reads use four workers per
map by default, with a 20-second abort deadline per read. Errors are scoped to
the Workspace so other valid polygons remain usable. Parent abort stops new
reads. Transport belongs to the existing catalogue client.

`createWorkspaceOverlay` owns one current context generation, its AbortController, prepared
entries and focus intent. SDK preparation never adds graphics. Old overlays are removed as
soon as a new context begins; only the latest complete preparation can replace the layer.
Late success, failure, projection and navigation continuations cannot publish after a newer
selection or destroy. Identical rerenders do not re-fetch or re-zoom. A distinct Package
context reloads even when its relevant Workspace IDs happen to match the previous Package.

Workspace geometry has no persistent or cross-selection detail cache. Main Map
can reuse identical healthy coverage from the previous generation and adopts
new polygons or metadata without an automatic fit. Assignment Retry map recreates its view and re-reads
the selected context. Explicit Focus actions use the current graphics.

`createWorkspaceGraphics` owns a GraphicsLayer, real SDK Polygon conversion, client projection,
finite extent/topology checks and instant `goTo` to an expanded union of displayed polygons.
The focus extent is navigation only, never drawn as a Package AOI. It checks the generation
again after view readiness. SDK layer handles and layers are removed before destroying views.
Application composition and UI never create SDK geometries/layers or call endpoints directly.

## Supported input and limits

- Esri JSON string with nonempty, closed, finite-area straight `rings`; multipart and holes
  retained. Maximum 2,000,000 characters / 100,000 vertices per polygon.
- Explicit horizontal WKID (including latestWKID) or WKT. No default WGS84 assignment and
  no assumption that backend output uses its input fixture SR. The SDK determines projection
  support; unsupported SR/projection assets and invalid projected topology produce errors.
- XY must be finite numbers; WGS84 coordinates must be in longitude/latitude bounds. Optional
  Z/M values are validated as finite/null and omitted from this 2D coverage display. No vertical
  transformation or changes to backend geometries are performed.
- True `curveRings` are explicitly unsupported, even though backend creation accepts them.
  No silent curve flattening, polygon repair, invented rectangle or fallback service is used.
- SDK default equation-based datum transformations are used; grid-based transformations are
  not supplied. Actual projected coverage alignment remains a local acceptance check.

Workspace overlay failures are scoped to coverage. The assignment map reports
Workspace failures separately from errors in the selected Package geometry.
Working list/status/binding flows do not depend on map success. The mock assignment map factory and
its Feature/Work stream behavior are unchanged; live errors never invoke that factory.

See [browser verification](../../../../docs/DC_API_GEOMETRY_VERIFICATION.md) and
[backend gaps](../../../../docs/DC_API_BACKEND_GAPS.md).

## Historical Main Map default visibility (DC-API-04 correction)

The main map receives the complete Workspace catalogue, grouped under Pipelines and sorted
independently from API order. Every Pipeline starts enabled. Toggling a Pipeline updates only
map coverage; Jobs membership is read from all available Workspaces and does not depend on
map visibility. A full catalogue reload preserves explicit Pipeline exclusions and enables new ones. The
visible Reload button has been removed; refresh the page to fetch a new catalogue.
No Workspace selection or automatic all-coverage fit is required. The existing basemap extent
is retained on initial load and when toggling. Individual Package/Job AOIs remain unavailable
until a verified backend geometry read is provided.

## Historical Main Map panel and basemap behavior (DC-API-04 v5)

The public Calcite Action Bar occupies a fixed left column. The mutually exclusive
Jobs/Pipelines panel floats over the MapView, without shrinking its container. Zoom
controls are on the unobstructed right. Live Jobs is enabled immediately during map
startup and does not wait for optional Workspace geometry reads.

Both maps share an ArcGIS Basemap Gallery with the same four available options in either
application theme. With no explicit choice, theme changes select Topographic (light) or
Dark Gray (dark). An explicit selection overrides automatic switching until the user
chooses "Use theme default" under Preferences; persistence is independently optional.

## DC-UX-03C — Pipeline and Workspace panel hierarchy (2026-11-11)

The main-map Pipelines panel presents each Pipeline as a compact, theme-aware group
with its own header and count. Workspace rows are a visually subordinate child group;
only its rows scroll after approximately six standard-height entries. The parent
Pipeline checkbox stays visible while scrolling a large Workspace group. Groups
retain every Workspace; the scroll limit is not paging or a data filter. Long
Workspace lists are keyboard focusable and have a descriptive accessible group
name, while short lists add no unnecessary Tab stop. Checkbox actions keep the
existing per-Workspace and per-Pipeline map visibility state, and disabling a
Pipeline retains individual Workspace choices for re-enabling or catalogue reload.

The UI remains application-owned native labels/checkboxes inside the public
Calcite Action Bar's floating panel host. Styling uses existing theme tokens,
without a new widget, private shadow DOM or backend/API work. Verify light and
dark appearances, mouse/keyboard scrolling and focus, long labels and disabled
Pipeline children in a real desktop browser.

## Combined Workspace overview (DC-PERF-FE-01 and DC-MAIN-MAP-PERF-01)

For the live Main Map, `shared/api/loadWorkspaceOverview.js` retrieves one bounded
Workspace/polygon/Package membership snapshot from the backend per Pipeline page.
`createPipelineVisibility` owns the startup catalogue and shares it with the map
and initial Jobs load. After startup, live Jobs reads get a fresh overview
through the same loader. Only a successful current Jobs load supplies the
replacement catalogue to the Work Scope controls and map. Healthy unchanged
polygons and labels remain mounted. `createWorkspaceGeometrySource` validates
references before consuming a polygon, and retries a null polygon through the
existing Workspace detail endpoint. The overlay owns stale-result rejection,
SDK preparation and rendering.

The Package assignment map continues using its independent per-Workspace
geometry source. See [DC-PERF-FE-01 validation](../../../../docs/DC_PERF_FE_01_VALIDATION.md)
for failure and browser performance checks.

## DC-MAP-POLISH-01 — Map color and coverage legends (2026-11-23)

The live Main Map's passive legend is attached directly to the map surface,
not the hidden Pipelines overview. `createWorkspaceColorLegend.js` uses the exact
levels and unknown color from `workspaceJobColors.js`; `createWorkspaceGraphics.js`
uses those values for count-colored main-map polygons. `Show empty Workspaces`
still belongs to the independent Work Scope controls. No additional API reads
or change to Job status persistence occurs.

The Package Assignment map renders **saved auto-matched** Workspace polygons
with a solid orange outline from `workspaceCoverageSymbol.js`, separate from
the main-map count palette and the Package AOI/detail geometry. Gray dashed
outlines are reserved for **prospective unsaved** Workspace matches, which are
not calculated or displayed by the current backend contract. Its native
disclosure legend uses the same orange saved-match color and a visible
`Map legend` summary, initially expanded and non-persistent. The user accepted these legend and
saved-match updates. See the [tracker](../../../../docs/PROJECT_TRACKER.md)
for acceptance and the remaining prospective-match task.

## DC-MAP-POPUP-05 - Workspace popup from the committed baseline

The live Main Map-only Workspace GraphicsLayer has a native ArcGIS PopupTemplate.
Its title and close button stay owned by the SDK. App-owned content consists of
one flush, disabled lock action/status row and read-only Workstream and Open packages
facts, with no nested panel or additional header. The count-based header color
uses the same configured Workspace palette as the map legend. The foreground
for its native title and Close action is chosen from the background contrast,
not the current theme. The color adapter follows ProductCatalogue, with a
documented internal Calcite header dependency and reversible, header-only
Calcite action tokens.
Missing/invalid Package counts are not converted to zero, and lock state is not
read from the backend or mocked. A displayed `unlock` and `None` are placeholders.
Closing/hiding or removing Workspace geometry does not close unrelated popup
types. Assignment Map popups remain disabled. The tracker records browser
acceptance. Recheck the native header in both themes after SDK upgrades.

## DC-MAP-LABEL - Main Map labels (2026-11-24)

Workspace display names are labeled at 1:5,000,000 or closer on the live Main
Map. `createWorkspaceGraphics` feeds its current visible prepared polygons to
`../labels/createMapLabelLayers.js`. Package AOI Short IDs are labeled at
1:3,000,000 or closer; `../packages/createPackageAoiOverview.js` supplies the
existing deduplicated, filtered geometry-page snapshot and uses the AOI extent
center as a label anchor. Label-only client-side FeatureLayers use public SDK
label placement and static deconfliction, transparent symbols, disabled popups
and no service URL. Dark label text with a white halo works against both light
and dark basemaps. No label is synthesized for a missing Package short ID.

The source renderer owns replacement, filtering, and disposal; no separate
metadata or geometry request is needed. Identical visible snapshots and
Workspace count-only updates do not rebuild labels. Label preparation or
construction errors are logged separately and must not invalidate valid
source geometry. ArcGIS may suppress labels that cannot fit. Validate actual
placement, font access, scale transitions, overlapping labels, and click
behavior with the installed SDK. Package Assignment and mock map are unchanged.

Public SDK references: [FeatureLayer](https://developers.arcgis.com/javascript/latest/references/core/layers/FeatureLayer/),
[LabelClass](https://developers.arcgis.com/javascript/latest/references/core/layers/support/LabelClass/),
[Labeling guide](https://developers.arcgis.com/javascript/latest/labeling/).
