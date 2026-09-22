# FI-043 — Consolidated Introduction / onboarding refresh

Status: **Implemented; manual verification pending**.

## Authoritative input

Baseline: `d77ef7f656eece09c9d70a0f1903e9e406e7911d`.
The supplied archive and context were verified against both the manifest and task before editing:

| Input                        | Verified SHA-256                                                   |
| ---------------------------- | ------------------------------------------------------------------ |
| FI-043-baseline-d77ef7f6.zip | `73F7C51EEAD6FEFB4240C20AF71929A073554F41659B2D4843FACE5E9C89B09B` |
| FI-043-context-d77ef7f6.md   | `F271C7E103C7F4AB3C8D556A4B61BF4C6997EB8AE496739769F2124FC74407D4` |

Only this archive supplied repository files. No commit, dependency installation, remote repository
access, package manifest change or lockfile change was performed. Acceptance history through FI-044
is preserved. FI-027, FI-029 and FI-030 remain outside this change.

## Baseline inventory and decisions

Every existing step was inspected against the current application renderer and behavior. “Exists”
below describes the authoritative source, not a claim of browser visibility in all states.
Existing IDs/classes are application-owned contracts; no extra hidden targets are introduced.

| Route / old step           | Current target and visible label/icon                                           | Existence / placement / behavior                                                                                       | Usefulness, duplication and decision                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main / product-search      | Product search input and Locator button                                         | Both exist in map controls; still separate workflows, not the proposed FI-027 navbar design                            | Useful but combined guidance obscured the boundary; split into two steps and remove legacy selector aliases                                                               |
| Main / data sources        | `#data-sources-button` plus `.pc-data-source-panel`, Data sources / layers icon | Exists in the Main-map navbar; FI-031 permits all sources off for the current session                                  | Add current source-selection guidance, auto-open the existing panel for the step, and do not invent a minimum-enabled rule                                                |
| Main / filters             | `#filter-button` plus `#attribute-filter-panel`, Filters / filter icon          | Exists in navbar; default Idle exclusion and compact count apply                                                       | Retain; open the existing panel through its trigger so the user can see the controls, then target the panel itself                                                        |
| Main / map                 | Product-search container formerly anchored map guidance                         | Container exists but represents search; hover and normal overlap selection have evolved with FI-021/FI-040             | Anchor map interaction to `#viewDiv`; explain normal selection and add separate optional shortcut guidance; remove popup prerequisite                                     |
| Main / popup-actions       | Copy, Product Collection, action bar                                            | Conditional application popup content; capabilities govern actions; FI-029 not implemented                             | Retain conceptual action guidance at map interaction; remove dependency on popup internals and popup reopening loops                                                      |
| Main / product-collection  | Product Collection popup action, collection tray                                | Conditional action/tray; collection launches Analyze/Review                                                            | Retain explicit popup-to-tray workflow; tray or real map interaction is the anchor; remove mandatory collection mutation                                                  |
| Main / workspaces          | Dashboard, Analyze, Review links                                                | Shared navbar exists; Main-map launches open a new tab under FI-032                                                    | Move to first step; explicitly describe new-tab behavior                                                                                                                  |
| Main / theme               | Preferences / gear icon                                                         | Target exists, but FI-044 now has a Theme switch with Light/sun and Dark/moon endpoints                                | Merge old Theme-only explanation into runtime Preferences step; no navbar Theme action                                                                                    |
| Main / preferences         | Preferences / gear and `#preferences-panel`                                     | FI-044 separates runtime settings, Saved preferences, independent Reset and bottom Start introduction                  | Open the existing shared panel automatically, keep it open across runtime/Saved preferences steps, and target real panel content without duplicating settings ownership   |
| Dashboard / range          | From, To, compact date/time range and header actions                            | Exists in compact header; valid committed changes apply automatically                                                  | Retain automatic application, split Refresh and last-successful time into their own targeted step                                                                         |
| Dashboard / summary        | Read-only summary cards                                                         | Exists when Dashboard content is available; compact layout                                                             | Remove standalone step: self-explanatory and duplicated by activity/filter guidance                                                                                       |
| Dashboard / filters        | Activity search and discrete filters                                            | Exists in compact activity area; current server-side filtering remains owned by Dashboard                              | Retain current filter-control guidance; keep summary-row interaction out of this targeted step                                                                            |
| Dashboard / activity-links | History, Analyze, Review, available report links                                | Links are conditional per activity row, while the activity table itself exists for empty results                       | Retain the guidance but anchor it to the stable activity table so empty results do not create a numbered-step gap; explain that links appear when rows are available      |
| Dashboard / breakdowns     | Status / Operation summary panels or History                                    | Aside exists but may currently hold History, so its mere presence is insufficient                                      | Merge filtering hint into Filters and History explanation into activity-links; remove generic aside step                                                                  |
| Analyze / product-picker   | Add product search form                                                         | Exists in compact sidebar; current catalog composition                                                                 | Retain; remove requirement to add a Product during Introduction                                                                                                           |
| Analyze / product-list     | Product enable toggles and remove controls                                      | List exists in compact sidebar, including empty state                                                                  | Retain composition explanation without changing enabled state                                                                                                             |
| Analyze / product-cards    | Open all / Collapse all, Product cards                                          | Product cards are conditional, while the Analyze Products surface and empty state remain present                       | Anchor the guidance to the stable Analyze Products surface so an empty workspace keeps the step; explain that cards and collapse controls appear when Products are loaded |
| Analyze / reports-history  | Product card / content                                                          | Conditional cards contain metadata, History and available validation; IC-ENC unavailable is not an interactive promise | Merge with card step; remove duplicated content step and loaded-Product fallback loop                                                                                     |
| Review / product-picker    | Add product search form                                                         | Exists in FI-036 compact sidebar; FI-039 handles composition loading                                                   | Retain; remove requirement to add two Products to complete Introduction                                                                                                   |
| Review / product-list      | Product checkbox and History / IC-ENC / Validation overrides                    | The Product-list surface exists with an empty state; individual rows are conditional                                   | Anchor the guidance to the stable Product-list surface so empty Review composition keeps the step; explain per-Product overrides when rows are present                    |
| Review / comparison-board  | Enabled Product columns                                                         | The Review board exists in empty/loading/error states; Product columns are conditional                                 | Anchor the guidance to the stable Review board so empty Review composition keeps the step; explain column/scroll behavior when Products are available                     |
| Review / product-content   | Scrollable Product content                                                      | Same current columns, selected sections and unavailable states                                                         | Merge into comparison step; explain vertical column and horizontal board scrolling without incremental-loading internals                                                  |

