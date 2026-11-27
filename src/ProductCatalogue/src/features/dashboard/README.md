# Dashboard

Current reviewed Dashboard baseline: `6a29ee5abee23b5ce741a69732d9f67ad805b95d`.

FI-001 introduces a separate read-only Dashboard route at `/dashboard`. The Dashboard is intentionally isolated from the main map, Product Collection, Analyze and Review state. It summarizes operational activity for a selected range and links users onward to product-level Review or Analyze pages.

## Current status

FI-001 and BE-107 remain complete, and FI-033/FI-034 are manually accepted through `6a29ee5abee23b5ce741a69732d9f67ad805b95d`. BE-107 adds bounded server-side filtering and cursor pagination without changing the route or the existing range semantics.

Implemented scope:

- Dedicated `/dashboard` route.
- Navbar link for Dashboard.
- Backend endpoint integration through `GET electronicproducts/dashboard`.
- Danish operational time handling through backend-provided `Europe/Copenhagen` range metadata.
- Always-visible Danish local `From` and optional `To` date/time controls.
- Compact Dashboard-owned date picker for date selection so month/year navigation stays predictable.
- Calendar month navigation keeps the same buttons mounted to preserve keyboard focus; day buttons
  expose full accessible dates, including adjacent-month dates, and distinguish selected and current dates.
- Committed valid date and time changes apply automatically; invalid or incomplete drafts remain editable without requesting or changing the route.
- Compact icon-only `Refresh` reloads the currently applied range and retains an accessible name and hover help.
- An adjacent `HH:MM` value represents only the most recent accepted successful Dashboard load.
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
- Direct report URLs when supplied and on-demand artifact-history downloads for electronic Product report links.

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

The range UI no longer exposes preset shortcut buttons or an Apply action, but the default and historical preset route values remain compatible. Selecting a `From` date defaults its time to `00:00`; selecting a `To` date defaults its time to `23:59`. A committed valid draft applies once through the shared Dashboard request lifecycle. Leaving `To` empty keeps the range open-ended, so refresh requests continue to include the latest backend activity. Open a populated optional To date picker and choose `Clear date`, or focus its trigger and press `Delete` or `Backspace`, to clear both date and time and automatically apply the open-ended range.

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

The Dashboard endpoint must return an object containing `Activities` (or `activities`) as an
array. `[]` is a valid empty result; an absent or malformed array, an invalid response body,
unexpected HTML, or an explicit unsuccessful response envelope is a load failure, not a
successful empty Dashboard. The adapter checks this contract before normalization. The shared
API client still permits bodyless HTTP 204 responses on endpoints that support them; Dashboard
requires a payload. A failed Dashboard read preserves the last accepted rows, paging and
last-successful-load timestamp and displays the existing error state.

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
Missing or unsupported Activity status displays as neutral `Unknown` in the Activity table
and History context. Such rows contribute no fallback status option. Server-supplied options,
counts and the reported status of valid rows remain authoritative.

## Range builder

The Dashboard does not use separate preset modes. It uses one always-visible range builder:

```txt
[From date] [From time] [To date] [To time] [Refresh icon] [HH:MM]
```

Behavior:

- `From` is required before a draft can apply.
- `To` is optional.
- A valid date selection applies automatically and updates the URL query through the existing `pushState` route path. Native time `input` events update only the editable draft. Keyboard time editing commits when focus leaves the range group; pointer-driven native time-picker changes commit after the browser focus transition settles, unless focus moved directly to another range control.
- Native time controls require a complete valid `HH:MM` value before the draft can apply. An incomplete browser-owned value such as `15:--` stays draft-only, sends no request, and is intentionally not normalized to `15:00`; an application-owned time control is deferred unless later user feedback justifies that UX change.
- The committed range becomes the controller's applied state immediately, while its request/render is queued to the next browser task. This lets the focus/click that committed the edit finish first, and a directly following Refresh/filter/sort/page-size action coalesces with the pending range load instead of issuing a duplicate request.
- Invalid or incomplete drafts do not request, change the URL, clear results, or publish an API error. A later committed edit that completes a valid draft applies the complete draft.
- `Refresh` reloads the currently applied range, never an invalid in-progress draft.
- The last-successful timestamp updates only with an accepted successful response. Failed, aborted, and stale responses retain the previous timestamp and rendered result.
- The contextual date-picker action, `Delete`, or `Backspace` clears the optional To date and paired time and applies the existing open-ended range contract once; route and API serialization continue to omit `to`.
- `Since yesterday` and `Last 7 days` remain accepted route/domain values for existing bookmarks and default-range behavior even though their shortcut buttons are no longer visible.
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

