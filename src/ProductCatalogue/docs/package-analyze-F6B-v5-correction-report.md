# F6B v5 — Product-scoped Internal Validation Reports

## Controlled source and scope

- Authoritative baseline: `a5360531032c2baeb8d5544cf7b8e7cb15a7551f`.
- Accepted F6A commit: `5447c8c3355098d0d202434dac0710e7de782d40`.
- Controlled v1 SHA-256: `DE84B81B328F0329643F70AA19EA6B20894341658BD7A5D46042AADF7E580039`.
- Controlled v2 SHA-256: `11365C16E6535FC01064C0B901DD7275472F7EB744FEE1657CFA2FAE923EE3C8`.
- Controlled v3 SHA-256: `E8E5E2785A29829156A0B963B4D4CA8D29989CF0B125351E4700146B5BD7495A`.
- Controlled v4 ZIP SHA-256: `C7868696E3EDE41638CD51D7879E2B08EA2BEA2357359501B4413D60B5C78573`.

V4 was hash-verified BEFORE editing, then overlaid onto the supplied authoritative baseline to create
controlled v4 and the v5 working tree. All four materialized controlled trees were byte-compared with
their ZIP/baseline inputs. HEAD/main, older candidate source and remote repository retrieval were not
used to reconstruct v5 changes. No commit, backend change, dependency installation or redesign.
Earlier F6B reports remain unchanged historical records.

## Confirmed backend contract and precise root cause

The supplied authoritative backend context was available and inspected:

- `src/ProductCatalogueAPI/Controllers/ElectronicProductsController.cs`,
  `GetValidationArtifactHistory`, `GetRelatedExportTracksAsync` and `GetRelatedDatasetNames`.
- `src/ProductCatalogueAPI/Models/ResponseTypes.cs`, `ProductArtifactHistoryResponse`.

`GET electronicproducts/{name}/artifacts/history` resolves related datasets and retrieves all eligible
S-101/S-57 export tracks. It emits validation artifacts including earlier revisions. Each record uses
its track's `DatasetName` and `ProductSpecification`, artifact `TrackId`/`RevisionId`, and a download
URL constructed with the track's own dataset name and artifact ID. The endpoint name is not a filter
that limits returned artifacts to that requested Product. No backend source was modified.

The shared frontend `normalizeArtifactHistory()` already preserves those ownership fields and
validates/rebases download URLs. The defect occurs in `fetchElectronicAnalyzeProduct()`:

```js
const history = normalizeArtifactHistory(artifacts.value);
product.internalValidationReports = history.map(/* report presentation fields */);
```

V4's unconditional mapping assigns the whole related-track response to each requesting package
member. Calling the endpoint twice through different aliases does not scope ownership. Consequently
S-101 reports also appear under S-57 (and vice versa). The UI accurately rendered the arrays it received;
this correction enforces ownership before member publication and does not hide reports in the UI.

## Exact ownership rules

V5 adds one Analyze-owned domain helper, `selectPackageValidationArtifacts()`, and calls it only when
`fetchElectronicAnalyzeProduct()` is loading a resolved package member (`workUnit` is present).
The ordinary/non-package branch still maps the complete normalized history as before.

The expected Product identity comes from the exact F6A/F6B member `productContext.datasetName` and
`productContext.data.attributes.productSpecification`. F6A has already validated that AOI attribute
against the declared source specification. No extra Product-detail request is needed.

| Input                                   | Rule                                                                                                                                                                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dataset name                            | Non-empty concrete string, trimmed and case-insensitive as in existing F6A workspace matching. No prefix, filename, representative or URL inference.                                                                                                                               |
| Specification                           | Registry numeric/string 101 or 57 and normalized S101/S57 token forms identify separate namespaces. Case, whitespace, underscore and hyphen normalization follows existing specification conventions. Unknown specifications, including S128 artifact DTO claims, are not guessed. |
| Matching record                         | Both dataset identity and specification must equal the exact member's identity. Matching names cannot override a contradictory specification.                                                                                                                                      |
| Foreign related record                  | Omit from this member; a different concrete Product or specification is not inherited.                                                                                                                                                                                             |
| Missing/unknown record ownership        | Omit and set the existing optional member `loadError` warning. Keep usable reports and Product content.                                                                                                                                                                            |
| Conflicting artifact/track owner claims | If one response claims different ownership for the same artifact ID or track ID, omit all affected records; do not select an arbitrary owner.                                                                                                                                      |
| Unprovable member identity              | Raise a domain error caught at the existing optional artifact-content boundary; member metadata remains loaded and reports are empty.                                                                                                                                              |
| Historical revisions                    | Do not filter by current revision or candidate; every correctly owned historical record remains available in response order.                                                                                                                                                       |

