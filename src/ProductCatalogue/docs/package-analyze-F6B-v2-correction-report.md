# F6B v2 — Focused Analyze correction report

## Controlled implementation input

- Authoritative baseline: `a5360531032c2baeb8d5544cf7b8e7cb15a7551f`.
- Accepted F6A commit: `5447c8c3355098d0d202434dac0710e7de782d40`.
- Colleague commit in the supplied merge context: `78d5ae7f1088d3f3208d7cf16dd41c6848282a13`.
- Controlled v1 ZIP SHA-256 verified: `DE84B81B328F0329643F70AA19EA6B20894341658BD7A5D46042AADF7E580039`.
- The v1 tree was reconstructed by overlaying the verified v1 ZIP onto the authoritative baseline.
  Every materialized file was compared against either the controlled ZIP bytes or the baseline bytes.
- V2 starts from that materialized v1 tree. No redesign, remote repository access or commit.
- The v1 implementation report and F6A reports remain unchanged historical records.

## Correction 1 — Final alias reconciliation

`reconcileAnalyzeResolutions()` is a request-scoped domain boundary applied to both the final resolver
output and supplied resolutions before Product projection. A successful complete F6A package proof
claims its concrete member aliases and canonical identity. It replaces earlier failed/simple results
for those aliases. Publication follows the original request order, so the package occupies the first
logical occurrence represented by any requested member. Independent simple Products retain their
own identity and order. Failures with no successful membership proof remain truthful exact failures.

Successful claims are grouped by shared aliases or canonical work-unit identity. Contradictions in
canonical dataset/source/ProductContext identity, work-unit identity, primary member or ordered
member source/dataset mapping fail the overlapping component closed. No arbitrary package wins and
no overlapping package Products or Graphics publish. Consistent duplicate proofs collapse to one.
There are no naming-prefix heuristics, source-name branches or persistent cache. The F6A resolver and
all its fail-closed rules are unchanged.

The normal forward alias skip remains to avoid unnecessary resolutions. Final reconciliation fixes
the order-dependent case where the failed first alias could not reveal its membership. The same
reconciliation also guards the supplied-resolution projection path.

## Correction 2 — Targeted package map ownership

The existing `createAnalyzeLayers()` pipeline now puts each package's single representative Graphic
in its own geometry layer, tagged with the application-owned `appAnalyzeWorkUnitKey`. Ordinary
compatibility and source Products retain their existing layer paths. Package entries reuse the
existing geometry builder, source-aware ProductContext lookup and Graphic registration. There is no
second map stack or member Graphic.

Targeted freshness refresh creates replacements only for complete successful package snapshots.
It replaces/removes/unregisters only accepted layers with those package identities. Ordinary Product
layer/Graphic instances remain untouched even if their sidebar refresh fails in the same batch.
Their failure state still follows the baseline sidebar contract; it does not remove their accepted
map representation. Simple-only targeted refresh remains sidebar-only.

A popup closes only when its selected Graphic belongs to a replaced package layer. An unrelated
ordinary popup and its hover registration remain attached to the same Graphic/layer. Failed package
refresh retains its accepted model and Graphic. Replacement layers rejected by stale generation or
layer registration failure are discarded without changing unrelated accepted layers. Refresh does
not zoom the view.

The existing workspace load generation, targeted refresh generation and single freshness monitor
remain authoritative. All package member content publishes together. There is no new timer, polling,
source listener or persistent work-unit cache.

## Preserved boundaries

- Exact `workspaceProductService.resolveProduct()` is byte-identical to baseline and v1.
- F6A `workspaceWorkUnitService` is byte-identical to v1, including owner/member validation.
- Normalized Product response and member metadata contracts are byte-identical to v1.
- One canonical S-101 route, one top-level package item and one shared package Graphic.
- Existing `Datasets=` grammar, registry member order and independent member metadata/status/content.
- Existing package-level enable/disable/remove and package Analyze navigation.
- Registry, Main-map F1/F2/F3/F5 and Collection implementation are unchanged relative to v1.
- Package Review and floating History navigation remain disabled.
- Package lifecycle and mutation actions remain disabled/fail closed.
- Review/History source, backend references, dependencies and lockfile are unchanged.

## Verification actually executed

Node.js `v24.19.0`. No dependency installation.

### Explicit controlled-v1 negative reproductions

The new regression assertions were run in a separate copy of the controlled v1 source, without
modifying the v1 tree used for the broad-suite comparison.

