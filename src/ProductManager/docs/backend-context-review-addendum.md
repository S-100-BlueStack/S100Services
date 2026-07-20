# BE-101 addendum: scope corrections and confirmed decisions

Baseline: `6d18fae743a67cdc85864aa68c51cf6d79921d0c`

This addendum permanently records the scope corrections and confirmed decisions that followed the full backend context review.

It contains documentation decisions only. It does not authorize or include runtime implementation.

## Source-of-truth precedence

- This committed addendum corrects scope formulations in the original BE-101 context report.
- The technical findings from BE-101 remain valid unless a later verified code review supersedes them.
- When scope wording conflicts between the original BE-101 report, the roadmap, and this addendum, this addendum takes precedence.
- Runtime implementation must not expand a work package without explicit approval and a corresponding documentation change.

## Locked work package boundaries

The existing work package division is preserved:

| ID     | Work package                        |
| ------ | ----------------------------------- |
| BE-102 | Readable ExportTarget contract      |
| BE-103 | AOI profiling and optimization      |
| BE-104 | Async Export/Rollback jobs          |
| BE-105 | Product-level active job visibility |
| BE-106 | Dashboard filtering and pagination  |

BE-102 must not absorb Hangfire, job status, recovery, lock hardening, authentication, AOI, Dashboard, or geometry work.

## BE-102 scope

BE-102 contains only:

### Backend

- Limit the public `exportTarget` contract to the readable values `All`, `S100`, and `S57`.
- Allow only `S100` as a supported target.
- Use shared target parsing and validation for New Edition and New Update.
- Document the readable contract in Swagger/OpenAPI.
- Add relevant backend contract and endpoint tests.

### Frontend

- Define explicit target and export-type metadata for all six export leaves:
  - All Edition;
  - All Update;
  - S100 Edition;
  - S100 Update;
  - S57 Edition;
  - S57 Update.
- Enable only S100 Edition.
- Keep all other leaves disabled.
- Add relevant metadata, availability, and request-contract tests.

BE-102 changes no Product database or geodatabase schema.

## Public ExportTarget contract

The approved public values are:

```text
All
S100
S57
```

Use this wording:

> Limit the public `exportTarget` contract to the readable values `All`, `S100`, and `S57`.

Do not describe the change as replacing an exclusively numeric public contract. ASP.NET enum model binding may already accept both enum names and numeric enum values.

## Numeric targets and consumer review

Numeric values `0`, `1`, and `2` are not approved public values after BE-102.

They must be rejected unless consumer review identifies either:

- a verified existing consumer; or
- a deployment-order requirement that cannot be handled by coordinated deployment.

Any temporary numeric support must include:

- a documented compatibility reason;
- explicit deprecation;
- a concrete removal plan.

Legacy support for numeric `1` is not pre-approved.

## New Update clarification

BE-102 implements only the readable ExportTarget contract.

The existing New Update operation remains unimplemented. For a valid `S100` target, the endpoint must retain its current not-implemented behavior until a separate work package implements S100 Update.

BE-102 must not add the underlying generation or export logic for New Update.

Target parsing and target validation must be shared by New Edition and New Update, but shared validation does not make S100 Update operational.

## Expected behavior after BE-102

| Operation   | Target                   | Expected backend behavior                                        | Frontend state |
| ----------- | ------------------------ | ---------------------------------------------------------------- | -------------- |
| New Edition | `S100`                   | Execute the existing S100 Edition export                         | Enabled        |
| New Edition | `All`                    | Explicit unsupported-target error                                | Disabled       |
| New Edition | `S57`                    | Explicit unsupported-target error                                | Disabled       |
| New Edition | numeric `0`, `1`, or `2` | Reject unless consumer review documents temporary legacy support | Not sent       |
| New Update  | `S100`                   | Retain the existing not-implemented response                     | Disabled       |
| New Update  | `All`                    | Explicit unsupported-target error                                | Disabled       |
| New Update  | `S57`                    | Explicit unsupported-target error                                | Disabled       |
| New Update  | numeric `0`, `1`, or `2` | Reject unless consumer review documents temporary legacy support | Not sent       |

## Target validation order

The expected shared validation order is:

1. Reject an invalid or numeric target.
2. Reject `All` and `S57` as valid but unsupported targets.
3. Allow a valid `S100` request to reach the endpoint's operation-specific behavior.

For New Edition, the existing S100 export is executed.

For New Update, the existing not-implemented response is retained.

If the current backend architecture makes this ordering unsuitable, it must not be changed silently. The deviation must be recorded as an open BE-102 question before implementation.

## Dataset locking

BE-101 confirmed that `DatasetLockService` uses a separate Windows lock file under `%ProgramData%`; it does not lock the Product file itself.

The existing framework is retained.

Do not introduce:

- database locks;
- lock tables;
- Product lock fields;
- distributed locks;
- a second Product lock;
- a replacement lock framework.

Job visibility must never be treated as the concurrency authority.

## BE-104 risks and hardening findings

The following BE-101 findings are recorded for BE-104 or separate hardening work and are not implemented in BE-102:

- non-idempotent Export and Rollback behavior;
- default Hangfire retries;
- partial mutations before later failures;
- 30-minute stale-lock cleanup;
- missing Product lock use in `DetectProductChangesJob`;
- ignored Rollback output-cleanup failures;
- SevenCs exception handling;
- serialized ArcGIS execution;
- partial-output cleanup and recovery behavior.

These findings are risks and prerequisites. They do not automatically expand BE-104 or any other work package without explicit approval.

## Authentication and authorization

Authentication and authorization remain intentionally open during development because earlier authentication integration caused CORS and related development issues.

They are deferred to production-readiness work.

They are not:

- part of BE-102 scope;
- BE-102 acceptance criteria;
- required BE-102 tests.

## Analyze geometry

Analyze geometry is not changed in BE-102.

The likely long-term public API direction is structured geometry rather than a JSON-encoded string, so the frontend does not need to parse backend serialization.

Internal ArcGIS `ToJson()` and `ImportFromJson()` use may remain unchanged.

A separate later API-contract task must review all backend and frontend consumers before changing the public response shape. Analyze continues to load one Product per request.

## Usage Band labels

Usage Band labels must use the full description:

```text
1 - Navigational Purpose Overview
2 - Navigational Purpose General
3 - Navigational Purpose Coastal
4 - Navigational Purpose Approach
5 - Navigational Purpose Harbour
6 - Navigational Purpose Berthing
```

Do not use shortened labels such as `4 - Approach`.

## BE-102 acceptance criteria

BE-102 is accepted when:

- Swagger/OpenAPI documents `All`, `S100`, and `S57` as the public target values.
- Only `S100` is supported.
- `All` and `S57` return an explicit unsupported-target error.
- Numeric `0`, `1`, and `2` are rejected unless consumer review documents temporary support, deprecation, and a removal plan.
- New Edition and New Update use the same target parsing and validation contract.
- S100 New Edition continues to execute the existing export.
- S100 New Update remains unimplemented and its frontend leaf remains disabled.
- BE-102 only applies the shared target parsing and validation contract to the New Update endpoint.
- Frontend metadata exists for all six leaves.
- Only S100 Edition is enabled.
- Relevant backend and frontend tests pass.
- No Hangfire, job-status, lock, recovery, authentication, AOI, Dashboard, or geometry runtime changes are included.
- BE-102 requires no database or geodatabase schema changes.
