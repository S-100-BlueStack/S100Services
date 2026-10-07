# ENC-package frontend foundation

## Baseline and scope

Authoritative baseline: `355c0596cea30df059ee729835f3fc3565ff1ea0`.

Verified input SHA-256:

- Archive: `955208039EEF540CBD65055ABC50D8500D9411D7BE72DF74CF2DF6D85031AE0E`
- Context: `54D5F018FB57554EFEEB324F8D8FB0EBF155386B216D9E8F25C90B1B7AAD05EE`

Both match the supplied manifest. The committed package workflow specification is authoritative;
the attached discovery report is guidance. This candidate implements the first frontend foundation,
not the complete package workflow demo. No commit was created.

## v2 navigation correction

Controlled v1 input SHA-256:
`57C775B5BB366ACC98FEC600E4F2DBDCDA8CD3DA47620E5BCDE14647EFAC33B8`.

The v1 ZIP was verified, overlaid onto the baseline, and confirmed byte-identical to the existing
v1 working copy before creating v2. This correction changes only package-originated navigation.
The source `workUnit.navigationCapabilities` declares Analyze/Review/History unavailable. Resolved
Main-map contexts apply those restrictions; direct product-based workspace contexts retain the source
contract and S-57 registry compatibility. Popup Tools contains no remaining package navigation.

Collection stores only immutable Analyze/Review permission booleans from the resolved ProductContext.
Its stable identity, one-item package representation and reconciliation/removal rules are unchanged.
Each bulk destination requires explicit permission from every item; missing permission or one
unsupported item disables the whole action, including mixed collections. Buttons remain visible with
truthful English help text. Dispatch rechecks the current collection before building a route, so stale
callbacks cannot launch a previously supported subset. Existing simple/compatibility routes retain
canonical composition. No source IDs, labels, prefixes or member names drive Collection policy.

## Architecture

The registry retains technical provider `s101`, its product type, dataset/product key, layer identity,
geometry and DisplayScale. F4 changes its AOI request to `electronicproducts/aoi?layer=ENC`.
Its provisional label is `ENC-package`. One representative
Graphic remains one search/overlap/hover/Collection item. No child Graphics or additional Collection
store are introduced. Generation ownership, guarded commit, in-place Graphic reconciliation, filter
provider IDs and source-aware resolution are unchanged.

The registry's immutable `workUnit` declares `kind`, `primaryMemberKey` and ordered `members` with
`key`, `label` and `exportStandard`. Resolved Main-map Product contexts expose that declaration.
The metadata projection uses these fields rather than source-name branches. Simple and workspace
contexts keep their existing single-product projection.

S-57 remains available through the declarative targeted workspace-resolution contract, without a bulk loader,
but is neither selectable nor selection-persistable on Main map. Existing persistence sanitization
removes its stored Main-map ID. Existing startup recovery selects the eligible `s101` fallback for
old S-57-only/all-off selections. Configured-out persistable source intent, startup generation guards,
failed-load retry intent and in-session all-off behavior remain intact. No storage schema change is
needed. Multi-source lifecycle tests use generic selectable fixtures to retain their original race
assertions independently of the production source consolidation.

## Popup

Ordered columns are S-101 and S-57. Existing related normalized `exportMetadata` provides the displayed
candidate values over normalized current member metadata. Both current identities and versions
come from the backend. Absent member metadata remains empty. Metadata aliases remain at the
source boundary (`S100` is the existing normalized S-101 export metadata key).

Only Status value cells use the existing status palette. Text remains visible and theme-dependent;
unknown statuses receive no invented color. Error values become native `Error` buttons. Hover/focus
exposes full plain text in a small application-owned overlay; click or Enter/Space activation pins and
focuses it. Text is selectable/copyable without table reflow. The overlay is viewport-clamped and
scrollable, outside popup content clipping. Escape/Close restores trigger focus. Outside pointer/focus
closes without stealing focus. Popup disposal removes the overlay and global listeners.

Metadata signatures preserve controls and selected error text across unrelated action/job updates.
Changed metadata closes obsolete details and restores the focused member's control, or the metadata
section if its error disappeared. The generic table renderer consumes column presentation metadata;
it contains no S-101/S-57 source branching or private Calcite/ArcGIS DOM access.

