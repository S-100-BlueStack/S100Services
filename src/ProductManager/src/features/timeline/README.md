# Timeline and product history

This feature area contains two related but separate concepts:

- Product history: history for one selected product or dataset.
- Map timeline: global map-level timeline state, snapshots, or time stops.

The current UI only implements the product history shell. The global map timeline is intentionally not implemented until the backend and database model are defined.

## Naming conventions

Use `productHistory` for logic that belongs to one selected product.

Examples:

- `fetchProductHistory(datasetName)`
- `productHistoryPanel`
- `PRODUCT_HISTORY_OPEN_EVENT`

Use `mapTimeline` for global map timeline behavior.

Examples:

- `fetchMapTimelineMetadata()`
- `fetchMapSnapshotAtTime(timestamp)`

Avoid generic `timeline` names in new UI code when the code only handles product history. The folder is named `timeline` because it is expected to contain both product history and map timeline functionality.

## Current product history contract

`fetchProductHistory(datasetName)` currently returns a placeholder response:

```js
{
  endpointAvailable: false,
  datasetName,
  events: []
}
```

Expected future event shape:

```js
{
  id: "stable-event-id",
  timestamp: "2026-06-02T10:15:00Z",
  title: "Product frozen",
  description: "User froze the product before export.",
  actor: "domain\\user",
  type: "freeze"
}
```

The exact fields must be confirmed with the backend before the UI depends on them.

## Current map timeline contract

`fetchMapTimelineMetadata()` currently returns a placeholder response:

```js
{
  endpointAvailable: false,
  mode: "snapshot",
  fullTimeExtent: null,
  stops: []
}
```

Expected future responsibilities:

- Describe the available time range.
- Provide timeline stops or intervals.
- Let the map request a snapshot for a selected timestamp.
- Define whether the map should replace all graphics or only apply deltas.

## Backend questions to resolve

Before implementing the global map timeline, clarify:

1. Is product history an audit log, product state snapshots, or both?
2. Is `datasetName` a stable identifier, or will the backend provide a product id?
3. Are map timeline snapshots full payloads or incremental changes?
4. Should timeline state include frozen/sent/exported status?
5. Should timeline requests respect the same filters as the live map?
6. What timestamp format is guaranteed by the API?
7. Can history events arrive out of order, or should the frontend sort them?
