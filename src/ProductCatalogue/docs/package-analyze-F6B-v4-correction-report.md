# F6B v4 — Existing F2 rendering for Analyze packages

## Controlled implementation input

- Authoritative baseline: `a5360531032c2baeb8d5544cf7b8e7cb15a7551f`.
- Accepted F6A commit: `5447c8c3355098d0d202434dac0710e7de782d40`.
- Controlled v1 ZIP SHA-256: `DE84B81B328F0329643F70AA19EA6B20894341658BD7A5D46042AADF7E580039`.
- Controlled v2 ZIP SHA-256: `11365C16E6535FC01064C0B901DD7275472F7EB744FEE1657CFA2FAE923EE3C8`.
- Controlled v3 ZIP SHA-256: `E8E5E2785A29829156A0B963B4D4CA8D29989CF0B125351E4700146B5BD7495A`.

All three controlled hashes were verified. Each controlled tree was reconstructed from the supplied
baseline plus its verified candidate ZIP, then every file was compared with the expected baseline or
ZIP bytes. V4 starts from controlled v3. This is one focused rendering correction; no redesign,
repository network access, dependency installation, backend change or commit occurred. Earlier
implementation/correction reports remain unchanged historical records.

## Exact Analyze-owned projection and F2 reuse

Only `src/features/analyze/map/createAnalyzeLayers.js` changes production behavior relative to v3.
Its existing package branch still creates one compatibility entry from the outer Product, retaining
canonical ProductContext identity, feature identity and the existing shared geometry. At that package
layer boundary, the entry receives this rendering attribute:

```js
entry.feature.attributes.workUnitStatus = {
  members: product.members.map((member) => ({
    key: member.memberKey,
    datasetName: member.datasetName,
    status: member.status,
  })),
};
```

The ordered, already-loaded `product.members` is authoritative. The projection copies supplied Product
status without substituting representative, workflow, source-label or dataset-prefix values. A missing
value remains `null`/`undefined`; it is not inferred. The normalized generic map state contains member
keys, concrete dataset names and their statuses. No package workflow status is introduced.

Only the existing dedicated package definition receives:

```js
symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION;
```

This is the existing F2 constant, not a new strategy. The shared layer factory already forwards it to
`esriJsonToGraphics()` and records it as `appSymbolization`. The production initial symbol path is:
`esriJsonToGraphics()` -> `createGraphicProperties()` -> `resolveCorrectionSymbol()` ->
`projectMemberStatusRenderState()` -> existing `getCorrectionSymbol()` or `getMixedCorrectionSymbol()`.
The existing status palette and CIM hatch implementation are reused byte-for-byte.

Accepted F2 semantics remain:

| Supplied member Product statuses                     | Polygon symbol                         |
| ---------------------------------------------------- | -------------------------------------- |
| No usable supplied status                            | Representative scalar fallback         |
| One distinct usable status, including equal statuses | Scalar symbol for that supplied status |
| Two or more distinct supplied statuses               | Existing mixed CIM hatch symbol        |

There is exactly one shared package Graphic. No S-57 child Graphic, separate geometry, extra Product
request, in-place status polling, new resolver, palette, hatch algorithm or freshness owner is added.
Ordinary compatibility/source Analyze definitions do not receive the strategy or member projection;
they retain their scalar rendering paths. `analyzeGraphicProductContext.js` remains byte-identical to
v3 and globally package-unaware.

Both initial full load and successful targeted package replacement call the existing layer pipeline,
so equal -> distinct -> equal changes naturally replace scalar -> mixed -> scalar Graphics. Failed
refresh retains the entire accepted package model, Graphic and exact symbol reference. Ordinary
Graphic/layer/popup/hover remains untouched during package-only replacement.

## Preserved architecture and contracts

Byte comparisons with controlled v3 confirmed that these production sources are unchanged:

- `initAnalyzePage.js`: v3 off-map staging, immediate supersession/destroy cleanup, accepted layer
  retention until commit, full-load/targeted-refresh generation IDs and one freshness monitor.
- `analyzeWorkUnits.js`: all v2 alias reconciliation, first logical occurrence ordering, later proven
  package replacing failed/simple aliases, supplied-resolution reconciliation and fail-closed conflicts.
