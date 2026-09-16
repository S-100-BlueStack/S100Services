# Product Catalogue UI/UX design backlog

Documentation baseline: `c2bb13c0bce07907f16f35221025e89a7b211c06`  
Review date: 2026-09-16

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

For the first FI-021 implementation, Ctrl-click on Windows/Linux and Cmd-click on macOS should be explored as a direct-selection shortcut for the currently highlighted Product candidate. Normal click keeps the existing overlap picker and popup workflow. Shift-click remains unassigned because the map still has no stable range-selection model.

The shortcut must use the existing candidate/highlight ordering and Product context. It must not prefer S-101, S-57, or any other source by name. The former modifier-click Product Collection toggle remains deferred and unassigned unless a later UX review restores it as a separate requirement.

### Loading progress

Loading should visibly complete rather than disappearing directly from an intermediate state. When the current operation completes, the UI should move cleanly to 100%, keep the completed state visible briefly (approximately 0.5-1 second, subject to manual tuning), and then dismiss it. Reduced-motion preferences and superseding generations must be respected.

The frontend must not invent precise progress percentages that the backend cannot support. A separate discovery inside FI-030 must determine whether the relevant backend/data-source work can expose useful phase or chunk progress without weakening FI-025 process isolation. Backend progress work receives its own backend task ID only after that discovery identifies the actual contract.

## Task matrix

| ID | Area | Task | Status | Dependency / boundary |
| --- | --- | --- | --- | --- |
| FI-021 | Main map / overlap selection | Add modifier-click direct selection for the highlighted Product candidate | Ready for discovery and implementation | Preserve normal-click overlap picker, source-aware identity, map gestures, popup lifecycle, keyboard equivalent, and Product Collection semantics. |
| FI-026 | Shared navigation / Preferences | Consolidate active-route state and shared navbar controls | Ready | Implement before duplicating route-specific navbar changes. |
| FI-027 | Main map search | Move Product search and geographic Locator into a navbar search area | Design discovery first | Product search and Locator remain separate workflows; do not merge Product lookup with geographic search. |
| FI-028 | Main map / Preferences | Move Scale hiding into Preferences and make it opt-in | Ready | Remove automatic/default-on behavior; preserve explicit user preference after it is chosen. |
| FI-029 | Popup actions | Audit text-heavy popup actions and define a compact icon-first presentation | Design analysis first | Do not blindly remove labels from ambiguous, rare, or high-risk actions. Preserve tooltips, accessible names, confirmation dialogs, and keyboard behavior. |
| FI-030 | Loading | Smooth loader completion and discover a real progress/chunk contract | Split frontend polish + backend discovery | Do not fake precise progress or introduce frontend polling/retry to mask backend execution. Preserve FI-025. |
| FI-031 | Main map / Data sources | Prevent startup/reload with zero enabled Product sources | Ready | Allow zero sources during the current session, but restore at least one registry-selected/default available source on next application startup/reload. No source-name branching. |
| FI-032 | Main map navigation | Open Dashboard, Analyze, and Review in new tabs from the Main map and fix false popup-blocked notices | Ready | New-tab behavior applies only when launched from the Main map. Navigation from Dashboard/Analyze/Review remains same-tab. |
| FI-033 | Dashboard | Compact page chrome and range/refresh toolbar | Ready | Preserve BE-107 paging/filter/sort contracts and FI-009/FI-010 behavior. |
| FI-034 | Dashboard | Auto-apply valid filter changes and remove the Apply action | Ready after FI-033 | Preserve debounce, stale-request protection, last-successful results, page reset, and cursor-generation invalidation. |
| FI-035 | Analyze | Compact the Analyze sidebar and align scrollbar/list presentation | Ready | Preserve Product picker behavior, FI-022 freshness, source-aware resolution, manual Refresh, independent content failures, and keyboard behavior. |
| FI-036 | Review | Compact Review sidebar controls and move Refresh above Products | Ready | Preserve Product composition, content toggles, FI-022 freshness, and source-aware resolution. |
| FI-037 | Review | Reduce Product-content density, simplify empty states, and remove nested report scrolling | Ready after FI-036 | Preserve independent History/IC-ENC/validation failures and truthful unavailable states. |
| FI-038 | Review | Enable all Review content types by default and add bulk content toggles | Ready after FI-037 | Bulk controls must coexist with per-Product controls and preserve user-selected state after subsequent refreshes. |
| FI-039 | Review performance | Load only changed/new Products when Review composition changes | Ready; regression-sensitive | Preserve ordering, content toggles, generation guards, independent History/artifact failures, and full manual Refresh semantics. |

