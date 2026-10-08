# F6C v2 — Review visual hierarchy correction

## Controlled input and scope

- Authoritative repository baseline: `462776d5aef68cf71cb784506c580b82c97f1dcc`.
- Controlled F6C v1 ZIP SHA-256: `6D98C27BF4A87E8982BD87E74562523E915CF72D76CFC7A7117C3A7E21E159AA` (verified).
- The working tree was reconstructed from the supplied baseline and the exact controlled v1 ZIP.
- The user manually accepted v1 functionality. This correction preserves that implementation.
- No commit, backend changes, new dependencies, dependency installation or routing changes.

## Root cause and correction

Member headings and summaries were separate, unfilled text nodes with uneven spacing against the
column surface. Inner section headers used the same surface as their bodies, weakening visual grouping.

`reviewBoard.js` now places each unchanged member title and summary inside one public application-owned
`pc-review-member__header`. `review.css` applies the existing `--pc-surface-alt` background, a compact
7px by 10px inset, a 2px title/summary gap and a bottom separator. The title retains its size and left
alignment, with a stronger weight. Metadata wraps inside the same header block.

Package member History, IC-ENC and Internal validation headers use a subtler 56% mix of the existing
alt and base surfaces. Their existing controls, labels, counts, grid and 10px horizontal padding remain
in place. Member spacing is consolidated; the next member retains a compact 8px separation.
There are no rounded panels, animations, private component selectors or changes to ordinary headers.

No functional Review behavior changed. The only production JavaScript change adds a header wrapper;
the title and summary text expressions are unchanged. All data, session, loading, ownership, actions,
keyboard/focus rules, scroll owners, content bodies and non-Review production files are byte-identical
to controlled v1. Existing theme text, surface, border and focus tokens remain in use.

## Verification actually run

Runtime: Node.js `v24.19.0`.

| Check                                          | Controlled v1                       | v2                                                                                                  |
| ---------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| Broad `node --test`                            | 1,205 tests; 1,200 passed; 5 failed | 1,205 tests; 1,200 passed; 5 failed                                                                 |
| `node --test src/features/review/ui/*.test.js` | Not rerun separately                | 18 passed; 0 failed                                                                                 |
| `node --check`                                 | Not rerun separately                | Both v1-relative changed JS files passed; all 27 baseline-relative changed/new JS files also passed |

Commands were run from `src/ProductCatalogue`. The stable package board test now verifies the public
member header groups exactly the existing title and metadata, preceding the independent content cards.
Existing tests cover the two-member/ordinary column structure, shared toggles, retained refresh warning,
unrelated History disclosure and scroll state, content links and Review control snapshots.

The broad failure profile is unchanged. Both actual runs failed these same five tests:

- Development mock fixture files normalize to globally unique source datasetNames
- ProductCatalogueAPI embeds only the retained source-specific mock fixtures
- ProductCatalogueAPI registers only the retained source mocks behind the environment/configuration gate
- range controls keep keyboard time editing local until the range interaction commits
- runtime source changes do not republish compatibility filter state

The backend fixture/project-file failures arise from files omitted from the supplied frontend archive.
The range-control and runtime-source callback assertions also fail in controlled v1. No unrelated fixes
were attempted. The historical v1 report records the same five failures against the original baseline;
that original baseline suite was not rerun for this visual correction.

## Checks not run and limitations

`npm run check`, Prettier, ESLint and Vite build were not run: project `node_modules` is absent.
`npm install` was not run. No backend build/test or authenticated browser check was run. Automated Node
tests verify application structure and behavior, not actual pixel layout, theme contrast or browser
focus rendering. Light/dark and narrow-layout visual acceptance remains manual. No full-check or
browser-pass claim is made. The original v1 report is retained unchanged as a historical record.

## Manual browser acceptance

1. Open a package in Review with all content types enabled. Confirm one row and column, ordered
   S-101/S-57 sections, compact filled member headers and the unchanged summaries inside those headers.
2. Check History, IC-ENC reports and Internal validation: subtle aligned header strips, unchanged
   counts/availability and usable Open all/Collapse all. Verify disclosure and artifact links.
3. Switch between light and dark themes. Check text contrast, separators, hover affordances and visible
   keyboard focus on controls against the new strips.
4. Use a narrow viewport and long member names. Verify wrapping, horizontal/vertical scrolling, keyboard
   navigation, Escape and retained History disclosure behavior without clipped controls.
5. Recheck shared content toggles, package refresh, disable/enable/remove and an ordinary Product beside
   the package. Confirm accepted Analyze mixed-status hatching remains unchanged.

In the normal checkout with dependencies already available, run:

```text
cd src/ProductCatalogue
npm run check
```

## Exact files changed relative to controlled v1

### Changed

- `src/ProductCatalogue/src/features/review/README.md`
- `src/ProductCatalogue/src/features/review/ui/reviewBoard.js`
- `src/ProductCatalogue/src/features/review/ui/reviewBoard.package.test.js`
- `src/ProductCatalogue/src/styles/review.css`

### New

- `src/ProductCatalogue/docs/package-review-F6C-v2-correction-report.md`

### Deleted

None.

## Full inventory relative to the authoritative baseline

22 changed, 10 new, 0 deleted. All listed files are complete replacement/new files at repository-relative paths; the ZIP overlays onto the authoritative baseline.

### Changed

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

### New

- `src/ProductCatalogue/docs/package-review-F6C-implementation-report.md`
- `src/ProductCatalogue/docs/package-review-F6C-v2-correction-report.md`
- `src/ProductCatalogue/src/features/products/domain/packageValidationArtifacts.js`
- `src/ProductCatalogue/src/features/products/domain/workspaceResolutionClaims.js`
- `src/ProductCatalogue/src/features/review/core/reviewPackageSession.test.js`
- `src/ProductCatalogue/src/features/review/domain/reviewWorkUnits.js`
- `src/ProductCatalogue/src/features/review/services/reviewPackageLoader.test.js`
- `src/ProductCatalogue/src/features/review/services/reviewWorkUnitResolver.js`
- `src/ProductCatalogue/src/features/review/testSupport/reviewPackageFixture.js`
- `src/ProductCatalogue/src/features/review/ui/reviewBoard.package.test.js`

### Deleted

None.

## Suggested English commit message

```text
style(product-catalogue): clarify package review headers
```

No commit was created. The ZIP SHA-256 is provided externally to avoid embedding a circular self-hash.