Search is debounced by 300 ms. Discrete filters and summary-row actions remain immediate. A committed range supersedes a pending search timer because its request already contains the latest filter draft; this avoids a duplicate delayed load. Debounced search edits supersede older responses through request identity checks without routinely aborting the previous browser request. Immediate range, select-filter, page and manual-refresh actions abort stale in-flight requests. Filter, range, and page-size changes reset pagination to the first page and invalidate cursor history while preserving the active sort and page size. Previous/Next navigation keeps a client-side cursor stack, while the cursor values themselves remain backend-owned and opaque. A page-size change invalidates the current cursor chain before the replacement request starts, so cursors created for another page-size generation cannot be reused even if the replacement request fails.

Summary cards, status summary and operation summary always represent the complete filtered result. They are never calculated from only the visible page. `Paging.Total` is the complete filtered activity count; `Paging.Returned` is the number of rows on the current page.

The backend currently obtains the complete date-bounded JobTable history through `GetHistoryAsync`, maps and filters it in the API process, and returns only the requested page. This bounds network payload and browser work without a schema change. Repository-level SQL filtering/index work remains evidence-driven and must be based on measured query plans and volume.

The Dashboard keeps the last successful result visible while a request loads. If a refresh/filter request fails, the existing result stays visible with a compact error banner. The failed request does not silently switch to demo data. A failed page request restores the prior cursor state so the page controls remain consistent with the visible result.

The controller remains the single owner of applied range, route publication, request identity, `AbortController`, paging/cursor state, sort rollback, page-size generation and last-successful `HH:MM`. The UI owns the editable range draft. Rerenders preserve that draft while its applied range key is unchanged; a successful commit or Back/Forward route change synchronizes the controls from the newly applied range. Dashboard History and FI-032 navigation are unchanged.

## Verification

Automated coverage includes backend filtering/paging semantics, complete-result summaries, filter options, backward-compatible unpaged requests, stable equal-timestamp ordering, report filters, empty results, query validation, frontend query serialization, cursor history, paging normalization and search-value preservation.

FI-034 automated coverage adds draft validation without fallback, keyboard/pointer time commit boundaries, focus-safe next-task range application, duplicate/coalescing suppression, open-ended To clearing, invalid route/request suppression, manual Refresh against applied state, page/cursor reset, sort/page-size preservation, search debounce interleaving, stale/failure retention and accepted-success timestamp publication. Manual browser verification is complete; the accepted native time contract requires a complete valid `HH:MM` value before application.

Manual verification by the project owner confirmed that Dashboard pagination works as intended at commit `7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd`.

## FI-034 manual acceptance

FI-034 was manually accepted in the browser on 2026-09-17 and committed at `6a29ee5abee23b5ce741a69732d9f67ad805b95d`. The accepted Dashboard has no Apply control: valid committed range edits apply automatically while invalid or incomplete drafts preserve the last applied route, result and `HH:MM`. Keyboard entry in native time fields can be completed without an intermediate request/rerender or focus reset; focus can move between the range controls on the first interaction, and leaving the range group commits one valid draft. Native time values must be complete valid `HH:MM` values. Browser-owned incomplete values such as `15:--` remain draft-only and are not interpreted as `15:00`. Optional To clearing, manual Refresh against applied state, 300 ms search debounce, immediate discrete filters/summary actions, page reset/cursor invalidation, sort/page-size preservation, Back/Forward, Dashboard History, FI-032 navigation, responsive layout and light/dark behavior were preserved. The local frontend check passed and formatting was run before commit.

