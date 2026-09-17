# Product Catalogue UI/UX design backlog

Documentation baseline: `6a29ee5abee23b5ce741a69732d9f67ad805b95d`  
Review date: 2026-09-17

This document formalizes the post-FI-022 Product Catalogue design review into independently implementable feature items. It is a design and task boundary document, not an implementation claim. The existing feature boundaries, source-aware Product identity, FI-024 targeted workspace resolution, FI-025 ArcGIS process isolation, FI-022 workspace freshness lifecycle, keyboard/focus behavior, and light/dark support remain preservation requirements unless a task explicitly changes them.

## Cross-cutting decisions

### Shared navigation and route chrome

Repeated requests to hide Help and move Light/Dark mode into Preferences belong to one shared-shell task rather than separate Dashboard, Analyze, and Review changes. The same applies to the active-route navigation indicator.

The active route should retain the same underline treatment currently shown on navigation hover. Hover continues to work for inactive links; the active link keeps the underline persistently and must also expose an appropriate semantic current-page state.

### Dashboard filter application

Dashboard filtering should move toward automatic application rather than keeping an explicit Apply button. This is appropriate because the operation is read-only, reversible, and already designed around asynchronous result replacement. Discrete controls should refresh when their committed value changes. Free-text inputs should remain debounced. Date changes should not dispatch an invalid or incomplete range. Existing stale-request protection, last-successful-result retention, cursor invalidation, and page reset behavior must be preserved.

Saved filter presets are not part of this redesign. A later browser-local saved-filter feature may be considered after the simplified filter model is accepted.

### Modifier clicks

The concrete need from the design review is faster selection of a Product when overlapping AOIs make the overlap picker cumbersome. That need supersedes the old FI-021 preferred experiment in which Ctrl/Cmd-click directly toggled Product Collection membership.

FI-021 is accepted at `32efa496f978e20baee834f0becdb95bdadadd98`. Ctrl-click on Windows/Linux and Cmd-click on macOS directly selects the currently highlighted Product candidate only while that source-aware identity remains valid for the completed click. Normal click keeps the existing overlap picker and popup workflow. Shift-click remains unchanged.

The accepted shortcut uses stable Product/Graphic identity and current-candidate revalidation rather than source ordering. It does not prefer S-101, S-57, or any other source by name. The former modifier-click Product Collection toggle remains deferred and unassigned unless a later UX review restores it as a separate requirement. Keyboard-equivalent activation and visible discoverability remain separate FI-040 work.

### Loading progress

Loading should visibly complete rather than disappearing directly from an intermediate state. When the current operation completes, the UI should move cleanly to 100%, keep the completed state visible briefly (approximately 0.5-1 second, subject to manual tuning), and then dismiss it. Reduced-motion preferences and superseding generations must be respected.

The frontend must not invent precise progress percentages that the backend cannot support. A separate discovery inside FI-030 must determine whether the relevant backend/data-source work can expose useful phase or chunk progress without weakening FI-025 process isolation. Backend progress work receives its own backend task ID only after that discovery identifies the actual contract.

## Task matrix

