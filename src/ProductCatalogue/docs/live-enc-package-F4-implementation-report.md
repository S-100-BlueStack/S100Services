# F4 live ENC package frontend integration — v2

## Source of truth

Authoritative baseline: `5fedc0f0ca1c34a4d3d65552d7845ff57d56e43e`.
Controlled v1 candidate SHA-256: `D10AD5B993C49A02B48C4D4759246579AED8973E6CE84B1FB73CBB8F5937DB32`.
V2 preserves v1 except for the focused workspace availability correction. No commit was made.
The supplemental full frontend archive exactly matches every overlapping file in the review archive.

| Input                         | Verified SHA-256                                                 |
| ----------------------------- | ---------------------------------------------------------------- |
| Review archive                | AA4D101CC44AFDF0CC7772B31C7BDB6AFAA8C5577E9108C5D71C06C89479E010 |
| Review context                | 26F8F02A05C7A2B171F6A10A7DA2990C241A39A1BBD169A6A2C25F88546657FE |
| Supplemental frontend archive | 351F6679B3538A5B3259754D20FBE846FF4CBF1BABD36F849F981DED0C680EB3 |

## V2 focused correction

The private `hasAvailableTargetedWorkspaceSource` predicate combines the declarative
`workspace.resolution === "targeted-product-aoi"` contract with the existing authoritative
`isWorkspaceAvailableDataSource` predicate. Both lightweight electronic catalog creation and direct
or forced targeted Product requests use this same boundary. No source IDs, names or prefixes branch
production behavior. With no available targeted source, other configured providers load/resolve
normally; unknown Products retain existing not-found/failure semantics without electronic requests.

Partial configuration remains fail closed: the selected Product's returned ProductSpecification
selects its source, whose availability is checked before normalization. A configured-out specification
is not reinterpreted as another source. Existing ambiguity, provider-error and stale catalog-generation
behavior is preserved. No changes to the registry, normalizer, wire mapping, F1/F2/F3, CIM symbols,
backend, popup architecture, dependencies or persistence were made relative to v1.

### V2 files changed relative to v1

- `src/ProductCatalogue/src/features/products/services/workspaceProductService.js`
- `src/ProductCatalogue/src/features/products/services/workspaceProductService.test.js`
- `src/ProductCatalogue/docs/live-enc-package-F4-implementation-report.md`

No new or deleted files relative to v1. The complete v2 ZIP still contains the 21 replacement/new files
relative to the authoritative repository baseline; all other v1 candidate bytes are preserved.

### V2 verification

| Check                                                                   | Result                                                          |
| ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| Focused workspace/registry/workflow/Analyze/Review/route/live ENC tests | 68/68 passed                                                    |
| Broad `node --test`                                                     | 1,006 tests: 1,004 passed, 2 failed, 0 skipped                  |
| `node --check` on both JavaScript files changed relative to v1          | 2/2 passed                                                      |
| npm format/check/lint/build                                             | Not run: project node_modules absent; no dependencies installed |
| Browser acceptance                                                      | Not run; local acceptance remains pending                       |

The focused command was:

```text
node --test src/features/products/services/workspaceProductService.test.js src/features/dataSources/config/dataSourceRegistry.test.js src/features/products/tests/normalizedWorkflow.test.js src/features/analyze/api/analyzeApi.sourceAware.test.js src/features/review/services/reviewHistoryLoader.test.js src/shared/routing/workspaceRoute.resolution.test.js src/features/dataSources/tests/liveEncPackageIntegration.test.js
```

Six added regression tests verify catalog exclusion with only S102 configured; direct/forced
resolution without electronic requests; availability-unavailable targeted definitions; both partial
specification configurations failing closed for the other returned specification; and truthful
non-electronic provider failure behavior. Existing default lightweight catalog, targeted S57/S101,
forced resolution, ambiguity, stale-generation and live ENC integration coverage also passes.

