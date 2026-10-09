# F7A v3 package action sizing and tooltip correction

## Controlled inputs

Repository: S100Services. Frontend: src/ProductCatalogue.
Authoritative baseline: `bd4145e55e614eceae03d9fd732ae15b48c9a09a`.
Both controlled v2 and v3 working trees were reconstructed from the original baseline
ZIP plus the complete verified v2 replacement/new files. No HEAD/main or older candidate
was used as implementation input. Hashes and ZIP CRC integrity were verified before edits.

| Input                                                  | Verified SHA-256                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| Original baseline ZIP                                  | `29DD2AA1D248442E08F25F7076E3407623B2C27095ECF3FDF60D108FEAFB53B5` |
| Original context                                       | `F2E68BA3066E035DBABDFC8AA891970555E35C6491E40D9D45300BCDCA3D8E9E` |
| PC-package-popup-actions-F7A-candidate-v2-bd4145e5.zip | `44EDA29E871A64050B52D13B9F7BD0702B94DBB7BF18D35775A55F34660B10BF` |

## Focused correction

- Public calcite-icon scale changes from s to m for all three package icons. No private
  selectors or component internals are manipulated. The public scale contract is documented
  at https://developers.arcgis.com/calcite-design-system/components/icon/.
- Package-only square hit/focus surfaces change from 32x32px to 40x40px, including fixed
  flex basis and minimum height; padding remains zero. The package row minimum height
  changes to 40px, matching the existing ordinary action-row minimum in application CSS.
  Actual hydrated component geometry was not measured in this environment.
- Order remains Pause/Resume, Discard, Send/Accept, Tools. The existing no-wrap/local-overflow
  layout, Tools right alignment, disabled styling and theme-aware visible focus are unchanged.
  Ordinary Product and Tools sizing/rendering have no production changes.
- Native tooltip root cause was confirmed in controlled v2: popupPackageActionDom.js set
  the package button's HTML title to getHelpText(config). The package factory returns before
  the ordinary Calcite renderer, so its separate title setter does not run for package controls.
  The package icon and application-owned row/bar/help do not introduce title attributes.
- The package title setter is replaced with removeAttribute. An existing title also causes
  reconciliation to apply cleanup when the presentation signature is unchanged. Creation,
  explicit mode changes, regular reconciliation and forced updates therefore remove stale
  native package tooltips while retaining node/focus identity. Ordinary Product, Tools and
  Product Collection native tooltip behavior is preserved.
- The accepted application-owned role=tooltip remains the single visible package help.
  aria-label, aria-description and the active aria-describedby relationship retain complete
  names and truthful unavailable reasons. Hover/focus, hoverable help, Escape, dismissal,
  viewport handling and disposal listeners are unchanged. Explicit Pause/Resume and
  Send/Accept fixtures update the existing control and open help without duplicates.

Package mutations remain blocked. Descriptors still have no dispatch callbacks and the native
renderer still cannot invoke supplied mutation handlers through click, Enter, Space, repeated
or programmatic activation or stale callbacks. Production still defaults to disabled Send and
Pause; it does not infer action modes, eligibility, member counts or scheduling. No backend,
DTO, endpoint, polling, enqueueing, concurrency or workflow integration was added. F7B remains
separate. Accepted source/freshness ownership, popup reconciliation, navigation and workflow
information below the table are unchanged.

## Verification actually executed

Node v24.19.0. Commands ran from src/ProductCatalogue in the reconstructed trees.

| Check                   | Controlled v2                       | Candidate v3                                                                                     |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| Broad node --test       | 1,283 tests; 1,278 passed; 5 failed | 1,285 tests; 1,280 passed; 5 failed                                                              |
| Focused selection below | Not separately rerun                | 228 passed; 0 failed                                                                             |
| node --check            | Not separately rerun                | All 12 baseline-relative changed/new JS files passed; includes both v2-relative changed JS files |

All five failing test names were compared individually and match. Causes are unchanged:

| Failure in both versions                                                                               | Cause                                                                 |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| range controls keep keyboard time editing local until the range interaction commits                    | Existing dashboard source-text regex assertion                        |
| ProductCatalogueAPI registers only the retained source mocks behind the environment/configuration gate | Supplied archive omits ProductCatalogueAPI/Program.cs                 |
| ProductCatalogueAPI embeds only the retained source-specific mock fixtures                             | Supplied archive omits ProductCatalogueAPI/ProductCatalogueAPI.csproj |
| Development mock fixture files normalize to globally unique source datasetNames                        | Supplied archive omits ProductCatalogueAPI mock GeoJSON files         |
| runtime source changes do not republish compatibility filter state                                     | Existing assertion cannot find the expected onLayersChanged callback  |

Focused command:

```sh
node --test src/features/map/popups/*.test.js src/features/products/domain/productContext*.test.js src/features/products/domain/productActionAvailability*.test.js src/features/dataSources/config/dataSourceRegistry.test.js src/features/dataSources/tests/liveEncPackageIntegration.test.js src/features/dataSources/tests/workUnitStatusFilterIntegration.test.js src/features/productCollection/ui/productCollectionNavigation.test.js src/features/timeline/ui/productHistoryPanel.test.js
```