## FI-021 - modifier-click direct Product selection

### Goal

Reduce overlap-picker friction when multiple Product sources occupy the same or nearly identical AOI.

### Intended interaction

- normal click keeps the existing overlap picker and Product popup workflow;
- Ctrl-click on Windows/Linux and Cmd-click on macOS directly selects the Product candidate that the existing interaction model currently considers highlighted;
- the shortcut opens/selects that Product through the normal Product-context and popup path rather than implementing a second selection workflow;
- when only one candidate is present, the modifier may use the same direct-selection path without creating a special source rule;
- no implementation may hard-code S-57/S-101 preference or infer source identity from DatasetName;
- Shift-click remains unused in the first implementation;
- keyboard users need an equivalent way to activate the highlighted candidate without using a pointing-device modifier.

### Discovery questions

Before implementation, identify exactly where the current candidate highlight/order is owned and whether ArcGIS modifier events can be consumed without conflicting with pan/zoom/navigation gestures. Define the visible discoverability cue and confirm how the shortcut behaves when no candidate is highlighted.

### Out of scope

The earlier Ctrl/Cmd-click Product Collection toggle experiment is no longer the primary FI-021 scope. Product Collection itself must remain unchanged unless that shortcut is separately re-approved.

## FI-026 - shared navigation and Preferences consolidation

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

## FI-027 - navbar search consolidation

### Goal

Move the Main-map Product search and geographic Locator away from separate map buttons/overlays and into a conventional navbar search area.

### Design boundary

This task requires a short design pass before implementation. Product search and Locator are intentionally separate workflows and must remain separate in domain/service ownership even if they share a navbar region or switcher. Product search selects/navigates to Product AOIs and popup state; Locator navigates geographically without creating Product selection or a retained marker/popup.

The design pass should decide whether the navbar exposes two adjacent compact controls, one search field with an explicit mode selector, or another equally clear pattern. It must also decide where the search cluster sits relative to the FI-026 right-side action ordering without making the navbar too dense at narrower widths.

## FI-028 - Scale hiding as an opt-in preference

### Requirements

- remove Scale hiding from its current prominent Main-map surface;
- move the control into Preferences;
- make Scale hiding off by default for users without an explicit stored preference;
- remove automatic behavior that changes the user's Scale hiding preference without direct user action;
- preserve the selected preference once the user changes it;
- keep source/filter state and popup behavior independent from this preference.

Implementation discovery must distinguish the user preference from the actual map-scale visibility effect. Turning the feature on may naturally react to map scale; the part being removed is automatic preference/state selection on the user's behalf.

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
- if restored state resolves to zero enabled available sources, enable one available source through registry/default configuration;
- do not branch on a hard-coded source name;
- do not silently re-enable additional sources once one valid fallback has been selected;
- document and test behavior when no source is available at all.

## FI-032 - Main-map workspace navigation

### Requirements

- Dashboard, Analyze, and Review navigation launched from the Main map opens a new browser tab;
- navigation between those pages when already outside the Main map remains same-tab;
- Product Collection launch flows must not show a `popup blocked` notice when the browser actually opened the destination successfully;
- use the actual browser open result to determine blocked-popup messaging;
- preserve canonical Analyze/Review query routes and Product composition;
- preserve keyboard activation and accessible link/button semantics.

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

## Recommended implementation sequence

1. FI-021 modifier-click direct Product selection.
2. FI-026 shared navigation/Preferences consolidation.
3. FI-028 Scale hiding preference, FI-031 non-empty source startup, and FI-032 Main-map workspace navigation.
4. FI-027 navbar search design/implementation after the shared navbar structure is stable.
5. FI-033 then FI-034 Dashboard compaction and automatic filtering.
6. FI-035 Analyze compaction.
7. FI-036, FI-037, FI-038, then FI-039 Review work so layout, controls, content defaults, and loading behavior are changed in controlled steps.
8. FI-029 popup action-density analysis before any icon-only popup migration.
9. FI-030 frontend completion polish may proceed independently; backend progress/chunk work waits for its contract discovery.

FI-016, FI-018, FI-020, and FI-023 keep their existing separate blockers/priorities and are not re-scoped by this UI/UX review.
