# F6B v3 — Targeted package staging ownership correction

## Controlled input and scope

- Authoritative baseline: `a5360531032c2baeb8d5544cf7b8e7cb15a7551f`.
- Accepted F6A commit: `5447c8c3355098d0d202434dac0710e7de782d40`.
- Controlled v1 ZIP SHA-256: `DE84B81B328F0329643F70AA19EA6B20894341658BD7A5D46042AADF7E580039`.
- Controlled v2 ZIP SHA-256: `11365C16E6535FC01064C0B901DD7275472F7EB744FEE1657CFA2FAE923EE3C8`.

Both supplied candidate hashes were verified. Controlled trees were reconstructed by overlaying
those ZIPs onto the supplied authoritative baseline. Every materialized file was compared against
its expected ZIP or baseline bytes. V3 starts from controlled v2. There was no reimplementation,
redesign, repository network access, dependency change or commit. Earlier reports remain unchanged
historical records; this report supplies the current staging correction and acceptance guidance.

## Application-owned staging correction

Only `initAnalyzePage.js` changes production behavior relative to v2. Dedicated package layer
architecture, ordinary layer creation paths and shared ArcGIS infrastructure remain unchanged.

The page creates an owner before calling `createAnalyzeLayers()` for targeted successful package
replacements. Its small map `add`/`remove` boundary records layers off-map, including layers whose
factory promise has not returned. No replacement becomes visible during asynchronous construction.
After construction, the existing workspace-load and targeted-refresh IDs must still be current.
The owner then records and publishes its layers to the live map before hover registration. It remains
in a page-owned pending replacement set until the replacement is accepted.

Starting a newer full composition, starting a newer eligible targeted refresh or destroying the page
synchronously cancels pending owners. Cancellation removes their published layers and unregisters
only their hover state immediately, even while creation or layer-view registration remains blocked.
It neither closes a popup nor changes the accepted package or ordinary layers. A cancelled owner
cannot publish later-created layers. Late completion returns `false` as stale and cannot remove the
newer owner's accepted layer. Construction and registration rejection clean only the rejected owner.

The accepted old package layer remains until the current successful replacement finishes hover
registration and commits. The existing selected-popup check still closes only a popup belonging to
a successfully replaced accepted package layer. Successful commit transfers layers into the existing
`currentLayers`; no unrelated ordinary Graphic is recreated or removed.

The pending set is transient resource ownership, not another generation, cache or freshness source.
`loadRequestId`, `targetedRefreshRequestId` and the single existing Analyze freshness monitor retain
authority. There is no new monitor, timer, polling lifecycle, source listener or broad rebuild.

## Preservation evidence

- `reconcileAnalyzeResolutions()` and its entire domain module are byte-identical to controlled v2.
  Final resolution remains canonical by proven logical package, later proof removes earlier failed/
  simple aliases, first logical occurrence and independent simple ordering are retained, contradictory
  successful overlapping claims fail closed, unproven failures remain exact, and supplied resolutions
  are reconciled. No dataset-prefix/source-name heuristic or persistent work-unit cache.
- Exact `workspaceProductService.js`, including `resolveProduct()`, is byte-identical to authoritative
  baseline and controlled v2. F6A exact resolution is untouched.
- `workspaceWorkUnitService.js` is byte-identical to v2. F6A owner/member validation and service
  contracts, normalized Product/member contracts and validated context identities remain unchanged.
- One canonical S-101 route, one outer package Analyze item and one representative shared Graphic
  in its dedicated layer. S-101 precedes S-57; independent member metadata/status/content is preserved.
- Package-level enable/disable/remove, failed package model/Graphic retention and ordinary/simple
  refresh behavior remain unchanged. Package success with ordinary read failure retains that ordinary
  Graphic/layer. Ordinary popup/hover registrations remain attached to accepted ordinary layers.
- Main-map F1/F2/F3/F5, Product Collection, registry, routing implementation and Review/History source
  are unchanged relative to v2. Package Review and floating History navigation remain disabled.
- Package mutation and lifecycle action capabilities remain disabled/fail closed. No backend source,
  dependency, package manifest or lockfile changes.

## Explicit controlled-v2 negative reproduction

