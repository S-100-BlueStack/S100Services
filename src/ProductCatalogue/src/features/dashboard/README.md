# Dashboard

Current reviewed runtime baseline: `7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd`.

FI-001 introduces a separate read-only Dashboard route at `/dashboard`. The Dashboard is intentionally isolated from the main map, Product Collection, Analyze and Review state. It summarizes operational activity for a selected range and links users onward to product-level Review or Analyze pages.

## Current status

FI-001 and BE-107 are complete and manually verified at `7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd`. BE-107 adds bounded server-side filtering and cursor pagination without changing the route or the existing range semantics.

Implemented scope:

- Dedicated `/dashboard` route.
- Navbar link for Dashboard.
- Backend endpoint integration through `GET electronicproducts/dashboard`.
- Danish operational time handling through backend-provided `Europe/Copenhagen` range metadata.
- Always-visible Danish local `From` and optional `To` date/time controls.
- Compact Dashboard-owned date picker for date selection so month/year navigation stays predictable.
- Quick range action buttons for `Since yesterday` and `Last 7 days` that fill the range fields without loading data.
- `Apply` loads data for the currently selected range.
- `Refresh` reloads the currently applied range.
- Summary cards for operational activity counts.
- Compact activity list with product links.
- Debounced server-side search.
- Server-side filters for type, status, importance, reports and product.
- Cursor-paginated activity rows with a default page size of 50.
- Request cancellation so stale filter/search responses cannot replace newer results.
- Last-successful-result retention during refresh and request failures.
- Status and operation breakdowns.
- Actionable status and operation summary rows that apply matching activity filters.
- Review and Analyze links from activity rows.
- Dashboard History panel that opens from activity-row `History` actions.
- Dashboard History panel can be closed with `Close` or `Escape`.
- Dashboard History panel shows selected activity context above the product timeline.
- Dashboard highlights the activity row whose `History` action opened the panel.
- Dashboard History panel loads product state lookups before normalizing backend history so numeric status IDs render as status names.
- Dashboard History panel uses the shared collapsed Product History event renderer.
- Backend activity classification maps raw product states into dashboard-oriented activity type, status, severity and title values.
- Disabled or placeholder report actions until report URLs or report detail endpoints exist.

## Backend contract

The frontend calls:

```http
GET electronicproducts/dashboard?from=2026-07-07
GET electronicproducts/dashboard?from=2026-07-01
GET electronicproducts/dashboard?from=2026-07-01T08:15:00
GET electronicproducts/dashboard?from=2026-07-01T08:15:00&to=2026-07-07T16:45:00
GET electronicproducts/dashboard?from=2026-07-01&search=failed&type=export&pageSize=50
GET electronicproducts/dashboard?from=2026-07-01&pageSize=50&cursor={continuationToken}
```

Range query values are sent in Danish operational time. The Dashboard header always shows `From` and optional `To` date/time fields.

`Since yesterday` and `Last 7 days` are quick actions that only fill the fields; they do not load data until the user selects `Apply`. Selecting a `From` date defaults its time to `00:00`; selecting a `To` date defaults its time to `23:59`. Leaving `To` empty keeps the range open-ended, so refresh requests continue to include the latest backend activity.

The backend interprets offset-free datetime values as `Europe/Copenhagen` wall time, not UTC.

Supported additive query parameters:

- `search`
- `product`
- `type`
- `status`
- `importance`: `all`, `important`, or `failed`
- `reports`: `all`, `any`, `ic-enc`, or `internal-validation`
- `pageSize`: 1-200
- `cursor`: opaque continuation token returned by the previous response

The frontend uses `pageSize=50`. Omitting `pageSize` preserves the legacy full-list response behavior for existing consumers. A cursor is valid only together with `pageSize`.

Ordering is deterministic: `Timestamp DESC`, then immutable activity `Id DESC`. The current activity ID uses the persisted `ProductRecord.Id` GUID when available. The cursor is opaque to consumers and represents the final sort key on the returned page.

