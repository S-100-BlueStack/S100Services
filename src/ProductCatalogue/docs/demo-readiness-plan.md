# Product Catalogue demo-readiness plan

Status: **verification planned; not yet accepted as demo-ready**.

Original planning baseline: `c4b0f7e1108b40b2cb4f4b40f0ac95e2280d906c` (2026-10-26).
Recorded frontend baseline for this documentation reconciliation: `2d8c1637425e971572bd09d98de9e29e45745de4` (2026-10-27, developer-reported accepted commit).

Scope: **stabilize existing behavior only**. No SDK upgrade, new map visualization, alternate test framework or broad refactor in the demo stabilization branch.

This checklist supplements the [historical release review](frontend-release-readiness-review.md), the [frontend tracker](frontend-hardening-tracker.md) and [FI-043 onboarding documentation](fi-043-onboarding-refresh.md). It records **what to test**, not a claim that the tests have already passed. Report the selected Git commit, environment, test data, observed result, known backend caveat and date with every manual acceptance.

## Baseline and evidence

| Check                     | Acceptance evidence                                                               | Status at document creation                                                                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository baseline       | Git SHA and clean/understood working tree; documentation matches current branch   | Frontend acceptance reported through `2d8c1637`; working tree and deployed build were not independently inspected for this documentation pass                                      |
| Local frontend gate       | `cd src/ProductCatalogue; npm run format; npm run check`                          | Developer reports running frontend tests, format, lint and build before each accepted frontend commit; this documentation pass did not rerun them                                  |
| Real browser + deployment | Real UI behavior and server integration in the intended demonstration environment | New end-to-end pass pending                                                                                                                                                        |
| FI-027 and FI-029         | Latest committed changes, no regressions in supported paths                       | FI-027 hover fix committed; owner reported ENC-package popup looked correct, but cross-source workflows unverified                                                                 |
| FI-043                    | Main map, Dashboard, Analyze, Review route onboarding with fresh/replayed state   | Historical `a31f57a0` failures corrected; developer accepted FI-043 at `9280c650` and DSA-04 Back/Forward replay at `69b0d329`. See [FI-043 verification](fi-043-verification.md). |

### Accepted stability corrections (not a full demo smoke)

Developer-reported accepted commits: FI-043 `9280c650`; DSA-01/02 `914c57a9` (API-body failures and Product search races); DSA-03 `20cb5c60` (targeted status refresh); DSA-04 `69b0d329` (onboarding after Back/Forward); DSA-05/06 `12a6e084` (Dashboard History retry and debounce); DSA-07 v2 `bfcb5ecc` (Collection focus); DSA-08 `2d8c1637` (direct Analyze/Review route startup). These are implementation/acceptance records, **not** a complete browser or deployment smoke pass. DSA-09/10 test/documentation cleanup is separate from runtime acceptance.

## Manual demo regression matrix

| Flow                         | Minimum checks                                                                                                                              | Notes                                                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup and routes           | Main map, Dashboard, Analyze, Review directly and via navbar; reload; navigation while map loads                                            | Preserve current route/focus and independent load errors                                                                                                                                                       |
| Main map and layers          | AOI geometry/status visibility, light/dark, hover, overlap picker, modifier selection, map refresh and source enablement                    | Check no duplicate Graphics, stale selection or silent status mutation                                                                                                                                         |
| Product search               | Search known Product, keyboard Enter/Escape, selection/popup, no duplicate requests                                                         | Product lookup is independent of Locator                                                                                                                                                                       |
| Locator                      | Open/close beside navbar Product search; geographic search/navigation; light-mode hover and dark-mode contrast; focus/Escape                | No Product selection or transient marker introduced by Locator                                                                                                                                                 |
| Filters and Preferences      | Filter/reset, browser-saved state, Scale hiding, Theme and scroll/focus behavior                                                            | Preserve source-aware defaults and no accidental persistence changes                                                                                                                                           |
| Popup and Product Collection | Open, close, reopen; shared Pause/Resume, Discard, Send/Accept, Tools row; status/tooltips; add/remove Collection; cross-workspace links    | Verify only non-destructive UI presentation on real data. Do **not** trigger Discard, Send or other mutations without dedicated test Products and authorization. Unsupported actions must visibly fail closed. |
| Dashboard                    | Date/time range draft and apply semantics, filtering/sorting, paging, History, route actions and independent error handling                 | One committed input should not trigger duplicate logical requests                                                                                                                                              |
| Analyze and Review           | Product picker, multi-Product composition, History/validation, content toggles, targeted refresh and independent errors                     | Preserve unmodified Products and focus after rerenders                                                                                                                                                         |
| Timeline / reports           | Show available Product History and truthful unavailable report placeholders                                                                 | Do not claim report links or external delivery without backend artifacts                                                                                                                                       |
| Onboarding (FI-043)          | Main map, Dashboard, Analyze and Review first visit and replay; known/missing target, popup steps, Escape, focus return and session cleanup | Recheck selectors and controls changed by FI-027 and FI-029                                                                                                                                                    |
| Refresh / async lifecycle    | Reopen popup during refresh, rapid Product/source changes, superseded requests and route leaving                                            | Stale operations must not publish newer state; investigate observers only with actual evidence                                                                                                                 |
| Accessibility / visual       | Light/dark, pointer hover, keyboard focus/Escape, responsive width and reduced motion                                                       | No invisible Locator icons or unusable action controls                                                                                                                                                         |

## Known limitations and go/no-go

1. **FI-029 is not end-to-end accepted for ordinary Products.** The unified action row is shared, but non-package mutations remain disabled in the verified frontend architecture until the appropriate source-owned backend dispatch/eligibility contract exists. The demonstration may show available ENC-package behavior, but must not imply universal dispatch support.
2. **Backend-dependent surfaces:** Real report links, authoritative mutation capabilities, related Product relationships, final status classifications and truthful backend chunk/progress remain separately scoped. Show unavailable states, not fictional results.
3. **No destructive production-data tests:** Test mutations only against explicitly approved disposable data. Otherwise check availability, descriptions, disabled state and confirmation presentation without invoking operations.
4. **Demo freeze gate:** Record the commit SHA, `npm run check` result, representative actual browser/deployment smoke results and known limitations. Fix confirmed regressions with minimal targeted changes; defer broad refactors and exploratory tooling.
5. **Future experiment branch:** Only after the demo baseline is accepted, investigate SDK/Calcite upgrades, Product labels/linked annotations, Sonda, Vitest/browser harnesses, FeatureEffect and optional UI framework changes.

## Test log template

| Date / environment | Commit           | Area   | Result (pass/fail/skipped) | Evidence / blocker                |
| ------------------ | ---------------- | ------ | -------------------------- | --------------------------------- |
| _To be recorded_   | _Current commit_ | _Flow_ | _Pending_                  | _Observed behavior or dependency_ |
