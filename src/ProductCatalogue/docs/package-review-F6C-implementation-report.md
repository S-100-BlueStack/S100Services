# F6C — Package-aware Review implementation report

## Controlled source

- Authoritative repository baseline: `462776d5aef68cf71cb784506c580b82c97f1dcc`.
- Accepted F6B commit in that merge: `a3f0d5d3edbdc34adace32a7247cca56ae83e4cb`.
- Colleague commit in that merge: `28abbab4d5a3e47e32165019430c6980040c1f9c`.
- Baseline ZIP SHA-256: `FB3C3639C472B921F71CCE0EF40AD89D1887AE9D82C381C6B9D5D3E0999C5BC8`.
- Context SHA-256: `B6EE4FD8791676B3A56B54B8450182241192AE67087D1B42CE3205E42A3951A7`.
- Both supplied hashes matched the manifest before any source edits. All 71 context paths exist
  in the archive. Repository source comes exclusively from the supplied explicit-commit archive.
- New candidate v1; no previous F6C candidate input. No commit, remote repository retrieval,
  backend edit, dependency installation or lockfile change.

## Architecture and final behavior

Review retains one top-level work unit, list row, canonical `Datasets=` representative, session
record and FI-022 revision obligation per ENC package. Ordered S-101/S-57 member sections stack
vertically within the existing column width. Ordinary columns keep their existing content states,
source gating and request counts; mixed comparisons do not acquire child columns or list rows.

F6A `resolveWorkUnit()` establishes complete membership through registry declarations and exact
backend Product metadata. `resolveProduct()` remains exact. Review's composition resolver reuses
complete proofs within one composition/session and reconciles all final claims before publication.
Complete later proof replaces an earlier failed alias at its first logical occurrence, consistent
proofs deduplicate, and overlapping contradictory claims fail closed. Shared claim reconciliation
is extracted from Analyze with its public wrapper and surface-specific error preserved.

`reviewProductSession.js` owns both canonicalization and content publication. Its composition
version prevents obsolete resolutions from updating current route, list or intent. Its existing
generation/record/operation checks own content loads. Pending requested composition survives rapid
additions, with session-scoped in-flight resolution reuse and no new global data cache. Removal and
package disable revoke operation ownership at input time. Full generations clear records, pending
proofs and payloads; retained ordinary records preserve FI-039 incremental semantics.

The page commits route/title and catalog/alias-aware selections only through the session's accepted
composition callback. A canonical representative proven from a catalog S-57 entry survives later
catalog validation. Both member aliases are excluded by the existing picker, including disabled
packages. Workspace intent and per-item overrides edited during canonicalization remain current;
route replacement resets intent only at its accepted composition boundary.

A package payload has two exact ordered ProductContexts, independent current Product status,
Edition/Update/source/specification and optional content results. It is keyed by `workUnit.identityKey`
and guarded by an ordered source/Product/specification signature. Member content uses existing
History/artifact APIs and normalizers with explicit capability checks. History/artifact failures
stay independent for each member; IC-ENC remains Unavailable without a fabricated request.

Each member performs its final existing Product-detail read after freshness priming and optional
content work. That read verifies its concrete identity and the complete current mapping immediately
before publication; mapping drift during deferred optional reads rejects the complete replacement.
The request-local F6A `assertCurrent()` contract guard checks registry/source snapshots at composition
and before/after member loading, without another session, timer or backend read contract. Structural
failure cannot publish a half-package or downgrade to ordinary S-101. A rejected targeted refresh
retains the prior complete members, exposes an outer refresh failure and returns false to FI-022.
Identity/mapping/source changes cannot replace that record; a full generation resolves current state.

FI-022 primes and retains only canonical representatives. A changed-only package refresh loads both
members under one existing record operation and commits once. Related member operation notifications
use the current monitor's coalesced check. Unrelated simple Products are not reloaded. Full Refresh,
route replacement, disable, removal/re-add and destroy suppress stale success, optional errors and
loading publication. Failed targeted work remains unacknowledged and can retry the same revision.

## Internal Validation ownership contract

The unchanged F6B v5 selector now lives in
`src/features/products/domain/packageValidationArtifacts.js`. Analyze's original module re-exports
it, so its existing import path and behavior remain compatible. Review applies it to normalized
combined artifact history before publishing either member's content.

Selection requires both the exact concrete dataset name and authoritative ProductSpecification.
Missing/unknown ownership or conflicting artifact/track claims are omitted with a visible warning.
Original normalized secure owner download URLs, array ordering and historical revisions survive.
The endpoint alias is never treated as ownership evidence. Ordinary Review artifacts retain their
existing unfiltered behavior. Tests send the same combined S-101/S-57 response through both aliases.

## UI and navigation preservation

