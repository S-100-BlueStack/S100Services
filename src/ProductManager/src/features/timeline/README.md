# Timeline and product history

This feature area contains two related but separate concepts:

- Product history: history for one selected product.
- Map timeline: global map-level timeline state, snapshots, or time stops.

The current UI implements product history content. The global map timeline is intentionally not implemented until the backend and database model are defined.

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

## Current decision

No folder split is needed while the global map timeline is only a placeholder. Product history files must continue to use explicit `productHistory` naming. Global map timeline files must use explicit `mapTimeline` or timeline metadata/snapshot naming.

Do not move product history into a separate feature folder unless the product history UI grows into a larger standalone feature or the global map timeline backend contract introduces enough code to make this folder ambiguous.

## Current product history contract

`fetchProductHistory(datasetName)` calls the backend product history endpoint and returns normalized frontend history data.

Current frontend shape:

```js
{
  endpointAvailable: true,
  datasetName,
  source: "backend",
  isDemo: false,
  generatedAt: "2026-07-09T13:20:00+02:00",
  warnings: [],
  events: [
    {
      id: "stable-event-id",
      timestamp: "2026-07-09T10:15:00+02:00",
      title: "Product frozen",
      description: "Product status changed from idle to frozen.",
      actor: "DOMAIN\\user",
      source: "backend",
      type: "freeze",
      details: [
        { label: "Previous status", value: "Idle" },
        { label: "New status", value: "Frozen" }
      ]
    }
  ]
}
```

## Current rendering behavior

The shared product history renderer is used by both:

- the main map floating Product History panel
- the Dashboard route-local Product History panel

History event rows are collapsed by default. Collapsed rows show only:

- event title
- timestamp
- short description

Expandable details show technical/event details such as previous status, new status, source state, or other backend-provided metadata. This keeps history panels compact during smoke testing and prevents detailed attributes from dominating the panel.

Each event expands independently. Do not expand all events by default unless a future workflow specifically requires detailed audit comparison.

## Expected backend product history questions

Before expanding the product history contract further, clarify:

1. Is product history an audit log, product state snapshots, or both?
2. Is `datasetName` a stable identifier, or will the backend provide a product id?
3. Which event types are guaranteed?
4. What timezone/offset format is guaranteed by the API?
5. Can history events arrive out of order?
6. Should backend history include user/domain actor information?
7. Should export/freeze/send actions appear immediately after successful frontend actions?
8. Should product history include failed operations?
9. Which event details should be visible in collapsed summaries versus expandable metadata?

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
