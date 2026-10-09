# F7A package popup action presentation

## Controlled input and scope

Authoritative commit: `bd4145e55e614eceae03d9fd732ae15b48c9a09a` (accepted F6D).
No repository commit was created. No private repository/network retrieval or dependency installation was attempted.
Previous candidate: none; this is v1 against the supplied committed frontend.

Independently verified inputs:

| Input        | SHA-256                                                            |
| ------------ | ------------------------------------------------------------------ |
| Baseline ZIP | `29DD2AA1D248442E08F25F7076E3407623B2C27095ECF3FDF60D108FEAFB53B5` |
| Context      | `F2E68BA3066E035DBABDFC8AA891970555E35C6491E40D9D45300BCDCA3D8E9E` |

ZIP CRC/integrity check succeeded. The archive contains 612 entries, including
498 files and 114 directory entries. All 78 selected context blocks exist in the
archive and match its content after normalizing extraction line endings, trailing
newlines and the UTF-8 BOM omitted in six context CSS blocks. The archive's actual
files were used as implementation input; no file was reconstructed from context.

F7A is frontend presentation only. The actual Main-map popup displays the disabled
package action foundation. It does not connect package mutations, introduce a
backend read/action contract, or change the accepted F6A-F6D workspaces/history.

## Complete file inventory

All paths are relative to the repository root. ZIP entries are complete files.

| Kind    | File                                                                                         |
| ------- | -------------------------------------------------------------------------------------------- |
| Changed | `src/ProductCatalogue/src/features/map/popups/createPopup.js`                                |
| Changed | `src/ProductCatalogue/src/features/map/popups/popupActionConfig.js`                          |
| Changed | `src/ProductCatalogue/src/features/map/popups/popupActionBar.js`                             |
| Changed | `src/ProductCatalogue/src/features/map/popups/popupActionDom.js`                             |
| Changed | `src/ProductCatalogue/src/features/map/popups/packageFoundation.test.js`                     |
| Changed | `src/ProductCatalogue/src/features/map/popups/README.md`                                     |
| Changed | `src/ProductCatalogue/src/features/productCollection/ui/productCollectionNavigation.test.js` |
| Changed | `src/ProductCatalogue/src/features/timeline/ui/productHistoryPanel.test.js`                  |
| Changed | `src/ProductCatalogue/src/styles/popup.css`                                                  |
| New     | `src/ProductCatalogue/src/features/map/popups/packagePopupPresentation.js`                   |
| New     | `src/ProductCatalogue/src/features/map/popups/packagePopupWorkflow.js`                       |
| New     | `src/ProductCatalogue/src/features/map/popups/packagePopupPresentation.test.js`              |
| New     | `src/ProductCatalogue/src/features/map/popups/packagePopupActions.integration.test.js`       |
| New     | `src/ProductCatalogue/docs/package-popup-actions-F7A-implementation-report.md`               |

Deleted files: none. Nine changed files and five new files. The Collection and
History changes are test-only: the assertions now locate Tools by ID rather than
assuming it is the only package action, and navigation fixtures provide a connected
anchor for the new stale-session guard. No Collection or History production file changed.

## Presentation and capability architecture

`popupActionConfig.js` selects the package branch through the resolved context's
registry work-unit declaration, before accessing Product-operation availability,
legacy send capability or Product mutation descriptor constructors. There is no
source-name, dataset-prefix, member-status or candidate-presence branching.

`packagePopupPresentation.js` accepts explicit presentation inputs and returns
plain descriptors/summary data. Its current-context guard re-resolves the supplied
or context-owned Graphic through the existing ProductContext boundary and verifies
source/type/Product identity, visibility, collection membership, canonical member
order, unique keys/sources and noncontradictory current member identities.
Unknown or malformed inputs fail closed. Missing current member metadata remains
missing rather than being inferred from representative values.

The package action layout uses two wrapping rows:

- Pause/Resume slot and Discard export;
- Send, Accept and the established Tools control.

The stable IDs are `package-pause-resume`, `package-discard-export`, `package-send`
and `package-accept`. Pause and Resume share a DOM identity. Send and Accept remain
separately discoverable in F7A; future presentation can mark either as primary
without changing their presence/order. Package rows reconcile by action ID.
Ordinary Product rows keep their original positional reconciler.

Each descriptor separates these concerns:

| Concern                   | Live F7A behavior                                                 |
| ------------------------- | ----------------------------------------------------------------- |
| Static registry work unit | Admits the package presentation, not legacy mutation capabilities |
| `frontendSupported`       | `true`: the package control can be presented                      |
| `backendAuthorized`       | `null`: no authoritative action-read model is connected           |
| `dispatchImplemented`     | Literal `false`, irrespective of input                            |
| `disabled`                | Literal `true`                                                    |
| Mutation `onClick`        | Absent                                                            |