| ID     | Area                            | Task                                                                                                  | Status                                    | Dependency / boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | ------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FI-021 | Main map / overlap selection    | Add modifier-click direct selection for the highlighted Product candidate                             | Done                                      | Accepted at `32efa496f978e20baee834f0becdb95bdadadd98`. Normal click retains the overlap workflow. Ctrl/Cmd-click opens only the transiently highlighted Product after current-layer, Graphic-membership and click-generation validation; otherwise it falls back safely. Shift-click and Product Collection remain unchanged. Keyboard/discoverability requirements continue as FI-040.                                                                                                                                                                                                                                                                                                                                                                                                   |
| FI-026 | Shared navigation / Preferences | Consolidate active-route state and shared navbar controls                                             | Done                                      | Manually accepted at `6bc8d1181beabda254ba19dd483d29ec41cadf41`. Shared route state, compact refresh presentation and Theme/Preferences ownership are implemented once in the common navbar shell; FI-028 still owns Scale hiding migration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| FI-027 | Main map search                 | Move Product search and geographic Locator into a navbar search area                                  | Design discovery first                    | Product search and Locator remain separate workflows; do not merge Product lookup with geographic search.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| FI-028 | Main map / Preferences          | Move Scale hiding into Preferences and make it opt-in                                                 | Done                                      | Manually accepted at `fce91ee3ee54361f3a0fe79e3dd95c8c1905a718`. The actual Main-map setting lives in Preferences and defaults OFF without an explicit valid saved value. Existing explicit choices remain compatible, persistence enablement remains separate, reset returns to OFF, and filters/source lifecycle never select the preference. FI-043 retains the final onboarding refresh.                                                                                                                                                                                                                                                                                                                                                                                               |
| FI-029 | Popup actions                   | Audit text-heavy popup actions and define a compact icon-first presentation                           | Design analysis first                     | Do not blindly remove labels from ambiguous, rare, or high-risk actions. Preserve tooltips, accessible names, confirmation dialogs, and keyboard behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| FI-030 | Loading                         | Smooth loader completion and discover a real progress/chunk contract                                  | Split frontend polish + backend discovery | Do not fake precise progress or introduce frontend polling/retry to mask backend execution. Preserve FI-025.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| FI-031 | Main map / Data sources         | Prevent startup/reload with zero enabled Product sources                                              | Done                                      | Manually accepted at `c1ed794374e56383a7362f3eadb2d16b07dfdb17`. Zero remains valid during the current session. Controller startup preserves first-visit defaults and valid non-empty selections; only a valid restored selection resolving to zero receives exactly one currently eligible selection-persistable fallback through registry default/definition ordering and the normal activation/persistence lifecycle. Session-only fixtures remain valid first-visit defaults but are not restored-state fallbacks. Stale/unavailable IDs cannot block eligible recovery, startup remains zero when no eligible source exists, requested source-selection intent is preserved across concurrent startup mutations, and no source name/ID is hard-coded. FI-026/FI-028 remain unchanged. |
| FI-032 | Main map navigation             | Open Dashboard, Analyze, and Review in new tabs from the Main map and fix false popup-blocked notices | Done                                      | Manually accepted at `11491d15272b165b63da58dece83cb0c0776077b`. Main-map workspace links/actions open new tabs through one shared route-aware policy; workspace-to-workspace navigation stays same-tab. Navbar links retain base-aware `href`, normal modifier/context-menu behavior and active-route semantics. Product Collection/popup launches preserve canonical Product composition and Main state, and blocked-popup notices follow the actual browser-open result rather than a `noopener`-induced null handle. FI-026/FI-028/FI-031 remain unchanged.                                                                                                                                                                                                                            |
| FI-033 | Dashboard                       | Compact page chrome and range/refresh toolbar                                                         | Done                                      | Manually accepted at `01f22a605e8e4d29a8da187306af1dc04b8540ef`. Redundant visible Dashboard chrome and preset shortcuts are removed; the compact From/To/Apply row places a centered icon-only Refresh button and last-successful `HH:MM` immediately after Apply. Refresh uses a native button with the public Calcite refresh icon rather than styling Calcite shadow DOM. Open-ended To remains available through contextual/keyboard clearing, explicit Apply remains for FI-034, and BE-107 paging/filtering, FI-009/FI-010 behavior, Dashboard History and FI-032 navigation remain unchanged.                                                                                                                                                                                      |
| FI-034 | Dashboard                       | Auto-apply valid filter changes and remove the Apply action                                           | Done                                      | Manually accepted at `6a29ee5abee23b5ce741a69732d9f67ad805b95d`. Apply is removed; valid committed date/time changes auto-apply through the existing request lifecycle while invalid/incomplete drafts stay editable without requesting or updating the route. Native time controls require a complete valid `HH:MM`; incomplete values such as `15:--` remain draft-only and are intentionally not auto-completed. Keyboard editing and pointer picker transitions are focus-safe, optional To clearing applies the open range, discrete filters remain immediate, search remains debounced, and paging/cursor reset, sort/page size, last-successful results, FI-033 `HH:MM`, manual Refresh, History and FI-032 navigation are preserved.                                               |
| FI-035 | Analyze                         | Compact the Analyze sidebar and align scrollbar/list presentation                                     | Ready                                     | Preserve Product picker behavior, FI-022 freshness, source-aware resolution, manual Refresh, independent content failures, and keyboard behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| FI-036 | Review                          | Compact Review sidebar controls and move Refresh above Products                                       | Ready                                     | Preserve Product composition, content toggles, FI-022 freshness, and source-aware resolution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FI-037 | Review                          | Reduce Product-content density, simplify empty states, and remove nested report scrolling             | Ready after FI-036                        | Preserve independent History/IC-ENC/validation failures and truthful unavailable states.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| FI-038 | Review                          | Enable all Review content types by default and add bulk content toggles                               | Ready after FI-037                        | Bulk controls must coexist with per-Product controls and preserve user-selected state after subsequent refreshes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| FI-039 | Review performance              | Load only changed/new Products when Review composition changes                                        | Ready; regression-sensitive               | Preserve ordering, content toggles, generation guards, independent History/artifact failures, and full manual Refresh semantics.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| FI-040 | Main map / accessibility        | Add modifier-selection keyboard equivalent and discoverability                                        | Deferred follow-up                        | Define an accessible highlighted-candidate activation path and compact visible shortcut cue while preserving the normal overlap picker as the complete non-shortcut workflow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FI-041 | Review / Product list           | Preserve Product-list scroll position when content toggles change                                     | Ready; UI bug                             | Fix scroll-to-top when History, IC-ENC, or Validation is toggled for a Product. Preserve focus, ordering, content selection, FI-022 freshness and keyboard interaction. Implement after FI-036 so sidebar restructuring is stable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| FI-042 | Main map / Filters              | Align Filter panel scrollbar styling                                                                  | Ready                                     | Reuse a shared/public Product Catalogue scrollbar treatment for the Filter panel outer scroller and nested attribute lists such as Status. Preserve overflow and filtering behavior in light/dark mode; avoid private Calcite internals.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| FI-043 | Introduction / Onboarding       | Refresh onboarding after the UI/UX redesign                                                           | Deferred                                  | Perform one consolidated route-by-route onboarding audit after the active redesign wave settles. Explain the final accepted workflows and controls, including FI-021 Ctrl/Cmd-click selection. FI-040 remains the owner of modifier-selection keyboard/discoverability behavior; FI-043 updates guidance only after that interaction contract is known.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| FI-044 | Shared Preferences / UX         | Improve Preferences information architecture and saved-state usability                                | Ready                                     | Group Introduction, actual Settings, and Saved preferences; make Theme and Scale hiding semantics visually clear; align reset/clear affordances across persisted items; preserve FI-026 shared Theme and FI-028 Scale hiding state/persistence boundaries. FI-043 audits onboarding after the final structure is accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## FI-021 - modifier-click direct Product selection

### Goal

Reduce overlap-picker friction when multiple Product sources occupy the same or nearly identical AOI.

### Implemented interaction

- normal click keeps the existing overlap picker and Product popup workflow;
- Ctrl-click on Windows/Linux and Cmd-click on macOS snapshots the current transient hover identity before asynchronous click hit testing;
- returned Graphics are revalidated against current overlap-enabled layers, current stable layer membership, visibility and click-session generation after the asynchronous hit test;
- the highlighted identity must still match one of those current candidates, otherwise the normal overlap workflow is used;
- the shortcut opens/selects that Product through the normal Product-context and popup path rather than implementing a second selection workflow;
- one current candidate still opens normally, including when no valid highlighted identity exists;
- no implementation may hard-code S-57/S-101 preference or infer source identity from DatasetName;
- Shift-click remains unchanged.