## FI-033 manual acceptance

FI-033 was manually accepted in the browser on 2026-09-17 and committed at `01f22a605e8e4d29a8da187306af1dc04b8540ef`. The accepted Dashboard removes redundant visible page chrome and preset shortcuts, keeps one compact From/To/Apply toolbar, and places an icon-only Refresh control with the last-successful `HH:MM` immediately after Apply. The final Refresh implementation is a semantic native button containing the public Calcite refresh icon; the application owns its symmetric 30x30 hit area, hover/focus presentation, tooltip and accessible name without styling Calcite shadow DOM. The timestamp updates only when the existing request-generation boundary accepts a successful response and is unchanged by failed, aborted or stale requests. Optional To remains open-ended when cleared through the contextual date-picker action or Delete/Backspace. Explicit Apply remains until FI-034. Browser acceptance also covered paging/page size, sorting, filters, Dashboard History, FI-032 navigation, responsive layout, keyboard/focus behavior, and light/dark mode. The local frontend check passed and formatting was run before commit.

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
- A failed product-state lookup is not cached permanently. A later explicit History open retries the lookup; concurrent opens share the pending request, and a successful lookup remains cached.
- Closing History or selecting another activity invalidates older lookup and History results. An obsolete lookup must not initiate a new History request or show a stale error notice.

History panel guidance:

- Keep the panel route-local; do not reuse main-map popup lifecycle or pinning behavior.
- Keep the panel simple; do not turn it into a second Review workspace.
- Prefer compact context and timeline content over additional action bars.
- Keep the panel aligned with the activity table and right summary column rather than using a floating overlay.

## R01B validation artifact links

The Dashboard activity-row `IC-ENC` and `Validation` actions open the same route-local
right-column panel layout used by `History`. Only one of History, IC-ENC reports or Validation
reports may be open at a time. Each report panel replaces the Status and Operation summaries
while open and restores them when closed, including via Escape. The activity row and the
selected action remain highlighted; keyboard focus follows the existing Dashboard action
focus-restoration behavior.

Reports are never expanded inline in the activity table. Direct URLs provided by the activity
remain available as individual downloads in the panel, without an additional artifact-history
request. Where no direct URL exists, opening the report panel resolves the Product and retrieves
its artifact history on demand. IC-ENC uses only `Kind: IcEncReport`, while Validation uses
`ValidationReport` and `ValidationDiagnostic`. The Product/specification ownership checks remain
unchanged. Unknown or unattributed artifacts never produce download links.

The panel displays loading, empty, error and excluded-file states without replacing a failed
request with a successful empty result. Switching report type/activity, opening History, closing
or pressing Escape invalidates older request results. Failed requests can be retried by opening
the action again. No validation reports are fetched as part of a Dashboard activity query.

The current activity API does not yet populate `IcEncReports`; on-demand report lists represent
the Product's available artifact history, not files proven to belong to the clicked activity.

## PC-UX-R06 v3 – compact reporting workspace (review candidate)

This candidate revises the visual layout only. The six existing KPI totals are placed
in a compact, two-row, three-column group above the activity list, while the right
column becomes a wider reporting area. The status breakdown is shown as a donut
with clickable, labeled status legend items; operations use clickable vertical
bars. Both read the **complete filtered** server summaries rather than the
current activity page. A status-chart "Completed" segment means an operational
status, **not** that an ENC has been accepted for distribution.

The activity table remains searchable, sortable and cursor-paged, with stable
pixel widths set on its column headers for Time, Product, Status and Links. The
Activity column gets the remaining space. Colored status pills and an operation-
type marker add scanability, but the labels and original details remain readable
and accessible. The existing `Review`, `Analyze`, `History`, `IC-ENC` and
`Validation` actions are unchanged. Horizontal table scrolling remains available
when the viewport cannot accommodate the full minimum width.

