## DC-API-04 v5 correction acceptance (2026-10-30)

The v4 browser run exposed layout, Jobs startup, Preferences and basemap-selection
regressions. Check these specific behaviors on a complete local checkout:

1. Run `npm run format` and `npm run check` in `src/DataCatalogue` after overlaying
   v5 onto v4. Verify the locally installed `@arcgis/map-components@5.0.9` is retained.
2. On first open of `/`, Jobs is **enabled** before opening Package assignment or
   waiting for Workspace geometry. Pipelines and Jobs share a mutually exclusive
   content panel that **overlays** the map. Only the Calcite Action Bar consumes
   map width. Zoom controls remain available in the bottom-right corner. Opening,
   closing and switching panels must not change the MapView container dimensions.
3. Open Preferences from the header gear. The panel must be visible and contain
   Theme and all three independent persistence controls. The previous theme action
   is no longer in the navbar. Verify outside click, Escape and trigger focus restore.
4. On both maps, Basemap Gallery shows both light choices (Topographic, Oceans) and
   both dark choices (Dark Gray, Human Geography Dark, if the browser-scoped API key
   is configured) regardless of current theme. With no manual choice, theme switch
   selects Topographic in light and Dark Gray in dark. Select Oceans in dark mode;
   further theme changes must not replace it. Use "Use theme default" in Preferences
   to re-enable automatic switching. With basemap memory enabled, a custom choice
   persists after refresh; with memory off, it is session-only.
5. Pipeline/Workspace visibility toggles must not issue new Workspace detail GETs,
   blink/recreate graphics, reset Jobs state or alter map zoom. The visible Reload
   text button has been removed; refresh the browser for a new complete catalogue.
6. Verify real Workspace polygon alignment, mock mode, Package bindings/deep links,
   safe Package HTML and exact Severity. Package AOI geometry and manual Workspace
   assignments remain documented backend dependencies, not synthetic overlays.
7. Review the local npm audit separately. The user reported eight advisories
   (three production), and `npm audit fix --dry-run` proposed 16 updates. If running
   `npm audit fix`, inspect the generated lockfile and rerun check/audit. Do not
   hand-edit `package-lock.json` or run `npm audit fix --force` unreviewed.

# DC-API-04 local geometry verification

Baseline: `829bb6ee9ff9b6925431d5f040f9a1b55eba297d`.
These are required local checks, not browser results claimed by the candidate author.
Keep existing permitted API origin, credentials, Windows SSO and basemap configuration.
A published Package/Workspace Feature Service is neither needed nor configured by this work.

## Before browser testing

1. Apply only the candidate `src/` tree to the exact clean baseline as described in
   `DELIVERY/IMPLEMENTATION_REPORT.md` in the ZIP. Verify its SHA-256 and file manifest first.
2. From `src/DataCatalogue`, run `npm run format`, then `npm run check`. Use the complete local
   checkout (it should contain the existing `src/styles/tokens.css` omitted from the snapshot).
   If dependencies are missing, install the pinned lockfile using the existing local npm process
   (`npm ci`); `@arcgis/map-components@5.0.9` was added locally for v4. Do not reconstruct missing source from this ZIP.
3. Start the existing dev configuration with `npm run dev`. Set `VITE_CATALOGUE_SOURCE=live`
   through the existing local environment configuration and restart Vite when switching modes.
   Do not change backend routes, CORS, rights or authentication to make tests pass.
4. Open browser developer tools, preserve Console/Network logs, and use a permitted test user.
   Identify a Pipeline/Workspace whose detail GET succeeds, a second distinguishable Workspace,
   and a Package with saved bindings returning one or more intersecting Workspaces. Also find
   an unbound Package. Use only approved test Packages for binding changes.
5. Inspect the actual detail response: `workspace.id`, `workspace.geometryRef`, and an `esriJSON`
   string with `rings` and `spatialReference`. Note the real SR, approximate vertex count and
   whether any production sample uses `curveRings`. Do not save credentials or private payloads
   in repository docs. A curve-only response is an explicit supported-failure case (GEO-03).

