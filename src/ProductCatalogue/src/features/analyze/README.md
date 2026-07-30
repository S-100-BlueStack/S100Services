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

## Future shared product picker

Analyze should later use a shared product picker/catalog workflow so users can open `/analyze` directly and add products without going through the main map or Product Collection first.

The picker should use the lightweight product catalog endpoint:

```http
GET /electronicproducts
```

Current expected lightweight shape:

```json
{ "Data": ["101DK0040943E", "101DK0040944E"] }
```

Recommended behavior:

- Keep the existing route/product list model.
- Replace or supplement the manual Add field with a searchable product picker.
- Use product terminology in visible UI.
- Keep typed input as a fallback if useful during development.
- Do not fetch AOI geometry just to populate the picker.

Recommended shared location:

```txt
src/features/products/api/productCatalogApi.js
src/features/products/domain/productCatalog.js
src/features/products/ui/productPicker.js
```

Review should reuse the same picker instead of implementing its own product search UI.

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
