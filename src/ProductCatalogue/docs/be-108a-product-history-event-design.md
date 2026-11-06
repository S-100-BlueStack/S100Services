# BE-108A Product History Event Design

Documentation baseline: `8caf5f771f1a6721398007589afbe875d553615d`

Status: **Batch 1 remains the accepted foundation. Batch 2 manual Export producers and recovery are implemented as an uncommitted candidate against `e06f8808677cf8f00b1e1a7621d40df4a9982a82`; local .NET, database-owner and runtime acceptance remain required. Section 18 supersedes the older Batch 2 operation vocabulary and hosting proposal.**

This document remains the source of truth for BE-108A. The original design is retained where it still applies; section 17 records the Batch 1 implementation after adaptation to the normalized Product workflow architecture.

## 1. Purpose

BE-108A adds a durable Product-level audit event model alongside the existing state history.

The design must answer:

- what logical operation happened;
- when it reached a terminal audit outcome;
- whether the outcome is confirmed, warning-bearing, failed, or uncertain;
- which job and correlation identifiers support diagnosis;
- which exact normalized state-history row belongs to a successful operation.

Product History remains an audit log. It does not reconstruct historical map state.

## 2. Current-state boundary

The current history endpoint returns normalized Product state-history rows from `dbo.ProductStateHistory` through:

```text
Data: ProductHistoryResponse[]
```

The frontend compares adjacent rows and infers summaries such as Freeze, Export, or Rollback. This remains the state-history model alongside the explicit audit model.

The workflow redesign migrated the old `JobTable` data and renamed that table to `JobTable_Legacy`; BE-108A no longer uses `JobTable` as a runtime contract. `dbo.ProductStateHistory.product_state_history_id` is the authoritative state-row identity and is projected as `ProductRecord.Id`.

The new `dbo.ProductHistoryEvent` persistence is additive and independent from Product state persistence and Hangfire job retention.

## 3. BE-108A implementation batches

### Batch 1 - Foundation

Implemented and ported:

- dedicated Product History event persistence;
- repository and lifecycle service;
- endpoint-specific History response;
- additive `Events`, `EventTotalHits`, and state-history `Id`;
- `StateRecordId` association with `ProductStateHistory.product_state_history_id`;
- application-owned `OperationId`;
- deterministic frontend `StateRecordId` association with duplicate-ID fail-closed behavior;
- frontend state-history/explicit-event normalization;
- foundation tests and database-owner deployment documentation.

Batch 1 does not connect Export or Rollback jobs to the event lifecycle and does not change normalized workflow writes to return state IDs.

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

### 5.1 Repository layout

Batch 1 uses:

```text
src/ProductCatalogueAPI/Data/Database/Migrations/
  README.md
  BE108A_001_CreateProductHistoryEvent.sql
  BE108A_001_VerifyProductHistoryEvent.sql
```

The create and verify scripts are implemented. They validate the normalized `ProductStateHistory` identity prerequisite without changing that workflow table.

### 5.2 Create-script requirements

The create script must:

- use explicit `[dbo]` schema;
- use `SET XACT_ABORT ON`;
- wrap additive schema changes in a transaction;
- be idempotent when the existing schema is identical;
- use `THROW` for an incompatible existing table, column, constraint, or index;
- never silently alter or repair unknown schema variants.

### 5.3 Verify-script requirements

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
-> convert with invariant uppercase
-> validate the canonical value
-> persist/query using the canonical value
```

The event table therefore stores the canonical `DatasetName`. Repository queries receive an already canonicalized value and use exact equality; prefix, substring, wildcard, and culture-sensitive matching are prohibited.

The canonicalization function must be shared by the persistence contract, lifecycle service, repository-query entry point, and tests. An in-memory case-insensitive test is not sufficient. Batch 1 must include SQL Server integration verification showing that differently cased caller input reaches the same canonical row and that near-match Product names do not match.

Because canonicalization is selected instead of a collation-based contract, the future verify script does not establish case-insensitive behavior through collation. It must still verify the expected column definition and must fail if the stored schema differs from the approved Batch 1 design. A later switch to collation-based semantics would require a new explicit design decision and verify-script checks for that collation.

### 5.5 Deployment and rollback

Deployment is database-first:

```text
database owner executes create script
-> database owner executes verify script
-> application deployment may proceed
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

The event persistence includes:

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

The audit lifecycle preserves four separate identifiers:

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

- Identifies the exact normalized `dbo.ProductStateHistory` row associated with a successful operation.
- The database identity is `product_state_history_id`, a non-null single-column `uniqueidentifier` primary key.
- State-history reads expose that value through `ProductRecord.Id` and then `ProductHistoryResponse.Id`.
- Batch 1 does not change `IProductRepository.AppendAsync`, `ProductRepository`, or `IProductWorkflowRepository` to return state IDs.
- Producer-side capture of a newly inserted state-history ID is a Batch 2 concern and must use the normalized workflow repository contract rather than restoring the pre-redesign `JobTable` write path.

