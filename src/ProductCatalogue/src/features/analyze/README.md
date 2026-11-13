# Analyze

The Analyze feature shows Product analysis content for one or more selected Products. It has its own lifecycle, independent of the Main Map popup. The R01C workflow controls appear in the Analyze map Product popup and reuse the existing backend-authorized Package action session without borrowing the Main Map popup session.

## Responsibilities

Analyze owns:

- Analyze route parsing
- Analyze product loading
- Analyze map layer creation
- Analyze sidebar product cards
- XML/report display
- Internal validation report display
- Analyze-specific loading progress
- Analyze history content
- Analyze-scoped Product popup workflow controls and action-session lifetime

Analyze does not own:

- Backend mutation permission or the Package action API contract
- Popup action availability
- Export state
- Product operation state
- Global map timeline state

## Terminology

User-facing Analyze UI should use `Product` and `Products`, not `Dataset` or `Datasets`.

Code can keep technical identifiers such as `datasetName` where required by backend contracts or normalized product attributes, but labels, buttons, empty states and help text should use product terminology.

## Failure state

A resolved Product whose metadata request fails remains a resolved workspace Product,
but its Analyze content is represented as failed. The model retains Product identity and `loadError`
while leaving geometry, status, version metadata, XML/report content, validation reports, and raw
payload empty. The sidebar uses the existing compact failed Product card instead of presenting
synthetic content as successfully loaded data.

Analyze loads Products independently. A failed Product does not discard successfully loaded Products in
the same workspace, and failed Products do not create map graphics or trigger Product History requests.
Request-generation checks remain the publication boundary for superseded loads.

The configured mock Paper Charts and S-102 workspace sources are separate source contracts. They keep
their registry-owned attributes and geometry and do not fall through to the compatibility Analyze API.

## Map graphics

Analyze map graphics should contain only fields needed for map rendering, selection, popup display and indexing.

Expected Analyze graphic attributes:

```js
{
  datasetName,
  edition,
  update,
  status,
  errorMessage,
  featureKey,
}
```

Do not add analysis-only metadata to graphic attributes unless another map system needs it.

## Sidebar

The Analyze sidebar is for analysis/report content. It can show:

- selected products
- product summary
- XML/report content
- internal validation reports
- load warnings
- history content

The sidebar remains dedicated to Product metadata, History, IC-ENC and Internal validation. Pause/Resume, Discard and Send/Accept belong exclusively to the Analyze **map popup**, not to Product cards in this sidebar. The popup reuses the shared action bar without Tools. Unsupported Products show the same controls disabled; no display state grants mutation permission.

### FI-035 compact presentation

The route already identifies Analyze, so the Calcite panel keeps an accessible `Analyze workspace`
region name without rendering a duplicate visible panel heading. The Product picker keeps its
accessible `Add product` name while its normal label and instructional help are suppressed. Loading,
catalog failure, invalid Product, and already-selected Product messages remain visible when relevant.

The `Products` composition list uses a responsive bounded viewport sized for approximately three
normal rows. Product names may wrap instead of forcing a fixed row height. Both that list and the
outer Analyze content scroller use the shared `pc-scrollbar` application contract. The narrower
desktop sidebar remains full width at the existing narrow-screen breakpoint. These presentation
changes do not alter Product composition, routing, targeted source resolution, workspace freshness,
manual Refresh, or independent content failure behavior.

## PC-UX-R04 Product status and layout (candidate)

The Product picker, selection, refresh and action ownership remain unchanged. The sidebar
uses one consistent surface and inset for Product controls, the icon-only Refresh and
collapse controls, empty/loading messages and metadata cards. The refresh control remains
an ordinary accessible button carrying the existing `pc-analyze-refresh` event.

