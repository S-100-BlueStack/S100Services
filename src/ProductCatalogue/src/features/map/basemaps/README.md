# Basemap selection (Main Map and Analyze)

This feature adapts the verified DataCatalogue Basemap Gallery pattern from commit
`2972cd6356c502a963342122bcbd48a321670eb9` to ProductCatalogue's existing
ArcGIS `Map` / `MapView` lifecycle. It does **not** switch to the `arcgis-map`
component or change source-owned AOI layers, Product filters, popup selection or
navigation.

## Choices and theme behavior

| Choice               | Basemap ID                    | Requires a basemap-styles API key |
| -------------------- | ----------------------------- | --------------------------------- |
| Topographic          | `topo-vector`                 | No                                |
| Oceans               | `oceans`                      | No                                |
| Dark Gray            | `dark-gray-vector`            | No                                |
| Human Geography Dark | `arcgis/human-geography-dark` | Yes                               |

- Before a manual choice, the Light application theme selects Topographic and
  Dark selects Dark Gray. Changing the theme updates only this automatic default.
- A manual choice overrides the automatic default even when the selected basemap
  does not visually match the theme; it remains selected through theme toggles.
- **Preferences → Basemap → Use theme default** removes the manual override and
  immediately restores the basemap for the current theme. The reset does not
  change the Auto-save switch.
- **Preferences → Basemap → Auto-save** is on by default. Turning it off removes
  the saved browser choice while preserving the active session selection. Turning
  it back on persists the active manual choice.
- An unknown or unsupported saved choice is never treated as a valid manual
  selection. Without an API key, Human Geography Dark is not offered; existing
  Topographic/Oceans/Dark Gray choices continue working.

Selections are saved in `pc.basemapChoice.v1` only when the existing shared
Preferences persistence owner enables `basemap`. Main Map and Analyze use one
owner per map/page and the same storage key across navigation. Dashboard and
Review have no map and do not initialize basemap UI or show map-specific
Preferences controls.

## Component and cleanup boundaries

`initBasemapExperience.js` registers the selected basemap on the existing map
and adds its control beneath Zoom using the public
`view.ui.add([{ component, position: "top-left", index: 1 }])` API.
`map/controls/initZoomControl.js` now lazily registers `arcgis-zoom` through its
public `view` property at index zero. The built-in MapView Zoom widget is
removed with `view.ui.remove("zoom")` only after the replacement component
is ready; a failed import/readiness step keeps the working legacy Zoom widget.
At teardown the application-owned component is removed and destroyed. A
Theme change creates a fresh `arcgis-zoom` host with the new mode instead of
relying only on changing `color-scheme` on the first-rendered component. The
previous Zoom remains available until the replacement is ready; rapid theme
changes retire pending replacements before they can appear. Other MapView UI
elements (including Attribution) are not removed. Main Map and Analyze share
this ownership without replacing their Maps, MapViews or layers.

The selector uses the original `arcgis-expand` and `arcgis-basemap-gallery`
Map Components with the existing `MapView` exposed through their public `view`
properties. A `LocalBasemapsSource` lists the supported choices. Selecting a
basemap updates the existing settings owner and collapses the Expand component.
The gallery keeps the native ArcGIS/Calcite layout and keyboard handling.
The Expand uses its public `visualScale = "m"` property, matching the normal
Zoom-control scale.

The Theme owner maintains the existing Calcite mode on both the document root
and body, `color-scheme` on the root, and the Core CSS theme link needed for
legacy Core UI. The Zoom component receives the matching public `calcite-mode-*` class and
`color-scheme` on each newly mounted host. The native Basemap Gallery and
Expand receive the same public mode properties directly on their hosts. Both
component owners recreate their affected UI hosts on a real theme change to
avoid retaining first-render styling in the installed ArcGIS/Calcite 5.0
combination. Neither rebuild changes the Map, MapView, basemap choice or any
AOI layers. This is a compatibility mitigation pending browser verification,
not a confirmed SDK root-cause fix. No private Calcite/ArcGIS shadow-root
overrides are used.
The Expand trigger keeps its approved surface-alt hover color and box shadow.
An application-owned capturing `pointerdown` listener
collapses the gallery when clicking outside the control/content, but does not
cancel or intercept the outside click; map and popup interactions remain active.
Containment is checked using the event's composed path and public element
references, not private shadow DOM. The listener is removed on route teardown.
In particular, arrow navigation may activate a basemap and collapse the gallery;
there is no application-owned focus/selection staging behavior.

