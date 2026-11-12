# DC-SDK-02 — Basemap authorization and Gallery theme validation

Date: 2026-11-11  
Repository: `S-100-BlueStack/S100Services`  
Source baseline: `6388ee0d60eb72144c2b21a1353c0532295dd880`  
Scope: `src/DataCatalogue` frontend only

## Evidence and changes

The source baseline uses `VITE_ARCGIS_BASEMAP_API_KEY` to decide whether
Human Geography Dark should be probed, but the default `Basemap.load()` check
never sends that value to the SDK. The comparable ProductCatalogue configuration
uses `esriConfig.apiKeys.basemapStyles`; this is an ArcGIS public API specifically
for Basemap Styles and does not configure the Catalogue HTTP client or Windows SSO.

The corrected access probe loads `arcgis/human-geography-dark` using the
trimmed public browser key on a **class-specific** `BasemapStyle.apiKey`. Only
after that succeeds and the owning settings lifecycle confirms it is still
active does it set `esriConfig.apiKeys.basemapStyles` for later Gallery and Map
requests. A rejected key therefore never replaces the SDK
global key and cannot interfere with the normal basemaps. A successful probe
reveals the fourth choice or restores a saved selection; failure is reported
without including the token and leaves the other three styles available. One
app-scoped check is shared by both maps, and teardown guards remain intact.

The selector receives both the basemap ID and theme mode from settings and sets
`color-scheme` explicitly on its host, public Esri Expand, and Basemap Gallery,
at first mount and on every actual theme change. The standard Calcite 5.2 mode
contract is used; no deprecated mode class, shadow DOM access, widget fallback,
MapView recreation, or dependency upgrade is introduced.

## Automated checks

- Verify the key is set on `BasemapStyle.apiKey` before `Basemap.load()`,
  then globally after success, without modifying
  `esriConfig.apiKey` or `apiKeys.scopes`, and never after settings teardown.
- Verify missing credentials fail without loading SDK modules; failed service
  loads do not publish a protected style or overwrite the global key.
- Verify two registered Map instances cause one validation and receive one
  normalized key.
- Verify Gallery and Expand switch light → dark → light in place without
  losing active selection, expansion state, or component identity.
- Verify an in-flight module initialization and MapView replacement use the
  latest theme and discard stale component instances.

These Node tests use controlled SDK boundary doubles. They do **not** prove
real Esri network requests or the browser's computed colors.

## Required local browser acceptance

1. From `src/DataCatalogue`, run `npm run format` then `npm run check`.
   Verify no new dependencies or lockfile edits are required.
2. Configure a browser-approved API key in an uncommitted Vite environment
   (`VITE_ARCGIS_BASEMAP_API_KEY`) and rebuild/restart. Do not paste or log
   the value. Open the main map and Package assignment. In Network, confirm
   successful Basemap Styles access without a separate verification for each
   MapView. The protected style should be the fourth choice on both views.
   Select it and confirm the basemap loads rather than merely being listed.
3. Verify the ArcGIS key credential allows Basemap Styles access and the
   _actual DataCatalogue browser origin_ in its referrer restrictions. A key
   that works in ProductCatalogue may still be restricted for this origin.
   An HTTP 401/403 should be diagnosed with status and request path only; do
   not include token-bearing query strings or headers in reports.
4. With the Gallery **open**, switch Preferences light → dark → light. The
   entire Gallery and Expand surface, including floating content, should
   follow the app theme without a full page reload. Repeat with the Gallery
   closed and with both main and assignment MapViews.
5. Select Oceans manually, switch themes and routes, and verify that the
   selected basemap remains Oceans until Preferences `Use theme default` is
   chosen. Test both theme defaults after reset. Check Escape, focus return,
   normal MapView zoom tools, and rapid view/Retry map transitions.
6. Repeat without a key and with a deliberately invalid or unauthorized key:
   the map must start with normal defaults, the protected option must not be
   exposed, and a non-sensitive notice may appear. The other three basemaps
   must remain usable; no repeated validation or `null.state` error.
7. Confirm the current test-server Catalogue API behavior and its blank
   `api_target` configuration are unchanged. This change only affects Esri
   basemap requests, not Catalogue API routing, CORS or Windows SSO.

## Limits and rollback

Browser authentication, real CSS inheritance inside Esri's floating panel,
referrer policy and IIS deployment cannot be verified from source snapshots.
If Esri 5.2.1 still renders a stale floating theme, capture the computed
`color-scheme` on the **public host elements** and the browser console, without
accessing private component shadow roots. Revisit component lifecycle only
with that evidence; do not replace the gallery with a custom selector.

Rollback: restore the baseline `basemapSettings.js` and
`createBasemapSelector.js` together with their relevant tests and documentation.
No server changes or stored credential migrations are required.

## Official SDK references

- [ArcGIS authentication and API keys](https://developers.arcgis.com/javascript/latest/authentication/access-tokens/)
- [ArcGIS BasemapStyle class API key](https://developers.arcgis.com/javascript/latest/references/core/support/BasemapStyle/)
- [ArcGIS config API key scopes](https://developers.arcgis.com/javascript/latest/references/core/config/)
- [Calcite 5.2 mode migration](https://developers.arcgis.com/calcite-design-system/releases/v5-2/)
- [Calcite mode behavior](https://developers.arcgis.com/calcite-design-system/core-concepts/)
- [ArcGIS Basemap Gallery component](https://developers.arcgis.com/javascript/latest/references/map-components/components/arcgis-basemap-gallery/)
- [ArcGIS Expand component](https://developers.arcgis.com/javascript/latest/references/map-components/components/arcgis-expand/)