## F1 package Status filter foundation

The package registry configures an optional `readValues` strategy on its Status field. The generic
filter service reads one or more logical values per Graphic, deduplicates values within that Graphic,
and matches any selected Status value. Package workflow status and individual member Product statuses
therefore share one Status dimension with OR semantics. A Graphic contributes at most one count to
each facet and one count to the provider's visible total. Display scale and other active dimensions
still combine using AND. Search, hover, selection and Collection retain the one representative
Graphic and stable identity.

The application-owned normalized input is `graphic.attributes.workUnitStatus` with
`{ workflowStatus, members: [{ key, status }] }`. The pure projector returns ordered unique values;
missing member statuses contribute nothing. F4 maps live `Package.S101` and `Package.S57` state
into registry-ordered members with authoritative dataset names and explicitly normalized ProductState
IDs. `workflowStatus` comes only from top-level `Attributes.Status`, which the backend projects into
ProductStatus; raw EncPackageStatus IDs are never filter values. F1 and F3 consume this existing shape
without semantic changes. Incomplete/unknown member state omits the projection and preserves scalar
fallback. Contradictory identities reject the payload; no S-57 name/status is inferred. Persisted filter
snapshots stay version 2 with provider-scoped logical values, independent of which member matched.

## F2 mixed-status AOI rendering foundation

The [F2 rendering foundation](package-mixed-status-rendering.md) adds a separate member-only rendering
projection. It deliberately does not reuse F1's workflow-plus-member filter values: package workflow
status cannot change the map symbol. The package layer declaratively opts into member-aware polygon
symbolization, while simple sources keep scalar symbols. Initial transformation and later attribute
refreshes use one centralized resolver, and source reconciliation retains the representative Graphic.

Two or more distinct supplied member statuses produce one public multi-layer CIM polygon symbol using
the existing status palette: one deterministic member status supplies a translucent base fill and the
other distinct statuses supply colored hatch stripes. This keeps all supplied Product status colors
visible without assigning a visual direction to S-101 or S-57. Absent member state falls back to the
existing scalar status. F4 supplies live member statuses, so differing members automatically render
mixed while equal members render scalar. No fabricated state, child Graphic, additional layer or
Product-detail request is introduced. The retained DevTools helper is diagnostic only. The symbol choice
remains a candidate until representative browser/performance testing in light and dark themes is
accepted.

## Capability boundary and deferred work

The package registry source disables Freeze, Unfreeze, Send, Cancel Export, popup Export, Edition and
Update capabilities and exposes no manual export leaves. Existing action/dispatch gating prevents
these operations. Read refresh, Collection and source-aware identity remain. Main-map package Tools
no longer exposes Analyze or History. Collection Analyze/Review stays disabled for packages and mixed
collections containing any unsupported item until package-aware destinations exist.
The existing mutation restrictions also apply to contexts built from that source in deferred workspaces;
this task does not introduce package layouts or package mutation routes there.

No backend source, API contract, migration, status enum, transport or job is changed. No dependencies
or lockfiles are changed. No fabricated package state or demo-state infrastructure is introduced.

Deferred: package lifecycle actions Pause/Resume/Discard/Send/Accept;
scheduling; final mixed-status symbol acceptance; Analyze/Review/Dashboard package UX. Live member state
now feeds F1/F2/F3 through `workUnitStatus`. Popup columns still use their accepted metadata boundary;
F4 does not add a broad popup/action model. Targeted Product-based Analyze/Review is unchanged and
package-originated Analyze/Review/History remains unavailable.

## Verification

- Focused Node regression run: 46 test files, 315 tests passed, 0 failed.
- Full `node --test --test-reporter=tap`: 921 tests, 919 passed, 2 failed.
- The same two failures reproduce against the untouched baseline in an 8-test targeted run
  (6 passed, 2 failed). They are CRLF-sensitive source-text assertions in
  `dashboardPage.presentation.test.js` and `runtimeSourceFilterIsolation.test.js`.
  Neither their tests nor the source files they inspect were modified.
