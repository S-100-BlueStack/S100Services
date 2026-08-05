# Frontend hardening tracker

This document tracks frontend-only cleanup, hardening, and architecture improvements for Product Catalogue. The goal is to improve maintainability, reliability, and structure without changing the user-facing feature set unless an item explicitly tracks a feature foundation.

Current reviewed repository baseline: `20a0cab4c64aea42c9ac10aced95f6b592d14280`.
BE-108A documentation baseline: `8caf5f771f1a6721398007589afbe875d553615d`.

## Backend worker-readiness note

BE-106 is documentation-only. It confirms that ProductManagerAPI remains the public API/enqueue/status owner while worker execution may later move to JobPlatform. No frontend runtime change is required, and no shared-worker implementation should begin until JobPlatform is ready.

## Status values

| Status             | Meaning                                                       |
| ------------------ | ------------------------------------------------------------- |
| Todo               | Identified, not started                                       |
| In progress        | Currently being worked on                                     |
| Done               | Implemented and committed                                     |
| Implemented (MVP)  | Implemented as a usable first version with known future scope |
| Deferred           | Deliberately postponed                                        |
| Blocked by backend | Requires backend/API support that does not exist yet          |
| Rejected           | Reviewed and intentionally not changed                        |

## Items

| ID     | Priority | Area               | Item                                                                                           | Status   | Commit                                                                                                                                                                    | Notes                                                                                                                                                                                                                                                                                                                         |
| ------ | -------- | ------------------ | ---------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FH-001 | P0       | Tooling            | Add a real lint/check baseline in addition to Prettier formatting                              | Done     | 966d7aaf508a9e809155847bf4f3ca218db03821                                                                                                                                  | Added ESLint script and check script.                                                                                                                                                                                                                                                                                         |
| FH-002 | P0       | Tooling            | Verify ESLint config format and package scripts                                                | Done     | 966d7aaf508a9e809155847bf4f3ca218db03821                                                                                                                                  | Replaced invalid JSON config with ESLint flat config.                                                                                                                                                                                                                                                                         |
| FH-003 | P0       | API                | Review hardcoded localhost/dev API configuration                                               | Done     |                                                                                                                                                                           | Production should continue using same-root `/api`. Dev may keep localhost or use Vite proxy.                                                                                                                                                                                                                                  |
| FH-004 | P0       | API                | Remove, rename, or isolate old mock/random API code if still present                           | Done     | 966d7aaf508a9e809155847bf4f3ca218db03821                                                                                                                                  | Verified current product API behavior.                                                                                                                                                                                                                                                                                        |
| FH-005 | P0       | Refresh            | Move refresh lifecycle state into the refresh service instance                                 | Done     | f2280260c3f2ffab023a08ebe6de655ffa19191a                                                                                                                                  | Refresh runtime state is scoped to the service instance.                                                                                                                                                                                                                                                                      |
| FH-006 | P1       | CSS                | Split global stylesheet by feature/area                                                        | Done     | c4595599c92869f54896e4ea0b8b4f2923096179 / 8be8f1277d997149e7f0912a32723da29031ce1e                                                                                       | Split stylesheets under `src/styles`, with `src/styles/index.css` as entrypoint.                                                                                                                                                                                                                                              |
| FH-007 | P1       | API                | Add frontend request timeout/abort hardening where possible                                    | Done     | c13dbac7c0e44c608bd43ffd21acf0c90a3fb708                                                                                                                                  | Added optional timeout/abort handling in the API client.                                                                                                                                                                                                                                                                      |
| FH-008 | P1       | API                | Standardize frontend API result/error handling                                                 | Done     | 32819a4bee5b53240f75abf70d3912e0d8edaeda                                                                                                                                  | Centralized API error formatting in `apiResult.js`.                                                                                                                                                                                                                                                                           |
| FH-009 | P1       | Actions            | Add or improve tests around product action availability                                        | Done     | 5ca8c6ebe7ead9171bbbc40793546d37c16c2f67                                                                                                                                  | Added unit tests for product action and export availability states.                                                                                                                                                                                                                                                           |
| FH-010 | P1       | Export             | Review local export operation state and stale UI risks                                         | Done     | 8fb2cfa678ffe236472e1b6c09aca42ffc317023                                                                                                                                  | Local export operations are started/ended through the existing try/finally flow.                                                                                                                                                                                                                                              |
| FH-011 | P1       | Notices            | Add notice deduplication/rate limiting if repeated errors can spam users                       | Done     | 051c419db775579ad8c9c8f82f5f834ecb46252c                                                                                                                                  | Added opt-in notice deduplication.                                                                                                                                                                                                                                                                                            |
| FH-012 | P1       | Popup UI           | Review keyboard/focus/ARIA hardening for custom popup actions                                  | Done     | b3551baf864b7c677fc85756e70363073a1686c2 / 195021ad12b806f08cc26a9e6af02e945be1cbda / 554cb7389079b5943c651d73ff1e9ab79a468247 / 652a922088b895eafcdb1e0a4d200e0c3f2144c5 | Unified popup focus and dropdown Escape behavior.                                                                                                                                                                                                                                                                             |
| FH-013 | P1       | Structure          | Review map feature folder boundaries and imports                                               | Done     | 086944d75b2601b1ba381b01fbeefc37d418bbe6 / 347572001cb3c5dc572470d9a15b94dc8396fb1d                                                                                       | Removed data/map config cycle and documented feature boundaries.                                                                                                                                                                                                                                                              |
| FH-014 | P1       | Structure          | Split product history/timeline naming if needed                                                | Done     |                                                                                                                                                                           | Kept `features/timeline` as shared product history/map timeline feature area.                                                                                                                                                                                                                                                 |
| FH-015 | P2       | Config             | Add or update `.env.example` and document dev/prod API base behavior                           | Done     | 966d7aaf508a9e809155847bf4f3ca218db03821                                                                                                                                  | Added env example and preserved dev/prod API behavior.                                                                                                                                                                                                                                                                        |
| FH-016 | P2       | Bootstrap          | Review Calcite readiness/bootstrap timing                                                      | Done     | 4c2ccbcfa71436d8554fb6512fcb20b658134427                                                                                                                                  | Added shared Calcite component readiness helper.                                                                                                                                                                                                                                                                              |
| FH-017 | P2       | HTML/CSS           | Move inline shell/confirm-popover styling into CSS                                             | Done     | 17eb5a8924112c29a19aaa95042029a39d57e244                                                                                                                                  | Removed inline confirm styling and added dialog semantics.                                                                                                                                                                                                                                                                    |
| FH-018 | P1       | Refresh            | Review duplicate refresh error notices between selected product refresh and full map refresh   | Done     | ed42779ae40fb1c419c15380fd3e22a31baac0fb                                                                                                                                  | Initial popup freshness refresh is silent on failure.                                                                                                                                                                                                                                                                         |
| FH-019 | P2       | Export UI          | Show a loading spinner on the parent `Export...` popup action while an export is running       | Done     | 8fb2cfa678ffe236472e1b6c09aca42ffc317023                                                                                                                                  | Parent export action shows loading while remaining openable. Loading text remains the functional indicator for RDP/VDI sessions where spinner animation may not render.                                                                                                                                                       |
| FH-020 | P3       | Browser QA         | Re-test popup/export rendering artifacts after Chrome/Edge restart                             | Done     | 652a922088b895eafcdb1e0a4d200e0c3f2144c5                                                                                                                                  | No remaining rendering artifacts observed.                                                                                                                                                                                                                                                                                    |
| FH-021 | P0       | Startup            | Restore startup loader sequencing after Calcite readiness changes                              | Done     | 164dae842773c9c4fd606ee2f6a7f776f5ea206e                                                                                                                                  | Reordered startup so UI/map initialize before loader.                                                                                                                                                                                                                                                                         |
| FH-022 | P0       | Data               | Support updated AOI API response shape                                                         | Done     | 164dae842773c9c4fd606ee2f6a7f776f5ea206e                                                                                                                                  | Updated Esri JSON transformer for PascalCase AOI records.                                                                                                                                                                                                                                                                     |
| FH-023 | P2       | Map state          | Persist last map viewpoint                                                                     | Done     | 7d7bcac37b2dd06cff32eccd82a82c0e4c8943d3                                                                                                                                  | Saved and restored main map center, scale and rotation.                                                                                                                                                                                                                                                                       |
| FH-024 | P2       | Loader             | Harden loader/progress session state cleanup                                                   | Done     | 584e012f790bc08203f4ac677ba95043140222b3                                                                                                                                  | Prevented stale loader frames from affecting later sessions.                                                                                                                                                                                                                                                                  |
| FH-025 | P2       | Popup refresh      | Close or invalidate pending confirm popovers when manual refresh rebuilds selected popup state | Done     | 1e0a922c050b557f63e816e0feae645c87b71f67                                                                                                                                  | Pending confirm popovers are cancelled when refresh starts.                                                                                                                                                                                                                                                                   |
| FH-026 | P2       | Preferences        | Add UI for resetting or managing persisted frontend state                                      | Done     | 8e60a66aec95921a6f88836aa93e0963bdd81ef7                                                                                                                                  | Added a Preferences panel for resetting saved frontend state.                                                                                                                                                                                                                                                                 |
| FH-027 | P1       | Analyze            | Support updated Analyze backend response shape                                                 | Done     |                                                                                                                                                                           | Analyze normalization reads top-level product data from `response.Data`.                                                                                                                                                                                                                                                      |
| FH-028 | P1       | Product history    | Use backend product history endpoint                                                           | Done     | 78cd3f2df8d9ea437d689e3e7760c62e45a40a32                                                                                                                                  | Replaced frontend demo product history with `/electronicproducts/{datasetName}/history`.                                                                                                                                                                                                                                      |
| FH-029 | P2       | Product history    | Clean up product history panel UI                                                              | Done     | ef7ee25d742068364d109334b17b560050ba6e15                                                                                                                                  | Removed non-essential metadata from the history summary and subtitles.                                                                                                                                                                                                                                                        |
| FH-030 | P1       | Analyze            | Show product history in Analyze sidebar                                                        | Done     | ad50c2ad3be05952f1955aa29cff8c3f29c0e79c                                                                                                                                  | Analyze product cards reuse the shared Product History renderer.                                                                                                                                                                                                                                                              |
| FH-031 | P2       | Analyze            | Review Preferences availability on Analyze route                                               | Rejected |                                                                                                                                                                           | Full Preferences remain disabled on Analyze because most preferences are main-map scoped.                                                                                                                                                                                                                                     |
| FH-032 | P1       | Product data       | Normalize product export metadata                                                              | Done     | 9ede3a5c94fbce900f0d5ae05d20e826b07faba3                                                                                                                                  | Added shared normalization for product `Exports` metadata.                                                                                                                                                                                                                                                                    |
| FH-033 | P1       | Popup UI           | Render export metadata comparison in product popup                                             | Done     | 9ede3a5c94fbce900f0d5ae05d20e826b07faba3                                                                                                                                  | Popup shows S100 product metadata next to export metadata columns.                                                                                                                                                                                                                                                            |
| FH-034 | P2       | Terminology        | Standardize user-facing naming around Product/Products                                         | Done     | 805a853259b6594fe16384ae37b2e828d6de4c76                                                                                                                                  | Completed a UI-only terminology audit across the main user-facing surfaces. Visible copy uses `Product`/`Products`, technical identifiers such as `datasetName` remain unchanged, and a regression test protects the terminology boundary.                                                                                    |
| FH-035 | P1       | Main map filters   | Restrict main map filters to Display scale, Status and Usage band                              | Done     | 708865afd5e21cc5893f3fade960d63407ec5710                                                                                                                                  | Status options come from the full status/product state endpoint, including count `0` options.                                                                                                                                                                                                                                 |
| FH-036 | P1       | Popup / attributes | Stabilize first-load attribute display                                                         | Done     | 708865afd5e21cc5893f3fade960d63407ec5710                                                                                                                                  | Product popup details no longer fall back to all raw attributes when field/capability metadata is not ready.                                                                                                                                                                                                                  |
| FH-037 | P1       | Popup actions      | Enable S100 Edition export and Rollback                                                        | Done     | a3ab23ee615d59b25cccdda4197b226e7efc09ad                                                                                                                                  | Enabled `S100 > Edition` and `Rollback`; disabled `All` export leaves.                                                                                                                                                                                                                                                        |
| FH-038 | P1       | Release readiness  | Harden Product picker and initial loader UX                                                    | Done     | db6e4a37203a5ae847189d6197ed49d09879e9c4                                                                                                                                  | Header remains usable during initial main-map load; Analyze/Review reject unknown products when catalog validation is available; Product picker hides already-added products and no longer toggles from its label.                                                                                                            |
| FH-039 | P1       | Keyboard           | Harden route and panel Escape behavior                                                         | Done     | 300f68cd9d463ef023b432b4097c08abb9e8b2bd                                                                                                                                  | Escape closes the top-most relevant UI layer, including notification panel, filter/preferences panels, main popup, main Product History panel, Analyze popup and popup action dropdowns. Dashboard time inputs no longer trap Tab navigation.                                                                                 |
| FH-040 | P2       | Product history    | Collapse Product History entries by default                                                    | Done     | 8e72ca28f23dc9317ce58b2930807ed989c4d6ef                                                                                                                                  | Shared Product History renderer now collapses event metadata by default on the main map and Dashboard panels. Collapsed rows show title, timestamp and short description; users expand individual rows to see details.                                                                                                        |
| FH-041 | P2       | Product history    | Improve Product History version-change summaries                                               | Done     | 900299f523e97c021a6736c78de6a46bff54cac4                                                                                                                                  | History summaries now describe edition/update changes even when status remains unchanged. Backend should still prevent invalid negative version values.                                                                                                                                                                       |
| FH-042 | P2       | Main map           | Add Product search overlay                                                                     | Done     | 046ea8495f48ffbc2f76c1aa5e0da33fb5317466                                                                                                                                  | Main map has a catalog-backed Product search overlay that opens the selected product popup.                                                                                                                                                                                                                                   |
| FH-043 | P1       | User guidance      | Add hover help/tooltips to clickable controls                                                  | Done     | 982d9be01f1ace939fe479494c8e05b5c347107e                                                                                                                                  | Added global hover help that applies concise native tooltips to route navigation, main map controls, Product search, filters, popup actions, Dashboard controls, Product picker actions, Product Collection actions and common icon-only controls. Also covered Dashboard activity links and Analyze Open all / Collapse all. |
| FH-044 | P1       | User guidance      | Add introduction flow for first-time users                                                     | Done     | 0c677549963bb7ce4206fed379dd30dc8c2cc783                                                                                                                                  | Completed compact first-time and replayable onboarding with independent route preferences. Main map, Dashboard, Analyze and Review flows are manually verified, including Theme, Preferences and the interactive Product popup/Product Collection sequence.                                                                   |
| FH-045 | P1       | Release readiness  | Run comprehensive smoke test across routes and critical workflows                              | Done     |                                                                                                                                                                           | Completed against `805a853259b6594fe16384ae37b2e828d6de4c76` with clean and persisted browser state. Main map, Dashboard, Analyze, Review, onboarding, preferences, keyboard behavior and critical Product workflows passed without new frontend findings.                                                                    |
| FH-046 | P0       | Async operations   | Activate async Export/Rollback job tracking                                                    | Done     | 279fe6a761229fd99af437d0f8401508985afafc                                                                                                                                  | Uses async start endpoints, persisted job IDs, reload recovery, bounded status polling, terminal notices and route refresh.                                                                                                                                                                                                   |
| FH-047 | P0       | Operation state    | Add backend-authoritative active job visibility                                                | Done     | 279fe6a761229fd99af437d0f8401508985afafc                                                                                                                                  | Popup-open reconciliation and fail-closed mutation preflight use `GET /jobs/active`; shared visibility works across tabs, profiles, users and computers.                                                                                                                                                                      |
| FH-048 | P1       | Popup refresh      | Preserve popup, actions and dropdowns during compatible refresh                                | Done     | 69752605d935212e89ca7ad4286ca3e46ecb4abe                                                                                                                                  | Reconciles layers/graphics and popup details in place, retains Calcite action DOM and open dropdown state, and falls back to full rebuild for incompatible structural changes.                                                                                                                                                |
| FH-049 | P1       | Dashboard          | Move Dashboard filtering and activity paging to the backend                                    | Done     | 7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd                                                                                                                                  | Added additive server filters, 50-row cursor pages, complete-result summaries, stale-result suppression, last-successful-result retention and compact Previous/Next controls. Manual Dashboard pagination verification passed at `7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd`.                                                  |