## 9. Deterministic state association

`StateRecordId` participates in deterministic association, but an ID match alone is not sufficient to suppress a legacy timeline entry.

An inferred legacy entry may be suppressed only when every condition below is true:

```text
Explicit event type is Export or Rollback
Explicit outcome is Succeeded or SucceededWithWarning
Explicit StateRecordId is present and matches the state-history row Id
Exactly one Data row in the current History payload has that StateRecordId
Normalized inferred event type matches the explicit event type
```

The comparison uses canonical normalized operation types. An explicit Export event can suppress only an inferred Export entry, and an explicit Rollback event can suppress only an inferred Rollback entry. A normal status transition, note, Freeze/Unfreeze transition, or another legacy event type is never hidden merely because its source row has the same ID.

Both timeline elements must remain visible for at least these cases:

```text
explicit outcome is Failed
explicit outcome is RequiresManualReview
StateRecordId is missing
StateRecordId does not match
StateRecordId occurs on more than one Data row in the current History payload
explicit and normalized inferred operation types differ
state-history item is a status or note event
state-history item is not a normalized Export or Rollback event
```

Timestamp-based or heuristic deduplication is prohibited.

Do not deduplicate by:

- timestamps;
- dataset name and version;
- message or title;
- array position;
- rounded time values.

When the complete deterministic rule is not satisfied, explicit operation events and inferred state-history transitions remain separate timeline items.

## 10. Public API contract

The existing route remains:

```http
GET /electronicproducts/{datasetName}/history
```

Batch 1 uses an endpoint-specific response type.

The wire contract preserves:

```text
Data: ProductHistoryResponse[]
TotalHits: state-history count
```

and adds:

```text
Events: ProductHistoryEventResponse[]
EventTotalHits: explicit event count
```

The global generic `ApiResponse` must not be changed to add Product History events.

State-history rows expose their existing `ProductStateHistory.product_state_history_id` additively as `Id`.

## 11. Frontend normalization contract

Batch 1 normalizes:

- inferred state-history events from `Data`;
- explicit audit events from `Events`.

The normalized model preserves source, raw event/outcome values, and identity references.

Unknown event types or outcomes:

- remain visible;
- use neutral fallback presentation;
- do not throw;
- do not get dropped;
- do not require speculative producer enums in advance.

State-history-only payloads remain supported when `Events` and `EventTotalHits` are absent.

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
-> set ProductManagerExecutionStarted
-> update audit ExecutionStartedAtUtc and UpdatedAtUtc
-> begin business side effects
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

This metadata is intended to let reconciliation reconstruct the complete terminal event if audit finalization fails after the normalized state-history write.

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

## 15. Batch 1 database and verification acceptance

The Batch 1 database contract requires:

1. `dbo.ProductStateHistory` exists before BE-108A deployment.
2. `product_state_history_id` is a non-null built-in `uniqueidentifier` and the single-column primary key.
3. The BE-108A create script is idempotent against the expected `dbo.ProductHistoryEvent` schema and fails closed on incompatible definitions.
4. The verify script fails with `THROW` for incompatible audit-schema or state-ID prerequisites.
5. The audit table uses `[dbo]` explicitly and create runs transactionally with `XACT_ABORT ON`.
6. Application rollback retains the additive audit table and existing audit data.
7. BE-108A never repairs or changes the normalized Product workflow schema.

Verification performed on 2026-09-11 against the configured System database after the Product workflow redesign:

- `BE108A_001_CreateProductHistoryEvent.sql`: succeeded.
- `BE108A_001_VerifyProductHistoryEvent.sql`: succeeded.
- Re-running create against the already-existing expected audit schema succeeded without recreating it.
- The opt-in `ProductHistoryDatabaseOwnerTests` run succeeded 1/1 and verified the `ProductStateHistory` identity prerequisite, a rollback-only explicit state-history ID insertion, canonical audit write/query behavior, near-match exclusion, finalized public visibility, and cleanup.

No deliberately incompatible schema was introduced into the live System database. Negative-schema testing remains restricted to a disposable database copy.

## 16. Batch 1 completion state

Batch 1 is technically verified when source-of-truth documents agree on:

- the normalized `ProductStateHistory` state-history boundary;
- additive `ProductHistoryEvent` persistence;
- migration ownership and database-first deployment;
- canonical outcomes and bounded safe audit fields;
- `OperationId`, `JobId`, `CorrelationId`, and `StateRecordId` identities;
- deterministic association with duplicate-ID fail-closed behavior;
- the endpoint-specific History envelope;
- source-aware frontend behavior and unknown-value fallback;
- the explicit separation between the implemented foundation and future producers/recovery.