Focused coverage includes scale m, 40px compact surface CSS, no-wrap/right alignment,
action order, no package title on creation or same-signature/forced reconciliation,
obsolete titles injected before actual popup refresh, hover/focus single help, Escape and
listener cleanup, explicit mode synchronization, retained control/focus/help identity,
blocked repeated activation and stale callbacks, no duplicate controls or refresh requests,
and existing Product/Tools/navigation/source/freshness tests. Public DOM/component contracts
are used; no private ArcGIS/Calcite internals.

Not run: npm run format, npm run format:check, npm run lint, npm run build, npm run check,
or real-browser tests. Project node_modules is absent; no dependencies were installed.
Node DOM fixtures do not verify hydrated Calcite pixels, browser-native tooltip suppression,
actual keyboard/screen-reader behavior, light/dark contrast or responsive geometry. The
manual checklist remains necessary; no regression-free browser claim is made.

Historical F7A v1/v2 and all other prior documentation reports were verified byte-identical
to controlled v2. package.json/package-lock.json and accepted action configuration, shared
renderer/reconciliation, presentation/workflow and popup lifecycle files are unchanged.
No new npm dependencies and no commit.

## Complete file inventories

Repository-root-relative paths. The ZIP contains complete replacement/new files against
the original authoritative baseline. There are no deletions.

### Relative to controlled v2

4 changed, 1 new, 0 deleted.

| Status  | Path                                                                                   |
| ------- | -------------------------------------------------------------------------------------- |
| changed | `src/ProductCatalogue/src/features/map/popups/README.md`                               |
| changed | `src/ProductCatalogue/src/features/map/popups/packagePopupActions.integration.test.js` |
| changed | `src/ProductCatalogue/src/features/map/popups/popupPackageActionDom.js`                |
| changed | `src/ProductCatalogue/src/styles/popup.css`                                            |
| new     | `src/ProductCatalogue/docs/package-popup-actions-F7A-v3-correction-report.md`          |

### Relative to original baseline

9 changed, 8 new, 0 deleted.

| Status  | Path                                                                                         |
| ------- | -------------------------------------------------------------------------------------------- |
| changed | `src/ProductCatalogue/src/features/map/popups/README.md`                                     |
| changed | `src/ProductCatalogue/src/features/map/popups/createPopup.js`                                |
| changed | `src/ProductCatalogue/src/features/map/popups/packageFoundation.test.js`                     |
| changed | `src/ProductCatalogue/src/features/map/popups/popupActionBar.js`                             |
| changed | `src/ProductCatalogue/src/features/map/popups/popupActionConfig.js`                          |
| changed | `src/ProductCatalogue/src/features/map/popups/popupActionDom.js`                             |
| changed | `src/ProductCatalogue/src/features/productCollection/ui/productCollectionNavigation.test.js` |
| changed | `src/ProductCatalogue/src/features/timeline/ui/productHistoryPanel.test.js`                  |
| changed | `src/ProductCatalogue/src/styles/popup.css`                                                  |
| new     | `src/ProductCatalogue/docs/package-popup-actions-F7A-implementation-report.md`               |
| new     | `src/ProductCatalogue/docs/package-popup-actions-F7A-v2-correction-report.md`                |
| new     | `src/ProductCatalogue/docs/package-popup-actions-F7A-v3-correction-report.md`                |
| new     | `src/ProductCatalogue/src/features/map/popups/packagePopupActions.integration.test.js`       |
| new     | `src/ProductCatalogue/src/features/map/popups/packagePopupPresentation.js`                   |
| new     | `src/ProductCatalogue/src/features/map/popups/packagePopupPresentation.test.js`              |
| new     | `src/ProductCatalogue/src/features/map/popups/packagePopupWorkflow.js`                       |
| new     | `src/ProductCatalogue/src/features/map/popups/popupPackageActionDom.js`                      |

## Manual browser acceptance

Apply the complete replacement/new files at repository root over the authoritative baseline.
Then run:

```powershell
cd src/ProductCatalogue
npm run format
npm run check
```

1. Pause, Discard and Send icons are visibly larger and proportional to Tools; inspect public
   icon scale m and 40x40px package button surfaces without private component selectors.
2. All package controls remain on one non-wrapping horizontal row.
3. Tools stays right-aligned and opens Analyze, Review and History normally.
4. Hover each package control long enough for a native title tooltip to appear if present:
   exactly one application-owned tooltip; inspect that the package button has no title.
5. Tab through the package controls: full action names and the same unavailable help.
6. Escape dismisses help while keeping focus on its control; subsequent Escape retains popup behavior.
7. Repeat hover/focus and refresh while help is open: no duplicate help, controls or lost focus.
8. Monitor Network while clicking repeatedly and pressing Enter/Space: no package mutation,
   busy state or successful-action notice. Default Send remains the sole Send/Accept control; Accept is not displayed alongside it.
9. Product table, workflow information, Collection, copy, Analyze, Review and History are unchanged.
10. Refresh, delay source updates, switch selection, disable/replace sources and close the popup:
    accepted freshness, stale-response suppression and transient UI cleanup remain intact.
11. Check light/dark and narrow popup widths: compact icons/focus/help, reachable Tools,
    local row scrolling only when needed, no clipping or excessive page overflow.
12. Ordinary Product/compatibility actions, Export/Cancel Export and native tooltips are unchanged.

Suggested commit message after acceptance (no commit created):
`style(product-catalogue): refine package action sizing and tooltips`