Response-local artifact/track claim checks use only returned metadata. They do not invent a Product-to-
track association or store a persistent cache. Known foreign records simply do not match; ambiguous
records produce `Some validation artifacts have ambiguous or missing Product ownership and were not
displayed.` through the existing load-warning field. Optional attribution failures do not fail the
whole package. A member with no accepted reports uses its unchanged empty state.

Accepted artifact objects are retained unchanged by the filter. The existing report projection copies
their original normalized `url`, ID, source label and metadata into the requesting member's report.
`trackId`/`revisionId` remain in `report.raw`. No S-101 URL is rewritten with an S-57 dataset or vice versa.
Shared URL validation, API-base handling, download routes and security restrictions are byte-unchanged.

## Request discipline and independent content failures

Both package members currently issue their own history request; these often return the same combined
history. V5 intentionally keeps the existing two independent requests. Selecting one canonical request
would make an optional failure on that endpoint discard history otherwise obtainable via the other
member. Avoiding that would require new fallback/request choreography, which is unnecessary for this
ownership correction. Correct attribution takes priority over secondary deduplication.

Logical request count does not increase. There is no global artifact cache, another monitor, polling,
generation counter or member publication lifecycle. Artifact rejection is caught separately from
successful Product metadata. The other member's successful reports and independent History remain
available. Existing package snapshot publication, generations and v3 staging reject late artifact
responses before they can overwrite newer accepted members.

## Preserved accepted behavior

Byte checks with controlled v4 confirmed no changes to:

- F6A `workspaceProductService.js` (also identical to authoritative baseline) and
  `workspaceWorkUnitService.js`: exact resolution and fail-closed owner/member validation.
- V2 `analyzeWorkUnits.js`: alias reconciliation, canonical identity and first-occurrence ordering.
- V3 `initAnalyzePage.js`: off-map staging, immediate full/targeted supersession and destroy cleanup,
  accepted package layer retention, authoritative generation IDs and single freshness monitor.
- V4 `createAnalyzeLayers.js`: one shared package geometry/Graphic, member-only status projection,
  dedicated package layer and existing F2 mixed CIM rendering.
- F2 projection, resolver, palette, CIM symbol code, transformers and ProductContext registration.
- Shared `productArtifact.js` normalization and URL handling, and the Analyze UI renderer.

Canonical S-101 route/mapped S-57 behavior, one outer item, S-101 then S-57 member order, independent
member metadata/status/content and package controls remain. Main-map F1/F2/F3/F4/F5, Product Collection,
ordinary Analyze/Review/History and backend contracts are unchanged. Package Review/floating History
and lifecycle/mutation capabilities remain disabled. Dependencies and lockfiles are unchanged.

## Negative v4 reproduction and positive v5 result

Before implementing the correction, a new deterministic regression ran against unmodified v4 source
in a separate negative tree. Only its new API test/support files were injected; controlled v4 used
for the broad suite remained unchanged. The fixture uses the existing backend DTO shape with distinct
artifact GUIDs, track/revision identities, concrete datasets, S101/S57 specifications and owner download
URLs. BOTH endpoint aliases receive the SAME COMBINED response; the fixture is not pre-filtered.
It exercises actual F6A Product/work-unit resolution, shared artifact normalization and Analyze API
member publication.

```text
node --test --test-reporter=tap --test-name-pattern='combined validation history belongs only' src/features/analyze/api/analyzeApi.artifacts.test.js
```

| Controlled source           | S-101 report IDs       | S-57 report IDs       | Result                              |
| --------------------------- | ---------------------- | --------------------- | ----------------------------------- |
| Unmodified v4, either alias | Both artifact IDs      | Both artifact IDs     | 2 tests, 0 passed, 2 failed, exit 1 |
| Corrected v5, either alias  | Only S-101 artifact ID | Only S-57 artifact ID | 2 tests, 2 passed, 0 failed, exit 0 |