The strengthened assertion ran FIRST against controlled unmodified v2 production source in a separate
negative-test tree, before applying the production correction. Only its test harness was injected;
the controlled v2 tree used for the broad comparison remained untouched.

The harness retains the production initializer and Analyze layer pipeline. Its public factory seam
calls the supplied map `add` boundary, then blocks before returning the layer. On v2 that boundary
adds directly to the live map; on v3 it stages off-map. It does not inspect private ArcGIS internals.

Initial state is package plus ordinary Product. The old package refresh reaches the map boundary and
blocks. A newer ordinary-only full composition completes. BEFORE releasing the old gate, the test
checks the newer ordinary Graphic's identity/edition and accepted layer, absence of any package
Graphic, absence of stale hover registration, and closed stale popup state. The same test then releases
the old operation, checks it settles `false`, and verifies no stale layer reappears or newer layer changes.

```text
node --test --test-reporter=tap --test-name-pattern='stale package layers are discarded before' src/features/analyze/core/initAnalyzePage.package.test.js
```

- Controlled v2: 1 test, 0 passed, 1 failed, exit 1, as required. Failure is
  `Superseded staging must be absent before releasing layer creation`: the edition-2 package Graphic
  remains live alongside the newer ordinary composition. The failure occurs before releasing the gate.
- Corrected v3: the same selected test passed, 1 test, 1 passed, 0 failed, exit 0.

The test always releases the old gate in `finally`, so its negative failure is deterministic and does
not leave a hanging test process. The post-release assertions additionally prove eventual stale cleanup.

## Verification actually run

Node.js `v24.19.0`. No dependency installation.

| Broad frontend tree      | Total | Passed | Failed |
| ------------------------ | ----: | -----: | -----: |
| Authoritative baseline   |  1072 |   1067 |      5 |
| Controlled unmodified v1 |  1093 |   1088 |      5 |
| Controlled unmodified v2 |  1111 |   1106 |      5 |
| Corrected v3             |  1118 |   1113 |      5 |

All four commands ran from their respective `src/ProductCatalogue` directories:

```text
node --test --test-reporter=tap
```

V3 adds seven tests relative to v2 and strengthens the existing stale-layer test. There are no new
broad-suite failures, cancellations or skipped tests. The broad suite is NOT fully passing.
All four trees have the same five pre-existing failures:

1. `range controls keep keyboard time editing local until the range interaction commits`.
2. `ProductCatalogueAPI registers only the retained source mocks behind the environment/configuration gate`.
3. `ProductCatalogueAPI embeds only the retained source-specific mock fixtures`.
4. `Development mock fixture files normalize to globally unique source datasetNames`.
5. `runtime source changes do not republish compatibility filter state`.

The range and runtime-source failures are existing source assertions. The three backend mock contract
failures depend on backend source/project/mock fixtures omitted from the supplied reference archive.

The focused suite ran 70 explicit test files across Analyze, products, data normalizers, Product
Collection, Review, timeline, workspace routing, source registry and map popups: **508 passed,
0 failed**. This retains and executes both failed-alias/successful-package-proof orders, no proof,
contradictory claims, supplied-resolution reconciliation, package success/simple failure, package-only
refresh preserving ordinary Graphic/popup/hover, failed package retention, simple-only refresh,
package registration failure, ProductContext registration, F6A exact/work-unit resolution, Collection,
routing and ordinary/package Review/History boundaries.

The 19 page lifecycle tests include the strengthened full-composition case, newer package refresh B
while A's creation blocks, destroy during creation and registration, full/targeted supersession during
registration, off-map rejected construction retaining accepted package popup/hover, and a simple
refresh cancelling package staging without closing/unregistering its accepted package popup/hover.

`node --check` passed for all 19 changed/new JavaScript files relative to baseline, including the two
JavaScript files changed relative to v2. The ZIP is checked against the complete baseline inventory;
its entries contain complete files, not patches, and byte-match the final candidate tree.

## Checks not run and limitations

- Project and ancestor `node_modules` are absent. `npm run check` was not run; neither project
  Prettier, ESLint nor Vite build was run. No dependencies were installed solely for verification.
- No real ArcGIS/Calcite browser, live backend, backend/.NET build or backend tests ran. Deterministic
  Node tests exercise application lifecycle and public factory/view seams; they do not establish
  browser acceptance or private ArcGIS behavior.
