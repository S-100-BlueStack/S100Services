# Dashboard reporting aggregates (PC-BE-R06)

Baseline: `48e8fa39664d8dcbfc36e3866c1c4b82e50c1343`.

## Scope and API

`GET /electronicproducts/dashboard` retains the existing Windows authorization policy, Danish range parsing, filter parameters, activity mapping, cursor format, sorting, pagination, summary fields, and `ApiResponse<DashboardResponse>` envelope. The new fields are additive to `Data` and use the API's existing PascalCase JSON policy. No new endpoint, mutation, migration, worker job, or dependency is introduced.

The new `IDashboardReportingRepository` performs one read-only SQL batch against the Product Catalogue System database. Three independent result sets read delivery metadata, all current product tracks, and artifact metadata. It does not read artifact binary content, mailbox message JSON, or sensitive transport configuration. The backend still fails on SQL or authorization errors; it does not return invented zero values after a failed read.

## Additional `Data` fields

| Field | Definition and scope |
| --- | --- |
| `Distribution.Live`, `Distribution.Simulation` | Separate counters by immutable `ProductIcEncDelivery.is_simulation` provenance |
| `Distribution.BySpecification[]` | Same counters per actual S101/S57 track (each independently versioned member counts separately) |
| `OperationalHealth` | Current SQL track state, regardless of the selected historical date range |
| `ReportSummary` | Actual artifact files created in the selected `[from, to)` interval |
| `ReportArtifacts[]` | Artifact ID, exact Product/specification/revision, kind, name, timestamp, authorized Product-scoped download URL; no content |
| `ActivityTrend[]` | Daily `Activities`, `Failed`, `Important`, computed from all filtered history rows before paging |
| `DistributionTrend[]` | Daily live deliveries and decisions, from delivery timestamps |
| `ProductBreakdown[]` | Historical activity/event counts by Product specification, computed before paging |
| `Activities[].ProductSpecification` | Additive source-aware specification for the history event |

### Distribution definitions

A unit is **one delivery record for one immutable Product revision**, not an S-101/S-57 package and not a unique geographical ENC source. In particular, the two members of a package can contribute two decisions; the UI must not label these counts as "packages accepted".

- **Sent**: transfer completed within `[from, to)` for a row currently in `Delivered`, `Accepted` or `Rejected`. Uses `completed_at_utc`.
- **Accepted / Rejected**: an authoritative persisted IC-ENC decision whose `acknowledged_at_utc` is within the interval. Accepted is **not** inferred from `ReadyForDistribution`, the latest Product state, or a report filename.
- **Pending**: delivery completed within the interval and **still** has status `Delivered` at query time. It is not a historical pending-at-period-end reconstruction.
- **Uncertain**: unresolved transfer with status `Uncertain`, reserved within the interval. It is intentionally excluded from `Sent`.
- **AcceptanceRatePercent**: `100 × Accepted / (Accepted + Rejected)` for decisions **in the interval**, with null when there are no decisions.

Historical decisions remain counted after successful package finalization returns the Product track to `Idle`. A delivery accepted today that was sent last week counts as Accepted today but not Sent today. Simulated outcomes are separately reported and **never added to Live**.

### Operational health

`OperationalHealth.AsOfUtc` is the response generation timestamp. It is **not** a reconstruction of the state at the selected range end. Counts refer to unique `ProductExportTrack` IDs (independent S-101/S-57 members):

- `OpenErrors`: current `Error` or `Rejected` state.
- `Processing`: current `Exporting` or `Validating` state.
- `AwaitingIcEnc`: current `InTransit` state.
- `Paused`: active `ProductExportTrackFreezeHold` (or a legacy `Frozen` state); this dimension can overlap with another category.
- `Tracks`: number of current workflow tracks in the selected Product scope.

These counts are not event totals; `Summary.FailedOperations` and the existing `Active` status summary continue to describe historical activities.

### Reports and report filtering

`ReportSummary` counts actual stored **files**, not unique validation runs. `IcEnc` counts `IcEncReport`; `InternalValidation` counts `ValidationReport`; `ValidationDiagnostics` counts `ValidationDiagnostic`. `Total` includes all three categories. Real/simulation provenance is not inferred from filenames or arbitrary metadata; report file totals can include simulated artifacts if the service has stored them.