Expected payload shape:

```json
{
  "Success": true,
  "Data": {
    "GeneratedAt": "2026-07-08T12:15:00+02:00",
    "Range": {
      "From": "2026-07-07T00:00:00+02:00",
      "To": "2026-07-08T12:15:00+02:00",
      "TimeZone": "Europe/Copenhagen"
    },
    "Summary": {
      "TotalActivities": 42,
      "ProductsTouched": 18,
      "ImportantChanges": 6,
      "FailedOperations": 2,
      "ReportsAvailable": 9
    },
    "StatusSummary": [
      { "Status": "active", "Count": 12 },
      { "Status": "completed", "Count": 8 },
      { "Status": "failed", "Count": 2 }
    ],
    "OperationSummary": [
      { "Type": "export", "Count": 12, "Failed": 1 },
      { "Type": "freeze", "Count": 4, "Failed": 0 }
    ],
    "Paging": {
      "PageSize": 50,
      "Returned": 50,
      "Total": 142,
      "HasMore": true,
      "NextCursor": "opaque-token"
    },
    "FilterOptions": {
      "Types": [{ "Value": "export", "Label": "Export" }],
      "Statuses": [{ "Value": "failed", "Label": "Failed" }],
      "Products": [{ "Value": "101DK0040943E", "Label": "101DK0040943E" }]
    },
    "Activities": [
      {
        "Id": "activity-123",
        "Timestamp": "2026-07-08T07:45:00+02:00",
        "DatasetName": "101DK0040943E",
        "ProductName": "101DK0040943E",
        "Type": "validation",
        "Severity": "critical",
        "Title": "Product rejected",
        "Description": "The product was rejected by validation.",
        "Status": "failed",
        "Actor": "DOMAIN\\user",
        "Links": {
          "Review": true,
          "Analyze": true,
          "History": true,
          "IcEncReports": [],
          "InternalValidationReports": []
        },
        "Details": [{ "Label": "Source state", "Value": "Rejected" }]
      }
    ]
  }
}
```

## Activity classification

Dashboard activity classification is owned by the backend endpoint. The frontend should render and filter the returned `Type`, `Status` and `Severity` values, not duplicate source-state mapping rules.

Current intended classification examples:

```txt
ProductState.Exported  -> Type: export,     Status: completed, Severity: normal
ProductState.Frozen    -> Type: freeze,     Status: active,    Severity: important
ProductState.InTransit -> Type: send,       Status: active,    Severity: normal
ProductState.Rejected  -> Type: validation, Status: failed,    Severity: critical
ProductState.Idle      -> Type: lifecycle,  Status: idle,      Severity: normal
```

The source backend state can still appear in activity details as `Source state` for traceability.

## Range builder

The Dashboard does not use separate preset modes. It uses one always-visible range builder:

```txt
[Refresh] [Apply] [Since yesterday] [Last 7 days] [From date] [From time] [To date] [To time]
```

Behavior:

- `From` is required before `Apply` can load data.
- `To` is optional.
- `Since yesterday` sets `From` to yesterday at `00:00` and clears `To`.
- `Last 7 days` sets `From` to seven calendar days back at `00:00` and clears `To`.
- Quick range actions do not load data directly.
- `Apply` loads the selected range and updates the URL query.
- `Refresh` reloads the currently applied range.
- The custom date picker is Dashboard-owned and should stay compact because it lives in the route header.

## Server-side filtering and cursor paging

Dashboard filters are request parameters. The backend applies all filters before it calculates summary values or selects the visible page.

The active filters are:

- free-text search
- type
- status
- importance
- reports
- product

Search is debounced by 300 ms. Debounced search edits supersede older responses through request identity checks without routinely aborting the previous browser request. Immediate range, select-filter, page and manual-refresh actions abort stale in-flight requests. Filter and range changes reset pagination to the first page. Previous/Next navigation keeps a client-side cursor stack, while the cursor values themselves remain backend-owned and opaque.