### Interaction ownership and stale-state safety

`hoverManager` continues to own transient hover and popup-locked highlight state. FI-021 exposes only stable identity for the transient hover and never treats the popup-locked Product as a hover candidate. Modifier state comes from the public ArcGIS click event's native pointer event. Generation-guarded hover hit tests prevent late results from replacing newer pointer, layer, popup, pointer-leave, or teardown state. The click interaction independently re-reads current interactive layers and validates stable Graphic membership after `hitTest`; click-session generation prevents older or destroyed interactions from publishing popup state.

The bounded FI-021 pointer implementation intentionally does not add a keyboard equivalent or visible discoverability cue. These original design requirements are not satisfied or removed: FI-040 owns their focused design and implementation. Normal click remains the complete non-shortcut workflow, and existing keyboard, focus, Escape, and popup behavior is preserved until FI-040 is implemented.

### Manual acceptance

FI-021 was manually accepted on 2026-09-16 at `32efa496f978e20baee834f0becdb95bdadadd98`. Testing confirmed direct selection of either highlighted overlapping Product, normal-click picker fallback, stale source/filter/refresh rejection and rapid-click protection. Modifier timing remains tied to the actual click event; no sticky Ctrl/Cmd grace period is introduced. Existing map gestures remain authoritative, including rapid Ctrl + double-left-click navigation, which FI-021 intentionally does not intercept.

### Out of scope

The earlier Ctrl/Cmd-click Product Collection toggle experiment is no longer the primary FI-021 scope. Product Collection itself must remain unchanged unless that shortcut is separately re-approved.

## FI-026 - shared navigation and Preferences consolidation

Status: Done  
Implementation commit: `6bc8d1181beabda254ba19dd483d29ec41cadf41`

### Goal

Make global navigation state clearer and reduce duplicated route chrome.

### Requirements

- keep the current hover underline but retain it continuously for the active route;
- expose active navigation semantically, not only visually;
- on the Main map, order the right-side controls as `Filters`, `Data sources`, `Refresh`, last-updated time, `Notifications`, `Preferences`;
- remove the literal `Updated` prefix and show only the time in the compact navbar presentation;
- provide hover/help text for the timestamp that explains it is the last successful data refresh and may include the full date/time;
- hide the Help (`?`) navbar control on all routes while keeping the underlying help/onboarding implementation available for possible later reuse;
- move Light/Dark mode selection into Preferences and remove the standalone theme control from the navbar;
- preserve keyboard navigation, visible focus, Escape/outside-click behavior for popovers, tooltips, light/dark mode, and compact layout.

### Implemented boundary

The shared navbar now applies one persistent underline and `aria-current="page"` to the primary route resolved by the existing application router. On the Main map, the FI-026-owned controls are ordered `Filters`, `Data sources`, `Refresh`, compact last-successful-refresh time, `Notifications`, and `Preferences`. The timestamp retains full local date/time context in its hover and accessible help text, including restoration of the previous successful presentation after a failed manual refresh.

The visible Help and standalone Theme actions are absent from the shared navbar. Light and Dark remain backed by the existing theme service and persistence key and are selected immediately inside the shared Preferences panel on every route. Introduction replay and the underlying onboarding/help implementation remain available.

Scale hiding remains unchanged in the navbar. FI-028 still exclusively owns moving it into Preferences, changing its default, and removing automatic preference changes.

### Manual acceptance

FI-026 was manually accepted on 2026-09-16 at `6bc8d1181beabda254ba19dd483d29ec41cadf41`. Browser verification covered active-route underline/current-page semantics on Main map, Dashboard, Analyze and Review; the Main-map control order and compact refresh timestamp; Light/Dark selection and persistence through Preferences on all routes; absence of the visible Help/standalone Theme actions; unchanged Scale hiding; introduction replay; Notifications; panel Escape/focus behavior; and compact light/dark navbar presentation. No FI-026 regression was found in that pass.

## FI-027 - navbar search consolidation

### Goal

Move the Main-map Product search and geographic Locator away from separate map buttons/overlays and into a conventional navbar search area.

### Design boundary

This task requires a short design pass before implementation. Product search and Locator are intentionally separate workflows and must remain separate in domain/service ownership even if they share a navbar region or switcher. Product search selects/navigates to Product AOIs and popup state; Locator navigates geographically without creating Product selection or a retained marker/popup.

The design pass should decide whether the navbar exposes two adjacent compact controls, one search field with an explicit mode selector, or another equally clear pattern. It must also decide where the search cluster sits relative to the FI-026 right-side action ordering without making the navbar too dense at narrower widths.

## FI-028 - Scale hiding as an opt-in preference

Status: Done  
Implementation commit: `fce91ee3ee54361f3a0fe79e3dd95c8c1905a718`

### Requirements

- remove Scale hiding from its current prominent Main-map surface;
- move the control into Preferences;
- make Scale hiding off by default for users without an explicit stored preference;
- remove automatic behavior that changes the user's Scale hiding preference without direct user action;
- preserve the selected preference once the user changes it;
- keep source/filter state and popup behavior independent from this preference.

Implementation discovery must distinguish the user preference from the actual map-scale visibility effect. Turning the feature on may naturally react to map scale; the part being removed is automatic preference/state selection on the user's behalf.

### Implemented behavior