Actual live labels are Pause, Discard export, Send and Accept. Pause's help text
explicitly states that its actual state is unavailable. Send has no fabricated
count. There is no live paused value, timestamp, outcome or acknowledgement flag.
Each disabled control explains its future meaning and unavailable state. A visible,
focusable explanation is independent of disabled Calcite tooltips.

The optional `workflowPresentation` parameter belongs only to the presentation
helper. It is not a public DTO, Graphic field, API payload or live integration.
Fixtures can supply verified identity, explicit paused state, primary action,
exact eligible member identities, action-eligibility booleans, a timezone-qualified
valid timestamp and acknowledgement outcome text. Contradictory member identities
invalidate this projection. No accepted projection can create a callback or enable
action dispatch. Invalid timestamps are omitted; no date is calculated.

## Source data and workflow summary ownership

`createPopup.js` reads its existing generation-owned `currentAttributes`. The new
summary consumes only `workUnitStatus.workflowStatus`; it receives the existing
status lookup labels explicitly. A normalized status with a known lookup label is
presented as Package workflow information. Unknown status displays an unavailable
message. Neither a status nor its label authorizes an action or establishes Pause.

`workUnitMetadata` is used only for member-identity validation and the unchanged
member table. `exportMetadata` continues to overlay the matching member's candidate
values/errors/artifacts through the existing metadata helper. Neither field nor the
number of declared members determines Send count or authorization.

`packagePopupWorkflow.js` owns a small application DOM sibling after the existing
member-table section. Its own signature allows workflow-only changes to update text
without replacing the member table. No permanent Current/Candidate columns or broad
cards are introduced. CSS uses popup theme tokens and wrapping package-only rows.
No private Calcite/ArcGIS DOM or undocumented component styling is used.

## Positive dispatch isolation and lifecycle evidence

The package branch returns before any existing Freeze, legacy Send simulation,
Export or Cancel Export callback is constructed. Every package mutation descriptor
has no `onClick`, is disabled and has `dispatchImplemented: false`, including fixtures
that claim readiness or supply an unexpected dispatch flag. Existing registry
Product mutation capabilities remain false. No backend/API/service file changed.

The production `createPopup` integration test records mocked fetch calls and accepts
only existing status lookup, package freshness and Product-detail GETs. Disabled
click/keyboard interaction, repeated source publication and summary updates do not
add requests. Old upload/freeze/unfreeze/export/rollback/job paths and invented
package endpoints cannot be reached through these package descriptors.

The existing connected popup remains the sole lifecycle owner. Source publication
still increments `latestRefreshId`; older detail results cannot update metadata or
summary. The existing `packagePopupSnapshot` guards source/layer object identity,
visibility, identity and Graphic membership. F7A adds no poller, timer, event bus,
global workflow store, retry or browser persistence. The one existing 30-second
freshness interval and network-free source bridge remain in use.

Invalid package rendering/publication clears that session's DOM/error overlay,
closes its dropdown through existing cleanup and stops/unregisters freshness/bridge
work. Disconnect also clears package action rows; delayed detail cannot restore the
session. Package Tools checks the connected action host/current source before opening
its menu and rechecks the connected anchor/current context before navigation. Ordinary
Product action callbacks and dropdown mechanics retain their existing behavior.

Same-state reconciliation retains action hosts and the open Tools dropdown. A
workflow-only update retains the member table, error overlay and application focus.
The integration tests exercise actual production owners with a small public-DOM
and fetch test double. They prove DOM identity retention; real browser text selection,
Calcite keyboard behavior, layout and theme appearance still require manual acceptance.

## F7B integration boundary

Before enabling any package action, separately verify the current backend contracts
and map them through a reviewed adapter. Required gaps include:

- canonical package/member mapping, workflow/run identity and generation/revision IDs;
- authoritative paused flag and preserved planned-send timestamp;
- exact eligible member identities/count and whole-package processing completion;
- per-run Pause/Resume, Discard, Send and Accept permissions;
- acknowledgement outcomes and which candidates will/will not be committed;
- atomic package-scoped dispatch, safe stale/conflict/authorization failures and
  idempotency/duplicate-delivery protection;
- refreshed backend read state after successful and rejected mutations.

