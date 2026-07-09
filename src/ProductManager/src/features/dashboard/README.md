# Dashboard foundation

FI-001 introduces a separate read-only Dashboard route at `/dashboard`.

The Dashboard is intentionally isolated from the main map, Product Collection, Analyze and Review state. It summarizes operational activity for a selected range and links users onward to product-level Review or Analyze pages.

## Phase 1 status

Phase 1 is implemented and committed.

Implemented scope:

- Dedicated `/dashboard` route.
- Navbar link for Dashboard.
- Backend endpoint integration through `GET electronicproducts/dashboard`.
- Danish operational time handling through backend-provided `Europe/Copenhagen` range metadata.
- Always-visible Danish local `From` and optional `To` date/time controls. Date selection uses a compact Dashboard date picker instead of the browser-native date picker so month/year navigation stays predictable.
- Quick range action buttons for `Since yesterday` and `Last 7 days` that fill the range fields without loading data.
- Summary cards for operational activity counts.
- Compact activity list with product links.
- Client-side search.
- Client-side filters for type, status, importance, reports and product.
- Status and operation breakdowns.
- Review and Analyze links from activity rows.
- Disabled or placeholder report actions until report URLs or report detail endpoints exist.

## Backend contract

The frontend calls:

```http
GET electronicproducts/dashboard?from=2026-07-07
GET electronicproducts/dashboard?from=2026-07-01
GET electronicproducts/dashboard?from=2026-07-01T08:15:00
GET electronicproducts/dashboard?from=2026-07-01T08:15:00&to=2026-07-07T16:45:00
```

Range query values are sent in Danish operational time.

The Dashboard header always shows `From` and optional `To` date/time fields. `Since yesterday` and `Last 7 days` are quick actions that only fill the fields; they do not load data until the user selects `Apply`. Selecting a `From` date defaults its time to `00:00`; selecting a `To` date defaults its time to `23:59`. The date controls use a compact Dashboard-owned date picker while time values remain native compact time inputs. Leaving `To` empty keeps the range open-ended, so refresh requests continue to include the latest backend activity. The backend interprets offset-free datetime values as `Europe/Copenhagen` wall time, not UTC.

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
      {
        "Status": "Exported",
        "Count": 12
      }
    ],
    "OperationSummary": [
      {
        "Type": "Export",
        "Count": 12,
        "Failed": 1
      }
    ],
    "Activities": [
      {
        "Id": "activity-123",
        "Timestamp": "2026-07-08T07:45:00+02:00",
        "DatasetName": "101DK0040943E",
        "ProductName": "101DK0040943E",
        "Type": "export",
        "Severity": "critical",
        "Title": "Export failed",
        "Description": "All Edition export failed validation.",
        "Status": "failed",
        "Actor": "DOMAIN\\user",
        "Links": {
          "Review": true,
          "Analyze": true,
          "History": true,
          "IcEncReports": [
            {
              "Id": "icenc-report-123",
              "Title": "IC-ENC validation report",
              "Status": "Failed",
              "GeneratedAt": "2026-07-08T07:45:00+02:00",
              "Url": null
            }
          ],
          "InternalValidationReports": []
        },
        "Details": [
          {
            "Label": "Scope",
            "Value": "All"
          }
        ]
      }
    ]
  }
}
```

## Client-side filters

Dashboard filters run on the loaded activity payload. They intentionally do not change the backend query contract.

Summary cards, status summary and operation summary are derived from the filtered activity set so the visible counts always match the activity list.

The filter state is local to the Dashboard page render lifecycle and is applied to whichever range payload is currently loaded.

## Report links

Report links support multiple IC-ENC and internal validation report metadata entries.

Until report URL endpoints exist, Dashboard renders report metadata as available but keeps the action as a placeholder notice or disabled action depending on the metadata returned by the backend.

Dashboard should not fetch full report content as part of the activity payload. The activity endpoint should return only enough metadata to show summary rows and route users to a report detail endpoint later.

## Future scope

The following work remains intentionally outside phase 1:

- Add real IC-ENC report links when backend report IDs/storage contract exists.
- Add real internal validation report links when backend report IDs/storage contract exists.
- Improve important-change classification if it becomes useful as a filterable activity concept.
- Consider server-side filtering only if dashboard payload becomes large.
- Consider richer dashboard charts only if they remain compact and data-oriented.