- The Main-map navbar no longer exposes Scale hiding. Its FI-026 right-side order is Filters, Data sources, Refresh, last successful refresh, Notifications, and Preferences.
- Main-map Preferences owns the positive Scale hiding switch and applies it immediately through the existing inverse `displayScaleHidingDisabled` state and visibility binding. Dashboard, Analyze, and Review do not expose this map-specific setting; shared Theme selection remains available.
- The established `pc.displayScale.hidingDisabled` key and `"true"`/`"false"` format remain unchanged. Explicit prior ON (`"false"`) and OFF (`"true"`) values are restored, while missing or malformed values resolve to Scale hiding OFF without a startup write.
- Scale hiding value and persistence enablement remain separate controls. Disabling persistence removes the explicit stored value but still permits session changes; re-enabling follows the existing persistence lifecycle.
- Individual reset and reset-all remove the explicit value and leave Scale hiding OFF. Display scale attribute filters, filter restore/clear, source reconciliation, and refresh no longer mutate either the runtime setting or its persisted value.
- Existing display-scale visibility, source-aware filtering, FI-026 shared navigation/Preferences/Theme behavior, and introduction replay remain intact. FI-043 remains responsible for the later comprehensive onboarding refresh.

### Manual acceptance

FI-028 was functionally accepted and committed on 2026-09-16 at `fce91ee3ee54361f3a0fe79e3dd95c8c1905a718`. The accepted behavior keeps Scale hiding as an explicit Main-map setting with OFF as the no-preference default, preserves existing explicit stored values, keeps persistence enablement separate from the runtime value, and prevents Display scale filters/source lifecycle from changing the preference. The follow-up Preferences information-architecture issues observed during acceptance are tracked separately as FI-044 rather than reopening FI-028.

## FI-029 - popup action-density review

### Goal

Determine which popup actions still benefit from persistent text labels after users become familiar with the application.

### Review criteria

For every popup action, record:

- recognition quality of the icon without text;
- action frequency;
- ambiguity with neighboring actions;
- destructive/risky impact;
- whether a confirmation dialog already explains the consequence;
- quality of existing hover text and accessible name;
- keyboard discoverability;
- width/scroll impact in the current popup.

Likely candidates for icon-only presentation are frequent, well-recognized, low-ambiguity actions with strong tooltips. Ambiguous or consequential actions may retain text even if confirmation exists. The analysis must produce the concrete implementation list before popup layout changes are made.

## FI-030 - loading completion and real-progress discovery

### Frontend completion polish

- when an operation reaches successful completion, visually advance the current loader to 100% before dismissing it;
- keep 100% visible briefly, approximately 0.5-1 second, then dismiss cleanly;
- avoid an abrupt transition from `Loading data source` to no loader;
- do not delay a superseding/new load generation merely to finish an old animation;
- respect `prefers-reduced-motion`;
- preserve existing error/retry semantics.

### Backend/data progress discovery

Investigate whether bulk source loading can be divided into meaningful chunks/phases whose completion can be reported truthfully. The frontend must not fabricate chunk percentages. Discovery should identify the data owner, request/response boundary, expected number of chunks, cancellation semantics, and whether progress requires multiple requests or an additive response contract. The solution must preserve FI-025 API/worker isolation.

## FI-031 - non-empty source startup invariant

### Requirements

- users may temporarily disable every Product source during a running session;
- on full page reload or next application entry, zero persisted enabled sources must not result in a blank map that requires opening Data sources manually;
- if restored state resolves to zero enabled available sources, enable one selection-persistable available source through registry/default configuration;
- do not branch on a hard-coded source name;
- do not silently re-enable additional sources once one valid fallback has been selected;
- document and test behavior when no source is available at all.

### Implemented behavior

Status: Done  
Implementation commit: `c1ed794374e56383a7362f3eadb2d16b07dfdb17`

- controller initialization is the only recovery boundary, so disabling the final source remains valid for the current running session;
- a missing persisted selection continues to use the existing first-visit defaults, including session-only fixture defaults, while a valid restored selection resolving to zero enables exactly one eligible fallback;
- fallback selection excludes sources with `persistence.persistSelection === false`, then uses the first currently runtime-selectable registry default or deterministic registry definition order;
- stale, retired, configured-out, or otherwise unavailable persisted sources are never activated and cannot block recovery through another eligible source;
- when no source is currently eligible, startup remains truthfully at zero;
- fallback activation uses the existing controller, loader, map adapter, lifecycle, generation guards, and persistence schema/key; no source layer or browser storage shortcut was added;
- a newer in-session source mutation prevents an older in-flight startup transaction from overwriting the newer persisted selection;
- reset-to-default behavior is unchanged, and fallback activation failure does not fan out to additional sources;
- FI-026 shared navigation/Theme and FI-028 Main-map Scale hiding behavior remain unchanged. FI-044 still owns Preferences information architecture, and FI-043 still owns the consolidated onboarding refresh.

### Manual acceptance

FI-031 was manually accepted in the browser on 2026-09-17 and committed at `c1ed794374e56383a7362f3eadb2d16b07dfdb17`. Acceptance confirmed that an all-off source selection remains valid for the running session, a subsequent full reload recovers to exactly one eligible persisted-selection source, and the recovered selection remains stable on later reloads. Normal non-empty restoration, source enable/disable behavior, refresh, Filters, Product search, popup/Product Collection, Preferences, Theme, Scale hiding, keyboard/focus behavior, and light/dark presentation remained intact during the acceptance pass.

## FI-032 - Main-map workspace navigation

Status: Done  
Implementation commit: `11491d15272b165b63da58dece83cb0c0776077b`

### Requirements

- Dashboard, Analyze, and Review navigation launched from the Main map opens a new browser tab;
- navigation between those pages when already outside the Main map remains same-tab;
- Product Collection launch flows must not show a `popup blocked` notice when the browser actually opened the destination successfully;
- use the actual browser open result to determine blocked-popup messaging;
- preserve canonical Analyze/Review query routes and Product composition;
- preserve keyboard activation and accessible link/button semantics.

### Implemented behavior