- `analyzeApi.js`: exact member reads/content projection, independent metadata/status/content and all
  complete-package publication/validation rules. Optional status remains optional without weakening
  member identity, metadata-read or shared-geometry validation.
- `workspaceProductService.js`: exact `resolveProduct()` is also byte-identical to baseline.
- `workspaceWorkUnitService.js`: F6A owner/member validation and fail-closed resolver contracts.
- `analyzeGraphicProductContext.js`: canonical ProductContext registration and stable interaction
  identity. Routing, sidebar/member ordering and package-level enable/disable/remove remain unchanged.
- F2 member projection, correction resolver, symbols, Esri transformer, graphic symbolization and
  status palette: all byte-identical to controlled v3.

Main-map F1/F2/F3/F4/F5, Product Collection, ordinary Review/History, package canonical S-101 route
grammar and identity are unchanged relative to v3. Package Review and floating History navigation
remain disabled. Package mutation/lifecycle actions remain disabled/fail closed. Backend source,
package manifest, lockfile and dependencies are unchanged.

## Deterministic negative reproduction against controlled v3

The new polygon rendering assertion ran FIRST against unmodified v3 production source in a separate
negative-test tree, before the production correction. Only test/support files were injected; the
controlled v3 broad-suite tree remained unchanged.

The fixture is one complete outer package with two loaded member Product contexts/statuses (8 and 11)
and a shared polygon. The harness replaces only public SDK constructors and the public layer factory;
it runs the production Analyze layer builder, Esri attribute/geometry transformation, initial Graphic
properties, central resolver, F2 projection and actual palette/CIM symbol functions. No private ArcGIS
internals are inspected and no symbol logic is stubbed.

```text
node --test --test-reporter=tap --test-name-pattern='different Analyze member statuses render one' src/features/analyze/map/createAnalyzeLayers.symbolization.test.js
```

The same test records its model statuses, Graphic count, representative status and resulting symbol:

| Controlled source | Model statuses | Graphics | Representative status | Produced symbol                                              | Result           |
| ----------------- | -------------- | -------: | --------------------: | ------------------------------------------------------------ | ---------------- |
| Unmodified v3     | 8, 11          |        1 |                     8 | `simple-fill`, equal to `getCorrectionSymbol(8)`             | 1 failed, exit 1 |
| Corrected v4      | 8, 11          |        1 |                     8 | `cim`, equal to existing `getMixedCorrectionSymbol([8, 11])` | 1 passed, exit 0 |

V3 fails specifically at `One shared polygon must use F2 mixed rendering, not the representative
scalar symbol`, after asserting both member statuses and the single Graphic. V4 also checks actual
`CIMHatchFill`, exact normalized member state, canonical ProductContext/feature identity, shared
polygon coordinates and absence of an S-57 Graphic. This proves produced symbol selection, rather
than merely a configuration flag.

## Verification actually executed

Node.js `v24.19.0`; no dependency installation.

| Broad supplied frontend tree | Tests | Passed | Failed |
| ---------------------------- | ----: | -----: | -----: |
| Authoritative baseline       |  1072 |   1067 |      5 |
| Controlled unmodified v1     |  1093 |   1088 |      5 |
| Controlled unmodified v2     |  1111 |   1106 |      5 |
| Controlled unmodified v3     |  1118 |   1113 |      5 |
| Corrected v4                 |  1126 |   1121 |      5 |

The broad command actually ran in each tree's `src/ProductCatalogue`:

```text
node --test --test-reporter=tap
```

V4 adds eight tests relative to v3. All eight pass; all existing v3 staging tests remain and pass.
There are no new broad failures, skipped tests or cancellations. The broad suite is NOT fully passing.
All five trees have the same five pre-existing failures:

1. `range controls keep keyboard time editing local until the range interaction commits`.
2. `ProductCatalogueAPI registers only the retained source mocks behind the environment/configuration gate`.
3. `ProductCatalogueAPI embeds only the retained source-specific mock fixtures`.
4. `Development mock fixture files normalize to globally unique source datasetNames`.
5. `runtime source changes do not republish compatibility filter state`.

