# DC-SDK-01 v6 — Restore Esri Gallery and isolate invalid basemap credentials

Date: 2026-11-11. This candidate supersedes the v3, v4 and v5 custom selector
implementations; the sections below remain as historical evidence only.

## Root causes and scope

- v3-v5 replaced Esri's original image gallery with different controls. These
  substitutions did not meet the visual preservation requirement.
- The app previously treated the presence of `VITE_ARCGIS_BASEMAP_API_KEY` as
  proof that the protected Human Geography Dark style was accessible. Restoring
  a saved selection could pass an expired style to `Map` during view startup.
- The previous ArcGIS gallery integration assigned properties around custom
  element upgrade/connection, leaving an unverified component initialization
  race. The ArcGIS 5.2 `LocalBasemapsSource` module is now used directly.

## Implementation

- Restore public Esri `arcgis-basemap-gallery` in `arcgis-expand` with an existing
  `MapView`. Register custom elements before setting their properties and set
  `source` and `view` before DOM connection. Keep generation guards, view
  replacement cleanup and two-map basemap synchronization.
- When an API key is configured, verify Human Geography Dark by loading its
  Basemap. Only expose/use the protected style after success. Until then, map
  startup and saved choices use the established theme default. On rejection,
  clear the inaccessible saved choice and show a non-sensitive notice. A single
  401 from this access probe is expected for an expired key; it must not stop
  the application or interfere with other basemaps.
- Keep the existing basemap persistence schema, geometry, routing, Packages,
  Map/MapView composition, Preferences and dependency versions unchanged.

## Browser acceptance

1. With a valid API key, open Basemaps on both maps. Confirm Esri's standard
   scrollable thumbnail rows and selection, not a custom Calcite List/Card.
2. Select Oceans, navigate between maps, change theme, and use Preferences to
   reset to the theme default. Confirm the choice is synchronized.
3. Revoke or invalidate the key while Human Geography Dark is saved. Reload.
   Both maps must start with the theme default. The app may show one protected
   style 401 during credential verification, but other map and UI functions
   must remain usable. Human Geography Dark must not be selectable.
4. After restoring the key, reload and confirm Human Geography Dark becomes
   available after verification. No key contents may appear in a notice/log.
5. Rapidly switch routes, retry the maps, and verify no duplicate gallery,
   stale selection, lost focus, or `null.state` rendering exception.
6. Run `npm run format` and `npm run check` locally from `src/DataCatalogue`.

**Validation limit:** Node tests cover state and mounting order with mocks,
not actual Esri 5.2.1 web-component rendering or HTTP authentication. If the
real Gallery still fails, diagnose its public component state in the browser
rather than replacing it with another imitation.

---

# DC-SDK-01 v5 — Restore thumbnail list layout

Date: 2026-11-11 (Europe/Copenhagen)

## v5 visual correction

The user's v4 browser screenshot shows two columns of cards with preview
images reduced to thin vertical strips. The requested reference screenshot is
the original ArcGIS-style **vertical list**, with a 112 x 64 px thumbnail at
the start of every row and the corresponding label immediately beside it.
The source of the layout mismatch is v4's Card Group/Card composition;
changing the basemap data or geometry operators will not correct its layout.

Replace only the v4 Card markup and CSS with public Calcite List/List Item
components. The list uses `selectionMode="single-persist"`,
`selectionAppearance="highlight"`, `calciteListChange` and the public
`content-start` slot for a fixed-size thumbnail. The panel is narrow,
vertically scrollable, and uses application theme tokens. This is an
intentional visual recreation of the earlier gallery layout, not an attempt
to reinstate the `arcgis-basemap-gallery` view model that threw `null.state`.

All four existing options (or three without an API key), preview URLs,
preview-error fallback, shared settings, Preferences persistence, MapView UI
placement, menu dismissal, selection and focus guards remain as in v4.
The ArcGIS 5.2 geometry operator migration from v4 is retained unchanged.
No dependencies or backend routes are altered.

## Browser acceptance

1. Run `npm run format` and `npm run check` from `src/DataCatalogue`.
2. Hard-refresh both the main map and Package assignment map. Expect **one
   vertical column**, images entirely visible on the left and labels on the
   right, in both light and dark modes. The list should scroll if needed.
3. Select Oceans, verify both maps and Preferences, then reset to theme default.
4. With and without an API key, verify three or four choices respectively.
5. Check Tab, arrow keys, Enter/Space, Escape, outside click, focus return,
   rapid map switching and Retry map; no duplicate selector controls.
6. Force a thumbnail loading failure; the icon fallback and label must remain
   visible and the option selectable.
7. Verify the old `arcgis-basemap-gallery` `null.state` error remains absent.

This candidate is verified only with available SDK-independent tests.
Final visual acceptance requires local Calcite/ArcGIS 5.2.1 browser testing.

