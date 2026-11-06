# Product Catalogue module map

This map gives AI-assisted contributors a **navigation starting point**. The paths below reflect known architecture and earlier verified source snapshots; the task's explicit baseline and current file tree remain authoritative. Feature READMEs and tests carry the detailed contracts.

| Area                              | Responsibility                                                                   | Entry points / representative files                                                                                              | Verification focus                                                           |
| --------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| App bootstrap and map lifecycle   | Initialize routes, `Map`/`MapView`, loading and teardown                         | `src/app/bootstrap.js`, `src/app/initMap.js`, `src/features/map/`                                                                | Route/view cleanup, repeated initialization, stale map work                  |
| Data-source registry and adapters | Source definitions, capabilities, active source selection and AOI reconciliation | `src/features/dataSources/config/dataSourceRegistry.js`, `src/features/dataSources/`                                             | Stable identity, no cross-source fallback, refresh generations               |
| Product domain                    | Authoritative normalized Product context and operation eligibility               | `src/features/products/domain/productContext.js`, `productActionAvailability.js`, `productExternalExportState.js`                | Source-aware identity, unknown capabilities, conflict/fail-closed            |
| Product API and jobs              | REST adapters, job/polling state, capability projections                         | `src/features/data/api/productApi.js`, `productJobApi.js`, `exportApi.js`; `src/features/products/services/productJobService.js` | Exact backend contract, cancellation, duplicate-request prevention           |
| Popup lifecycle                   | Popup construction, state reconciliation, action gating, refresh                 | `src/features/map/popups/createPopup.js`, `popupActionConfig.js`, `popupWorkflowActions.js`, `packageActionSession.js`           | Current selection, dispatch authorization, teardown, keyboard/tooltip        |
| Map interaction                   | Graphics, overlap selection, highlighting and status presentation                | `src/features/map/`, `src/features/map/state/featureState.js`                                                                    | Geometry/status ownership, hover-hitTest races, layer replacement            |
| Main-map search and Locator       | Product lookup/selection versus geographic search/navigation                     | `src/features/map/search/`, `src/features/map/locator/`                                                                          | Independent lifecycle, focus, map navigation, source-aware Product selection |
| Product Collection                | Multi-Product selection and workspace launch                                     | Product Collection feature and popup header integration                                                                          | Identity revalidation, retained selection, URL composition                   |
| Dashboard                         | Activity summaries, range/filter/sort/paging and navigation                      | `src/features/dashboard/`                                                                                                        | Draft/applied state, focus, async cursor/sort requests                       |
| Analyze and Review                | Source-aware workspace Product loading and diagnostics                           | `src/features/analyze/`, `src/features/review/`                                                                                  | Independent failures, targeted AOI, stale session, content selection         |
| History / Timeline                | Product history presentation and events                                          | `src/features/timeline/`, `src/features/timeline/events/productHistoryEvents.js`                                                 | Source identity, refresh, lifecycle, date/status semantics                   |
| Onboarding / Preferences          | Route-specific guidance and saved settings                                       | `src/features/onboarding/config/onboardingSteps.js`, shared UI/preferences features                                              | Reopen, missing targets, focus/Escape, route-specific state                  |
| Shared user interaction           | Confirmation, tooltip and focus helpers                                          | `src/shared/ui/confirm/`, `src/shared/ui/focus/`, `src/shared/ui/tooltips/`                                                      | Cleanup, accessibility, avoid duplicate help surfaces                        |
| Global styling                    | Theme, map and popup presentation                                                | `src/styles/`                                                                                                                    | Light/dark contrast, public Calcite tokens, responsiveness                   |

## How to locate a change

1. Start from the requested user behavior and identify the owning feature, not a similarly named button in another workflow.
2. Read that feature's README, source module, direct imports and nearby `*.test.js` or `tests/` files from the task's explicit commit.
3. Follow source/identity/capability ownership into domain or service modules before modifying UI authorization.
4. Check every async producer and consumer for cancellation, generation, cleanup, and duplicate-request behavior.
5. For a UI edit, verify keyboard/focus/Escape and light/dark state; for a backend-affecting edit, verify precise endpoint and failure restrictions.

## Document boundaries

- `AGENTS.md` governs the **development procedure**.
- `INVARIANTS.md` records **preservation constraints**.
- This file maps **navigation and ownership**, not an exhaustive implementation specification.
- Feature READMEs, verified baseline code and current backend contracts explain **actual behavior**.
- `frontend-hardening-tracker.md`, `ui-ux-design-backlog.md` and `frontend-release-readiness-review.md` track **status and acceptance**. Reconcile them against the accepted commit; do not rewrite historical acceptance notes.
