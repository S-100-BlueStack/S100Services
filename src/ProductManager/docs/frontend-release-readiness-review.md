# Frontend release-readiness review

Review baseline: `982d9be01f1ace939fe479494c8e05b5c347107e`

This review focuses on Product Manager frontend readiness for controlled user testing. It identifies release risks, backend dependencies, smoke-test findings, and follow-up hardening work.

## Decision

The frontend is ready for controlled user testing if the known backend-dependent limitations are communicated clearly to testers. There are no frontend P0 blockers identified in the current implemented flows.

The largest remaining user-facing risk is discoverability. Hover/help text and a compact replayable introduction flow are implemented. Current onboarding polish highlights concrete controls and confirms before stopping; the remaining follow-up is an interactive map-popup-Product Collection sequence.

## Severity scale

| Severity        | Meaning                                                               |
| --------------- | --------------------------------------------------------------------- |
| P0              | Blocks controlled user testing. Fix before exposing the app to users. |
| P1              | Should fix or explicitly communicate before broader rollout.          |
| P2              | Useful hardening after initial user testing starts.                   |
| P3              | Cleanup or later improvement.                                         |
| Backend blocked | Requires API/database/storage contract or backend enforcement.        |

## Current stable areas

| Area          | Status                                               | Notes                                                                                                                                                                                                                                                                   |
| ------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main map      | Ready for controlled testing                         | Map rendering, hover, popup details, filters, Product search, Product History quick panel, Product Collection, refresh preservation, display-scale hiding, and product popup actions are implemented. Header navigation remains usable during initial map load.         |
| Popup actions | Ready for controlled testing                         | Freeze/Unfreeze, Send to IC-ENC, Rollback, and `Export > S100 > Edition` are wired. Disabled export leaves are intentionally unavailable. Actions have textual loading states, which is important for RDP/VDI sessions where spinner animation may not render reliably. |
| Dashboard     | Ready for controlled testing                         | Separate read-only route with backend activity data, Danish range builder, search, filters, actionable summaries, and route-local History panel.                                                                                                                        |
| Analyze       | Ready for controlled testing with backend caveats    | Product loading, history, XML/report content, internal validation placeholder/report foundation, and shared Product picker are in place. Unknown products are rejected when catalog validation is available.                                                            |
| Review        | Ready for controlled testing with backend caveats    | Multi-product review, content toggles, history, placeholder report sections, and shared Product picker are in place. Unknown products are rejected when catalog validation is available.                                                                                |
| User guidance | Ready for controlled testing with known future scope | Hover/help text and a compact replayable introduction flow are implemented. The remaining guided-workflow follow-up is the interactive map-popup-Product Collection sequence.                                                                                           |
| Documentation | Usable                                               | README, tracker and feature docs describe the current architecture and frontend-only/backend-dependent behavior.                                                                                                                                                        |

## Smoke-test summary

A smoke test on 2026-07-09 found no P0 blockers.

Key findings were either fixed or documented:

- startup/routes worked without issues
- `/aoi` load takes about 12 seconds, but data loads correctly
- header navigation remains usable while initial main map data is loading
- main map filters show the intended filter set
- filter persistence works
- popup actions work and return correctly to the frontend
- Dashboard range builder, quick filters, History, Review and Analyze links work
- Analyze/Review Product picker works
- Product picker hides already-added products
- unknown products are rejected when catalog validation is available
- light/dark mode looks correct
- Dashboard time input tab trap was fixed
- Escape close behavior was hardened
- Product History rows were changed to collapsed by default
- Product History summaries describe edition/update changes even when status remains unchanged
- main map Product search was added and polished
- hover/help tooltips were added to common clickable controls

Remaining observations:

- `/aoi` endpoint performance is a backend/performance topic
- `UsageBand` currently shows descriptive text; including the ID may be solved better in backend data
- active operation visibility across sessions is not visible before the user attempts an action
- report/validation links remain disabled until backend report metadata exists
- the introduction flow is available and replayable; interactive popup-to-collection progression remains future UX work

## P0 findings

No P0 frontend blockers were identified.

## P1 findings

### RR-001: Active operation visibility across sessions

Severity: P1/P2 / Backend blocked

Backend already rejects conflicting export/rollback operations with `409 Conflict`. The remaining gap is visibility: another browser window/user cannot see in advance that a product currently has an active operation.

Risk:

- User B only discovers an active operation after attempting an action.
- The UI can look locally available while backend correctly rejects the operation.

Recommendation:

- Keep the current frontend UX guard.
- Keep handling `409 Conflict` as a normal user-facing conflict response.
- Backend should later expose active operation state per product.
- Frontend should later adapt the existing product operation state to consume backend operation state.

Blocks controlled user testing: No.

### RR-002: Long-running export and rollback behavior should stay observed

Severity: P1/P2 / Backend blocked

Export/rollback requests are currently treated synchronously from the frontend perspective. The frontend shows textual loading states and blocks conflicting local actions, which is adequate for controlled testing.

Risk:

- Long operations may make a single request wait for a long time.
- Users do not get backend job progress or recoverable job state if the operation later becomes asynchronous.

Recommendation:

- Keep current synchronous flow for controlled testing.
- Backend should later expose async jobs with job IDs and status polling if exports/rollback become long-running enough to need it.
- Frontend should reuse existing loading/conflict state and map job states into the existing action availability model.

Blocks controlled user testing: No, unless real exports are expected to be long during user testing.

### RR-003: Report-link workflows are intentionally incomplete

Severity: P1 / Backend blocked

Dashboard, Analyze, and Review can display report placeholders/foundations, but real IC-ENC and internal validation report links require backend report storage and ID/URL contracts.

Risk:

- Users may expect report buttons to open real reports.
- A premature frontend-only implementation may need rework once backend storage is defined.

Recommendation:

- Keep report actions disabled or placeholder-only until backend returns report metadata.
- Define whether reports are linked to product, activity, export job, history event, or multiple scopes.
- Prefer metadata in summary payloads and separate detail endpoints for report content.

Blocks controlled user testing: No, if reports are documented as unavailable/future scope.

### RR-004: Product terminology audit remains open

Severity: P1/P2

The architecture says user-facing UI should use `Product` / `Products`, while code may still use `datasetName` where required by backend contracts. A full UI pass is still tracked separately.

Risk:

- Mixed `Dataset` and `Product` terms can make user testing feedback harder to interpret.
- Users may think Dataset and Product are different workflow concepts.

Recommendation:

- Run a UI-only terminology audit before broader rollout.
- Do not rename backend-aligned code identifiers unless there is a separate refactor.

Blocks controlled user testing: No, but it should be fixed before broader rollout if visible labels remain inconsistent.

### RR-011: User guidance/discoverability

Severity: P1/P2

User feedback says users do not know what all controls do. The app now has concise hover/help text for common clickable controls, icon buttons, route actions, popup actions and panel buttons.

Remaining risk:

- Native hover text helps discoverability, but does not proactively teach the main workflows.
- First-time users may still not understand the intended order of work.

Recommendation:

- Keep maintaining tooltip coverage as new clickable controls are added.
- Do not duplicate the visible label; explain consequence or context.
- Continue onboarding with an interactive popup-to-Product Collection sequence after positioning/highlight polish is validated.

Blocks controlled user testing: No.

## P2 findings

### RR-005: Route-level unavailable states should be smoke-tested

Severity: P2

Dashboard, Analyze, Review, Product catalog, Product History, and main map all depend on separate backend calls. The frontend should be tested with each endpoint failing independently.

Recommended smoke cases:

- `/electronicproducts` catalog fails while Analyze/Review are opened directly.
- `/electronicproducts/dashboard` fails.
- `/electronicproducts/{product}/history` fails in Dashboard and main map History.
- Product action endpoints return non-2xx.
- Status/usage lookup endpoints fail before map filters render.

Expected behavior:

- The route stays usable where possible.
- User sees a scoped error notice/state.
- Manual typed Product input remains possible where intended.

### RR-006: Dashboard large-payload behavior is not proven

Severity: P2

Dashboard search and filters run client-side on the loaded activity payload. This is correct for phase 1, but performance should be observed with real activity volumes.

Recommendation:

- Keep client-side filtering for initial user testing.
- If activity payloads become large, add backend paging or server-side filters.
- Do not add server-side filters until real payload sizes justify the complexity.

### RR-007: Accessibility and keyboard coverage should continue to be tested

Severity: P2

Recent hardening improved Escape handling and Dashboard time-control tab behavior. Continue smoke-testing custom controls after UI changes.

Recommended smoke cases:

- Tab through Dashboard header controls, filters, activity actions, and History panel.
- Use Escape on open panels/dropdowns where supported.
- Verify visible focus states in light and dark mode.
- Verify Product picker keyboard behavior in Analyze and Review.
- Verify Product search keyboard behavior on the main map.

### RR-008: Light/dark mode should be tested after recent UI additions

Severity: P2

Recent additions include Product picker, Product search overlay, Dashboard date picker, Dashboard History panel polish, filter option restyling, clear-button restyling and collapsed Product History rows.

Recommended smoke cases:

- Main map filters in light and dark mode.
- Main map Product search overlay in light and dark mode.
- Dashboard date panel and History panel in light and dark mode.
- Analyze/Review Product picker dropdown in light and dark mode.
- Popup actions and nested export menu in light and dark mode.

### RR-009: Persisted state reset should be part of user testing instructions

Severity: P2

The app stores some UI preferences and persisted state, including filters and map viewpoint. The filter storage key was bumped during recent filter hardening, but testers should still know how to reset state.

Recommendation:

- Include reset-state instructions in tester notes.
- During QA, test both clean browser state and persisted state.

### RR-012: Native/browser animation behavior in RDP/VDI should not carry functional meaning

Severity: P2

RDP/VDI environments may not render CSS animations reliably. This is acceptable as long as text, disabled state and notices communicate loading state.

Recommendation:

- Keep spinner animations as visual enhancement only.
- Ensure all long-running actions also show static text such as `Exporting...`, `Rolling back...`, `Loading...` or `Refreshing...`.

## P3 findings

### RR-010: Documentation could later split release notes from architecture docs

Severity: P3

The current README and tracker are useful, but they now include both architecture guidance and status/release notes.

Recommendation:

- Keep as-is for now.
- If release cycles become formal, create a dedicated release notes document per internal test release.

## Backend-dependent work to communicate to backend owners

| Topic                  | Required backend decision                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operation state        | Active per-product operation state so other sessions can see active work before attempting actions. Backend conflict rejection already exists.    |
| Async jobs             | Job ID, status endpoint, progress/error states for export/rollback and other long-running operations if synchronous behavior proves insufficient. |
| Report storage         | Whether frontend receives report IDs, URLs, or both.                                                                                              |
| Report ownership       | Whether reports belong to product, activity, export job, history event, or multiple scopes.                                                       |
| Dashboard payload size | Whether activity endpoint needs paging/server-side filters after real data volumes are known.                                                     |
| Timeline               | Global map timeline database/API contract.                                                                                                        |
| AOI performance        | `/aoi` currently dominates initial main map load time in smoke testing. Backend performance should be monitored.                                  |

## Recommended next actions

1. Park new frontend feature development for controlled user testing.
2. Communicate backend-dependent limitations to testers and backend owners.
3. Keep hover/help text coverage current when controls are added or changed.
4. Validate onboarding highlighting and positioning, then implement the interactive popup-to-Product Collection sequence.
5. Keep report-link UI deferred until backend report contracts are known.
6. Continue focused smoke tests on clean and persisted browser profiles.

## Manual smoke checklist

### Startup and routes

- Open main map route directly.
- Open `/dashboard` directly.
- Open `/analyze` directly.
- Open `/review` directly.
- Open `/analyze/{product}` directly.
- Open `/review/{product}` directly.
- Reload each route.
- While main map is initially loading, confirm navbar links remain clickable.

### Main map

- Confirm products render.
- Confirm hover highlight works.
- Use Product search to find a known product and open its popup.
- Use Product search with Enter and Escape.
- Hover Product search and common main map controls to confirm help text appears.
- Open popup and confirm product fields are constrained to the intended layout.
- Confirm first popup after fresh load does not show all raw attributes.
- Test manual refresh.
- Test auto-refresh does not show fullscreen loader.

### Main map filters

- Confirm only `Display scale`, `Status`, and `Usage band` are visible.
- Confirm Status includes all statuses from the status endpoint, including count `0` values.
- Select a zero-count status and confirm the map/list result is empty.
- Hover filter actions and verify help text.
- Clear filters.
- Reload and confirm old filter categories do not return.

### Popup actions

- Test Freeze/Unfreeze.
- Test Send to IC-ENC.
- Test `Export > S100 > Edition`.
- Confirm `Export > All`, `S57`, and `S100 > Update` leaves are disabled.
- Test Rollback.
- Confirm mutation actions are blocked while export is running.
- Confirm popup refreshes after successful actions.
- Confirm textual loading state remains clear if spinner animation does not move in RDP/VDI.
- Hover popup actions and verify help text.

### Dashboard

- Test range builder with open-ended `To`.
- Test range builder with explicit `From` and `To`.
- Test `Since yesterday` and `Last 7 days` quick actions.
- Test search and filters.
- Click Status summary rows and Operation summary rows.
- Hover Dashboard controls and activity action buttons.
- Open Dashboard History panel from an activity.
- Expand/collapse Product History rows.
- Close Dashboard History panel with `Close` and Escape.
- Test Review and Analyze links.
- Confirm report actions remain disabled/placeholders as expected.

### Analyze

- Open Analyze directly.
- Use Product picker dropdown.
- Confirm already-added Products are hidden.
- Confirm unknown Products are rejected when catalog validation is available.
- Hover Product picker, Add, Open all and Collapse all controls.
- Load one product.
- Load multiple products.
- Confirm history content loads or fails per product without breaking the page.
- Confirm product mutation actions are not shown in Analyze sidebar.

### Review

- Open Review directly.
- Use Product picker dropdown.
- Confirm already-added Products are hidden.
- Confirm unknown Products are rejected when catalog validation is available.
- Hover Product picker and common Review controls.
- Add/remove products.
- Enable/disable products.
- Toggle History, IC-ENC reports, and Internal validation content.

## Introduction flow phase 1

A compact introduction flow is available after the main map finishes loading. The welcome prompt can be postponed or permanently dismissed in the current browser. Users can replay the current route introduction from Preferences.

The implementation is intentionally route-specific: the main map contains focused guidance for Product search, filters, popup behavior and actions, Product Collection, and workspace navigation. Dashboard, Analyze, and Review each provide a compact overview. The flow does not navigate automatically, execute Product actions, or depend on BroadcastChannel/session state.

Completion and dismissal are stored in versioned localStorage under `pm.onboarding.v1`. Missing or hidden UI targets fall back to a centered information card so onboarding never blocks the application.