## Jobs main map — corrected live behavior

| Action                            | Expected result                                                                                                                                                                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Load live app with no interaction | The basemap appears with a compact Pipeline checklist. All Pipelines and every available Workspace are enabled by default. The app reads Workspace polygon detail for the enabled set, with at most four simultaneous detail calls per map. No selector is required.                                          |
| Examine the Workspace polygons    | Valid Workspace polygons are colored by open Job count (green/yellow/orange/red, blue while counts are unavailable). There is no visible centered information box. Errors must still appear as ordinary notices and accessible status. Do not interpret a Workspace polygon as an individual Package/Job AOI. |
| Disable one Pipeline              | Only its geographic Workspace coverage disappears. Jobs in that Pipeline remain present in the Jobs list, retaining their mock statuses. The current map viewport does not reset.                                                                                                                             |
| Re-enable that Pipeline           | Its Workspace geometry returns. No duplicate logical requests for identical identity pairs within a batch, and no stale graphics from a superseded request appear.                                                                                                                                            |
| Open Jobs via the left Action Bar | Jobs floats over the MapView to the right of the fixed-width Action Bar. The Pipeline panel closes; map size and zoom do not change. Closing Jobs returns to the normal map. All Workspace-derived Jobs are available independent of map visibility.                                                          |
| Expand a live Job                 | Status and Severity remain functional. No internal tuple ID, misleading Related AOIs section or Workspace-specific map focus/clear controls are shown.                                                                                                                                                        |
| Refresh the browser page          | Workspace/Pipeline catalogues are fetched again; all available Pipelines/Workspaces start visible. The old Reload button is no longer shown.                                                                                                                                                                  |
| Simulate a Workspace-detail error | Successful polygons still display if other reads succeed. A notice identifies the failure. Jobs, bindings and the basemap remain usable. No demo geographic fallback is shown.                                                                                                                                |
| Switch to mock mode               | Existing mocked Jobs/AOI geometry and behaviors remain as before. No live Pipeline or Workspace detail GET occurs.                                                                                                                                                                                            |

### Navigation and Package assignment regression

1. Click the header `Package assignment` link. The four-panel assignment page must open
   and load Packages; Console and Network should not show a missing `map-focus` render-target
   error. Close and reopen repeatedly.
2. Open `/assignments` directly in a fresh browser tab, then navigate to
   `/assignments/packages/{encodedPackageId}` for an existing Package. Refresh, use Back and
   Forward, and verify selected Package state and saved bindings. Repeat with an unknown ID.
   Check the deployment host separately for SPA fallback before relying on deep links.
3. With unsaved draft changes, navigate between the assignment page and the Jobs main map.
   Confirm Save/Discard/Cancel, Escape and focus restoration are still correct.
4. Compare the compact header link and left Calcite Action Bar against the intended
   ProductCatalogue navigation reference in light/dark mode. The remote reference was not
   accessible during candidate creation, so exact visual matching is a local review item.

## Package assignment map

