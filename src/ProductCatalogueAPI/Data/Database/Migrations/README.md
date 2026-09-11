# System database migrations

BE-108A Batch 1 uses repository-owned SQL Server scripts executed by the database owner in the System database configured by `Connections:SystemConnection`. The audit table is separate from Hangfire storage and from the normalized Product workflow tables.

There is no EF Core migration, automatic startup migration, or application-owned schema creation.

## Deployment order after the Product workflow redesign

The authoritative runtime baseline stores Product state history in `dbo.ProductStateHistory`. The workflow schema must therefore exist before the BE-108A gate is run.

From the repository root, use this deployment order:

1. Apply `src/ProductCatalogueAPI/Data/Migrations/001_ReplaceJobTableWithProductWorkflow.sql` if the normalized Product workflow migration has not already been applied to the target System database.
2. Run `src/ProductCatalogueAPI/Data/Database/Migrations/BE108A_001_CreateProductHistoryEvent.sql`.
3. Run `src/ProductCatalogueAPI/Data/Database/Migrations/BE108A_001_VerifyProductHistoryEvent.sql`.
4. Run the opt-in database-owner integration test described below.
5. Deploy the API/frontend only after those gates succeed.

The BE-108A scripts require `dbo.ProductStateHistory.product_state_history_id` to be a non-null built-in `uniqueidentifier` and the single-column primary key. They never create, alter, repair, or rename normalized workflow tables.

The create script is transactional with `XACT_ABORT ON` and must run without an ambient transaction. Re-running it against the expected audit schema succeeds without changing data. The verify script is read-only. Incompatible audit schema or state-ID prerequisites fail with `THROW`.

If `dbo.ProductHistoryEvent` already exists from an earlier BE-108A Batch 1 deployment, the ported script validates the same audit-table contract; it does not require the table to be recreated.

## Audit storage contract

`dbo.ProductHistoryEvent` is independent audit lifecycle persistence. It is not Product state, a lock, an enqueue claim, operation ownership, scheduler storage, or a replacement for the normalized workflow tables.

| Column | Type | Nullable |
| --- | --- | --- |
| Id | uniqueidentifier | No |
| OperationId | uniqueidentifier | No |
| StateRecordId | uniqueidentifier | Yes |
| DatasetName | nvarchar(256) | No |
| EventType | nvarchar(64) | No |
| Outcome | nvarchar(32) | Yes |
| Code | nvarchar(128) | Yes |
| SafeMessage | nvarchar(1024) | Yes |
| CorrelationId | nvarchar(128) | Yes |
| JobId | nvarchar(128) | Yes |
| ExportTarget | nvarchar(32) | Yes |
| OperationMetadataJson | nvarchar(4000) | Yes |
| CreatedAtUtc | datetime2(7) | No |
| UpdatedAtUtc | datetime2(7) | No |
| ExecutionStartedAtUtc | datetime2(7) | Yes |
| FinalizedAtUtc | datetime2(7) | Yes |
| OccurredAtUtc | datetime2(7) | Yes |

Indexes and keys:

- `PK_ProductHistoryEvent`: clustered primary key on `Id`.
- `UQ_ProductHistoryEvent_OperationId`: unique nonclustered constraint on `OperationId`.
- `IX_ProductHistoryEvent_DatasetName_OccurredAtUtc`: DatasetName/OccurredAtUtc read index.
- `IX_ProductHistoryEvent_Pending`: filtered pending-event index.

There is deliberately no foreign key from `StateRecordId` to `ProductStateHistory`. The audit model is independent lifecycle persistence; association is explicit and application-owned.

## StateRecordId after the workflow redesign

`StateRecordId` now refers to `dbo.ProductStateHistory.product_state_history_id`, not legacy `JobTable.id`.

The normalized repository already projects that identifier as `ProductRecord.Id` in Product History reads. BE-108A Batch 1 therefore does **not** change `IProductRepository.AppendAsync`, `ProductRepository`, or `IProductWorkflowRepository` to return state IDs. Producer-side capture of newly inserted state IDs belongs to the later producer/recovery batch and must be designed against the normalized workflow repository.

The database migration that creates the normalized workflow uses `product_state_history_id` as a primary key. BE-108A verifies that identity contract and performs a rollback-only insertion probe in the opt-in owner test. A target that fails either gate requires database-owner review; BE-108A must not weaken or repair the normalized schema automatically.

## DatasetName and public data safety

Audit DatasetName values are trimmed and normalized with `ToUpperInvariant()` at write and query boundaries. The canonical value must be non-empty, at most 256 UTF-16 code units, and contain no control characters. This remains an audit storage/safety rule, not a Product naming grammar.

Repository reads use both `DatasetName = @DatasetName` and equality of the UTF-16 binary representation. This keeps exact-name semantics independent of database-default accent, width, and trailing-space equivalence.