Automated frontend/backend verification and database-owner verification passed on 2026-09-11. A post-port manual Product History UI smoke test remains before final acceptance/commit.

## 17. Batch 1 implementation record after workflow redesign

Authoritative port baseline:

```text
2ec17a5c47aa353256d0a3445620bebe83e6eecf
```

Controlled previous implementation input:

```text
7ee4ec903e883d2f8d35af1019ef0d0881c5c410
```

The workflow redesign is authoritative wherever it conflicts with the previous implementation. The port therefore preserves the new `IProductRepository.AppendAsync` contract and normalized `IProductWorkflowRepository`/`ProductRepository` architecture instead of restoring the old `JobTable`-based `Task<Guid>` behavior.

Batch 1 adds or retains:

- `ProductHistoryEventRecord`, repository, lifecycle service, central contract, and endpoint-specific envelope;
- database-first create/verify scripts for the additive audit table;
- the `ProductStateHistory.product_state_history_id` prerequisite and `ProductRecord.Id` public state-history identity;
- finalized-only audit reads;
- shared frontend normalization of state-history and explicit audit events;
- deterministic successful Export/Rollback suppression only with exact unique state identity and matching operation type;
- duplicate state-ID fail-closed behavior;
- neutral presentation of unknown event types/outcomes;
- source-aware History fail-closed behavior for unsupported sources;
- no Batch 1 producer, Hangfire metadata, scheduler, reconciliation, lock, or ownership changes.

The audit table may already exist from an earlier BE-108A deployment. The port intentionally keeps its schema stable and retargets only the state-reference prerequisite to the normalized workflow state-history table.

Batch 2 must begin with a fresh discovery pass against the then-current workflow implementation before producer-side state-ID capture or recovery metadata is designed.

## 18. Batch 2 manual Export producers and recovery

Implementation baseline: `e06f8808677cf8f00b1e1a7621d40df4a9982a82`.
Candidate status: implemented; not built or run against .NET/SQL Server in the delivery environment.

### 18.1 Supported operations and preserved boundaries

`NewDataset`, `ExportEdition`, and `ExportUpdate` produce the existing `Export`
audit event type. Each application-owned `OperationId` identifies one logical
operation, independently of the audit row `Id`, Hangfire `JobId`, diagnostic
`CorrelationId`, and committed `StateRecordId`.

There is no supported distinct Rollback action in this workflow. `Discard` and
legacy `CancelExport` remove an unverified candidate. Their existing business
behavior is preserved and neither is relabeled as Rollback. A Discard audit
producer requires an explicit event-type/semantics decision and is deferred.
The Batch 1 Rollback read/normalization contract remains intact.

Package export continues through `ExecutePackageExportAsync` without a manual
Product audit producer or a change to package-member states. Detection, source
snapshots, compiler layout, validation, Send/Accept, and frontend code are
unchanged. The History endpoint retains its existing endpoint-specific envelope;
no generic `ApiResponse` or API endpoint is introduced.

### 18.2 Lifecycle and replay protection

1. Enqueue assigns an application-generated operation ID to the serialized
   request. The client filter also stores it as `ProductManagerOperationId`.
   Legacy requests without this property can reuse the durable parameter or
   receive it under the existing Product track lock before creating an event.
2. `ExportOperationJob` holds its existing independent Product track lock for
   preconditions, execution, metadata, and finalization. The coordinator creates
   and reads back a pending audit event before invoking Product operations.
   An unavailable pending write/read stops with `PRODUCT_HISTORY_UNAVAILABLE`.
   Lock contention records Failed only for a fresh operation identity; it never
   finalizes an existing event belonging to the operation holding the lock.
3. After the job's authoritative version preconditions, the coordinator first
   persists `ProductManagerExecutionStarted`, then awaits the audit service's
   durable `ExecutionStartedAtUtc` checkpoint. Failure at either boundary stops
   before the operation service is invoked. No synchronous wait is introduced.
4. The existing `beforeMutation` hook records whether workflow mutation may have
   begun. A service precondition rejection can be classified as confirmed Failed
   only when the execution owner observed rejection before this hook. Exceptions
   after the hook, interrupted execution, and uncertain checkpoint writes use
   RequiresManualReview. Errors before any checkpoint attempt use Failed.
5. Manual completion uses `CompleteExportWithHistoryAsync`. A serializable SQL
   transaction changes the validating track to ReadyForDistribution and inserts
   its immutable state-history row. `OUTPUT INSERTED.product_state_history_id`
   returns the exact committed identity. The result includes the resolved
   Product identity and actual candidate version. No timestamp/latest-row or
   expected-version inference is used to find the state ID.