- `node --check` passed for all 17 changed/new JavaScript files relative to baseline (7 relative to v1).
- `npm run check` was attempted and stopped at `format:check`: `prettier: not found`.
  Project `node_modules` is absent. No dependencies were installed. Formatting, ESLint and Vite build
  have not been verified here. Node tests were run independently of the unavailable check pipeline.
- No live API or browser acceptance test was performed. DOM behavior tests use application-owned
  test doubles; they do not establish actual ArcGIS layout, browser focus or visual acceptance.

Before local acceptance:

```powershell
cd src/ProductCatalogue
npm run format
npm run check
```

## Manual acceptance

1. Start with existing schema-2 source selection containing only `s57`. Reload: one `ENC-package`
   source should load through `electronicproducts/aoi?layer=ENC`. No S57 Main-map AOI/layer should load. Reload
   again and confirm the persisted selection is `s101`. Also check existing `s101` filter preferences.
2. Verify Product search, overlap selection, hover and popup all select the same representative
   Graphic. Toggle scale hiding and its DisplayScale behavior. Refresh with a selected Graphic and
   confirm stable selection and Collection identity; disabling/re-enabling retains lifecycle rules.
3. Add the representative package repeatedly through the popup header. Collection contains one item,
   never one item per child. Refresh/reconciliation must not duplicate it.
4. With real related export metadata, verify ordered S-101/S-57 independent versions and states.
   With no active exports, both members use normalized current Product data. Candidate values
   must not create extra Current/Candidate columns.
5. In light and dark themes, verify only Status cells are tinted and text remains legible. Test an
   error longer than the popup width: hover, Tab focus, Enter/Space, select/copy, scroll, Close,
   Escape and outside click/focus. Confirm no table expansion and only one error overlay at a time.
6. While details are open, refresh, switch selected Product, close the popup and deactivate the source.
   No detached overlay/listeners or stale error text should remain. Unchanged metadata during a job
   update should retain focused controls and selected text. Test near viewport edges and at zoom.
7. Confirm no package Freeze/Unfreeze, Send, Cancel Export or manual Export UI, and no corresponding
   mutation network requests. Existing simple-source/compatibility and product-based workspace
   read workflows should retain their contracts; S-57 workspace resolution remains available.
8. Verify package popup has no Analyze/History/Tools navigation, while Collection add/remove and copy
   behavior remain. Package-only and mixed collections show disabled Analyze/Review buttons with
   truthful help text and cannot launch a route. Remove the unsupported package: supported simple
   items should regain both actions. Direct product-based Analyze/Review and S-57 compatibility
   remain available. No package item is split or silently omitted from a bulk action.

Suggested commit message:

```text
fix(product-catalogue): block unsafe package navigation
```

## Files changed/new relative to v1

No deleted files.

- `src/ProductCatalogue/docs/enc-package-frontend-foundation.md`
- `src/ProductCatalogue/src/features/dataSources/README.md`
- `src/ProductCatalogue/src/features/dataSources/config/dataSourceRegistry.js`
- `src/ProductCatalogue/src/features/map/popups/README.md`
- `src/ProductCatalogue/src/features/map/popups/packageFoundation.test.js`
- `src/ProductCatalogue/src/features/productCollection/README.md`
- `src/ProductCatalogue/src/features/productCollection/domain/productCollectionNavigation.js` (new)
- `src/ProductCatalogue/src/features/productCollection/state/productCollectionStore.js`
- `src/ProductCatalogue/src/features/productCollection/ui/productCollectionNavigation.test.js` (new)
- `src/ProductCatalogue/src/features/productCollection/ui/productCollectionTray.js`
- `src/ProductCatalogue/src/features/products/domain/productContext.js`
- `src/ProductCatalogue/src/styles/product-collection.css`

## Full files changed/new relative to baseline

No deleted files.