The `Failed` KPI is also a button. It toggles the existing server-side
`importance=failed` filter; `aria-pressed` reflects that filter, and focus is
restored through the established Dashboard focus-key mechanism. Status and
operation charts retain their original server-filter behavior. No additional
requests, new endpoints, library dependencies, or state owners were introduced.
The Accepted-for-distribution KPI remains unavailable because the existing
backend contract does not expose an authoritative, full-range acceptance count.

This is a **browser-review candidate**, not a claim of acceptance. Verify light
and dark themes, reduced motion, keyboard and focus, panel toggle/escape,
zero-result ranges, 150% zoom, and responsive chart/table layout. The previous
R06 v2 layout remains a historical candidate rather than the current design.

## PC-UX-R06 v4 – Backend reporting integration

The committed R06 v3 reporting layout is preserved. The new read-only aggregates from
`GET electronicproducts/dashboard` (PC-BE-R06, committed by the developer at
`dca718363ec901add42985e4da1755fecf409a31`) are normalized in
`domain/dashboardReporting.js`; existing APIs, activity filters, cursor pagination,
sorting, request generations and History/IC-ENC/Validation panel flows are unchanged.
No chart dependency or additional request is introduced.

- The **Accepted for distribution** KPI uses **`Distribution.Live.Accepted`**, the
  number of persisted live IC-ENC acceptance decisions in the selected interval.
  Simulated acceptances are reported separately in supporting text and in the
  distribution overview; neither ReadyForDistribution nor Completed is treated
  as acceptance. Counts refer to immutable revision deliveries, not packages.
- **Open errors** uses `OperationalHealth.OpenErrors`, the current count of Error
  or Rejected Product tracks. This is independent of the historical date range.
  The existing **Failed events** KPI continues to filter historical activity
  with `importance=failed`. The status donut retains historical Active events.
- The right column adds live send/decision counters, a daily Activity trend,
  Product-specification event totals, current workflow state, stored-report-file
  categories and a live distribution trend when there are actual live outcome
  buckets. Existing status and operation charts remain clickable activity filters.
- The daily chart is based on all backend-filtered activity events before
  pagination; it displays up to the latest 14 **days with activity**. A wider
  date range is not silently represented as only those 14 days: total counts
  still describe the full query and a visible note explains the chart limit.
- Distribution, report files and current track state obey their own documented
  backend scopes. Search/type/status/importance/report activity filters do not
  change unrelated live delivery decisions or current track health. File counts
  represent files, including individual diagnostic attachments, not validation
  runs. `ReportArtifacts` does not create speculative activity-specific links;
  the existing Product-scoped artifact-history report panel remains unchanged.
- Optional new API fields are not mandatory for historical/demo responses.
  Missing/invalid reporting counters display **unavailable** rather than a
  falsely successful zero, while an explicit authoritative zero remains zero.
  No mock live success is generated for demonstration.

Manual acceptance must cover live 0 / simulated 2 from the known runtime sample,
current open error 1 versus historical Failed 2, all UI and filter scopes,
keyboard/focus, panel toggle/rapid switching, mobile layout, reduced motion,
light/dark themes, ranges with 0 or 1 day of activity, and a range with genuine
live IC-ENC decisions. Real artifact downloads and future backend writes are
outside this frontend integration.

## Dashboard request lifecycle

Search changes normally use a 300 ms debounce. An immediate Refresh (toolbar or controller API) and browser Back/Forward navigation cancel any pending search timer before starting their own request. The currently applied search/filter state is retained; history navigation still applies the route range and resets paging. Range auto-apply, sorting, page-size changes, and teardown retain their existing timer cleanup and request-generation guards. A cancelled timer must not schedule a second load or update the last-successful-load timestamp.

## Report links

Both report actions open the right-side detail panel rather than an inline disclosure.
Multiple direct URLs are shown individually. Otherwise, opening a panel performs one
Product-scoped artifact lookup; moving to another panel or closing it prevents obsolete
responses from publishing. Real report counts and activity-specific attribution still depend
on the Dashboard backend projection.

