# Analyze

The Analyze feature shows product analysis content for one or more selected
products.

It is separate from the main map popup action flow. Product mutation actions such
as Freeze, Unfreeze, Send to IC-ENC, Export and Rollback should stay in the
product popup.

## Responsibilities

Analyze owns:

- Analyze route parsing
- Analyze product loading
- Analyze map layer creation
- Analyze sidebar product cards
- XML/report display
- Analyze-specific loading progress
- Analyze history placeholder content

Analyze does not own:

- Product mutation actions
- Popup action availability
- Export state
- Product operation state
- Global map timeline state

## Demo mode

Analyze currently supports frontend demo fallback data because the real backend
data contract is not complete yet.

Demo state should be visible to users as a warning or note, but internal demo
fields should not leak into map graphic attributes or generic popup fields.

Examples of internal fields that should stay out of map graphics:

- `isMock`
- `loadError`
- raw backend/debug payloads

The sidebar can use these values directly from the Analyze product model when it
needs to show a warning.

## Map graphics

Analyze map graphics should contain only fields needed for map rendering,
selection, popup display and indexing.

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

Do not add analysis-only metadata to graphic attributes unless another map system
needs it.

## Sidebar

The Analyze sidebar is for analysis/report content.

It can show:

- selected products
- product summary
- XML/report content
- load warnings
- history placeholder content

It should not show product mutation actions. Product actions belong in the popup
action bar so the action model stays consistent across the app.

## Backend integration

When the backend Analyze contract is ready, replace demo fallback behavior in
`api/analyzeApi.js`.

The expected integration path is:

1. Keep the UI-facing Analyze product shape stable.
2. Normalize backend responses in the Analyze API/service layer.
3. Keep map graphics minimal.
4. Keep product actions out of the Analyze sidebar.
5. Replace demo warnings with backend-specific error/loading states.

Do not make Analyze depend directly on popup operation state unless there is a
specific product action UX requirement.