The only broad-suite failures are the same two reproduced and accepted v1/baseline failures documented
below. No new failures. Baseline evidence was retained, not rerun in this correction: baseline
974 tests / 972 passed / 2 failed; v1 1,000 tests / 998 passed / 2 failed.

### Known catalog limitation

`GET electronicproducts` returns an untyped name list. When at least one targeted source is available,
the list may include names belonging to a configured-out electronic specification. Only selection
through targeted AOI can determine the authoritative specification; unavailable sources return
not-found. V2 does not poll each picker item, infer specification from names or add bulk/backend work.
When no targeted source is available, this workspace service does not request or expose the list.

### Additional local acceptance for v2

After local `npm run format` and `npm run check`, repeat the normal F4 checklist below, plus:

1. Normal configuration keeps Main-map `electronicproducts/aoi?layer=ENC` only.
2. Available electronic workspace sources use the lightweight name list and targeted selected AOIs.
3. With both electronic sources disabled, workspace catalog/resolution makes neither electronic
   catalog nor targeted requests; configured non-electronic providers remain usable.
4. With only one electronic specification configured, a selected Product whose targeted response
   identifies the other specification fails closed without reinterpretation or fallback.
5. No global `productSpecification=S101/S57` AOI request is reintroduced.

## Compatibility and architecture

The technical Main-map provider remains `s101`, labeled ENC-package. Its registry loader changes from
`electronicproducts/aoi?productSpecification=S101` to `electronicproducts/aoi?layer=ENC`.
Only one representative Graphic/layer/provider is created per package; no detail polling or extra
request pipeline is introduced. The unused exported `fetchAOI` helper is narrowed to the ENC contract.
All frontend callers were searched: the registry loader is the runtime AOI path; no helper calls remain.

S-57 has no bulk loader and remains non-selectable/non-persistable on Main map. Electronic workspace
availability uses the declarative `workspace.resolution: "targeted-product-aoi"`, independently of
Main-map loader presence. Workspace catalog loading uses the lightweight name list; selected Products
use the targeted AOI response's ProductSpecification. This also covers catalog-loaded and force paths.
Generic test/mock catalog providers retain their loaders. Known cross-provider ambiguity and provider
errors remain fail-closed. Targeted 404/409 and identity/specification errors have no bulk fallback.
No dataset-name heuristics or cross-source fallback are introduced.

The transport normalizer preserves Esri geometry validation, representative DatasetName/productKey,
DisplayScale, UsageBand, scalar Status, ErrorMessage and stable source-aware identities. The read model is:

```js
workUnitStatus: {
  workflowStatus: 9,
  members: [
    { key: "s101", datasetName: "101DK0041149E", status: 10 },
    { key: "s57", datasetName: "DK-WIRE-MAPPING-42", status: 15 },
  ],
}
```

Workflow status comes exclusively from top-level Attributes.Status. Raw EncPackageStatus values never
enter the filter palette or rendering decisions. Member order/keys come from workUnit.members; registry
normalizer configuration maps member keys to backend DTO fields and numeric ProductSpecification IDs.
Member dataset names come from the payload. Raw Package DTOs, versions, held/discarded flags and action
eligibility are not attached as a broad new domain model.

## Status normalization contract

Inspected ProductRecord.cs ProductState, ResponseTypes.ProductStatus, LookupController productstates,
Program.cs JSON settings, statusStore and colorsConfig. ProductState has no enum string converter;
API enum values use the numeric wire contract. Explicit ProductState-to-ProductStatus mapping is tested
against the captured baseline contract and the existing palette. Numeric strings are also normalized.
Unknown IDs/names, null, booleans, arrays and objects never become fabricated known member states.
Top-level unknown scalar values retain the previous truthful scalar handling.

