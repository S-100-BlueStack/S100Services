# Layer definitions

`layerDefinitions.js` contains static frontend metadata for logical Product Catalogue layers.

Do not use this file as runtime layer state. Runtime ArcGIS layers are registered in
`features/map/core/layerRegistry.js`.

Each logical layer should have a stable `id`, `layerKind` and explicit capabilities.
UI systems must check capabilities instead of assuming every graphic is a product
correction.

Current logical layer:

- `aoi`: product corrections

Layer capabilities are used by:

- popup actions
- overlap picking
- attribute filters
- display-scale visibility
- product history readiness

## Runtime metadata

When a configured layer is created, `createGraphicsLayer.js` copies static metadata
onto the ArcGIS `GraphicsLayer` instance:

- `appLayerId`
- `appLayerKind`
- `appLayerCapabilities`

The transformers also copy stable metadata onto each graphic's attributes:

- `layerId`
- `layerKind`
- `featureKey`

This is intentional. Popup rendering, filters, refresh restore, hover state and
future multi-layer behavior need stable frontend metadata even when the backend
payload only contains product attributes.

## Product action safety

Product actions must only be shown for layers with `supportsProductActions: true`.

Do not check for product actions by looking only for fields like `datasetName`,
`edition` or `status`. Those fields may also exist in future non-action layers.

## Adding a new data layer

When adding a new data layer:

1. Add a layer definition in `layerDefinitions.js`.
2. Reference that definition from `layerConfigs.js`.
3. Set capabilities explicitly.
4. Keep product mutation actions disabled unless the new layer truly supports them.

A non-product context layer should normally start with capabilities like this:

```js
capabilities: {
  supportsPopup: true,
  supportsPopupActions: false,
  supportsProductActions: false,
  supportsDisplayScale: false,
  supportsAttributeFilters: false,
  supportsProductHistory: false,
  supportsOverlapPicker: true,
}
```

Only enable additional capabilities after the UI behavior has been tested for that
specific layer.
