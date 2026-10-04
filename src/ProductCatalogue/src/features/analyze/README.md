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
