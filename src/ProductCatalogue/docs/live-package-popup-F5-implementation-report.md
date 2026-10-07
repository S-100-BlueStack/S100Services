# F5 implementation report

Baseline: `10f940d2ef9a6e21e9b72dba18c779eb39478f20`.
No commit was created. Backend, dependencies, lockfiles and persistence are unchanged.

## Verified inputs

- Archive SHA-256: `55A87091D6CCD4AAF46DB2CD05DC59D150EA9964CD16F8BBE74F71CBF2EAC620`.
- Context SHA-256: `92916924D115509DFBD31379681FDEEF14A90786BADBD074055EC7FD0BDE7B14`.
- Both hashes match the supplied manifest and corrected task.

## Architecture and behavior

No new endpoint or backend projection was added. Product response normalization is
extracted unchanged into the data normalizer boundary, extended with current
`S101`/`S57` metadata. AOI normalization uses the same `workUnitMetadata.members`
shape from current package fields. Member identities are never derived; popup
column order remains owned by registry work-unit declarations. Contradictory AOI
identity retains F4 rejection, targeted detail rejects contradictory selected/member
identity, and contradictory named candidates cannot overlay another current member.

The package table adds Product names. Independent current Edition/Update values
are overlaid by matching active export metadata; failure status, error and validation
links stay local to that member. Missing current metadata is not fabricated. Without
an active export, status comes from AOI `workUnitStatus`, never workflow status.
Discarded tracks omitted by the backend never become frontend candidates. Existing
status-cell decoration and error-details/signature logic are retained. Simple Product
columns are unchanged.

`packagePopupFreshness` owns the connected package session and delegates all timers,
visibility and revision acknowledgement to `createWorkspaceFreshnessMonitor`.
Prime -> initial Product read -> bounded revision check catches initial races.
Repeated starts and concurrent reads coalesce. Failed initial detail sets the monitor's
new `requireRefresh()` recovery flag; failed changed-detail reads do not acknowledge
revision. Default cadence is 30,000 ms. Unchanged revisions produce no detail reload.
Closing destroys the monitor. Popup publication checks connection, generation,
selected identity and layer/source replacement before updating the existing Graphic.
Package sessions do not register active-job watches or the Product refresh bridge.
Non-package synchronization continues using both existing registrations.

Package detail publication whitelists only `workUnitMetadata` and `exportMetadata`.
It cannot overwrite workflow status, `workUnitStatus`, identity, filter attributes
or geometry. F1/F2/F3 and complete map state remain owned by normal Main-map source
refresh; its 10-minute cadence is unchanged. No child Graphic, geometry polling,
package mutation or Analyze/Review/History navigation was added.

## Verification actually run

- 42 focused tests passed directly: current metadata/AOI normalization, Product response
  normalization, popup overlays, session lifecycle, status projections and identity.
- 20 real monitor/session integration tests passed directly: existing monitor tests,
  recovery extension and package integration covering cadence, initial races,
  unchanged/changed revisions, trigger coalescing, hidden/visible state, failed detail,
  disconnect and pending completion.
- Earlier monitor/integration runs used an isolated HTTP adapter; the final direct
  runs passed without that adapter. No transport result was fabricated.
- All changed/new JavaScript syntax checks passed (17 files).
- All supplied candidate test files: 275 tests, 236 passed, 39 failed.
- Unchanged supplied baseline: 256 tests, 217 passed, 39 failed.
- Failure names match exactly between baseline and candidate. No new assertion
  failure appeared. Many tests cannot load absent support files such as
  `features/map/config/layerDefinitions.js`, `features/map/filters/attributeFilterConfig.js`
  and `features/map/symbology/correctionSymbolResolver.js`; source-contract tests also
  reference omitted app/HTML files. This is an incomplete archive, not a complete
  repository test result. Popup backend-sync tests, package foundation, full live
  F4/F3 and several job/navigation regressions remain blocked by these omissions.
- `npm run check`, format/lint/build and browser acceptance were not run: package.json
  and project node_modules are absent. No dependencies were installed.
- Backend tests were not run because no backend source changed.

Commands: `node --test <focused paths>`, `node --test --test-concurrency=1
--test-timeout=3000 <all supplied test paths>`, and `node --check <each changed JS>`.

## Local acceptance

Run `cd src/ProductCatalogue`, `npm run format`, then `npm run check`.

1. Main map loads `electronicproducts/aoi?layer=ENC` and retains one Graphic per package.
2. Open a package without candidates: both actual names and independent current versions
   appear immediately. Check light/dark and only Status cells receive color.
3. Add an active candidate for each member independently: only that member's version,
   status, error and validation links overlay current metadata. Check discarded exports
   remain absent and differing AOI member statuses still hatch the map.
4. Network on open: revision prime, one Product detail read, then revision check. There
   must be no package `jobs/active`, job-status polling or periodic global AOI request.
5. Leave open: revision checks occur about every 30 seconds; unchanged revisions make
   no Product detail request. A backend change from a second browser/process triggers
   one targeted detail refresh within the visible freshness window.
6. Hide longer than one interval and return: no hidden periodic pings; one coalesced
   visibility check. Fail detail temporarily and verify the changed revision is retried.
7. Close/switch/reopen or replace/deactivate a source during delayed reads: stale responses
   cannot publish. Verify timers/listeners stop, no duplicate Graphic/search/Collection
   item appears and unchanged metadata retains focus/error details.
