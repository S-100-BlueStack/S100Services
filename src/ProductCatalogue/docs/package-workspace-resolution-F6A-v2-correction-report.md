# F6A v2 — Package owner-reference fail-closed correction

## Controlled input

- Authoritative baseline: `df7d088ea3f43c3afeef0faa93e108af4c9638f1`.
- Controlled v1 ZIP SHA-256: `CC54619638306338C4E39AE20464CC135E47497555AB86FDB2E593E7259DB6DC`.
- Preserved discovery SHA-256: `F1B211AB8CF5F19D8BC6E26F472C3BCE68702CCC692ED805799AE9695E72EFE2`.

The v1 archive hash and materialized candidate bytes were verified before editing. The discovery
remains byte-identical to v1. No commit was created.

## Changes relative to v1

Paths are relative to `src/ProductCatalogue/`.

Changed:

- `src/features/products/services/workspaceWorkUnitService.js`
- `src/features/products/services/workspaceWorkUnitService.test.js`
- `src/features/products/README.md`

New:

- `docs/package-workspace-resolution-F6A-v2-correction-report.md`

Deleted: none. The original v1 implementation report is preserved as a historical report.

## Complete delivery relative to baseline

Changed:

- `src/features/dataSources/config/dataSourceRegistry.js`
- `src/features/products/domain/productContext.js`
- `src/features/products/services/workspaceProductService.js`
- `src/features/products/README.md`

New:

- `src/features/products/services/workspaceWorkUnitService.js`
- `src/features/products/services/workspaceWorkUnitService.test.js`
- `docs/PC-package-workspaces-F6-discovery-df7d088e.md`
- `docs/package-workspace-resolution-F6A-implementation-report.md`
- `docs/package-workspace-resolution-F6A-v2-correction-report.md`

Deleted: none. The ZIP contains complete files at repository paths, including all accepted v1 changes.

## Correction

A non-empty `workspace.workUnitSourceId` now requires the referenced owner source to exist, remain
workspace-available, declare a package and claim the requested source exactly once. The discovered
package owner must match this reference. Explicit package membership cannot enter the ordinary Product
fallback, even if no owner from the member scan claims the requested source.

Once selected, the package owner is checked against every declared member's present owner reference,
including members other than the initial request. A contradictory secondary reference therefore fails
both S-101 and S-57 entry paths. References remain optional for members claimed by the owner, preserving
the accepted declarative model; present references must agree with the selected owner.

Simple and compatibility Products with no package declaration/back-reference or owner claim still
resolve exactly with `workUnit: null`, without reading Product detail.

No new network read or async lifecycle was introduced. Invalid owner/member contracts are rejected
before Product-detail reads. Exact `workspaceProductService.resolveProduct()` is unchanged relative
to v1: S-101 remains S-101 and S-57 remains S-57. Ordered authoritative member names and stable canonical
identity behavior are preserved under a valid registry.

No Analyze/Review/History package UI, Main-map package navigation, package action, route change,
Collection change, detail-normalizer change, backend change or dependency change was introduced.
F1/F2/F3/F4/F5 behavior and popup freshness remain untouched. No dependency was installed.

## Regression proof and verification

The new tests were first run against controlled v1 resolver code:

- Owner omits secondary despite its explicit back-reference: failed as expected, reproducing the
  successful ordinary S-57 fallback.
- Primary entry with a contradictory secondary owner reference: failed as expected, reproducing
  successful package resolution from S-101.
- Secondary entry with the contradictory owner reference: already failed closed in v1; retained
  alongside the primary-entry test to establish symmetry.

Before the correction: 30 work-unit tests, 28 passed, 2 failed.
After the correction: all 30 work-unit tests passed.
Existing valid-entry convergence and genuine simple/compatibility fallback tests remain passing.

| Suite                                                       | Tests | Passed | Failed |
| ----------------------------------------------------------- | ----: | -----: | -----: |
| Baseline broad suite (earlier verified run in this session) | 1,042 |  1,037 |      5 |
| Controlled v1 broad suite (rerun for this correction)       | 1,069 |  1,064 |      5 |
| v2 broad suite                                              | 1,072 |  1,067 |      5 |
| v2 focused suite                                            |   106 |    106 |      0 |

The broad suites have the same five failure names and causes: three tests require backend files absent
from the scoped baseline archive, and two existing source-text regex tests fail against the supplied
source. There is no new failure. These tests and their source files were not changed. The v1 report
lists their exact names and causes.

Focused verification covers registry, ProductContext, exact Product service, canonical work-unit
service, normalized Product detail/member metadata, workspace routing/navigation, Analyze source-aware
API and Review History resolution. Command from `src/ProductCatalogue`:

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

`node --check` passed for both JavaScript files changed relative to v1 and all five JavaScript files
included relative to baseline. ZIP paths and contents were verified against the candidate bytes.

`npm run check` was not run because project `node_modules` and its format/lint/build dependencies remain
unavailable. No dependencies were installed for verification. Manual browser verification was not run.

## Manual acceptance still required

Run locally:

```sh
cd src/ProductCatalogue
npm run format
npm run check
```

Then verify:

1. Main-map F5 ENC package popup behaves as accepted.
2. Package Analyze/Review/History navigation stays unavailable.
3. Existing simple Product Analyze/Review navigation is unchanged.
4. Product Collection behavior is unchanged.
5. Workspace URLs still use `Datasets=`.
6. Direct S-57 workspaces retain existing exact Product behavior.
7. No new package action is visible or callable.
8. F1/F2/F3 behavior and F5 popup freshness remain unchanged.

## Limitations and delivery

The canonical resolver remains opt-in; no workspace UI caller uses it yet. Independent backend reads
remain non-transactional. Future workspace slices must retain caller-owned freshness/generation and
suppress superseded results. This focused correction changes registry contract validation only.

The v2 ZIP SHA-256 is reported outside this file to avoid a self-referential digest.

Suggested commit message after acceptance:

```text
feat(product-catalogue): add package workspace resolution foundation
```
