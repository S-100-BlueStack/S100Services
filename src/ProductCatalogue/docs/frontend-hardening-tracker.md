# Frontend hardening tracker

This document tracks frontend-only cleanup, hardening, and architecture improvements for Product Catalogue. The goal is to improve maintainability, reliability, and structure without changing the user-facing feature set unless an item explicitly tracks a feature foundation.

Current reviewed repository baseline: `8e375296a286e3228fa8a6f7111769715038b320`.
BE-108A documentation baseline: `8caf5f771f1a6721398007589afbe875d553615d`.

## Backend worker-readiness note

BE-106 is documentation-only. It confirms that ProductCatalogueAPI remains the public API/enqueue/status owner while worker execution may later move to JobPlatform. No frontend runtime change is required, and no shared-worker implementation should begin until JobPlatform is ready.

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
| FH-033 | P1       | Popup UI           | Render export metadata comparison in product popup                                             | Done     | 9ede3a5c94fbce900f0d5ae05d20e826b07faba3                                                                                                                                  | Popup compares Product-standard metadata with export metadata columns; FI-013 now presents the compatibility standard as `S-101` while legacy `S100` remains internal where required.                                                                                                                                         |
| FH-034 | P2       | Terminology        | Standardize user-facing naming around Product/Products                                         | Done     | 805a853259b6594fe16384ae37b2e828d6de4c76                                                                                                                                  | Completed a UI-only terminology audit across the main user-facing surfaces. Visible copy uses `Product`/`Products`, technical identifiers such as `datasetName` remain unchanged, and a regression test protects the terminology boundary.                                                                                    |
| FH-035 | P1       | Main map filters   | Restrict main map filters to Display scale, Status and Usage band                              | Done     | 708865afd5e21cc5893f3fade960d63407ec5710                                                                                                                                  | Status options come from the full status/product state endpoint, including count `0` options.                                                                                                                                                                                                                                 |
| FH-036 | P1       | Popup / attributes | Stabilize first-load attribute display                                                         | Done     | 708865afd5e21cc5893f3fade960d63407ec5710                                                                                                                                  | Product popup details no longer fall back to all raw attributes when field/capability metadata is not ready.                                                                                                                                                                                                                  |
| FH-037 | P1       | Popup actions      | Enable S100 Edition export and Rollback                                                        | Done     | a3ab23ee615d59b25cccdda4197b226e7efc09ad                                                                                                                                  | Enabled the legacy `S100` Edition target and Rollback operation; FI-013/FI-014 later changed presentation to `S-101` / `Cancel Export` without changing the backend/wire identity.                                                                                                                                            |
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

| ID     | Area     | Item                                                   | Status                                      | Notes                                                                                                                                                                                                                            |
| ------ | -------- | ------------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BE-001 | Export   | Cross-browser/cross-user export-in-progress visibility | Done                                        | Backend-authoritative active-job discovery is integrated into popup state and mutation preflight.                                                                                                                                |
| BE-002 | Export   | Async export job with job-status endpoint              | Done                                        | New Edition and Rollback use async start endpoints, persisted polling and terminal refresh.                                                                                                                                      |
| BE-003 | Timeline | Global map timeline data contract                      | Blocked by backend                          | Product-level history endpoint exists. Global map timeline remains deferred until API/database contract is known.                                                                                                                |
| BE-004 | API      | Safe timeout policy for long-running operations        | Done                                        | Job-start requests avoid unsafe client timeout; repeatable status requests use finite timeout and bounded retry.                                                                                                                 |
| BE-005 | Reports  | Real Dashboard IC-ENC/internal validation report links | Blocked by backend                          | Requires report IDs/storage contracts before Dashboard report actions can be enabled.                                                                                                                                            |
| BE-006 | Jobs     | Atomic Product operation claim before enqueue          | Planned                                     | Required to eliminate the remaining near-simultaneous enqueue race and support a distributed external worker cleanly.                                                                                                            |
| BE-007 | Jobs     | External shared Hangfire worker migration              | Deferred / architecture review              | Current HTTP/job contracts are reusable, but worker dependencies, queues, shared storage and ArcGIS/file access must be reviewed before migration.                                                                               |
| BE-008 | Timeline | Product History audit event hardening                  | Batch 1 port verified; manual smoke pending | Foundation is ported to `2ec17a5c47aa353256d0a3445620bebe83e6eecf`: additive audit persistence/API, normalized `ProductStateHistory` IDs, shared normalization and deterministic suppression. No producers; Batch 2 not started. |

## Future implementation ideas

