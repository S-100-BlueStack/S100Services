# Dashboard foundation

FI-001 introduces a separate read-only Dashboard route at `/dashboard`. The Dashboard is intentionally isolated from the main map, Product Collection, Analyze and Review state. It summarizes operational activity for a selected range and links users onward to product-level Review or Analyze pages.

## Phase 1 scope

- Dedicated `/dashboard` route.
- Navbar link for Dashboard.
- Range presets for `Since yesterday` and `Last 7 days`.
- Disabled `Custom range` control until date/time inputs are enabled.
- Summary cards for operational activity counts.
- Compact searchable activity list with product links.
- Important changes panel.
- Status and operation breakdowns.
- API-first loader with visible demo-data fallback when the endpoint is unavailable.

## Backend contract

The frontend calls:

```http
GET electronicproducts/dashboard?from=2026-07-07
GET electronicproducts/dashboard?from=2026-07-01
```

Range query values are sent in Danish operational time. `Since yesterday` and `Last 7 days` send date-only `from` values so the backend can interpret them as midnight in `Europe/Copenhagen`. Preset ranges omit `to`, so refresh requests always use the backend's current time.

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
    "StatusSummary": [{ "Status": "Exported", "Count": 12 }],
    "OperationSummary": [{ "Type": "Export", "Count": 12, "Failed": 1 }],
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
        "Details": [{ "Label": "Scope", "Value": "All" }]
      }
    ]
  }
}
```

## Notes

Report links support multiple IC-ENC and internal validation report metadata entries. Until report URL endpoints exist, Dashboard renders report metadata as available but keeps the action as a placeholder notice.
