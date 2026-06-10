# Frontend hardening tracker

This document tracks frontend-only cleanup, hardening, and architecture improvements for Product Manager.

The goal is to improve maintainability, reliability, and structure without changing the user-facing feature set.

## Status values

| Status             | Meaning                                              |
| ------------------ | ---------------------------------------------------- |
| Todo               | Identified, not started                              |
| In progress        | Currently being worked on                            |
| Done               | Implemented and committed                            |
| Deferred           | Deliberately postponed                               |
| Blocked by backend | Requires backend/API support that does not exist yet |
| Rejected           | Reviewed and intentionally not changed               |

## Items

| ID     | Priority | Area       | Item                                                                                         | Status | Commit                                   | Notes                                                                                                                                                                                 |
| ------ | -------- | ---------- | -------------------------------------------------------------------------------------------- | ------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FH-001 | P0       | Tooling    | Add a real lint/check baseline in addition to Prettier formatting                            | Done   | 966d7aaf508a9e809155847bf4f3ca218db03821 | Added ESLint script and check script.                                                                                                                                                 |
| FH-002 | P0       | Tooling    | Verify ESLint config format and package scripts                                              | Done   | 966d7aaf508a9e809155847bf4f3ca218db03821 | Replaced invalid JSON config with ESLint flat config.                                                                                                                                 |
| FH-003 | P0       | API        | Review hardcoded localhost/dev API configuration                                             | Todo   |                                          | Production should continue using same-root `/api`. Dev may keep localhost or use Vite proxy.                                                                                          |
| FH-004 | P0       | API        | Remove, rename, or isolate old mock/random API code if still present                         | Done   | 966d7aaf508a9e809155847bf4f3ca218db03821 | Verified current `productApi.js` has no mock/random API behavior and no hardcoded API base URL. No code change needed.                                                                |
| FH-005 | P0       | Refresh    | Move refresh lifecycle state into the refresh service instance                               | Done   | f2280260c3f2ffab023a08ebe6de655ffa19191a | Refresh runtime state is scoped to the service instance; refresh start/state capture is protected by try/finally.                                                                     |
| FH-006 | P1       | CSS        | Split global stylesheet by feature/area                                                      | Todo   |                                          | Should be selector-preserving and behavior-neutral.                                                                                                                                   |
| FH-007 | P1       | API        | Add frontend request timeout/abort hardening where possible                                  | Done   | c13dbac7c0e44c608bd43ffd21acf0c90a3fb708 | Added optional timeout/abort handling in the API client and applied it to short product calls. Export remains timeout-disabled until backend job/status support exists.               |
| FH-008 | P1       | API        | Standardize frontend API result/error handling                                               | Done   | 32819a4bee5b53240f75abf70d3912e0d8edaeda | Centralized API error message formatting in `apiResult.js` and reused it from API client, product API, and API notices.                                                               |
| FH-009 | P1       | Actions    | Add or improve tests around product action availability                                      | Done   | 5ca8c6ebe7ead9171bbbc40793546d37c16c2f67 | Added unit tests for product action and export availability states; made API client safe to import in Node tests.                                                                     |
| FH-010 | P1       | Export     | Review local export operation state and stale UI risks                                       | Done   | 8fb2cfa678ffe236472e1b6c09aca42ffc317023 | Verified local export operations are started/ended through the existing try/finally flow and added root export loading state without blocking the dropdown.                           |
| FH-011 | P1       | Notices    | Add notice deduplication/rate limiting if repeated errors can spam users                     | Done   | 051c419db775579ad8c9c8f82f5f834ecb46252c | Added opt-in notice deduplication and enabled it for API failure notices.                                                                                                             |
| FH-012 | P1       | Popup UI   | Review keyboard/focus/ARIA hardening for custom popup actions                                | Todo   |                                          | Necessary because popup action bar is custom DOM.                                                                                                                                     |
| FH-013 | P1       | Structure  | Review map feature folder boundaries and imports                                             | Todo   |                                          | Aim for clearer public entrypoints without behavior changes.                                                                                                                          |
| FH-014 | P1       | Structure  | Split product history/timeline naming if needed                                              | Todo   |                                          | Product history and global map timeline should stay conceptually separate.                                                                                                            |
| FH-015 | P2       | Config     | Add or update `.env.example` and document dev/prod API base behavior                         | Done   | 966d7aaf508a9e809155847bf4f3ca218db03821 | Added env example and preserved current dev/prod API behavior.                                                                                                                        |
| FH-016 | P2       | Bootstrap  | Review Calcite readiness/bootstrap timing                                                    | Done   | 4c2ccbcfa71436d8554fb6512fcb20b658134427 | Added shared Calcite component readiness helper and wait for startup-critical Calcite elements before UI initialization.                                                              |
| FH-017 | P2       | HTML/CSS   | Move inline shell/confirm-popover styling into CSS                                           | Done   | 17eb5a8924112c29a19aaa95042029a39d57e244 | Removed inline confirm-popover divider styling and added dialog semantics, focus trap, Escape handling, and controlled focus restore.                                                 |
| FH-018 | P1       | Refresh    | Review duplicate refresh error notices between selected product refresh and full map refresh | Done   | ed42779ae40fb1c419c15380fd3e22a31baac0fb | Initial popup freshness refresh is now silent on failure so full map refresh owns the user-facing refresh failure notice.                                                             |
| FH-019 | P2       | Export UI  | Show a loading spinner on the parent `Export...` popup action while an export is running     | Done   | 8fb2cfa678ffe236472e1b6c09aca42ffc317023 | Parent export action now shows loading while remaining openable so users can inspect leaf action state.                                                                               |
| FH-020 | P3       | Browser QA | Re-test popup/export rendering artifacts after Chrome/Edge restart                           | Todo   |                                          | Chrome showed non-DOM rendering boxes and Edge showed inconsistent Calcite loading rendering during remote session. Treat as browser/compositor QA unless reproducible after restart. |

## Deferred / backend-dependent notes

| ID     | Area     | Item                                              | Status             | Notes                                                                                                                 |
| ------ | -------- | ------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| BE-001 | Export   | Cross-browser/cross-user export-in-progress state | Blocked by backend | Requires backend operation/job state.                                                                                 |
| BE-002 | Export   | `409 Conflict` for conflicting operations         | Blocked by backend | Requires backend conflict response contract.                                                                          |
| BE-003 | Export   | Async export job with job-status endpoint         | Blocked by backend | Frontend can prepare structure, but cannot solve backend blocking alone.                                              |
| BE-004 | Timeline | Product history/global timeline data contract     | Blocked by backend | Should remain deferred until API/database contract is known.                                                          |
| BE-005 | API      | Safe timeout policy for long-running operations   | Blocked by backend | Export and other long-running operations need async job/status semantics before frontend can enforce strict timeouts. |

## Commit log

| Date | Commit | Items | Notes |
| ---- | ------ | ----- | ----- |
|      |        |       |       |