One outer item's History/IC-ENC/Validation choices control both member sections. Existing content
defaults, aggregate indeterminate state, workspace inheritance, disabled intent and compact card
height/overflow contracts are reused. Each member heading identifies its own concrete Product;
status comes from that member's normalized Product detail with its exact AOI status as fallback,
never from package state or another member.

Async renders capture current FI-041 scroll/focus immediately before publication, never across an
await. Unchanged columns retain their actual application-owned DOM, History disclosures, scroll
and surviving control focus. Board horizontal scroll is restored after rerender. Styling uses
existing application theme tokens, preserves width and introduces no animation or private DOM APIs.

The registry enables only package Review in addition to accepted Analyze. The Main-map package
Tools menu adds Review; ordinary popup menus are unchanged. Product Collection keeps its storage
shape and permission checks. Floating package History remains disabled for F6D. Pause, Resume,
Discard, Send, Accept, export and scheduling remain unavailable. F1/F2/F3/F4/F5/F6A and accepted
F6B Analyze geometry, F2 hatching, staging and validation ownership are preserved by the focused
regression suite; no Analyze UI or lifecycle is imported by Review.

## Verification actually executed

Runtime: Node.js `v24.19.0`. No project `node_modules` were supplied.

| Check | Baseline | Candidate |
| --- | --- | --- |
| Broad `node --test` | 1,156 tests; 1,151 passed; 5 failed | 1,205 tests; 1,200 passed; 5 failed |
| Focused production-path regression suite | Not used as a baseline claim | 305 tests; 305 passed |
| `node --check` on every changed/new JS file | Not applicable | 27 files; 27 passed |

The broad failing test names match the actual merge baseline exactly. No new broad failure was
introduced. They are listed below rather than inferred from historical F6B reports:

- range controls keep keyboard time editing local until the range interaction commits
- ProductCatalogueAPI registers only the retained source mocks behind the environment/configuration gate
- ProductCatalogueAPI embeds only the retained source-specific mock fixtures
- Development mock fixture files normalize to globally unique source datasetNames
- runtime source changes do not republish compatibility filter state

The three backend fixture/project-file tests fail because the frontend archive does not include
`src/ProductCatalogueAPI/ProductCatalogueAPI.csproj` and its retained mock fixture files. The range
control and runtime-source callback assertions also fail in the unmodified supplied baseline.
They were compared directly and left outside this task's scope.

The focused command actually executed from `src/ProductCatalogue` was:

```text
node --test src/features/review/**/*.test.js src/features/products/services/workspaceWorkUnitService.test.js src/features/products/services/workspaceProductService.test.js src/features/productCollection/ui/productCollectionNavigation.test.js src/features/map/popups/packageFoundation.test.js src/features/map/popups/popupActionConfig.sourceAware.test.js src/shared/routing/workspaceRoute*.test.js src/features/analyze/domain/*.test.js src/features/analyze/api/*.test.js src/features/analyze/core/initAnalyzePage.package.test.js src/features/analyze/map/*.test.js
```

Tests cover exact/canonical resolution, alias orders/repetition, failed-then-complete proof, consistent
and conflicting claims, mixed ordinary order, owner URLs/revisions/ambiguous artifacts, independent
optional failures, metadata/source drift, package atomic replacement, one canonical prime, unchanged
ordinary request counts, FI-022 failed-retry acknowledgement and coalesced member notifications.
Deferred races cover success and failure after refresh, removal/re-add, disable, route replacement,
destroy and late canonicalization. Page-event tests cover current intent, catalog aliases and fresh
interaction snapshots. Board DOM tests execute production renderers for two ordered member sections,
shared toggles/empty states, one independent ordinary column and retained actual History disclosures.

## Checks not executed and local verification

`npm run check`, Prettier, ESLint, Vite build, backend restore/build/tests and real browser/manual
acceptance were not executed. Project dependencies were absent and were not installed. No format,
lint, build, backend or browser success is claimed. Formatting and the authoritative complete check
must run in the user's actual checkout with its normal dependencies and backend fixture files:

```text
cd src/ProductCatalogue
npm run format
npm run check
```

## Manual acceptance checklist — pending

1. Open Review from an ENC package's Main-map popup Tools menu and Product Collection. Confirm
   the canonical S-101 `Datasets=` URL, one sidebar item and one outer Review column.
2. Enter both member aliases directly, in both orders and with repeats. Confirm deduplication.
   Attempt the other alias from the picker while the package is selected and while disabled.
3. Inspect stacked S-101/S-57 sections for their distinct dataset names, source/specification,
   status and current Edition/Update. Confirm member order and compact shared width.
4. Toggle History, IC-ENC and Validation individually and through workspace bulk controls.
   Both members follow the one package selection. Verify defaults, mixed checkboxes, inheritance
   on later additions, disabled/reactivated intent, sidebar scroll and keyboard focus.
