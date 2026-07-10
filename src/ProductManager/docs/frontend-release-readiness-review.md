# Frontend release-readiness review

Review baseline: `674a686ab3cc2d0c4d565025234477556bda61f8`

This review focuses on Product Manager frontend readiness for controlled user testing. It is not a code change. It identifies release risks, backend dependencies, recommended smoke tests, and follow-up hardening work.

## Decision

The frontend is ready for controlled user testing if the known backend-dependent limitations are communicated clearly to testers.

There are no frontend P0 blockers identified in the current implemented flows. The main release risk is not missing UI, but that some operation state and report/job behavior is still frontend-only or blocked by backend contracts.

## Severity scale

| Severity        | Meaning                                                               |
| --------------- | --------------------------------------------------------------------- |
| P0              | Blocks controlled user testing. Fix before exposing the app to users. |
| P1              | Should fix or explicitly communicate before broader rollout.          |
| P2              | Useful hardening after initial user testing starts.                   |
| P3              | Cleanup or later improvement.                                         |
| Backend blocked | Requires API/database/storage contract or backend enforcement.        |

## Current stable areas

| Area          | Status                                            | Notes                                                                                                                                                                                 |
| ------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main map      | Ready for controlled testing                      | Map rendering, hover, popup details, filters, Product History quick panel, Product Collection, refresh preservation, display-scale hiding, and product popup actions are implemented. |
| Popup actions | Ready for controlled testing                      | Freeze/Unfreeze, Send to IC-ENC, Rollback, and `Export > S100 > Edition` are wired. Disabled export leaves are intentionally unavailable.                                             |
| Dashboard     | Ready for controlled testing                      | Separate read-only route with backend activity data, Danish range builder, search, filters, actionable summaries, and route-local History panel.                                      |
| Analyze       | Ready for controlled testing with backend caveats | Product loading, history, XML/report content, internal validation placeholder/report foundation, and shared Product picker are in place.                                              |
| Review        | Ready for controlled testing with backend caveats | Multi-product review, content toggles, history, placeholder report sections, and shared Product picker are in place.                                                                  |
| Documentation | Usable                                            | README and feature docs describe the current architecture and frontend-only/backend-dependent behavior.                                                                               |

## P0 findings

No P0 frontend blockers were identified from the current implementation state and recent manual tests.

## P1 findings

### RR-001: Backend operation state is still not source of truth

Severity: P1 / Backend blocked

Current frontend operation state protects the local browser tab and improves the user experience, but it does not protect against other browser tabs, other users, backend workers, or long-running server-side jobs.

Risk:

- Two users can still start conflicting operations if the backend accepts them.
- UI can look protected while the backend is not enforcing the same rule.

Recommendation:

- Keep the current frontend UX guard.
- Backend should return active operation state per product when available.
- Backend should reject conflicting operations with `409 Conflict` or an equivalent typed error.
- Frontend should later adapt the existing product operation state to consume backend operation state instead of duplicating it in popup-specific code.

Blocks controlled user testing: No, if testers know multi-user operation locking is not final.

### RR-002: Long-running export and rollback behavior still needs backend job model

Severity: P1 / Backend blocked

Synchronous action handling works for the current endpoint wiring, but long-running operations can still make the frontend wait on one request.

Risk:

- Export or rollback can block the backend/API request path.
- Users may not receive accurate progress or recoverable job status if a long operation fails after the request is accepted.

Recommendation:

- Keep current synchronous flow for the current release candidate.
- Backend should later expose async jobs with job IDs and status polling.
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
- Define whether reports are linked to product, activity, export job, history event, or all of these.
- Prefer metadata in summary payloads and separate detail endpoints for report content.

Blocks controlled user testing: No, if reports are documented as unavailable/future scope.

### RR-004: Product terminology audit remains open

Severity: P1/P2

The architecture now says user-facing UI should use `Product` / `Products`, while code may still use `datasetName` where required by backend contracts. A full UI pass is still tracked separately.

Risk:

- Mixed `Dataset` and `Product` terms can make user testing feedback harder to interpret.
- Users may think Dataset and Product are different workflow concepts.

Recommendation:

- Run a UI-only terminology audit before broader rollout.
- Do not rename backend-aligned code identifiers unless there is a separate refactor.

Blocks controlled user testing: No, but it should be fixed before broader rollout if visible labels remain inconsistent.

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

### RR-007: Accessibility and keyboard coverage should get a final pass

Severity: P2

Several custom controls now exist: popup action dropdowns, Dashboard date panel, Product picker dropdown, filter rows, and Dashboard History panel.