Leaf Product cards use the existing ProductState palette for their status chip. The status
row is not repeated in the body; Edition and Issue date remain available.
Update is intentionally omitted from the Analyze metadata rows, but continues to
exist in the backend contract and any historical audit records. The Refresh,
Open all and Collapse all controls align to the right-hand inset of the panel. When a
Product reports an error message, the status chip exposes the exact backend message on
hover and through its accessible label, without hiding the existing Message row.
An ENC Package heading is a grouping label, not a ProductState or aggregate Package
status: it remains neutral, and each verified S-101/S-57 member is colored independently.

## Shared workspace Product picker

Analyze uses the shared source-aware workspace catalog/resolver in:

```txt
src/features/products/services/workspaceProductService.js
```

The picker loads only the lightweight `GET electronicproducts` dataset-name list. Selecting or directly
opening a Product resolves that one Product through `GET electronicproducts/{datasetName}/aoi`; the
response supplies authoritative `ProductSpecification` plus source-owned geometry. Analyze therefore
does not load the complete S57 and S101 AOI catalogs merely to resolve workspace identity.

The workspace contract requires globally unique normalized `datasetName` values. The frontend does not
infer S57/S101 from naming conventions: the backend performs unique identity resolution and a conflict,
missing specification, identity mismatch or unavailable configured source fails closed. Main-map source
toggles remain independent from workspace resolution. Review reuses the same targeted resolver and
lightweight picker model.

## DSA-08 direct-route startup and picker ownership

An explicit Analyze/Review route composition starts its targeted, source-aware Product resolution
without waiting for the lightweight `GET electronicproducts` picker catalogue. The picker owns
its independent loading/error state; a late response only updates the picker and does not
reselect Products, replace canonical package identities or hide an active workspace load.

Route replacements and existing Product refreshes use the targeted resolver as the authority.
New picker additions must wait while the catalogue is loading; after it loads, the existing
catalogue validation still applies. If the catalogue fails, typed-name fallback continues to
use the source-aware resolver and may show a real resolution failure, never a synthetic success.
Catalog completion after page teardown is ignored. No global request timeout is introduced.

## Internal validation reports

Internal validation reports are normalized into the UI-facing `internalValidationReports` product field.

The UI renders each Internal validation report expanded by default, including when multiple reports are available. With more than one report, the list uses a slightly taller, viewport-aware maximum height (approximately two expanded reports) and an independently keyboard-scrollable region. Users can still collapse individual reports, but never need to expand them just to see the content. The scroll region is named by the visible section heading without generating a hover tooltip. Download URLs use the public Calcite `calcite-link` component with the existing filename hint; no reports are omitted.

The current frontend-ready report shape is:

```js
{
  id,
  title,
  status,
  source,
  generatedAt,
  summary,
  format,
  content,
  raw,
}
```

Supported backend aliases are normalized in `api/analyzeApi.js` and `domain/internalValidationReports.js`.

Electronic validation records now come from public artifact history. Reports with `url` render diagnostic downloads; absent inline content is not fabricated.

## Backend integration

Electronic Analyze metadata and diagnostics are loaded from current public endpoints and normalized in
`api/analyzeApi.js`. Request failure must remain a truthful failed Product state; do not add catch-based
mock payload substitution.

Keep the UI-facing Analyze product shape stable, map backend-specific report fields into the existing
normalizers and keep map graphics minimal. The page owns its own verified Package action
session; it never depends on popup state or bypasses source-specific mutation gating.

## FI-011D source-aware workspace loading

Analyze resolves route `datasetName` values through the shared workspace Product service before
loading Product content. Electronic Products read `/electronicproducts/{name}` metadata and
`/electronicproducts/{name}/artifacts/history`, retaining the resolved AOI geometry. Metadata failures
publish a failed Product; independent artifact failures retain metadata and display a warning. Paper Charts and S-102 use
registry-owned normalized attributes and GeoJSON geometry and never call the compatibility AOI endpoint.
Mixed workspaces keep successful Products when another Product or provider fails. History, IC-ENC
reports, and Internal validation distinguish `unavailable` from request `failed`. Existing
request-generation guards remain the publication boundary. Routing remains datasetName-based; source
identity stays internal to the workspace runtime.