| Reproduction                                                             | Controlled v1                                  | Corrected v2                                                 |
| ------------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------ |
| Failed mapped S-57 alias before successful canonical S-101 package proof | Failed: 2 resolutions instead of 1             | Passed: one package, canonical route and one map entry       |
| Package success plus simple refresh failure in one batch                 | Failed: accepted simple Graphic becomes absent | Passed: identical simple Graphic/layer and open popup remain |

The exact same two selected test assertions were run against v1 and v2:

```text
node --test --test-reporter=tap --test-name-pattern='later complete package replaces an earlier failed alias: Mapped|package refresh preserves unrelated simple Graphic and popup \(simple failure: true\)' src/features/analyze/api/analyzeApi.aliasReconciliation.test.js src/features/analyze/core/initAnalyzePage.package.test.js
```

V1: 2 tests, 0 passed, 2 failed as expected. V2: 2 tests, 2 passed, 0 failed.

### Focused and broad comparison

| Tree/check                        | Total | Passed | Failed |
| --------------------------------- | ----: | -----: | -----: |
| Authoritative unmodified baseline | 1,072 |  1,067 |      5 |
| Controlled unmodified F6B v1      | 1,093 |  1,088 |      5 |
| Corrected F6B v2                  | 1,111 |  1,106 |      5 |
| V2 focused suite                  |   501 |    501 |      0 |

V2 adds 18 regression tests relative to v1. All pass. There are no new broad-suite failures.
`node --check` passed for all 19 changed/new JavaScript files relative to baseline (including all 8
JavaScript files changed/new relative to v1).

The broad command was executed from each tree's `src/ProductCatalogue` directory:

```text
node --test --test-reporter=tap
```

The focused command explicitly included every `*.test.js` file from these folders (70 files):

- `src/features/analyze`
- `src/features/products`
- `src/features/data/normalizers`
- `src/features/productCollection`
- `src/features/review`
- `src/features/timeline`
- `src/shared/routing`
- `src/features/dataSources/config`
- `src/features/map/popups`

Coverage includes both alias entry orders, no successful proof, overlapping/transitive/contradictory
claims, first-occurrence simple ordering, package/simple map separation, exact Graphic context
registration, package success/simple failure, preserved ordinary popup/hover registration, package
failure retention, simple-only success/failure, stale map staging cleanup and layer registration
failure cleanup. Existing F6A, API/source handling, route, registry, Collection, freshness and
Review/History tests also ran.

All three broad suites have these identical existing failures:

1. `range controls keep keyboard time editing local until the range interaction commits` — existing source assertion failure.
2. `ProductCatalogueAPI registers only the retained source mocks behind the environment/configuration gate` — backend source omitted from the supplied reference archive.
3. `ProductCatalogueAPI embeds only the retained source-specific mock fixtures` — backend project file omitted from the archive.
4. `Development mock fixture files normalize to globally unique source datasetNames` — backend mock fixtures omitted from the archive.
5. `runtime source changes do not republish compatibility filter state` — existing source assertion failure.

The broad suite is not described as fully passing.

## Tests not executed and known limitations

- Project `node_modules` are absent. `npm run check`, Prettier, ESLint and Vite build were not executed.
  No dependencies were installed solely for verification.
- No live backend or real ArcGIS/Calcite browser acceptance was executed. Lifecycle tests run the
  production initializer and map pipeline with application-owned/public factory and view stubs.
- Mixed ordinary Product browser cases are pending and require suitable local ordinary Product data.
  If only ENC packages are available, mark those cases unavailable; do not treat the Node stubs as
  evidence of browser acceptance.
- Independent backend reads are not a server transaction. Existing identity validation and frontend
  generation ownership remain the guarantees; no transactional backend snapshot is claimed.
- Optional report/History availability remains source-contract dependent.
- Backend/.NET build and tests were not run; backend work is excluded.

## Local verification and complete manual acceptance checklist

```text
cd src/ProductCatalogue
npm run format
npm run check
```

1. Main-map ENC popup: preserve F5 content/freshness; Analyze available; Review and floating History
   unavailable; no package mutation action.
2. Package to Analyze: canonical S-101 `Datasets=` route, one outer item, one shared Graphic, S-101
   then S-57 sections, independent concrete member identities/versions/statuses.
3. Search/add S-101, mapped S-57, and both: one canonical package/card/Graphic. Enter mapped S-57
   before S-101; no separate failed child may remain beside a later successfully proven package.
4. Collection: still one package entry; Analyze opens the canonical representative without splitting.
5. Disable, enable and remove: all member presentation follows the outer item; no orphan member/Graphic.
6. Manual/freshness refresh: complete member publication, accepted state/Graphic retained on failed
   package replacement, no stale partial member state and no extra polling lifecycle.
