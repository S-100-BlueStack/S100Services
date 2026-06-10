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

| ID     | Priority | Area      | Item                                                                                         | Status | Commit                                   | Notes                                                                                                                                                                   |
| ------ | -------- | --------- | -------------------------------------------------------------------------------------------- | ------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FH-001 | P0       | Tooling   | Add a real lint/check baseline in addition to Prettier formatting                            | Done   | 966d7aaf508a9e809155847bf4f3ca218db03821 | Added ESLint script and check script.                                                                                                                                   |
| FH-002 | P0       | Tooling   | Verify ESLint config format and package scripts                                              | Done   | 966d7aaf508a9e809155847bf4f3ca218db03821 | Replaced invalid JSON config with ESLint flat config.                                                                                                                   |
| FH-003 | P0       | API       | Review hardcoded localhost/dev API configuration                                             | Todo   |                                          | Production should continue using same-root `/api`. Dev may keep localhost or use Vite proxy.                                                                            |
| FH-004 | P0       | API       | Remove, rename, or isolate old mock/random API code if still present                         | Done   | 966d7aaf508a9e809155847bf4f3ca218db03821 | Verified current `productApi.js` has no mock/random API behavior and no hardcoded API base URL. No code change needed.                                                  |
| FH-005 | P0       | Refresh   | Move refresh lifecycle state into the refresh service instance                               | Done   | f2280260c3f2ffab023a08ebe6de655ffa19191a | Refresh runtime state is scoped to the service instance; refresh start/state capture is protected by try/finally.                                                       |
| FH-006 | P1       | CSS       | Split global stylesheet by feature/area                                                      | Todo   |                                          | Should be selector-preserving and behavior-neutral.                                                                                                                     |
| FH-007 | P1       | API       | Add frontend request timeout/abort hardening where possible                                  | Done   | c13dbac7c0e44c608bd43ffd21acf0c90a3fb708 | Added optional timeout/abort handling in the API client and applied it to short product calls. Export remains timeout-disabled until backend job/status support exists. |
| FH-008 | P1       | API       | Standardize frontend API result/error handling                                               | Todo   |                                          | Avoid mixing returned result objects and thrown errors unnecessarily.                                                                                                   |
| FH-009 | P1       | Actions   | Add or improve tests around product action availability                                      | Todo   |                                          | Central logic should be protected before larger refactors.                                                                                                              |
| FH-010 | P1       | Export    | Review local export operation state and stale UI risks                                       | Todo   |                                          | Cross-user/cross-tab operation state is backend-dependent.                                                                                                              |
| FH-011 | P1       | Notices   | Add notice deduplication/rate limiting if repeated errors can spam users                     | Done   | 051c419db775579ad8c9c8f82f5f834ecb46252c | Added opt-in notice deduplication and enabled it for API failure notices.                                                                                               |
| FH-012 | P1       | Popup UI  | Review keyboard/focus/ARIA hardening for custom popup actions                                | Todo   |                                          | Necessary because popup action bar is custom DOM.                                                                                                                       |
| FH-013 | P1       | Structure | Review map feature folder boundaries and imports                                             | Todo   |                                          | Aim for clearer public entrypoints without behavior changes.                                                                                                            |
| FH-014 | P1       | Structure | Split product history/timeline naming if needed                                              | Todo   |                                          | Product history and global map timeline should stay conceptually separate.                                                                                              |
| FH-015 | P2       | Config    | Add or update `.env.example` and document dev/prod API base behavior                         | Done   | 966d7aaf508a9e809155847bf4f3ca218db03821 | Added env example and preserved current dev/prod API behavior.                                                                                                          |
| FH-016 | P2       | Bootstrap | Review Calcite readiness/bootstrap timing                                                    | Todo   |                                          | Avoid relying on one component definition if more are required at startup.                                                                                              |
| FH-017 | P2       | HTML/CSS  | Move inline shell/confirm-popover styling into CSS                                           | Todo   |                                          | Small maintainability cleanup.                                                                                                                                          |
| FH-018 | P1       | Refresh   | Review duplicate refresh error notices between selected product refresh and full map refresh | Todo   |                                          | Manual refresh can show selected-product refresh failure before the full refresh retry flow finishes.                                                                   |
| FH-019 | P2       | Export UI | Show a loading spinner on the parent `Export...` popup action while an export is running     | Todo   |                                          | Leaf export actions already show loading; parent action currently only changes to static `Exporting...`.                                                                |

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