`ReportArtifacts[]` associates files with their exact `DatasetName`, `ProductSpecification` and nullable `RevisionId`, avoiding guesswork about which activity generated a report. It preserves the existing authorization and ownership validation on the download endpoint.

`reports=any|ic-enc|internal-validation` selects **activities for Products with report files created in the selected interval**. It does not imply a one-to-one relationship between any activity row and a report. Existing `Activities[].Links` arrays are intentionally left unchanged: the existing Dashboard frontend will continue to open the complete Product-scoped artifact history, instead of stopping at a partial subset of links.

`Summary.ReportsAvailable` is upgraded to count actual stored report files within the interval: with activity filters it counts files belonging to Products that matched those filters; without activity-only filters it counts all files in range (and optional Product filter). When a reports type filter is active, it counts that type only. `ReportSummary.Total` always describes the full date/Product scope, independent of activity-only filters.

### Filter and paging scope

The new **distribution, current health, report metadata and distribution trend** respect the selected date range where appropriate and the exact `product` filter. Other activity-specific filters (`search`, `type`, `status`, `importance`, `reports`) do **not** affect those independent aggregates: they do not have equivalent meanings for the persisted deliveries or current state. `OperationalHealth` intentionally ignores time range. `ActivityTrend` and `ProductBreakdown` respect all existing activity filters, before cursor and page size. Only days with one or more events are returned; the frontend can insert zero-filled days if needed.

For date grouping, both trends use `Europe/Copenhagen` local calendar days, including daylight-saving conversions from the stored UTC instants. The API's existing `[from, to)` UTC interval remains authoritative.

## Current frontend integration and known gaps

The committed R06 v3 frontend continues to use its legacy KPI model and does not automatically display the new distribution, operational health or trend fields. A separate frontend integration is needed to replace the `Accepted for distribution` placeholder with `Distribution.Live.Accepted` (or to show simulation deliberately and separately), present open failures and visualize daily trends. This backend candidate must not be presented as browser-accepted.

This contract does not add a new IC-ENC email outcome history endpoint and does not repair missing `ProductArtifact` persistence. If the existing Product artifact-history endpoint returns an empty list because reports were not stored, `ReportSummary` will also correctly return zero until the underlying ingestion issue is resolved.

The existing `ProductStateHistory` schema does not carry the immutable `ProductRevision` ID. This implementation deliberately avoids falsely attributing a revision-specific artifact to an arbitrary state-history activity. `ReportArtifacts` is exact revision metadata; per-activity links can be considered later only with a verified event↔revision association contract.

## Manual verification on the real System database

1. Run the existing `.NET` unit suite and relevant Dashboard tests. No database changes are necessary.
2. Compare `GET /electronicproducts/dashboard?from=...&to=...` response with SQL `ProductIcEncDelivery` decisions using `acknowledged_at_utc` and `is_simulation`; verify S57/S101 counts separately.
3. Verify accepted deliveries remain counted after their Package is finalized and the Product track has returned to `Idle`.
4. Verify a delivered-but-unacknowledged revision appears in `Pending`, and an `Uncertain` delivery is not counted as sent.
5. Check `OperationalHealth` with a real `Error`/`Rejected` track, an `Exporting`/`Validating` track and a manual freeze hold.
6. Compare `ReportSummary`/`ReportArtifacts` with the Product-scoped `artifacts/history` endpoint, including legacy files with a null `RevisionId`, without disclosing artifact contents.
7. Repeat with `product`, `reports`, other filters, `pageSize=1`, a cursor and Denmark's DST-change dates. Check that aggregate counts do not change when only the page/cursor changes.
8. Verify invalid query parameters still return HTTP 400 before any SQL reporting read and that the Dashboard endpoint retains Windows authorization.

Verification note: the candidate was prepared from a checked Git-blob archive. `dotnet` and SQL Server are unavailable in the authoring container, so compile, integration tests and database verification must be performed locally before acceptance.