- the FI-026 current-route parser supplies Main-map identity to one shared navigation policy;
- Main-map Dashboard, Analyze, and Review links retain their base-aware `href` and receive scoped
  new-tab semantics, while the same shared links remain same-tab on Dashboard, Analyze, and Review;
- Product Collection and popup Analyze actions resolve their canonical URL synchronously during user
  activation, preserve Product ordering/deduplication/encoding, and leave Main-map state untouched;
- action-based opens use the returned browser window handle as the success signal, sever opener access,
  and show the established blocked-popup notice only for a null or thrown open attempt;
- successful opens never emit the false blocked warning caused by combining return-value detection with
  the `noopener` window feature;
- canonical route parsing, application base paths, anchor modifier/context-menu behavior, keyboard
  activation, active-route underline and `aria-current` remain owned by their existing shared contracts;
- FI-026 shared navigation/Preferences, FI-028 Scale hiding, and FI-031 source startup/recovery are
  unchanged.

### Manual acceptance

FI-032 was manually accepted in the browser on 2026-09-17 and committed at `11491d15272b165b63da58dece83cb0c0776077b`. Acceptance confirmed Main-map Dashboard/Analyze/Review launches in new tabs, same-tab navigation between workspace routes, preserved canonical Product Collection and popup Analyze URLs, no false blocked-popup notices on successful opens, detached opener access for action-based launches, and retained Main-map/Collection state. Standard link modifier behavior, active-route state, keyboard/accessibility behavior, base-path/deep-link behavior, Preferences, Theme, Scale hiding, Data sources, light/dark presentation, and FI-031 startup recovery remained intact. The local frontend check passed and formatting was run before commit.

## FI-033 - Dashboard visual compaction

### Remove redundant copy

Remove the visible `Operational overview`, redundant `Dashboard` page heading, selected-range explanatory sentence, and `Activity list` heading where the surrounding structure already makes the content clear. Keep any necessary semantic heading structure available for accessibility even if it is visually compact/hidden.

### Range and refresh toolbar

- replace the text Refresh action with a compact refresh icon button with tooltip and accessible name;
- place it in the newly available compact toolbar space rather than adding a separate row;
- show an `HH:MM` last-successful-load timestamp beside the refresh action;
- timestamp help text should explain what was last updated and provide richer date/time context where useful;
- remove `Since yesterday` and `Last 7 days` preset buttons;
- remove the separate `Clear` button beside `To`; preserve the existing ability to represent an open-ended `To` range if the contract supports it;
- increase `From` and `To` label contrast using normal light/dark text tokens rather than muted text;
- keep page-size, server-side sort, search/filter, cursor paging, and Dashboard History behavior unchanged.

Saved browser-local filter presets are deferred.

### Implementation status

Status: Done  
Implementation commit: `01f22a605e8e4d29a8da187306af1dc04b8540ef`

- `Operational overview`, the visible Dashboard page heading, selected-range sentence, and visible `Activity list` heading are removed. One visually hidden `h1` and the activity `h2` retain the semantic structure without duplicate accessible labels.
- The existing header space now contains one compact From/To/Apply toolbar and an icon-only Refresh action. The adjacent local `HH:MM` value is published only when the existing request-generation boundary accepts a successful Dashboard result; failure, abort, and stale completion retain the previous successful value and result.
- Visible `Since yesterday` and `Last 7 days` shortcuts are removed without changing default, legacy route, bookmark, or backend range semantics.
- The separate To Clear action is removed. The optional To date picker exposes a contextual `Clear date` action only while open with a selected value, and its trigger also supports `Delete` and `Backspace`; both clear the paired time and preserve the existing open-ended route/request contract.
- From/To labels use the normal theme-aware text token for stronger light/dark contrast.
- Explicit Apply remains authoritative for FI-033. FI-034 still owns automatic range/filter application and removal of Apply.
- Page size/persistence, cursor paging, server-side sorting and rollback, search/filter timing, last-successful-result retention, Dashboard History, FI-026 shared navigation/Preferences/Theme, FI-028 Scale hiding, FI-031 source recovery, and FI-032 workspace navigation are unchanged.
- Dashboard onboarding receives only a bounded copy correction for the removed shortcuts and the new last-successful-load time; selectors and progression remain unchanged.

### Manual acceptance

FI-033 was manually accepted in the browser on 2026-09-17 and committed at `01f22a605e8e4d29a8da187306af1dc04b8540ef`. Acceptance confirmed the reduced Dashboard chrome, compact range toolbar, last-successful `HH:MM` lifecycle, removed presets, contextual and keyboard clearing of optional To, explicit Apply behavior, paging, sorting, filters, Dashboard History, FI-032 navigation, responsive layout, keyboard/focus behavior, and light/dark presentation. The final Refresh presentation uses a semantic native button with a public Calcite refresh icon so the visible icon and 30x30 hit area are centered without private shadow-DOM styling. The local frontend check passed and formatting was run before commit.

## FI-034 - Dashboard automatic filtering

### Decision

Remove the explicit Apply action and refresh automatically when a valid filter value is committed.

### Behavior

- select/range controls dispatch immediately after a committed change;
- date controls dispatch only when the resulting range is valid according to the existing range contract;
- text search remains debounced rather than requesting on every keystroke;
- keep the last successful result visible while replacement data loads;
- invalid/incomplete intermediate input must not replace valid results with an error/empty state;
- every applied filter/range change resets cursor history/page position exactly as the current explicit Apply flow does;
- stale responses must not overwrite a newer filter generation;
- manual Refresh remains available through the FI-033 icon action.

### Implementation status

Status: Done  
Implementation commit: `6a29ee5abee23b5ce741a69732d9f67ad805b95d`

