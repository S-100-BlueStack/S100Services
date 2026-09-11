# Timeline and product history

This feature area contains two related but separate concepts:

- Product history: history for one selected product.
- Map timeline: global map-level timeline state, snapshots, or time stops.

The current UI implements product history content. The global map timeline is intentionally not implemented until the backend and database model are defined.

BE-108A Batch 1 is ported to workflow-redesign baseline `2ec17a5c47aa353256d0a3445620bebe83e6eecf`. The History endpoint and shared frontend normalizer now support additive explicit audit events while retaining state-history-only payload compatibility.

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

`fetchProductHistory(datasetName)` with no ProductContext is the retained compatibility adapter. It calls the backend product history endpoint directly and returns normalized frontend history data. Dashboard and other established compatibility consumers keep this one-argument boundary.

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

## BE-108A Batch 1 Product History contract

The approved design is documented in:

```text
src/ProductCatalogue/docs/be-108a-product-history-event-design.md
```

The workflow redesign stores Product state history in `dbo.ProductStateHistory`. Its `product_state_history_id` is exposed by the backend as `ProductRecord.Id` / `ProductHistoryResponse.Id` and becomes the frontend `stateRecordId` for inferred state-history events.

### Endpoint envelope

The existing Product History route preserves:

```text
Data: ProductHistoryResponse[]
TotalHits: state-history count
```

and adds:

```text
Events: ProductHistoryEventResponse[]
EventTotalHits: finalized explicit-event count
```

The endpoint uses a dedicated response type and does not change the global generic API envelope. Existing payloads without `Events`/`EventTotalHits` remain supported.

### Normalized sources

The frontend normalizes two distinct sources:

- inferred state-history events from `Data`;
- explicit operation audit events from `Events`.

The normalized UI model preserves source, raw type/outcome values, and identifiers needed for deterministic association.

### Identity and deterministic association

The audit contract preserves:

```text
OperationId
JobId
CorrelationId
StateRecordId
```

An inferred state-history entry may be suppressed only when every condition below is true:

```text
Explicit event type is Export or Rollback
Explicit outcome is Succeeded or SucceededWithWarning
Explicit StateRecordId is present and matches the state-history row Id
Exactly one Data row in the current History payload has that StateRecordId
Normalized inferred operation type matches the explicit event type
```

The normalized operation types must agree. An explicit Export event cannot suppress a Rollback, status, note, Freeze/Unfreeze, or another inferred entry merely because an ID matches.

Duplicate IDs fail closed. If more than one state-history row in the current payload has the same non-empty `StateRecordId`, that ID suppresses no inferred event. Both elements also remain visible for failed/manual-review outcomes, missing or mismatched IDs, type mismatches, status/note entries, and other non-Export/non-Rollback state transitions.

Do not deduplicate through timestamps, dataset/version combinations, array indexes, titles/messages, or rounded dates.

### Outcome handling

Canonical outcomes:

```text
Succeeded
Failed
SucceededWithWarning
RequiresManualReview
```

`RequiresManualReview` represents an operation whose irreversible side effects began but whose final state cannot be proven. Unknown event types/outcomes remain visible with neutral fallback presentation and raw values retained for diagnosis.

Known Product presentation keeps `S101` as `S-101`. Rollback audit events use the established user-facing `Cancel Export` terminology where operation presentation is shown.

### Rendering responsibilities

Collapsed explicit event rows show derived title, timestamp, safe message, and outcome indication. Expanded details may include:

```text
Code
OperationId
JobId
CorrelationId
StateRecordId
structured operation metadata
```

All text continues through safe text APIs; backend content is never rendered as HTML.

### Batch boundary

Batch 1 implements the persistence/read/normalization foundation only. Export and Rollback/Cancel Export are not connected as audit producers, so an empty `Events` array is normal in ordinary runtime use.

Producer-side capture of newly written `ProductStateHistory` IDs, Hangfire recovery metadata, audit finalization recovery, and reconciliation belong to Batch 2 and must be designed against the normalized Product workflow repository. `IProductRepository.AppendAsync` is not changed to return a state ID.

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

## FI-011D source-aware History surfaces

History deliberately distinguishes the legacy compatibility adapter from source-aware consumers:

```txt
fetchProductHistory(datasetName)
  -> direct compatibility History request

fetchProductHistory(datasetName, { productContext })
  -> explicit source-aware decision
```

The one-argument call is retained for compatibility/backend consumers such as Dashboard and does not
resolve through the workspace catalog. Source-aware Main map, Analyze, and Review flows resolve Product
identity before the History call and pass the resulting `ProductContext` explicitly.

An explicit compatibility ProductContext uses the established compatibility History endpoint. Paper
Charts and S-102 return `endpointAvailable: false` plus their source-specific unavailable reason and make
no compatibility History request. An explicitly supplied `null`, invalid, unknown, or unresolved source
context fails closed; it must never be treated as permission to fall back to compatibility History.

Unsupported History is an `unavailable` source/content state, not a failed request. Actual compatibility
backend failures remain `failed`. Main map History carries the selected Graphic's validated ProductContext
through the History event, so a source switch cannot reinterpret stale mock content as compatibility
content. Source deactivation closes an affected non-pinned mock History panel, while unrelated pinned
compatibility History remains independent.