The range/runtime-source failures are existing source assertions. The three backend mock contract
failures reference backend source/project/mock fixtures omitted from the supplied reference archive.
No attempt was made to change these unrelated contracts.

The focused suite executed **84 explicit files, 614 tests passed, 0 failed**. It included every
`*.test.js` under:

- `src/features/analyze`
- `src/features/products`
- `src/features/data/normalizers`
- `src/features/productCollection`
- `src/features/review`
- `src/features/timeline`
- `src/shared/routing`
- `src/features/dataSources/config`
- `src/features/dataSources/domain`
- `src/features/map/popups`
- `src/features/map/symbology`

And these existing integration/initial symbol tests:

- `src/features/map/transformers/graphicSymbolization.test.js`
- `src/features/map/core/reconcileGraphicsLayers.test.js`
- `src/features/map/state/featureState.test.js`
- `src/features/dataSources/tests/liveEncPackageIntegration.test.js`
- `src/features/dataSources/tests/workUnitStatusFilterIntegration.test.js`

Coverage includes Analyze API/model and layer creation, normalized missing/equal/distinct status
semantics, F2 projection/resolver/CIM palette, Main-map initial package symbolization, equal -> distinct
-> equal Analyze replacement, failed scalar/mixed replacement retention, v2 mixed workspace isolation,
all v3 supersession/destroy gates, F6A work-unit/exact resolution, ProductContext, Collection, routes and
ordinary/package Review/History/action boundaries.

The direct Analyze map/lifecycle run passed **29 tests** across:

```text
node --test --test-reporter=tap src/features/analyze/map/createAnalyzeLayers.symbolization.test.js src/features/analyze/map/createAnalyzeLayers.package.test.js src/features/analyze/core/initAnalyzePage.package.test.js
```

These comprise six rendering cases, two existing layer ownership tests and 21 page lifecycle tests.
The existing v3 tests retain their BEFORE-gate-release assertions for newer full composition, newer
targeted refresh and destroy during creation/registration, plus late completion, ordinary popup/hover,
accepted package popup, rejection cleanup and failed package retention. The lifecycle harness now
uses the same production initial symbol transformation as the rendering regression.

`node --check` passed for all **21 changed/new JavaScript files** relative to baseline, including all
five JavaScript files changed/new relative to v3. Archive entries were byte-checked against the final
candidate, and the ZIP contains every complete baseline delta file rather than patch fragments.

## Checks not run and known limitations

- Project and ancestor `node_modules` are absent. `npm run check` was not run; project Prettier,
  ESLint and Vite build were not run. No dependencies were installed solely for verification.
- No v4 live backend, real ArcGIS/Calcite browser, backend/.NET build or backend tests ran. The public
  constructor stubs prove the produced production symbol definition, not visual SDK browser painting.
- The user's accepted v3 browser result (one package/two member sections/no unrelated observed
  regression) remains prior evidence. V4's new visible hatch and refresh-transition browser checks
  remain unexecuted. Representative local equal/distinct fixtures are unavailable in this environment.
  Record unavailable browser cases; do not treat the deterministic Node fixtures as browser acceptance.
- Existing F2 member-aware mixed rendering applies to polygon geometry. Other geometries retain the
  existing central scalar fallback; this correction does not broaden F2 geometry support.
- Missing status remains truthful. Complete loaded member models/identity/geometry are still required;
  the map tests do not weaken the F6A/F6B publication boundary to simulate partial package metadata.
- Independent backend reads are not a transaction. Existing frontend complete-package validation
  and generations remain authoritative. Pending async work is not aborted; v3 cancels publication
  ownership so late completion cannot republish stale staging.

## Updated manual acceptance (pending v4 browser verification)

1. Open an ENC package whose member statuses differ. Verify one Analyze Graphic with the existing
   F2 hatch/mixed visualization, canonical S-101 route and one outer package item.
2. Open a package with equal member statuses. Verify one scalar Graphic and no artificial hatch.
3. Confirm S-101 then S-57 sections still show independent exact member status/metadata/content.
   Try S-101, mapped S-57 and both alias orders; later complete proof removes any earlier failed alias.