## Deferred / backend-dependent notes

| ID     | Area     | Item                                                   | Status                                   | Notes                                                                                                                                              |
| ------ | -------- | ------------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| BE-001 | Export   | Cross-browser/cross-user export-in-progress visibility | Done                                     | Backend-authoritative active-job discovery is integrated into popup state and mutation preflight.                                                  |
| BE-002 | Export   | Async export job with job-status endpoint              | Done                                     | New Edition and Rollback use async start endpoints, persisted polling and terminal refresh.                                                        |
| BE-003 | Timeline | Global map timeline data contract                      | Blocked by backend                       | Product-level history endpoint exists. Global map timeline remains deferred until API/database contract is known.                                  |
| BE-004 | API      | Safe timeout policy for long-running operations        | Done                                     | Job-start requests avoid unsafe client timeout; repeatable status requests use finite timeout and bounded retry.                                   |
| BE-005 | Reports  | Real Dashboard IC-ENC/internal validation report links | Blocked by backend                       | Requires report IDs/storage contracts before Dashboard report actions can be enabled.                                                              |
| BE-006 | Jobs     | Atomic Product operation claim before enqueue          | Planned                                  | Required to eliminate the remaining near-simultaneous enqueue race and support a distributed external worker cleanly.                              |
| BE-007 | Jobs     | External shared Hangfire worker migration              | Deferred / architecture review           | Current HTTP/job contracts are reusable, but worker dependencies, queues, shared storage and ArcGIS/file access must be reviewed before migration. |
| BE-008 | Timeline | Product History audit event hardening                  | Design approved / implementation pending | BE-108A is split into foundation and producer/recovery batches. Legacy state history remains; runtime and SQL implementation have not started.     |