Dashboard should not fetch full report content as part of the activity payload. The activity
endpoint should return only enough metadata to show summary rows and route users to a report
detail endpoint later.

## Future scope

The following work remains intentionally outside phase 1:

- Activity-specific report links remain unavailable because ProductStateHistory does not carry revision-specific artifact ownership; Product-scoped reports and server-side report filters already use persisted artifact metadata.
- Verify whether Dashboard activity report IDs should map to a specific validation artifact rather than the Product's available artifact history.
- Improve important-change classification only if it becomes useful as a filterable activity concept.
- Consider explicit daily zero buckets and a longer-term trend zoom if reporting ranges become substantially longer; the current chart uses backend-owned event-day buckets.

## PC-UX-R05 tooltip follow-up (candidate)

The visible Product cell, Search/Type/Status/Importance/Reports/Product filter
controls and Rows per page selector use their existing visible labels and native
controls without a second hover-help overlay. Screen-reader labels and helpful
icon-only actions remain unchanged. The approved short copy for Refresh,
History, IC-ENC and Validation help is included in R05 v2, without changing
report capability checks or unavailable-state behavior.

## PC-UX-R06 – Activity-first visual hierarchy (candidate)

This focused visual candidate builds on source commit
`f85d5a5d41d7b2b0dd61fa2279bfd6f1cc39e1fa`.
It does not change Dashboard API calls, activity classification, source identity,
filter/order/cursor semantics, date/time controls or the route-local History,
IC-ENC and Validation panel ownership.

- KPI cards retain their five original values and accessible supporting
  descriptions, but show only the value and label to reduce repetitive text.
- The Activity list heading becomes visible next to the existing count and
  refresh status. Native sorting and activity links remain unchanged.
- The main grid gives the activity table more horizontal space on common
  desktop widths without hiding the right summary or detail panel.
- Below 920 px, the search and five filters use a compact four-column
  layout before switching to two columns at 760 px. Wide viewports keep all
  filters on one row; labels and keyboard tab order remain unchanged.
- KPI cards remain in a single row down to 920 px; below that, the compact
  responsive layout uses three or two columns as width permits.

This is a browser-review candidate, **not a final accepted design**. Verify at
320, 390, 500, 650, 820, 1100, 1280 and 1440 px, including 100–150% zoom,
light/dark themes, native range input focus, sort/filter state, cursor paging,
long activity descriptions, summary-row filtering and the existing History/
report panels. The backend's currently empty artifact-history response remains
outside R06.

## PC-UX-R06 v2 – Operational overview (review candidate)

This iteration builds on the R06 v1 visual candidate from
`f85d5a5d41d7b2b0dd61fa2279bfd6f1cc39e1fa`; it does not change
Dashboard API contracts, filter/sort/cursor semantics, or Product route actions.

- Six overview cards now distinguish activities, unique Products, active events,
  accepted distribution, failures, and reports. The existing **Important changes**
  count remains visible within the Activities card.
- **Accepted for distribution** is explicitly **unavailable** (`—`) because the
  current Dashboard response has no authoritative count of ENC Products accepted
  for distribution. `Ready for distribution`, `Completed` and `Publication`
  activities must not be counted as accepted/distributed ENC Products. A proper
  KPI needs a verified backend aggregate, with a defined product/revision
  uniqueness rule and filter-range semantics. Frontend does not infer this from
  the paged activity rows or add a new API field.
- The Active card reads the server-provided **StatusSummary**, not the visible
  page. When the status breakdown is unavailable on a non-empty result it shows
  `—` rather than an invented zero.
- The right-side Status summary includes a stacked distribution bar. Both Status
  and Operation summary rows display proportional bars for the full **filtered**
  Dashboard result and retain their accessible names, counts, click-to-filter
  semantics and active state. Colors supplement the textual labels; status
  colors do not imply external publication or acceptance.
- Activity cells use narrower table sizing. Title, description and all original
  backend details remain in the DOM; the visible secondary fields are truncated
  to one line, with full text exposed through the cell's native title tooltip.
  Links, sort headers, filters, pagination and row-level selection remain intact.