4. Refresh equal -> different. Verify the accepted replacement becomes mixed; no second member Graphic.
5. Refresh different -> equal. Verify the replacement returns to scalar.
6. With an ordinary popup open, refresh only the package. Verify identical ordinary Graphic/layer,
   popup and hover; repeat package success plus ordinary read failure in the same batch.
7. Fail package refresh while mixed, then while scalar. Verify the entire previously accepted
   package model/Graphic/symbol remains. Simple-only success/failure retains baseline map behavior.
8. Confirm Main-map package rendering/content/freshness is unchanged, including F1/F2/F3/F4/F5.
   Collection still stores/opens one package. Outer enable/disable/remove controls all member sections.
9. Confirm ordinary Review/History remains unchanged. Package Review, floating History and mutation/
   lifecycle actions remain unavailable.
10. Block replacement creation at the public map boundary, complete a newer ordinary-only composition,
    and inspect BEFORE releasing the old gate: only the new authoritative ordinary representation
    remains. Release it; no stale layer/symbol reappears.
11. Block targeted refresh A, finish newer package refresh B, inspect BEFORE releasing A, then release
    A. B's accepted layer/symbol and ordinary layer are unchanged. Repeat during hover registration.
12. Destroy/leave Analyze while creation or registration blocks: no staged layer remains before the
    old promise settles, and none reappears afterward. Reject creation/registration and verify only
    replacement resources are cleaned, preserving accepted popup/hover.
13. Check light/dark, compact/narrow layout, keyboard focus, Escape, browser back and ordinary Product
    search/filter/navigation/enable/remove. If equal/distinct or ordinary fixtures are unavailable,
    explicitly mark those cases unavailable rather than fabricating browser evidence.

## Exact files changed/new/deleted relative to controlled v3

### Changed files

- `src/ProductCatalogue/docs/PC-package-workspaces-F6-discovery-df7d088e.md`
- `src/ProductCatalogue/src/features/analyze/README.md`
- `src/ProductCatalogue/src/features/analyze/core/initAnalyzePage.package.test.js`
- `src/ProductCatalogue/src/features/analyze/map/createAnalyzeLayers.js`
- `src/ProductCatalogue/src/features/analyze/map/createAnalyzeLayers.package.test.js`

### New files

- `src/ProductCatalogue/docs/package-analyze-F6B-v4-correction-report.md`
- `src/ProductCatalogue/src/features/analyze/map/analyzeMapTestSupport.js`
- `src/ProductCatalogue/src/features/analyze/map/createAnalyzeLayers.symbolization.test.js`

### Deleted files

None.

## Full changed/new/deleted inventory relative to authoritative baseline

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
- `src/ProductCatalogue/docs/package-analyze-F6B-v3-correction-report.md`
- `src/ProductCatalogue/docs/package-analyze-F6B-v4-correction-report.md`
- `src/ProductCatalogue/src/features/analyze/api/analyzeApi.aliasReconciliation.test.js`
- `src/ProductCatalogue/src/features/analyze/api/analyzeApi.package.test.js`
- `src/ProductCatalogue/src/features/analyze/core/initAnalyzePage.package.test.js`
- `src/ProductCatalogue/src/features/analyze/domain/analyzeWorkUnits.js`
- `src/ProductCatalogue/src/features/analyze/domain/analyzeWorkUnits.test.js`
- `src/ProductCatalogue/src/features/analyze/map/analyzeMapTestSupport.js`
- `src/ProductCatalogue/src/features/analyze/map/createAnalyzeLayers.package.test.js`
- `src/ProductCatalogue/src/features/analyze/map/createAnalyzeLayers.symbolization.test.js`

### Deleted files

None.

## Delivery

The F6B v4 ZIP preserves repository paths and includes every complete changed/new file relative to
`a5360531032c2baeb8d5544cf7b8e7cb15a7551f`. No files are deleted. ZIP SHA-256 is reported beside
the artifact rather than embedded inside it. No commit was created.

Concrete English commit-message suggestion after acceptance:

```text
feat(product-catalogue): add package-aware analyze
```