## Future implementation ideas

| ID     | Area                             | Idea                                                                     | Status                                    | Notes                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | -------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FI-001 | Dashboard                        | Add operational activity dashboard                                       | Done                                      | Added `/dashboard` with Danish operational time, compact range builder, summaries, activity list, actionable status/operation rows, Dashboard History, Review/Analyze links, server-side search/filtering, cursor pagination, stale-request cancellation and last-successful-result retention. Real report links remain blocked by backend report IDs/storage contracts.                               |
| FI-002 | Product review / Product history | Add Product Review workspace for multiple histories and report content   | Implemented (MVP)                         | Added a dedicated Product Review workspace that opens in a separate tab/window and allows users to compare multiple products.                                                                                                                                                                                                                                                                          |
| FI-003 | Analyze                          | Show internal validation reports in Analyze                              | Done/Semi-done (Missing endpoint)         | Add internal validation reports to the Analyze page near the IC-ENC XML/report area.                                                                                                                                                                                                                                                                                                                   |
| FI-004 | Analyze                          | Improve Analyze product name management                                  | Done                                      | Replaced manual URL/query separator management with a structured product list UI.                                                                                                                                                                                                                                                                                                                      |
| FI-005 | Analyze                          | Add product collection tray for Analyze from map                         | Done                                      | Added a main-map workflow for collecting products before opening Analyze or Review.                                                                                                                                                                                                                                                                                                                    |
| FI-006 | Analyze / Review                 | Add shared product catalog picker for direct Analyze/Review access       | Done                                      | Uses the lightweight `GET /electronicproducts` endpoint to power a shared searchable Product picker reused by Analyze and Review.                                                                                                                                                                                                                                                                      |
| FI-007 | Main map                         | Add main page Product search                                             | Done                                      | Added a compact Product search overlay that suggests catalog products and opens the selected Product popup on the main map.                                                                                                                                                                                                                                                                            |
| FI-008 | Introduction flow                | Add compact first-time and replayable route guidance                     | Done                                      | Completed and manually verified at `0c677549963bb7ce4206fed379dd30dc8c2cc783`. Each route has independent first-time state and replay from Preferences. Main map includes Product search, filters, interactive popup/Product Collection guidance, workspace navigation, Theme and Preferences. Dashboard, Analyze and Review use compact route-specific flows with Product prerequisites where needed. |
| FI-009 | Dashboard                        | Add user-selectable Dashboard page size                                  | Todo                                      | Backend paging already accepts `1-200`; define compact frontend options, persistence and reset behavior before enabling it.                                                                                                                                                                                                                                                                            |
| FI-010 | Dashboard                        | Add sortable Dashboard activity columns                                  | Todo                                      | Define supported server-side sort fields, direction, stable tie-break ordering and cursor compatibility before adding sortable headers.                                                                                                                                                                                                                                                                |
| FI-011 | Main map / Data sources          | Add independent Product-standard data sources and source-aware workflows | Design revised / backend contract pending | Final logical sources are `S-57`, `S-101`, `Paper Charts`, and `S-102`; `S-122` is a future source. Do not persist or expose a combined `ENC Products` source as the final boundary. The generic concurrency, lifecycle, capability, and source-aware identity foundation remains valid, but the concrete registry and defaults must be revised after the S-57/S-101 backend contract is agreed.       |
| FI-012 | Main map / Location search       | Add Denmark and Greenland map locator                                    | Todo                                      | Add a compact ArcGIS Search component opened from a binoculars button beside Product search. Search addresses and populated places in Denmark and Greenland only, navigate without a marker or popup, keep Product state unchanged, and prepare configuration for later API-backed custom search sources.                                                                                              |
| FI-013 | Product terminology              | Rename Product Catalogue S100 terminology to S-101                       | Todo                                      | Use `S-101` for the ENC Product specification in live UI/domain copy. Preserve legitimate generic `S-100` standard references and isolate any legacy `S100` API/wire value behind an adapter until backend contracts are renamed.                                                                                                                                                                      |
| FI-014 | Popup actions                    | Rename Rollback to Cancel Export and replace its icon                    | Todo                                      | Update live UI copy, confirmation, notices, availability reasons, guidance, and tests to `Cancel Export`. Use a cancellation icon rather than an undo/rollback metaphor; keep any legacy endpoint/action identifier internal until backend contracts change.                                                                                                                                           |
| FI-015 | Product Collection               | Use graph-bar for Add to collection                                      | Todo                                      | Replace the popup Add to collection icon with Calcite `graph-bar`, preserving tooltip, active state, accessibility, and existing collection behavior.                                                                                                                                                                                                                                                  |
| FI-016 | Main map / Symbology             | Define a new Product AOI status palette                                  | Blocked by backend                        | Wait for the authoritative backend status definition and error classification. Then define centralized, accessible light/dark symbology with stable status semantics across independently rendered sources.                                                                                                                                                                                            |
| FI-017 | Branding / Deployment            | Make application logo environment-configurable                           | Todo                                      | Load the deployment logo from non-secret environment configuration with a generic non-GST static fallback. A missing or failed custom logo must not break layout or startup.                                                                                                                                                                                                                           |
| FI-018 | Open source readiness            | Remove organization-specific deployment assumptions                      | Future review                             | Audit branding, configuration, URLs, authentication assumptions, documentation, sample data, secrets, licenses, and deployment defaults so a third party can deploy the application without editing GST-specific source code.                                                                                                                                                                          |
| FI-019 | Analyze / Review routing         | Replace path-concatenated Product URLs with canonical query routes       | Todo / source-aware format decision       | Move Analyze and Review away from `/route/ProductA&ProductB`. Use query parameters and canonical URL encoding. Bare `Datasets=` is only safe if Product keys are globally unique; the final route payload must preserve source-aware identity.                                                                                                                                                         |
| FI-020 | Popup / Related Products         | Navigate backend-linked Products across data sources                     | Blocked by backend contract               | Render dynamic backend-provided Product relationships, initially including S-101/S-57 links, without hardcoding source pairs. Linked targets must carry stable source-aware identity and support future Paper Charts, S-102, S-122, and other source relationships.                                                                                                                                    |
| FI-021 | Product Collection               | Explore modifier-click collection shortcuts                              | Nice to have / design exploration         | Investigate a discoverable keyboard-and-mouse shortcut for adding/removing map Products from Product Collection. Prefer Ctrl/Cmd-click exploration; do not assign Shift-click until range/selection semantics and conflicts with map navigation are defined.                                                                                                                                           |

