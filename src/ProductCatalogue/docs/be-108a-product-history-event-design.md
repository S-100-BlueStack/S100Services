# BE-108A Product History Event Design

Documentation baseline: `8caf5f771f1a6721398007589afbe875d553615d`

Status: **Approved pre-implementation design. Runtime implementation has not started.**

This document is the source of truth for BE-108A. It records design decisions only and does not authorize runtime, SQL, test, project, or configuration changes by itself.

## 1. Purpose

BE-108A adds a durable Product-level audit event model alongside the existing state history.

The design must answer:

- what logical operation happened;
- when it reached a terminal audit outcome;
- whether the outcome is confirmed, warning-bearing, failed, or uncertain;
- which job and correlation identifiers support diagnosis;
- which exact legacy state row belongs to a successful operation.

Product History remains an audit log. It does not reconstruct historical map state.

## 2. Current-state boundary

The current history endpoint returns temporal `JobTable` state rows through:

```text
Data: ProductHistoryResponse[]
```

The frontend compares adjacent rows and infers summaries such as Freeze, Export, or Rollback. This remains the legacy state-history model.

`JobTable` is not replaced or repurposed as the explicit event store.

The new event persistence is additive and independent from Hangfire job retention.

## 3. BE-108A implementation batches

### Batch 1 - Foundation

Planned later:

- dedicated Product History event persistence;
- repository and lifecycle service;
- endpoint-specific history response;
- additive `Events`, `EventTotalHits`, and legacy state `Id`;
- `AppendAsync` returning `Guid`;
- application-generated `StateRecordId`;
- application-owned `OperationId`;
- required future Hangfire parameter names;
- deterministic frontend `StateRecordId` association;
- frontend legacy/explicit event normalization;
- foundation tests and deployment documentation.

Batch 1 must not connect Export or Rollback jobs to the event lifecycle.

### Batch 2 - Producers and recovery

Planned only after Batch 1 is built, tested, and reviewed:

- Export producer lifecycle;
- Rollback producer lifecycle;
- terminal outcome handling;
- audit persistence failure handling;
- terminal recovery metadata;
- reconciliation runtime;
- dedicated maintenance queue;
- worker restart/requeue recovery;
- failure injection and crash/recovery tests;
- manual acceptance for producer and recovery flows.

## 4. Explicitly deferred

The following are outside BE-108A:

```text
Internal validation
IC-ENC report processing
Send to IC-ENC
report content/storage
Dashboard event-source integration
external worker extraction
```

Do not add speculative event-type values, persistence fields, endpoints, or runtime producers for these areas under BE-108A.

The global map timeline and historical reconstruction also remain separate and deferred.

## 5. Authoritative migration mechanism

The approved process is:

```text
Repository-owned versioned SQL Server scripts
Database-owner executed
Database-first deployment
No automatic startup migration
No EF Core introduction
Additive audit table retained during application rollback
```

This matches the existing Dapper and handwritten-SQL architecture.

### 5.1 Expected future repository layout

The exact names can be confirmed when Batch 1 is generated, but the planned pattern is:

```text
src/ProductCatalogueAPI/Data/Database/Migrations/
  README.md
  BE108A_001_CreateProductHistoryEvent.sql
  BE108A_001_VerifyProductHistoryEvent.sql
```

No migration files exist as part of this documentation-only package.

### 5.2 Future create-script requirements

The create script must:

- use explicit `[dbo]` schema;
- use `SET XACT_ABORT ON`;
- wrap additive schema changes in a transaction;
- be idempotent when the existing schema is identical;
- use `THROW` for an incompatible existing table, column, constraint, or index;
- never silently alter or repair unknown schema variants.

### 5.3 Future verify-script requirements

The verify script must terminate with a clear failure for any missing or incompatible:

- table;
- column;
- datatype;
- nullability;
- default;
- primary key;
- unique constraint;
- index.

It must not rely only on informative result sets.

### 5.4 DatasetName database semantic

Batch 1 must preserve exact, case-insensitive `DatasetName` semantics without relying on the database default collation.

