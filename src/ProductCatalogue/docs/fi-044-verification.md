# FI-044 verification and manual checklist

Status: **Done**.  
Implementation commit: `79616f8af0cda91db8e4b1fa90c0248aef4fef41`.  
Accepted merged baseline: `82f69c1d082773c110b48404d716d99cdc32de02`.  
No dependency or lockfile changes were made.

## Authoritative input

- Baseline: `a45317fd4968e0aef543014049d312060763d52d`.
- Archive: `FI-044-baseline-a45317fd.zip`.
- Archive SHA-256: `5DFF71B6C8765D0B0569042242F3E30AC35729B8C5CEAEA1F9BE6AAC2CF82D68`.
- Context: `FI-044-context-a45317fd.md`.
- Context SHA-256: `EB5243D314EEBEBE2EE47ECA36A9C00A2E6A430B8D99A4A9A2998B8FA22355C2`.
- Both hashes matched the supplied manifest before implementation. Only that archive supplied repository source.
- FI-044 v1 controlled input SHA-256: `94D59F3265F71C145B49FBB789DB087F00D499D4C0C70D1E977F2B5E4425085F`.

## Ownership and behavior

The visible panel presents **Theme** as a standard switch row with a Light `brightness` icon on the left and Dark `moon` icon on the right, followed by Main-map-only Scale hiding when its capability is supplied and then Saved preferences. The Introduction replay is separated from settings as a real secondary button at the bottom of the panel. The redundant Introduction and Settings headings are removed. Introduction retains the existing onboarding callback/lifecycle and keeps its explanation in `title` hover help. FI-043 remains deferred.

`themeService.js` remains the only Theme owner. `displayScaleOverrideState.js` remains the only
Scale hiding owner. `preferencePersistenceState.js` retains Auto-save enablement. The existing
per-domain storage owners retain their storage keys, formats and persistence behavior. Preferences
adds no saved-value store or status layer. No source-selection storage is enumerated or cleared.

| Action                          | Current state                                                       | Saved state                                                |
| ------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| Theme switch toward Dark/Light  | Applies Dark/Light immediately through Theme service                | Theme is saved only when Auto-save is enabled              |
| Scale hiding ON/OFF             | Applied immediately by Scale hiding owner                           | Existing inverse boolean saved only when enabled           |
| Auto-save OFF                   | Unchanged                                                           | Existing owner removes its record                          |
| Auto-save ON                    | Unchanged                                                           | Existing owner saves/schedules the current value           |
| Reset Theme to Light            | Light                                                               | Light is saved when Auto-save is enabled; otherwise absent |
| Reset Scale hiding to OFF       | OFF                                                                 | Saved record removed, without rewriting the OFF value      |
| Reset map view                  | Accepted default viewpoint                                          | Existing viewpoint save policy retained                    |
| Reset filters                   | Declarative first-visit defaults restored, including Idle exclusion | Existing filter save policy retained                       |
| Reset Dashboard page size to 50 | 50                                                                  | Saved record removed                                       |

Auto-save is the sole saved-state control. OFF removes only the selected preference's stored value
while leaving runtime and unrelated preferences unchanged. ON retains the owner's existing behavior.
No explicit clear action or detailed Saved/Not saved/value presentation remains.

The aggregate reset retains its existing scope: Main map resets viewpoint, filters, Scale hiding,
source defaults and Theme; Dashboard resets Theme and page size; Analyze/Review reset Theme.
Auto-save choices are not reset. There is no new global clear or confirmation flow.

Theme renders as one standard `Theme` setting row using a public `calcite-switch`: OFF is Light and ON is Dark. Public `brightness` and `moon` icons flank the switch to make both endpoints visible without extra text. `themeService.js` remains the only owner; the switch changes Theme immediately and stays focused without rerendering the panel. Introduction is no longer visually grouped with Theme and is rendered as a separate bordered secondary button at the bottom.

`initMap.js` injects `createMainMapPreferences`. Shared Preferences has no transitive Main-map
imports. `bootstrap.js` loads Main-map startup/initial-data modules only in its Main-map branch.
The non-main import-graph test excludes Main-map Scale hiding state and filter runtime services;
Analyze's existing shared stateless map utilities and its own map lifecycle remain available.
Three bootstrap execution tests prove Analyze, Review and Dashboard do not request Main-map
startup while opening the shared Preferences surface.