- `src/ProductCatalogue/docs/enc-package-frontend-foundation.md` (new)
- `src/ProductCatalogue/src/features/dataSources/README.md`
- `src/ProductCatalogue/src/features/dataSources/config/dataSourceRegistry.js`
- `src/ProductCatalogue/src/features/dataSources/config/dataSourceRegistry.test.js`
- `src/ProductCatalogue/src/features/dataSources/domain/dataSourcePersistence.test.js`
- `src/ProductCatalogue/src/features/dataSources/services/dataSourceController.test.js`
- `src/ProductCatalogue/src/features/map/popups/README.md`
- `src/ProductCatalogue/src/features/map/popups/createPopup.js`
- `src/ProductCatalogue/src/features/map/popups/packageFoundation.test.js` (new)
- `src/ProductCatalogue/src/features/map/popups/popupErrorDetails.js` (new)
- `src/ProductCatalogue/src/features/map/popups/popupErrorDetails.test.js` (new)
- `src/ProductCatalogue/src/features/map/popups/popupProductMetadata.js`
- `src/ProductCatalogue/src/features/map/popups/popupProductStatusCell.js` (new)
- `src/ProductCatalogue/src/features/productCollection/README.md`
- `src/ProductCatalogue/src/features/productCollection/domain/productCollectionNavigation.js` (new)
- `src/ProductCatalogue/src/features/productCollection/state/productCollectionStore.js`
- `src/ProductCatalogue/src/features/productCollection/ui/productCollectionNavigation.test.js` (new)
- `src/ProductCatalogue/src/features/productCollection/ui/productCollectionTray.js`
- `src/ProductCatalogue/src/features/products/domain/productContext.js`
- `src/ProductCatalogue/src/features/products/tests/normalizedWorkflow.test.js`
- `src/ProductCatalogue/src/features/products/tests/s101Terminology.contract.test.js`
- `src/ProductCatalogue/src/styles/popup.css`
- `src/ProductCatalogue/src/styles/product-collection.css`

## Focused test invocation

Executed from `src/ProductCatalogue`:

```sh
node --test --test-reporter=tap \
  src/features/dataSources/config/dataSourceRegistry.test.js \
  src/features/dataSources/domain/dataSourcePersistence.test.js \
  src/features/dataSources/domain/dataSourceStartupSelection.test.js \
  src/features/dataSources/domain/productIdentity.test.js \
  src/features/dataSources/map/dataSourceMapAdapter.sourceAware.test.js \
  src/features/dataSources/map/dataSourceMapAdapter.test.js \
  src/features/dataSources/map/reconcileSourceInteractions.test.js \
  src/features/dataSources/services/dataSourceController.test.js \
  src/features/dataSources/services/dataSourceNormalizer.test.js \
  src/features/dataSources/services/dataSourceProductStateCoordinator.test.js \
  src/features/dataSources/services/dataSourceRefreshCoordinator.normalized.test.js \
  src/features/dataSources/services/dataSourceRefreshCoordinator.test.js \
  src/features/dataSources/tests/dataSourceFilterSearchContracts.test.js \
  src/features/dataSources/tests/dataSourceIntegrationContracts.test.js \
  src/features/dataSources/tests/developmentMockEndpoints.test.js \
  src/features/dataSources/tests/developmentMockIdentity.test.js \
  src/features/map/popups/cancelExportTerminology.contract.test.js \
  src/features/map/popups/packageFoundation.test.js \
  src/features/map/popups/popupActionConfig.sourceAware.test.js \
  src/features/map/popups/popupActionConfigSignature.test.js \
  src/features/map/popups/popupBackendSync.test.js \
  src/features/map/popups/popupErrorDetails.test.js \
  src/features/map/popups/popupExportConfig.test.js \
  src/features/map/popups/popupExportContract.test.js \
  src/features/map/popups/popupExportState.test.js \
  src/features/map/popups/popupHeaderCollectionAction.contract.test.js \
  src/features/map/popups/popupHeaderCollectionAction.test.js \
  src/features/map/popups/popupProductActions.test.js \
  src/features/map/popups/popupProductMetadata.test.js \
  src/features/map/popups/popupRefreshBridge.test.js \
  src/features/map/search/mainMapSearchControls.test.js \
  src/features/map/search/productGraphicSearch.test.js \
  src/features/map/search/sourceAwareProductSearchIndex.test.js \
  src/features/productCollection/state/productCollectionStore.test.js \
  src/features/productCollection/ui/productCollectionNavigation.test.js \
  src/features/productCollection/ui/productCollectionTray.test.js \
  src/features/products/domain/productActionAvailability.sourceAware.test.js \
  src/features/products/domain/productActionAvailability.test.js \
  src/features/products/domain/productCatalog.test.js \
  src/features/products/domain/productContext.popupPrecedence.test.js \
  src/features/products/domain/productContext.test.js \
  src/features/products/domain/productExportTrack.test.js \
  src/features/products/domain/productExternalExportState.test.js \
  src/features/products/domain/productJob.test.js \
  src/features/products/tests/normalizedWorkflow.test.js \
  src/features/products/tests/s101Terminology.contract.test.js
```