- Clicking the already selected **History**, **IC-ENC**, or **Validation** action
  closes its panel. This works during loading and after load/error. Closing
  invalidates pending lookups, restores summaries and returns keyboard focus to
  the same action; selecting another action switches ownership as before.
- This is a visual/browser-review candidate. Verify light/dark theme, compact
  and wide layouts, 150% zoom, keyboard/Escape/focus, active bars versus totals,
  zero/empty results and late report/history requests before acceptance.

No chart library, new dependencies, backend changes or extra Dashboard requests
are introduced. All visual proportions use the existing backend summary rows.

## PC-UX-R06 – Reporting layout correction v2 (browser acceptance pending)

This correction supersedes the **right-column presentation** introduced by the
R06 reporting frontend v1 candidate. Backend data contracts and the accepted
v3 six-KPI/activity-list layout are unchanged.

- The default right column contains four sections in a stable order:
  **IC-ENC distribution**, **Status summary**, **Operation summary**, and
  **Additional insights**. The existing status donut and actionable operation
  bars retain their server-side activity filters.
- The Additional insights section groups **Activity by specification**,
  **Current workflow state**, and **Stored report files** into compact cards.
  Their source-defined scopes and complete counts remain unchanged. Headings
  use nested heading levels rather than repeated top-level panels.
- A single day of recorded activity does not result in a mostly empty
  Activity over time chart. When multiple event days or a live distribution
  trend exist, **Daily trends** exposes the original charts in a keyboard-
  accessible disclosure; the disclosure is closed by default. At most the
  latest 14 recorded days are charted, with the existing cutoff note.
- The right-side CSS grid now sizes summary/report cards from their content
  rather than allowing a `minmax(0, 1fr)` row to collapse. Charts cannot
  paint over following sections; the aside scrolls when content legitimately
  exceeds viewport height. The History/IC-ENC/Validation detail-panel layout
  and its independent lifecycle remain unchanged.
- No new endpoints, API requests, data transformations, permissions,
  dependencies, or chart libraries are introduced.

Browser acceptance should confirm no overlapping cards at desktop, 125/150%
zoom and narrower widths; inspect both themes, the status/operation filters,
Daily trends keyboard disclosure, History/report-panel toggle, sorting,
selection, and cursor pagination. Local `npm run format` and `npm run check`
remain authoritative prior to committing.

## PC-UX-R06 – Reporting presentation correction v3 (review candidate)

This candidate supersedes only the right-column and KPI presentation from the
R06 reporting frontend v2 candidate. The committed backend contract, the
source-aware Product identity model, and the existing Dashboard activity
controller are unchanged.

- **Status summary** and **Operation summary** form the first reporting row.
  They appear side by side when each chart has enough width and stack at
  narrower viewports. Status retains its accessible donut/legend. Operations
  use a single set of horizontal bars on a shared maximum-value scale rather
  than independent vertical tiles. Status and type rows preserve their existing
  server-side click-to-filter/toggle behavior.
- **IC-ENC distribution** follows the summaries, with only four counters and
  the acceptance percentage when the underlying decided counts are available.
  The UI shows the total number of **recorded** decisions from both backend
  sources, without provenance or demonstration text. This is a presentation of
  persisted workflow outcomes, **not evidence of actual external transmission
  or acknowledgement**. The backend's live/simulation provenance is preserved
  unchanged, and reporting exports or audits requiring real distribution must
  still select the live subset. Acceptance is never inferred from
  `ReadyForDistribution`, `Completed` or other activity titles.
- **Activity over time** follows distribution and is always visible when the
  response includes trend data, including a single-day bucket. The trend uses
  backend totals, not visible paginated activity rows. The most recent 14 days
  with recorded events are shown and longer results retain the explicit
  cutoff note. An optional distribution-decision timeline remains available
  in a keyboard-accessible nested disclosure when live trend data exists.
- **Additional insights** remains last, with compact Product-specification,
  current-workflow and stored-report-file breakdowns. Their different scopes
  and the meaning of file counts have not changed.
