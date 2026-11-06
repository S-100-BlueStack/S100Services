DPC failed snapshot checkpoints and public errors - 2026-10-29
Source: attached clean main 68d57f39a4670bd376d083add74eee360e4d812d.
All 881 included source hashes verified before edits.

Deployment
  Run the matching BAT beside its ZIP to extract and stage the explicit changed
  files in C:\source\S-100-BlueStack\S100Services. No branches or HEAD checks.
  BEFORE deploying the new API/Worker, execute this included migration in SSMS
  against the configured Product Catalogue System database:
    src/ProductCatalogueAPI/Data/Migrations/009_AddEncSnapshotAttempt.sql
  It adds nullable last_snapshot_attempt_utc to dbo.EncPackageReplay, without
  adding a table or modifying S-128 geodatabase/Hangfire objects. It is rerunnable.
  If using the earlier standalone fresh-database creation script, apply 009 after
  that script as well. The included 000_Create-All-Tables20261029.sql is updated
  for fresh databases; do NOT rerun 000 against an existing installation.
  No automatic startup migration or database write by BAT.
  Build and restart all API/Worker processes using the same Hangfire database.

Behavior
  Each failed shared source build retains its oldest cumulative replay baseline
  and the exact UTC archive cutoff of that attempt. The cutoff is saved only
  after both error histories have been recorded. It is independent of the later
  failure/finish time and of an older valid package's DetectedAtUtc timestamp.
  The saved snapshot identity/timestamp is never changed to label an unbuilt one.
  For a failure before any YAML/package exists, this durable per-source replay
  timestamp represents the failed package attempt; no placeholder YAML is made.

  Later DPC runs inspect changes since that source's last failed cutoff. With no
  matching net content or selection change, skip rebuilding and retain the error,
  original baseline and checkpoint. A new matching change re-enables just that
  source; other failed sources remain skipped. Dormant failures inspect only the
  post-attempt window rather than repeatedly composing the old cumulative replay.
  A net-zero replay or unrelated
  source edit is insufficient. Successful creation/inspection retires the replay
  row and its checkpoint together using the existing exact-cursor guard.
  Edits during a long failed build remain eligible because the checkpoint is the
  scan cutoff, never the finish time. Holds, delivery protections, cancellation,
  partial-revert baseline handling and independent versions are preserved.

  Old failures have no trustworthy saved archive cutoff. Their first eligible
  attempt after deployment establishes it; subsequent unchanged scans do not
  attempt another build. No timestamps are guessed from exception history.

Public errors
  Shared snapshot and unexpected compiler failures persist the generic message:
    An error occurred during the export.
  Full exceptions still go to the worker log. Product/AOI/status/history/dashboard
  projections also sanitize older persisted technical messages. Only trusted
  SEVENCS_VALIDATION_FAILED/SEVENCS_VALIDATION_UNAVAILABLE messages are passed
  through for export errors; matching a word such as SevenCs in arbitrary text
  is insufficient. Existing delivery/rejection workflow notices are preserved.
  Validation artifacts, history records, error codes, critical-only SevenCs
  failure policy and S-128 acceptance/publication behavior are unchanged.

Tests
  Added/updated full RunAsync cases: first-of-four failures, all four fail then
  remain skipped across new coordinator instances, only one edited source retries,
  failed replacement preserves the old pair/baseline, edits during a failed build,
  holds/release, incomplete inspection, and full revert after an initial failure.
  Added migration-backed SQL tests for monotonic attempt/baseline persistence,
  compare-delete retirement, and rollback of insert/baseline update if saving
  the attempt fails. API error tests cover old exception details, replacement
  errors, untrusted SevenCs-like text, real SevenCs summaries and history/AOI DTOs.

  dotnet test tests/TestProductManager/TestProductManager.csproj -c Debug -p:Platform=x64 --filter "FullyQualifiedName~DpcRunAsyncTests|FullyQualifiedName~DpcSqlTransactionTests|FullyQualifiedName~PublicExportErrorTests|FullyQualifiedName~EncPackageStatusTests|FullyQualifiedName~ElectronicProductsAoiProfilingTests|FullyQualifiedName~ProductHistoryControllerTests|FullyQualifiedName~ExportOperationServiceTests"
  SQL tests require the existing opt-in disposable SQL Server connection variable.
  No .NET tests compiled or ran here: dotnet is unavailable. Windows, ArcGIS,
  SQL Server and external compilers are not available. Static/diff/package checks
  and an outside-checkout extraction/staging smoke check are separate validation;
  the BAT is not executed on Windows here.

Delivery ZIP entries contain only changed repository files. ZIP comment contains
optional review patch/hash metadata; BAT uses only its explicit staging list.
Commit: Gate failed DPC retries on new source changes and sanitize export errors