---

## Historical v4 and earlier decisions (superseded visual layouts)

# DC-SDK-01 — Basemap selector runtime follow-up

Date: 2026-11-11 (Europe/Copenhagen)

## Scope and source evidence

- Repository: `S-100-BlueStack/S100Services`; frontend: `src/DataCatalogue`.
- Authoritative committed baseline: `22e2ff7da5578f26559189eca06c9118e8227bfe`.
- Context ZIP: `DC-DEPLOY-01-Context-22e2ff7da557-20261111-092627.zip`.
- Context ZIP and source/working-tree manifests: SHA-256 verified (268 baseline and 231 overlay files).
- Earlier SDK v1 candidate: `DC-SDK-01-Candidate-v1-22e2ff7d-20261110.zip`, SHA-256 `73AEAFC47B6CBC4588F4896B43DC0580603F8B7EC1F124CB8E607C64E597908C`.
- The context snapshot from 09:26 still contains the original Gallery-based selector. The SDK v2 ZIP bytes are not available in this follow-up's source input. Its reported lifecycle changes are not asserted to be present on disk.

## Observed failure and decision

The user reported an empty basemap selector under `@arcgis/core`,
`@arcgis/map-components`, and `@esri/calcite-components` 5.2.1. Browser
console traces show `arcgis-basemap-gallery` failing during rendering with
`TypeError: Cannot read properties of null (reading 'state')`. The exception
is directly related to the Gallery UI; it does not prove whether the problem
originates in SDK 5.2.1, the component's lifecycle, or the application's
MapView/component integration.

The prior `arcgis-basemap-gallery` + `arcgis-expand` decision is superseded
**only for DataCatalogue's basemap selector**. Replace these two components
with an application-owned native button and radio choices, using a public
`calcite-icon`. Keep `Map`/`MapView`, `view.ui.add`, and the existing
`createBasemapSettings` service unchanged. The settings service is already
the authority that updates every registered `Map.basemap` value and manages
manual selections, theme defaults, persistence, and available choices.

The selector does not import or initialize Basemap Gallery components, a
Basemap Gallery widget, or a LocalBasemapsSource. It needs no asynchronous
component readiness, does not instantiate ArcGIS layers, and introduces no
additional dependency or backend API. Style rules live in the feature's
`basemapSelector.css` and are loaded through `src/main.js`, avoiding edits to
the uncommitted `src/styles/map.css`.

## Preserved behavior

- Four configured choices with an API key: Topographic, Oceans, Dark Gray, Human Geography Dark; the final choice is omitted without an API key.
- The same settings instance synchronizes the main-map and Package assignment maps.
- Theme changes affect only automatic defaults. A manual choice remains selected until the existing Preferences reset.
- Persistence and storage failure behavior stay in `basemapSettings.js`.
- The control remains in `MapView.ui` at `top-right`, index `1`; assignment Retry stays at index `2`.
- Native button/radio semantics, focus restoration after selection/Escape, outside-pointer dismissal, keyboard focus exit, and teardown on route/view replacement.
- Light/dark colors use existing semantic `--dc-*` tokens. Reduced motion requires no special animation handling because no animation is added.

## Local verification

From `src/DataCatalogue`:

```powershell
npm run format
npm run check
npm ls @arcgis/core @arcgis/map-components @esri/calcite-components
```

All three ArcGIS/Calcite dependencies should remain at `5.2.1`; do not
regenerate `package-lock.json` merely to apply this source-only change.

In a real browser:

1. Start frontend and backend and reload `/`; use DevTools Network to confirm the correct environment-specific API base. Backend 404 errors are separate from this basemap selector fix.
2. Open the icon beneath Zoom. Confirm that all entitled options have visible labels and the current choice is selected.
3. Select Oceans, navigate to `/assignments`, and confirm the map uses Oceans and its selector reflects the choice.
4. Switch light/dark theme; verify automatic defaults when there is no manual override, and retained manual choice when there is one.
5. Use Preferences to reset the manual basemap, then verify the expected theme default on both maps.
6. With the selector open, press Escape, Tab away, click outside, switch routes, and use assignment Retry map. Confirm the selector closes and returns focus only when appropriate.
7. Repeat on both themes and on a narrow desktop viewport. Confirm no Basemap Gallery `null.state` exception and no duplicate controls after repeated navigation.
8. Confirm original map zoom, Workspace overlays, selection, Package workflow, and MapView position persistence still function.

## Verification boundary

The accompanying delivery report records automated checks actually executed
against the source archive. No SDK-backed browser rendering is available in
the delivery environment; the real 5.2.1 runtime result remains a local
acceptance criterion. No backend, auth, IIS route, or ProductCatalogue code
is changed in this follow-up.
