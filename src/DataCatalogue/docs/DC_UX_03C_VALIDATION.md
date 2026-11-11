# DC-UX-03C — Pipelines panel hierarchy and Workspace scrolling

Date: 2026-11-11
Authoritative baseline: `5e3350778e98eb7997a628ea9af00e7878a5cee7`
Scope: main-map Pipelines panel only; no backend, API, auth, dependency or MapView changes.

## User-visible behavior

- Pipeline headers now have a distinct theme-aware surface, vertical accent and
  compact Workspace count; subordinate Workspace rows have a quieter background,
  indent, and separators. There is no extra explanatory copy.
- Every Workspace remains in the DOM and retains its own visibility checkbox.
  For long groups, a dedicated child region scrolls within a ~12.25rem height
  while the Pipeline header stays visible. Groups with more than six Workspaces
  give keyboard users an explicitly labeled scroll stop; shorter groups do not.
- Pipeline disabling still disables all child controls without clearing their
  saved checkbox choices. Reload preserves existing Pipeline and Workspace
  exclusions. The complete Package membership and map-side overlay lifecycle
  remain independent of display visibility.
- The native checkbox/label pattern stays in use; no private Calcite styles,
  additional UI widgets or new persistence are introduced.

## Actual candidate verification

- The provided ZIP's external SHA-256 matched. All 50 source-file SHA-256 values
  and Git-blob IDs matched the baseline manifest.
- Focused Node tests: 7/7 passed directly with the supplied dependency-free
  modules. The larger three-file focused set passed **16/16** in an isolated test sandbox
  with clearly identified stand-ins for three unavailable imports
  (`collectPages`, the live Jobs adapter and the Job-status helper), so its
  result validates the real renderer and test assertions, **not** those missing
  service implementations. The exact result is also recorded in the delivery
  report.
- `node --check` passed for the modified JavaScript and its tests. PostCSS
  parsed the changed `map.css` successfully.
- `npm run check` was attempted but stopped before lint, tests and build because
  `prettier` was not installed in this environment. No browser/IIS/ArcGIS
  verification was run here.

## V2 correction: full-suite fixture compatibility

- The user-reported Windows `npm test` execution of the original candidate
  completed **466/468 tests**, with two failing in
  `createPipelineVisibility.test.js`: the 6/7 Workspace focus threshold and the
  18-Workspace selection test. Both fixtures omitted the normalized Workspace
  `key`, causing the real `collectPages` duplicate-identity guard to reject
  their input before the renderer produced Pipeline groups. The resulting
  `.children` exception was a secondary test symptom, not evidence of a broken
  Pipeline UI.
- V2 supplies a unique `key` in the same composite format as
  `normalizeWorkspace`, and checks successful catalogue loading before DOM
  assertions. Production JavaScript and CSS are unchanged from V1.
- The V1 failures were reproduced locally with the actual `collectPages`
  implementation extracted from the previously verified API context. V2's
  focused results are recorded in the correction delivery report. A full
  Windows `npm run check` and browser acceptance are still required.

## Local automated checks

From `src/DataCatalogue` after applying the candidate:

```powershell
npm run format
npm run check
```

Relevant focused checks include
`src/features/map/workspaces/createPipelineVisibility.test.js`,
`src/features/map/workspaces/pipelineVisibility.test.js`, and
`src/app/ui/createMapWorkspace.test.js`.

## Manual browser acceptance

1. Open Main Map > Pipelines in light mode. Confirm each Pipeline header remains
   visually separate from its Workspaces and that the group remains compact.
2. Open a Pipeline with roughly 18 Workspaces (such as Paper Charts). Scroll
   inside that Pipeline's Workspace group; the Pipeline header must stay visible,
   other Pipeline groups must not move unless the outer panel itself scrolls,
   and every Workspace must remain reachable.
3. With Tab and Shift+Tab, focus the long Workspace region and scroll it with
   arrow keys / Page Down. Tab into Workspace checkboxes and toggle with Space.
   Confirm no extra scroll Tab stop in a short (one-to-six Workspace) group.
4. Disable a Pipeline and re-enable it. All child checkboxes should temporarily
   disable without losing earlier individual selections; map coverage changes
   only with the chosen visibility state, not with list scrolling.
5. Refresh/reload the page and check both short and empty Pipelines, long labels,
   and large/small desktop heights. Verify no hidden or clipped actions.
6. Repeat in dark mode, and after switching between Pipelines and Packages.
   Confirm panel switching does not resize the MapView or change Package state.
7. Inspect Network to ensure scrolling, hover and checkbox changes do not
   trigger Package/Workspace refetches; a real catalogue reload retains its
   existing requests/selection behavior.

## Verification boundary

This candidate does not assert any real browser, Vite build or full `npm run
check` outcome until those commands are actually executed. Browser checks
require a real ArcGIS/Calcite runtime and populated Workspace catalogue.
