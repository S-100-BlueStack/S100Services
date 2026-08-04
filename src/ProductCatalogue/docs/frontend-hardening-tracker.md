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

| ID     | Area                             | Idea                                                                   | Status                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | -------------------------------- | ---------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FI-001 | Dashboard                        | Add operational activity dashboard                                     | Done                              | Added `/dashboard` with Danish operational time, compact range builder, summaries, activity list, actionable status/operation rows, Dashboard History, Review/Analyze links, server-side search/filtering, cursor pagination, stale-request cancellation and last-successful-result retention. Real report links remain blocked by backend report IDs/storage contracts.                               |
| FI-002 | Product review / Product history | Add Product Review workspace for multiple histories and report content | Implemented (MVP)                 | Added a dedicated Product Review workspace that opens in a separate tab/window and allows users to compare multiple products.                                                                                                                                                                                                                                                                          |
| FI-003 | Analyze                          | Show internal validation reports in Analyze                            | Done/Semi-done (Missing endpoint) | Add internal validation reports to the Analyze page near the IC-ENC XML/report area.                                                                                                                                                                                                                                                                                                                   |
| FI-004 | Analyze                          | Improve Analyze product name management                                | Done                              | Replaced manual URL/query separator management with a structured product list UI.                                                                                                                                                                                                                                                                                                                      |
| FI-005 | Analyze                          | Add product collection tray for Analyze from map                       | Done                              | Added a main-map workflow for collecting products before opening Analyze or Review.                                                                                                                                                                                                                                                                                                                    |
| FI-006 | Analyze / Review                 | Add shared product catalog picker for direct Analyze/Review access     | Done                              | Uses the lightweight `GET /electronicproducts` endpoint to power a shared searchable Product picker reused by Analyze and Review.                                                                                                                                                                                                                                                                      |
| FI-007 | Main map                         | Add main page Product search                                           | Done                              | Added a compact Product search overlay that suggests catalog products and opens the selected Product popup on the main map.                                                                                                                                                                                                                                                                            |
| FI-008 | Introduction flow                | Add compact first-time and replayable route guidance                   | Done                              | Completed and manually verified at `0c677549963bb7ce4206fed379dd30dc8c2cc783`. Each route has independent first-time state and replay from Preferences. Main map includes Product search, filters, interactive popup/Product Collection guidance, workspace navigation, Theme and Preferences. Dashboard, Analyze and Review use compact route-specific flows with Product prerequisites where needed. |
| FI-009 | Dashboard                        | Add user-selectable Dashboard page size                                | Todo                              | Backend paging already accepts `1-200`; define compact frontend options, persistence and reset behavior before enabling it.                                                                                                                                                                                                                                                                            |
| FI-010 | Dashboard                        | Add sortable Dashboard activity columns                                | Todo                              | Define supported server-side sort fields, direction, stable tie-break ordering and cursor compatibility before adding sortable headers.                                                                                                                                                                                                                                                                |
| FI-011 | Main map / Data sources          | Add configurable Product data sources and source-aware workflows       | Todo                              | Add frontend-configured `ENC Products`, `Paper Charts`, and `S-102` sources with persisted enablement, lazy loading, independent filter sections, active-source Product search, source-aware popup/export capabilities, development-only mock endpoints, reset behavior, and updated Main map guidance.                                                                                                |
| FI-012 | Main map / Location search       | Add Denmark and Greenland map locator                                  | Todo                              | Add a compact ArcGIS Search component opened from a binoculars button beside Product search. Search addresses and populated places in Denmark and Greenland only, navigate without a marker or popup, keep Product state unchanged, and prepare configuration for later API-backed custom search sources.                                                                                              |

## Planned order

1. Keep the tested async operation and popup-preserving refresh baseline stable.
2. Use the completed BE-106 external-worker readiness review as the implementation gate; do not move Product Catalogue jobs until JobPlatform is ready.
3. Keep atomic Product-operation ownership deferred until its persistence owner, recovery contract and distributed-worker boundary are approved.
4. BE-107 Dashboard filtering and pagination is complete and manually verified at `7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd`.
5. BE-108A design is approved at documentation baseline `8caf5f771f1a6721398007589afbe875d553615d`; the next runtime package is Batch 1 foundation only after explicit implementation approval.
6. Keep Batch 2 producer/recovery work separate until Batch 1 is built, tested, and reviewed.
7. Keep report-link UI and deferred producers blocked until backend report IDs, storage, and producer contracts exist.
8. Continue targeted regression smoke tests after frontend or backend contract changes.
9. When the new Main map feature work begins, implement FI-011 before FI-012 so source identity, capabilities, filters, Product search, and popup behavior have a stable multi-source foundation.
10. Keep FI-011 implementation reviewable in focused slices: source registry/state and loading first; map/filter/search integration second; popup/export/shared-workspace integration third; guidance and final regression coverage last.
11. Implement FI-012 after FI-011 is stable. Keep geographic place search independent from Product selection and Product search even when custom database-backed locator sources are added later.

