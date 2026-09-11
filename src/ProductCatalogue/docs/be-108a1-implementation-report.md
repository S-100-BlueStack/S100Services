# BE-108A Batch 1 implementation report

## Candidate identity

- Authoritative port baseline: `2ec17a5c47aa353256d0a3445620bebe83e6eecf`.
- Controlled previous BE-108A implementation input: `7ee4ec903e883d2f8d35af1019ef0d0881c5c410` (`Add Product History audit event foundation`).
- Previous port ZIP: `BE-108A1-port-2ec17a5-v1.zip`.
- Previous port ZIP SHA-256: `00F85F54BAFC793D0C2FD871BC6A39F994CFF61FCF40F58626FAD413E80E810C`.
- The current working tree is newer than that ZIP because local formatting and this documentation completion pass happened afterward.
- No commit is claimed for the ported Batch 1 working tree in this report.

## Why a port was required

The authoritative backend changed after the original BE-108A implementation. The Product workflow redesign replaced runtime `dbo.JobTable` state-history persistence with normalized workflow tables. In particular:

```text
dbo.ProductStateHistory
  product_state_history_id uniqueidentifier primary key
```

The old BE-108A implementation had changed `IProductRepository.AppendAsync` to return `Task<Guid>` and explicitly inserted `JobTable.id`. Carrying that implementation forward would have restored an obsolete persistence boundary. The port therefore treats the workflow redesign as authoritative and keeps the redesigned repository contracts intact.

## Final Batch 1 architecture

BE-108A adds `dbo.ProductHistoryEvent` as independent audit lifecycle persistence. It is not Product state, a lock, an enqueue claim, an operation owner, scheduler storage, or Hangfire storage.

The normalized Product state-history identity is:

```text
Database: dbo.ProductStateHistory.product_state_history_id
Repository/API: ProductRecord.Id / ProductHistoryResponse.Id
Audit reference: ProductHistoryEvent.StateRecordId
```

`IProductRepository.AppendAsync` remains the workflow-redesign `Task` contract. `ProductRepository` and `IProductWorkflowRepository` remain owned by the normalized Product workflow architecture. Batch 1 does not introduce a state-ID-returning write API. Producer-side capture belongs to Batch 2.

The audit persistence and service boundary provides:

- application-owned `OperationId` uniqueness;
- optional `StateRecordId`, `JobId`, `CorrelationId`, and `ExportTarget` diagnostics;
- canonical outcomes `Succeeded`, `Failed`, `SucceededWithWarning`, and `RequiresManualReview`;
- trim/invariant-uppercase `DatasetName` canonicalization;
- exact audit lookup with a UTF-16 binary equality residual;
- bounded safe messages and allowlisted structured metadata;
- pending, execution-start, and finalization lifecycle timestamps;
- finalized-only public History reads.

No Export, Rollback/Cancel Export, Send, validation, report, Hangfire metadata, scheduler, reconciliation, lock, or operation-ownership producer is connected in Batch 1.

## Public History contract

The existing route remains:

```http
GET /electronicproducts/{datasetName}/history
```

The endpoint-specific response preserves:

```text
Data
TotalHits
```

and adds:

```text
Events
EventTotalHits
```

Each state-history row exposes its exact normalized state ID as `Id`. Only finalized explicit audit rows are public. A Product name outside the audit storage/safety bounds still receives its state history while audit lookup is skipped.

## Frontend behavior

The shared Timeline feature normalizes inferred state-history entries and explicit audit entries into one presentation model while preserving source and identity metadata.

A successful explicit Export/Rollback suppresses an inferred state-history operation only when:

1. the explicit type is Export or Rollback;
2. the explicit outcome is `Succeeded` or `SucceededWithWarning`;
3. `StateRecordId` matches the state-history row ID;
4. that ID occurs on exactly one current `Data` row; and
5. the inferred operation type matches the explicit operation type.

Duplicate state IDs fail closed and suppress nothing. Failed/manual-review outcomes, missing IDs, mismatches, different operation types, status/note/Freeze/Unfreeze transitions, and unknown values remain visible. No timestamp-based deduplication exists.

Known Product presentation keeps `S101` as `S-101` and the established user-facing `Cancel Export` terminology for Rollback presentation. Paper Charts and S-102 retain source-aware unavailable History behavior and do not fall through to compatibility History requests.

## Database deployment and rollback

Deployment order is:

1. Ensure the Product workflow redesign migration has already established `dbo.ProductStateHistory`.
2. Run `BE108A_001_CreateProductHistoryEvent.sql`.
3. Run `BE108A_001_VerifyProductHistoryEvent.sql`.
4. Run the explicit opt-in database-owner test.
5. Deploy API/frontend only after those gates succeed.

BE-108A never creates, alters, repairs, or renames the normalized workflow tables. The additive `dbo.ProductHistoryEvent` table is retained on application rollback; there is no BE-108A drop script.

## Verification actually completed

Verification performed on 2026-09-11:

- ProductCatalogueAPI Release build: succeeded with warnings and no errors.
- Focused Product History tests before database-owner opt-in: 43 passed, 0 failed, 1 skipped as designed.
- Frontend formatting/check: succeeded in the user's local repository environment.
- `BE108A_001_CreateProductHistoryEvent.sql`: succeeded against the configured System database.
- `BE108A_001_VerifyProductHistoryEvent.sql`: succeeded against the same database.
- Database-owner integration test: 1 passed, 0 failed, 0 skipped.

The database-owner test verified the normalized state-history identity prerequisite, rollback-only explicit `ProductStateHistory` ID insertion, canonical audit persistence/query, near-match exclusion, finalized public visibility, and cleanup.

A deliberately incompatible schema was not introduced into the live System database. The negative-schema procedure remains limited to disposable copies.

## Remaining acceptance

The post-port Product History UI smoke should still be rerun because the previous manual History smoke occurred before the workflow-redesign port. Expected Batch 1 behavior remains deliberately quiet: ordinary History normally contains state-history entries and an empty explicit `Events` collection because no runtime audit producers are connected yet.

Recommended smoke coverage:

- Main map Product History renders existing state-history entries normally.
- Analyze and Review History retain the shared rendering behavior.
- Expand/collapse, ordering, details, keyboard handling, light/dark mode, and compact layout remain intact.
- Paper Charts and S-102 remain unavailable for compatibility History and make no compatibility History call.
- No unexpected explicit Export/Cancel Export audit events appear without a test fixture or later producer implementation.

## Dependencies

No new npm or NuGet dependency is introduced by BE-108A Batch 1.

## Batch 2 boundary

Batch 2 must start from a fresh discovery pass against the then-current normalized workflow implementation. It must not restore `JobTable` or assume `AppendAsync -> Task<Guid>`.

Future producer/recovery design must define how the normalized workflow write returns or otherwise exposes the newly created `ProductStateHistory.product_state_history_id` needed for deterministic audit association and terminal recovery metadata.