8. After normal source refresh, verify F1 filters, F2 symbols and F3 counts converge.
   Popup detail alone deliberately does not update complete map/filter state.
9. Verify non-package Product contexts retain existing jobs and actions. Package mutations
   and Analyze/Review/History remain unavailable.
10. Check Tab, Enter/Space, Escape, copy/scroll in error details, Close and focus restoration.

Known limit: candidate/failure metadata can update immediately, but member status without
an active export uses the last authoritative AOI state until normal source refresh.
Actual ArcGIS/Calcite DOM behavior and live cross-user Network acceptance remain unverified.

Suggested commit after acceptance:
`feat(product-catalogue): add live package popup freshness`

## Exact changed/new files

- `src/ProductCatalogue/docs/enc-package-frontend-foundation.md`
- `src/ProductCatalogue/docs/live-enc-package-F4-implementation-report.md`
- `src/ProductCatalogue/docs/live-package-popup-F5-implementation-report.md` (new)
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
- `src/ProductCatalogue/src/features/map/popups/popupBackendSync.js`
- `src/ProductCatalogue/src/features/map/popups/popupBackendSync.test.js`
- `src/ProductCatalogue/src/features/map/popups/popupProductMetadata.js`
- `src/ProductCatalogue/src/features/map/popups/popupProductMetadata.test.js`
- `src/ProductCatalogue/src/features/products/services/workspaceFreshnessMonitor.js`
- `src/ProductCatalogue/src/features/products/services/workspaceFreshnessMonitor.test.js`

Deleted files: none.

## Baseline-equivalent broad test failures

- `ProductCatalogueAPI embeds only the retained source-specific mock fixtures`
- `ProductCatalogueAPI registers only the retained source mocks behind the environment/configuration gate`
- `S-101 presentation stays separate from the normalized product-resolved export contract`
- `accepted simulation blocks mutations until truthful terminal polling completes`
- `local and global reset use the same controller-owned default restoration`
- `navbar exposes one compact data action without a permanent combined source row`
- `runtime source changes do not republish compatibility filter state`
- `safe backend failure clears loading state without creating a success result`
- `src/ProductCatalogue/src/features/data/api/exportApi.test.js`
- `src/ProductCatalogue/src/features/dataSources/config/dataSourceRegistry.test.js`
- `src/ProductCatalogue/src/features/dataSources/domain/dataSourcePersistence.test.js`
- `src/ProductCatalogue/src/features/dataSources/map/dataSourceMapAdapter.sourceAware.test.js`
- `src/ProductCatalogue/src/features/dataSources/map/dataSourceMapAdapter.test.js`
- `src/ProductCatalogue/src/features/dataSources/services/dataSourceController.test.js`
- `src/ProductCatalogue/src/features/dataSources/services/dataSourceNormalizer.test.js`
- `src/ProductCatalogue/src/features/dataSources/services/dataSourceProductStateCoordinator.test.js`
- `src/ProductCatalogue/src/features/dataSources/tests/dataSourceFilterSearchContracts.test.js`
- `src/ProductCatalogue/src/features/dataSources/tests/developmentMockIdentity.test.js`
- `src/ProductCatalogue/src/features/dataSources/tests/liveEncPackageIntegration.test.js`
- `src/ProductCatalogue/src/features/dataSources/tests/workUnitStatusFilterIntegration.test.js`
- `src/ProductCatalogue/src/features/map/core/reconcileGraphicsLayers.test.js`
- `src/ProductCatalogue/src/features/map/popups/packageFoundation.test.js`
- `src/ProductCatalogue/src/features/map/popups/popupActionConfig.sourceAware.test.js`
- `src/ProductCatalogue/src/features/map/popups/popupBackendSync.test.js`
- `src/ProductCatalogue/src/features/map/popups/popupExportConfig.test.js`
- `src/ProductCatalogue/src/features/map/popups/popupExportContract.test.js`
- `src/ProductCatalogue/src/features/map/popups/popupHeaderCollectionAction.test.js`
- `src/ProductCatalogue/src/features/map/popups/popupProductActions.test.js`
- `src/ProductCatalogue/src/features/map/state/featureState.test.js`
- `src/ProductCatalogue/src/features/products/domain/productActionAvailability.sourceAware.test.js`
- `src/ProductCatalogue/src/features/products/domain/productActionAvailability.test.js`
- `src/ProductCatalogue/src/features/products/domain/productContext.popupPrecedence.test.js`
- `src/ProductCatalogue/src/features/products/domain/productContext.test.js`
- `src/ProductCatalogue/src/features/products/services/productJobService.normalized.test.js`
- `src/ProductCatalogue/src/features/products/services/workspaceProductService.test.js`
- `src/ProductCatalogue/src/features/products/tests/normalizedWorkflow.test.js`
- `src/ProductCatalogue/src/shared/routing/workspaceRoute.resolution.test.js`
- `src/ProductCatalogue/src/shared/routing/workspaceRoute.test.js`
- `user-facing Product Catalogue sources use Product terminology`

## Superseding F5 v2 correction

The v1 report above is historical. F5 v2 restores the local source-refresh bridge
without Product job discovery or extra network requests. See
`live-package-popup-F5-v2-correction-report.md` for the controlled input, changed
files, final verification and overlay reconciliation behavior.
