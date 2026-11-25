# Product Catalogue demo-readiness plan

Status: **verification planned; not yet accepted as demo-ready**.

Original planning baseline: `c4b0f7e1108b40b2cb4f4b40f0ac95e2280d906c` (2026-10-26).
Documentation-audit snapshot: `ff807a4923fcef01dccae85d2e8db5c594eb612a`
(2026-11-25, verified committed documentation and scoped R10 source; not a new full-system demo acceptance).
The previous reconciliation snapshot was `2d8c1637425e971572bd09d98de9e29e45745de4` (2026-10-27).

Scope: **stabilize existing behavior only**. No SDK upgrade, new map visualization, alternate test framework or broad refactor in the demo stabilization branch.

This checklist supplements the [historical release review](frontend-release-readiness-review.md), the [frontend tracker](frontend-hardening-tracker.md) and [FI-043 onboarding documentation](fi-043-onboarding-refresh.md). It records **what to test**, not a claim that the tests have already passed. Report the selected Git commit, environment, test data, observed result, known backend caveat and date with every manual acceptance.

## Baseline and evidence

| Check                     | Acceptance evidence                                                               | Status at document creation                                                                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository baseline       | Git SHA and clean/understood working tree; documentation matches current branch   | Committed documentation/R10 source archive for `ff807a49`; ZIP SHA-256, 80 file checksums and Git blobs verified; scoped working tree reported clean.                              |
| Local frontend gate       | `cd src/ProductCatalogue; npm run format; npm run check`                          | Developer reports running frontend tests, format, lint and build before each accepted frontend commit; this documentation pass did not rerun them                                  |
| Real browser + deployment | Real UI behavior and server integration in the intended demonstration environment | New end-to-end pass pending                                                                                                                                                        |
| FI-027 and FI-029         | Latest committed changes, no regressions in supported paths                       | FI-027 hover fix committed; owner reported ENC-package popup looked correct, but cross-source workflows unverified                                                                 |
| FI-043                    | Main map, Dashboard, Analyze, Review route onboarding with fresh/replayed state   | Historical `a31f57a0` failures corrected; developer accepted FI-043 at `9280c650` and DSA-04 Back/Forward replay at `69b0d329`. See [FI-043 verification](fi-043-verification.md). |

### Accepted stability corrections (not a full demo smoke)

Developer-reported accepted commits: FI-043 `9280c650`; DSA-01/02 `914c57a9` (API-body failures and Product search races); DSA-03 `20cb5c60` (targeted status refresh); DSA-04 `69b0d329` (onboarding after Back/Forward); DSA-05/06 `12a6e084` (Dashboard History retry and debounce); DSA-07 v2 `bfcb5ecc` (Collection focus); DSA-08 `2d8c1637` (direct Analyze/Review route startup). DSA-09/10 test/documentation cleanup remains separate from runtime acceptance.

Further November commits in this snapshot: `54436f7` (aggregate Package status),
`d09a1db` (Basemap Gallery), `ddfb26b` (Calcite slider/loading hold), `d400be0`
(Main-map readiness), `1065291` (Analyze direct-route readiness and popup content),
`6f38fdb` (focus/reduced motion), `1ac36e4` (Preferences Restore defaults),
`dfd38de` (responsive navbar/Dashboard calendar) and `63c89ff0` (confirmation
and Notice Center accessibility). A committed implementation is **not** a full
cross-browser or deployment verification result.

## Manual demo regression matrix