| State                   | ProductState wire ID | ProductStatus logical ID |
| ----------------------- | -------------------- | ------------------------ |
| Idle                    | 1                    | 1                        |
| Exported                | 2                    | 2                        |
| Frozen                  | 5                    | 5                        |
| InTransit               | 6                    | 6                        |
| Rejected                | 7                    | 7                        |
| ChangesDetected         | 8                    | 8                        |
| Exporting               | 9                    | 9                        |
| Validating              | 10                   | 10                       |
| ReadyForDistribution    | 11                   | 11                       |
| AcceptedForDistribution | 12                   | 12                       |
| Published               | 13                   | 13                       |
| Cancelled               | 14                   | 14                       |
| Error                   | 15                   | 15                       |

Complete valid members populate workUnitStatus. Missing package/member identity or unknown/missing member
state omits that projection, preserving representative scalar filtering and rendering. Contradictory
source/primary/member identity, member specification or package layer rejects the entire source payload.
PascalCase/camelCase DTO field aliases are supported.

F1 retains workflow/member OR matching, AND against other dimensions and per-Graphic deduplication.
F3 retains contextual/self-excluding counts through the same readValues contract. F2 uses members only:
equal statuses are scalar, distinct statuses use the unchanged mixed CIM symbol, incomplete member
state is representative scalar. The synthetic helper remains diagnostic only.

The existing generation owner, guarded publication, in-place reconciliation, active-source refresh,
filter/search replacement and one-work-unit interactions are unchanged. Tests verify changed member
state keeps Graphic identity, semantic no-op/workflow-only refresh keeps the symbol reference, and an
older source generation cannot publish stale package state.

Package Pause/Resume/Discard/Send/Accept/scheduling/manual Edition/Update export and package-originated
Analyze/Review/History remain unavailable. No Product endpoints are orchestrated into package actions.
No backend, migration, persistence schema, dependencies, manifests or lockfiles change.

## V1 verification evidence (preserved)

Node: v24.19.0. Working directory: src/ProductCatalogue.

| Verification                                                | Result                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------- |
| Full candidate node --test                                  | 1,000 tests: 998 passed, 2 failed, 0 skipped                    |
| Full untouched baseline node --test                         | 974 tests: 972 passed, same 2 failures, 0 skipped               |
| Focused relevant suite, 42 explicitly enumerated test files | 292 tests: 291 passed, 1 reproduced baseline failure            |
| node --check on changed/new JavaScript                      | 16/16 passed                                                    |
| Backend content comparison                                  | No changed backend files                                        |
| Dependencies, package.json and package-lock.json            | Unchanged                                                       |
| npm format/check/lint/build                                 | Not run: project node_modules absent; no dependencies installed |
| Browser/live API acceptance                                 | Not run in this environment                                     |

The focused suite includes dataSources, filters, symbology, search, graphicSymbolization,
reconcileGraphicsLayers, packageFoundation, workspaceProductService, normalizedWorkflow,
productCatalogApi, Analyze source-aware API, Review history loader and workspace route resolution.

26 additional tests cover the live loader, all member status mappings, aliases, metadata/identity,
fallback and contradiction boundaries, registry-driven member order, F1/F2/F3 live integration,
search/filter replacement, Graphic/symbol stability, stale generation and targeted workspace paths.
Existing regression fixtures are adapted to targeted electronic resolution and no longer depend on
bulk electronic AOI transport. Parallel History requests are compared by identity, not completion order.

### Reproduced baseline failures

1. src/features/dashboard/ui/dashboardPage.presentation.test.js:
   `range controls keep keyboard time editing local until the range interaction commits`.
   Its source-text regex expects LF newlines; the authoritative file has CRLF. Same failure on baseline.
2. src/features/dataSources/tests/runtimeSourceFilterIsolation.test.js:
   `runtime source changes do not republish compatibility filter state`.
   The structural test cannot find its expected runtime-source onLayersChanged callback. Same failure
   on baseline. This is also the single failure in the focused suite.

These failures are not fixed as part of F4. Full npm check success is not claimed.

## Local and browser acceptance