7. Ordinary/simple and mixed search/navigation/filter/enable/remove behavior remains unchanged.
8. Ordinary Review/History unchanged; package navigation to these destinations remains unavailable.
9. Light/dark, compact/narrow layout, keyboard controls, input focus, Escape and back navigation.
10. Mixed workspace: load a package plus an ordinary Product, leave the ordinary popup open and
    trigger a package freshness update. The package can update; the ordinary Graphic/layer/popup and
    hover registration must remain intact.
11. Where possible, fail the ordinary targeted read in the same successful package refresh batch.
    Its sidebar error state may change, but its previously accepted map Graphic must remain.
12. Simple-only targeted refresh, successful and failed, must retain its baseline map lifecycle.

## Exact files changed/new relative to controlled v1

- `src/ProductCatalogue/docs/PC-package-workspaces-F6-discovery-df7d088e.md`
- `src/ProductCatalogue/docs/package-analyze-F6B-v2-correction-report.md`
- `src/ProductCatalogue/src/features/analyze/README.md`
- `src/ProductCatalogue/src/features/analyze/api/analyzeApi.aliasReconciliation.test.js`
- `src/ProductCatalogue/src/features/analyze/api/analyzeApi.js`
- `src/ProductCatalogue/src/features/analyze/core/initAnalyzePage.js`
- `src/ProductCatalogue/src/features/analyze/core/initAnalyzePage.package.test.js`
- `src/ProductCatalogue/src/features/analyze/domain/analyzeWorkUnits.js`
- `src/ProductCatalogue/src/features/analyze/domain/analyzeWorkUnits.test.js`
- `src/ProductCatalogue/src/features/analyze/map/createAnalyzeLayers.js`
- `src/ProductCatalogue/src/features/analyze/map/createAnalyzeLayers.package.test.js`

## Full candidate inventory relative to authoritative baseline

### Changed files

- `src/ProductCatalogue/docs/PC-package-workspaces-F6-discovery-df7d088e.md`
- `src/ProductCatalogue/src/features/analyze/README.md`
- `src/ProductCatalogue/src/features/analyze/api/analyzeApi.js`
- `src/ProductCatalogue/src/features/analyze/api/analyzeApi.sourceAware.test.js`
- `src/ProductCatalogue/src/features/analyze/core/initAnalyzePage.js`
- `src/ProductCatalogue/src/features/analyze/map/createAnalyzeLayers.js`
- `src/ProductCatalogue/src/features/analyze/services/analyzeHistoryLoader.js`
- `src/ProductCatalogue/src/features/analyze/ui/analyzeSidebar.js`
- `src/ProductCatalogue/src/features/dataSources/config/dataSourceRegistry.js`
- `src/ProductCatalogue/src/features/map/popups/packageFoundation.test.js`
- `src/ProductCatalogue/src/features/productCollection/ui/productCollectionNavigation.test.js`
- `src/ProductCatalogue/src/features/products/README.md`
- `src/ProductCatalogue/src/features/products/services/workspaceWorkUnitService.js`
- `src/ProductCatalogue/src/features/products/services/workspaceWorkUnitService.test.js`
- `src/ProductCatalogue/src/features/products/tests/normalizedWorkflow.test.js`
- `src/ProductCatalogue/src/shared/routing/workspaceRoute.resolution.test.js`
- `src/ProductCatalogue/src/styles/analyze.css`

### New files

- `src/ProductCatalogue/docs/package-analyze-F6B-implementation-report.md`
- `src/ProductCatalogue/docs/package-analyze-F6B-v2-correction-report.md`
- `src/ProductCatalogue/src/features/analyze/api/analyzeApi.aliasReconciliation.test.js`
- `src/ProductCatalogue/src/features/analyze/api/analyzeApi.package.test.js`
- `src/ProductCatalogue/src/features/analyze/core/initAnalyzePage.package.test.js`
- `src/ProductCatalogue/src/features/analyze/domain/analyzeWorkUnits.js`
- `src/ProductCatalogue/src/features/analyze/domain/analyzeWorkUnits.test.js`
- `src/ProductCatalogue/src/features/analyze/map/createAnalyzeLayers.package.test.js`

### Deleted files

None relative to baseline or v1.

## Delivery

The v2 ZIP contains the complete changed/new files relative to baseline, preserving repository paths.
The separate v2 report supersedes current correction guidance; the v1 report remains historical.
The ZIP SHA-256 is supplied alongside the ZIP, rather than embedded inside it.
No commit was created.

Suggested commit message after local acceptance:

```text
feat(product-catalogue): add package-aware analyze
```