| ID     | Area                             | Idea                                                                     | Status                                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | -------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FI-001 | Dashboard                        | Add operational activity dashboard                                       | Done                                     | Added `/dashboard` with Danish operational time, compact range builder, summaries, activity list, actionable status/operation rows, Dashboard History, Review/Analyze links, server-side search/filtering, cursor pagination, stale-request cancellation and last-successful-result retention. Real report links remain blocked by backend report IDs/storage contracts.                                                                              |
| FI-002 | Product review / Product history | Add Product Review workspace for multiple histories and report content   | Implemented (MVP)                        | Added a dedicated Product Review workspace that opens in a separate tab/window and allows users to compare multiple products.                                                                                                                                                                                                                                                                                                                         |
| FI-003 | Analyze                          | Show internal validation reports in Analyze                              | Done/Semi-done (Missing endpoint)        | Add internal validation reports to the Analyze page near the IC-ENC XML/report area.                                                                                                                                                                                                                                                                                                                                                                  |
| FI-004 | Analyze                          | Improve Analyze product name management                                  | Done                                     | Replaced manual URL/query separator management with a structured product list UI.                                                                                                                                                                                                                                                                                                                                                                     |
| FI-005 | Analyze                          | Add product collection tray for Analyze from map                         | Done                                     | Added a main-map workflow for collecting products before opening Analyze or Review.                                                                                                                                                                                                                                                                                                                                                                   |
| FI-006 | Analyze / Review                 | Add shared product catalog picker for direct Analyze/Review access       | Done                                     | Uses the lightweight `GET /electronicproducts` endpoint to power a shared searchable Product picker reused by Analyze and Review.                                                                                                                                                                                                                                                                                                                     |
| FI-007 | Main map                         | Add main page Product search                                             | Done                                     | Added a compact Product search overlay that suggests catalog products and opens the selected Product popup on the main map.                                                                                                                                                                                                                                                                                                                           |
| FI-008 | Introduction flow                | Add compact first-time and replayable route guidance                     | Done                                     | Completed and manually verified at `0c677549963bb7ce4206fed379dd30dc8c2cc783`. Each route has independent first-time state and replay from Preferences. Main map includes Product search, filters, interactive popup/Product Collection guidance, workspace navigation, Theme and Preferences. Dashboard, Analyze and Review use compact route-specific flows with Product prerequisites where needed.                                                |
| FI-009 | Dashboard                        | Add user-selectable Dashboard page size                                  | Done                                     | Added compact `25 / 50 / 100 / 200` page-size selection with default `50`, browser-local persistence, Preferences reset integration, page-1 restart, and cursor-generation invalidation. Committed at `e4caa4d29c46083605beac10400876af6bf38d1c`.                                                                                                                                                                                                     |
| FI-010 | Dashboard                        | Add sortable Dashboard activity columns                                  | Implemented; local verification pending  | Implemented against `d68e18e7fc91512c91af57299ccdbc1b94ee7077`: server-side Time/Product/Activity/Status sorting, stable tie-breaks, versioned sort-aware cursors with legacy time/desc compatibility, session-local native header controls, focus restoration, page reset and failed-sort rollback. Frontend preserves backend order. No commit or manual acceptance claimed. See the Dashboard feature README for verification and acceptance.      |
| FI-011 | Main map / Data sources          | Add independent Product-standard data sources and source-aware workflows | In progress (FI-011A/B/C/D implemented)  | FI-011A/FI-011B are committed through baseline `60e4854389ab16d3bd280f653998ea10eaa0b6ab`. FI-011C adds central Product context and the flat Edition/Update Export menu. FI-011D adds source-aware Product Collection, workspace catalog/resolution, Analyze, Review, and truthful unavailable History/report surfaces. Separate S-57/S-101 transport, FI-016 authoritative status/error defaults, and final onboarding/regression work remain.       |
| FI-012 | Main map / Location search       | Add Denmark and Greenland map locator                                    | Done                                     | Added a compact ArcGIS Search-based Locator beside Product search. One logical `Places` source uses ArcGIS World Geocoder with `sourceCountry=DNK,GRL` and Address/Postal/Populated Place categories, navigates without marker/popup, preserves Product state, supports first-suggestion Enter for addresses, and keeps the source boundary extensible for future API-backed search sources. Committed at `a3a53e4aa55850091281f8e47825755798066cf9`. |
| FI-013 | Product terminology              | Rename Product Catalogue S100 terminology to S-101                       | Done                                     | Product-specific presentation now uses `S-101` while legitimate generic `S-100` and legacy `S100` wire/API values remain intact. Export help/notices and persisted job presentation are corrected; the flat Edition/Update menu remains source-aware. Committed at `1c6040a60d97429c2232b9b68f0b849a4591df4b`.                                                                                                                                        |
| FI-014 | Popup actions                    | Rename Rollback to Cancel Export and replace its icon                    | Done                                     | User-facing Product action is `Cancel Export` with Calcite `x-circle`, `Canceling export...` running presentation, and `[Cancel] [Confirm]` confirmation controls. Legacy rollback endpoint/action/job identifiers remain internal. Committed at `70b0775936505dca8c1abb221f4a08953411efc1`.                                                                                                                                                          |
| FI-015 | Product Collection               | Use graph-bar for Add to collection                                      | Done                                     | Popup `Add to collection` uses Calcite `graph-bar`; selected/Remove state continues to use `check`. Tooltip, accessibility, toggle behavior, onboarding targeting and source-aware Collection semantics are unchanged. Committed at `636c1b7727d373c780afab60849eca3dc3c1b825`.                                                                                                                                                                       |
| FI-016 | Main map / Symbology             | Define a new Product AOI status palette                                  | Blocked by backend                       | Wait for the authoritative backend status definition and error classification. Then define centralized, accessible light/dark symbology with stable status semantics across independently rendered sources.                                                                                                                                                                                                                                           |
| FI-017 | Branding / Deployment            | Make application branding environment-configurable                       | Done                                     | Logo and favicon are deployment-configurable through non-secret Vite build inputs with neutral bundled fallbacks. Custom branding loads from its configured runtime URL, and replacing the file behind an unchanged URL requires no frontend rebuild or redeploy. Committed at `8e375296a286e3228fa8a6f7111769715038b320`.                                                                                                                            |
| FI-018 | Open source readiness            | Remove organization-specific deployment assumptions                      | Future review                            | Audit branding, configuration, URLs, authentication assumptions, documentation, sample data, secrets, licenses, and deployment defaults so a third party can deploy the application without editing GST-specific source code.                                                                                                                                                                                                                         |
| FI-019 | Analyze / Review routing         | Replace path-concatenated Product URLs with canonical query routes       | Ready / canonical contract fixed         | Use `/Analyze?Datasets=ProductA,ProductB` and `/Review?Datasets=ProductA,ProductB`. Dataset names are globally unique across current and future sources, while internal runtime state remains source-aware.                                                                                                                                                                                                                                           |
| FI-020 | Popup / Related Products         | Navigate backend-linked Products across data sources                     | Blocked by backend relationship contract | Render only explicit backend/database-provided Product relationships. No source pair or relationship may be inferred; authoritative target identity, relation type, and display text must support any current or future source.                                                                                                                                                                                                                       |
| FI-021 | Product Collection               | Explore modifier-click collection shortcuts                              | Nice to have / design exploration        | Investigate a discoverable keyboard-and-mouse shortcut for adding/removing map Products from Product Collection. Prefer Ctrl/Cmd-click exploration; do not assign Shift-click until range/selection semantics and conflicts with map navigation are defined.                                                                                                                                                                                          |

