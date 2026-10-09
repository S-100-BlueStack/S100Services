# F7A v2 package popup action correction

## Controlled inputs

Repository: S100Services. Frontend: src/ProductCatalogue.
Authoritative baseline: `bd4145e55e614eceae03d9fd732ae15b48c9a09a`.
The controlled v1 was reconstructed from the original baseline ZIP plus every complete
replacement/new file in the verified v1 ZIP. An independent v2 copy was reconstructed the
same way before editing. HEAD/main was not used. All input hashes and ZIP CRC integrity
were verified before modifications and rechecked before delivery.

| Input                                                  | Verified SHA-256                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| Original baseline ZIP                                  | `29DD2AA1D248442E08F25F7076E3407623B2C27095ECF3FDF60D108FEAFB53B5` |
| Original context                                       | `F2E68BA3066E035DBABDFC8AA891970555E35C6491E40D9D45300BCDCA3D8E9E` |
| PC-package-popup-actions-F7A-candidate-v1-bd4145e5.zip | `25C2B3F786A198F814B4EF40CD876B5F691360E653052721826DB6D36D5060C8` |

## Focused correction

- `package-send-accept` is one stable descriptor/control. Default production rendering is
  unavailable Send. An explicit, validated presentation projection can select Accept and
  update the same node's icon, accessible name, help and operation together. There is no
  separate Accept control. A received or fully approved IC-ENC result does not select Accept.
- `package-pause-resume` retains one stable position and control identity. Pause is the
  production placeholder; only an explicit presentation projection can select Resume.
- The package-only name is Discard, including its accessible name and help. Its existing
  descriptor ID is retained. Ordinary Product Cancel Export and backend terminology are unchanged.
- One action group renders Pause/Resume, Discard, Send/Accept and the existing Tools control.
  The first three are 32px icon-only native buttons containing a public calcite-icon.
  Existing Tools rendering/navigation and its right-side placement are retained.
- The row does not wrap. It fits normal popup widths; exceptionally narrow popups scroll the
  action row locally rather than clipping a control or forcing page-wide overflow. Existing
  theme tokens and visible-focus policy style the disabled icons and keyboard focus.
- Focusable native buttons use aria-disabled=true and independent accessible names.
  Hover and focus show application-owned role=tooltip help containing the full action name
  and truthful unavailable explanation. aria-description and title provide the same explanation.
  Escape dismisses help and leaves focus on the action; subsequent Escape follows existing popup handling.
  Help is hoverable, viewport-bounded, and removes its temporary document/window listeners on
  dismissal, source invalidation/replacement, action removal or popup disposal.
- Keyed reconciliation preserves the control and focused node during valid refresh and explicit
  presentation-mode changes. The previous permanent action explanation panel is removed.
  The accepted workflow information below the Product table is unchanged.

## Fail-closed boundary and F7B dependencies

All package descriptors remain disabled with dispatchImplemented=false and no mutation callbacks.
The native package renderer never installs or invokes a supplied onClick callback, even if a
caller supplies forged enabled/eligibility flags. Click, Enter, Space and programmatic/repeated
activation are blocked; stale/detached controls cannot dispatch or revive help. Tools remains
navigation and does not reuse Product mutation handlers for package actions.

Production does not supply workflowPresentation. Existing Product/member status, candidate
metadata or guessed IC-ENC results do not produce Accept, Resume, eligible counts, scheduled
send dates or outcome text. The optional application-owned presentation projection is inherited
from v1 and exercised only with explicit test fixtures; it is not a new backend DTO contract.
The shared mode change is presentation-ready, not backend-driven in F7A.

F7B must verify authoritative package identity and freshness, Pause/Resume state, the precise
Send/Accept mode (including whether acknowledgement is actually required), eligible members,
optional scheduling/result information, action authorization and mutation contracts before live
integration. F7A v2 adds no dispatch, endpoints, DTOs, enqueueing, polling, simulated success,
client scheduling, inferred workflow state or artificial run/generation identifiers.

Source-aware ProductContext/capability checks, F5 freshness/source-refresh ownership and F6A-F6D
behavior are retained. Ordinary Product action construction/dispatch, workflow rendering and
historical F7A v1/F6 reports remain unchanged. No dependencies or package-lock changes. No commit.

## Verification actually executed

Node v24.19.0. Commands were run from src/ProductCatalogue in independently reconstructed trees.

| Check                                                             | Controlled v1                       | Candidate v2                                   |
| ----------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------- |
| Broad `node --test`                                               | 1,279 tests; 1,274 passed; 5 failed | 1,283 tests; 1,278 passed; 5 failed            |
| Final focused selection below                                     | Not rerun as a separate selection   | 226 passed; 0 failed                           |
| `node --check` on every changed/new baseline JavaScript file      | Not separately rerun                | 12 files passed (9 changed/new relative to v1) |
| Input/archive integrity and historical/dependency byte comparison | Passed                              | Passed                                         |

The five broad failures were compared individually by exact test name and failure cause.
There are no additional failing tests in v2; this is a Node-suite comparison, not a claim of
completed browser acceptance.

