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
- `sourceId`.

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

Product actions must only be shown for layers with `supportsProductActions: true`.

Do not infer action capability only from fields such as `datasetName`, `edition`, or `status`. Those
fields also exist on non-action FI-011 sources. Source-owned graphics are explicitly prevented from
falling back to the compatibility AOI capability profile.

Paper Charts and S-102 begin with:

```js
capabilities: {
  supportsPopup: true,
  supportsPopupActions: false,
  supportsProductActions: false,
  supportsDisplayScale: false,
  supportsAttributeFilters: true,
  supportsProductHistory: false,
  supportsOverlapPicker: true,
  supportsProductSearch: true,
}
```

Filters and Product search are client-side functions over the source's currently committed Graphics.
Enabling these capabilities does not enable mutations, History, exports, Product Collection, Analyze,
or Review. All backend-dependent Product workflows remain disabled until an authoritative
source-specific backend contract exists.

Their popup is a safe fields-only popup. The popup-header Product Collection action also resolves
`supportsPopupActions` from the selected Graphic and nested layer metadata, while `Copy dataset name`
remains independent. No existing ENC-only API call may be dispatched for these sources.

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
5. Set capabilities conservatively.
6. Keep mutation and export capabilities disabled until source-specific API dispatch is available.
7. Add lifecycle, refresh, identity, capability, and stale-operation tests.

Do not add source checks directly to unrelated UI modules when registry metadata or lifecycle hooks
can express the behavior.