- The visible and focusable Apply control and its dead styling/help registration are removed; the FI-033 From/To/Refresh/`HH:MM` layout remains otherwise unchanged.
- Date selection and contextual/keyboard To clearing remain immediate commit boundaries. Native time `input` updates only the editable draft. Keyboard time editing commits when focus leaves the range group, while pointer-driven native time-picker changes commit only after the browser focus transition settles; moving directly to another range control therefore does not rerender or steal that interaction.
- The existing Dashboard range domain creates the committed custom range. Invalid/incomplete drafts do not request, publish a route, clear the last successful result, or raise an API error.
- Clearing To also clears its paired time, applies once, and preserves omission of `to` from the route and API request.
- Automatic range application reuses the controller's request ID, `AbortController`, stale-response, failure-retention, paging/cursor, sort rollback, page-size generation, route and accepted-success timestamp boundaries. A zero-delay pending range-load handle exists only to let the committing browser focus/click transition finish and to coalesce a directly following Dashboard action; it is not a range debounce or a second request lifecycle.
- Discrete filters and summary-row actions remain immediate; text search retains the 300 ms debounce. A range commit cancels a pending search timer because the immediate range request already includes the latest filters.
- Range/filter application resets page and cursor history while retaining sort and page size. Manual Refresh uses the applied valid range and cannot submit an invalid visible draft.
- Focus restoration continues through public elements: picker selection/clear returns focus to the date trigger, keyboard time editing can move across From/To controls without an intermediate rerender, and Refresh now participates in the existing application-owned focus identity mechanism.
- Dashboard History and FI-032 navigation are unchanged. Saved filter presets are not included.

### Manual acceptance

FI-034 was manually accepted in the browser on 2026-09-17 and committed at `6a29ee5abee23b5ce741a69732d9f67ad805b95d`. Acceptance confirmed one request per committed range change, correct suppression and later recovery of invalid range drafts, applied-state manual Refresh, focus-safe keyboard time entry, first-click transfer between native time/date pickers, optional To clearing, search/filter timing, paging/sort/page-size preservation, route/history behavior, Dashboard History, FI-032 navigation, responsive layout, and light/dark presentation. Native `input[type="time"]` remains intentionally browser-owned: only a complete valid `HH:MM` value is eligible for application. An incomplete visible value such as `15:--` does not request and is not coerced to `15:00`; replacing the native time control is deferred unless user feedback demonstrates a usability need. The local frontend check passed and formatting was run before commit.

## FI-035 - Analyze sidebar compaction

### Requirements

- remove the visible `Analyze n products` panel heading where route context already identifies the page; preserve an accessible panel name;
- remove the visible `Add product` field label and the normal explanatory `Add one product at a time...` help text;
- keep contextual error/help text when the Product catalog cannot be loaded or input is invalid;
- reduce excess padding/spacing around `.analyze-dataset-manager` rather than removing useful semantic grouping merely for layout reasons;
- rename `Product list` to `Products` for consistency with Review;
- reduce the Product-list viewport to approximately three visible Products before scrolling;
- reuse the Review Product-list scrollbar treatment through shared/public CSS, not by coupling Analyze directly to a Review-only class;
- apply the same scrollbar treatment to the Analyze sidebar's outer scroll container;
- make the Analyze sidebar narrower while retaining readable report/history content and responsive behavior;
- preserve the current compact icon Refresh location established by FI-022.

## FI-036 - Review sidebar compaction

### Requirements

Remove or visually suppress redundant `Workspace`, `Product Review`, `Collect products and...`, `Add product`, and normal `Add one product at a time...` text while retaining accessible names and contextual failure/help messaging.

Move the existing Review Refresh action above the `Products` list so it is available near the composition controls instead of at the bottom of the sidebar. Do not change automatic FI-022 freshness behavior.

## FI-037 - Review Product-content layout and empty states

### History sizing

Replace the overly tall fixed History area with a more content-sensitive height model. History should remain usable for long timelines without permanently consuming disproportionate Product height.

### Scrolling ownership

IC-ENC and validation report boxes should not gain independent internal scrollbars merely because they are pushed lower in the Product. Keep their natural/content-defined height within reasonable bounds and let the Product/content container own vertical scrolling. Avoid nested-scroll traps.

### Empty-state simplification

Remove duplicated unavailable/no-files headings inside report boxes. Standardize the final empty-state copy to:

- `No IC-ENC reports found for this product.`
- `No validation reports found for this product.`

Do not stack a status label, an unavailable heading, and a second paragraph that all communicate the same fact. Preserve truthful distinction between `not implemented/unavailable`, `request failed`, and `available but no reports` where the backend contract actually distinguishes those states; simplify presentation without collapsing materially different failures into a false `no reports` result.

## FI-038 - Review content defaults and bulk toggles

### Requirements

- enable History, IC-ENC reports, and Validation reports by default for newly created Review Product entries;
- add compact workspace-level controls to enable/disable History for all Products, IC-ENC for all Products, and Validation for all Products;
- keep per-Product content toggles available after a bulk action;
- after a user customizes individual Products, ordinary FI-022 freshness refreshes must preserve those selections;
- define whether adding a new Product after a bulk toggle follows the global toggle's current state or the default-on state, and cover the chosen behavior with tests;
- preserve Product enable/disable state independently from content-type enablement.

## FI-039 - incremental Review composition loading

### Observed problem

Adding Products sequentially to Review currently reloads every enabled Product each time. With one Product, Review loads one Product's History/artifacts; adding a second reloads both; adding a third reloads all three, and so on. This is unnecessary network/backend work and becomes increasingly visible as the workspace grows.

### Required behavior

- adding a Product loads only the newly added Product unless an existing Product is independently stale/invalidated;
- enabling a previously disabled Product loads only that Product if its required content is not already current;
- disabling or removing a Product does not re-fetch unaffected Products;
- preserve existing Product ordering;
- preserve per-Product History/IC-ENC/Validation toggles for retained Products;
- preserve independent History/artifact failure handling;
- preserve source-aware Product resolution and generation/stale-result guards;
- manual Refresh remains an intentional full workspace refresh;
- canonical route replacement may perform a full reconciliation/load when the whole Product composition is replaced;
- FI-022 automatic freshness continues to refresh only Products whose revision changed.