The approved implementation direction is shared application canonicalization at both write and query boundaries:

```text
trim surrounding whitespace
→ convert with invariant uppercase
→ validate the canonical value
→ persist/query using the canonical value
```

The event table therefore stores the canonical `DatasetName`. Repository queries receive an already canonicalized value and use exact equality; prefix, substring, wildcard, and culture-sensitive matching are prohibited.

The canonicalization function must be shared by the persistence contract, lifecycle service, repository-query entry point, and tests. An in-memory case-insensitive test is not sufficient. Batch 1 must include SQL Server integration verification showing that differently cased caller input reaches the same canonical row and that near-match Product names do not match.

Because canonicalization is selected instead of a collation-based contract, the future verify script does not establish case-insensitive behavior through collation. It must still verify the expected column definition and must fail if the stored schema differs from the approved Batch 1 design. A later switch to collation-based semantics would require a new explicit design decision and verify-script checks for that collation.

### 5.5 Deployment and rollback

Deployment is database-first:

```text
database owner executes create script
→ database owner executes verify script
→ application deployment may proceed
```

The additive event table remains during application rollback. An older application ignores it, while dropping it would destroy audit data.

## 6. Planned event persistence

The event table is audit lifecycle persistence only.

It must not be used as:

- a distributed lock;
- an atomic enqueue claim;
- an active operation registry;
- an operation ownership registry;
- a replacement for `DatasetLockService`;
- a replacement for authoritative Product version checks.

### 6.1 Required lifecycle timestamps

The future event persistence must include:

```text
CreatedAtUtc
UpdatedAtUtc
ExecutionStartedAtUtc
FinalizedAtUtc
OccurredAtUtc
```

`UpdatedAtUtc` is updated at every lifecycle transition.

Conceptual meanings:

- `CreatedAtUtc`: pending event record created;
- `UpdatedAtUtc`: latest persisted lifecycle change;
- `ExecutionStartedAtUtc`: irreversible business execution checkpoint accepted;
- `FinalizedAtUtc`: terminal audit outcome persisted;
- `OccurredAtUtc`: user-facing event occurrence timestamp.

Reconciliation identifies stale pending candidates through:

```text
FinalizedAtUtc IS NULL
AND UpdatedAtUtc <= cutoff
```

The cutoff makes a row eligible for inspection. It does not itself prove failure.

### 6.2 Central persistence storage contract

Batch 1 must introduce one central storage contract for persistent event data. It must cover at least:

```text
DatasetName
EventType
Outcome
Code
SafeMessage
CorrelationId
JobId
OperationId
StateRecordId
ExportTarget
structured operation metadata
```

The service/contract boundary validates and normalizes this model before it reaches the repository. It must:

- trim and canonicalize relevant text values;
- apply the shared `DatasetName` canonicalization defined in section 5.4;
- reject missing, malformed, or unsupported identity and contract fields;
- canonicalize known contract values without inventing producer enums that do not yet exist;
- enforce the maximum lengths selected with the Batch 1 table design;
- handle an overlong `SafeMessage` deterministically using the approved shared length rule rather than relying on SQL truncation or failure;
- accept only messages produced through an approved safe-message mapping/catalog boundary;
- expose no API that accepts an `Exception` or persists a raw exception message;
- reject raw stack traces, paths, SQL/compiler details, connection information, or report payloads as public audit fields.

The repository receives an already validated persistence model. SQL Server constraint or truncation errors are defense-in-depth and must not be used as normal contract validation.

The exact maximum lengths are selected together with the Batch 1 table design. The same values must be defined once and used consistently by:

```text
versioned migration scripts
central persistence contract/service
repository assumptions
unit tests
SQL integration/verification tests
```

`Title` is not a mandatory persisted field. API or frontend presentation should normally derive it from `EventType` and `Outcome`.

## 7. Outcome model

Canonical outcomes:

```text
Succeeded
Failed
SucceededWithWarning
RequiresManualReview
```

### 7.1 Succeeded

The business operation and its required state persistence completed successfully.

### 7.2 Failed

The operation is confirmed not to have completed successfully, and irreversible side effects did not begin or the failure state is otherwise proven.

