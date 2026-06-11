# Timeline and product history

This feature area contains two related but separate concepts:

- Product history: history for one selected product or dataset.
- Map timeline: global map-level timeline state, snapshots, or time stops.

The current UI implements product history content with frontend demo data. The
global map timeline is intentionally not implemented until the backend and
database model are defined.

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

Avoid generic `timeline` names in new UI code when the code only handles product
history. The folder is named `timeline` because it is expected to contain both
product history and map timeline functionality.

## Current decision

No folder split is needed while the global map timeline is only a placeholder.

Product history files must continue to use explicit `productHistory` naming.
Global map timeline files must use explicit `mapTimeline` or timeline metadata/snapshot naming.

Do not move product history into a separate feature folder unless the product
history UI grows into a larger standalone feature or the global map timeline
backend contract introduces enough code to make this folder ambiguous.

## Current product history contract

`fetchProductHistory(datasetName)` currently returns frontend demo data from
`api/productHistoryApi.js`.

Current frontend shape:

```js
{
  endpointAvailable: false,
  datasetName,
  source: "demo",
  isDemo: true,
  generatedAt: "2026-06-03T13:20:00Z",
  warnings: [],
  events: [
    {
      id: "stable-event-id",
      timestamp: "2026-06-02T10:15:00Z",
      title: "Product frozen",
      description: "User froze the product before export.",
      actor: "Product Manager",
      source: "Demo data",
      type: "freeze",
      details: [
        {
          label: "Previous state",
          value: "Active"
        }
      ]
    }
  ]
}
```

The demo data exists only so the Product History UI can be developed before the
backend contract is ready.

## Expected backend product history questions

Before replacing the demo data, clarify:

1. Is product history an audit log, product state snapshots, or both?
2. Is `datasetName` a stable identifier, or will the backend provide a product id?
3. Which event types are guaranteed?
4. Are event timestamps UTC?
5. Can history events arrive out of order?
6. Should backend history include user/domain actor information?
7. Should export/freeze/send actions appear immediately after successful frontend actions?
8. Should product history include failed operations?

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

## Backend questions to resolve before global map timeline

Before implementing the global map timeline, clarify:

1. Are map timeline snapshots full payloads or incremental changes?
2. Should timeline state include frozen/sent/exported status?
3. Should timeline requests respect the same filters as the live map?
4. What timestamp format is guaranteed by the API?
5. Can timeline events arrive out of order, or should the frontend sort them?
