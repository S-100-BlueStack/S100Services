# F6D package-aware floating Product History — v1 implementation report

## Controlled input

- Authoritative baseline: `906a7e2dd4527408dcb6617b644fc49edbc326c5` (accepted F6C v2).
- Baseline ZIP SHA-256 independently verified: `ED7D2EA3E3282F0000EB0905DF733160A491A6CF84C8871875AC31FB4F9E009C`.
- Context SHA-256 independently verified: `123D7025A0F4FF628BA4495F46F4C1962A05250FF5B910335319F98BB966BC71`.
- Supplied manifest identifies 57 committed context files; complete frontend source was extracted from the supplied archive.
- First F6D candidate; no previous F6D candidate. No commit made and no remote repository operations performed.

## Result and architecture

The existing floating Main-map History controller remains the single panel/request owner. The Tools action
captures the clicked ProductContext and Graphic through an additive backward-compatible History event.
`initMap` supplies the real runtime registry and source controller. There is no second panel/controller,
new timer, poller, source-name branch, package endpoint, backend DTO or synthetic package audit event.

`packageHistoryLoader` resolves through the existing F6A service with exact source-aware contexts. It checks
canonical representative identity, the stable work-unit key, declaration order, S-101/S-57 specifications,
source availability, source/product identity and the secondary canonical back-reference. An S-57 direct
entry converges on the canonical S-101 package. Missing, ambiguous, stale or contradictory ownership
cannot fall back to an ordinary S-101/S-57 History read.

One open performs one explicit History read per member, concurrently with `Promise.allSettled`. The
existing source-aware API makes the content/loader capability decision. Optional errors, unavailable
content and empty results remain independent. After optional reads, mandatory existing Product-detail
reads recheck both mappings; F6A `assertCurrent` and the complete identity signature run again. Structural
failure prevents the complete package presentation. Both sections publish together only after these
checks; no partially resolved package content is exposed.

One canonical panel header contains two compact accessible member sections, S-101 then S-57. Headers
show specification label and actual dataset name on `--pc-surface-alt`. Existing summary, banner, event
list and state renderers are reused. Empty member warnings are retained. Each member keeps its own
count/latest event, actors, timestamps and collapsed/expandable details. Existing bounded scrolling and
light/dark variables are retained; long headings wrap and the native header can shrink on narrow screens.

## Authority and lifecycle

Every open increments the existing request generation before resolution begins, including invalid input.
Close button, public close (including existing Escape handling), destroy and newer opens revoke older
success/error/notice publication. Deferred map-click callbacks also capture their generation. No stale
operation can reopen the panel or change newer content, title, busy or pin state.

Unpinned panels follow existing popup visibility/selection and map-click behavior. Selection comparison
now includes source-aware Product identity. A legitimate same-identity popup rerender stays valid while
its layer/source/mapping are still current. A captured menu action cannot resolve against another popup's
selection. Runtime generation/enabled/requested-enabled state, original source definition/layer, map
layer membership, Graphic membership/identity and captured mapping are revalidated at async boundaries.

Pending reads cannot publish after a source refresh/replacement/deactivation, whether pinned or unpinned.
Already accepted pinned content remains a snapshot when its popup/source disappears. Pinning grants no
new read authority for a removed source. A pending pinned request can survive an unrelated popup close
or selection only while its original source snapshot remains valid. Any explicit newer open supersedes it.
No additional source observer lifecycle was introduced.

## Returned identity and compatibility

Package calls opt into `validateOwnership: true`. Raw payload, state rows and explicit audit rows are
checked for contradictory concrete `Name`/`DatasetName` aliases before normalization or audit association
can conceal evidence. The loader additionally validates normalized dataset/source and explicit event
identity against that member. Contradictory content becomes that member's error rather than being shown
under the other member. Missing concrete names are not represented as backend ownership evidence;
truly empty payloads retain empty events using the requested exact endpoint identity.

This does not change global explicit-audit association/outcome heuristics or deduplicate across members.
A test exercises both members sharing state-record IDs while keeping their own successful explicit audit
association. Existing normalized API/audit, Analyze and Review tests remain passing.

Ordinary History still makes one exact explicit-context read and uses its original presentation. The
Dashboard compatibility adapter still accepts `fetchProductHistory(name)` without a ProductContext; its
normalization and route-local UI are unchanged. Explicit missing context cannot enable compatibility.

## Capability and preservation

Only package `workUnit.navigationCapabilities.history` changes from false to true. Analyze and Review
stay true and the existing capability-driven Tools menu exposes History. Package mutations, Freeze,
Unfreeze, Send, Cancel Export, export, Accept, Pause, Resume, Discard and scheduling remain disabled.
Product Collection keeps only Analyze/Review destinations and existing URLs/state. Backend, dependencies,
lockfile, F2/F6B symbolization, F6C Review runtime/UI, map timeline and historical F6 reports are unchanged.
Existing tests whose assertions explicitly expected disabled package History are updated only for this
intentional capability change.

## File inventory relative to baseline

### Complete replacement files