Run locally:

```text
cd src/ProductCatalogue
npm run format
npm run check
```

1. Use backend baseline 5fedc0f0 and open Main map.
2. Verify one ENC AOI request per load/normal refresh: electronicproducts/aoi?layer=ENC.
3. Verify no global productSpecification=S101/S57 AOI calls.
4. Verify one representative Graphic per package and no S-57 Main-map layer.
5. Verify one package item for search, hover, overlap, popup and Collection.
6. Equal valid members must render the existing scalar member symbol.
7. Different valid members must render mixed hatching without invoking the helper.
8. Refresh changed backend member state: keep Graphic identity and avoid duplicates.
9. Status filtering must match the top-level workflow status.
10. Status filtering must match either S-101 or S-57 member status.
11. Usage band/Display scale must narrow contextual Status counts correctly.
12. Changing only package/workflow status must not change member symbol selection.
13. Verify filter options, Clear all, Preferences Reset and Auto-save.
14. Verify scale hiding remains independent of filtering.
15. Verify no Product-detail requests are added merely for map rendering/filtering.
16. Analyze/Review must resolve selected Products through the targeted AOI route.
17. Verify direct S-57 resolution from authoritative ProductSpecification.
18. Package-originated Analyze/Review/History remain unavailable.
19. Package mutation/export actions remain unavailable/fail closed.
20. Incomplete/unknown member state stays scalar; contradictory identities fail closed without splitting.

Use actual differing-member backend data or an authoritative local API response fixture for step 7.
The included liveEncAoi test fixture models the baseline wire contract and does not alter production data.
Check both themes, keyboard/focus behavior and representative-volume responsiveness. Full popup member
metadata/action integration is intentionally deferred. Browser results remain pending.

## Changed files

### Modified

- `src/ProductCatalogue/docs/enc-package-frontend-foundation.md`
- `src/ProductCatalogue/docs/normalized-workflow-frontend-adaptation.md`
- `src/ProductCatalogue/docs/package-mixed-status-rendering.md`
- `src/ProductCatalogue/src/features/analyze/api/analyzeApi.sourceAware.test.js`
- `src/ProductCatalogue/src/features/data/api/layerDataApi.js`
- `src/ProductCatalogue/src/features/dataSources/README.md`
- `src/ProductCatalogue/src/features/dataSources/config/dataSourceRegistry.js`
- `src/ProductCatalogue/src/features/dataSources/config/dataSourceRegistry.test.js`
- `src/ProductCatalogue/src/features/dataSources/domain/workUnitStatusProjection.js`
- `src/ProductCatalogue/src/features/dataSources/services/dataSourceNormalizer.js`
- `src/ProductCatalogue/src/features/map/popups/packageFoundation.test.js`
- `src/ProductCatalogue/src/features/products/services/workspaceProductService.js`
- `src/ProductCatalogue/src/features/products/services/workspaceProductService.test.js`
- `src/ProductCatalogue/src/features/products/tests/normalizedWorkflow.test.js`
- `src/ProductCatalogue/src/features/review/services/reviewHistoryLoader.test.js`
- `src/ProductCatalogue/src/shared/routing/workspaceRoute.resolution.test.js`

### New

- `src/ProductCatalogue/src/features/dataSources/domain/electronicProductStatus.js`
- `src/ProductCatalogue/src/features/dataSources/domain/electronicProductStatus.test.js`
- `src/ProductCatalogue/src/features/dataSources/tests/fixtures/liveEncAoi.js`
- `src/ProductCatalogue/src/features/dataSources/tests/liveEncPackageIntegration.test.js`
- `src/ProductCatalogue/docs/live-enc-package-F4-implementation-report.md`

Deleted: none. The candidate ZIP contains only these complete replacement/new files.

Suggested commit after local acceptance: `feat(product-catalogue): integrate live ENC package AOI state`.

The final response supplies the candidate ZIP SHA-256.