The negative assertions fail on the duplicated member arrays, not on missing configuration. The same
fixture and assertions pass after correction, retaining the original normalized owner download URLs.
The final fixture was also checked with backend-shaped GUID track/revision values; results are unchanged.

## Verification actually executed

Node.js `v24.19.0`; no dependency installation.

| Supplied frontend tree | Tests | Passed | Failed |
| ---------------------- | ----: | -----: | -----: |
| Authoritative baseline |  1072 |   1067 |      5 |
| Controlled v1          |  1093 |   1088 |      5 |
| Controlled v2          |  1111 |   1106 |      5 |
| Controlled v3          |  1118 |   1113 |      5 |
| Controlled v4          |  1126 |   1121 |      5 |
| Corrected v5           |  1156 |   1151 |      5 |

Each broad command ran from that tree's `src/ProductCatalogue`:

```text
node --test --test-reporter=tap
```

V5 adds 30 tests relative to v4. All pass. No new broad-suite failures, cancellations or skipped tests.
The broad suite is NOT fully passing: the same five existing failures occur in every tree:

1. `range controls keep keyboard time editing local until the range interaction commits`.
2. `ProductCatalogueAPI registers only the retained source mocks behind the environment/configuration gate`.
3. `ProductCatalogueAPI embeds only the retained source-specific mock fixtures`.
4. `Development mock fixture files normalize to globally unique source datasetNames`.
5. `runtime source changes do not republish compatibility filter state`.

The range/runtime-source failures are existing frontend source assertions. The three backend mock
checks require backend mock/source/project files omitted from the supplied reference archive.

The focused command ran **88 explicit files, 644 tests passed, 0 failed**. It includes all tests under
Analyze, products, data normalizers, Product Collection, Review, timeline, shared workspace routing,
source configuration/domain, map popups/symbology, plus existing initial Graphic symbolization,
reconciliation/feature-state, live ENC and work-unit filter integration tests.

New coverage includes combined response/endpoint alias, exact dataset and specification separation,
missing/unknown ownership, conflicting ID/track claims, previous revisions, URL identity/security,
empty members, optional artifact failure preserving metadata/History, ordinary unfiltered Analyze,
real member card rendering and empty state, targeted refresh isolation, and late artifact completion
unable to overwrite a newer accepted package. All previous F6B canonicalization, v3 staging, v4
mixed-status transition, F6A, ProductContext, Collection and Review/History tests ran unchanged.

`node --check` passed for **all 27 changed/new JavaScript files relative to baseline**, including all
8 JavaScript files changed/new relative to v4. The ZIP contains complete files for the full baseline
delta; entries were byte-verified against the final candidate, with no deleted or unrelated files.

## Checks not run and limitations

- Project/ancestor `node_modules` are absent. `npm run check`, project format, lint and Vite build were
  not run. No dependency was installed solely for verification.
- No v5 live backend, actual ArcGIS/Calcite browser or backend/.NET build/test ran. The member-card
  test uses production artifact rendering with a minimal DOM and stubs only the unrelated History
  widget. Existing browser acceptance of v4 rendering remains prior user evidence, not v5 acceptance.
- Attribution depends on honest backend dataset/specification metadata. Missing/unknown/conflicting
  normalized ownership is omitted with a warning; it cannot be recovered from filenames/URL aliases.
  No external track associations or backend schema changes are invented.
- Two artifact history requests remain; independent optional failures are preserved. Reads are not a
  server transaction. Cross-response transactional consistency is not claimed; existing accepted
  package generations and complete-member validation remain authoritative.
- Existing normalized artifacts rejected for unsafe URLs remain rejected by the unchanged shared
  normalizer. Historical report availability still depends on backend retention and source content.
- Pending promises are not aborted; existing v3 ownership/generation checks prevent stale publication.

## Updated manual acceptance checklist (pending local browser verification)

1. Open the previously tested package with distinct S-101/S-57 reports. S-101 shows only S-101 reports;
   S-57 shows only S-57 reports. Repeat entry through S-101, mapped S-57 and both alias orders.
2. Click each report and verify its original Product-owned download URL and correct diagnostic file.
3. Include earlier candidate revisions for one Product: all its own historical reports remain under
   that member, with no cross-member copies.
4. A member without matching reports shows the existing empty state. Missing/conflicting ownership
   yields an optional load warning, not a misleading report or failed entire package.
5. Verify one outer package item and two ordered S-101/S-57 member sections with independent exact
   status, metadata, content and History; package Review/floating History remain unavailable.
