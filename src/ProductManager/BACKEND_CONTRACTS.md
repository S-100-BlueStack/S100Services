# Product Manager backend contracts

This document describes the backend contracts Product Manager frontend needs for
future work.

The contracts are drafts. They describe frontend requirements and proposed
response shapes, not finalized backend implementation details.

## Goals

The frontend needs backend support for:

- active product operation state
- async export jobs
- export conflict handling
- product history
- Analyze product data
- global map timeline

The backend should remain the source of truth for business rules. Frontend state
is only a UX guard.

## General API conventions

### Response format

Prefer a consistent response shape for all Product Manager endpoints.

Successful response:

```json
{
  "success": true,
  "data": {}
}
```

Failed response:

```json
{
  "success": false,
  "errorCode": "PRODUCT_OPERATION_CONFLICT",
  "message": "An export is already running for this product.",
  "details": {}
}
```

### HTTP status codes

Use clear HTTP status codes:

- `200 OK`: successful read or completed synchronous action
- `202 Accepted`: async job accepted
- `400 Bad Request`: invalid input
- `404 Not Found`: product or job not found
- `409 Conflict`: conflicting product operation
- `500 Internal Server Error`: unexpected backend error

### Error body

Error responses should include enough information for user-facing notices and
debugging.

Recommended shape:

```json
{
  "success": false,
  "errorCode": "EXPORT_CONFLICT",
  "message": "All Edition export is already running for DK5ABC123.",
  "details": {
    "datasetName": "DK5ABC123",
    "operationId": "job-123",
    "operationType": "export"
  }
}
```

### Dataset identifiers

Frontend currently uses `datasetName` as the stable product identifier.

If backend has a better stable product id, clarify whether frontend should use:

- `datasetName`
- backend `productId`
- both

Preferred future shape:

```json
{
  "productId": "product-123",
  "datasetName": "DK5ABC123"
}
```

Until this is clarified, all draft contracts use `datasetName`.

## Product operation state

### Purpose

Frontend needs to know whether a product has an active operation running.

This is required to prevent confusing UI states across:

- browser tabs
- users
- long-running backend operations
- async export jobs

Frontend already has local operation state, but it is browser-tab-local only.

### Operation types

Supported operation types:

```txt
freeze
unfreeze
send
export
rollback
```

More operation types can be added later.

### GET active operation state for one product

Proposed endpoint:

```http
GET /productmanager/products/{datasetName}/operations/active
```

Example response:

```json
{
  "success": true,
  "data": {
    "datasetName": "DK5ABC123",
    "operations": [
      {
        "id": "job-123",
        "type": "export",
        "label": "Exporting All Edition",
        "status": "running",
        "startedAt": "2026-06-08T10:15:00Z",
        "startedBy": "DOMAIN\\user",
        "source": "backend",
        "scope": "All",
        "exportType": "Edition"
      }
    ]
  }
}
```

### GET active operation state for multiple products

Proposed endpoint:

```http
POST /productmanager/products/operations/active
```

Request:

```json
{
  "datasetNames": ["DK5ABC123", "DK5ABC456"]
}
```

Response:

```json
{
  "success": true,
  "data": {
    "products": [
      {
        "datasetName": "DK5ABC123",
        "operations": []
      },
      {
        "datasetName": "DK5ABC456",
        "operations": [
          {
            "id": "job-456",
            "type": "send",
            "label": "Sending to IC-ENC",
            "status": "running",
            "startedAt": "2026-06-08T10:20:00Z",
            "startedBy": "DOMAIN\\user",
            "source": "backend"
          }
        ]
      }
    ]
  }
}
```

### Operation status values

Recommended status values:

```txt
queued
running
completed
failed
cancelled
```

Frontend mainly needs `queued` and `running` for active operation blocking.

### Conflict behavior

If a mutation cannot start because another operation is active, backend should
return:

```http
409 Conflict
```

Example:

```json
{
  "success": false,
  "errorCode": "PRODUCT_OPERATION_CONFLICT",
  "message": "An export is already running for DK5ABC123.",
  "details": {
    "datasetName": "DK5ABC123",
    "activeOperation": {
      "id": "job-123",
      "type": "export",
      "label": "Exporting All Edition",
      "status": "running"
    }
  }
}
```

## Async export jobs

### Current frontend behavior

Frontend currently supports synchronous export calls for:

- `All > Edition`
- `All > Update`

S57/S100 export actions are present but disabled.

### Desired backend model

Exports should eventually become async jobs.

### Start export job

Proposed endpoint:

```http
POST /productmanager/products/{datasetName}/exports
```

Request:

```json
{
  "scope": "All",
  "exportType": "Edition"
}
```

Response:

```http
202 Accepted
```

```json
{
  "success": true,
  "data": {
    "jobId": "export-job-123",
    "datasetName": "DK5ABC123",
    "operationType": "export",
    "scope": "All",
    "exportType": "Edition",
    "status": "queued",
    "createdAt": "2026-06-08T10:15:00Z"
  }
}
```

### Get export job status

Proposed endpoint:

```http
GET /productmanager/export-jobs/{jobId}
```

Response:

```json
{
  "success": true,
  "data": {
    "jobId": "export-job-123",
    "datasetName": "DK5ABC123",
    "scope": "All",
    "exportType": "Edition",
    "status": "running",
    "createdAt": "2026-06-08T10:15:00Z",
    "startedAt": "2026-06-08T10:15:10Z",
    "completedAt": null,
    "message": "Export is running.",
    "progress": {
      "current": 2,
      "total": 5,
      "label": "Creating S-57 package"
    }
  }
}
```

### Export job status values

Recommended values:

```txt
queued
running
completed
failed
cancelled
```

### Export conflict rules

Frontend currently uses these rules:

- `All` conflicts with every export scope.
- A specific scope conflicts with itself and `All`.
- Specific scopes do not conflict with each other.

Examples:

- running `All Edition` blocks `All`, `S57`, and `S100`
- running `S57 Edition` blocks `S57` and `All`
- running `S57 Edition` does not block `S100`, if `S100` is implemented

Backend should either:

1. enforce the same rules and return `409 Conflict`, or
2. return enough active export state for frontend to apply the same rules.

Preferred backend active export operation shape:

```json
{
  "id": "export-job-123",
  "type": "export",
  "label": "Exporting All Edition",
  "status": "running",
  "scope": "All",
  "exportType": "Edition",
  "startedAt": "2026-06-08T10:15:00Z",
  "startedBy": "DOMAIN\\user"
}
```

## Product mutations

Current product mutation actions:

- Freeze
- Unfreeze
- Send to IC-ENC
- Rollback placeholder

### Freeze / Unfreeze

Existing frontend action concept:

```http
POST /productmanager/products/{datasetName}/freeze
```

Request:

```json
{
  "frozen": true
}
```

Response:

```json
{
  "success": true,
  "data": {
    "datasetName": "DK5ABC123",
    "status": 5,
    "frozen": true
  }
}
```

If another operation is active:

```http
409 Conflict
```

### Send to IC-ENC

Existing frontend action concept:

```http
POST /productmanager/products/{datasetName}/send
```

Response:

```json
{
  "success": true,
  "data": {
    "datasetName": "DK5ABC123",
    "status": 6,
    "sentAt": "2026-06-08T10:20:00Z"
  }
}
```

### Rollback

Rollback is currently disabled in the UI.

Before activating rollback, clarify:

1. What can be rolled back?
2. Is rollback synchronous or async?
3. Which statuses allow rollback?
4. Can rollback conflict with export/send/freeze?
5. Should rollback create product history events?

## Product data refresh

Frontend refresh expects stable lowercase product attributes.

Preferred product response shape:

```json
{
  "success": true,
  "data": {
    "datasetName": "DK5ABC123",
    "edition": "1",
    "update": "0",
    "status": 4,
    "displayScale": 90000,
    "errorMessage": ""
  }
}
```

Frontend can normalize older casing, but backend should prefer stable lowercase
fields for new endpoints.

Important fields:

- `datasetName`
- `edition`
- `update`
- `status`
- `displayScale`
- `errorMessage`

## Product History

### Current frontend behavior

Product History currently uses frontend demo data.

### Desired endpoint

Proposed endpoint:

```http
GET /productmanager/products/{datasetName}/history
```

Response:

```json
{
  "success": true,
  "data": {
    "datasetName": "DK5ABC123",
    "events": [
      {
        "id": "event-123",
        "timestamp": "2026-06-08T10:15:00Z",
        "type": "freeze",
        "title": "Product frozen",
        "description": "The product was frozen before export.",
        "actor": "DOMAIN\\user",
        "source": "backend",
        "details": [
          {
            "label": "Previous state",
            "value": "Active"
          },
          {
            "label": "Next state",
            "value": "Frozen"
          }
        ]
      }
    ]
  }
}
```

### History event types

Recommended initial event types:

```txt
status
freeze
unfreeze
send
export
rollback
analysis
note
```

### Product History questions

Before implementation, clarify:

1. Is product history an audit log, state snapshots, or both?
2. Should failed operations be included?
3. Should export job progress be included?
4. Should history include backend/system actors?
5. Are timestamps always UTC?
6. Can events arrive out of order?
7. Should frontend sort events or trust backend ordering?

## Analyze product data

### Current frontend behavior

Analyze currently has demo fallback data.

### Desired endpoint

Proposed endpoint:

```http
GET /productmanager/analyze/products/{datasetName}
```

Response:

```json
{
  "success": true,
  "data": {
    "datasetName": "DK5ABC123",
    "status": 4,
    "edition": "1",
    "update": "0",
    "errorMessage": "IC-ENC report message.",
    "aoiGeometry": {
      "rings": [],
      "spatialReference": {
        "wkid": 4326
      }
    },
    "xml": "<ICENCReport></ICENCReport>"
  }
}
```

### Analyze frontend product shape

Frontend wants to normalize backend responses to:

```js
{
  datasetName,
  status,
  edition,
  update,
  errorMessage,
  aoiGeometry,
  xml,
  raw,
  isMock,
  loadError,
}
```

Backend should not return `isMock` or `loadError`; those are frontend-only fields.

### Analyze questions

Before finalizing backend integration, clarify:

1. Is AOI geometry returned as Esri JSON object or JSON string?
2. Is XML returned as string, file reference, or separate endpoint?
3. Can Analyze load multiple products in one request?
4. Should missing XML be treated as success or warning?
5. Should missing AOI geometry be treated as success or warning?
6. Is `errorMessage` a product/report message or an API/load error?

## Global map timeline

### Current frontend behavior

Global map timeline is not implemented.

### Desired future behavior

Frontend needs to show product correction state at selected points in time.

Two possible backend models:

1. full snapshots
2. incremental deltas

### Option A: full snapshot endpoint

```http
GET /productmanager/timeline/snapshots/{timestamp}
```

Response:

```json
{
  "success": true,
  "data": {
    "timestamp": "2026-06-08T10:00:00Z",
    "layers": [
      {
        "id": "aoi",
        "features": []
      }
    ]
  }
}
```

### Option B: delta endpoint

```http
GET /productmanager/timeline/changes?from={timestampA}&to={timestampB}
```

Response:

```json
{
  "success": true,
  "data": {
    "from": "2026-06-08T09:00:00Z",
    "to": "2026-06-08T10:00:00Z",
    "changes": [
      {
        "type": "updated",
        "datasetName": "DK5ABC123",
        "attributes": {}
      }
    ]
  }
}
```

### Timeline metadata endpoint

```http
GET /productmanager/timeline/metadata
```

Response:

```json
{
  "success": true,
  "data": {
    "mode": "snapshot",
    "fullTimeExtent": {
      "start": "2026-01-01T00:00:00Z",
      "end": "2026-06-08T10:00:00Z"
    },
    "stops": ["2026-06-01T00:00:00Z", "2026-06-08T00:00:00Z"]
  }
}
```

### Timeline questions

Before implementation, clarify:

1. Should the backend return full snapshots or deltas?
2. Should timeline state include operation state?
3. Should timeline state include product history events?
4. Should timeline requests respect frontend filters?
5. Should timeline include deleted products?
6. What timestamp precision is required?
7. Can timeline data be cached?

## Multi-layer support

Frontend now supports static layer definitions and capability checks.

When backend adds more map layers, each layer should have:

```json
{
  "id": "aoi",
  "title": "Product corrections",
  "features": []
}
```

Frontend needs each layer to define or imply:

- stable layer id
- display title
- geometry features
- whether product actions are supported
- whether filters are supported
- whether display-scale hiding is supported
- whether popup actions are supported

Layer capabilities are currently frontend config, but backend should avoid
returning ambiguous layer payloads.

## Open backend decisions

The following decisions should be made before more frontend integration:

1. Is `datasetName` the final stable identifier?
2. Which operations are synchronous and which are async jobs?
3. What is the active operation source of truth?
4. What exact conflict rules should backend enforce?
5. Should backend expose export leaf conflicts directly?
6. Is Product History audit-log-based, snapshot-based, or both?
7. Should Analyze support batch loading?
8. Is global timeline snapshot-based or delta-based?
9. Are all timestamps UTC ISO 8601 strings?
10. What user identity should be returned in operation/history responses?

## Recommended implementation order

Recommended backend contract order:

1. Active product operation state
2. Async export jobs and job-status endpoint
3. Export conflict state
4. Real Product History endpoint
5. Real Analyze data contract
6. Global map timeline metadata and snapshot/delta model

This order reduces frontend rework because operation state and export jobs affect
the most existing UI behavior.