F7B must implement a dispatcher explicitly. Changing a readiness flag is insufficient.
Pause must continue to allow internal processing; candidate replacement while paused
must preserve Pause and the earlier planned timestamp. Discard affects both candidates
before delivery and cannot reuse Product Rollback. Accept acknowledges results and
allows completion; it does not approve a failed Product or substitute for Send.
No executable package confirmation dialog is added in F7A.

## Executed verification

Runtime: Node.js `v24.19.0`. Tests used only supplied source and available built-ins.

| Check                                       | Result                          |
| ------------------------------------------- | ------------------------------- |
| Untouched baseline `node --test`            | 1,264 tests: 1,259 pass, 5 fail |
| Final candidate `node --test`               | 1,279 tests: 1,274 pass, 5 fail |
| Focused suites                              | 222/222 pass                    |
| `node --check` on every changed/new JS file | 11/11 pass                      |

The broad failure names match exactly between baseline and final candidate:

1. `range controls keep keyboard time editing local until the range interaction commits`
2. `ProductCatalogueAPI registers only the retained source mocks behind the environment/configuration gate`
3. `ProductCatalogueAPI embeds only the retained source-specific mock fixtures`
4. `Development mock fixture files normalize to globally unique source datasetNames`
5. `runtime source changes do not republish compatibility filter state`

Three failures reference backend files absent from the frontend-only archive. The
Dashboard range and runtime-source contract assertions also fail on the untouched
baseline. These failures were not hidden, removed or fixed as part of F7A.
The final candidate adds 15 passing tests and introduces no new broad failure name.

Focused command, run from `src/ProductCatalogue`:

```bash
node --test src/features/map/popups/*.test.js src/features/products/domain/productContext*.test.js src/features/products/domain/productActionAvailability*.test.js src/features/dataSources/config/dataSourceRegistry.test.js src/features/dataSources/tests/liveEncPackageIntegration.test.js src/features/dataSources/tests/workUnitStatusFilterIntegration.test.js src/features/productCollection/ui/productCollectionNavigation.test.js src/features/timeline/ui/productHistoryPanel.test.js
```

Focused coverage includes package presentation/readiness forgery, unknown values,
exact future Send count fixtures, malformed identity, status-only summary, actual
popup/table/error-overlay/focus/dropdown retention, stale detail/source publications,
close/source replacement/disable/Graphic removal, existing Product dispatch/config,
source-aware capabilities, F1/F2 integration, Collection and F6D History navigation.
The broad run also includes the existing F3 and F6A-F6C suites.

Not run: `npm run format`, `format:check`, `lint`, Vite build or `npm run check`.
Project `node_modules` is absent; dependencies were not installed. No actual browser,
live backend or .NET restore/build/test verification was performed.

Run authoritative local verification after applying complete replacement files:

```bash
cd src/ProductCatalogue
npm run format
npm run check
```

## Manual browser acceptance walkthrough

1. Open an ENC-package popup. Check ordered S-101/S-57 columns, compact package
   action area and short workflow context below the table. Test Tools Analyze,
   Review, History, Product Collection and copy.
2. Check discoverable but unavailable Pause/Resume, Discard export, Send and Accept.
   No live Send count or timestamp should appear. No package Export, Freeze or
   legacy Cancel Export should appear.
3. Click/use keyboard on unavailable controls and inspect Network. There must be no
   upload/freeze/unfreeze, rollback, send simulation, job enqueue or invented package
   request. Tab to the on-screen explanation independently of disabled buttons.
4. Exercise supported simple/compatibility Products and available mock fixtures.
   Preserve existing action configuration/reasons, Product job polling, Export menus
   and notices. Retired mocks need not become runtime-selectable for this test.
5. Refresh the Main map while the package popup remains open, including F5 revision
   detail refresh. Verify no additional polling/request flow, no popup flashing,
   retained focus/text selection and unchanged error overlay when metadata is unchanged.
6. With focus/menu open, test close, Escape, source disable/enable/replacement,
   Graphic removal, rapid selection changes and delayed responses. No stale package
   UI, menu callback or mutation may survive.
7. Test narrow widths, long dataset names, light/dark colors, wrapping/overflow,
   visible focus outlines and readable/accessible workflow/unavailability text.
8. Regression-check F6B Analyze and mixed-status hatching, F6C Review, F6D floating
   History and Product Collection. No package mutation occurs on any surface.

## Delivery and acceptance

Dependencies/backend/configuration/lockfile changes: none. Deleted files: none.
Known uncertainties are the unreviewed F7B backend contracts and unexecuted real
browser/full local checks. The candidate ZIP checksum is supplied in the delivery
response so it describes the final archive without a circular self-hash.

Suggested commit message after local acceptance:

```text
feat(product-catalogue): prepare package popup workflow actions
```
