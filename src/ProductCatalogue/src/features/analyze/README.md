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

A resolved compatibility Product whose real Analyze request fails remains a resolved workspace Product,
but its Analyze content is represented as failed. The model retains Product identity and `loadError`
while leaving geometry, status, version metadata, XML/report content, validation reports, and raw
payload empty. The sidebar uses the existing compact failed Product card instead of presenting
synthetic content as successfully loaded data.

Analyze loads Products independently. A failed Product does not discard successfully loaded Products in
the same workspace, and failed Products do not create map graphics or trigger Product History requests.
Request-generation checks remain the publication boundary for superseded loads.

The development-only Paper Charts and S-102 workspace sources are separate source contracts. They keep
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

## Shared workspace Product picker

Analyze uses the shared source-aware workspace catalog/resolver in:

```txt
src/features/products/services/workspaceProductService.js
```

The picker/catalog combines the compatibility `GET /electronicproducts` provider with runtime-available
registry workspace providers such as Paper Charts and S-102. Provider failures are isolated, source
metadata is retained, and stale provider loads cannot publish over a newer catalog generation. The
workspace contract requires globally unique normalized `datasetName` values; an actual cross-provider
duplicate is treated as ambiguous and fails closed instead of selecting one Product.

The workspace catalog is independent of Main map source enablement. Disabling Paper Charts or S-102 on
the Main map does not remove that runtime-available source from an already open or directly opened
Analyze workspace.

The picker keeps Product name as its primary text and retains typed input as a development fallback where
the existing UI supports it. It does not fetch compatibility AOI geometry merely to populate choices;
source-owned geometry is loaded only when the Product itself is resolved for Analyze. Review reuses the
same workspace service and picker model.

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

When the endpoint contract is finalized, keep this UI-facing shape stable and map backend-specific fields into it.

## Backend integration

Compatibility Analyze content is loaded from the established real backend endpoint and normalized in
`api/analyzeApi.js`. Request failure must remain a truthful failed Product state; do not add catch-based
mock payload substitution.

Keep the UI-facing Analyze product shape stable, map backend-specific report fields into the existing
normalizers, keep map graphics minimal, and keep Product mutation actions out of the Analyze sidebar.
Do not make Analyze depend directly on popup operation state unless there is a specific Product action UX
requirement.

## FI-011D source-aware workspace loading

Analyze resolves route `datasetName` values through the shared workspace Product service before
loading Product content. Compatibility Products keep the established `/electronicproducts/{name}/aoi`
path. A failed compatibility request keeps the resolved Product context but publishes a failed Analyze
state with no fabricated geometry, status, report, or version payload. Paper Charts and S-102 use
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
