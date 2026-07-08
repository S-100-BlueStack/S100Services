# Dashboard foundation

FI-001 introduces a separate read-only Dashboard route at `/dashboard`.

The Dashboard is intentionally isolated from the main map, Product Collection, Analyze and Review state. It summarizes operational activity for a selected range and links users onward to product-level Review or Analyze pages.

## Phase 1 scope

- Dedicated `/dashboard` route.
- Navbar link for Dashboard.
- Range presets for `Since yesterday` and `Last 7 days`.
- Disabled `Custom range` control until the backend contract is ready.
- Summary cards for operational activity counts.
- Compact activity list with product links.
- Important changes panel.
- Status and operation breakdowns.
- API-first loader with visible demo-data fallback when the endpoint is unavailable.

## Backend contract target

The frontend calls:

```http
GET productmanager/dashboard/activity?from=<utc-iso>&to=<utc-iso>&range=<preset>
```

Expected payload shape:

```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-07-08T08:15:00Z",
    "range": {
      "from": "2026-07-07T00:00:00Z",
      "to": "2026-07-08T23:59:59Z",
      "preset": "since-yesterday"
    },
    "summary": {
      "totalActivities": 42,
      "productsTouched": 18,
      "importantChanges": 6,
      "failedOperations": 2,
      "reportsAvailable": 9
    },
    "statusSummary": [
      {
        "status": "failed",
        "count": 2
      }
    ],
    "operationSummary": [
      {
        "type": "export",
        "count": 12,
        "failed": 1
      }
    ],
    "activities": [
      {
        "id": "activity-123",
        "timestamp": "2026-07-08T07:45:00Z",
        "datasetName": "101DK0040943E",
        "productName": "101DK0040943E",
        "type": "export",
        "severity": "critical",
        "title": "Export failed",
        "description": "All Edition export failed validation.",
        "status": "failed",
        "actor": "DOMAIN\\user",
        "links": {
          "review": true,
          "analyze": true,
          "history": true,
          "icEncReport": {
            "available": true,
            "reportId": "icenc-report-123",
            "url": null
          },
          "internalValidation": {
            "available": true,
            "reportId": "validation-report-456",
            "url": null
          }
        },
        "details": [
          {
            "label": "Scope",
            "value": "All"
          }
        ]
      }
    ]
  }
}
```

## Notes

Report links support direct URLs when the backend provides them. Until then, report metadata is shown as available but actions remain placeholder notices.