## Planned order

1. Keep the tested async operation and popup-preserving refresh baseline stable.
2. Use the completed BE-106 external-worker readiness review as the implementation gate; do not move Product Catalogue jobs until JobPlatform is ready.
3. Keep atomic Product-operation ownership deferred until its persistence owner, recovery contract and distributed-worker boundary are approved.
4. BE-107 Dashboard filtering and pagination is complete and manually verified at `7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd`.
5. BE-108A design is approved at documentation baseline `8caf5f771f1a6721398007589afbe875d553615d`; the next runtime package is Batch 1 foundation only after explicit implementation approval.
6. Keep Batch 2 producer/recovery work separate until Batch 1 is built, tested, and reviewed.
7. Keep report-link UI and deferred producers blocked until backend report IDs, storage, and producer contracts exist.
8. Continue targeted regression smoke tests after frontend or backend contract changes.
9. Pause FI-011 runtime acceptance until the backend contract defines independent S-57 and S-101 Products, stable identities, source discrimination, status values, relationships, and operation capabilities. Do not fake the split by duplicating or inferring from the current combined AOI payload.
10. Rework FI-011A from the committed baseline after the contract is known. Preserve the reviewed concurrency, prepared-candidate commit, fail-closed identity, capability, and source-owned layer concepts, but replace the combined `enc-products` registry/storage boundary.
11. FI-012 Locator and the independent UI/documentation items FI-013 through FI-017 and FI-019 may be implemented while the FI-011 backend contract is pending, subject to their own dependencies.
12. Implement FI-011 in focused slices: generic source foundation and migration; S-57/S-101 transport integration; Paper Charts/S-102 mocks; filters/search/collection/workspaces; popup/export/related Products; guidance and final regression coverage.
13. Complete FI-016 only after the backend status list identifies authoritative error states and display semantics.
14. Treat FI-018 as a later cross-repository release-readiness review after configurable branding and deployment settings are established.

## FI-011 independent Product-standard data sources and source-aware workflows

Status: Design revised / implementation paused pending backend contract  
Architecture revision baseline: `a723a567f23847a6bdfde413f373a25bef02ff1a`  
Superseded candidate SHA-256: `779cebfbff02efc4e02c51af183e9f29401df7947c0ed63a6b1efdbb401e7ee6`

### Architecture revision

The corrected FI-011A candidate is not approved for commit in its current form because it establishes `enc-products` / `ENC Products` as one public logical source with a combined ENC export profile. The agreed target model requires S-57 and S-101 to be independent Product sources, even when their AOIs overlap spatially or a backend implementation shares transport infrastructure.

The following candidate concepts remain approved and must be preserved in the reworked implementation:

- a central declarative source registry;
- source-owned one-or-more-layer lifecycle;
- requested versus confirmed enablement;
- versioned persistence and reset boundaries;
- prepared hidden candidates followed by a generation-guarded synchronous commit;
- stale activation/refresh/reset suppression;
- independent source loading, error, and refresh state;
- fail-closed stable Product identity;
- source-aware identity equivalent to `{ sourceId, productKey }`;
- centralized capabilities that prevent calls to unsupported source endpoints;
- Development-only Paper Charts and S-102 fixtures.

Do not reuse the candidate ZIP as an uncontrolled source of truth. Rebuild the implementation from the committed baseline after the backend contract below is resolved, applying only reviewed concepts and intentional FI-011 changes.

### Goal and logical source taxonomy

Extend the Main map from one hardcoded combined AOI flow to independently enabled logical Product sources:

| Source ID      | UI label       | First implementation     | Notes                                                 |
| -------------- | -------------- | ------------------------ | ----------------------------------------------------- |
| `s57`          | `S-57`         | Backend contract pending | Independent Product/action/filter/export track.       |
| `s101`         | `S-101`        | Backend contract pending | Replaces current Product-specific `S100` terminology. |
| `paper-charts` | `Paper Charts` | Development mock first   | Production endpoint and capabilities remain pending.  |
| `s102`         | `S-102`        | Development mock first   | Production endpoint and capabilities remain pending.  |

`S-122` is a known future source but is not part of the current implementation scope. The registry must permit it later without redesign.

`ENC Products` may be used as a generic explanatory category in documentation when useful, but it must not be the permanent runtime source ID, toggle, persisted state key, Product identity, or export profile for S-57 and S-101.

S-57 and S-101 may have identical or overlapping AOI geometry. They remain separate Products with separate identity, selection, popup, filters, Product Collection entries, actions, operation state, History, and exports. Spatial equality must never merge them.

### Mandatory backend contract gate

Do not implement or simulate the user-facing S-57/S-101 split until the backend contract explicitly defines:

1. whether loading uses separate endpoints or a shared endpoint with an authoritative source/product discriminator;
2. the canonical wire values for S-57 and S-101, including whether legacy `S100` values remain temporarily;
3. a stable Product key within each source and the server-side operation identity used for mutation conflict handling;
4. geometry/AOI representation and whether multiple records can share the same geometry;
5. the authoritative status enumeration and which statuses count as errors;
6. source-specific availability for Freeze, Unfreeze, Send to IC-ENC, Cancel Export, Edition export, Update export, History, reports, Analyze, and Review;
7. source-specific API routes or request fields for reads, actions, exports, cancellation, History, and report lookup;
8. the relationship payload linking Products across sources, including source ID, target key, relation type, display label, and missing/deleted target behavior;
9. freshness, paging, batch, and selected-Product lookup behavior;
10. whether the current combined AOI endpoint remains temporarily supported and how it is retired.

The frontend must consume explicit backend source identity. It must not infer S-57 versus S-101 from export availability, matching names, shared geometry, attribute guesses, or related-record assumptions.

### Source registry and transport separation

The source registry is the logical Product boundary. It must support a source referencing a loader/provider that may be shared with another source without merging their runtime state.

Each source definition must include, directly or through adapters:

- stable source ID and user-facing label;
- configuration availability;
- first-visit initialization policy and migration policy;
- loader/provider reference and response partitioning contract;
- response normalizer and stable Product key strategy;
- one or more owned logical layers;
- renderer and filter metadata;
- Product search provider;
- source capabilities;
- export leaves (`Edition`, `Update`);
- source-aware route/session serialization;
- related-Product support metadata.

If one backend request returns more than one logical source, the provider may fetch once, but it must partition records by an authoritative server field before normalization and commit. Each logical source still owns independent state, layers, filters, visibility, refresh results, and failure handling.

### First visit, persistence, migration, and reset

The final split-source default view is:

```text
S-57 = enabled
S-101 = enabled
Paper Charts = enabled
S-102 = enabled
Status filters = error-only per active source
```

This seed applies only when no valid Product-source/filter preference state exists for the user.

After initialization:

- versioned `localStorage` owns each user's source and filter choices;
- reload restores the exact saved source/filter state;
- adding a later source such as S-122 must not silently enable it for an existing user merely because its registry default is enabled;
- storage migration must distinguish a true first visit from an existing-state migration;
- a valid existing user state missing a newly introduced source keeps that source disabled unless a specific migration is approved;
- replacing legacy `enc-products` state requires a new schema version and explicit migration; it must not copy one combined boolean into both S-57 and S-101 without an approved rule.

Both local Data sources reset and the broader Preferences reset restore the current deployment defaults: every configured source enabled and each source's status filter set to the authoritative error-only preset. Exact error statuses remain blocked by FI-016/backend status definitions.

### Data sources control and lifecycle

Keep the compact icon-only `Data sources` navbar action using Calcite `data`. The popover renders one switch per configured and available logical source.

Requirements:

- every source can be independently enabled and disabled, including all-off;
- first activation and reactivation complete fetch, normalize, candidate preparation, generation validation, commit, visibility, and persistence atomically from the user's perspective;
- source loading/error state is independent;
- a stale operation cannot mutate a newer map representation or persisted state;
- failed initial activation returns only that source to off and leaves no partial layer;
- failed refresh of an already active source retains its last successful representation;
- disabling a source invalidates its reads, hides all owned layers, closes source popup/History/action UI, clears hover and selection, clears source filters, removes source Products from Product Collection and Product search, and does not cancel an already accepted backend job;
- reactivation always fetches fresh data before revealing cached graphics;
- only active sources participate in manual and automatic refresh.

A source may own one or more ArcGIS layers. Do not add extra layers without a concrete geometry or rendering reason.

### Filters and initial error-only view

Keep one shared filter panel with independent sections and state per source. A filter selected under one source must never affect another source.

When a user has no valid saved filter state, each active source starts with its authoritative error statuses selected so the initial map view shows Products requiring attention. Do not hardcode guessed status names before the backend status contract is approved.

Requirements:

- only active sources appear;
- options and counts are computed per source;
- source sections may expose Display scale, Status, Usage band, or future source-specific fields when supported;
- missing attributes omit or mark only that source's filter unavailable;
- source disable clears its runtime filter state;
- saved user filters take precedence over first-visit defaults;
- reset restores the error-only preset.

### Product search, popup, collection, workspaces, and History

All shared Product surfaces use `{ sourceId, productKey }` identity and operate only on active sources where applicable.

The intended shared support is:

| Capability             | S-57                         | S-101                        | Paper Charts MVP                      | S-102 MVP                             |
| ---------------------- | ---------------------------- | ---------------------------- | ------------------------------------- | ------------------------------------- |
| Map rendering          | Yes after contract           | Yes after contract           | Yes                                   | Yes                                   |
| Hover highlight        | Yes                          | Yes                          | Yes                                   | Yes                                   |
| Product popup          | Yes                          | Yes                          | Yes                                   | Yes                                   |
| Source filters         | Yes                          | Yes                          | When attributes exist                 | When attributes exist                 |
| Product search         | Yes                          | Yes                          | Yes                                   | Yes                                   |
| Product Collection     | Yes                          | Yes                          | Yes                                   | Yes                                   |
| Analyze / Review entry | Yes                          | Yes                          | Yes with unavailable backend sections | Yes with unavailable backend sections |
| History / reports      | Contract required            | Contract required            | Unavailable until endpoint            | Unavailable until endpoint            |
| Mutations              | Contract required per source | Contract required per source | Disabled                              | Disabled                              |
| Export execution       | Contract required            | Contract required            | Disabled placeholder                  | Disabled placeholder                  |

Product search aggregates active source providers and labels ambiguous results with their source. Product Collection may contain Products with equal Product keys from different sources. Analyze, Review, History, export state, popup restore, and route/session data must preserve source identity.

### Popup Export contract

The selected Product source already supplies the export context. The popup Export dropdown must therefore show only leaf actions:

```text
Export...
  Edition
  Update
```

Do not render `All`, `S57`, `S100`, `S101`, `Paper Charts`, `S-102`, or other source/type submenus inside a Product popup.

Rules:

- Edition and Update visibility/availability comes from the selected source capability/profile;
- unsupported leaves may be disabled placeholders only when useful to communicate planned support;
- Paper Charts and S-102 start without real export execution;
- operation/loading/conflict state is keyed by source-aware Product identity and leaf;
- an operation on one Product/source must not lock an unrelated Product/source;
- API dispatch must be source-aware before any new capability is enabled.

### Cancel Export terminology

The existing Product action known as `Rollback` represents cancellation of an export and must become `Cancel Export` in live UI. FI-014 owns the focused terminology/icon implementation, but FI-011 capabilities and documentation must use the new semantic name. A legacy API endpoint or internal adapter may retain `rollback` temporarily; it must not leak into user-facing copy or be treated as a generic data rollback operation.

### Related Products across sources

The popup must be able to show backend-provided related Products, initially including S-101 to S-57 and S-57 to S-101. The implementation must be data-driven and support Paper Charts, S-102, S-122, and future sources without adding hardcoded source-pair UI.

The frontend requires an explicit relationship target containing at least:

```text
sourceId
productKey
relationType
displayLabel
```

Optional geometry/extent may be supplied, but target navigation should prefer loading the authoritative target Product from its source. Do not infer relationships from equal dataset names or overlapping geometry.

Before implementation, decide and document the disabled-target behavior: either offer explicit activation or activate/load the target source as part of navigation. Failure must retain the current Product context and show a notice. Missing/deleted targets render a safe unavailable state.

### Development mocks

Paper Charts and S-102 may continue using Development-only fixtures:

```text
GET /mock/paper-charts -> mock/some_products.geojson
GET /mock/s102         -> mock/products.geojson
```

They are not production contracts. Do not create fake S-57 and S-101 mock sources from the current combined AOI payload unless the backend developer supplies an authoritative fixture with explicit logical source identity.

### Implementation slicing

Recommended packages after the backend contract is recorded:

1. **FI-011A revised foundation** — generic registry/controller/map lifecycle, storage migration policy, source-aware identity, mock endpoints, and no permanent combined source.
2. **FI-011B S-57/S-101 transport integration** — authoritative source partitioning/loading and independent layers/state.
3. **FI-011C shared workflows** — filters, Product search, Product Collection, Analyze, Review, History unavailable states, and source-aware routing.
4. **FI-011D popup/export/relationships** — leaf-only Export menu, source-aware actions, related Products, Cancel Export integration, and conflict keys.
5. **FI-011E defaults/guidance/regression** — first-visit all-on/error-only initialization, storage migration, onboarding, accessibility, and full regression pass.

### Acceptance criteria

FI-011 is complete only when:

1. S-57, S-101, Paper Charts, and S-102 are separate logical sources and no public combined `ENC Products` source remains.
2. S-57 and S-101 can have equal geometry and Product names without identity, popup, filter, collection, or operation collisions.
3. The backend contract supplies authoritative source identity; the frontend performs no heuristic split.
4. A true first visit starts with all configured sources active and error-only filters.
5. Existing valid user storage is restored without silently enabling newly added sources.
6. Reset restores the current all-on/error-only defaults.
7. Every source can be independently activated, refreshed, disabled, and reactivated with generation-safe lifecycle behavior.
8. Paper Charts and S-102 work from Development-only mocks without calling S-57/S-101 endpoints.
9. Filters remain source-separated and Product search aggregates only active sources.
10. Popup, hover, Product Collection, Analyze, Review, History, routes, and operation state use source-aware identity.
11. Export shows only Edition and Update for the selected Product source.
12. Unsupported actions and reports fail closed without cross-source API calls.
13. Backend-provided related Products render dynamically without hardcoded source pairs.
14. Live UI uses S-101 rather than Product-specific S100 terminology and uses Cancel Export rather than Rollback.
15. Main map onboarding explains independent sources, first-visit defaults, filters, Product search, and related Product navigation.
16. Light/dark, keyboard, focus, notices, RDP/VDI, and existing ENC behavior pass regression testing through the migration period.
17. `cd src/ProductCatalogue && npm run check` passes.

### Out of scope until separately approved

- production Paper Charts, S-102, or S-122 endpoint contracts;
- heuristic splitting of the current combined AOI response;
- enabling S-57/S-101 actions before backend capability/operation contracts;
- the final AOI status palette before FI-016;
- global timeline work;
- modifier-click Product Collection shortcuts from FI-021;
- open-source readiness review from FI-018.

## FI-012 Denmark and Greenland map locator

Status: Todo  
Documentation baseline: `20a0cab4c64aea42c9ac10aced95f6b592d14280`  
Implementation order: independent; may proceed while the FI-011 backend contract is pending

### Goal

Add a compact geographic Locator to the Main map so users can quickly navigate to an address, city, or geographic place in Denmark or Greenland while working with Product corrections. The Locator is navigation assistance only and must remain independent from Product search, Product selection, popup state, filters, and source enablement.

### ArcGIS component choice

Use the ArcGIS Maps SDK Search web component (`arcgis-search`) supported by the current 5.x SDK. Do not introduce the deprecated `@arcgis/core/widgets/Search` widget.

Use an explicit source configuration rather than relying on unrestricted default sources. The initial source configuration uses an approved ArcGIS locator/geocoding service and must be replaceable without changing the Locator UI controller.

Before runtime implementation, confirm and document:

- the organization-approved locator URL;
- ArcGIS Online, Enterprise, API key, user authentication, or other token strategy;
- where non-secret locator configuration is supplied;
- how credentials are kept out of committed frontend source;
- the verified country restriction mechanism for Denmark and Greenland.

The functional requirement is fixed even if the service configuration differs: return results from Denmark and Greenland only and exclude the Faroe Islands. A valid implementation may use one locator request supporting multiple source countries or two configured `LocatorSearchSource` instances searched together. The final choice must be verified against the approved service rather than assumed from the public service defaults.

### UI placement and behavior

Add an icon-only Locator button directly beside the existing Main map Product search control. Use the Calcite `binoculars` icon to match the established ArcGIS Locator metaphor.

The button opens a simple compact Locator overlay containing the Search component. The first version should reuse the existing Product search overlay's compact positioning and interaction conventions where practical, without merging the two search experiences.

Required behavior:

- tooltip and `aria-label`: `Locator`;
- clicking the button toggles the Locator overlay;
- Escape and click-outside close the overlay and restore focus to the button;
- opening Locator may close Product search if both overlays would conflict spatially;
- Product search remains a separate control and retains its existing behavior;
- no permanent large search panel is added to the map;
- the first implementation may be visually iterated later without changing the search contract.

### Search scope

Initial geographic results are limited to:

- addresses;
- populated places and administrative place names;
- postal locations when supported by the approved locator.

General business and point-of-interest discovery is not part of the first version.

Country scope:

- Denmark: included;
- Greenland: included;
- Faroe Islands: excluded;
- all other countries: excluded.

The source should use explicit category filters equivalent to `Address`, `Populated Place`, and `Postal` where supported. Category and country values must be verified against the selected locator service and must not silently fall back to unrestricted worldwide search.

### Result behavior

Selecting a result must:

- navigate the existing `MapView` to the result extent or locator-provided scale;
- use a configured fallback zoom scale only when the locator does not return a useful extent;
- not render a result marker or retained result graphic;
- not open a locator popup;
- not open, close, or replace a Product popup solely because a location result was selected;
- not change selected Product identity, hover highlight, Product Collection, filters, enabled data sources, or operation state.

Clearing or closing Locator clears its search UI but does not restore the previous map viewpoint. A later Product interaction continues using the normal Product popup and selection lifecycle.

### Extensible search-source configuration

Create a small Locator search-source registry or factory. The UI controller must consume configured Search sources rather than hardcoding the public World Geocoding Service directly.

The first release contains only geographic locator sources. The architecture must allow later custom ArcGIS `SearchSource` entries backed by Product Catalogue APIs.

A later database-backed source may search configured Product or related-data attributes and return suggestions/results with a geometry or extent. Because current Product layers are client-side GraphicsLayers, do not assume ArcGIS `LayerSearchSource` can query them. Future attribute search should use an API-backed custom source with explicit `getSuggestions` and `getResults` behavior or a future searchable service layer.

Future source additions must not blur the current workflow boundaries:

- Product search remains the dedicated quick Product lookup that opens Product popups across active Product sources;
- Locator remains map navigation and multi-source geographic/domain search;
- any future duplicated search domain must be reviewed before being enabled in both controls.

### Failure and loading behavior

The Search component owns normal suggestion/result loading. Integrate failures with existing notices only when the component does not already provide a clear local error or when configuration/authentication fails.

Requirements:

- no fullscreen loader;
- no unhandled promise rejection for locator/auth/network failure;
- no stale result navigation after the user closes or replaces a search;
- failed search must leave the current map viewpoint and Product state unchanged;
- missing locator configuration disables the Locator button with a useful tooltip/notice in development rather than silently enabling worldwide defaults.

### Guidance, accessibility, and visual requirements

Update the versioned Main map introduction added under FI-011 to explain:

- Locator searches geographic places and addresses;
- Product search searches Products;
- selecting a Locator result moves the map without selecting a Product.

If FI-012 is implemented in a later package than FI-011, bump the Main map onboarding version again or add the Locator step before FI-011 is committed. Do not reset Dashboard, Analyze, or Review onboarding state.

The Locator button and overlay must support keyboard navigation, focus restoration, English UI text, light/dark mode, compact square styling, tooltips, and static loading/error cues suitable for RDP/VDI.

### Acceptance criteria

FI-012 is complete only when:

1. A binoculars Locator button is positioned beside Product search.
2. The button opens and closes a compact Search component overlay with correct keyboard and focus behavior.
3. Searches such as `Køge`, `Fredericia`, `Aalborg`, a valid Danish address, and a valid Greenlandic place navigate to the correct area.
4. Results outside Denmark and Greenland are not returned.
5. Faroe Islands results are not returned.
6. Business/POI-only searches are excluded from the first version where category filtering supports that distinction.
7. Selecting a result navigates without a marker or locator popup.
8. Locator use does not mutate Product popup, selection, hover, filters, Product Collection, data-source, or operation state.
9. Product search continues to work independently across active Product sources.
10. Missing or invalid locator authentication/configuration fails closed instead of enabling unrestricted defaults.
11. The source registry can accept a future custom API-backed Search source without rewriting the Locator UI.
12. Main map onboarding and hover help explain Locator versus Product search.
13. Light and dark mode manual verification passes.
14. `cd src/ProductCatalogue && npm run check` passes.