- Cancelling map ownership does not abort underlying metadata, construction or layer-view promises.
  Those operations may finish later; their staging cannot remain published or regain authority.
- Independent backend reads are not a server transaction. Existing complete-package validation and
  frontend generation ownership remain the guarantees. Optional report/History availability remains
  source-contract dependent. Mixed browser cases need suitable ordinary Product fixtures.

## Updated manual acceptance checklist (pending browser acceptance)

1. Open an ENC package from the Main-map popup: F5 content/freshness remains; Analyze is available;
   package Review, floating History and mutation/lifecycle actions remain unavailable.
2. Enter Analyze through S-101, mapped S-57 and both alias orders: canonical S-101 `Datasets=` route,
   one outer package item, one shared Graphic, S-101 then S-57 sections with independent metadata/status.
   A failed earlier alias must disappear when a later complete package proof succeeds.
3. Collection retains one package entry and opens canonical Analyze without splitting members.
4. Outer disable/enable/remove controls the entire package, without orphan member cards/Graphics.
5. Manual/freshness updates publish complete members together; failed package refresh retains the
   accepted model/Graphic and truthful warning. Ordinary Review/History remains available as before.
6. In a mixed workspace leave the ordinary popup open and refresh only the package. Verify identical
   ordinary Graphic/layer, popup and hover. Repeat with ordinary read failure in the same batch.
7. Simple-only targeted refresh, both success and failure, retains baseline map behavior.
8. Pause package replacement at the public map boundary after creation starts, before its promise
   returns. Complete a newer ordinary-only Analyze composition. BEFORE resuming the old operation,
   only the newer ordinary Graphic/layer may remain, with no stale package popup/hover. Resume it;
   it must not change that composition or reintroduce a layer.
9. Block package refresh A at creation, complete newer package refresh B, and inspect BEFORE releasing
   A: only B's accepted package and unrelated ordinary representation remain. Release A; B is unchanged.
10. Repeat supersession with A blocked during hover registration. Cancellation immediately removes
    only A's staging and registration; accepted package/ordinary popup and hover remain unless a
    successful authoritative replacement legitimately closes its own accepted package popup.
11. Destroy/leave Analyze while replacement creation or hover registration blocks. Verify no staged
    layer remains before releasing the old operation, and none reappears afterward.
12. Reject replacement creation or hover registration. Accepted package/ordinary Graphic, popup and
    hover survive; only failed replacement resources disappear.
13. Check light/dark, compact/narrow layouts, keyboard/input focus, Escape, browser back, ordinary
    search/navigation/filter/enable/remove. If ordinary fixtures are unavailable, record those mixed
    cases as not executed rather than accepted.

## Exact inventory relative to controlled v2

### Changed files

- `src/ProductCatalogue/docs/PC-package-workspaces-F6-discovery-df7d088e.md`
- `src/ProductCatalogue/src/features/analyze/README.md`
- `src/ProductCatalogue/src/features/analyze/core/initAnalyzePage.js`
- `src/ProductCatalogue/src/features/analyze/core/initAnalyzePage.package.test.js`

### New files

- `src/ProductCatalogue/docs/package-analyze-F6B-v3-correction-report.md`

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
- `src/ProductCatalogue/src/features/analyze/api/analyzeApi.aliasReconciliation.test.js`
- `src/ProductCatalogue/src/features/analyze/api/analyzeApi.package.test.js`
- `src/ProductCatalogue/src/features/analyze/core/initAnalyzePage.package.test.js`
- `src/ProductCatalogue/src/features/analyze/domain/analyzeWorkUnits.js`
- `src/ProductCatalogue/src/features/analyze/domain/analyzeWorkUnits.test.js`
- `src/ProductCatalogue/src/features/analyze/map/createAnalyzeLayers.package.test.js`

### Deleted files

None.

## Delivery

The F6B v3 ZIP preserves repository paths and contains every complete changed/new file relative to
`a5360531032c2baeb8d5544cf7b8e7cb15a7551f`. There are no deletions. Its SHA-256 is reported beside
the ZIP, not embedded inside the ZIP itself. No commit was created.

Concrete English commit-message suggestion after acceptance:

```text
feat(product-catalogue): add package-aware analyze
```