## FI-011 configurable Product data sources and source-aware workflows

Status: Todo  
Documentation baseline: `20a0cab4c64aea42c9ac10aced95f6b592d14280`  
Implementation order: before FI-012

### Goal

Extend the Main map from one hardcoded Product source to a frontend-configured set of independently enabled Product data sources. The first implementation must support:

- `ENC Products`
- `Paper Charts`
- `S-102`

`ENC Products` remains the primary source, but all three sources are optional at runtime. The design must allow additional Product sources without duplicating map, popup, filter, search, Product Collection, Analyze, Review, History, or export orchestration.

This item is frontend-focused. The only backend change allowed in the first implementation package is the explicitly scoped development-only mock endpoint extension described below.

### Static configuration and runtime state

Introduce a dedicated data-source definition boundary instead of adding source-specific conditionals throughout existing map features. Static source availability and runtime source enablement must remain separate concepts.

Each configured source must have a stable source ID and include, directly or through referenced adapters:

- user-facing label;
- availability flag;
- default enabled state;
- data loader and response normalizer;
- one or more owned logical layer definitions;
- source capabilities for popup, filters, Product search, Product Collection, Analyze, Review, History, Product mutations, rollback, and export;
- source-specific export profile;
- source-specific filter metadata;
- source-specific Product search provider;
- stable Product identity extraction.

Initial definitions:

| Source ID      | UI label       | Available | Default enabled |
| -------------- | -------------- | --------- | --------------- |
| `enc-products` | `ENC Products` | Yes       | Yes             |
| `paper-charts` | `Paper Charts` | Yes       | No              |
| `s102`         | `S-102`        | Yes       | No              |

The runtime contract must not assume that a source owns exactly one ArcGIS layer. The MVP may create one layer per source, but source ownership and cleanup must accept a collection of layers so later sources can add geometry- or purpose-specific layers without redesigning the source state model.

Product identity must be source-aware. Cross-feature state such as popup restore, hover state, Product Collection entries, Product search results, operation state, and refresh reconciliation must use a stable identity equivalent to `{ sourceId, productKey }`. `datasetName` may remain the Product key where it matches the API contract, but it must not be treated as globally unique across every future source.

### Main map Data sources control

Add an icon-only `Data sources` action to the existing navbar control group. Use the Calcite `data` icon and the same compact, square, tooltip, focus, active-state, Escape, and click-outside behavior as the existing navbar actions.

The action opens a compact popover containing one switch per available source:

```text
ENC Products    On
Paper Charts    Off
S-102           Off
```

Requirements:

- all three sources can be disabled, including `ENC Products`;
- the popover must expose per-source loading and failure states without using the fullscreen loader;
- a source switch is not considered enabled until its first load or reactivation load succeeds;
- if loading fails, the switch returns to off, no partial source layers remain visible, and the existing notice infrastructure reports the failure;
- concurrent toggles and stale responses must not allow an older request to overwrite newer source state;
- disabling one source must not disable or reload unrelated sources.

### Persistence and reset

Persist enabled source IDs in versioned `localStorage` state.

Defaults:

```text
ENC Products = enabled
Paper Charts = disabled
S-102 = disabled
```

Reset must be available in both places:

- a local `Reset to defaults` action in the Data sources popover;
- the existing Preferences reset flow.

Reset restores the default enabled sources and clears source-owned transient state and source-specific saved filter state. It must not reset unrelated route preferences unless the existing Preferences action is explicitly the broader reset action selected by the user.

### Loading, caching, and refresh lifecycle

Use lazy loading:

- initial Main map load fetches only sources enabled by persisted state, with `ENC Products` enabled by default;
- a source is first fetched when it becomes enabled;
- successfully loaded layers and normalized data may remain cached in memory when the source is disabled;
- disabled sources do not participate in scheduled auto-refresh or manual refresh API requests;
- re-enabling a previously loaded source performs a fresh request before showing the source again, then replaces its cached data;
- while a reactivation request is pending, stale cached graphics remain hidden;
- if reactivation fails, the source remains disabled and stale cached data must not become visible.