### Out of scope for the first implementation

- search in Product Catalogue database attributes;
- search in connected/related records;
- client-side GraphicsLayer `LayerSearchSource` integration;
- reverse geocoding from map clicks;
- result markers or locator popups;
- general businesses and points of interest;
- Faroe Islands or worldwide results;
- changes to Product search behavior beyond FI-011 active-source aggregation.

## FI-013 S-101 terminology correction

Status: Todo

Replace Product-specific live `S100` / `S-100` terminology with `S-101` across Product Catalogue UI, popup metadata, export labels, notices, tooltips, onboarding, tests, and current documentation.

Do not perform a blind repository-wide replacement. `S-100` is also a legitimate umbrella standard name and may remain where it describes the standard, platform, repository, or a backend wire contract. If the backend still accepts a value such as `S100`, keep that value behind an explicit adapter/mapping while presenting `S-101` to users.

Historical commit log entries may retain the terminology used by the original commit. Active requirements and live UI must use the corrected term.

Acceptance requires representative terminology regression tests and explicit verification that API request values have not changed accidentally.

## FI-014 Cancel Export action terminology and icon

Status: Todo

Rename the user-facing `Rollback` Product action to `Cancel Export` because the action cancels the Product's export state rather than performing a generic data rollback.

Update:

- popup label and tooltip;
- confirmation title/body/buttons;
- success, warning, and error notices;
- disabled reasons and action availability copy;
- onboarding/help/documentation;
- accessibility labels and tests;
- the rollback/undo-style icon to Calcite `x-circle` or an equivalently explicit cancellation icon available in the installed icon set.

Keep legacy endpoint paths, response codes, or internal action IDs only behind the API/domain adapter until a backend rename is approved. Do not rename unrelated transactional rollback or map-adapter rollback terminology.

## FI-015 Product Collection popup icon

Status: Todo

Use Calcite `graph-bar` for the popup `Add to collection` action. Preserve the current tooltip, active/selected state, remove/toggle behavior, keyboard accessibility, and onboarding targeting. Verify the icon in light/dark mode and at the compact popup action size.

## FI-016 Product AOI status palette

Status: Blocked by backend status definitions

Create a centralized replacement palette only after the backend provides the authoritative Product status list, stable status values, and the subset classified as errors.

The palette must:

- preserve the same status meaning across sources unless a source has an approved override;
- remain distinguishable in light and dark mode;
- avoid relying on color alone where selected, hovered, disabled, or overlapping Products require another cue;
- support the first-visit error-only filter preset from FI-011;
- define fallback rendering for unknown future statuses;
- include visual regression/manual checks for overlapping S-57 and S-101 AOIs.

## FI-017 environment-configurable branding logo

Status: Todo

Replace the GST-specific static logo as the deployment default.

Recommended configuration boundary:

```text
VITE_APP_LOGO_URL
VITE_APP_LOGO_ALT
```

Requirements:

- non-secret environment configuration may provide an absolute or deployment-relative logo URL;
- the repository includes a neutral generic fallback asset;
- missing, invalid, or failed custom assets fall back without breaking navbar/layout startup;
- no GST name, path, or visual identity is required in source code to deploy another organization;
- documentation explains build-time Vite configuration and fallback behavior;
- accessibility uses configured or generic alternative text.

This item is a prerequisite/input to FI-018 but does not itself complete open-source readiness.

## FI-018 open-source and third-party deployment readiness

Status: Future review

Perform a cross-repository review so Product Catalogue can be downloaded and deployed by another organization without editing GST-specific code.

Audit at least:

- logos, titles, organization names, links, email addresses, and contact/help content;
- API, portal, locator, basemap, report, and documentation URLs;
- authentication/authorization and Windows/ArcGIS assumptions;
- environment variables, sample configuration, secrets, and safe defaults;
- mock/sample data ownership and sanitization;
- licenses, notices, third-party dependencies, fonts, icons, and assets;
- build, deployment, reverse-proxy, base-path, and CSP documentation;
- organization-specific status, workflow, file path, and network assumptions;
- telemetry/logging/privacy expectations;
- contributor documentation and reproducible verification commands.

The default experience must be neutral rather than GST-branded, while deployments may opt into their own branding/configuration without forks.

## FI-019 canonical Analyze and Review query routes

Status: Todo / source-aware format decision required

Replace path-concatenated routes such as:

```text
/Analyze/ProductA&ProductB
/Review/ProductA&ProductB
```

with canonical query-based routes.

The requested readable shape is:

```text
/Analyze?Datasets=ProductA,ProductB
/Review?Datasets=ProductA,ProductB
```

However, FI-011 permits equal Product keys across sources. Bare dataset names are therefore only valid if the backend/domain contract guarantees global uniqueness. Before implementation, choose and document one source-aware canonical representation, for example:

```text
/Analyze?Products=s101:ProductA,s57:ProductA
/Review?Products=s101:ProductA,s57:ProductA
```

or another encoded structure that preserves `{ sourceId, productKey }` unambiguously.

Requirements:

- use `URL` / `URLSearchParams`, not manual separator concatenation;
- encode every value safely;
- preserve stable ordering and deduplicate exact source-aware identities;
- direct load, reload, bookmarking, and separate-window opening must work;
- accept the legacy path form temporarily when practical and canonicalize it with `history.replaceState`;
- invalid entries produce a clear partial/unavailable state rather than breaking the page;
- Product picker additions/removals update the canonical URL consistently.

## FI-020 backend-linked related Products

Status: Blocked by backend relationship contract

Add a dynamic popup surface for Products related across data sources. The first expected relationship is between corresponding S-101 and S-57 Products, but no source pair may be hardcoded in the UI.

The backend relationship contract must provide stable target source and Product identity plus relation type and display text. The UI must support multiple relations and future Paper Charts, S-102, S-122, or other source targets.

Open decision before implementation: when the target source is disabled, either require explicit user activation or activate/load it as part of link navigation. Whichever behavior is selected must be consistent, keyboard accessible, loading-safe, and preserve the current popup if target loading fails.

Do not infer links from equal names, equal geometry, export mappings, or array position.

## FI-021 modifier-click Product Collection exploration

Status: Nice to have / design exploration

Investigate faster map-based collection building without weakening normal popup selection or map navigation.

Preferred experiment:

- Ctrl-click on Windows/Linux and Cmd-click on macOS toggles the clicked Product in Product Collection;
- normal click keeps the existing popup workflow;
- a static cursor/notice cue confirms add/remove without relying only on animation;
- overlapping AOIs invoke an unambiguous chooser rather than selecting an arbitrary source Product;
- keyboard users receive an equivalent action.

Do not assign Shift-click in the first experiment. A map has no stable natural range order, so Shift semantics require a separate selection model. Treat the feature as optional until user testing shows it is discoverable and does not conflict with ArcGIS map gestures.

## Commit log