The Theme owner publishes a small subscription callback; the basemap owner
handles manual vs automatic semantics. Async component and view mounts have
lifecycle guards; old Gallery listeners are removed before a mode-driven
rebuild, and Zoom cannot remove the built-in control after teardown. Main Map
and Analyze call `destroy()` from their route cleanup. No new packages,
private ArcGIS/Calcite DOM access, or replacements of Map/MapView are required.

## Optional browser API key

In a **local ignored** Vite environment file (for example,
`src/ProductCatalogue/.env.production.local`), configure:

```dotenv
VITE_ARCGIS_BASEMAP_API_KEY=YOUR_BROWSER_BASEMAP_STYLES_KEY
```

The key is read centrally by `src/shared/config/arcgisBasemapConfig.js` and
assigned only to `esriConfig.apiKeys.basemapStyles` during the existing ArcGIS
startup configuration. The app does not set a global `esriConfig.apiKey`, add a
scope for the Product Catalogue API, or forward it to private ArcGIS services.

**Vite variables are embedded in the browser bundle and are not secret.** Use
only a browser-appropriate key with basemap-styles privileges, restricted
allowed referrers/domains, and suitable usage limits. Never commit an actual
key or upload it in context bundles. Build again when the value changes.

The selected style still depends on the network, Esri service availability,
key permissions, and browser restrictions. A configured but invalid key does not
prove the Human Geography Dark tiles will load. Verify with DevTools/Network in
both development and the deployed IIS origin. The selector does not intercept or hide basemap-service errors.

## Local verification

1. On Main Map and Analyze, confirm the native Basemap Gallery trigger remains
   below the Zoom controls and uses approximately the same control size. In
   both light and dark themes, check the floating panel background, item text,
   selection states and controls for appropriate contrast. Reload in each mode,
   switch Light → Dark → Light and Dark → Light → Dark without reloading, and
   confirm both control hover and Gallery panel colors follow the **current**
   theme. Compare the trigger's hover color to the new Zoom component. Click
   inside gallery/options without dismissing it; click the map, navbar or
   another control to dismiss it without blocking the underlying click. Test
   the gallery at desktop and narrow widths.
2. Toggle Theme before selecting a basemap (Topographic ↔ Dark Gray). Then
   choose Oceans or Human Geography Dark and verify theme changes no longer
   override the choice.
3. In Preferences, switch Basemap Auto-save off/on, reload, navigate Main Map →
   Analyze, and verify persistence, reset and Escape/teardown behavior.
4. Without an API key, verify Human Geography Dark is absent and the other
   three choices work. With a properly restricted key, verify Human Geography
   Dark tiles load; check that Product API requests receive no basemap key.
5. Verify the native gallery's keyboard/focus behavior in the actual ArcGIS
   browser runtime. The gallery may select during arrow-key navigation; this
   is an accepted component limitation. Ensure the existing Product popup
   Escape priority, Product search, Locator, AOI highlighting, filters,
   keyboard activation and Analyze layers do not regress.
6. If `arcgis-zoom` fails to load (for example, the component JavaScript chunk
   is unavailable), confirm the default MapView Zoom widget remains available.
   Verify zoom-in/out by pointer and keyboard, UI ordering, tab order, focus,
   cleanup on route changes and normal attribution. Confirm no duplicate Zoom
   controls once the component finishes loading.
7. Run `npm run format` and `npm run check` locally. Node tests alone do not
   prove ArcGIS component or service behavior in a browser.
