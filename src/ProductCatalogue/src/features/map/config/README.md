# Layer definitions

`layerDefinitions.js` contains static frontend metadata for logical Product Catalogue layers.

Do not use this file as runtime layer state. Runtime ArcGIS layers are registered in
`features/map/core/layerRegistry.js`.

Each logical layer must have a stable `id`, `layerKind`, and explicit capabilities. UI systems must
check capabilities instead of assuming every graphic is a Product correction.

Current logical layers:

- `aoi`: existing combined AOI compatibility layer;
- `paper-charts-products`: FI-011A Development-only Paper Charts mock layer;
- `s102-products`: FI-011A Development-only S-102 mock layer.

S-57 and S-101 do not have runtime layer definitions yet because their authoritative backend read
contracts are not available. The current `aoi` layer must not be duplicated or inferred into those
future logical sources.

Layer capabilities are used by:

- popup actions;
- overlap picking;
- attribute filters;
- display-scale visibility;
- Product History readiness;
- Product search readiness.

## Runtime metadata

When a configured layer is created, `createGraphicsLayer.js` copies static metadata onto the ArcGIS
`GraphicsLayer` instance:

- `appLayerId`;
- `appLayerKind`;
- `appLayerCapabilities`.

FI-011 source-owned layers additionally receive:

- `appSourceId`;
- `dataSourceId`;
- `sourceId`;
- `appSourceDefinition`;
- `appProductType`;
- source Export configuration metadata.

The transformers copy stable metadata onto each graphic's attributes:

- `layerId`;
- `layerKind`;
- `featureKey`.

FI-011 normalization adds source-aware Product metadata before graphics are created:

- `sourceId`;
- `sourceLabel`;
- `productType`;
- `productKey`;
- `productIdentityKey`.

This metadata is intentional. Popup rendering, filters, refresh restore, hover state, source
lifecycle, and future multi-source workflows require stable frontend identity even when backend
payload shapes differ.

## Product action safety

Product mutation actions must only be shown for Products whose resolved Product context declares the
relevant operation capability. Layer capability `supportsProductActions` remains a conservative map
boundary for backend-dependent Product workflows.

Do not infer action capability only from fields such as `datasetName`, `edition`, or `status`. Those
fields also exist on non-action FI-011 sources. Source-owned graphics are explicitly prevented from
falling back to the compatibility AOI capability profile.

Paper Charts and S-102 use this FI-011C layer capability profile:

```js
capabilities: {
  supportsPopup: true,
  supportsPopupActions: true,
  supportsProductActions: false,
  supportsDisplayScale: false,
  supportsAttributeFilters: true,
  supportsProductHistory: false,
  supportsOverlapPicker: true,
  supportsProductSearch: true,
}
```

`supportsPopupActions` now means that the popup may render capability-safe custom action-bar content.
For Paper Charts and S-102 this is currently the disabled `Export > Edition` / `Export > Update`
placeholder surface. It does **not** mean that Product mutation workflows or Product Collection are
supported.

Product Collection has a separate capability boundary. The popup-header collection action resolves
the selected Graphic through `features/products/domain/productContext.js` and checks the central
`productCollection` Product capability. The compatibility AOI adapter declares that capability as
supported; Paper Charts and S-102 declare it as unsupported in the data source registry. Missing or
inconsistent Product context therefore fails Product Collection closed. `Copy dataset name` remains
independent from this capability.

Filters and Product search are client-side functions over the source's currently committed Graphics.
Enabling them, or enabling safe popup action-bar content, does not enable mutations, History, Product
Collection, Analyze, or Review. Those backend-dependent Product workflows remain disabled for the
mock sources until an authoritative source-specific contract exists.

No existing compatibility/ENC-only API call may be dispatched for Paper Charts or S-102.

## Runtime registry ownership

`features/map/core/layerRegistry.js` stores actual runtime layers by `customId` and supports targeted
registration, unregistration, source lookup, and clearing.

Compatibility refresh and rebuild must select only the layer IDs returned by the compatibility data
loader. They must not clear source-owned layers registered by the FI-011 controller.

Source activation uses `features/dataSources/map/dataSourceMapAdapter.js` to prepare hidden candidate
layers off-map, validate them, and commit map and registry state synchronously behind a source
generation guard.

## Adding a new data-source layer

When adding a new source-owned layer:

1. Add or update the source definition in `features/dataSources/config/dataSourceRegistry.js`.
2. Add the corresponding static layer definition in `layerDefinitions.js`.
3. Give the source a real loader/provider and normalizer contract.
4. Define a stable Product-key strategy and reject missing or duplicate identity.
5. Set layer and Product-context capabilities conservatively.
6. Keep mutation, Product Collection, History, Analyze, Review, and real Export capabilities disabled
   until source-specific workflow/API dispatch is available.
7. Add lifecycle, refresh, identity, capability, stale-operation, and popup-header regression tests.

Do not add source checks directly to unrelated UI modules when registry metadata, Product context, or
lifecycle hooks can express the behavior.
