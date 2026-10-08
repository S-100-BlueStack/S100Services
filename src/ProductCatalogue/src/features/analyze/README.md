# Analyze

The Analyze feature shows product analysis content for one or more selected products. It is separate from the main map popup action flow.

Product mutation actions such as Freeze, Unfreeze, Send to IC-ENC, Export and Cancel Export should stay in the product popup.

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

Analyze does not own:

- Product mutation actions
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

It should not show product mutation actions.

Product actions belong in the popup action bar so the action model stays consistent across the app.

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

## Internal validation reports

Internal validation reports are normalized into the UI-facing `internalValidationReports` product field.

The UI supports multiple open validation reports at the same time by rendering one nested details element per report. This keeps the current sidebar workflow simple while leaving room for a later side-by-side or dedicated comparison view if the report size requires it.

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
normalizers, keep map graphics minimal, and keep Product mutation actions out of the Analyze sidebar.
Do not make Analyze depend directly on popup operation state unless there is a specific Product action UX
requirement.

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

F6B v4 projects only the accepted package model's member Product statuses at the dedicated package
layer boundary. `workUnitStatus` contains `members: [{ key, datasetName, status }]`, with each value
copied from the corresponding `memberKey`, `datasetName` and `status`. Missing status remains missing;
no workflow status or representative status is used to fill it. Only package layer definitions opt
into `WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION`. The ordinary compatibility/source layer paths and
`analyzeGraphicProductContext.js` remain unchanged.

The existing Esri transformer passes those attributes and the strategy to `createGraphicProperties()`
and the central `resolveCorrectionSymbol()`. F2's member-only projection, existing palette and CIM
hatches choose the initial symbol for the one shared polygon Graphic: no usable member status falls
back to representative scalar status, one distinct supplied status is scalar, and distinct member
statuses are mixed. Equal statuses never manufacture a hatch. No additional Product read occurs.
Initial loads and successful targeted replacements use this same path. Failed/stale replacements
retain the accepted Graphic/symbol under the unchanged v2/v3 lifecycle.

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