- KPI cards now present label and count only. Repeated subtitles and native
  browser title tooltips were removed, while concise screen-reader descriptions
  remain. The clickable Failed events KPI retains an accessible filter action
  and `aria-pressed` state.
- History/IC-ENC/Validation action toggles, Escape, request cancellation and
  generation ownership, filtering, sorting, paging, API fallback, and
  theme/responsive behavior remain unchanged. No new dependency or backend
  request is introduced.

Browser acceptance should confirm the requested sidebar order, chart readability
and focus at desktop/tablet/mobile widths and browser zoom, both themes, zero/
one/many trend buckets, unavailable reporting fields, and the difference between
historical Failed events and the current Open errors counter.

## PC-UX-R06 – Reporting presentation correction v4 (review candidate)

This candidate modifies **only** the accepted reporting frontend v3 presentation.
Its authority is the developer-reported backend commit
`dca718363ec901add42985e4da1755fecf409a31` plus the verified
`PC-R06-Reporting-Frontend-Candidate-dca71836-v3.zip` files. No backend,
request, paging, mutation, persistence or dependency change is introduced.

- The visible IC-ENC labels use **Distributed** rather than **Accepted**:
  the KPI, distribution counter, decided-outcome percentage and optional
  distribution trend legend. Their wire keys stay `accepted` and
  `acceptanceRatePercent`, and the existing recorded live/simulation counts
  remain untouched. The visible total represents **persisted workflow
  decisions**, not proof that a simulated record reached the real IC-ENC
  service. `ReadyForDistribution` and `Completed` never count as distributed.
  The recorded rate is distributed decisions / (accepted + rejected
  decisions) within the backend's scoped outcome set.
- The activity trend displays server day buckets as `dd/MM` on the axis and
  `dd/MM-yyyy` in native hover titles and the chart accessible description.
  For one to three event days, bars are grouped and include numeric labels
  rather than being spread across a wide empty chart. No unreported dates
  are invented as zero-count buckets; the 14-bucket cap remains unchanged.
- Activity by specification remains specification-scoped because the backend
  supplies per-specification activity aggregates, **not** stable
  Package-aggregate event totals. It formats S-code labels (for example
  `S101` as `S-101`) and renders any number of returned rows, including five.
  Counts are not silently combined into a Package based on a name prefix.
- Current workflow state is a snapshot of **current Product tracks**, not
  date-filtered activity. `Export / validate` counts `Exporting` and
  `Validating` tracks; it does **not** include `ChangesDetected`.
  `At IC-ENC` counts `InTransit`; `Paused` counts manually frozen or
  `Frozen` tracks. No backend state mapping is changed.
- The supplemental report panel groups `ValidationReport` and
  `ValidationDiagnostic` into **Validation files**, alongside IC-ENC files.
  They are file counts, not numbers of validation jobs or validations passed.
  The backend retains individual kinds, and the existing report filters and
  downloadable history links remain unchanged.
- The activity table now has an **Actions** column containing one **More
  actions** Calcite Dropdown per row. The dropdown uses the public
  component's fixed-position overlay to escape scroll clipping. Review and
  Analyze remain new-tab links; History, IC-ENC and Validation remain
  toggleable detail panels with stale-request protection and focus restored
  to the corresponding native menu trigger. Disabled/unsupported actions
  remain disabled, and Escape within the dropdown is owned by Calcite rather
  than unexpectedly closing an open detail panel.

Browser verification must include light/dark, sorting, filtering, page-size
and cursor changes, report-panel toggles during pending requests, keyboard
navigation (Tab, Enter, Escape), focus restoration, scroll-clipped rows,
small screens, sparse versus dense time series, five specifications and
missing-reporting-data fallbacks. `npm run format` and `npm run check` remain
required on the developer's full local checkout before committing.

## PC-UX-R06 – Direct activity panel toggles (reporting frontend v5)

