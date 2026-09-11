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
- Cursor-paginated activity rows with a user-selectable page size of 25, 50, 100, or 200; 50 remains the default.
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
- `sortBy`: `time`, `product`, `activity`, or `status` (default `time`)
- `sortDirection`: `asc` or `desc` (default `desc`)

The frontend sends the selected Dashboard page size as `pageSize`, using 50 when no valid browser preference exists. Supported UI values are 25, 50, 100, and 200. Page size is intentionally not encoded in the Dashboard route URL. Omitting `pageSize` preserves the legacy full-list response behavior for existing consumers. A cursor is valid only together with `pageSize`.

Default ordering is deterministic: `Timestamp DESC`, then immutable activity `Id DESC`. FI-010 adds the alternate orderings and sort-aware cursor contract documented below. The current activity ID uses the persisted `ProductRecord.Id` GUID when available. The cursor is opaque to consumers and represents the final sort key on the returned page.

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

Dashboard activity classification is owned by the backend endpoint. The backend owns Dashboard classification, filtering, sorting and paging. The frontend normalizes and renders the supplied activity order without duplicating source-state mapping rules.

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

Search is debounced by 300 ms. Debounced search edits supersede older responses through request identity checks without routinely aborting the previous browser request. Immediate range, select-filter, page and manual-refresh actions abort stale in-flight requests. Filter, range, and page-size changes reset pagination to the first page. Previous/Next navigation keeps a client-side cursor stack, while the cursor values themselves remain backend-owned and opaque. A page-size change invalidates the current cursor chain before the replacement request starts, so cursors created for another page-size generation cannot be reused even if the replacement request fails.

Summary cards, status summary and operation summary always represent the complete filtered result. They are never calculated from only the visible page. `Paging.Total` is the complete filtered activity count; `Paging.Returned` is the number of rows on the current page.

The backend currently obtains the complete date-bounded JobTable history through `GetHistoryAsync`, maps and filters it in the API process, and returns only the requested page. This bounds network payload and browser work without a schema change. Repository-level SQL filtering/index work remains evidence-driven and must be based on measured query plans and volume.

The Dashboard keeps the last successful result visible while a request loads. If a refresh/filter request fails, the existing result stays visible with a compact error banner. The failed request does not silently switch to demo data. A failed page request restores the prior cursor state so the page controls remain consistent with the visible result.

## Verification

Automated coverage includes backend filtering/paging semantics, complete-result summaries, filter options, backward-compatible unpaged requests, stable equal-timestamp ordering, report filters, empty results, query validation, frontend query serialization, cursor history, paging normalization and search-value preservation.

Manual verification by the project owner confirmed that Dashboard pagination works as intended at commit `7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd`.

## Server-side activity sorting

FI-010 is implemented against `d68e18e7fc91512c91af57299ccdbc1b94ee7077`; local build and manual acceptance remain pending.

Every frontend Dashboard request sends `sortBy` and `sortDirection`. Omitting them remains compatible with earlier clients and defaults to `time` / `desc`. An explicitly invalid value, including an empty or whitespace-only value, returns HTTP 400 before history is read. Tokens are trimmed and normalized to lowercase.

| Header   | API field  | Authoritative value                   | Initial direction when selected |
| -------- | ---------- | ------------------------------------- | ------------------------------- |
| Time     | `time`     | `Timestamp`                           | `desc`                          |
| Product  | `product`  | `DatasetName`                         | `asc`                           |
| Activity | `activity` | `Title` (displayed title, not `Type`) | `asc`                           |
| Status   | `status`   | `Status`                              | `asc`                           |
| Links    | None       | Not sortable                          | None                            |

`sortDirection` accepts `asc` and `desc`. Time ordering uses `Timestamp ASC/DESC`, then `Id DESC`. Text ordering uses the selected primary value `ASC/DESC`, then `Timestamp DESC`, then `Id DESC`. Text comparison uses `StringComparer.OrdinalIgnoreCase`; ID comparison uses `StringComparer.Ordinal`. The processor shares the ordering comparison with cursor continuation to preserve identical tie-break semantics.

The processor remains responsible for filtering, sorting, cursor continuation and paging after `GetHistoryAsync` and activity classification. No repository interface, SQL, schema or response DTO changes are required. Summaries still use the complete filtered result. Frontend activity normalization preserves the backend array order, including equal timestamps; it does not sort the current page again.

### Cursor compatibility

New responses generate opaque Base64Url cursors with a version marker, sort field, direction, textual primary value where applicable, UTC timestamp ticks and activity ID. The internal representation is not a client contract. Unknown versions and malformed values return the existing invalid-cursor HTTP 400 response. A valid cursor for another field or direction returns HTTP 400 with `The 'cursor' query parameter does not match the requested sort.`

Legacy timestamp/ID cursors remain valid only with `time` / `desc`, whether those defaults are implicit or explicit. New responses always generate the versioned format. The frontend never decodes or edits cursors. Cursor requests still require `pageSize`, and omitting `pageSize` still returns the complete filtered list.

