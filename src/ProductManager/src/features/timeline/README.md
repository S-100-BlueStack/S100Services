# Timeline and product history

This feature area contains two related but separate concepts:

- Product history: history for one selected product.
- Map timeline: global map-level timeline state, snapshots, or time stops.

The current UI implements product history content. The global map timeline is intentionally not implemented until the backend and database model are defined.

BE-108A design documentation is approved against baseline `8caf5f771f1a6721398007589afbe875d553615d`. No BE-108A runtime normalization or API behavior is implemented at this baseline.

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
      description: "The product changed from Idle to Frozen.",
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

History event rows are collapsed by default.

Collapsed rows show only:

- event title
- timestamp
- short description

Expandable details show technical/event details such as previous status, new status, edition/update changes, source state, or other backend-provided metadata. This keeps history panels compact during smoke testing and prevents detailed attributes from dominating the panel.

Each event expands independently. Do not expand all events by default unless a future workflow specifically requires detailed audit comparison.

## History summary interpretation

History summaries are derived from adjacent backend records. Status changes take priority, but edition/update changes are also surfaced. This avoids collapsed rows saying that a product remained in the same status when the actual record change was an edition or update change.

Examples:

- `Status` changed: show a status/freeze/unfreeze summary.
- `Edition` or `Update` increased while status stayed the same: show a version increase summary.
- `Edition` or `Update` decreased while status stayed the same: show a version decrease summary.

The frontend may display negative edition/update values if the backend returns them, but those values should be treated as backend data issues. The frontend should still describe the actual change instead of hiding it behind an unchanged-status summary.

## Approved BE-108A future Product History contract

The approved design is documented in:

```text
src/ProductManager/docs/be-108a-product-history-event-design.md
```

The current frontend continues to normalize legacy state-history records exactly as before. BE-108A runtime behavior is planned later in two batches.

### Future endpoint envelope

The existing Product History route must preserve:

```text
Data: ProductHistoryResponse[]
TotalHits: legacy state count
```

and later add:

```text
Events: ProductHistoryEventResponse[]
EventTotalHits: explicit event count
```

The endpoint uses a dedicated response type. It must not change the global generic API envelope.

### Future normalized sources

The frontend will later normalize two distinct sources:

- legacy state history inferred from `Data`;
- explicit operation audit events from `Events`.

The normalized UI model must preserve the source and identifiers needed for deterministic association.

### Identity and deterministic association

The future contract preserves:

```text
OperationId
JobId
CorrelationId
StateRecordId
```

An inferred legacy entry may be suppressed only when every condition below is true:

```text
Explicit event type is Export or Rollback
Explicit outcome is Succeeded or SucceededWithWarning
Explicit StateRecordId is present and matches the legacy state row Id
Normalized legacy event type matches the explicit event type
```

The normalized operation types must agree. An explicit Export event cannot suppress a Rollback, status, note, Freeze/Unfreeze, or other inferred entry merely because the underlying row ID matches.

Both timeline elements remain visible when the explicit outcome is `Failed` or `RequiresManualReview`, when `StateRecordId` is absent or different, when operation types differ, or when the legacy item normalizes to status/note or another non-Export/non-Rollback type.

Do not deduplicate through:

- timestamps;
- dataset name plus version;
- array indexes;
- titles or messages;
- rounded date values.

When the complete deterministic association rule is not satisfied, explicit audit events and legacy state transitions remain separate timeline elements.

### Outcome handling

Canonical future outcomes:

```text
Succeeded
Failed
SucceededWithWarning
RequiresManualReview
```

`RequiresManualReview` represents an operation whose irreversible side effects began but whose final state cannot be proven. It must have distinct presentation from a confirmed `Failed` operation.

Unknown event types or outcomes must use neutral fallback rendering and remain visible. Do not discard future values and do not predeclare producer-specific event values before the producer contract exists.

### Rendering responsibilities

Collapsed explicit event rows should show derived title, timestamp, safe message, and outcome indication. Expanded details may include:

```text
Code
OperationId
JobId
CorrelationId
StateRecordId
structured operation metadata
```

The frontend must continue to render text through safe text APIs and must not render backend messages as HTML.

### Batch boundary

Batch 1 later adds the endpoint normalization and deterministic association foundation. Batch 2 later connects Export/Rollback producers and recovery outcomes.

Internal validation, IC-ENC report processing, Send to IC-ENC, report content/storage, Dashboard event-source integration, and external worker extraction remain outside BE-108A.

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