## R01B incremental Product composition

Interactive Add, enable/disable and Remove now reconcile against the currently accepted Analyze
composition. Previously loaded work units retain their Product metadata, History and report snapshots;
only newly enabled work units are resolved and fetched. Package layers are keyed by their verified
work-unit identity. Ordinary Products continue sharing their source/compatibility layers; when their
selection changes, those grouped layers are rebuilt from already loaded snapshots without repeating
backend reads for surviving Products. Unchanged package layers retain their Graphics and popup state.

Selection changes use a request generation and off-map staging so superseded loads cannot publish
orphan layers. The workspace freshness monitor retains surviving revision baselines and primes only
new names, avoiding a full revision reset on every selection edit. Disabled Products remain in the
local list, but are no longer part of the active Product snapshot; enabling one again reloads that
Product. Manual Refresh, initial navigation and explicit route composition still perform the existing
full reload. A failed Product remains an explicit failed entry rather than fake successful data.

For package member Edition and Update, the Product-detail response remains the primary source.
If its top-level values are absent, Analyze first uses the same member's verified, normalized
`workUnitMetadata` (`S101`/`S57` Edition/Update). If that member also lacks a value, Analyze may
use the backend-provided `CurrentEdition` or `CurrentUpdate` from the same member's verified,
source-owned targeted AOI snapshot. An absent or mismatched member identity cannot supply a fallback;
Update `0` remains a valid value. This does not guess or synthesize version numbers.

## R01C Analyze Package actions and report states (candidate; browser acceptance pending)

The Analyze map Product popup has Pause/Resume, Discard and Send/Accept controls driven by
`createPopupWorkflowActions()` and the same `createPackageActionSession()` used on Main Map.
Analyze owns the session per current, enabled work-unit identity; it does not reuse popup state.
Only a resolved Package with matching member identities and backend-owned
`hasActivePackage === true` may read `electronicproducts/packages/{name}/actions`. Each operation
requires the latest server-projected eligibility, including after the Discard confirmation.
Send requires explicit backend permission for a complete Ready, error-free S-101/S-57 pair;
InTransit and Error deny a new send. A development demo flag cannot override these rules,
and the shared session does not enable manual Accept. An unknown, inactive or non-Package
Product cannot dispatch.

The controller destroys sessions when Products are removed, disabled, replaced or the page
is destroyed. Successful Pause/Resume/Discard/Send requests trigger targeted Analyze refresh;
accepted R01B incremental caching, off-map layer replacement and full manual Refresh remain
unchanged. Action projection changes update existing popup buttons in place, preserving focus and
open report sections. The sidebar does not render workflow buttons; Tools is not included in the
Analyze popup. An inactive, unregistered or replaced map Graphic cannot dispatch. Discard uses the shared confirmation dialog; Cancel and superseded
selection or eligibility never dispatch to the backend.

History, IC-ENC and Internal validation keep distinct content and failure contracts but now
share a compact empty-state presentation. Their collapsed headings do not say
"unavailable" when no payload is returned. For IC-ENC, an empty or unimplemented source
renders `No IC-ENC reports found` rather than a technical backend-support message;
no report content or download URL is fabricated. Internal validation and History retain
their source-specific unavailable states and genuine request errors remain visible.
This UI change does not create an IC-ENC download endpoint.

## Public route

The canonical route is `/Analyze?Datasets=ProductA,ProductB`. See
[workspace routing](../../shared/routing/README.md) for the shared URL boundary and temporary
legacy-path compatibility. The URL continues to represent enabled Products; disabled list entries
remain local workspace composition state.

## F6B package-aware Analyze

