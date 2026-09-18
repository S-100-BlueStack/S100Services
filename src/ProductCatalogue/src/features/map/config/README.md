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

## Overlap and direct Product selection

Normal map click uses the current interactive-layer hit test. Zero candidates close the popup, one
candidate opens its normal Product popup, and multiple candidates open the existing overlap picker.
The picker retains its established ordering and opens its selection through that same popup path.

FI-021 keeps its accepted pointer shortcut unchanged:

- Ctrl-click on Windows/Linux and Cmd-click on macOS snapshots the current transient hover Product;
- the snapshot is a stable source-aware Product/Graphic identity, not a layer or source preference;
- the identity is matched against the current click's visible, unique candidates before selection;
- no valid match falls back to normal click, including the overlap picker for multiple candidates;
- popup-locked highlight is not a transient hover candidate;
- Shift-click, Product Collection, Product search, and Locator are unchanged.

Hover hit tests are generation guarded. Results captured before newer pointer movement, layer
unregistration, popup locking, pointer leave, clearing, or teardown cannot become current hover
state. The click flow also captures hover identity before awaiting its own hit test, so a late hover
result cannot retroactively become that click's direct-selection target.

After the click hit test completes, its Graphics are also checked against the current
overlap-enabled layer set and the layer's current stable `featureKey` index or public graphics
collection. The shared interaction generation prevents older clicks and destroyed interactions from
publishing popup state.

FI-040 adds the keyboard equivalent through the public MapView `key-down` event:

- Ctrl+Enter on Windows/Linux and Cmd+Enter on macOS acts only while the map interaction surface has
  keyboard focus and a transient highlighted Product identity exists;
- modifier state comes from that actual keyboard event, and repeated keydown events are ignored;
- the current interactive layers and their current public Graphic collections are re-read at
  activation time, then filtered through the same current-layer/Graphic-membership validation used
  by pointer selection;
- pointer and keyboard direct selection use the same stable-identity resolver and the same normal
  Product popup callback; no pointer click is synthesized and no second popup workflow exists;
- a stale Graphic object is never opened after source/layer/Graphic replacement. A current
  replacement Graphic with the same stable Product identity remains eligible, matching FI-021;
- the same interaction generation is shared by click and keyboard activation, so either interaction
  supersedes older in-flight click work and teardown invalidates both paths;
- missing, popup-locked, hidden, removed, disabled, stale, or otherwise invalid transient identity
  fails closed and does not choose another Product.

A compact application-owned hint is added through the public MapView UI only while a transient hover
candidate exists:

```text
Ctrl/Cmd-click or Ctrl/Cmd+Enter to open highlighted Product
```

The hint is a non-interactive accessible note with matching native title/help text. It is removed
with the overlap-interaction lifecycle and disappears when transient highlight ownership is cleared,
including popup locking, pointer leave, source/layer cleanup, and teardown. It does not claim
`aria-keyshortcuts` because the hint itself is not the keyboard owner. Normal click and the overlap
picker remain the complete non-shortcut workflow.

FI-040 was manually accepted on 2026-09-18 at `33f0089810b1ba8c8a053727e8828f5b519e66c9`. The accepted browser behavior preserves the normal overlap picker and FI-021 pointer shortcut while adding the map-focused keyboard accelerator and contextual discoverability cue described above.

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