### Regression coverage

Add tests that count Product/history/artifact loader calls for add, enable, disable, remove, route replacement, manual Refresh, and stale/superseded generations. A sequence of three single-Product additions should not cause 1 + 2 + 3 History/artifact request sets.

## FI-040 - modifier-selection keyboard equivalent and discoverability

### Goal

Complete the FI-021 accessibility and learnability requirements without changing its accepted pointer shortcut or normal overlap workflow.

### Requirements

- define a keyboard-accessible way to activate the currently highlighted Product candidate;
- provide a compact visible cue that makes Ctrl/Cmd-click and the keyboard equivalent discoverable;
- preserve normal click and the overlap picker as the complete non-shortcut workflow;
- do not require pointer modifier use to access any Product;
- preserve source-aware identity validation, current-candidate revalidation, popup lifecycle, focus, Escape, Product Collection, Product search, Locator, and light/dark behavior;
- complete a focused interaction/accessibility design pass before implementation so highlight ownership, focus entry and cue placement are explicit.

## FI-041 - preserve Review Product-list scroll position

### Observed bug

When the Review `Products` list is scrolled and the user toggles `History`, `IC-ENC`, or `Validation` for a visible Product, the Product-list scroller returns to the top. Content selection should not move the user's navigation position in the Product list.

### Required behavior

- preserve the Product-list scroll position when an individual Product's History, IC-ENC, or Validation toggle changes;
- preserve the behavior for both pointer and keyboard activation;
- keep focus on the activated control where the existing interaction model permits it;
- preserve Product ordering and the newly selected content-toggle state;
- do not introduce `scrollIntoView` or equivalent focus/scroll side effects;
- preserve FI-022 automatic/manual freshness behavior and source-aware Review resolution;
- remain compatible with the later FI-038 workspace-level bulk toggles.

Prefer avoiding an unnecessary full Product-list rerender when the current Review architecture can update the affected Product in place. If a bounded rerender remains necessary, scroll restoration must be generation-safe and must not restore obsolete state after a newer composition change. FI-041 follows FI-036 so the compacted sidebar structure is the stable implementation target.

### Regression coverage

Test at least History, IC-ENC and Validation toggles from a non-zero scroll position, pointer and keyboard activation, focus retention, a position near the bottom of the list, and interaction with subsequent refresh/composition updates.

## FI-042 - Filter panel scrollbar consistency

### Goal

Replace generic browser scrollbar presentation in the Main-map Filter UI with the same compact Product Catalogue scrollbar treatment used by Review Product lists and targeted for Analyze in FI-035.

### Required behavior

- apply the shared scrollbar styling to the Filter panel's outer scroll container when it overflows;
- apply the same treatment to nested scrollable attribute sections such as the Status options list;
- support both light and dark mode;
- preserve existing overflow sizing, wheel/touchpad scrolling, keyboard scrolling, filter selection, counts and source-aware filter state;
- use application-owned/public CSS and documented tokens only; do not target private Calcite shadow DOM;
- expose the treatment through a neutral shared scrollbar class/tokens rather than coupling Filters to a Review-specific selector.

FI-035 should establish or reuse the neutral shared scrollbar contract for Analyze. FI-042 should reuse that contract rather than duplicating Review-only CSS. If implementation order changes, FI-042 may establish the neutral contract first provided FI-035 can consume it unchanged.

## FI-043 - onboarding refresh after the UI/UX redesign

### Goal

Run one consolidated onboarding review after the active Product Catalogue UI/UX redesign work has settled, so the introduction teaches the application users actually see instead of being patched independently after every intermediate design task.

### Required audit

Review every Main map, Dashboard, Analyze and Review onboarding step against the final accepted UI and workflows. At minimum:

- teach the accepted FI-021 Ctrl-click on Windows/Linux and Cmd-click on macOS shortcut for direct selection of the currently highlighted valid overlapping Product, while keeping normal click/overlap-picker guidance intact;
- reflect FI-026 active navigation, shared Preferences ownership, compact refresh presentation and Theme location;
- reflect the final FI-027 Product search / Locator presentation if that redesign is implemented;
- reflect FI-028 Scale hiding placement and semantics;
- reflect the final FI-044 Preferences grouping, labels, reset semantics and persistence presentation if FI-044 is accepted before the onboarding audit;
- reflect FI-032 Main-map workspace-launch behavior where it is relevant to guidance;
- re-check Dashboard, Analyze and Review guidance after FI-033 through FI-039 and FI-041 are accepted;
- re-check labels, targets, ordering, selectors, placement, waiting/ready behavior, accessible copy and route prerequisites against the final DOM;
- preserve Product search and Locator as separate workflows even when their presentation changes.

FI-040 remains the owner of the modifier-selection keyboard equivalent and visible discoverability cue. FI-043 must not invent that behavior. If FI-040 is accepted before this audit, onboarding should teach its final keyboard path as well as Ctrl/Cmd-click; otherwise onboarding must describe only the interaction that actually exists.

### Lifecycle and regression boundary

Preserve replay from Preferences, first-time route state, keyboard/focus/Escape behavior, light/dark mode and RDP/VDI-safe static guidance. Version onboarding state only where the final changed flow requires users to see revised guidance; avoid resetting unrelated route completion state solely because another route changed.

Add/update focused onboarding tests around final target selectors, step order, route versions, interaction prerequisites and fallback behavior. Complete a manual route-by-route introduction pass in both themes after implementation.

## FI-044 - Preferences information architecture and usability

### Goal

