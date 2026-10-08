# F6B — Package-aware Analyze implementation report

## Controlled source

- Authoritative baseline: `a5360531032c2baeb8d5544cf7b8e7cb15a7551f`.
- Accepted F6A commit: `5447c8c3355098d0d202434dac0710e7de782d40`.
- Colleague commit: `78d5ae7f1088d3f3208d7cf16dd41c6848282a13`.
- Merge/ancestor relationship comes from the supplied task/context, not a local repository checkout.
- Supplied archive SHA-256 verified: `D698348F0A28DE19373579DE395D1DF9AA348E3AF39D6B6498322DC6DB6B663E`.
- Supplied context SHA-256 verified: `5A21608A289DC1F7E7E2B5B6D0491B5AAAE15C0494FC8D395C3A7F3283F29800`.
- Source was extracted from the verified archive. No repository network access, dependency install or commit.

## Architecture and behavior

Analyze resolves canonical work units before publishing composition or changing its route/list.
`resolveAnalyzeWorkUnits()` deduplicates aliases within the request and preserves the first logical
occurrence. S-101 and mapped S-57 resolve to one canonical primary dataset through F6A; no prefix
heuristics or package-specific URL grammar are used. Simple Products preserve exact provider/source
resolution and compatibility isolation. The existing `Datasets=` parsing/serialization is unchanged.

The F6A result is extended with ordered validated `memberProducts` and request-scoped
`productDetails`, enabling reuse without modifying exact `workspaceProductService.resolveProduct()`.
That exact service file is byte-identical to baseline. F6A validation remains intact, including both
owner references, missing/unavailable/replaced sources, contradictory source/type/specification,
missing/duplicate concrete identity and canonical/member mapping contradictions.

One outer Analyze model contains the work unit and two ordered member models. Each member retains
its exact context, concrete identity, Product status, edition/update, metadata and supported read-only
validation/History content. The outer card identifies an ENC package; member Product statuses remain
independent. Nested sections reuse the existing Product card renderer and have no member-level
remove or visibility controls. Missing XML or reports stay unavailable; no synthetic content is added.

Only the outer representative enters the existing map layer pipeline, using its shared source-owned
AOI. No member Graphic or member popup/hit-test path is added. Workspace enable/disable/remove applies
to that outer item and its single Graphic. Missing or malformed shared geometry, incomplete contexts,
member read failure or contradictory refreshed member metadata fails the whole package. Independent
successful work units remain available. Layer creation removes already-created layers on a later
factory exception.

The existing Analyze load generation, targeted-refresh generation and single workspace freshness
monitor remain authoritative. Canonical composition keys freshness by the primary dataset. Resolution
results are reused for projection rather than resolving exact contexts again. Initial/manual loads
read member metadata after freshness priming so earlier mapping/detail reads do not seed stale
metadata as current. Targeted revision refresh can reuse resolver details. Member content and History
reads may run concurrently, but publication waits for the entire package and generation checks.

Failed refresh retains the accepted package's complete member/geometry snapshot, records the load
warning and returns failure to the monitor for retry. Successful package refresh replaces the shared
map layers without an automatic zoom. Stale layers are removed and unregistered without clearing a
newer generation's hover registrations. Simple-only targeted refresh retains its existing sidebar
refresh behavior. There is no additional timer, job polling, source listener or persistent cache.

Registry package navigation now enables Analyze only. Main-map Tools exposes Analyze using the
primary representative; Collection still has one package entry and canonical Analyze navigation.
Review and floating package History navigation remain disabled. F6C/F6D, Pause, Resume, Discard, Send,
Accept and scheduling remain deferred/fail closed. Backend reference files, status enums, database
contracts, migrations and transport/detection/finalization/delivery behavior are unchanged.
F6A implementation/correction reports remain byte-identical historical records.

## Dependencies

None added or changed. `package.json` and `package-lock.json` are byte-identical to baseline.
No npm/NuGet restore or dependency installation was attempted.

## Verification actually executed

Runtime: Node.js `v24.19.0`.

| Verification                            | Result                                   |
| --------------------------------------- | ---------------------------------------- |
| Focused Node suite across 68 test files | 483 passed, 0 failed                     |
| Unmodified baseline broad Node suite    | 1,072 total; 1,067 passed; 5 failed      |
| Candidate broad Node suite              | 1,093 total; 1,088 passed; same 5 failed |
| New regression tests                    | 21 additional tests; all passed          |
| Changed/new JavaScript syntax           | `node --check` on all 17 files; 0 errors |