This focused correction supersedes only the activity-row **More actions** interaction
introduced in reporting frontend v4. The verified starting point is the v4 candidate
on the developer-accepted backend commit `dca718363ec901add42985e4da1755fecf409a31`.
The reporting layout, backend aggregates, filters, paging and data semantics are unchanged.

- The **Actions** column shows three direct buttons in order: **History**,
  **IC-ENC**, **Validation**. Each opens its existing shared detail panel and
  closes that same panel on a second click, including during an outstanding request.
  Active actions retain visible selection and `aria-pressed`. Closing returns
  keyboard focus to that row's corresponding direct action button, rather than
  an unrelated dropdown trigger. The existing generation guards prevent stale
  History/validation responses from reopening a closed panel.
- **Links**, placed last, is the only dropdown and contains just **Review** and
  **Analyze** navigation. Both preserve the original capability flags and
  `target="_blank"` / `rel="noopener noreferrer"`. Disabled destinations remain
  disabled, and the trigger is disabled if neither destination is available.
  Its fixed-position Calcite overlay avoids clipping in the scrollable table.
- The Actions column is widened only enough for the compact single-row controls;
  Activity receives the remaining width. No new dependencies, endpoints,
  API requests, routes or source-specific branching are introduced.

Local acceptance: check the direct buttons at the beginning and end of the
scrollable activity table, including report loading/error, quick panel switching,
Escape, focus return, unsupported navigation, responsive widths, 150% zoom and
light/dark mode. Run `npm run format` and `npm run check` in `src/ProductCatalogue`
before committing.

## PC-UX-R06 – Compact Links dropdown (reporting frontend v5.2)

The Dashboard row's **Links** menu keeps Review and Analyze as navigation-only
items while History, IC-ENC and Validation remain direct panel toggles. The
Calcite dropdown uses the documented `--calcite-dropdown-width` property for a
compact menu and keeps fixed overlay positioning to escape the scrollable
Activity table. While that menu is open, the application-owned hover tooltip is
hidden so it cannot remain partly visible beneath the menu. This is scoped to
the Dashboard route and does not change tooltip behavior elsewhere.

This correction builds on reporting frontend v5.1 and preserves the stable
`.pc-dashboard-activity-links` onboarding selector. No API, backend, workflow or
package dependency change is involved.

## PC-UX-R09 – Contextual metric help

Six dedicated information buttons explain Open errors, Failed events, IC-ENC
distribution, Activity by specification, Current workflow state and Stored report
files. The explanations distinguish current track health from historical activity,
recorded distribution decisions from pending decisions, specification-level counts
from Package counts, and stored report files from validation runs. No metric
calculation, reporting scope, provenance, filter or API request changes.

The existing shared help overlay opens on hover, keyboard focus or activation of
the information button; Escape dismisses focused explicit help before an open
Dashboard detail panel. Help is separate from the Failed events filter button and
uses stable Dashboard focus keys during rerenders. KPI labels and numbers do not
receive redundant hover help. The reporting and Activity layouts otherwise remain
unchanged. Verify narrow insight headers, both themes, focus, Escape, repeated
activation, filter isolation, and the existing Links dropdown during local acceptance.

## PC-UX-R10 - SevenCs validation report viewer

Verified VLD artifacts expose a **View report** action beside their existing download. The
[shared validation viewer](../validationViewer/README.md) owns on-demand byte retrieval, structured findings, raw
text, filtering, and modal lifecycle. The current Product/member and artifact identities,
report availability, download behavior and the underlying view's lifecycle are preserved.
ZIP files and other report formats remain download-only.

R10 v2 presents both report types in a wrapping row of compact file tiles. Each
file retains its title, stored timestamp and original download; an eligible VLD
has **View report** beside **Download** in a shared action row. The selected
activity remains a full-width context card above the tiles. Tile width adapts
to the report pane without stretching isolated buttons or clipping filenames.

### Structured IC-ENC report preview

The Product-scoped fallback can preview a verified `IcEncReport` via the
[shared viewer](../icEncReportViewer/README.md). Direct Activity links without a verified typed
artifact retain their original download. The fallback continues to describe Product files and
carries no inferred Activity or revision association.