6. A single `ProductManagerHistoryTerminalV1` parameter stores the complete
   application-owned terminal receipt before finalization: operation/job/Product
   identities, operation subtype, outcome, state ID, result version, fixed public
   result code/message, and reviewed warning metadata. Partial writes to the
   older public job parameters are not recovery evidence.
7. Audit finalization and exact-state validation are best effort after business
   success. Failure does not throw back into Hangfire. The receipt remains
   recoverable; public job result parameters are written independently using
   reviewed constants. If even the receipt cannot be stored, the audit remains
   pending and a later terminal observation requires manual review.

A requeue never repeats an operation with an existing pending or finalized audit
identity. A matching successful terminal receipt preserves business success and
allows idempotent finalization, including after Worker restart. SQL outages leave
that receipt intact. Conflicting identities or evidence fail closed; an existing
terminal audit outcome is immutable. Without a receipt, an interrupted pending
attempt requires manual review even if no start timestamp is visible. A legacy
unaudited job whose execution guard is already set cannot be adopted as a fresh
operation. Audit uniqueness is an integrity guard, not a replacement for Product
locks or a distributed business-operation registry.

### 18.3 Recovery evidence and decisions

`ProductHistoryReconciliation` reacquires the same Product track lock, rereads the
pending row, and reads Hangfire's current state and serialized request. It does
not infer the current state by sorting monitoring-history timestamps. It compares
both request and application-owned job parameters with the audit identity.

| Evidence                                                                                                    | Audit behavior                                           |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Processing, Enqueued, Scheduled, Awaiting                                                                   | Leave pending                                            |
| Missing/expired job, unknown state, missing or inconsistent identity                                        | Leave pending and log                                    |
| Terminal job with complete matching success receipt and exact valid completion row                          | Succeeded or SucceededWithWarning                        |
| Terminal job with reviewed failure receipt                                                                  | Use its confirmed Failed or RequiresManualReview outcome |
| Failed/Deleted without receipt and without either execution-start marker                                    | Failed                                                   |
| Failed/Deleted after either start marker, or Succeeded without a receipt                                    | RequiresManualReview                                     |
| Invalid state ID, target, version, receipt content, or state reference already claimed by another operation | Leave pending and log; never manufacture an association  |

The read-only recovery repository validates the exact `ProductStateHistory` ID
against its Product, independent export target, ReadyForDistribution state and
result version. It rejects another operation's existing reference to the same
row. It does not modify Product tables. Bounded keyset pages scan stale pending
events so an old unknown job cannot starve later events. Cancellation is honored
between rows/pages. Repeated and concurrent recovery use the existing lock and
the foundation's compare-and-finalize guard.

### 18.4 Current hosting ownership

The baseline `ProductCatalogueProcessProfile` explicitly makes Api HTTP-only
with zero Hangfire workers and Worker non-HTTP with one Hangfire worker.
`BackendRegistrations.AddProductCatalogueExportExecution` returns immediately
for Api. The new reconciliation services and hosted registration are added only
below that Worker gate.

The existing Worker owns both recurring registration and execution of
`product-history-reconciliation`, every 15 minutes in UTC on `default`. The
stale threshold is 15 minutes. Registration is idempotent under that fixed ID.
No additional server, worker thread, process role, or queue consumer is created.
The historical API-hosted `productmanager-maintenance` proposal is superseded.
A long-running export/detection job can delay a reconciliation sweep because
this preserves the current single-worker contract. This is recovery latency,
not authority to run Export outside its lock.

### 18.5 Public messages and frontend association

Existing approved `ProductHistorySafeMessages` remain the only source of public
audit outcome/code/message. Successful job receipts use the established Export
success constants. Warning text is mapped to the reviewed generic warning,
never copied from arbitrary exception/producer text. Raw exceptions remain in
internal logs, not public audit metadata. No validation report, path, credential,
stack trace, or arbitrary frontend string is stored in the new receipt.

The state ID references the ReadyForDistribution completion row. The frontend
may infer an ordinary status transition for that row. Such a row must remain
visible beside the explicit Export audit event: suppression still requires a
unique exact state ID, matching inferred Export type, and successful explicit
outcome. There is one explicit public audit event per logical operation, not
necessarily one total timeline row.

### 18.6 Deployment and verification

No dependency or schema change is required. Existing database-owner Batch 1
scripts remain prerequisites; no automatic migration is added. Deploy API and
Worker together after local build/test acceptance. Restart Worker and verify
one recurring job on `default`, with no API Hangfire server.

Tests cover producer failure injection, checkpoint ordering, exact state IDs,
post-success persistence outages, restart/requeue, nonterminal/unknown states,
identity/reference rejection, concurrent lock behavior, single hosting ownership,
SQL transaction/query contracts, and frontend no-false-association regressions.
The delivery report records checks actually run and the local acceptance steps.
Do not run opt-in database-owner tests without a configured approved database.
