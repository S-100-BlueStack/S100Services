# Layer definitions

`layerDefinitions.js` contains static frontend metadata for logical Product Manager layers.

Do not use this file as runtime layer state. Runtime ArcGIS layers are registered in
`features/map/core/layerRegistry.js`.

Each logical layer should have a stable `id` and explicit capabilities. UI systems
must check capabilities instead of assuming every graphic is a product correction.

Current logical layer:

- `aoi`: product corrections

Layer capabilities are used by:

- popup actions
- overlap picking
- attribute filters
- display-scale visibility
- product history readiness

When adding a new data layer, add a definition first, then reference it from
`layerConfigs.js`.
