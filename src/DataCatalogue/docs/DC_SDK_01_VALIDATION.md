# DC-SDK-01 — ArcGIS and Calcite 5.2 verification

Date: 2026-11-10 (Europe/Copenhagen)

## Scope and authority

- Repository: `S-100-BlueStack/S100Services`
- Frontend: `src/DataCatalogue`
- Sole source baseline: `22e2ff7da5578f26559189eca06c9118e8227bfe`
- Input: commit-pinned `git archive` export, SHA-256 verified for all 276 source files
- This is a proposed frontend implementation, not evidence of local acceptance.
- Do not modify `src/ProductCatalogue`, backend code, API contracts, or IIS auth.

## Dependency upgrade

The 5.2.1 versions of all three packages were confirmed against their published
npm version listings on 2026-11-10. Upgrade using npm only:

```powershell
Set-Location src/DataCatalogue
npm install --save-exact @arcgis/core@5.2.1 @arcgis/map-components@5.2.1 @esri/calcite-components@5.2.1
npm run format
npm run check
npm ls @arcgis/core @arcgis/map-components @esri/calcite-components
```

The candidate includes the updated `package.json`, but **does not** include a
hand-edited `package-lock.json`. Run `npm install` after extracting the candidate
and commit npm's generated lockfile only after tests pass. If npm reports a
peer-dependency conflict, preserve the error and stop; do not use `--force` or
`--legacy-peer-deps` to mask an incompatibility.

## Public API compatibility decisions

- Retain programmatic ArcGIS `Map`/`MapView` and its lifecycle, layers, popups,
  highlights and view persistence. A migration to `arcgis-map` is separate.
- Retain `arcgis-expand` and `arcgis-basemap-gallery` public map components.
  Esri still documents `LocalBasemapsSource` from
  `@arcgis/core/widgets/BasemapGallery/support/LocalBasemapsSource.js` for a
  local basemap collection. This is a _support class_, not widget UI code.
- Replace Calcite Action Bar's deprecated `expandDisabled` with
  `expandToggleDisabled` and `overflowActionsDisabled` with
  `overflowMode = "none"`. Test the docked 48px Action Bar in both themes.
- Replace Calcite's deprecated `calcite-mode-dark/light` classes by the
  existing `documentElement.style.colorScheme` and app-owned `data-theme`
  selectors. Preserve shared Preferences theme state and opt-in persistence.
- Do not change old `--calcite-color-background` / `--calcite-color-foreground-*`
  styling tokens blindly. The published replacements are `surface-1`,
  `surface-2`, `surface-3` and `surface-4`, respectively. Their current local
  usage includes component-level overrides that require browser QA before
  migrating. Track that before taking the 6.0 major version.

## Verification performed in the delivery environment

Document exact results in the separate delivery report. The environment does
not provide the repository's npm dependencies and cannot run SDK/WebGL browser
integration. No lockfile, build, linter or npm dependency resolution result may
be inferred from static tests.

## Local browser acceptance matrix

1. **Startup:** hard reload each route `/` and `/assignments`; check Vite console
   for missing ArcGIS/Calcite modules and accessibility warnings.
2. **Maps:** open both maps, check basemaps, zoom controls, correct map sizes,
   Workspace graphics/labels, light/dark tiles, and movement without blanking.
3. **Basemap Gallery:** open/close and choose each supported basemap in both
   themes; verify the other workflow's basemap is synchronized and its
   user override persists only per existing Preferences settings.
4. **Action Bar:** verify fixed compact width, Pipelines/Jobs toggles, no
   expand chevron or overflow menu, keyboard Tab/Enter/Escape, map size stable.
5. **Jobs:** load and refresh, open Job popups, select/clear highlights,
   cluster if available, change scoped mock statuses and preserve focus.
6. **Package assignment:** switch Packages rapidly, verify details/loading,
   saved/draft bindings, comment dialogs, Save/Discard, map overlays, and stale
   responses never overwrite newer selections.
7. **Preferences:** switch dark/light (including automatic system preference),
   verify independent opt-in storage, map position, basemap, and panel focus.
8. **IIS:** rebuild/deploy under the real virtual directory and SSO setup;
   verify `/branding/Logo.png` and `/branding/Favicon.png`, SPA navigation,
   lazy-loaded SDK assets, and absence of unexpected 401/404/500 errors.
9. **Error states:** simulate failed/slow API response, map render failure,
   retry and quick route switching; verify no false success or duplicate reads.
10. **Quality gate:** retain full `npm run check` output, `npm ls` output,
    browser console findings, installed package versions, commit and lockfile.

## Remaining 6.0 review before major-version adoption

- Recheck Esri's final 6.0 removal/breaking-changes documentation when released;
  do not promise forward compatibility based solely on a successful 5.2 test.
- Review remaining Calcite deprecated background/foreground tokens and old
  style selectors with light/dark visual comparison.
- Reverify the documented `LocalBasemapsSource` import path under 6.0;
  migrate only if the supported map-component source contract changes.
- Review any future deprecation guidance for programmatic `MapView`; the
  current project explicitly retains that architecture for the 5.2 update.
- Validate IIS build assets, authentication boundaries and browsers on the
  actual new major version rather than relying on static analysis.

## Authoritative external references

- https://www.npmjs.com/package/@arcgis/core
- https://www.npmjs.com/package/@arcgis/map-components
- https://www.npmjs.com/package/@esri/calcite-components
- https://developers.arcgis.com/javascript/latest/references/map-components/components/arcgis-basemap-gallery/
- https://developers.arcgis.com/calcite-design-system/releases/v5-2/
- https://developers.arcgis.com/calcite-design-system/core-concepts/
- https://developers.arcgis.com/calcite-design-system/foundations/tokens/reference/
