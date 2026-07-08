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
- Range presets for `Since yesterday` and `Last 7 days`.
- Disabled `Custom range` control until date/time inputs are enabled.
- Summary cards for operational activity counts.
- Compact activity list with product links.
- Client-side search.
- Client-side filters for type, status, importance, reports and product.
- Important changes panel.
- Status and operation breakdowns.
- Review and Analyze links from activity rows.
- Disabled or placeholder report actions until report URLs or report detail endpoints exist.

## Backend contract

The frontend calls:

```http
GET electronicproducts/dashboard?from=2026-07-07
GET electronicproducts/dashboard?from=2026-07-01
```

Range query values are sent in Danish operational time.

`Since yesterday` sends a date-only `from` value so the backend can interpret it as midnight in `Europe/Copenhagen`.

`Last 7 days` sends a date-only `from` value for seven calendar days back. Preset ranges omit `to`, so refresh requests always use the backend's current time.

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

Summary cards, important changes, status summary and operation summary are derived from the filtered activity set so the visible counts always match the activity list.

The filter state is local to the Dashboard page render lifecycle. It is safe to reset or replace when custom server-side ranges are introduced later.

## Report links

Report links support multiple IC-ENC and internal validation report metadata entries.

Until report URL endpoints exist, Dashboard renders report metadata as available but keeps the action as a placeholder notice or disabled action depending on the metadata returned by the backend.

Dashboard should not fetch full report content as part of the activity payload. The activity endpoint should return only enough metadata to show summary rows and route users to a report detail endpoint later.

## Future scope

The following work remains intentionally outside phase 1:

- Enable custom range picker.
- Add real IC-ENC report links when backend report IDs/storage contract exists.
- Add real internal validation report links when backend report IDs/storage contract exists.
- Improve important-change classification when backend operation/event semantics are richer.
- Consider server-side filtering only if dashboard payload becomes large.
- Consider richer dashboard charts only if they remain compact and data-oriented.
