# Feature architecture boundaries

This folder contains application features. Feature modules should stay focused on one product area and avoid hidden two-way dependencies between feature folders.

## Import direction

Use this general dependency direction:

```text
app
  -> features
      -> shared
```

`app` is the composition layer. It may import multiple features and wire them together.

`features` may import from `shared`.

`shared` must not import from `features` or `app`.

## Feature-to-feature imports

Feature-to-feature imports are allowed when one feature is acting as a UI/orchestration layer, but they should be intentional and easy to explain.

Acceptable examples:

```text
features/map/popups -> features/products/domain
features/map/popups -> features/products/state
features/map/popups -> features/data/api
features/map/popups -> features/timeline/events
features/analyze -> features/map/core
```

Avoid feature-to-feature imports when they create domain coupling or circular ownership.

Avoid examples:

```text
features/products/domain -> features/map
features/data -> features/map/config
features/map/config -> features/data
shared -> features/*
```

## Data loading and map rendering

Data fetching belongs under `features/data`.

Map layer definitions, capabilities, rendering, popup behavior and map state belong under `features/map`.

The data layer may return layer payloads, but it should not depend on map rendering internals.

The map layer may consume prepared layer payloads, but it should not own API fetch functions.

## Product domain logic

Product domain logic must not depend on map graphics, popup state or ArcGIS objects.

For example, product action availability should receive normalized inputs such as:

```text
attributes
frozen
exportHasRunningAction
productHasRunningMutation
```

It should not import map-specific helpers to derive those values.

## Map orchestration

Map services may coordinate map-specific state such as:

```text
MapView
popup restore
hover lock restore
layer registry
layer rebuild
display scale visibility
```

Refresh orchestration that rebuilds map layers belongs under `features/map/services` when it depends on map state, even if the data itself is loaded through `features/data`.

## Legacy layer implementations

The active product layer path is:

```text
features/map/core/layerFactory.js
  -> features/map/layers/createGraphicsLayer.js
```

Do not reintroduce `GeoJSONLayer` for product corrections unless there is a new architectural decision to support it.

Product correction features should be converted into ArcGIS `Graphic` instances and rendered through `GraphicsLayer`.
