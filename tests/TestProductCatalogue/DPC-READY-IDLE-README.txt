Ready/Idle package correction — 2026-10-29

Reviewed source: attached clean main snapshot 5db3c3288a3029392ada1c23a88ffe9f827d3bc4.

Confirmed current paths:
1. The detector committed a package while both tracks were still Idle, then
   exported S101 and S57 sequentially. After S101 completed, S57 could still be
   Idle until its turn. This was possible in the current code, not just old code.
2. Interruption after the first export could persist that state. Legacy packages
   without replay markers and without new archive edits were not rediscovered.
3. ExecuteDiscardAsync still permitted a single active-package member to be
   discarded when preservePackageScanBound was true, despite DPC now having a
   paired discard transaction.

Changes:
- TryCreatePendingAsync commits the shared snapshot, both ChangesDetected states,
  their state history and restart replay in ONE serializable SQL transaction.
  ChangesDetected is the existing pending state. Actual export then transitions
  each member to Exporting, Validating, and ReadyForDistribution or Error.
- Queueing preserves each member's original previous state. A later paired
  discard still restores the original Idle/ChangesDetected state correctly.
- Every DPC run discovers active packages with missing, Idle, pending, Exporting
  or Validating members independently of new edits and replay markers.
- Eligible legacy missing/Idle members are queued and exported from the existing
  persisted YAML. The package ID, cumulative baseline and ready counterpart are
  retained. Missing SQL tracks use the corresponding published S128 versions.
- Existing holds, submissions, accepted deliveries and explicit discarded-member
  flags remain protected. An ineligible legacy partial package is deferred for
  operator reconciliation; the detector does not invent acceptance or undo a hold.
- The old per-member discard flag can no longer bypass whole-package discard.
- No new SQL migration, public route, enum, compiler setting or S128 write path.
  Deploy API and Worker together. Eligible older partial packages are considered
  on the next DPC run; another source edit is not required.

Regression coverage:
- Inspect both track states during both real export-service calls: the waiting
  member is ChangesDetected before the first compiler completes.
- Recover a Ready/Idle legacy package without replay or new edits, including a
  failed S57 rebuild becoming Error without altering the ready S101 candidate.
- Cancellation retains a pending counterpart, never an Idle member.
- Migration-backed SQL tests cover paired queue commit, second-member failure
  rollback of snapshot/states/history/replay, original-state restoration, legacy
  discovery and queueing, and hold/submitted/accepted protection.
- Existing per-member discard regression now checks that the legacy flag is refused.

Run on Windows x64 with .NET 10 and matching ArcGIS assemblies:
  dotnet restore Nexus.slnx
  dotnet build Nexus.slnx -c Debug -p:Platform=x64
  dotnet test tests/TestProductManager/TestProductManager.csproj -c Debug -p:Platform=x64 --filter "FullyQualifiedName~DpcRunAsyncTests|FullyQualifiedName~DpcSqlTransactionTests|FullyQualifiedName~ExportOperationServiceTests"

SQL tests use the existing PRODUCTCATALOGUE_DPC_SQL_TEST_CONNECTION opt-in and
create/drop only unique disposable test databases from the included migrations.
Do not configure that opt-in against a production/shared database server without
explicit target authorization.

Delivery checks: source hashes, diff whitespace, lexical delimiter/XML checks,
ZIP hashes, identical extraction/staging lists and an outside-checkout Linux
extraction/staging smoke check. These do not replace C# compilation or SQL tests.
The filtered dotnet test command was attempted but stopped: dotnet not found.
Windows BAT, ArcGIS, SQL Server and compiler execution were unavailable.

The ZIP entries contain only changed repository files. Its comment contains the
review manifest and gzip/base64 Git binary patch; the BAT uses neither. It verifies
only the target working-tree root, extracts and stages the explicit changed list,
never creates/switches branches and does not validate HEAD/revisions.

Commit: Queue ENC members atomically and recover legacy partial packages