| Flow                         | Minimum checks                                                                                                                                 | Notes                                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup and routes           | Main map, Dashboard, Analyze, Review directly and via navbar; cold reload and navigation while map loads; initial MapView/layer readiness      | Preserve current route/focus, bounded loader fallback and independent load errors                                                                                   |
| Main map and layers          | AOI geometry, aggregate Package.Status color and neutral Unknown, candidate member detail, hover, selection, refresh and source enablement     | Check no retired member-status hatching, duplicate Graphics, stale selection or silent status mutation                                                              |
| Product search               | Search known Product, keyboard Enter/Escape, selection/popup, no duplicate requests                                                            | Product lookup is independent of Locator                                                                                                                            |
| Locator                      | Open/close beside navbar Product search; geographic search/navigation; light-mode hover and dark-mode contrast; focus/Escape                   | No Product selection or transient marker introduced by Locator                                                                                                      |
| Filters and Preferences      | Aggregate Package status versus ProductState filter, counts/reset, saved state, Restore defaults, Scale hiding, Theme and Basemap              | Preserve source-aware defaults; verify Basemap Gallery and theme/manual choices on Main Map and Analyze                                                             |
| Popup and Product Collection | Open/reopen; common action row, Package and member statuses, error help, confirmation focus/Escape, Tools/Collection and cross-workspace links | Only trigger mutations against approved disposable Products; verify unsupported actions fail closed, focus returns and no stale popup overrides newer selection.    |
| Dashboard                    | Range, filters/sort/cursor paging, reporting aggregates, chart actions, History/IC-ENC/Validation toggles, Links, errors                       | Check complete-result versus page counts, distinct current-health/report scopes, focus, Escape, onboarding and no duplicate logical requests.                       |
| Analyze and Review           | Direct-route initial Analyze loading/readiness, popup content, Product composition, History/validation, toggles, targeted refresh and errors   | Preserve unaffected Products, focus and source-isolated state; no second full loader on interactive changes                                                         |
| Timeline / reports           | Product History and available IC-ENC/internal validation artifact files across Analyze, Review and Dashboard                                   | Verify actual authorized downloads and exact Product/revision provenance; missing reports remain empty/unavailable. Do not infer provider verdicts from file names. |
| Onboarding (FI-043)          | Main map, Dashboard, Analyze and Review first visit and replay; known/missing target, popup steps, Escape, focus return and session cleanup    | Recheck selectors and controls changed by FI-027 and FI-029                                                                                                         |
| Refresh / async lifecycle    | Reopen popup during refresh, rapid Product/source changes, superseded requests and route leaving                                               | Stale operations must not publish newer state; investigate observers only with actual evidence                                                                      |
| Accessibility / visual       | Light/dark, pointer hover, Tab/Shift+Tab, Escape, focus return, reduced motion, 320–820px layout and 100–150% zoom                             | Check accessible confirmation dialog, keyboard-operable Close notifications, calendar and navbar with no hidden actions                                             |

## PC-UX-R10 viewer regression and real-data verification

The developer accepted the final viewer and committed it at `ff807a49` on 2026-11-25.
The following is a future regression checklist, not a claim that each scenario has
been executed in this reconciliation. Use approved real or controlled test artifacts;
no Product mutation or new validation is required for these checks.

| Scenario                              | Expected result                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Main Map                              | Open a Package with S-101/S-57 member files. Verified VLDs show compact View report/download actions; a single ZIP is download-only. Distinct historical files retain filenames and correct member ownership.                                                                                                |
| Dashboard                             | Open Validation for a selected activity; report tiles wrap without clipping or losing the full-width activity context. Verify the exact file/revision is previewed; Product history is not proof of activity-specific attribution. IC-ENC attachments remain download-only.                                  |
| Analyze and Review                    | Open an eligible internal VLD from each workspace; preserve Product cards, selection, scroll and History/IC-ENC state. Foreign member or unsupported files never receive a viewer action.                                                                                                                    |
| Findings and Raw file                 | Compare summary totals with the original Analyzer report. Show reported totals separately from available occurrences; filter and search only available data. Verify metadata, occurrence navigation, related objects, Raw file find/copy and original-byte download.                                         |
| Unsupported formats and read failures | Malformed/unsupported XML with readable bytes uses Raw file with an explanation. Oversized (over 16 MiB), empty, unauthorized, redirected or failed downloads do not render fabricated findings. Original download remains available; general S-57 parsing is not assumed.                                   |
| Lifecycle and accessibility           | Verify keyboard activation, Tab/Shift+Tab containment, Escape, outside press/click, text selection without accidental close, return focus, light/dark and narrow layout. Rapid reopen, close during a throttled request and route navigation must not publish a stale report or duplicate a logical request. |

Verify that no artifact body is requested before View report is activated, that the
exact existing authorized route is used and that the request is retired when the
viewer closes. Keep live IC-ENC receipt, report ingestion, and exact event attribution
checks separate from this internal-validation viewer regression. Record the deployed
commit and actual pass/fail/skipped results in the test log.

## Post-R06 verification and next performance investigation

