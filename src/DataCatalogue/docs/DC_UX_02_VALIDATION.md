# DC-UX-02 — UI Consistency Validation

Date: 2026-11-09  
Implementation source: `6f38fdb67fcaebfc06b852291718b8d3f474c4c2`  
Frontend: `src/DataCatalogue`  
Design reference: `src/ProductCatalogue`, exported at the same commit

## Scope

- Match ProductCatalogue's compact, 50px navigation, active route indicator,
  action sizing and neutral action states without changing DataCatalogue routes.
- Align the Preferences floating surface, typography, grouped settings and
  switches while preserving DataCatalogue's own persistence semantics.
- Preserve Package assignment, Packages main map, MapView lifecycle, saved
  Pipeline summaries, Workspace previews, comments and Save guards.
- Do not modify backend contracts, authentication, npm dependencies or
  ProductCatalogue source. No new demo content or unverified API behavior.

## Visual and interaction checks in a local browser

1. Compare navbar height, logo alignment, active underline, icon spacing,
   Preferences active state and updated timestamp with ProductCatalogue at
   100% and 125% browser zoom. Check both Package assignment and Main map.
2. Open Preferences from both routes in light mode. Confirm the panel anchors
   below the gear icon, fits a short laptop viewport, and uses a compact
   surface, grouped rows, subtle hover states and matching shadows.
3. Switch between Light and Dark. Check the active map's basemap automatically
   tracks the theme only when a manual basemap was not selected. Confirm
   both maps remain mounted and the basemap gallery keeps its manual choice.
4. Turn each Auto-save choice on and off independently. Verify that disabling
   Basemap, Map view or Theme clears only its own saved value. Verify a refresh
   restores only opted-in values, and changing a live session value still works
   when its persistence is disabled.
5. Select a non-default basemap and use `Use theme default`. Confirm the reset
   action becomes disabled and the theme itself does not change.
6. Keyboard-only: Tab/Shift+Tab through navbar controls; open Preferences,
   toggle each switch with Space/Enter, close with Escape and Close, and check
   that focus returns to the Preferences action. Click outside and ensure the
   clicked target still activates normally. Verify no focus theft on rerender.
7. Test widths 1280px, 900px, 760px and 400px, a low-height viewport, and
   `prefers-reduced-motion`. The panel must remain usable without horizontal
   overflow and must not cover the underlying map permanently.
8. Regression-check Main map Packages, reversible `Done` / `No update`, list
   filters, all map controls, and Package assignment (search, pagination,
   Pipeline/Workspace draft selection, comment drafts, cached saved summaries,
   guarded Save and detail/map selections).
9. Check that opening/closing Preferences, switching themes and resizing does
   not create new Package/Workspace API requests or recreate either MapView.

## Automated checks

- Focused preferences component tests cover grouped structure, accessible
  switches, theme events, independent Theme Auto-save, basemap reset, Escape,
  outside pointer dismissal, viewport anchoring and teardown.
- The existing theme, basemap and preference storage suites remain in place.
- `node --check` and `node --test` can run without an SDK browser runtime.
- Full local acceptance requires `npm run check` from `src/DataCatalogue` with
  the project's installed dependencies, followed by the manual browser tests.

## Limitations

The source ZIP represents the exported commit `6f38fdb...`, while the user
also reported the earlier commit `b6b596f...`. Both values are recorded,
without claiming to have verified their Git ancestry. The exporter has no
runtime browser capture or installed dependencies. Passing Node tests does not
prove actual Calcite rendering, responsive placement or SDK map behavior.

## Executed verification in the candidate environment

| Check                                                             | Result                                                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Handoff archive checksum                                          | Matched the adjacent `.sha256` file                                                                   |
| Export inventory                                                  | All **776/776** source files matched the pinned SHA-256 manifest                                      |
| Focused Preferences, theme, storage and basemap tests             | **28 passed**, 0 failed                                                                               |
| Available Node tests (excluding three SDK-dependent import files) | **413 passed**, 0 failed                                                                              |
| Full `node --test` discovery                                      | **413 passed**, **3 module-load failures** (`@arcgis/core` not installed); no test-assertion failures |
| `node --check` on the four changed JavaScript files               | **4 passed**                                                                                          |
| `npm run check`                                                   | Stopped at `format:check`: `prettier: not found` (no `node_modules` in the export environment)        |
| ESLint, Vite build, browser and live SDK validation               | Not run in this environment                                                                           |

No package manager installation, dependency/lockfile change, backend edit,
ProductCatalogue edit, remote repository access or commit was performed.