Existing refresh guarantees must be preserved independently for every active source:

- silent auto-refresh;
- manual refresh button loading without a fullscreen loader;
- compatible in-place layer/graphic reconciliation;
- popup preservation only when the selected Product still exists with compatible identity;
- active filter preservation;
- display-scale hiding preservation;
- stale-request suppression.

A source-specific load or refresh failure must retain the source's last successful visible data when the source was already active, following the existing last-successful-state principle. Initial activation failure is different: the source remains disabled because it has no accepted active state yet.

### Source deactivation behavior

Disabling a source is a Main map reset for that source. It must:

- hide every ArcGIS layer owned by the source;
- cancel or invalidate source-owned in-flight read requests;
- clear source-owned hover and selected-feature state;
- close an open popup when its selected Product belongs to the source;
- close the Main map Product History quick panel when it belongs to the source, including a pinned panel;
- remove every Product from that source from Product Collection;
- clear that source's filter selections and filter counts;
- remove that source from Product search suggestions/results;
- close source-owned popup action menus and confirmation UI.

Disabling a source must not attempt to cancel an already accepted backend job. Such a job continues outside the visible source state and must be reconciled if the source is enabled again.

Already open Analyze or Review tabs/windows remain independent and are not remotely closed or rewritten when a Main map source is disabled. New Analyze/Review sessions opened from the Main map can only receive Products from currently active sources.

### Filters

Keep one shared filter panel, but preserve the existing source-separated model. Each active source owns its own filter section and filter state under a source header. A filter selected for one source must not filter another source.

Initial source sections use the shared operational filter concepts where the normalized source data supports them:

- `Display scale`
- `Status`
- `Usage band`

Requirements:

- only active sources appear as filter sections;
- filter options and counts are calculated per source;
- inactive sources do not affect another source's counts or visible total;
- missing source attributes produce an unavailable or omitted filter rather than an invalid cross-source fallback;
- the filter panel's existing local reset and Preferences reset behavior must include all active and persisted source-specific filters;
- disabling a source clears that source's filter state as part of source reset.

### Product search

Keep Product search separate from the Locator introduced by FI-012.

Product search must aggregate searchable Products from every active source. It must not remain hardcoded to the `ENC Products` catalog endpoint.

Each source definition provides a Product search provider. For the first mock-backed implementation:

- `ENC Products` continues using the existing lightweight Product catalog endpoint and rendered-graphic matching;
- `Paper Charts` and `S-102` may build their searchable Product index from their successfully normalized mock payloads;
- future production sources can replace the mock search provider with a source-specific lightweight API endpoint without changing Product search UI orchestration.

Suggestions must identify the source when names could otherwise be ambiguous. Selecting a result follows the existing Product search workflow: locate the active source graphic, navigate to it, and open its Product popup. Disabled sources are not searchable.

### Map, popup, Product Collection, Analyze, Review, and History capabilities

The multi-source foundation must support the following shared surfaces for all three configured sources:

| Capability         | ENC Products                                           | Paper Charts MVP                                | S-102 MVP                                       |
| ------------------ | ------------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------- |
| Map rendering      | Enabled                                                | Enabled                                         | Enabled                                         |
| Hover highlight    | Enabled                                                | Enabled                                         | Enabled                                         |
| Product popup      | Enabled                                                | Enabled                                         | Enabled                                         |
| Source filters     | Enabled                                                | Enabled when attributes exist                   | Enabled when attributes exist                   |
| Product search     | Enabled                                                | Enabled                                         | Enabled                                         |
| Product Collection | Enabled                                                | Enabled                                         | Enabled                                         |
| Analyze entry      | Enabled                                                | Enabled with unavailable backend content states | Enabled with unavailable backend content states |
| Review entry       | Enabled                                                | Enabled with unavailable backend content states | Enabled with unavailable backend content states |
| Product History    | Enabled                                                | Unavailable until endpoint exists               | Unavailable until endpoint exists               |
| Freeze / Unfreeze  | Enabled                                                | Disabled                                        | Disabled                                        |
| Send to IC-ENC     | Enabled according to current truthful capability state | Disabled                                        | Disabled                                        |
| Rollback           | Enabled for the current supported ENC contract         | Disabled                                        | Disabled                                        |
| Export requests    | Current ENC support only                               | Disabled placeholders                           | Disabled placeholders                           |

Capabilities must be checked centrally. Shared UI must not infer support merely because normalized attributes resemble an ENC Product.