Summary cards, status summary and operation summary always represent the complete filtered result. They are never calculated from only the visible page. `Paging.Total` is the complete filtered activity count; `Paging.Returned` is the number of rows on the current page.

The backend currently obtains the complete date-bounded JobTable history through `GetHistoryAsync`, maps and filters it in the API process, and returns only the requested page. This bounds network payload and browser work without a schema change. Repository-level SQL filtering/index work remains evidence-driven and must be based on measured query plans and volume.

The Dashboard keeps the last successful result visible while a request loads. If a refresh/filter request fails, the existing result stays visible with a compact error banner. The failed request does not silently switch to demo data. A failed page request restores the prior cursor state so the page controls remain consistent with the visible result.

## Verification

Automated coverage includes backend filtering/paging semantics, complete-result summaries, filter options, backward-compatible unpaged requests, stable equal-timestamp ordering, report filters, empty results, query validation, frontend query serialization, cursor history, paging normalization and search-value preservation.

Manual verification by the project owner confirmed that Dashboard pagination works as intended at commit `7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd`.

## Actionable summaries

`Status summary` and `Operation summary` rows are actionable:

- Selecting a status row applies the matching status filter.
- Selecting an operation row applies the matching type filter.
- Selecting an already active summary row toggles the corresponding filter off.
- `Clear filters` resets search, filters and active summary row state.

These summary panels should stay small and data-oriented. Do not reintroduce the removed `Important changes` panel unless it becomes a clearly filterable and useful activity concept.

## Dashboard History panel

The activity-row `History` action opens a route-local panel in the Dashboard right column. The panel intentionally replaces the status and operation summaries while it is open, so it uses the same vertical space as the activity table and avoids an extra floating overlay.

The panel reuses the existing product history API and renderers:

```js
fetchProductHistory(datasetName);
createProductHistorySummary(history);
createProductHistoryEventList(history.events);
```

Behavior:

- The panel opens only for activities with a `datasetName` and `Links.History = true`.
- The panel has a single `Close` action and also closes on `Escape`.
- Closing the panel restores `Status summary` and `Operation summary`.
- The row whose `History` action opened the panel is highlighted while the panel is open.
- The active activity row's `History` button is marked as active.
- A compact selected-activity context card is shown above the product history timeline.
- The panel header/close area is sticky within the panel.
- Loading, empty and error states stay inside the panel content area and keep the panel header available.
- Product state lookups are loaded before history normalization so backend status IDs render as status names.
- Product history events are collapsed by default.
- Collapsed event rows show only the title, timestamp and short description.
- Details such as previous status, new status and source state are revealed only when the user expands a row.
- The Dashboard panel does not pin, auto-close on popup state, or interact with Product Collection.

History panel guidance:

- Keep the panel route-local; do not reuse main-map popup lifecycle or pinning behavior.
- Keep the panel simple; do not turn it into a second Review workspace.
- Prefer compact context and timeline content over additional action bars.
- Keep the panel aligned with the activity table and right summary column rather than using a floating overlay.

## Report links

Report links support multiple IC-ENC and internal validation report metadata entries. Until report URL endpoints exist, Dashboard renders report metadata as available but keeps the action as a placeholder notice or disabled action depending on the metadata returned by the backend.

Dashboard should not fetch full report content as part of the activity payload. The activity endpoint should return only enough metadata to show summary rows and route users to a report detail endpoint later.

## Future scope

The following work remains intentionally outside phase 1:

- Add real IC-ENC report links when backend report IDs/storage contract exists.
- Add real internal validation report links when backend report IDs/storage contract exists.
- Improve important-change classification only if it becomes useful as a filterable activity concept.
- Consider richer dashboard charts only if they remain compact and data-oriented.
