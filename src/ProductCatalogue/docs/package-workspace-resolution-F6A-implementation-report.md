# F6A — Package-aware workspace work-unit resolution foundation

## Source of truth

- Baseline: `df7d088ea3f43c3afeef0faa93e108af4c9638f1`.
- Baseline archive SHA-256: `44A8002EF243EDCDD8FB664C40B6BD3C95E97DAD2448D922086962EF274A1ADB`.
- Context SHA-256: `2A8E2FB3B5F6E65E4F9A898C763D1790948ABC447FDBB18C808FFD858CC89971`.
- Controlled discovery SHA-256: `F1B211AB8CF5F19D8BC6E26F472C3BCE68702CCC692ED805799AE9695E72EFE2`.

All three hashes were verified. The discovery was extracted from the context and preserved byte for
byte, including its original line endings. Repository source came exclusively from the baseline
archive. No commit was created and no dependency was added or installed.

## Changed files

Paths are relative to `src/ProductCatalogue/`.

- `src/features/dataSources/config/dataSourceRegistry.js`
- `src/features/products/domain/productContext.js`
- `src/features/products/services/workspaceProductService.js`
- `src/features/products/README.md`

## New files

- `src/features/products/services/workspaceWorkUnitService.js`
- `src/features/products/services/workspaceWorkUnitService.test.js`
- `docs/PC-package-workspaces-F6-discovery-df7d088e.md`
- `docs/package-workspace-resolution-F6A-implementation-report.md`

Deleted files: none. Backend source, dependency manifests and lockfiles are unchanged.

## Architecture and preservation

The central ProductContext boundary now copies and deeply freezes the registry work-unit declaration.
Workspace contexts retain their existing exact source-aware Product identity and capabilities. Package
navigation restrictions remain a Main-map overlay; unrelated contexts are unaffected.

The registry declares `sourceId` on each ordered work-unit member. S-57 also declares its owner through
`workspace.workUnitSourceId`, allowing a missing package owner to fail closed without naming heuristics.
Ordering, labels and export standards remain S-101/S100 followed by S-57/S57.

`workspaceProductService.resolveProduct()` remains exact: S-101 returns S-101; S-57 returns S-57.
Its provider selection, targeted AOI, ambiguity, 404 and isolation logic is unchanged.

The separate `createWorkspaceWorkUnitService().resolveWorkUnit()` API:

1. Resolves the requested exact Product.
2. Finds its package declaration using registry references.
3. Reads authoritative member names through the existing normalized Product-detail API.
4. Validates both exact member Products against their declared sources, Product types and specifications.
5. Uses the declared primary member as the canonical representative.
6. For a secondary entry, verifies that the primary detail still reports the same member mapping.
7. Returns ordered immutable member identities and one stable, source-aware package identity.

Simple and compatibility Products retain exact resolution with `workUnit: null`. S-101 and mapped
S-57 entry paths converge on the same S-101 representative and work-unit identity. Dataset names may
be arbitrary; neither source-name branching nor dataset-prefix heuristics are used by the resolver.

Incomplete or duplicate identities, invalid primary declarations, unavailable/missing/replaced sources,
ambiguous owners, source/type/specification mismatches, stale context declarations, failed detail/AOI
reads and contradictory member mappings fail closed. Failed packages publish no Product or partial work
unit. Provider diagnostics are retained.

Read deduplication is request-local. There is no persistent package cache, polling, listener or second
freshness owner. Existing exact-provider snapshots remain owned by the existing Product service.

No caller was moved to the new resolver. Analyze/Review layouts, floating History, Collection,
`Datasets=` routes and direct S-57 workspace behavior remain unchanged. Package Main-map
Analyze/Review/History navigation remains disabled. F6B/F6C/F6D presentation is deferred. No package
Pause, Resume, Discard, Send, Accept, scheduling or other mutation capability was enabled.

## Verification actually run

Node runtime: the session's installed Node runtime; no packages were installed.

- Focused Node suite: **103 passed, 0 failed**.
- Baseline broad Node suite: **1,042 tests; 1,037 passed, 5 failed**.
- Candidate broad Node suite: **1,069 tests; 1,064 passed, 5 failed**.
- All **27 new work-unit tests passed**. No new broad-suite failure.
- `node --check` passed for every changed/new JavaScript file (five files).
- Archive file selection was compared against baseline bytes; the ZIP contains complete changed/new
  files at repository paths and no unrelated files.

Focused command, from `src/ProductCatalogue`:

```sh
node --test --test-reporter=tap \
  src/features/dataSources/config/dataSourceRegistry.test.js \
  src/features/products/domain/productContext*.test.js \
  src/features/products/services/workspace*Service.test.js \
  src/features/data/normalizers/productResponse.test.js \
  src/features/data/normalizers/workUnitMetadata.test.js \
  src/shared/routing/workspaceRoute*.test.js \
  src/app/routing/workspaceNavigation.test.js \
  src/features/analyze/api/analyzeApi.sourceAware.test.js \
  src/features/review/services/reviewHistoryLoader.test.js
```

The same five baseline/candidate failures were compared by test name and failure cause:

| Test                                                                                                   | Baseline and candidate cause                                                                   |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| range controls keep keyboard time editing local until the range interaction commits                    | An LF-only source-text regex does not match the supplied dashboard source's CRLF line endings. |
| ProductCatalogueAPI registers only the retained source mocks behind the environment/configuration gate | The scoped archive does not contain `src/ProductCatalogueAPI/Program.cs`.                      |
| ProductCatalogueAPI embeds only the retained source-specific mock fixtures                             | The scoped archive does not contain `src/ProductCatalogueAPI/ProductCatalogueAPI.csproj`.      |
| Development mock fixture files normalize to globally unique source datasetNames                        | The scoped archive does not contain backend mock fixture files.                                |
| runtime source changes do not republish compatibility filter state                                     | Existing source-text extraction cannot find the runtime `onLayersChanged` callback.            |

These tests and their source files were not modified.

`npm run check` was not run: the supplied project has no `node_modules`, and Prettier, ESLint, Vite,
ArcGIS and Calcite project dependencies are unavailable. Format/lint/build and browser integration
verification therefore remain local acceptance checks. No .NET check was required or run.

## Local acceptance checklist

Run:

```sh
cd src/ProductCatalogue
npm run format
npm run check
```

Then verify:

1. The Main-map ENC package popup behaves as accepted in F5.
2. Package Analyze/Review/History navigation remains unavailable.
3. Existing simple Product Analyze/Review navigation is unchanged.
4. Existing Product Collection behavior is unchanged.
5. Existing workspace URLs still use `Datasets=`.
6. Direct S-57 workspaces retain their existing exact Product behavior before F6B/F6C.
7. No new package action is visible or callable.
8. F1 status filtering, F2 mixed-status rendering, F3 facets and F5 popup freshness remain unchanged.

These manual browser checks have not been executed in this session.

## Known limitations

The foundation is opt-in and does not provide package workspace presentation. Backend reads are
independent requests, not an atomic database snapshot. The resolver validates identities and mapping
agreement but cannot detect a change occurring after its last response without a backend revision
contract. Future workspace slices must use the existing caller-owned freshness/generation lifecycle
and suppress superseded results. Deployment source availability is checked; Main-map visibility toggles
do not disable direct workspace sources.

## Delivery

The candidate ZIP SHA-256 is provided in the delivery response, outside this file to avoid a
self-referential archive digest.

Suggested commit message after local acceptance:

```text
feat(product-catalogue): add package workspace resolution foundation
```