## Planned order

1. Keep the tested async operation and popup-preserving refresh baseline stable.
2. Use the completed BE-106 external-worker readiness review as the implementation gate; do not move Product Catalogue jobs until JobPlatform is ready.
3. Keep atomic Product-operation ownership deferred until its persistence owner, recovery contract and distributed-worker boundary are approved.
4. BE-107 Dashboard filtering and pagination is complete and manually verified at `7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd`.
5. BE-108A Batch 1 is ported to workflow-redesign baseline `2ec17a5c47aa353256d0a3445620bebe83e6eecf`; frontend/backend/database-owner verification passed on 2026-09-11. Re-run post-port manual Product History smoke before final acceptance.
6. Keep Batch 2 producer/recovery work separate; it must target the normalized Product workflow repository and must not restore `JobTable` or the old `AppendAsync -> Task<Guid>` assumption.
7. Keep report-link UI and deferred producers blocked until backend report IDs, storage, and producer contracts exist.
8. Continue targeted regression smoke tests after frontend or backend contract changes.
9. Keep FI-011A as the committed generic source foundation at `8f678480c08e17d7911d6019a44542c6a52ef09f`; do not introduce a permanent combined ENC source or infer an S-57/S-101 split from the compatibility AOI payload.
10. Keep FI-011B as the committed source-aware Filters, loaded-feature Product search, navbar-popover coordination, and generation-safe derived-state cleanup baseline.
11. Keep FI-011C as the committed central Product-context, capability-specific popup-action, and flat source-aware Edition/Update Export baseline at `391074743efc909ec97168e2be2820484edb8455`.
12. Keep FI-011D as the committed source-aware Product Collection, workspace catalog/resolution, Analyze, Review, and truthful History/report baseline at `737677d7ecd0857312224fde3e5f9a76a0cb7148`; do not enable mock-source backend actions.
13. Keep authoritative production S-57/S-101 transport blocked until the backend supplies separate read contracts and source discrimination.
14. FI-012, FI-009, FI-013, FI-014, FI-015 and FI-017 are complete; the latest manually accepted frontend baseline is `8e375296a286e3228fa8a6f7111769715038b320`. FI-019 may proceed independently subject to its own dependencies.
15. Complete FI-016 only after the backend status list identifies authoritative error states and display semantics, then activate the final FI-011 error-only first-visit filter preset.
16. Treat FI-018 as a later cross-repository release-readiness review after configurable branding and deployment settings are established.

## FI-009 Dashboard page size preference

Status: Done  
Implementation commit: `e4caa4d29c46083605beac10400876af6bf38d1c`

FI-009 extends the existing BE-107 cursor-paging contract without changing the backend API. The Dashboard offers compact page-size choices:

```text
25
50
100
200
```

`50` remains the default. The selected numeric value is stored as browser-local Dashboard state under `pc.dashboard.pageSize.v1`; it is not part of the Dashboard route URL.

Changing page size preserves the current range, search and filters, invalidates the existing cursor chain, returns to page 1 and issues a fresh request. Existing request-id/abort stale-response protection remains authoritative. If the new request fails, the last successful result may remain visible, but cursors from the previous page-size generation cannot be reused.

The existing Preferences reset removes the stored page-size preference and returns the live Dashboard to `50` when a change is required. Invalid, unsupported or malformed persisted values fail safely to `50`.

Manual acceptance verified persistence, reset behavior, Previous/Next paging, range/search/filter preservation, light/dark mode and existing Dashboard History/Analyze/Review navigation. The full frontend check passed locally before commit.

## FI-011 independent Product-standard data sources and source-aware workflows

Status: In progress â€” FI-011A, FI-011B, FI-011C, and FI-011D committed; production S-57/S-101 transport and final status/guidance/regression work remain  
FI-011D implementation commit: `737677d7ecd0857312224fde3e5f9a76a0cb7148`

### Current implementation state

FI-011A provides the generic, generation-safe source runtime and has been manually accepted. The
permanent registry contains `S-57`, `S-101`, `Paper Charts`, and `S-102`. S-57 and S-101 remain
runtime-unavailable because authoritative independent backend read contracts do not exist. The
combined AOI flow remains a temporary compatibility adapter and is not a registry source, toggle, or
storage value.

FI-011B integrates the current source model with:

- a generic shared navbar-popover coordinator for Data sources, Filters, and future participants;
- independent source filter providers, facets, selected state, and counts;
- a source-aware Product-search index over currently loaded frontend Graphics;
- committed lifecycle publication and generation guards for derived filter/search state;
- deactivation cleanup for source filter sections, search entries, popup, selection, and hover state.

FI-011C extends that baseline with:

- central Product-context resolution from Graphic and layer metadata;
- an explicit non-persisted compatibility-AOI adapter;
- capability-specific popup action visibility and fail-closed dispatch;
- a flat `Export... > Edition / Update` menu generated from declarative source configuration;
- the legacy `S100` Edition wire target retained internally for compatibility AOI while Product-specific UI presentation uses `S-101`;
- disabled Edition/Update placeholders for Paper Charts and S-102;
- Product Collection header gating through the central `productCollection` Product-context capability,
  independent from `supportsPopupActions`;