Paging reads the current history for each request; it does not introduce snapshot isolation across concurrent history changes. Use unchanged data and a fixed range when checking complete cursor traversal for duplicate or missing rows.

### Session state and request lifecycle

A fresh Dashboard session starts at Time DESC. Sort is Dashboard-local and is never stored in localStorage, Preferences or the route URL. Filter, search, range, refresh, page-size and Previous/Next operations preserve the active sort.

Native buttons inside `th scope="col"` provide Tab, Enter and Space behavior. Only the active header has `aria-sort="ascending"` or `aria-sort="descending"`. Direction indicators are hidden from assistive technology; the accessible button name describes the next action. The existing focus capture/restore lifecycle uses `data-dashboard-sort-key` to restore the activated header after replacement without overriding focus the user has subsequently moved elsewhere. Headers remain available when the loaded result is empty.

Selecting the active column toggles direction. Selecting another column starts with the direction in the table above. Each sort change immediately clears the cursor and history, cancels a pending search debounce, and uses the existing request identity and AbortController boundary to supersede older work. Paging is blocked while that sort transition is pending.

A successful sort loads page 1. A failed sort retains the last successful rows, restores the last successful sort and cursor history, and shows the existing Dashboard error banner. Multiple pending sorts share the last successful rollback state, so an unfinished intermediate sort cannot become the fallback. FI-009 page-size generations still take precedence: failure never reactivates cursors from an older page-size generation. A newer filter/range/size/refresh request that supersedes a sort uses the same success/failure boundary.

### FI-010 verification

No dependencies were added. Frontend Node tests cover query defaults/serialization, selection rules, controller request races and failure restoration, page-size preservation, native header structure, focus identity, and payload order. Backend tests cover all eight orderings, stable duplicate primary/timestamp ties across cursor pages, legacy and versioned cursors, validation, summaries, and controller HTTP 400 responses before repository access.

Run from the repository root on the configured development machine:

```powershell
Push-Location .\src\ProductCatalogue
npm run check
Pop-Location

dotnet test .\tests\TestProductManager\TestProductManager.csproj -c Release --filter "FullyQualifiedName~DashboardQueryProcessorTests|FullyQualifiedName~DashboardControllerSortTests"
dotnet build .\src\ProductCatalogueAPI\ProductCatalogueAPI.csproj -c Release
```

The backend projects require their existing Windows/.NET/ArcGIS development prerequisites. No prerequisites should be installed solely to validate this candidate in Work.

### FI-010 manual acceptance

| Check                                                          | Expected result                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1. Fresh Dashboard load                                        | Time DESC; newest activities first.                                                   |
| 2. Toggle Time twice                                           | ASC then DESC; equal timestamps retain ID DESC.                                       |
| 3. Select and toggle Product                                   | ASC then DESC across the complete result.                                             |
| 4. Select and toggle Activity                                  | ASC then DESC by displayed title.                                                     |
| 5. Select and toggle Status                                    | ASC then DESC by status.                                                              |
| 6. Inspect Links                                               | Plain header, no sort interaction or keyboard stop.                                   |
| 7. Next/Previous under each sort                               | Active sort and stable ordering survive navigation.                                   |
| 8. Traverse fixed, unchanged data                              | Every activity ID appears once; duplicate primary values and timestamps are included. |
| 9. Change sort on page 2+                                      | Page 1 loads; Previous is unavailable and old cursors are discarded.                  |
| 10. Change page size                                           | Sort survives; FI-009 restarts page 1 with the selected size.                         |
| 11. Change filters/search/range                                | Sort survives and paging resets as before.                                            |
| 12. Refresh                                                    | Sort survives; current cursor semantics remain unchanged.                             |
| 13. Tab, Enter and Space                                       | All four native sort buttons are operable.                                            |
| 14. Rerender after keyboard sort                               | Focus stays on that header; moving focus elsewhere is respected.                      |
| 15. Light/dark mode                                            | Compact angular headers, visible direction and focus indicator.                       |
| 16. Open existing row links                                    | History, Review and Analyze still work.                                               |
| 17. Fail a sort on page 2+                                     | Old rows, sort and paging restored with the existing error banner.                    |
| 18. Delay rapid Product ASC, Product DESC, Status ASC requests | Only the latest active request updates rows or errors.                                |

## Dashboard page-size preference

The Activity list pagination footer owns a compact `Rows per page` selector with exactly `25`, `50`, `100`, and `200`. The selected logical number is stored in browser-local Dashboard state under `pc.dashboard.pageSize.v1`. Missing, malformed, or unsupported values normalize to `50`.

Changing the selector preserves the current range, search, and filters, clears the cursor stack, aborts superseded requests, and reloads page 1 with the selected size. The existing request ID/AbortController boundary prevents an older page or page-size response from replacing newer state. If the replacement request fails, the last successful Dashboard result remains visible, while its old cursor chain stays disabled until a request for the current page-size generation succeeds.

The existing Preferences `Reset available preferences` action clears this Dashboard value when used on the Dashboard route. The Dashboard controller receives the reset and immediately returns to page size `50` without adding page size to the public route URL.

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
