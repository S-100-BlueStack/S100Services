# Analyze

The Analyze feature shows product analysis content for one or more selected products. It is separate from the main map popup action flow.

Product mutation actions such as Freeze, Unfreeze, Send to IC-ENC, Export and Rollback should stay in the product popup.

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

## Demo mode

Analyze currently supports frontend demo fallback data because the real backend data contract is not complete yet.

Demo state should be visible to users as a warning or note, but internal demo fields should not leak into map graphic attributes or generic popup fields.

Examples of internal fields that should stay out of map graphics:

- `isMock`
- `loadError`
- raw backend/debug payloads

The sidebar can use these values directly from the Analyze product model when it needs to show a warning.

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

When the backend Analyze contract is ready, replace demo fallback behavior in `api/analyzeApi.js`.

The expected integration path is:

1. Keep the UI-facing Analyze product shape stable.
2. Normalize backend responses in the Analyze API/service layer.
3. Keep map graphics minimal.
4. Keep product actions out of the Analyze sidebar.
5. Replace demo warnings with backend-specific error/loading states.
6. Map internal validation report payloads into `internalValidationReports`.

Do not make Analyze depend directly on popup operation state unless there is a specific product action UX requirement.

## FI-011D source-aware workspace loading

Analyze resolves route `datasetName` values through the shared workspace Product service before
loading Product content. Compatibility Products keep the established `/electronicproducts/{name}/aoi`
path and existing fallback behavior. Paper Charts and S-102 use registry-owned normalized attributes
and GeoJSON geometry and never call the compatibility AOI endpoint. Mixed workspaces keep successful
Products when another provider fails. History, IC-ENC reports, and Internal validation distinguish
`unavailable` from request `failed`; unavailable mock content does not fabricate XML, reports, history,
status, or version metadata. Existing request-generation guards remain the publication boundary.
Routing stays datasetName-based until FI-019.