Opening focuses the Theme switch, the first runtime setting. Theme, Auto-save and Reset update existing elements, keeping focus. Context replacement restores the application's focus identity. Main-map Escape
priority remains with its existing coordinator; workspace Escape closes the panel and returns
focus. Trigger close also returns focus; outside click preserves the destination focus.

## Navbar correction

Route state was already truthful: `applyNavbarRouteState` removes the previous `aria-current` and
sets exactly one destination link. The visual regression came from `header.css`, where hover,
`:focus`, `:active` and `[aria-current="page"]` all used the same underline. A clicked link can retain
focus after navigation, so it continued to look current despite having no `aria-current`.

Route state remains exclusive to `[aria-current="page"]`. Pointer hover now restores the same compact underline as interaction feedback, and keyboard `:focus-visible` uses that underline instead of a full-link outline. Plain `:focus` does not add an underline, so a clicked old route cannot continue to look current after navigation. No `blur()` or focus removal is used. A transition test applies Main then Analyze state to the same navbar, retains focus on Main, and proves only Analyze remains semantically current; a CSS contract test proves hover/focus-visible feedback does not alter `aria-current` ownership.

## Automated verification

Runtime: Node.js `v24.19.0`; no packages installed.

| Check                                                                                                         | Result                                                               |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| V2 Preferences/Theme/Auto-save/focus/bootstrap tests                                                          | 15 passed, 0 failed                                                  |
| V2 focused regression selection, 27 test files                                                                | 186 passed, 0 failed                                                 |
| V2 complete Node test suite, summary reporter                                                                 | 867 tests: 863 passed, 4 failed; 0 skipped/cancelled                 |
| V2 baseline reproduction of the four failures                                                                 | Same four failures reproduced; 12 selected tests: 8 passed, 4 failed |
| V4 focused attribute-filter service suite                                                                     | 22 passed, 0 failed                                                  |
| V4 `node --check` on JavaScript files packaged in the correction candidate                                    | 12 passed                                                            |
| V5 `node --check` on JavaScript files packaged in the correction candidate                                    | 12 passed                                                            |
| V5 focused source-contract assertions for navbar hover/focus and stacked quick actions                        | Passed                                                               |
| V6 focused Preferences contracts for Dark mode switch and bottom Introduction utility                         | Passed                                                               |
| V7 focused Preferences contracts for Theme label, Light/Dark endpoint icons and secondary Introduction button | Passed                                                               |

The V2 focused selection covers shared navigation, Theme persistence, Scale hiding, filters,
source-selection recovery, app routing/bootstrap contracts, onboarding lifecycle, Dashboard
page-size reset, FI-040 interaction/hint tests and the navbar popover coordinator. The V4 focused
filter suite additionally proves that Preferences Reset restores declarative defaults and clears
pending snapshot intent, while Filter-panel Clear all keeps its separate explicit-unfiltered contract.

The four full-suite failures are unchanged baseline/environment findings:

1. `range controls keep keyboard time editing local until the range interaction commits`:
   its source-text regular expression requires LF where the authoritative Dashboard source has
   CRLF. Both that test and its target source are unchanged by FI-044.
2. `ProductCatalogueAPI registers only the retained source mocks behind the environment/configuration gate`:
   the frontend-only archive does not include `src/ProductCatalogueAPI/Program.cs`.
3. `ProductCatalogueAPI embeds only the retained source-specific mock fixtures`:
   the archive does not include `src/ProductCatalogueAPI/ProductCatalogueAPI.csproj`.
4. `Development mock fixture files normalize to globally unique source datasetNames`:
   the archive does not include `src/ProductCatalogueAPI/mock/paper-charts.geojson` and associated fixtures.

The Node behavior harness exercises real application state owners and shared panel logic with
application-owned DOM doubles. ArcGIS CSS URLs and notice presentation are substituted; this
is not a real Calcite/ArcGIS browser test. Import-graph checks inspect actual local source.