6. Verify one shared Analyze Graphic and existing F2 hatch for distinct statuses; equal statuses are
   scalar. Refresh equal -> distinct -> equal and confirm accepted replacement symbol transitions.
7. Package enable/disable/remove still controls the complete work unit. Collection and canonical
   S-101 `Datasets=` route remain unchanged, without child top-level items/Graphics.
8. Refresh reports with corrected Product ownership. Delay an old artifact response, complete a newer
   composition, then release it; it must not restore old member reports.
9. Block replacement creation/registration and exercise newer full load, targeted refresh B and
   destroy before releasing old gates. Preserve all accepted v3 immediate cleanup guarantees.
10. Fail one member's artifact endpoint. Its metadata/History and the other member's own reports remain
    available. Failed package metadata replacement still retains the entire accepted package Graphic.
11. Package-only refresh preserves an unrelated ordinary Graphic/layer/popup/hover. Ordinary Analyze,
    Review and History, Main-map F1/F2/F3/F4/F5 and disabled package mutation/actions remain unchanged.
12. Check light/dark, compact/narrow layout, keyboard focus, Escape/back navigation. Record unavailable
    equal/distinct, historical-report or ordinary fixtures as unavailable rather than fabricate results.

## Exact files changed/new/deleted relative to controlled v4

### Changed files

- `src/ProductCatalogue/docs/PC-package-workspaces-F6-discovery-df7d088e.md`
- `src/ProductCatalogue/src/features/analyze/README.md`
- `src/ProductCatalogue/src/features/analyze/api/analyzeApi.js`
- `src/ProductCatalogue/src/features/analyze/core/initAnalyzePage.package.test.js`

### New files

- `src/ProductCatalogue/docs/package-analyze-F6B-v5-correction-report.md`
- `src/ProductCatalogue/src/features/analyze/api/analyzeApi.artifacts.test.js`
- `src/ProductCatalogue/src/features/analyze/api/analyzeArtifactTestSupport.js`
- `src/ProductCatalogue/src/features/analyze/domain/packageValidationArtifacts.js`
- `src/ProductCatalogue/src/features/analyze/domain/packageValidationArtifacts.test.js`
- `src/ProductCatalogue/src/features/analyze/ui/analyzeSidebar.artifacts.test.js`
- `src/ProductCatalogue/src/features/data/normalizers/productArtifact.test.js`

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
- `src/ProductCatalogue/docs/package-analyze-F6B-v5-correction-report.md`
- `src/ProductCatalogue/src/features/analyze/api/analyzeApi.aliasReconciliation.test.js`
- `src/ProductCatalogue/src/features/analyze/api/analyzeApi.artifacts.test.js`
- `src/ProductCatalogue/src/features/analyze/api/analyzeApi.package.test.js`
- `src/ProductCatalogue/src/features/analyze/api/analyzeArtifactTestSupport.js`
- `src/ProductCatalogue/src/features/analyze/core/initAnalyzePage.package.test.js`
- `src/ProductCatalogue/src/features/analyze/domain/analyzeWorkUnits.js`
- `src/ProductCatalogue/src/features/analyze/domain/analyzeWorkUnits.test.js`
- `src/ProductCatalogue/src/features/analyze/domain/packageValidationArtifacts.js`
- `src/ProductCatalogue/src/features/analyze/domain/packageValidationArtifacts.test.js`
- `src/ProductCatalogue/src/features/analyze/map/analyzeMapTestSupport.js`
- `src/ProductCatalogue/src/features/analyze/map/createAnalyzeLayers.package.test.js`
- `src/ProductCatalogue/src/features/analyze/map/createAnalyzeLayers.symbolization.test.js`
- `src/ProductCatalogue/src/features/analyze/ui/analyzeSidebar.artifacts.test.js`
- `src/ProductCatalogue/src/features/data/normalizers/productArtifact.test.js`

### Deleted files

None.

## Delivery

`PC-package-analyze-F6B-candidate-v5-a5360531.zip` preserves repository paths and includes every complete
changed/new file relative to `a5360531032c2baeb8d5544cf7b8e7cb15a7551f`. No deletions. ZIP SHA-256
is supplied beside the artifact rather than embedded inside it. No commit was created.

Concrete English commit-message suggestion after acceptance:

```text
feat(product-catalogue): add package-aware analyze
```