- source-aware popup-local Export identity and deactivation cleanup.

FI-011D adds source-aware Product Collection, shared workspace catalog/resolution, Analyze, Review, and truthful History/report/validation availability for runtime-available mock sources. FI-011 remains incomplete because separate production S-57/S-101 transport, authoritative final status/error defaults, related Products, and final onboarding/regression work remain deferred.

### Logical source taxonomy

The final logical Product sources are independent:

```text
S-57
S-101
Paper Charts
S-102
```

S-122 is a future source and is not part of the current implementation. Do not expose or persist a
combined public ENC source. Do not duplicate the compatibility AOI payload or infer source standard
from geometry, names, status, or current operation fields.

The current source availability is:

| Source       | Runtime availability | Notes                                             |
| ------------ | -------------------- | ------------------------------------------------- |
| S-57         | Unavailable          | Separate backend read contract required           |
| S-101        | Unavailable          | Separate backend read contract required           |
| Paper Charts | Development only     | Visualization/filter/search/workspace mock source |
| S-102        | Development only     | Visualization/filter/search/workspace mock source |

### Registry, identity, and capability boundary

The registry is the declarative integration point for source availability, loader, normalizer,
source-owned layers, stable identity, refresh strategy, filtering metadata, search fields, and
capabilities. Feature code must not branch on Paper Charts or S-102 IDs to implement filtering or
search.

Runtime identity remains equivalent to:

```text
{ sourceId, productKey }
```

Missing or duplicate stable source identity rejects the full source payload before layer commit. A
stale operation cannot publish newer map, filter, search, persistence, loading, or error state.

Paper Charts and S-102 remain Development-only visualization/workspace sources. FI-011B enables their declared filters and loaded-feature Product search. FI-011C adds source-aware popup actions with disabled Edition/Update Export placeholders. FI-011D enables Product Collection, Analyze, Review, and visible History/IC-ENC/Internal validation surfaces while keeping backend mutations, real Export execution, backend History, and report/validation data unavailable. Search selection reuses the same Product-context and capability path and cannot bypass gating.

### Shared navbar-popover coordination

Data sources and Filters register with one generic coordinator. Only one registered overlapping
navbar popover may be open. Opening one closes the active participant without direct feature-module
imports.

The coordinator preserves:

- trigger toggle behavior;
- outside-click closure;
- Escape closure;
- keyboard navigation and ARIA state;
- focus restoration to the correct trigger;
- light/dark styling owned by existing panels;
- one global document click listener and one global keydown listener for the coordinator lifetime.

Non-navbar surfaces are not registered and keep their existing close priority.

### Source-aware filters and initial defaults

The shared filter panel renders independent sections only for active providers. State, facets,
selected values, counts, and Graphic matching are isolated by provider. Source replacement rebuilds
only that source's facets; source removal clears only that source's runtime filter state.

Current declared filter dimensions are limited to actual normalized data:

| Provider      | Status | Display scale | Usage band |
| ------------- | ------ | ------------- | ---------- |
| Compatibility | Yes    | Yes           | Yes        |
| Paper Charts  | Yes    | Yes           | Yes        |
| S-102         | Yes    | No            | No         |

Missing optional attributes omit only that facet and do not fail filtering. Layer/source metadata,
not titles or DOM state, determines participation.

Filter persistence is a separate versioned user-state contract from data-source activation. The
source-aware filter snapshot uses version 2 and migrates the established version 1 compatibility
state. Existing valid user state is never overwritten by first-visit defaults.

The final error-only first-visit preset is not enabled in FI-011B. There is no authoritative central
classification of Product error statuses. FI-011B preserves the current compatibility default and
adds an explicit configuration point. FI-016 must define the authoritative error classification
before the final preset is activated.

### Loaded-feature Product search

Product search aggregates only currently committed Graphics from active providers. Compatibility AOI,
Paper Charts, and S-102 can participate when loaded and active. Disabled or failed-first-activation
sources publish no entries.

Each search entry retains provider, source, layer, stable Product key, generation, and exact Graphic.
Provider replacement is atomic, source removal deletes all source entries, and generation tombstones
prevent a stale refresh from restoring removed or older suggestions. Duplicate labels remain
source-aware and cannot resolve to the wrong Graphic.

Selection navigates to the current Graphic, updates the established selected-Graphic flow, and opens
the existing popup. Search does not activate disabled sources. Locator/FI-012 remains a separate
geographic workflow, and FI-011B does not add backend or connected-data search.

### Source lifecycle and cleanup

Activation and successful refresh publish filter/search state only after the guarded map commit.
Deactivation invalidates pending work before cleanup and removes source layers, derived filters, and
search entries while clearing popup, selected Graphic, and hover state owned by that source. Other
sources remain unchanged.

A failed refresh of an active source retains the last successful representation and derived state. A
failed first activation leaves no partial layers, facets, or suggestions. Reactivation fetches fresh
data and uses the configured default filter state.

### Existing workflow compatibility

The temporary AOI adapter must preserve existing compatibility behavior for popup selection and
restoration, hover, refresh, Product Collection, Analyze, Review, Product History, exports, Freeze,
Unfreeze, Send to IC-ENC, the user-facing Cancel Export action over the legacy Rollback operation contract, notices, and loader progress.

Compatibility filter/search integration uses logical layer metadata without creating permanent
source preferences. Runtime source refresh and compatibility refresh remain independent.

### Development mocks

Paper Charts and S-102 continue to use Development-only fixtures:

```text
GET /mock/paper-charts -> mock/paper-charts.geojson
GET /mock/s102         -> mock/s102.geojson
```

They are not production contracts and must not define future backend fields or capabilities.

### Remaining FI-011 packages

1. **FI-011A â€” Configurable source foundation:** implemented and manually accepted at the committed
   baseline.
