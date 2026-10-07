# F5 v3 publication-generation correction

## Controlled inputs

Authoritative baseline: `10f940d2ef9a6e21e9b72dba18c779eb39478f20`.

Controlled v2 ZIP SHA-256 verified:
`53709945DD4ADE3A439FF27C0AB0189F4A59E5B0C3827403E9D4DE6018F1AFB0`.

The working copy was byte-verified against baseline plus the controlled v2 ZIP before
editing. No redesign, backend changes, dependencies, lockfiles or persistence changes.
No commit was created. Earlier implementation reports remain historical.

## Narrow implementation

`packagePopupSnapshot.synchronize()` notifies `onSourcePublication` only after its
existing session/identity/source checks succeed and immediately before source state
is published. `createPopup.js` uses that hook to advance its existing `latestRefreshId`.
The same counter remains the sole publication generation for detail requests, source
publication and disconnect. No timestamp ordering or second generation was introduced.

A detail begun before the newer source publication fails the existing stale check
and returns false before Graphic mutation, metadata merge or render. Its entire
`workUnitMetadata` and `exportMetadata` result is rejected. The newer AOI state and
currently accepted/preserved overlay remain. Detail begun afterward can publish normally.

The freshness monitor therefore cannot acknowledge a changed revision from a rejected
read. A later bounded check retries it; initial superseded detail uses the existing
`requireRefresh()` recovery and following check. Existing one-in-flight read semantics
remain unchanged. Source bridge itself performs zero Product/AOI/job requests and
starts no timer; neither the cadence nor visibility lifecycle is restarted.

All v2 source/session/identity/Graphic-removal guards and combined cleanup remain.
Package jobs/active and Hangfire watching stay absent. Non-package refresh behavior,
F1 workflow/member status filtering, F2 mixed rendering, F3 counts and source-owned
complete map state are preserved. Package actions/navigation remain unavailable.

## Realistic regression coverage

The regression starts from member edition 1, starts freshness detail A for revision B,
source-syncs edition 3 while A is pending, then completes A with edition 2 and an old
candidate/validation overlay. It asserts false acceptance, edition 3 in both popup
snapshot and Graphic, and no publication of A's overlay. The same observed revision
can then retry once, publish newer detail, and acknowledge; an unchanged subsequent
check performs no additional detail read. The bridge itself adds zero detail requests.

The new regression was transplanted into an isolated copy of controlled v2 with only
the test file replaced. It failed as expected: the old read returned true instead of
false. All production modules in that reproduction remained controlled v2. The test
passes against v3. The initial-read race also covers rejected old metadata plus
immediate bounded recovery, without simultaneous duplicate requests. Invalid source
callbacks cannot advance publication generation.

## Verification actually run

- 80 focused Node tests passed directly: package snapshot/source bridge and generation
  race, package freshness/real monitor integration, Product overlay, workspace monitor,
  source reconciliation, normalization and status/identity regression boundaries.
- All 19 changed/new JavaScript files relative to baseline passed `node --check`;
  this correction changes three JavaScript files relative to v2.
- Broad final v3: 290 tests, 251 passed, 39 failed.
- Controlled v2: 288 tests, 249 passed, 39 failed.
- Unmodified baseline: 256 tests, 217 passed, 39 failed.
- Failure names match exactly across all three runs. No new failure.
- Full popup backend-sync/live ENC/F3/job/navigation suites remain partially blocked
  by missing archive support files, including map layer definitions, attribute filter
  configuration, correction symbol resolver and omitted app/HTML files. The available
  production bridge/monitor/source helpers are exercised directly by focused tests.
- `npm run check`, npm format/lint/build and browser acceptance were not run: supplied
  project files/dependencies are incomplete (package.json and node_modules absent).
  No dependencies were installed solely for verification.
- Backend checks were not needed because no backend file changed.

Commands: `node --test <focused paths>`, `node --test --test-concurrency=1
--test-timeout=3000 <all supplied test paths>`, `node --check <each changed JS>`.
Negative reproduction used `node --test --test-name-pattern='newer source publication
rejects entire realistic' <transplanted test path>`.

## Local browser acceptance

After `cd src/ProductCatalogue`, `npm run format` and `npm run check`:

1. Open ENC package: both Product names and independent current versions appear.
2. Confirm no package jobs/active or Hangfire watcher. Revision checks remain about
   30 seconds; unchanged revision causes no Product-detail request.