New useful coverage: Main-map Data sources, FI-040 keyboard shortcut and compact hint;
Dashboard sorting/page size; Analyze and Review manual Refresh; shared navigation and Preferences
on every route. README's obsolete Dashboard Apply/preset description was removed as part of the
same content audit. No existing accepted interaction was redesigned.

## Final route coverage and order

Legitimately unavailable route targets are still skipped, but educational workspace steps now use
stable route surfaces that remain present in empty states so the visible step numbers do not jump
merely because no Product/activity rows are loaded. No Product or source is added to manufacture a
target. Main-map Data sources guidance
describes source enable/disable without inventing a nonzero in-session requirement; FI-031 still
allows all Product sources to be disabled for the current session.

| Route         | Ordered steps                                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main map (11) | Navigation; Product search; Locator; Data sources; Filters; hover/normal click/overlap picker; direct-selection shortcuts; popup actions; Product Collection; runtime Preferences; Saved preferences |
| Dashboard (9) | Navigation; range; Refresh/last-successful time; filters; sorting; paging/page size; activity links/History; runtime Preferences; Saved preferences                                                  |
| Analyze (7)   | Navigation; Product search/composition; Product enable/remove; Product cards/content; Refresh; runtime Preferences; Saved preferences                                                                |
| Review (8)    | Navigation; Product composition; workspace Content toggles; per-Product enable/overrides; Refresh; Product columns/scrolling; runtime Preferences; Saved preferences                                 |

Shortcut wording: **Ctrl-click on Windows/Linux**, **Cmd-click on macOS**. With map focus,
**Ctrl+Enter / Cmd+Enter** opens only the **current transient highlighted Product**. The compact
map hint advertises pointer and keyboard paths. Normal click and the overlap picker remain the
complete workflow. The shortcut is never described as a Product Collection action.

Preferences wording follows FI-044: Theme is a runtime Light/sun–Dark/moon switch. Only Main-map
Introduction mentions opt-in Scale hiding. Saved preferences uses Auto-save; turning it off removes
the saved value without changing runtime. Reset restores defaults independently of Auto-save.
Start introduction is the explicit bottom re-entry action. The tour opens the existing Data sources, Filters and Preferences panels only when their steps need to show those controls; it never changes settings or Product/source selections.