2. **FI-011B â€” Source-aware Filters, Search and Navbar Coordination:** implemented in the committed
   baseline; does not complete FI-011.
3. **FI-011C â€” Source-aware Popup Actions and Export Menu:** implemented in the committed baseline
   `391074743efc909ec97168e2be2820484edb8455`; central Product context, capability-specific actions,
   flat Edition/Update menu, and disabled mock-source placeholders.
4. **FI-011D â€” Source-aware workspace and history propagation:** implemented and committed at
   `737677d7ecd0857312224fde3e5f9a76a0cb7148`; Product Collection, shared workspace catalog/resolution,
   Analyze, Review, and truthful History/report unavailable states are source-aware without cross-source
   compatibility calls.
5. **Production transport package:** authoritative separate S-57/S-101 reads when the backend
   contract exists; no fake client split.
6. **Final status/guidance/regression package:** error-only default after FI-016, onboarding,
   accessibility, and full end-to-end migration regression.

### Acceptance criteria

FI-011 is complete only when:

1. S-57, S-101, Paper Charts, and S-102 are independent logical sources with no public combined ENC
   source.
2. The backend supplies authoritative S-57/S-101 source identity and separate read behavior.
3. First visit enables all available sources and uses an authoritative error-only filter preset.
4. Existing source and filter user state is restored without silently enabling later sources.
5. Every available source supports independent generation-safe activate, refresh, disable, and
   reactivate behavior.
6. Filters and counts remain source-isolated, and Product search includes active sources only.
7. Popup, hover, Product Collection, Analyze, Review, History, routes, and operation state preserve
   source-aware identity where supported.
8. Unsupported source workflows fail closed without cross-source API calls.
9. Related Products and source-specific actions use backend-provided, data-driven contracts.
10. Light/dark, keyboard, focus, notices, RDP/VDI, local/global reset, refresh, and existing
    compatibility AOI workflows pass final regression testing.
11. `cd src/ProductCatalogue && npm run check` passes in the repository environment.

### Out of scope until separately approved

- production Paper Charts, S-102, or S-122 endpoint contracts;
- heuristic S-57/S-101 splitting of the combined AOI response;
- real backend History, IC-ENC reports, Internal validation data, mutations, or real Export execution for Paper Charts/S-102 until authoritative backend contracts exist;
- source-specific Product actions without backend contracts;
- connected-data or backend Product search;
- Locator/FI-012;
- the final status palette and error-only preset before FI-016;
- global timeline work;
- modifier-click Product Collection shortcuts from FI-021;
- open-source readiness review from FI-018.

## FI-012 Denmark and Greenland map locator

Status: Done  
Implementation commit: `a3a53e4aa55850091281f8e47825755798066cf9`  
Authoritative implementation baseline: `737677d7ecd0857312224fde3e5f9a76a0cb7148`

### Goal and final behavior

FI-012 adds a compact geographic Locator to the Main map so users can navigate quickly to addresses, cities, postal locations, and populated places in Denmark or Greenland while working with Product corrections.

Locator is navigation assistance only and remains independent from Product search, Product selection, popup state, filters, Product Collection, source enablement, and Product operation state.

The accepted Main-map layout is:

```text
closed:
[ Product search ][ Locator button ]

open:
[ Product search ][ Locator search ][ Locator button ]
```

The shared `mainMapSearchControls` boundary owns only common positioning/layout. Product search keeps its existing Product index, Graphic resolution, selection, navigation, and popup behavior; Locator keeps geographic search and navigation.

### ArcGIS implementation

FI-012 uses the ArcGIS Maps SDK Search web component (`arcgis-search`) from `@arcgis/map-components@5.0.15` with the existing `MapView`. It does not use the deprecated `@arcgis/core/widgets/Search` widget and does not migrate the map to `arcgis-map`.

The organization-approved ArcGIS World Geocoding Service is configured through the non-secret `VITE_ARCGIS_LOCATOR_URL` boundary:

```text
https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer
```

The accepted first version uses the service without a Product Catalogue API key, OAuth flow, hardcoded token, or Windows-credential forwarding. Missing/invalid configuration fails closed and does not enable unrestricted ArcGIS default sources.

### Search-source architecture

The initial user-facing Locator contains one logical source:

```text
Places
â””â”€â”€ ArcGIS World Geocoder
    â”œâ”€â”€ sourceCountry=DNK,GRL
    â”œâ”€â”€ category=Address,Postal,Populated Place
    â””â”€â”€ configured fallback zoom scale
```

Denmark and Greenland are search scope, not separate user-visible sources. This removes the `Search in...` selector and country grouping from the first version while still excluding the Faroe Islands and worldwide fallback.

`Places` is implemented as a custom ArcGIS `SearchSource` using public `getSuggestions` / `getResults` contracts and ArcGIS request infrastructure. The same country/category scope is applied to suggestion and candidate resolution.

The registry/factory boundary remains extensible for later custom API-backed Product Catalogue or domain search sources without rewriting the Locator UI controller. Existing client-side Product `GraphicsLayer`s are not treated as a future `LayerSearchSource` contract.

### Enter and suggestion behavior

The accepted behavior is:

- explicit suggestion selection resolves that exact World Geocoder suggestion and its real `magicKey`;
- Enter without an explicit selection resolves the first actual keyed World Geocoder suggestion for the current term;
- fast Enter can obtain the scoped suggestion before candidate resolution;
- city and address searches navigate to the first valid result;
- stale suggestion generations cannot replace a newer query's provider state.

After successful Locator navigation:

```text
map navigates
-> Locator search term/results clear
-> Locator remains open
-> new map viewpoint remains
```

This clear-after-success behavior prevents completed search results from remaining visually sticky when the user begins a new query.

### Result and lifecycle behavior

Selecting a result:

- navigates the existing `MapView` using the ArcGIS result target/extent with configured fallback scale where needed;
- renders no Locator marker/result graphic;
- opens no Locator popup;
- does not route through Product selection/popup logic;
- does not modify Product identity, Product popup state, hover, Product Collection, filters, enabled sources, or operation state.

Close/teardown is hardened independently from the visual animation:

```text
close
-> retire active Search session immediately
-> block stale navigation through session-scoped goToOverride
-> clear Search state
-> reset provider transient state
-> remove/destroy Search component
```

The neutral application-owned Locator slot then performs the visual close transition. Open and close use matching horizontal expansion/collapse, with `prefers-reduced-motion` support and generation-safe rapid-toggle handling. Late requests from a closed Search session cannot navigate the map.

### UI, guidance, and accessibility

The Locator uses the supported Calcite `locator` icon because a `binoculars` icon is not available in the installed Calcite icon set. The final button is compact, angular, centered, and styled through supported Calcite Action component tokens for light/dark mode.

`aria-label` remains `Locator`, while hover help explains:

```text
Search for an address or place in Denmark or Greenland and move the map there.
```

Escape, outside interaction, focus boundaries, teardown, and Product-search coordination use the existing Main-map interaction architecture. Main-map onboarding was versioned independently; Dashboard, Analyze, and Review onboarding state was not reset.

### Manual acceptance

Manually accepted against commit `a3a53e4aa55850091281f8e47825755798066cf9`.

Verified behavior includes:

1. Locator control is positioned beside Product search and expands/collapses smoothly in the shared Main-map search layout.
2. The Calcite `locator` icon is visible, centered, and correctly styled in light and dark mode.
3. The `Search in...` source selector and Denmark/Greenland result grouping are absent.
4. Denmark and Greenland are searched through one logical `Places` source with no Faroe Islands/worldwide fallback.
5. City searches and address searches support Enter navigation, including first-suggestion address resolution.
6. Successful navigation clears Locator input/results while leaving Locator open and preserving the new viewpoint.
7. Repeated searches do not retain stale/sticky results.
8. No result marker or Locator popup is shown.
9. Product search continues to work independently before and after Locator use.
10. Locator use does not mutate Product popup/selection, hover, filters, Product Collection, data-source state, or operation state.
11. Close/reopen clears Search state; slow/stale closed searches cannot navigate later.
12. Keyboard/focus/Escape behavior and rapid open/close/open lifecycle are protected by the final implementation.
13. `cd src/ProductCatalogue && npm run check` passed in the local repository environment during acceptance.

### Out of scope for the first implementation

- search in Product Catalogue database attributes;
- search in connected/related records;
- client-side GraphicsLayer `LayerSearchSource` integration;
- reverse geocoding from map clicks;
- result markers or locator popups;
- general businesses and points of interest;
- Faroe Islands or worldwide results;
- changes to Product search behavior beyond the neutral shared layout/coordination boundary.

## FI-013 S-101 terminology correction

Status: Done  
Implementation commit: `1c6040a60d97429c2232b9b68f0b849a4591df4b`

Product-specific live presentation now uses `S-101` across popup metadata, Export help, operation presentation, notices, tests and active documentation. Legitimate generic `S-100` references remain unchanged.

The legacy backend/wire identity remains explicit and unchanged where required:

```text
EXPORT_TARGET.S100 = "S100"
backendTarget = S100
exportTarget=S100
PRODUCT_EXPORT_STANDARD.S100
```

The flat source-aware Export menu remains:

```text
Export...
  Edition
  Update
```

No S-101 source-group submenu was introduced. Compatibility/S-101 presentation carries its own display/help metadata instead of deriving UI copy from the `S100` wire value. Persisted/backend-authoritative Edition jobs are normalized to user-facing `S-101` presentation while retaining legacy operation identity.

Paper Charts and S-102 keep source-specific unavailable Export help and fail-closed leaves. As part of the final popup presentation correction, the Tools root action is icon-only with wrench icon, accessible name `Tools`, and existing menu keyboard behavior. It remains in the Export/Cancel Export row and is right-aligned with application-owned flex layout so the empty gap is non-clickable and the popup does not overflow.

Manual acceptance verified S-101 popup metadata/help/notices, `exportTarget=S100`, Paper Charts/S-102 help, popup layout, Tools Enter/Space/arrow/Escape behavior, light/dark mode and FI-014/FI-015 regressions. The full frontend check passed locally before commit.

## FI-014 Cancel Export action terminology and icon

Status: Done  
Implementation commit: `70b0775936505dca8c1abb221f4a08953411efc1`

The user-facing Product action formerly presented as `Rollback` is now `Cancel Export` and uses Calcite `x-circle`. The running presentation is `Canceling export...`, and confirmation uses action-specific title/body context with buttons:

```text
[Cancel] [Confirm]
```

Frontend-owned success/warning/error presentation, disabled reasons, hover help, onboarding and accessibility copy use Cancel Export terminology. Persisted/remote legacy Rollback jobs are normalized to the new presentation after restore.

Backend and internal contracts remain unchanged where they are actual operation identity, including the rollback endpoint, internal action ID, operation enums/types, error codes and persisted wire values. Unrelated transactional/history rollback terminology is not renamed.

Manual acceptance verified the icon, light/dark mode, confirmation behavior, async backend dispatch, notices, running state and preserved unsupported-source gating.

## FI-015 Product Collection popup icon

Status: Done  
Implementation commit: `636c1b7727d373c780afab60849eca3dc3c1b825`

The popup Product Collection action uses Calcite `graph-bar` for `Add to collection`. When the Product is selected in the Collection, the existing `check` icon remains in use for the selected/Remove state.

Tooltip/help text, accessible naming, keyboard behavior, active/toggle state, Product Collection identity, capability gating, onboarding targeting and popup refresh behavior are unchanged.