| Date       | Commit                                   | Items           | Notes                                                                                                                                                                                 |
| ---------- | ---------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-28 | 7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd | FH-049 / BE-107 | Added Dashboard server-side filtering and cursor pagination; manual pagination verification passed.                                                                                   |
| 2026-07-27 | 279fe6a761229fd99af437d0f8401508985afafc | FH-046 / FH-047 | Activated async Export/Rollback and backend-authoritative active-job visibility across browser profiles, users and computers.                                                         |
| 2026-07-27 | 69752605d935212e89ca7ad4286ca3e46ecb4abe | FH-048          | Preserved popup, action icons and open dropdowns during compatible map and terminal-job refreshes.                                                                                    |
| 2026-07-08 | 1656616b214cfdb914a23567d2840de5cc981c06 | FI-001          | Completed Dashboard phase 1 with endpoint integration, range presets, summary cards, activity list, status/operation summaries, Review/Analyze links, client-side search and filters. |
| 2026-07-09 | e2fd13620edd9c1b8af8a6883c6d8348a211e701 | FI-001          | Reworked Dashboard range selection into a stable range builder with compact Dashboard-owned date picker and open-ended `To` support.                                                  |
| 2026-07-09 | 5053d2d5eb1b1d599830e37daeb71b6d7ccddc20 | FI-001          | Made Dashboard status and operation summary rows actionable.                                                                                                                          |
| 2026-07-09 | 8a36ccc7df7887595ea345ef7a6708f56228494f | FI-001          | Added Dashboard History panel, Escape close handling, and product state lookup loading.                                                                                               |
| 2026-07-09 | bba860546a834a2156dc8cc1b286661bc52ecb41 | FI-001          | Polished Dashboard History panel with selected activity context and active row highlighting.                                                                                          |
| 2026-07-09 | 698ba074f2c262f7629babdee9f33b033a5de6be | FI-001          | Improved Dashboard backend activity classification.                                                                                                                                   |
| 2026-07-09 | 80170fe5163fe217db8c6308808e457164517390 | FI-006          | Added and styled shared Product catalog picker for Analyze and Review.                                                                                                                |
| 2026-07-09 | 708865afd5e21cc5893f3fade960d63407ec5710 | FH-035 / FH-036 | Hardened main map filters and first-load popup attribute rendering.                                                                                                                   |
| 2026-07-09 | a3ab23ee615d59b25cccdda4197b226e7efc09ad | FH-037          | Enabled S100 Edition export and Rollback.                                                                                                                                             |
| 2026-07-09 | db6e4a37203a5ae847189d6197ed49d09879e9c4 | FH-038          | Hardened initial loader/header behavior and Product picker validation.                                                                                                                |
| 2026-07-09 | 300f68cd9d463ef023b432b4097c08abb9e8b2bd | FH-039          | Hardened Escape handling and Dashboard time input tab behavior.                                                                                                                       |
| 2026-07-09 | 8e72ca28f23dc9317ce58b2930807ed989c4d6ef | FH-040          | Collapsed Product History rows by default and updated release-readiness docs.                                                                                                         |
| 2026-07-09 | 900299f523e97c021a6736c78de6a46bff54cac4 | FH-041          | Improved Product History summaries for edition/update changes.                                                                                                                        |
| 2026-07-09 | 046ea8495f48ffbc2f76c1aa5e0da33fb5317466 | FI-007          | Added and polished main map Product search overlay.                                                                                                                                   |
| 2026-07-10 | 982d9be01f1ace939fe479494c8e05b5c347107e | FH-043          | Added and completed global hover help/tooltips for clickable controls and icon-only actions.                                                                                          |
| 2026-07-15 | 1540d005af6ae5a2ef5f1bf24f2ee70e9ecf7a47 | FI-008          | Completed and manually verified the interactive main-map onboarding sequence through Product Collection.                                                                              |
| 2026-07-16 | 58e721ee7f517f7db945bdfc5fd417abde12c530 | FI-008          | Completed and manually verified independent first-time route onboarding, Analyze Product prerequisite guidance and two-Product Review comparison guidance.                            |
| 2026-07-16 | 2b5f5f414c97a105ff09411c2711c67f680afce8 | FI-008          | Added and manually verified the final Theme and interactive Preferences steps on the main map.                                                                                        |
| 2026-07-16 | 0c677549963bb7ce4206fed379dd30dc8c2cc783 | FI-008 / FH-044 | Aligned main-map Steps 3-5 beside Product search and completed the verified introduction-flow phase 1 baseline.                                                                       |
| 2026-07-16 | 805a853259b6594fe16384ae37b2e828d6de4c76 | FH-034          | Completed the Product terminology audit and added regression coverage for user-facing Product/Products copy.                                                                          |

### FH-045 comprehensive frontend smoke test

Status: Done

- Completed on 2026-07-16 against `805a853259b6594fe16384ae37b2e828d6de4c76`.
- Covered direct route load and reload, Main map, popup actions, Product search, filters, refresh, Product Collection, Preferences, Theme, Dashboard, Analyze, Review, onboarding, keyboard/Escape priority, notices, error handling, persisted browser state and RDP/VDI behavior.
- Included both clean browser state and saved preference state.
- No new frontend defects, regressions or release blockers were found.
- The automated test suite passed with 99 tests before the manual smoke pass.
- Keep the checklist in `frontend-release-readiness-review.md` as the regression baseline for future frontend changes and backend contract integrations.

### FH-034 user-facing Product terminology audit

Status: Done

- Keep `Product` and `Products` as the shared user-facing terms on Main map, Dashboard, Analyze, Review, Product History, Product Collection, Preferences and onboarding surfaces.
- Keep backend-aligned technical identifiers such as `datasetName`, `datasetNames`, route parameters and API response fields unchanged.
- Treat the terminology boundary as a UI concern rather than a backend/domain rename.
- Run `userFacingTerminology.test.js` as part of `npm test` so representative user-facing source files cannot reintroduce visible `Dataset` or `Datasets` labels without an intentional review.
- Continue the same terminology rule when adding new controls, notices, tooltips and onboarding copy.

### FI-008 onboarding interactive main-map sequence (verified at 0c677549)

Status: Done

- Keep introduction steps non-modal while welcome and stop-confirmation dialogs retain modal dimming.
- Require a visible Product popup before Step 3 can continue.
- Automatically advance from Step 3 to Step 4 when a Product popup is opened during the step.
- Keep Back usable when a popup was already open before returning to Step 3.
- Return to Step 3 when the Product popup closes during Step 4, with a short grace period for popup re-rendering.
- Require a visible Product Collection tray before Step 5 can continue.
- Highlight the popup Product Collection action while waiting, then switch the highlight and guidance to the tray after a Product is collected.
- Return to Step 3 if both the popup and Product Collection tray disappear during Step 5.
- Keep Steps 3, 4 and 5 at one stable position beside Product search.
- Preserve replay from Preferences, versioned localStorage, light/dark support and static RDP/VDI-safe states.

### FI-008 route-specific onboarding expansion (verified at 58e721ee)

Status: Done

- Auto-offer the first-time introduction independently on Main map, Dashboard, Analyze and Review.
- Store dismissal and completion in separate versioned localStorage keys per route while preserving the completed legacy Main map state.
- Keep every route replayable from Preferences without automatically navigating between pages.
- Keep the five-step Dashboard flow unchanged after its first manual verification pass.
- Place Analyze guidance beside the left sidebar instead of at the far-right edge.
- Require one loaded Analyze Product before advancing to Product list, card controls and Product information.
- Use customer-facing Analyze copy without software implementation terms.
- Require two loaded Review Products before advancing to side-by-side comparison.
- Highlight the first two Review Product columns instead of the entire Review workspace.
- Return to the Product picker if required Analyze or Review Products are removed during the introduction.

### FI-008 main-map onboarding completion (verified at 0c677549)

Status: Done

- Add a Theme step after workspace navigation and keep the theme toggle usable during the introduction.
- End the main-map flow with an interactive Preferences step.
- Require the user to open Preferences before `Finish` becomes available.
- Move the highlight and guidance from the Preferences button to the open panel.
- Explain that map and display preferences can be saved in the browser and that the current route introduction can be restarted from the panel.
- Keep Dashboard, Analyze and Review onboarding unchanged.
- Keep Steps 3-5 aligned beside Product search while their highlights follow popup and Product Collection controls.
- Confirm the complete flow in light and dark mode and preserve static text/state for RDP/VDI use.