### 7.3 SucceededWithWarning

The primary business operation succeeded, but a secondary concern requires attention. The first planned example is successful Rollback with output cleanup warning.

### 7.4 RequiresManualReview

Use when irreversible side effects began and the final business state cannot be proven.

```text
Outcome = RequiresManualReview
Code = MANUAL_REVIEW_REQUIRED
```

This is not equivalent to `Failed`. False-positive manual review is preferable to unsafe replay or a false claim that no business change occurred.

## 8. Identity model

The future lifecycle preserves four separate identifiers:

```text
OperationId
JobId
CorrelationId
StateRecordId
```

### 8.1 OperationId

- Generated once for the logical Product operation.
- Stable across job execution, retry/requeue diagnostics, audit persistence, and reconciliation.
- One public audit event exists per `OperationId`.
- Must be application-owned and persisted in Hangfire metadata.

### 8.2 JobId

- Identifies the current Hangfire background job.
- Supports status lookup and operational diagnosis.
- Must not be the only logical operation identity.

### 8.3 CorrelationId

- Links the operation, public safe failure, and internal logs.
- Must not expose internal exception content.

### 8.4 StateRecordId

- Identifies the exact legacy `dbo.JobTable` row created by a successful operation.
- Must be generated by the application before insert:

```csharp
var stateRecordId = Guid.NewGuid();
```

- The generated value is inserted explicitly into `dbo.JobTable.id`.
- `AppendAsync` later returns `Task<Guid>`.
- SQL and in-memory repositories use the same identity behavior.

## 9. Deterministic state association

`StateRecordId` participates in deterministic association, but an ID match alone is not sufficient to suppress a legacy timeline entry.

An inferred legacy entry may be suppressed only when every condition below is true:

```text
Explicit event type is Export or Rollback
Explicit outcome is Succeeded or SucceededWithWarning
Explicit StateRecordId is present and matches the legacy state row Id
Normalized legacy event type matches the explicit event type
```

The comparison uses canonical normalized operation types. An explicit Export event can suppress only an inferred Export entry, and an explicit Rollback event can suppress only an inferred Rollback entry. A normal status transition, note, Freeze/Unfreeze transition, or another legacy event type is never hidden merely because its source row has the same ID.

Both timeline elements must remain visible for at least these cases:

```text
explicit outcome is Failed
explicit outcome is RequiresManualReview
StateRecordId is missing
StateRecordId does not match
explicit and normalized legacy operation types differ
legacy item is a status or note event
legacy item is not a normalized Export or Rollback event
```

Timestamp-based or heuristic deduplication is prohibited.

Do not deduplicate by:

- timestamps;
- dataset name and version;
- message or title;
- array position;
- rounded time values.

When the complete deterministic rule is not satisfied, explicit operation events and legacy state transitions remain separate timeline items.

## 10. Public API contract

The existing route remains:

```http
GET /electronicproducts/{datasetName}/history
```

The future implementation uses an endpoint-specific response type.

The wire contract preserves:

```text
Data: ProductHistoryResponse[]
TotalHits: legacy state count
```

and adds:

```text
Events: ProductHistoryEventResponse[]
EventTotalHits: explicit event count
```

The global generic `ApiResponse` must not be changed to add Product History events.

Legacy state rows later expose their existing database identifier additively as `Id`.

## 11. Frontend normalization contract

Batch 1 later normalizes:

- legacy inferred state events from `Data`;
- explicit audit events from `Events`.

The normalized model preserves source, raw event/outcome values, and identity references.

Unknown event types or outcomes:

- remain visible;
- use neutral fallback presentation;
- do not throw;
- do not get dropped;
- do not require speculative producer enums in advance.

Current legacy-only payloads remain supported when `Events` and `EventTotalHits` are absent.

## 12. Audit failure policy

### 12.1 Pending creation failure

A pending audit event must exist before irreversible business side effects.

If pending creation fails:

- execution stops before irreversible work;
- `ProductManagerExecutionStarted` remains unset;
- the job receives a distinct safe code such as:

```text
PRODUCT_HISTORY_UNAVAILABLE
```

This must not use `MANUAL_REVIEW_REQUIRED`, because execution did not begin.

### 12.2 Execution-start ordering

Batch 2 must preserve the existing Hangfire replay guard and add the audit checkpoint in this order:

```text
pending audit event exists
→ set ProductManagerExecutionStarted
→ update audit ExecutionStartedAtUtc and UpdatedAtUtc
→ begin business side effects
```

If the audit execution checkpoint fails after the Hangfire flag is set:

- business side effects do not begin;
- the job does not clear or replay the Hangfire flag;
- the event is conservatively recovered as:

```text
Outcome = RequiresManualReview
Code = MANUAL_REVIEW_REQUIRED
```

### 12.3 Finalization failure after business success

After a successful business operation:

- success and state references are written to application-owned Hangfire metadata before audit finalization;
- audit finalization is attempted;
- audit finalization failure is logged;
- the business operation and Hangfire job remain successful;
- reconciliation later finalizes the pending event.

Audit persistence failure must never make a successful Export or Rollback appear as a business failure.

## 13. Terminal recovery metadata

Batch 2 must write the following after successful Export/Rollback and before audit finalization:

```text
ProductManagerOperationId
ProductManagerStateRecordId
ProductManagerResultEdition
ProductManagerResultUpdate
ProductManagerResultCode
ProductManagerResultMessage
ProductManagerWarningCode
ProductManagerWarningMessage
```

This metadata lets reconciliation reconstruct the complete terminal event if audit finalization fails after `JobTable` append.

`StateRecordId` must not exist only in the audit table finalization write, because that would make recovery nondeterministic.

## 14. Reconciliation design

Planned Batch 2 configuration:

```text
Recurring job ID: product-history-reconciliation
Initial schedule: every 15 minutes
Dedicated queue: productmanager-maintenance
Initial host: ProductCatalogueAPI Hangfire Server
Future host: shared worker
```

### 14.1 Initial ownership

When Batch 2 is implemented:

- ProductCatalogueAPI registers the recurring job;
- its Hangfire Server listens to `productmanager-maintenance`;
- the recurring job and queue have one active owner configuration.

### 14.2 State classifier

Reconciliation must use the existing status mapping or an explicit state classifier.

```text
Non-terminal:
    leave pending

Succeeded:
    finalize from application-owned safe metadata

Terminal non-success:
    Failed when execution never started
    RequiresManualReview when execution started

Unknown:
    leave pending and log
```

Unknown states must not be finalized automatically.

### 14.3 Reconciliation restrictions

Reconciliation must never:

- rerun Export;
- rerun Rollback;
- mutate Product state;
- acquire ownership through the audit table;
- turn business success into failure because an audit write failed.

### 14.4 Future worker migration

During later worker extraction:

- queue ownership and recurring registration move together to the shared worker;
- ProductCatalogueAPI no longer executes the maintenance queue;
- the recurring job ID and schedule remain stable unless a separate operational decision changes them;
- only one active worker configuration owns the queue after cutover.

External worker extraction is not part of BE-108A.

## 15. Batch 1 future database script acceptance

When Batch 1 is later implemented, the database-owner review must confirm:

1. The create script succeeds on a database without the table.
2. Re-running it against an identical schema makes no changes and succeeds.
3. It fails on incompatible columns, types, nullability, defaults, constraints, or indexes.
4. The verify script returns a failing exit/error for every incompatible schema condition.
5. The table uses `[dbo]` explicitly.
6. Transaction and `XACT_ABORT` behavior leave no partial additive schema deployment.
7. Application rollback leaves the additive table intact.

## 16. Documentation-only completion gate

This design is complete when source-of-truth documents agree on:

- Batch 1 and Batch 2 boundaries;
- migration ownership;
- outcomes;
- identities;
- deterministic association;
- endpoint envelope;
- audit failure handling;
- reconciliation host, schedule, queue, and state classification;
- deferred producers and integrations.

No runtime implementation, SQL migration, tests, project files, configuration changes, or queue registration belongs to this documentation-only package.