## Ownership, targeting and lifecycle

- `onboardingService` remains the sole owner, initialized by existing `initUI` route context.
  It imports only onboarding modules. It does not initialize Map/MapView, Main-map sources, Scale
  hiding, API access or workspace composition. Existing route bootstrap is unchanged.
- `onboardingSteps` supplies one deterministic sequence per route. Existing completion/dismissal
  storage versions are preserved (Main 3, other routes 2); this refresh does not force a new welcome
  on users who already dismissed or completed it. Preferences can replay the current guide.
- `onboardingInteraction` now resolves application-owned light-DOM IDs/classes/data hooks.
  No private ArcGIS/Calcite shadow traversal, text matching or positional child selectors remain.
- Missing, hidden, detached, clipped or still offscreen targets are skipped forward or backward.
  Route steps whose child content is legitimately data-dependent instead target stable parent surfaces
  (`.pc-dashboard-activity-table`, `.analyze-products`, `.pc-review-product-list`, `.pc-review-board`)
  so empty Dashboard/Analyze/Review states retain deterministic step numbering. Visible controls may
  be scrolled into view with instant nearest scrolling. Panel guidance uses a
  declarative reveal contract that activates the existing application-owned trigger; it does not
  import or instantiate panel owners. Data sources and Filters close again when the tour advances.
  Preferences remains open across its runtime and Saved preferences steps. A panel opened by the
  tour is closed on step exit, Finish, Escape, restart or teardown; a panel already open before the
  step is left in its prior open state. No Product, source selection or setting value is changed.
- Existing viewport refresh/polling is retained in one mechanism to follow DOM replacement. An
  owner generation rejects callbacks from a prior tour. Missing targets cannot trap Next; if no
  later target exists, the flow finishes and removes its UI. No polling survives closure.
- Welcome initially focuses Start introduction and locally wraps Tab within its modal buttons.
  Tour initially focuses Next. Back/Next/Finish/Close are native buttons; normal Tab, Shift+Tab,
  Enter and Space remain browser-owned. The tour is non-modal and does not trap application focus.
- Escape closes directly, without the old stop-confirmation overlay. Its bubble-phase handler
  respects an already handled Escape and does not intercept map shortcut keys.
- Close/Finish returns focus to the visible origin, otherwise to the Preferences public focus
  contract. Re-entry preserves the original origin rather than a detached tour button. Background
  target replacement does not steal focus from a still-connected application control.
- Re-initialization, pagehide and popstate destroy old UI, timers and listeners. Destroyed services
  reject delayed route-ready/start callbacks. Route teardown does not focus an outgoing page.
- Cards use existing theme tokens and viewport-constrained scrolling. Target scrolling is instant;
  the existing reduced-motion rules remain. Narrow viewports, zoom and native component focus
  still require the manual checks below.

## Verification

Runtime: Node.js `v24.19.0`. No project `node_modules` directory is available.

The exact focused test inventory is every `*.test.js` recursively beneath:

- `src/features/onboarding`
- `src/features/layout`
- `src/features/preferences`
- `src/features/dashboard`
- `src/features/analyze`
- `src/features/review`
- `src/features/map/interactions`
- `src/app`

This covers bootstrap/Preferences Main-map isolation, shared navbar, FI-040, Dashboard automatic
range/sort/page size, Analyze target presentation, Review content/presentation/incremental session
and lifecycle, plus onboarding import/target/keyboard/focus contracts.

Final results (48 test files in the focused suite):

| Check                                               | Result                                               |
| --------------------------------------------------- | ---------------------------------------------------- |
| Introduction tests, including storage and placement | 37 passed; 0 failed; 0 skipped                       |
| Focused regression suite (includes Introduction)    | 308 tests; 307 passed; 1 baseline failure; 0 skipped |
| Unchanged baseline Dashboard presentation suite     | 7 tests; 6 passed; the same 1 failure                |
| `node --check` on all six changed JavaScript files  | All six passed                                       |

The failing test is `range controls keep keyboard time editing local until the range interaction commits`
in `src/features/dashboard/ui/dashboardPage.presentation.test.js`.
The one baseline Dashboard presentation failure is a source-regex assertion expecting LF directly
after `timeInput.addEventListener("keydown", () => {`, while the authoritative renderer contains
CRLF. It reproduces in the untouched baseline; neither that test nor the renderer is changed here.