Broad commands (run from each extracted `src/ProductCatalogue` directory):

```text
node --test --test-reporter=tap
```

The focused command explicitly supplied all `*.test.js` files from:

- `src/features/analyze`
- `src/features/products`
- `src/features/data/normalizers`
- `src/features/productCollection`
- `src/features/review`
- `src/features/timeline`
- `src/shared/routing`
- `src/features/dataSources/config`
- `src/features/map/popups`

This covers F6A, exact Product service/ProductContext, registry, normalized response/work-unit
metadata, Analyze composition/API/source isolation/history/route lifecycle/map, workspace routing,
freshness, Collection capabilities, F5 popup boundaries, Review and History regressions.

The new initializer tests execute production generation/composition logic with public dependency
stubs and delayed exact-member History completion. Map tests execute the production layer pipeline
with a stub layer factory and application-owned Graphic identity attributes. These are not a real
ArcGIS/Calcite browser render. Previous tests expecting all package navigation disabled were updated
to permit only Analyze; their Review/History/mutation guards remain. Tests of ordinary exact Product
projection explicitly inject an accepted simple resolution boundary; real package tests use the real
F6A resolver and exact workspace service.

The identical baseline/candidate failures are:

1. `range controls keep keyboard time editing local until the range interaction commits` — existing source assertion failure.
2. `ProductCatalogueAPI registers only the retained source mocks behind the environment/configuration gate` — backend source omitted from the supplied reference archive.
3. `ProductCatalogueAPI embeds only the retained source-specific mock fixtures` — backend project file omitted from the archive.
4. `Development mock fixture files normalize to globally unique source datasetNames` — backend mock fixtures omitted from the archive.
5. `runtime source changes do not republish compatibility filter state` — existing source assertion failure.

No new failing test was introduced. The broad suite is not reported as fully passing.

## Not executed / limitations

- `npm run check`, Prettier, ESLint and Vite build: project `node_modules` are absent. Dependencies were not installed solely for verification.
- No live backend, real browser, ArcGIS rendering or Calcite interaction acceptance was executed.
- No backend/.NET build or tests: backend changes are prohibited and the supplied backend is reference-only.
- Independent backend reads are not a server transaction. Identity/mapping validation and frontend generation ownership guarantee complete client publication, not a transactional backend snapshot.
- Optional report/History availability remains source-contract dependent; unsupported data is shown truthfully as unavailable.
- Ordinary Product browser comparisons depend on locally available non-package test data.

## Local verification and manual acceptance

Run before acceptance:

```text
cd src/ProductCatalogue
npm run format
npm run check
```

1. Main-map ENC popup: preserve F5 member content/freshness; Analyze is available; Review and floating History unavailable; no package mutation action.
2. Package to Analyze: canonical S-101 `Datasets=` route, one outer item, one Graphic, S-101 then S-57 sections, independent concrete identities/versions/statuses.
3. Search/add S-101, then mapped S-57, then both: one retained package/card/Graphic and canonical S-101 route exactly once. Include non-prefixed names where data allows.
4. Collection: one package entry; Analyze opens the canonical package without splitting it.
5. Enable, disable, re-enable and remove: all nested member presentation follows the outer item; only one shared Graphic is affected; no orphan member remains.
6. Freshness/manual refresh: member content publishes together; failed replacement retains both accepted members; no stale partial state or duplicate polling lifecycle. Inspect network requests.
7. Existing simple Product and mixed workspace flows: exact identity, provider isolation, filtering/search, independent enable/remove and existing navigation/zoom patterns remain correct.
8. Ordinary Review/History behavior remains unchanged; package navigation to these destinations remains unavailable.
9. Light/dark, compact layout, keyboard controls, input focus, Escape, back navigation and narrow viewport behavior.

## File inventory

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
- `src/ProductCatalogue/src/features/analyze/api/analyzeApi.package.test.js`
- `src/ProductCatalogue/src/features/analyze/core/initAnalyzePage.package.test.js`
- `src/ProductCatalogue/src/features/analyze/domain/analyzeWorkUnits.js`
- `src/ProductCatalogue/src/features/analyze/map/createAnalyzeLayers.package.test.js`

### Deleted files

None.

## Delivery

The candidate ZIP contains only the complete changed/new files above, preserving repository paths.
Its SHA-256 is supplied alongside the ZIP; it is not embedded in the ZIP itself.
No commit was created.

Suggested commit message after local acceptance:

```text
feat(product-catalogue): add package-aware analyze
```