Write event types remain the Batch 1 foundation values `Export` and `Rollback`. Batch 1 does not connect runtime producers. `ExportTarget`, when present, is a bounded diagnostic token normalized to invariant uppercase; the audit foundation does not duplicate the redesigned export-target registry.

The service accepts no raw exception, caller-provided safe message, caller-provided outcome string, or raw JSON. `ProductHistoryResult` maps to fixed safe codes/messages. Structured operation metadata remains allowlisted and bounded.

## Public History contract

`GET /electronicproducts/{datasetName}/history` keeps the existing state-history fields:

```text
Data
TotalHits
```

Each `Data` row additionally exposes its exact normalized state-history `Id`. The endpoint-specific envelope adds:

```text
Events
EventTotalHits
```

Only finalized audit rows are public. Pending events are excluded. If the Product exists but its name falls outside the audit storage/safety bounds, normalized state history is still returned and audit lookup is skipped.

The frontend keeps explicit and inferred events separate unless deterministic association succeeds. A successful `Export`/`Rollback` event can suppress a matching inferred event only when its `StateRecordId` matches exactly one legacy row in the current payload and the inferred operation type also matches. Timestamps are never used for deduplication.

## Database-owner integration verification

Ordinary unit tests do not contact the System database. The opt-in test executes create -> verify -> create, verifies explicit application-generated insertion of a `ProductStateHistory` primary key inside a rollback-only transaction, exercises canonical audit persistence/query and uniqueness, and invokes the Product History controller with a synthetic in-memory Product state source.

A `ProductExportTrack` row must exist so the rollback-only state-history insertion can reference a valid track. The test never modifies an existing state row and rolls its inserted state row back.

From the repository root:

```powershell
$env:BE108A_DATABASE_OWNER_VERIFY = '1'
$env:BE108A_SYSTEM_CONNECTION_FILE = '<absolute path to the existing System connection-string file>'

try {
    dotnet test .\tests\TestProductManager\TestProductManager.csproj `
        -c Release `
        --filter 'FullyQualifiedName~ProductHistoryDatabaseOwnerTests' `
        --logger 'console;verbosity=detailed'

    if ($LASTEXITCODE -ne 0) {
        throw 'Database-owner integration verification failed.'
    }
}
finally {
    Remove-Item Env:BE108A_DATABASE_OWNER_VERIFY -ErrorAction SilentlyContinue
    Remove-Item Env:BE108A_SYSTEM_CONNECTION_FILE -ErrorAction SilentlyContinue
}
```

The test logs only generated verification identities. Audit verification rows are deleted in `finally`; the temporary state-history row is protected by transaction rollback.

If the test process is terminated before audit cleanup, remove only the exact logged operation IDs after verifying their purpose. Never delete by DatasetName prefix or clear the audit table.


## Verification record - 2026-09-11

The port was verified against workflow-redesign baseline `2ec17a5c47aa353256d0a3445620bebe83e6eecf` after the normalized Product workflow schema was already present in the configured System database. The workflow migration was not rerun as part of BE-108A verification.

Results:

- `BE108A_001_CreateProductHistoryEvent.sql`: succeeded.
- `BE108A_001_VerifyProductHistoryEvent.sql`: succeeded.
- Create also succeeded against the already-existing expected audit table, confirming the idempotent existing-schema path used by this deployment.
- Focused Product History tests succeeded before owner opt-in with 43 passed, 0 failed, and the owner test skipped as designed.
- The explicit database-owner run then succeeded 1/1 with no skips.
- The owner test verified the `ProductStateHistory` primary-key prerequisite, rollback-only explicit state-ID insertion, canonical audit persistence/query behavior, near-match exclusion, finalized public visibility, and cleanup.
- ProductCatalogueAPI Release build and frontend check also succeeded in the local repository environment.

No server name, credential, connection-string path, or generated verification identity is part of this repository record. No deliberately incompatible schema was introduced into the live System database.

## Incompatible-schema negative test

Use only a disposable database copy. Add an unexpected `dbo.ProductHistoryEvent` column, run `BE108A_001_VerifyProductHistoryEvent.sql`, and require error `51086`. Roll back/discard the disposable change afterward. Similar reviewed negative cases may cover changed nullability, unexpected defaults, missing/changed operation uniqueness, or a modified pending-index filter.

Do not create incompatibilities in a live System database merely to exercise rejection paths.

## Rollback boundary

Application rollback must retain `dbo.ProductHistoryEvent` and its audit rows. There is deliberately no BE-108A down/drop script.

The normalized Product workflow migration has its own deployment/rollback boundary. BE-108A does not claim that an application version expecting legacy `JobTable` can be redeployed after `JobTable` has been renamed by the workflow migration.

Batch 1 has no Export/Cancel Export producers, so an empty audit table is normal. Producer lifecycle, state-ID capture for newly written normalized state rows, Hangfire recovery metadata, and reconciliation remain deferred.