Composition first resolves through `resolveAnalyzeWorkUnits()` and the F6A canonical work-unit
resolver. The exact `resolveProduct()` API is unchanged. Both S-101 and mapped S-57 inputs resolve to
one canonical S-101 dataset, retaining the first logical work-unit occurrence in mixed lists. The
existing `Datasets=` grammar is unchanged; unrelated simple Products retain their exact identities.
Request-scoped alias deduplication prevents redundant package resolutions within one composition.
F6B v2 additionally reconciles the final result list by proven package membership. A later complete
package resolution replaces any earlier failed/simple alias belonging to it while retaining the first
logical occurrence position. Conflicting successful ownership/canonical/member claims produce a
failed resolution instead of overlapping package items. Unproven failures remain exact failures.

One outer model contains `workUnit` and ordered `members`. Each member retains its own exact
ProductContext, identity, metadata, Product status, validation availability and read-only History.
The sidebar reuses the ordinary Product card renderer for compact S-101/S-57 sections. Its outer
label says `ENC package`; it does not substitute workflow status for a member's Product status.
Members have no independent visibility or remove controls.

Only the outer model reaches `createAnalyzeLayers()`. It owns the representative's shared AOI and
one Graphic. Missing/malformed shared geometry, member context, identity or mapping fails the whole
package. Optional validation diagnostics and History errors retain the existing truthful content
warning/unavailable states. No incomplete metadata package is published as an ordinary Product.
Layer creation cleans up already created layers on a subsequent renderer failure.

The package Analyze layer now uses the backend aggregate `Package.Status`, already available
from the existing Product-detail request, via the normalized `packageStatus` field. Its one shared
polygon Graphic opts into `WORK_UNIT_PACKAGE_STATUS_SYMBOLIZATION`, with `workUnitStatus` carrying
`{ packageStatus, members: [{ key, datasetName, status }] }`. Member statuses are preserved as
metadata, but cannot change the package AOI color. Symbols use a thin-opacity fill, a thicker
outline, and no stripes. Missing/unknown aggregate status uses a neutral dashed outline instead
of a fabricated member or Idle fallback.

The ordinary compatibility/source layers and `analyzeGraphicProductContext.js` are unchanged.
No additional Product read occurs. Initial loads and successful targeted replacements use the same
Esri transformer and central `resolveCorrectionSymbol()` path; failed/stale replacements retain
the accepted Graphic/symbol under the existing lifecycle.

F6B v5 scopes package member Internal Validation Reports before content publication. The backend
`electronicproducts/{datasetName}/artifacts/history` returns validation artifacts from related S-101
and S-57 export tracks, including prior candidate revisions. Requesting through a member alias does
not establish ownership of every returned record. The shared `normalizeArtifactHistory()` remains
unchanged and preserves `datasetName`, `productSpecification`, `trackId`, `revisionId` and the secured,
API-rebased backend download URL.

The Analyze-owned `selectPackageValidationArtifacts()` compares each normalized artifact's concrete
dataset identity and specification with the exact member ProductContext. The specification comes from
F6A-validated source AOI attributes, not member/source labels or dataset prefixes. Dataset comparison
uses the existing trimmed, case-insensitive workspace identity convention; it does not match prefixes.
Registry numeric 101/57 and enum S101/S57 forms normalize to the same ownership namespace. Unknown
specifications are rejected rather than converted into an arbitrary Product.

Records belonging to another Product are omitted. Missing/unknown ownership and conflicting owner
claims for the same artifact ID or track ID are omitted with the existing member `loadError` warning.
Unprovable member identity uses that same optional content-error boundary. Valid records keep their
original normalized URL/object metadata; revision is not used to remove historical reports. No entire
package is failed because an optional artifact is unattributable. Empty members retain the existing
empty state. Ordinary Analyze retains its existing unfiltered artifact path; Review, History and the
UI renderer are unchanged.