| Failure present in both trees                                                                          | Observed cause in both                                                           |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| range controls keep keyboard time editing local until the range interaction commits                    | Existing source-text regex assertion does not match dashboardPage.js             |
| ProductCatalogueAPI registers only the retained source mocks behind the environment/configuration gate | Baseline archive omits src/ProductCatalogueAPI/Program.cs                        |
| ProductCatalogueAPI embeds only the retained source-specific mock fixtures                             | Baseline archive omits src/ProductCatalogueAPI/ProductCatalogueAPI.csproj        |
| Development mock fixture files normalize to globally unique source datasetNames                        | Baseline archive omits ProductCatalogueAPI mock GeoJSON files                    |
| runtime source changes do not republish compatibility filter state                                     | Existing source-text assertion cannot find the expected onLayersChanged callback |

Final focused command:

```sh
node --test src/features/map/popups/*.test.js src/features/products/domain/productContext*.test.js src/features/products/domain/productActionAvailability*.test.js src/features/dataSources/config/dataSourceRegistry.test.js src/features/dataSources/tests/liveEncPackageIntegration.test.js src/features/dataSources/tests/workUnitStatusFilterIntegration.test.js src/features/productCollection/ui/productCollectionNavigation.test.js src/features/timeline/ui/productHistoryPanel.test.js
```

Coverage includes one shared Send/Accept control, production Send without inferred Accept,
explicit mode updates and shared Pause/Resume identity, Discard, icon-only names, non-wrapping
application CSS, hover/focus/Escape help, tooltip hoverability/listener cleanup, forged enabled
flags, repeated click/Enter/Space/programmatic activation, stale callbacks, ordinary Product
and compatibility actions, Tools/Analyze/Review/History, Collection/copy/navigation, focus and
control identity during refresh, source disable/replacement, pending freshness and disposal.
Tests use application-owned DOM and public component properties; no private shadow selectors.

Not executed: npm run format, npm run format:check, npm run lint, npm run build, npm run check,
or manual/automated real-browser checks. Project node_modules is absent; dependencies were not
installed solely for verification. Node DOM fixtures do not validate actual Calcite rendering,
screen-reader/browser behavior, visual theme contrast or popup geometry. These remain local
acceptance checks. No new npm dependencies were introduced.

## Complete file inventories

Paths below are repository-root-relative. The deliverable contains complete replacement/new
files against the original authoritative baseline, not only the v1-to-v2 delta. No files deleted.

### Relative to controlled F7A v1

10 changed, 2 new, 0 deleted.

| Status  | Path                                                                                         |
| ------- | -------------------------------------------------------------------------------------------- |
| changed | `src/ProductCatalogue/src/features/map/popups/README.md`                                     |
| changed | `src/ProductCatalogue/src/features/map/popups/packageFoundation.test.js`                     |
| changed | `src/ProductCatalogue/src/features/map/popups/packagePopupActions.integration.test.js`       |
| changed | `src/ProductCatalogue/src/features/map/popups/packagePopupPresentation.js`                   |
| changed | `src/ProductCatalogue/src/features/map/popups/packagePopupPresentation.test.js`              |
| changed | `src/ProductCatalogue/src/features/map/popups/popupActionBar.js`                             |
| changed | `src/ProductCatalogue/src/features/map/popups/popupActionConfig.js`                          |
| changed | `src/ProductCatalogue/src/features/map/popups/popupActionDom.js`                             |
| changed | `src/ProductCatalogue/src/features/productCollection/ui/productCollectionNavigation.test.js` |
| changed | `src/ProductCatalogue/src/styles/popup.css`                                                  |
| new     | `src/ProductCatalogue/docs/package-popup-actions-F7A-v2-correction-report.md`                |
| new     | `src/ProductCatalogue/src/features/map/popups/popupPackageActionDom.js`                      |

### Relative to original authoritative baseline

9 changed, 7 new, 0 deleted.

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
| new     | `src/ProductCatalogue/src/features/map/popups/packagePopupActions.integration.test.js`       |
| new     | `src/ProductCatalogue/src/features/map/popups/packagePopupPresentation.js`                   |
| new     | `src/ProductCatalogue/src/features/map/popups/packagePopupPresentation.test.js`              |
| new     | `src/ProductCatalogue/src/features/map/popups/packagePopupWorkflow.js`                       |
| new     | `src/ProductCatalogue/src/features/map/popups/popupPackageActionDom.js`                      |

## Local manual acceptance

Apply complete replacement/new files at repository root over the original baseline, then run:

```sh
cd src/ProductCatalogue
npm run format
npm run check
```

1. Open an ENC package popup: one compact icon-only action row.
2. Pause, Discard and Send appear as visibly unavailable icons.
3. Accept is not displayed beside Send; no unverified member count or concrete scheduled date.
4. Tools remains correctly placed; Analyze, Review and History open normally.
5. Hover and Tab focus expose each complete name and unavailable reason; tooltip is hoverable.
   Escape dismisses help without moving focus; subsequent Escape retains existing popup behavior.
6. With Network monitoring, click repeatedly and press Enter/Space on all three controls:
   no mutation request, busy state or success notice; programmatic activation also has no dispatcher.
7. Product table, workflow information below it, History, Analyze, Review, Collection and copy
   retain accepted behavior.
8. Refresh while an icon has keyboard focus; delay source updates and change/disable/replace
   sources, then close/destroy the popup. No duplicates, stale help, flashing or extra refresh requests.
9. Verify light/dark themes and narrow widths: legible icons/focus/help, one row, reachable Tools,
   no clipped controls or excessive page overflow.
10. Verify ordinary Product and compatibility-source actions and Export/Cancel Export workflows.

Suggested commit message after local acceptance (no commit created):
`style(product-catalogue): compact package popup actions`