Make Preferences easier to understand by separating immediate application behavior from browser-local persistence. The panel should read as a small settings surface rather than exposing storage mechanics and runtime settings as one undifferentiated list.

### Observed usability problem

After FI-026 and FI-028, Preferences contains three different concepts in one visual flow:

- `Start introduction`, which is an action rather than a preference value;
- actual application settings such as Theme and Scale hiding, which change the running UI immediately;
- persistence controls such as Map view, Filters, Scale hiding, and Theme, which decide what the browser remembers.

This makes repeated names such as `Theme` and `Scale hiding` appear to mean the same thing even though one control changes runtime behavior and the other controls persistence. The saved Scale hiding row also lacks the reset/clear affordance shown by neighboring persisted preferences, which makes the persistence section look inconsistent.

### Information architecture

Organize the panel into three compact semantic groups:

```text
Introduction
  Start introduction

Settings
  Theme
  Scale hiding

Saved preferences
  Map view
  Filters
  Scale hiding
  Theme

Reset available preferences
```

This structure is an information-architecture target, not a requirement to use large cards or the exact indentation above. Keep the existing compact, angular Product Catalogue presentation.

Use `Saved preferences` or equally precise browser-persistence terminology in UI copy. Do not call this `Cache` unless a future feature actually manages cached data.

### Settings semantics

- Settings controls change current runtime behavior immediately.
- Theme remains a shared setting on every route where shared Preferences is available.
- Scale hiding remains a Main-map-only setting and keeps the FI-028 positive ON/OFF semantics.
- Do not duplicate Theme or Scale hiding domain state inside the Preferences UI.
- Preserve FI-028's OFF default, legacy storage compatibility, and filter/source independence.

### Saved-preference semantics

- Persistence controls decide whether the corresponding state is remembered in this browser; they must not be presented as the setting itself.
- Map view and Filters remain Main-map-only persistence entries.
- Theme persistence remains shared.
- Scale hiding persistence remains separate from the actual Scale hiding value.
- The saved Scale hiding row must have a reset/clear affordance consistent with the other saved preferences when there is meaningful stored state to remove.
- Define reset wording and behavior explicitly so two controls do not both say `Reset` while performing materially different operations. If clearing only stored state differs from resetting the live value, use distinct copy such as `Clear saved value` rather than relying on position to explain the difference.
- `Reset available preferences` must retain a clear aggregate meaning after the grouping change and must not reset route-unavailable state.

### Route, interaction, and visual boundaries

- Preserve FI-026 route-safe Preferences ownership: non-Main-map routes must not instantiate Main-map-only services merely to render Preferences.
- Preserve introduction replay, outside-click close, Escape handling, focus restoration, keyboard operation and accessible labels/state.
- Keep the panel compact; use headings, separators and spacing rather than large cards or excessive vertical chrome.
- Support light and dark mode with existing public application/Calcite styling contracts only.
- Do not target private Calcite shadow DOM.

### Regression coverage

Cover at minimum:

- correct grouping and order of Introduction, Settings, and Saved preferences;
- Theme setting and Theme persistence remain distinct and functional;
- Scale hiding setting and Scale hiding persistence remain distinct and functional;
- saved Scale hiding exposes the selected reset/clear affordance and its behavior is unambiguous;
- Main-map-only items remain absent on Dashboard, Analyze and Review;
- reset-all affects only preferences available on the current route according to the established contract;
- FI-026 Theme/navigation/Preferences lifecycle and FI-028 Scale hiding state/persistence behavior do not regress;
- keyboard, Escape/outside close, focus restoration, light/dark and compact layout remain correct.

FI-043 remains the owner of the final onboarding audit. After FI-044 is accepted, FI-043 should teach the resulting Preferences organization rather than the current transitional layout.

## Recommended implementation sequence

1. FI-021 is complete and manually accepted at `32efa496f978e20baee834f0becdb95bdadadd98`.
2. FI-026 shared navigation/Preferences consolidation is complete and manually accepted at `6bc8d1181beabda254ba19dd483d29ec41cadf41`.
3. FI-028 Scale hiding preference is complete and manually accepted at `fce91ee3ee54361f3a0fe79e3dd95c8c1905a718`.
4. FI-031 non-empty source startup remains complete at `c1ed794374e56383a7362f3eadb2d16b07dfdb17`, and FI-032 Main-map workspace navigation is complete and manually accepted at `11491d15272b165b63da58dece83cb0c0776077b`.
5. FI-033 Dashboard visual compaction remains accepted at `01f22a605e8e4d29a8da187306af1dc04b8540ef`, and FI-034 automatic filtering is complete and manually accepted at `6a29ee5abee23b5ce741a69732d9f67ad805b95d`.
6. FI-027 navbar search remains a separate design-discovery item and can follow its short design pass without blocking the Dashboard sequence.
7. FI-035 Analyze compaction, including a neutral shared scrollbar treatment.
8. FI-042 Filter-panel scrollbar consistency using that shared treatment.
9. FI-036, FI-041, FI-037, FI-038, then FI-039 Review work so sidebar structure, scroll preservation, content layout, defaults and loading behavior are changed in controlled steps.
10. FI-029 popup action-density analysis before any icon-only popup migration.
11. FI-030 frontend completion polish may proceed independently; backend progress/chunk work waits for its contract discovery.
12. FI-040 keyboard-equivalent activation and discoverability after its focused interaction/accessibility design pass.
13. FI-044 Preferences information architecture may proceed as a bounded shared-UI task after the immediate FI-031/FI-032 work; it does not block those behavior changes.
14. FI-043 consolidated onboarding refresh follows the accepted final Preferences/UI structure; teach only final accepted interactions and preserve route-specific onboarding state.

FI-016, FI-018, FI-020, and FI-023 keep their existing separate blockers/priorities and are not re-scoped by this UI/UX review.