The two member artifact requests remain independent. They often return the same combined history,
but replacing them with a single canonical request would couple optional endpoint failures. V5 does
not add a cache, retry topology or lifecycle to optimize that secondary concern. Logical request count
is unchanged, and the existing package generation boundary prevents late artifact completion from
republishing old member content.

The existing workspace generation and freshness monitor remain the only lifecycle owners. Canonical
composition is established before URL/list publication and before freshness priming. Initial/manual
composition projection rereads member metadata after priming, validates it against the resolved
mapping, and reuses the already validated exact contexts. Targeted revision refresh can reuse the
resolver's detail reads. Histories resolve per member, but all children publish together after the
same generation checks. Failed replacements retain the accepted package's complete member/geometry
snapshot and show its load warning; the freshness monitor receives failure so it can retry.
Each package uses a dedicated layer in the existing Analyze map pipeline, tagged with its canonical
work-unit identity. Successful targeted refresh replaces only layers owned by successful refreshed
packages, without changing view extent. Ordinary Product layers and Graphics remain unchanged even
when their own sidebar refresh fails in the same batch. Only a popup selected on a replaced package
layer is closed; unrelated popup and hover registrations are retained. Simple-only targeted refresh
preserves the existing sidebar refresh behavior.
F6B v3 constructs targeted package replacements off-map through a page-owned `add`/`remove`
boundary. After the existing generation checks, the page publishes the staged layers and retains
ownership while hover registration awaits. A newer full composition, newer targeted refresh or
`destroy()` synchronously cancels pending replacements, removes only their published layers and
unregisters only their hover state. The superseded promise need not finish first. The accepted package
layer remains until replacement registration succeeds and the current generation commits it.
Failed construction or registration cleans only replacement resources. Cancellation never closes an
accepted package or ordinary Product popup. The existing load and targeted-refresh request IDs remain
authoritative; the pending set is lifecycle ownership, not a new generation or cache. Shared ArcGIS
infrastructure and dedicated package layer definitions are unchanged. There is no member timer,
popup freshness listener, job polling or persistent package cache.

Main-map and Collection package Analyze navigation is enabled using the primary representative.
Review (F6C), floating package History (F6D) and package lifecycle actions remain deferred/fail closed.
These changes do not change Review/History source or backend contracts.
Independent backend reads are not a server transaction; the frontend guards identities, complete
publication and superseded generations, without claiming a transactional backend snapshot.

## FI-043 selection visibility

Adding, removing or enabling a Product updates the Analyze Product composition list before asynchronous source-aware resolution and content loading complete. The existing load generation remains the only authority for canonical identities, geometry and backend results. Content has an independent loading state and cannot be represented as loaded prematurely. The Product picker retains usable focus after a selection-triggered sidebar render.

## Analyze initial loading and read-only map popups

A direct `/Analyze?Datasets=...` navigation keeps the bootstrap loader visible throughout
source-aware Product resolution, Product content/History loading, Analyze GraphicsLayer
construction, and the first stable map display. The initial load continues the same
progress bar instead of hiding the bootstrap bar and showing a second one. The final
map-rendering phase preserves the last data-owned progress value; it does not invent a
render percentage. The existing 500 ms stable-frame test, 60-second bound, and 300 ms
completion hold are shared with Main Map. An incomplete first display raises a warning.

Subsequent Product additions, removals, toggles, refreshes, route changes, and picker
submissions keep their established sidebar-owned loading state and do not start the
global startup loader. The lightweight Product catalogue remains independent of explicit
URL Product resolution and does not gate route publication. Request generations own
publication, and a superseded first-display readiness check is aborted.

Analyze GraphicsLayers opt into a read-only variant of the shared Product popup table.
The standard package action session requires a live source-owned AOI snapshot and must
not run against Analyze's reconstructed workspace Graphics. The read-only presentation
shows the representative Product, validated package-member identity/edition/update,
backend status, and any member error details already loaded for Analyze. It does not
fetch new Product detail, authorize package mutations, or change Main Map popup behavior.