R06 backend `dca718363ec901add42985e4da1755fecf409a31` and frontend
`c382d760f2f137974eaade673e5029112b288cc4` are developer-accepted; frontend merge
`c45a1255ea9a7138cc5045de0bc8ec90d39d48dd` is the historical R06 merge baseline.
The current documentation snapshot additionally includes the accepted R10 viewer at
`ff807a4923fcef01dccae85d2e8db5c594eb612a`. Neither acceptance certifies a full deployed smoke. Earlier R06 candidate
checks and the actual November 17 API samples remain recorded historical evidence.

| Check                                        | Expected result                                                                                                                                                                                                                                     | Status                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Dashboard sorting and cursor paging (FI-010) | Stable ascending/descending order for Time, Product, Activity and Status; cursor navigation does not duplicate or omit activities for unchanged data                                                                                                | Not tested in this reconciliation                        |
| Reporting scope and empty results            | Activity summaries reflect the entire filtered result; page changes alone do not change totals. Current health and report/distribution counts retain their documented independent scopes. Missing aggregates are not replaced by fabricated zeroes. | Not tested in this reconciliation                        |
| Panel and navigation regression              | History, IC-ENC and Validation toggle directly; Links has only Review/Analyze; keyboard, Escape, focus return, narrow/wide layouts, themes and onboarding remain usable                                                                             | Final UI accepted by developer; post-merge smoke pending |
| IC-ENC artifact retrieval                    | Authorized Product artifact history and actual download succeed when suitable files exist; no incorrect revision ownership; unavailable/failed states remain truthful                                                                               | Pending suitable data/backend verification               |
| Full deployment demo                         | Main map, Dashboard, Analyze and Review, including accepted workflow boundaries and the matrix above                                                                                                                                                | Pending                                                  |

### Main-map performance capture (read-only)

The previous November capture was a Vite development-server run, not a production
baseline. Do not change dependencies, bundle splitting, map loading or backend SQL
on that evidence alone. The next independent technical task is a comparable
built/deployed Main-map measurement:

1. Use the actual deployed/built ProductCatalogue frontend and record the deployed
   commit, browser, viewport, map extent and dataset conditions. Verify this is not
   a Vite development-server module waterfall.
2. Capture three comparable cold-cache hard reloads (DevTools Network, Disable
   cache), plus one warm-cache load. For every run record first visible basemap,
   first visible Product geometry and first successful Product search/popup
   interaction. Record failures rather than substituting the last network request
   time for readiness.
3. Keep raw HAR files local. Use the established local
   `Export-CatalogueHarTiming.ps1` script for ProductCatalogue to export sanitized
   timing and summary CSVs; inspect the exported fields for internal URLs, tokens
   and identifiers before sharing. Report actual user-facing milestones and any
   reproducible long main-thread tasks separately.
4. Compare request counts, transferred bytes, API and SDK/basemap timing, and the
   real usability milestones. Only a persistent, measured production bottleneck
   justifies a targeted source audit or implementation candidate.

No production capture or application benchmark has been run by this documentation
reconciliation.

## Known limitations and go/no-go

1. **FI-029 is not end-to-end accepted for ordinary Products.** The unified action row is shared, but non-package mutations remain disabled in the verified frontend architecture until the appropriate source-owned backend dispatch/eligibility contract exists. The demonstration may show available ENC-package behavior, but must not imply universal dispatch support.
2. **Backend-dependent surfaces:** Real IC-ENC ingestion/download verification, exact report-to-event attribution, authoritative mutation capabilities, related Product relationships, final error classification and truthful backend chunk/progress remain separate. The integrated artifact UI, Dashboard reporting aggregates and shared VLD viewer are not unimplemented features. The demo-facing combined `Distributed` count is not evidence of external delivery.
3. **No destructive production-data tests:** Test mutations only against explicitly approved disposable data. Otherwise check availability, descriptions, disabled state and confirmation presentation without invoking operations.
4. **Demo freeze gate:** Record the commit SHA, `npm run check` result, representative actual browser/deployment smoke results and known limitations. Fix confirmed regressions with minimal targeted changes; defer broad refactors and exploratory tooling.
5. **Future experiment branch:** Only after the demo baseline is accepted, investigate SDK/Calcite upgrades, Product labels/linked annotations, Sonda, Vitest/browser harnesses, FeatureEffect and optional UI framework changes.

## Test log template

| Date / environment | Commit           | Area   | Result (pass/fail/skipped) | Evidence / blocker                |
| ------------------ | ---------------- | ------ | -------------------------- | --------------------------------- |
| _To be recorded_   | _Current commit_ | _Flow_ | _Pending_                  | _Observed behavior or dependency_ |