5. Download validation files from each member. Verify concrete owner, actual file content and
   historical revisions. Missing/ambiguous ownership must be omitted with the warning; empty,
   failed and unavailable content must remain independent and truthful.
6. Add an ordinary Product beside the package. Expand its History and scroll its column. Refresh
   only the package; the ordinary Product must keep content, DOM interaction and request count.
7. Disable, enable, remove/re-add, full Refresh, targeted FI-022 refresh and navigate back/forward.
   Confirm canonical route/composition, one package refresh and complete atomic member publication.
8. Delay a member response, then refresh, change route, disable, remove/re-add or leave the page.
   Old success/errors/loading must not resurrect it. Inject failed metadata, mapping/source drift
   or optional content failure; structural refresh retains the accepted complete package and retries.
9. Verify narrow, light/dark, keyboard, Escape, focus, horizontal/vertical scrollbar and picker
   anchor behavior. Browser visuals and real backend timing remain local acceptance work.
10. Recheck accepted F6B Analyze navigation and mixed-status hatching. Floating package History
    and all package mutation/lifecycle/export/scheduling actions must remain unavailable.

## Dependencies and remaining uncertainty

No new dependency or backend contract. `package.json` and `package-lock.json` are byte-identical to
baseline. No files are deleted. Browser rendering, authenticated API behavior and actual downloads
require the user's environment. Mapping guards detect current metadata/source contradictions at the
publication boundary; existing opaque FI-022 revisions continue to detect subsequent backend changes.
No transactional server snapshot or unsupported consistency guarantee is fabricated.

## Complete replacement/new-file inventory

All paths below are relative to the repository root. The delivery ZIP contains full files, not
patch fragments, to overlay only onto the authoritative baseline. Its SHA-256 is supplied with the
external delivery response because embedding a ZIP's own hash inside itself is circular.

### Changed files

- `src/ProductCatalogue/docs/PC-package-workspaces-F6-discovery-df7d088e.md`
- `src/ProductCatalogue/src/features/analyze/domain/analyzeWorkUnits.js`
- `src/ProductCatalogue/src/features/analyze/domain/packageValidationArtifacts.js`
- `src/ProductCatalogue/src/features/dataSources/config/dataSourceRegistry.js`
- `src/ProductCatalogue/src/features/map/popups/packageFoundation.test.js`
- `src/ProductCatalogue/src/features/map/popups/popupActionConfig.js`
- `src/ProductCatalogue/src/features/map/popups/popupProductActions.js`
- `src/ProductCatalogue/src/features/productCollection/ui/productCollectionNavigation.test.js`
- `src/ProductCatalogue/src/features/products/services/workspaceWorkUnitService.js`
- `src/ProductCatalogue/src/features/products/services/workspaceWorkUnitService.test.js`
- `src/ProductCatalogue/src/features/products/tests/normalizedWorkflow.test.js`
- `src/ProductCatalogue/src/features/review/README.md`
- `src/ProductCatalogue/src/features/review/core/initReviewPage.js`
- `src/ProductCatalogue/src/features/review/core/initReviewPage.lifecycle.test.js`
- `src/ProductCatalogue/src/features/review/core/reviewProductSession.js`
- `src/ProductCatalogue/src/features/review/services/reviewHistoryLoader.js`
- `src/ProductCatalogue/src/features/review/services/reviewHistoryLoader.test.js`
- `src/ProductCatalogue/src/features/review/ui/reviewBoard.js`
- `src/ProductCatalogue/src/features/review/ui/reviewPage.js`
- `src/ProductCatalogue/src/features/review/ui/reviewSidebar.js`
- `src/ProductCatalogue/src/shared/routing/workspaceRoute.resolution.test.js`
- `src/ProductCatalogue/src/styles/review.css`

### New files

- `src/ProductCatalogue/docs/package-review-F6C-implementation-report.md`
- `src/ProductCatalogue/src/features/products/domain/packageValidationArtifacts.js`
- `src/ProductCatalogue/src/features/products/domain/workspaceResolutionClaims.js`
- `src/ProductCatalogue/src/features/review/core/reviewPackageSession.test.js`
- `src/ProductCatalogue/src/features/review/domain/reviewWorkUnits.js`
- `src/ProductCatalogue/src/features/review/services/reviewPackageLoader.test.js`
- `src/ProductCatalogue/src/features/review/services/reviewWorkUnitResolver.js`
- `src/ProductCatalogue/src/features/review/testSupport/reviewPackageFixture.js`
- `src/ProductCatalogue/src/features/review/ui/reviewBoard.package.test.js`

### Deleted files

None.

## Suggested commit after local acceptance

```text
feat(product-catalogue): add package-aware review
```
