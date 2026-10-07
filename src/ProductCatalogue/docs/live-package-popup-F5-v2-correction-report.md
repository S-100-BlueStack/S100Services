# F5 v2 source-refresh correction report

## Controlled inputs

- Authoritative baseline: `10f940d2ef9a6e21e9b72dba18c779eb39478f20`.
- Controlled v1 ZIP SHA-256 verified:
  `96FE416338FA3B27D25B621B777BFB9ED5DA526A1B5E32F581626E384CE406C7`.
- Working files were byte-verified against the baseline plus controlled v1 ZIP
  before corrections. No redesign or reconstruction from memory was performed.
- Original baseline archive/context hashes remain verified against their supplied
  manifest. No backend, dependency, lockfile or persistence changes. No commit.

## Focused correction

A connected package session again registers one handler with the existing
`registerPopupRefreshHandler` / `refreshOpenProductPopup` source-refresh bridge.
`createPackagePopupBackendSynchronization` keeps that local callback separate from
freshness-driven detail reads and unregisters it together with the revision monitor.
The non-package branch remains unchanged.

`packagePopupSnapshot` is a small application-owned helper. It validates the connected
session, dataset/source/Product/stable identity, original layer/source object, source
visibility and Graphic collection membership before publication. Invalid delayed
callbacks fail closed and unregister the session. Product-detail completion uses
the same session checks. Popup close still invalidates pending reads and cleans up
both lifecycles through the existing disconnect handler.

On a normal stable-Graphic source refresh, the callback reads the already-reconciled
Graphic. Its AOI-owned attributes replace the entire old popup snapshot, including
workflow status, `workUnitStatus`, current `workUnitMetadata`, identity and filters.
Only the last accepted `exportMetadata` is retained when the Graphic omits the field.
An explicit replacement, including null/undefined, wins. The retained overlay is
not written back to Graphic/map/filter state. Existing signature-based rendering
continues to preserve focus/error controls when presentation is unchanged.

The local callback makes zero Product-detail/AOI/job requests and creates no timer.
Source notification does not invalidate or duplicate an in-flight detail read.
The existing 30-second revision monitor alone owns targeted Product revalidation,
unchanged-revision suppression, visibility, coalescing and acknowledgement/recovery.
Package `jobs/active` and Hangfire watching remain absent. Non-package jobs remain
unchanged. F1/F2/F3, symbolization and normal source reconciliation remain unchanged.
The popup README now correctly states that workflow/member Status filtering,
mixed member-status hatching and contextual facet counts are active.

## Verification actually run

- 78 focused tests passed directly: package snapshot/source bridge integration,
  package freshness and real monitor integration, metadata, workspace monitor,
  source interaction reconciliation, Product/AOI normalization, F1 status projection,
  F2 member rendering projection and stable identity tests.
- All 19 changed/new JavaScript files relative to baseline passed `node --check`.
- Broad supplied suite, final v2: 288 tests, 249 passed, 39 failed.
- Controlled v1: 275 tests, 236 passed, 39 failed.
- Unmodified baseline: 256 tests, 217 passed, 39 failed.
- Failing test names match exactly across all three runs. No new failure.
- The existing full `popupBackendSync.test.js`, full live ENC/F3/job/navigation
  integration suites remain blocked by missing archive support files, including
  `features/map/config/layerDefinitions.js`, `features/map/filters/attributeFilterConfig.js`
  and `features/map/symbology/correctionSymbolResolver.js`. Existing source-contract
  tests also require omitted app/HTML files. The package registration/cleanup path
  itself is covered directly through the extracted production helper and real bridge.
- `npm run check`, npm format/lint/build and browser acceptance were not run:
  the supplied archive has no package.json or project node_modules. No installation.
- No backend verification required because backend source was not changed.

Commands: `node --test <focused test paths>`, `node --test --test-concurrency=1
--test-timeout=3000 <all supplied test paths>`, `node --check <each changed JS>`.

## Local browser acceptance

After `cd src/ProductCatalogue`, `npm run format` and `npm run check`:

1. Open an ordinary package: both current names and independent versions appear.
2. Confirm no package `jobs/active` or Hangfire request, and revision checks remain
   about 30 seconds. Unchanged revision must not request Product detail.
3. Keep popup open and trigger normal Main-map source refresh. Its new AOI member
   status/current metadata must appear immediately without close/reopen.
4. That source refresh must make no additional targeted Product-detail request.
   Confirm one stable Graphic/package and normal F1/F2/F3/map-state updates.
5. Load candidate validation links, then refresh the map. Links remain until an
   authoritative new Product-detail overlay replaces/removes them.
6. Change backend candidate state from another session: the next changed revision
   triggers exactly one detail read, overlaid only on the corresponding member.
7. Refresh source while detail is delayed: there is no duplicate detail request.
8. Hide/show the document: preserve bounded visibility behavior. Close/reopen,
   switch selection, deactivate/replace source while requests are pending: no stale
   callback, bridge registration, timer or listener may survive.
9. Confirm non-package Product-job and popup refresh behavior remains unchanged.
   Package mutation/navigation remains unavailable.
10. Check both themes, keyboard, Escape, focus restoration, selected error text,
    error overlay and status-only coloring.

Known limitation: a last accepted candidate overlay can remain until the next bounded
revision-driven detail refresh; this is intentional. Complete map state remains owned
by normal source refresh. Actual ArcGIS/Calcite DOM/Network acceptance is pending.

Suggested commit after acceptance:
`feat(product-catalogue): add live package popup freshness`

## Exact files changed/new relative to controlled v1

- `src/ProductCatalogue/docs/enc-package-frontend-foundation.md`
- `src/ProductCatalogue/docs/live-package-popup-F5-implementation-report.md`
- `src/ProductCatalogue/docs/live-package-popup-F5-v2-correction-report.md` (new)
- `src/ProductCatalogue/docs/normalized-workflow-frontend-adaptation.md`
- `src/ProductCatalogue/src/features/map/popups/README.md`
- `src/ProductCatalogue/src/features/map/popups/createPopup.js`
- `src/ProductCatalogue/src/features/map/popups/packagePopupFreshness.js`
- `src/ProductCatalogue/src/features/map/popups/packagePopupSnapshot.js` (new)
- `src/ProductCatalogue/src/features/map/popups/packagePopupSnapshot.test.js` (new)
- `src/ProductCatalogue/src/features/map/popups/popupBackendSync.js`
- `src/ProductCatalogue/src/features/map/popups/popupBackendSync.test.js`

Deleted relative to v1: none.

## Exact full changed/new files relative to baseline

- `src/ProductCatalogue/docs/enc-package-frontend-foundation.md`
- `src/ProductCatalogue/docs/live-enc-package-F4-implementation-report.md`
- `src/ProductCatalogue/docs/live-package-popup-F5-implementation-report.md` (new)
- `src/ProductCatalogue/docs/live-package-popup-F5-v2-correction-report.md` (new)
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