`npm run check`, Prettier, ESLint and Vite build were not run because project dependencies are
unavailable. No browser/manual acceptance is claimed. Local authoritative verification:

```sh
cd src/ProductCatalogue
npm run format
npm run check
```

## Manual verification checklist

### Main map

- Start Introduction from Preferences; use mouse, Tab/Shift+Tab, Enter/Space, Back and Next.
- Confirm navigation/new-tab wording and separate Product search and Locator steps.
- Confirm Data sources opens for its step, closes when Filters opens, Filters shows the default Idle
  exclusion, and Filters closes again before map guidance. Source enable/disable guidance must not
  invent a minimum-enabled rule.
- Confirm Preferences opens automatically for the final two steps, remains open between runtime and
  Saved preferences guidance, then closes on Finish/Escape while preserving any panel that was
  already open before onboarding took ownership.
- Confirm hover, normal click and overlap-picker guidance; Ctrl-click on Windows/Linux,
  Cmd-click on macOS and map-focused Ctrl+Enter/Cmd+Enter match FI-040's current highlight/hint.
- Confirm conceptual popup actions and popup-to-Product-Collection guidance, including an empty
  collection and unavailable source actions; Introduction must not select or add a Product itself.
- Escape and Close return to Preferences; repeated Start introduction creates one tour.
- Repeat in narrow viewport, Light/Dark, browser zoom and reduced-motion mode.

### Dashboard

- Start Introduction with activity and with an empty/error result. Only Dashboard targets appear.
- Confirm compact range, automatic valid range changes, Refresh/last-successful time, filters,
  sortable headings, paging/page size, History and workspace links. No Apply/preset guidance.
- Verify Escape, focus return, Back/Next, narrow viewport, both themes and zoom.

### Analyze

- Start with no Products and with loaded Products; adding a Product is never a tour prerequisite.
- Verify compact composition, enable/remove, conditional cards/content and Refresh wording.
- Confirm Preferences opens automatically for its two steps, contains no Scale hiding, and Introduction causes no Main-map startup/API work.
- Verify Escape, focus return, Back/Next, viewport, both themes and zoom.

### Review

- Test empty, single-Product and multi-Product composition. No two-Product prerequisite remains.
- Verify workspace History/IC-ENC/Validation, per-Product overrides, disabled Products, Refresh,
  conditional content, unavailable report wording and column/board scrolling.
- Confirm no pre-FI-036/FI-038 layout guidance or Main-map settings/services appear.
- Verify Escape, focus return, Back/Next, viewport, both themes and zoom.

### Regression

- Theme, Main-map-only Scale hiding, Auto-save OFF runtime preservation and independent Reset.
- Navbar current-route/hover/focus-visible states; Main-map workspace links still open new tabs.
- Direct Product selection, Product Collection, default/modified filters and source enable/disable.
- Close during refresh, remove a current target, navigate away/back, and restart repeatedly:
  no stale overlay, duplicate listener, focus trap or late step publication.

## Known uncertainties

Native Calcite focus, ArcGIS placement, responsive clipping and browser Back/Forward restoration
have not been manually exercised here. DOM tests model public application contracts and do not
replace browser verification. The baseline CRLF-sensitive Dashboard test and unavailable build
checks are explicit limits; FI-043 is not marked manually accepted.

## Candidate file inventory

All paths are repository-relative; the ZIP contains complete files.

- Changed: `src/ProductCatalogue/README.md`
- New: `src/ProductCatalogue/docs/fi-043-onboarding-refresh.md`
- Changed: `src/ProductCatalogue/docs/frontend-hardening-tracker.md`
- Changed: `src/ProductCatalogue/docs/ui-ux-design-backlog.md`
- Changed: `src/ProductCatalogue/src/features/onboarding/config/onboardingSteps.js`
- Changed: `src/ProductCatalogue/src/features/onboarding/domain/onboardingInteraction.js`
- Changed: `src/ProductCatalogue/src/features/onboarding/services/onboardingService.js`
- Changed: `src/ProductCatalogue/src/features/onboarding/tests/onboardingInteraction.test.js`
- Changed: `src/ProductCatalogue/src/features/onboarding/tests/onboardingSteps.test.js`
- Changed: `src/ProductCatalogue/src/features/onboarding/ui/onboardingUi.js`
- Changed: `src/ProductCatalogue/src/styles/onboarding.css`