The V5 changed-files ZIP does not contain the complete baseline import graph, so this chat did not rerun
the focused Node suites that require unchanged files such as `src/shared/config/layerIds.js`. The V4
22/22 filter-service result remains applicable because V5 does not change filter runtime code.

In the implementation environment, `npm run check`, Prettier, ESLint and Vite build were not available because project `node_modules` was absent, and browser rendering was not available because the Playwright package had no Chromium executable. No dependency or browser installation was attempted there.

During final local acceptance, formatting was run and `npm run check` passed before commit.

## Manual browser checklist

### Main map

- Open Preferences; verify `Theme` is the first compact runtime setting with sun/Light and moon/Dark endpoint icons, Scale hiding follows on Main map, Saved preferences remains separated below, and Start introduction appears as the bottom secondary button.
- Toggle the Theme switch toward Light/Dark; verify appearance applies immediately and focus remains on the switch.
- Replay Introduction from the bottom secondary button and confirm the existing onboarding lifecycle still owns focus/guidance.
- Toggle Scale hiding ON/OFF; verify map visibility and an independent Auto-save setting.
- Turn Theme Auto-save OFF while Dark; confirm Dark remains current and reload falls back according to the accepted Theme contract.
- Turn Scale hiding Auto-save OFF while ON; confirm ON remains current, then Reset to OFF without changing Auto-save.
- Exercise Map view and Filters Reset with Auto-save both ON and OFF; Filter Reset must restore the default Idle exclusion, not the Filter panel Clear all state.
- Exercise the scoped aggregate reset; confirm its displayed source-selection scope matches behavior.
- Close/reopen; Tab/Shift+Tab; Escape; focus return; outside-click destination focus.
- While the panel remains open, check that a setting update/reset does not replace the active control.

### Shared workspace routes

Perform each row independently:

| Route     | Checks                                                                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analyze   | Theme switch with Light/Dark endpoint icons available; no Scale hiding control or Main-map startup; Introduction, keyboard/focus/Escape work       |
| Review    | Theme switch with Light/Dark endpoint icons available; no Scale hiding control or Main-map startup; Introduction, keyboard/focus/Escape work       |
| Dashboard | Theme switch with Light/Dark endpoint icons and page-size Reset available; no Scale hiding control or Main-map startup; keyboard/focus/Escape work |

### Persistence

- With Theme Auto-save ON, save Dark, reload and confirm Dark.
- Disable Theme Auto-save; confirm removal without changing current Theme; reset to Light without a saved record.
- Save both valid Scale hiding choices; reload Main map and confirm restoration.
- Disable Scale hiding Auto-save while ON, then Reset separately; reload and confirm OFF when no valid saved choice exists.
- Disable/re-enable each supported Auto-save choice; confirm current state remains unchanged and Reset never toggles Auto-save.
- Smoke-test malformed and legacy Scale hiding values (`true`, `false`, missing and invalid) in a disposable browser profile.
- Confirm Auto-save OFF does not touch source selection, other saved preferences or unrelated current settings.

### Regression and visual checks

- Navigate between all shared routes by pointer and keyboard; verify exactly one truthful `aria-current` route, underline feedback on hover/focus-visible without a full-link outline, and no extra settling click.
- Main-map source selection and FI-031 reload recovery; ordinary filters/source refresh do not toggle Scale hiding.
- FI-040 shortcut hint, map-focused keyboard selection and FI-021 modifier-click selection.
- Light/dark, narrow viewport, browser zoom, scrolling, visible focus and accessible action names.
- No onboarding-content changes; FI-043 remains pending.

## Delivery

The final FI-044 implementation was manually accepted and committed at `79616f8af0cda91db8e4b1fa90c0248aef4fef41`. The accepted implementation includes the final V7 runtime/UI behavior plus the V8 test-contract update; no runtime behavior changed in V8. The later merge commit `82f69c1d082773c110b48404d716d99cdc32de02` preserves FI-044 together with colleague changes and is the authoritative post-FI-044 repository baseline.

Manual acceptance confirmed the final navbar hover/current-route underline behavior, Theme switch with Light/sun and Dark/moon endpoints, secondary Start introduction button, route-safe shared Preferences, independent Auto-save/Reset semantics, and Filters Reset restoring the conservative Idle exclusion. Local frontend check passed and formatting was run before commit.