- `src/ProductCatalogue/docs/PC-package-workspaces-F6-discovery-df7d088e.md`
- `src/ProductCatalogue/src/app/initMap.js`
- `src/ProductCatalogue/src/features/dataSources/config/dataSourceRegistry.js`
- `src/ProductCatalogue/src/features/map/popups/packageFoundation.test.js`
- `src/ProductCatalogue/src/features/map/popups/popupActionConfig.js`
- `src/ProductCatalogue/src/features/map/popups/popupProductActions.js`
- `src/ProductCatalogue/src/features/productCollection/ui/productCollectionNavigation.test.js`
- `src/ProductCatalogue/src/features/products/services/workspaceWorkUnitService.test.js`
- `src/ProductCatalogue/src/features/timeline/README.md`
- `src/ProductCatalogue/src/features/timeline/api/productHistoryApi.js`
- `src/ProductCatalogue/src/features/timeline/events/productHistoryEvents.js`
- `src/ProductCatalogue/src/features/timeline/ui/productHistoryPanel.js`
- `src/ProductCatalogue/src/styles/product-history.css`

### New files

- `src/ProductCatalogue/docs/package-history-F6D-implementation-report.md`
- `src/ProductCatalogue/src/features/timeline/services/packageHistoryLoader.js`
- `src/ProductCatalogue/src/features/timeline/services/packageHistoryLoader.test.js`
- `src/ProductCatalogue/src/features/timeline/tests/packageHistoryTestSupport.js`
- `src/ProductCatalogue/src/features/timeline/ui/productHistoryPanel.test.js`

Deleted files: none. No dependency or manifest/lockfile changes.

## Verification actually executed

- Baseline broad `node --test`: 1,205 tests; 1,200 passed; 5 failed.
- Final candidate broad `node --test`: 1,264 tests; 1,259 passed; 5 failed.
- Failure names compared individually: no candidate-only failures; no removed baseline failures.
- Focused Node suite: 165 tests; all passed. Includes panel owner, package loader, History API/audit,
  F6A resolver, package Tools/actions, Product Collection, Analyze and Review History tests.
- 59 new deterministic tests across loader (21) and panel owner (38).
- `node --check`: passed for all 14 changed/new JavaScript files.

The same five broad-suite failures in both archives:

- `Development mock fixture files normalize to globally unique source datasetNames`
- `ProductCatalogueAPI embeds only the retained source-specific mock fixtures`
- `ProductCatalogueAPI registers only the retained source mocks behind the environment/configuration gate`
- `range controls keep keyboard time editing local until the range interaction commits`
- `runtime source changes do not republish compatibility filter state`

Three failures require backend source/mock fixture files omitted from the frontend-only archive. The
other two are pre-existing range-control and runtime source-contract test failures in this environment.
None was suppressed, skipped or repaired as part of F6D.

No installed project `node_modules` was available. No dependencies were installed. `npm run format`,
format check, ESLint, Vite build and `npm run check` were not executed. Browser/real ArcGIS rendering and
backend restore/build/test were not executed; this is a frontend archive implementation without the
running application/backend. Syntax and Node tests do not substitute for these local checks.

## Authoritative local verification

```powershell
cd src/ProductCatalogue
npm run format
npm run check
```

Manual browser acceptance (use a live package with distinct member histories):

1. Main-map package popup: Tools shows Analyze, Review and History; mutations/export remain absent.
   History opens one panel with canonical S-101 title and two labels plus real names, in S-101/S-57 order.
2. Compare both sections with each member's own endpoint: count/latest timestamp, actor, events and audit
   outcome/details match; expanding one event does not expand the other member. Test empty, unavailable
   and failed member reads independently while the sibling remains visible.
3. Open rapidly A → B → A and repeat History on one package under slow networking. Only the latest open
   may publish; no old errors/notices or duplicate member History reads appear. Exactly two History reads
   per package action are expected; Product-detail resolution/mapping checks are additional reads.
4. During loading: close button, Escape, popup close, unrelated selection and map click revoke unpinned
   work. Pinning retains accepted content on popup close/selection change. Close/reopen/destroy cannot
   restore old results. Source deactivation/refresh/replacement must block pending publication, including
   pinned requests. Already accepted pinned content may remain as the documented snapshot.
5. Check long dataset names and histories, narrow viewport, scrolling, light/dark contrast, keyboard
   pin/close controls, preserved focus and independent collapsed details.
6. Recheck ordinary Main-map and Dashboard History, package Analyze/Review (including mixed-status
   hatching), source isolation and Product Collection's Analyze/Review destinations.

## Remaining limits and delivery

The two Product-level History reads are not a backend transaction. Identity/mapping checks protect the
available evidence at their boundaries; a later backend change can occur after the final check. Missing
ownership metadata in an empty response cannot prove a backend package version and is not fabricated.
Real browser behavior and installed-dependency verification remain pending user acceptance.

The candidate ZIP contains complete replacement/new files with repository-root-relative paths, not
patches or the baseline archive. Its SHA-256 is provided alongside the downloadable delivery because a
ZIP cannot embed its own final hash. Apply only against the authoritative baseline.

Suggested commit message after acceptance:

```text
feat(product-catalogue): add package-aware product history
```