Deleted files: none. Dependencies: none added or changed.

Suggested commit message: `Refresh route-aware Product Catalogue introduction and lifecycle`

## V3 panel-reveal correction

Manual browser verification of V2 found that the final Preferences steps described controls while the
panel remained closed, and that Main-map Data sources / Filters guidance only highlighted the navbar
actions. V3 keeps the same step inventory and ownership, but adds a declarative reveal contract for
those existing application panels.

- Main-map Data sources opens through `#data-sources-button`, targets `.pc-data-source-panel`, and
  closes before the Filters step.
- Main-map Filters opens through `#filter-button`, targets `#attribute-filter-panel`, and closes before
  map guidance resumes.
- Every route opens the existing shared Preferences panel for the runtime Preferences step, keeps it
  open for Saved preferences, and targets the Saved preferences group on the second step.
- The onboarding service activates only the existing application-owned trigger. It does not import
  Data source, Filter or Preferences owners and does not mutate their values.
- Panels opened by onboarding are closed when their reveal sequence ends, on Finish/Escape, restart
  or route teardown. A panel that was already open when onboarding reaches its reveal step is not
  closed by onboarding cleanup.

Focused correction verification in this environment:

- `node --check` passed for the four changed JavaScript/test files.
- Direct configuration assertions for Main-map Data sources / Filters and all four route Preferences
  reveal contracts passed.
- The isolated Node test runner could not be completed in this container session; the authoritative
  local `npm run check` remains required before commit.

## V5 revealed-panel navigation correction

Manual browser verification of V4 found that opening a panel from an onboarding navigation click
allowed that same click to continue to the application's document-level outside-click handler. The
newly revealed Data sources, Filters or Preferences panel could therefore close immediately after the
step rendered. The target-refresh lifecycle then treated the closed panel as unavailable and skipped
the step, which also made Back navigation appear unable to return across reveal boundaries.

V5 keeps the V3/V4 reveal ownership model unchanged and corrects the event boundary instead:

- clicks inside the onboarding popover are stopped at the onboarding surface and are not published
  to application outside-click owners;
- Main-map Data sources and Filters therefore stay open while their steps are active and can be
  revisited with Back;
- Preferences stays open across runtime and Saved preferences guidance and can be navigated backward
  on Main map, Dashboard, Analyze and Review;
- leaving a reveal sequence still closes only a panel that onboarding itself opened;
- Escape, Finish, restart and teardown retain the existing cleanup/focus contract; and
- no Product source, filter or preference value is changed by this correction.

Focused regression coverage now models an application document-level outside-click owner and verifies
forward and backward navigation across Data sources, Filters and Preferences reveal steps.

## V6 empty-state step continuity correction

Manual browser verification of V5 found that several workspace steps still targeted data-dependent
children. With an empty or filtered workspace those children were legitimately absent, so the generic
missing-target contract skipped the configured step and the visible numbering jumped (Review 3→5 and
5→7, Analyze 3→5, Dashboard 6→8).

V6 keeps the same route inventories and missing-target safety, but moves those four educational steps
to stable application-owned surfaces that already represent the same feature in empty states:

- Dashboard activity-link guidance targets `.pc-dashboard-activity-table`; row-level Links remain
  conditional and the copy says they appear when activity rows are available.
- Analyze Product-content guidance targets `.analyze-products`; Product cards/Open all/Collapse all
  remain conditional and are described as available when Products are loaded.
- Review per-Product guidance targets `.pc-review-product-list`; individual Product rows remain
  conditional and the copy explains their controls when Products are added.
- Review comparison guidance targets `.pc-review-board`; Product columns remain conditional and the
  copy explains side-by-side/scroll behavior when enabled Products are available.

This correction does not fabricate content, add placeholder controls or weaken the generic missing-target
fail-closed behavior. It only prevents data-empty states from creating confusing numbered-step gaps.

Focused V6 verification in this environment:

- `node --check` passed for all seven JavaScript files present in the complete FI-043 candidate.
- Five focused onboarding step/configuration tests passed, including Dashboard/Analyze/Review deterministic
  route coverage, the new stable empty-state anchor contract and current workspace guidance wording.
- Full `npm run check` remains a local verification step because the changed-files candidate does not contain
  the complete unchanged baseline tree.