## F5 package popup read freshness

`GET electronicproducts/{name}` supplies independent current S-101 and S-57
Products. Transport normalizers project them into `workUnitMetadata.members`;
initial ENC AOIs populate the same boundary from `Attributes.Package` current
member fields. The popup shows a Product row in registry member order. Missing
members stay missing; names are never derived. Active normalized export metadata
overlays only its matching member's version, status, error and validation artifacts.
Without an export, current Edition/Update and AOI `workUnitStatus` member status are
shown. Workflow status never replaces member status. Only Status cells are colored;
unchanged presentation retains the existing DOM/error-details focus identity.

Connected package popups use `createWorkspaceFreshnessMonitor` with its 30,000 ms
default. They prime revision, read Product detail once, then check revision again
to catch a racing change. A failed initial detail read marks recovery required.
Unchanged revisions cause no further detail read; changed revisions are acknowledged
only after successful, current detail publication. Hidden documents suppress
periodic checks; visibility re-entry shares the monitor's in-flight check. Disconnect
destroys the monitor and invalidates pending detail completion. No additional focus
or pageshow listener is installed. Package popups do not register Product-job watches or job-triggered Product-detail
callbacks, and do not poll `jobs/active` or Hangfire jobs.

Detail publication allows only `workUnitMetadata` and `exportMetadata`. Complete
workflow/member map status, F1 filters, F2 symbols, F3 facets, geometry and source
identity remain owned by normal Main-map source refresh (10 minutes). Popup freshness
does not fetch global AOIs. A member status without an active export therefore
converges through normal source refresh. Non-package job discovery and targeted
Graphic refresh remain unchanged. All package mutations and Analyze/Review/History
navigation remain unavailable.

### F5 v2: normal source refresh and an open popup

The connected package popup registers a local callback on the existing
`registerPopupRefreshHandler` / `refreshOpenProductPopup` bridge. Stable Graphic
source reconciliation uses this callback to replace the popup snapshot with the
already-refreshed Graphic's AOI-owned state, including `workUnitStatus`, current
`workUnitMetadata`, identity and filter/display fields. This callback performs no
Product-detail or AOI request and starts no timer.

Only the session's last accepted `exportMetadata` is preserved if the refreshed
Graphic omits that field. An explicit replacement (including undefined/null)
replaces it. The retained overlay is local to popup presentation and is not copied
back into map/filter state. The existing revision monitor alone revalidates Product
detail at its bounded 30-second cadence. A local source refresh supersedes publication of an older in-flight detail result
without duplicating simultaneous detail reads. Metadata-signature rendering still preserves
focus and error controls on semantic no-ops.

Close/disconnect unregisters both the local bridge and freshness lifecycle. Delayed
publication checks connection, source/dataset/Product identity, layer/source object
identity, source visibility and Graphic membership using application state/public
collection APIs. An invalid local callback unregisters its session.

F1 workflow/member Status filtering, F2 mixed member-status hatching and F3 contextual
facet counts are active. F5 preserves their semantics and source-refresh ownership.

### F5 v3: shared publication generation

A valid package source-refresh publication advances the same `latestRefreshId`
owned by `createPopup.js` for targeted detail publication. A detail request begun
before that publication is rejected entirely: neither its current member metadata
nor its export/validation overlay is applied. The newer AOI snapshot and currently
accepted overlay remain visible. The bridge is still network-free and starts no timer.

A superseded detail returns false, so the revision monitor does not acknowledge
that revision. The next bounded check can retry; superseded initial reads use the
existing `requireRefresh()` recovery path and subsequent initial check. There is
still one in-flight detail read and no separate generation owner. All v2 source,
identity, connection and cleanup guards remain in place.