| Action                                                                               | Expected result                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open assignment workflow before selecting a Package                                  | Existing four panels and Package filters remain. The map is a real MapView using the same basemap configuration, with no demo Work stream requests.                                                                                                                                                                    |
| Select a Package with saved intersecting Workspaces                                  | Detail GETs use each binding's Pipeline plus Workspace ID. Only those server-derived Workspaces display; at most four geometry requests from this map are active. Successful coverage fits the map. Status explicitly says Package AOI coordinates are unavailable.                                                    |
| Select a Package with multiple Pipeline bindings                                     | All distinct relevant Workspace polygons display; duplicate tuple entries do not issue duplicate detail GETs. Pipeline identity is preserved even for identical Workspace IDs.                                                                                                                                         |
| Pan/zoom, toggle Pipeline checkboxes without Save, Show active/all, or rerender rows | Last loaded coverage stays unchanged; unsaved selections do not appear to save Workspace membership. No geometry reload or zoom reset is triggered by draft-only changes.                                                                                                                                              |
| Use Focus Workspaces                                                                 | View fits displayed coverage without another HTTP request. The extent used for navigation is never drawn as a Package rectangle.                                                                                                                                                                                       |
| Save an approved binding change                                                      | Existing preflight/writes/reconciliation and individual outcomes are preserved. After authoritative membership changes, overlay context follows the new saved intersection result. A failed/partial Save retains the appropriate draft and error; map uses the last loaded record, not a predicted draft intersection. |
| Select an unbound Package or a binding with no intersecting Workspaces               | No stale polygons remain. Basemap stays usable; status reports no saved intersecting Workspaces plus the AOI limitation. No made-up Package marker/rectangle appears.                                                                                                                                                  |
| Select Package B while Package A geometry is pending                                 | A's graphics clear immediately. Only B's context may display or zoom. Repeat with two Packages sharing Workspaces.                                                                                                                                                                                                     |
| Use Retry map                                                                        | Only the assignment map is recreated and selected geometry re-read. Package selection, draft, filters, binding outcomes and left-panel scrolling remain usable. One click creates one map.                                                                                                                             |
| Navigate to Jobs, then back, with clean/dirty draft                                  | Existing Save/Discard/Cancel, keyboard Escape and focus restoration are preserved. Retained maps and selection remain coherent; no extra views accumulate on repeated navigation.                                                                                                                                      |

## Failure, race and accessibility checks

1. In browser Network throttling, delay Workspace detail calls and rapidly toggle Pipelines,
   select Packages and change workflow. Old success/error responses must not
   publish graphics/status or move the latest context. Repeat while projection assets load.
2. Block only a Workspace **detail** URL (not `/packages` or `/workspaces` lists). Main Jobs
   should remain readable and status changes usable. Assignment Package lists and bindings
   must remain usable. With several relevant Workspaces, successful polygons remain visible
   and failed Pipeline/Workspace identities appear in the map status summary.
3. Restore the request and refresh the main page or use Retry map (assignment). Geometry
   should recover. Requests taking over 20 seconds should report a map-scoped timeout; queued
   Workspaces continue loading. No geometry error may invoke the mock map or change API data.
4. Use browser-local response overrides on permitted fixture requests only, without changing
   the backend: null `esriJSON`, malformed JSON, empty/unclosed/non-finite rings, mismatched
   `workspace.id`, changed geometry reference, missing SR, unsupported WKID/WKT, true curves,
   and an oversized polygon. Each must yield a scoped honest failure, never a fake footprint.
   A wrong/missing spatial reference must never silently default to 4326.
5. Verify a real projected polygon (not only 4326), multipart/holes and available Greenland
   coverage against a trusted reference. Confirm extent, orientation, datum alignment and
   whether required transformation assets are available. If projection fails, report GEO-03;
   do not replace coordinates or swap to an assumed Feature Service.
6. Check Console for unhandled rejections/WebGL/render errors, especially during Retry and
   workflow switches. Check Network for retained aborted requests or unexpected repeated
   geometry reads. Selection changes may legitimately start new reads; rerenders must not.
7. Test keyboard-only selection, Tab to Focus and Retry, native Escape/draft dialog behavior,
   screen-reader status text, light/dark mode and reduced-motion preference at ordinary desktop
   and low-height laptop sizes. New controls should not replace/focus native inputs on rerender.
   All coverage is identified with text as well as outline color.
8. Restart with `VITE_CATALOGUE_SOURCE=mock`. Existing demo startup, Feature map/Work streams,
   comments, assignment legend, mock status, popups, clusters, filters and theme should behave
   as before. There must be no live catalogue Workspace detail GET; the new live Focus Workspaces
   control is hidden. Switching to live must never reuse demo geography or status persistence.

## Acceptance record

Record local format/check result, browser/version, tested Pipeline/Workspace/Package contexts
(with approved anonymized identifiers), actual SR/curve usage, coverage alignment, request counts,
partial failures, timeout recovery, races and mock regression. Keep unresolved cases explicit.
Backend/AOI follow-up is GEO-01; Workspace projection/curve limits and samples are GEO-03.