Recommended smoke cases:

- Tab through Dashboard header controls, filters, activity actions, and History panel.
- Use Escape on open panels/dropdowns where supported.
- Verify visible focus states in light and dark mode.
- Verify Product picker keyboard behavior in Analyze and Review.

### RR-008: Light/dark mode should be tested after recent UI additions

Severity: P2

Recent additions include Product picker, Dashboard date picker, Dashboard History panel polish, filter option restyling, and clear-button restyling.

Recommended smoke cases:

- Main map filters in light and dark mode.
- Dashboard date panel and History panel in light and dark mode.
- Analyze/Review Product picker dropdown in light and dark mode.
- Popup actions and nested export menu in light and dark mode.

### RR-009: Persisted state reset should be part of user testing instructions

Severity: P2

The app stores some UI preferences and persisted state, including filters and map viewpoint. The filter storage key was bumped during recent filter hardening, but testers should still know how to reset state.

Recommendation:

- Include reset-state instructions in tester notes.
- During QA, test both clean browser state and persisted state.

## P3 findings

### RR-010: Documentation could later split release notes from architecture docs

Severity: P3

The current README and tracker are useful, but they now include both architecture guidance and status/release notes.

Recommendation:

- Keep as-is for now.
- If release cycles become formal, create a dedicated release notes document per internal test release.

## Backend-dependent work to communicate to backend owners

| Topic                  | Required backend decision                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Operation state        | Active per-product operation state and conflict rejection.                                            |
| Async jobs             | Job ID, status endpoint, progress/error states for export/rollback and other long-running operations. |
| Report storage         | Whether frontend receives report IDs, URLs, or both.                                                  |
| Report ownership       | Whether reports belong to product, activity, export job, history event, or multiple scopes.           |
| Dashboard payload size | Whether activity endpoint needs paging/server-side filters after real data volumes are known.         |
| Timeline               | Global map timeline database/API contract.                                                            |

## Recommended next actions

1. Share this review with backend owners before user testing.
2. Run the manual smoke checklist below on a clean browser profile and on an existing profile with persisted state.
3. Fix only P0 issues immediately if any are found during smoke testing.
4. Communicate P1 backend-dependent limitations to testers.
5. Defer report-link UI implementation until backend report contracts are known.
6. Consider the Product terminology audit before broader rollout.

## Manual smoke checklist

### Startup and routes

- Open main map route directly.
- Open `/dashboard` directly.
- Open `/analyze` directly.
- Open `/review` directly.
- Open `/analyze/{product}` directly.
- Open `/review/{product}` directly.
- Reload each route.

### Main map

- Confirm products render.
- Confirm hover highlight works.
- Open popup and confirm product fields are constrained to the intended layout.
- Confirm first popup after fresh load does not show all raw attributes.
- Test manual refresh.
- Test auto-refresh does not show fullscreen loader.

### Main map filters

- Confirm only `Display scale`, `Status`, and `Usage band` are visible.
- Confirm Status includes all statuses from the status endpoint, including count `0` values.
- Select a zero-count status and confirm the map/list result is empty.
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

### Dashboard

- Test range builder with open-ended `To`.
- Test range builder with explicit `From` and `To`.
- Test `Since yesterday` and `Last 7 days` quick actions.
- Test search and filters.
- Click Status summary rows and Operation summary rows.
- Open Dashboard History panel from an activity.
- Close Dashboard History panel with `Close` and Escape.
- Test Review and Analyze links.
- Confirm report actions remain disabled/placeholders as expected.

### Analyze

- Open Analyze directly.
- Use Product picker dropdown.
- Use typed Product fallback.
- Load one product.
- Load multiple products.
- Confirm history content loads or fails per product without breaking the page.
- Confirm product mutation actions are not shown in Analyze sidebar.

### Review

- Open Review directly.
- Use Product picker dropdown.
- Use typed Product fallback.
- Add/remove products.
- Enable/disable products.
- Toggle History, IC-ENC reports, and Internal validation content.
- Confirm Review remains independent of Product Collection after opening.

### Theme and accessibility

- Repeat key checks in light mode and dark mode.
- Tab through Dashboard controls.
- Tab through Product picker.
- Tab through popup actions and nested export menu.
- Confirm visible focus states.
- Confirm Escape behavior for Dashboard History and popup/dropdown flows.

## Release recommendation

Proceed with controlled user testing after one smoke pass of the checklist above. Do not market report links, async job progress, backend operation locking, or global timeline as complete until backend contracts exist.