3. Delay a targeted detail response using tooling or backend delay. While pending,
   trigger normal Main-map source refresh carrying newer member current metadata/state.
4. The open popup must immediately adopt source state. Let old detail finish: it must
   not roll back current metadata or publish its old candidate/validation overlay.
5. A later bounded freshness retry must publish current detail once. Source bridge
   must itself add no Product-detail request, job request or timer.
6. Repeat close, selection/source switch, replacement/deactivation and Graphic removal
   during a delayed read: no stale publication or leftover bridge/monitor listeners.
7. Check hidden/visible behavior, overlay preservation across source refresh, and explicit
   authoritative overlay replacement/removal from v2.
8. Verify one Graphic/package and unchanged F1/F2/F3 after normal source refresh.
9. Verify non-package Product jobs/popup behavior and package fail-closed actions/navigation.
10. Check light/dark, status-only colors, keyboard, Escape, focus restoration, error
    overlay, selected error text and validation links.

Known limitations: live ArcGIS/Calcite DOM/Network acceptance remains pending.
Complete AOI/map/filter state still converges through normal source refresh; preserved
candidate overlay may remain until the next accepted bounded detail revalidation.

Suggested commit after acceptance:
`feat(product-catalogue): add live package popup freshness`

## Exact files changed/new relative to controlled v2

- `src/ProductCatalogue/docs/enc-package-frontend-foundation.md`
- `src/ProductCatalogue/docs/live-package-popup-F5-v3-correction-report.md` (new)
- `src/ProductCatalogue/docs/normalized-workflow-frontend-adaptation.md`
- `src/ProductCatalogue/src/features/map/popups/README.md`
- `src/ProductCatalogue/src/features/map/popups/createPopup.js`
- `src/ProductCatalogue/src/features/map/popups/packagePopupSnapshot.js`
- `src/ProductCatalogue/src/features/map/popups/packagePopupSnapshot.test.js`

Deleted relative to v2: none.

## Exact full changed/new files relative to baseline

- `src/ProductCatalogue/docs/enc-package-frontend-foundation.md`
- `src/ProductCatalogue/docs/live-enc-package-F4-implementation-report.md`
- `src/ProductCatalogue/docs/live-package-popup-F5-implementation-report.md` (new)
- `src/ProductCatalogue/docs/live-package-popup-F5-v2-correction-report.md` (new)
- `src/ProductCatalogue/docs/live-package-popup-F5-v3-correction-report.md` (new)
- `src/ProductCatalogue/docs/normalized-workflow-frontend-adaptation.md`
- `src/ProductCatalogue/src/features/data/api/productApi.js`
- `src/ProductCatalogue/src/features/data/normalizers/productResponse.js` (new)
- `src/ProductCatalogue/src/features/data/normalizers/productResponse.test.js` (new)
- `src/ProductCatalogue/src/features/data/normalizers/workUnitMetadata.js` (new)
- `src/ProductCatalogue/src/features/data/normalizers/workUnitMetadata.test.js` (new)
- `src/ProductCatalogue/src/features/dataSources/services/dataSourceNormalizer.js`
- `src/ProductCatalogue/src/features/map/popups/README.md`
- `src/ProductCatalogue/src/features/map/popups/createPopup.js`
- `src/ProductCatalogue/src/features/map/popups/packageFoundation.test.js`
- `src/ProductCatalogue/src/features/map/popups/packagePopupFreshness.integration.test.js` (new)
- `src/ProductCatalogue/src/features/map/popups/packagePopupFreshness.js` (new)
- `src/ProductCatalogue/src/features/map/popups/packagePopupFreshness.test.js` (new)
- `src/ProductCatalogue/src/features/map/popups/packagePopupSnapshot.js` (new)
- `src/ProductCatalogue/src/features/map/popups/packagePopupSnapshot.test.js` (new)
- `src/ProductCatalogue/src/features/map/popups/popupBackendSync.js`
- `src/ProductCatalogue/src/features/map/popups/popupBackendSync.test.js`
- `src/ProductCatalogue/src/features/map/popups/popupProductMetadata.js`
- `src/ProductCatalogue/src/features/map/popups/popupProductMetadata.test.js`
- `src/ProductCatalogue/src/features/products/services/workspaceFreshnessMonitor.js`
- `src/ProductCatalogue/src/features/products/services/workspaceFreshnessMonitor.test.js`

Deleted relative to baseline: none.