Analyze, Review, and History must render an explicit unavailable state for missing source-specific backend contracts. They must not call ENC-only endpoints with a Paper Chart or S-102 identifier.

### Source-aware Export menu

The selected Product's source and Product/export profile determine the exact popup Export menu. Do not build the menu from the union of every globally enabled source.

Required menus:

```text
ENC Product
  Export...
    All
      Edition
      Update
    S57
      Edition
      Update
    S100
      Edition
      Update
```

```text
Paper Chart Product
  Export...
    Paper Charts
      Edition
      Update
```

```text
S-102 Product
  Export...
    S-102
      Edition
      Update
```

Rules:

- irrelevant source groups must not be rendered in another source's popup;
- keep the existing `All` label because it remains scoped exclusively to the combined S57/S100 ENC export and never includes Paper Charts or S-102;
- preserve the current implemented/disabled state of ENC export leaves;
- both `Paper Charts` leaves and both `S-102` leaves start as disabled placeholders;
- source configuration must define export groups and leaves, while endpoint functions remain in the existing export API boundary;
- future enablement requires an explicit backend contract and capability change, not UI-only activation;
- local loading/conflict state must be keyed by source-aware Product identity and export leaf;
- a future operation for one Product/source must not lock unrelated Products or sources;
- the backend may still require a broader authoritative operation key later if Product identifiers are not globally unique.

### Development-only mock endpoints

The first implementation may make a narrowly scoped change to `src/ProductManagerAPI/Program.cs` inside the existing Development-only mock block.

Preserve the existing `/mock/products` route for compatibility and add:

```text
GET /mock/paper-charts -> mock/some_products.geojson
GET /mock/s102         -> mock/products.geojson
```

The small mock payload represents `Paper Charts`; the larger mock payload represents `S-102`.

These routes are development fixtures only. They are not production API contracts and must not determine the final response shape. Frontend adapters may normalize the current mock GeoJSON into the existing stable lowercase Product attribute shape. Production endpoint paths, schemas, paging, freshness rules, and lightweight Product catalogs remain explicit follow-up contracts.

### Guidance, accessibility, and visual requirements

Update the versioned Main map introduction to explain:

- how to open Data sources;
- that sources can be enabled independently;
- that only enabled sources appear on the map, in filters, and in Product search;
- that reset restores `ENC Products` only.

Bump only the Main map introduction version. Existing users see the updated Main map introduction once; Dashboard, Analyze, and Review onboarding completion remains unchanged. The flow remains replayable from Preferences.

The new control and popover must include English UI text, tooltip/hover help, keyboard access, focus restoration, Escape handling, light/dark support, compact square styling, and RDP/VDI-safe loading/error indicators that do not depend only on animation.

### Acceptance criteria

FI-011 is complete only when:

1. The three configured sources appear in the Data sources popover with the agreed defaults.
2. Every source can be independently enabled and disabled, including an all-off state.
3. Source choices survive reload and reset correctly from both reset entry points.
4. Paper Charts and S-102 lazy-load from the development-only mock endpoints.
5. Initial activation failure returns the switch to off and renders no partial data.
6. Active-source refresh and source reactivation follow the documented freshness rules.
7. Disabling a source performs the documented source reset, including Product Collection removal.
8. The filter panel shows independent source sections and never applies one source's filters to another.
9. Product search searches only active sources and opens the correct source Product popup.
10. Popup, hover, Product Collection, Analyze, and Review accept source-aware Product identity.
11. Missing History/report/mutation contracts render disabled or unavailable states without calling ENC-only endpoints.
12. Popup Export renders only the selected Product type's groups; `All` remains ENC-only.
13. Paper Charts and S-102 Edition/Update leaves are visible only on their own Product types and are disabled placeholders.
14. Existing ENC behavior, async operation state, popup-preserving refresh, notices, and keyboard behavior remain regression-tested.
15. The updated Main map introduction and hover help explain the new control.
16. Light and dark mode manual verification passes.
17. `cd src/ProductCatalogue && npm run check` passes.

### Out of scope for the first implementation

- production Paper Charts and S-102 endpoints;
- production schemas or paging contracts;
- source-specific History and report endpoints;
- Paper Charts or S-102 mutation endpoints;
- Paper Charts or S-102 export execution;
- backend cancellation when a source is disabled;
- a global timeline across sources;
- unrelated Dashboard paging or sorting work.

## FI-012 Denmark and Greenland map locator

Status: Todo  
Documentation baseline: `20a0cab4c64aea42c9ac10aced95f6b592d14280`  
Implementation order: after FI-011

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