Manual acceptance verified add/remove toggling, light/dark mode, compact popup rendering and existing Collection behavior.

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

## FI-017 environment-configurable branding

Status: Done  
Implementation commit: `8e375296a286e3228fa8a6f7111769715038b320`

FI-017 removes the GST-specific bundled visual identity from the application shell and introduces one central branding configuration boundary for the navbar logo and browser favicon. The repository default is neutral and remains deployable without organization-specific assets.

### Configuration boundary

The non-secret Vite build inputs are:

```text
VITE_APP_LOGO_URL
VITE_APP_LOGO_ALT
VITE_APP_FAVICON_URL
```

Configuration is resolved centrally rather than through feature-local `import.meta.env` reads. Branding values are build-time Vite inputs, while configured image URLs remain browser-loaded runtime resources. A deployment can therefore replace the file behind an unchanged configured URL without rebuilding or redeploying the frontend, subject to normal browser/server cache policy. Changing the configured URL itself still requires a new frontend build and deployment.

Supported configured URL forms are:

- app-relative paths such as `branding/logo.svg` or `./branding/logo.svg`, resolved through the Vite application base;
- origin-root-relative paths such as `/branding/Logo.png`, preserved without application-base prefixing;
- absolute HTTP(S) URLs, preserved as configured.

Unsupported explicit schemes fail closed to the bundled neutral fallback. Branding does not perform a preflight `fetch` or `HEAD` request and does not block application startup while a custom asset loads.

### Fallback and accessibility behavior

The repository includes a neutral Product Catalogue SVG fallback and no longer depends on the previous GST logo asset. The navbar keeps bounded logo dimensions so malformed or unusually sized custom artwork cannot expand the application header.

Navbar branding behavior is:

```text
usable custom logo
-> configured URL + configured alt text when present

missing/invalid configuration
-> bundled Product Catalogue fallback + Product Catalogue alt text

custom image load failure
-> one-way switch to bundled fallback + Product Catalogue alt text
```

The fallback transition is guarded against error loops and does not throw, show a notice, or block startup. Blank custom alternative text falls back to `Product Catalogue`.

Favicon branding uses the same URL-resolution contract and neutral fallback principle. Branding bootstrap is independent from the main application bootstrap; `main.js` remains a normal static module entry rather than being dynamically imported solely for favicon initialization.

### Deployment boundary and manual acceptance

The production deployment was configured with same-origin `/branding/...` URLs backed by externally managed static files. The application source and committed environment defaults remain organization-neutral; deployment-specific values are supplied through an ignored local production environment file.

Manual acceptance on the dev IIS deployment verified:

1. the production frontend build completed successfully with deployment branding configuration;
2. the configured navbar logo loaded from the deployment URL;
3. normal Product Catalogue startup and API use remained functional after deployment;
4. replacing the logo file behind the same configured URL required no frontend rebuild, API publish, IIS restart, or application restart;
5. a browser refresh loaded the replacement logo as intended.

The favicon is covered by the implemented configuration/fallback contract, but a separate browser-cache acceptance result was not recorded during this verification pass. Favicon cache policy remains a deployment/browser concern rather than a frontend cache-busting mechanism.

FI-017 is an input to FI-018 but does not itself complete the broader open-source readiness audit.

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

Status: Ready / canonical URL contract fixed

Replace path-concatenated routes such as:

```text
/Analyze/ProductA&ProductB
/Review/ProductA&ProductB
```

with the canonical query routes:

```text
/Analyze?Datasets=ProductA,ProductB
/Review?Datasets=ProductA,ProductB
```

Dataset names are authoritatively guaranteed to be globally unique across S-57, S-101, Paper
Charts, S-102, and future data sources. Source ID is therefore not part of the public route payload.
Internal collections, loaded Graphics, and other runtime state remain source-aware.

Requirements:

- construct and parse routes with `URL` and `URLSearchParams`, not manual separator
  concatenation;
- URL-encode every dataset name;
- use stable ordering and deduplicate dataset names before serializing;
- support direct load, reload, bookmarking, copied links, and separate-window opening;
- accept the legacy path form temporarily when practical and canonicalize it with
  `history.replaceState`;
- invalid or unavailable entries produce a clear partial state rather than breaking the page;
- Product picker additions and removals update the canonical URL consistently;
- keep source-aware runtime identity even though the canonical URL only needs globally unique
  dataset names.

## FI-020 backend-linked related Products

Status: Blocked by backend relationship contract

Add a generic popup surface for explicit Product relationships supplied by the backend/database.
No source pair is privileged or hardcoded. The contract must be able to link any Product from any
current or future source to any other Product.

The authoritative relationship payload must provide:

- stable target Product identity;
- target source identity when required by runtime loading and navigation;
- relation type;
- display text.

Do not infer relationships from Product names, geometry, overlap, export mappings, data type, array
position, or assumed S-57/S-101 correspondence.

Open decision before implementation: when the target source is disabled, either require explicit
user activation or activate/load it as part of link navigation. Whichever behavior is selected must
be consistent, keyboard accessible, loading-safe, and preserve the current popup if target loading
fails.

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

| Date       | Commit                                   | Items           | Notes                                                                                                                                                                                                              |
| ---------- | ---------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-09-08 | 8e375296a286e3228fa8a6f7111769715038b320 | FI-017          | Added environment-configurable logo and favicon branding with neutral bundled fallbacks, removed the GST-specific bundled logo, and manually verified same-URL runtime logo replacement on the dev IIS deployment. |
| 2026-09-08 | 1c6040a60d97429c2232b9b68f0b849a4591df4b | FI-013          | Corrected Product-specific S-101 presentation while preserving `S100` wire identity; finalized source-specific Export help and compact right-aligned icon-only Tools popup presentation.                           |
| 2026-09-07 | e4caa4d29c46083605beac10400876af6bf38d1c | FI-009          | Added user-selectable Dashboard page size (`25 / 50 / 100 / 200`), browser-local persistence, reset integration and page-size-safe cursor invalidation.                                                            |
| 2026-09-07 | 70b0775936505dca8c1abb221f4a08953411efc1 | FI-014          | Renamed the user-facing Rollback action to Cancel Export, added `x-circle`, updated notices/help, and kept legacy rollback backend/wire identity internal.                                                         |
| 2026-09-07 | 636c1b7727d373c780afab60849eca3dc3c1b825 | FI-015          | Changed the popup Add to collection icon to Calcite `graph-bar` while preserving selected `check` state and existing Product Collection behavior.                                                                  |
| 2026-09-04 | a3a53e4aa55850091281f8e47825755798066cf9 | FI-012          | Added and manually accepted the Denmark/Greenland Main-map Locator using ArcGIS Search, one scoped `Places` source, address Enter handling, Product-state isolation, and symmetric inline open/close behavior.     |
| 2026-07-28 | 7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd | FH-049 / BE-107 | Added Dashboard server-side filtering and cursor pagination; manual pagination verification passed.                                                                                                                |
| 2026-07-27 | 279fe6a761229fd99af437d0f8401508985afafc | FH-046 / FH-047 | Activated async Export/Rollback and backend-authoritative active-job visibility across browser profiles, users and computers.                                                                                      |
| 2026-07-27 | 69752605d935212e89ca7ad4286ca3e46ecb4abe | FH-048          | Preserved popup, action icons and open dropdowns during compatible map and terminal-job refreshes.                                                                                                                 |
| 2026-07-08 | 1656616b214cfdb914a23567d2840de5cc981c06 | FI-001          | Completed Dashboard phase 1 with endpoint integration, range presets, summary cards, activity list, status/operation summaries, Review/Analyze links, client-side search and filters.                              |
| 2026-07-09 | e2fd13620edd9c1b8af8a6883c6d8348a211e701 | FI-001          | Reworked Dashboard range selection into a stable range builder with compact Dashboard-owned date picker and open-ended `To` support.                                                                               |
| 2026-07-09 | 5053d2d5eb1b1d599830e37daeb71b6d7ccddc20 | FI-001          | Made Dashboard status and operation summary rows actionable.                                                                                                                                                       |
| 2026-07-09 | 8a36ccc7df7887595ea345ef7a6708f56228494f | FI-001          | Added Dashboard History panel, Escape close handling, and product state lookup loading.                                                                                                                            |
| 2026-07-09 | bba860546a834a2156dc8cc1b286661bc52ecb41 | FI-001          | Polished Dashboard History panel with selected activity context and active row highlighting.                                                                                                                       |
| 2026-07-09 | 698ba074f2c262f7629babdee9f33b033a5de6be | FI-001          | Improved Dashboard backend activity classification.                                                                                                                                                                |
| 2026-07-09 | 80170fe5163fe217db8c6308808e457164517390 | FI-006          | Added and styled shared Product catalog picker for Analyze and Review.                                                                                                                                             |
| 2026-07-09 | 708865afd5e21cc5893f3fade960d63407ec5710 | FH-035 / FH-036 | Hardened main map filters and first-load popup attribute rendering.                                                                                                                                                |
| 2026-07-09 | a3ab23ee615d59b25cccdda4197b226e7efc09ad | FH-037          | Enabled S100 Edition export and Rollback.                                                                                                                                                                          |
| 2026-07-09 | db6e4a37203a5ae847189d6197ed49d09879e9c4 | FH-038          | Hardened initial loader/header behavior and Product picker validation.                                                                                                                                             |
| 2026-07-09 | 300f68cd9d463ef023b432b4097c08abb9e8b2bd | FH-039          | Hardened Escape handling and Dashboard time input tab behavior.                                                                                                                                                    |
| 2026-07-09 | 8e72ca28f23dc9317ce58b2930807ed989c4d6ef | FH-040          | Collapsed Product History rows by default and updated release-readiness docs.                                                                                                                                      |
| 2026-07-09 | 900299f523e97c021a6736c78de6a46bff54cac4 | FH-041          | Improved Product History summaries for edition/update changes.                                                                                                                                                     |
| 2026-07-09 | 046ea8495f48ffbc2f76c1aa5e0da33fb5317466 | FI-007          | Added and polished main map Product search overlay.                                                                                                                                                                |
| 2026-07-10 | 982d9be01f1ace939fe479494c8e05b5c347107e | FH-043          | Added and completed global hover help/tooltips for clickable controls and icon-only actions.                                                                                                                       |
| 2026-07-15 | 1540d005af6ae5a2ef5f1bf24f2ee70e9ecf7a47 | FI-008          | Completed and manually verified the interactive main-map onboarding sequence through Product Collection.                                                                                                           |
| 2026-07-16 | 58e721ee7f517f7db945bdfc5fd417abde12c530 | FI-008          | Completed and manually verified independent first-time route onboarding, Analyze Product prerequisite guidance and two-Product Review comparison guidance.                                                         |
| 2026-07-16 | 2b5f5f414c97a105ff09411c2711c67f680afce8 | FI-008          | Added and manually verified the final Theme and interactive Preferences steps on the main map.                                                                                                                     |
| 2026-07-16 | 0c677549963bb7ce4206fed379dd30dc8c2cc783 | FI-008 / FH-044 | Aligned main-map Steps 3-5 beside Product search and completed the verified introduction-flow phase 1 baseline.                                                                                                    |
| 2026-07-16 | 805a853259b6594fe16384ae37b2e828d6de4c76 | FH-034          | Completed the Product terminology audit and added regression coverage for user-facing Product/Products copy.                                                                                                       |

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
