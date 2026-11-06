DPC workflow regressions (2026-10-29)

Source reviewed
  Clean main context snapshot 303b4ab56bf9d36541883def15eebc52077c6ace,
  captured 2026-10-29 09:00:59 UTC. All 867 source hashes matched its manifest.
  Remote GitHub access was unavailable; this delivery does not assert that
  remote main is still at that revision.

Changes
  - Keep acknowledgement diagnostics in ProductStateHistory. Do not add error
    columns to ProductExportTrack. Existing migrations remain unchanged.
  - Compose each replay from its exact lower bound and fixed invocation cutoff.
  - Compare relevant changes since the current snapshot separately from the
    cumulative package baseline. Partial reverts can replace stale candidates
    even when all surviving summary timestamps are older.
  - Carry nominal scale across archive endpoints. Verify current selection and
    use persisted emitted FOIDs for features leaving selection; broad AOI
    intersections alone cannot establish removal membership. When no active
    candidate exists, removals use the published S101 YAML attachment.
  - Inspect both members and exact delivery outcomes before any paired discard.
    Confirmed NotDelivered is recoverable. Rejected is recoverable only for the
    exact rejected revision while its track is Rejected. Sending, Delivered,
    Uncertain and Accepted remain protected. Delivery/revision/artifact evidence
    is preserved, including previous revisions with the same edition/update.
  - Automatic discard retains the original scan bound in the same SQL commit;
    output cleanup occurs afterwards. A crash before replacement creation can
    rebuild from that durable bound. Operator discard retains its existing
    policy of refusing pending replay.
  - Preflight every required archive class and fail incomplete scans clearly.
  - Retire eligible empty replay only after the invocation succeeds. Retain
    blocked replay. Cleanup compares the exact inspected cursor, preserving an
    older cursor queued during inspection. Retain replay for interrupted builds and finish missing
    members from the persisted snapshot without retrying a failed member just
    because an old archive row was replayed.

Architecture and preserved contracts
  The coordinator calls the read-only source snapshot builder, persists one
  shared YAML snapshot, then calls the existing export service for S101 and S57.
  Each track retains its own SQL-authoritative edition/update. Candidate export
  does not publish S128. Finalization still writes idempotent S128 publication
  first and completes SQL afterwards, after both latest exact deliveries have
  been accepted. SQL failure leaves the accepted package recoverable.
  No HTTP routes, Windows SSO policies, operator-key gates, compiler settings,
  or critical-only SevenCs validation rules were changed. No new NuGet packages
  or production schema migrations are required. Deploy API and Worker together.

Tests and execution
  DpcRunAsyncTests.cs runs the actual coordinator and ExportOperationService
  with deterministic archive versions, a fixed clock and boundary doubles.
  Archive fixtures use the production ArchiveScanWindow/ArchiveChangeComposer.
  DpcSqlTransactionTests.cs executes real repositories on fresh databases built
  from ALL supplied Data/Migrations/*.sql files. It includes real transaction
  rollback failures, exact delivery outcomes, acknowledgement/rejection,
  independent versions, finalization and S128-success/SQL-failure recovery.
  A migration-backed complete coordinator run also finalizes acceptance, commits
  its SQL watermark and clears the resulting empty replay cursor.
  S128 is a fake idempotent boundary in the SQL recovery test. Live ArcGIS edits,
  locking and compiler output require separate environment verification.

  These new files reside in tests/TestProductCatalogue and are linked into the
  existing tests/TestProductManager/TestProductManager.csproj. The supplied
  snapshot has no TestProductCatalogue.csproj; no second test project is added.

  On Windows x64 with .NET 10 and matching ArcGIS assemblies:
    dotnet restore Nexus.slnx
    dotnet build Nexus.slnx -c Debug -p:Platform=x64
    dotnet test tests/TestProductManager/TestProductManager.csproj -c Debug -p:Platform=x64 --filter "FullyQualifiedName~DpcRunAsyncTests|FullyQualifiedName~DpcSqlTransactionTests|FullyQualifiedName~ProductCandidateRecoveryTests"

  SQL tests are explicitly skipped unless PRODUCTCATALOGUE_DPC_SQL_TEST_CONNECTION
  is set to an authorized DISPOSABLE TEST SQL Server connection whose Initial
  Catalog is master. The login needs permission to create/drop test databases.
  Tests never migrate or clear the connection's existing database. They create
  and drop only their unique ProductCatalogue_DpcTests_<GUID> database. Supply
  credentials through the environment, never through committed source.

  Then run the full existing test project when its integration prerequisites
  are available; it also contains environment-dependent utility tests.

Verification in the delivery environment
  Restore, build and filtered test commands were attempted. All stopped with
  exit 127: dotnet: command not found. No .NET or SQL tests ran. Windows, ArcGIS,
  SQL Server and external compiler execution were unavailable. The BAT was not
  executed on Windows; archive/staging lists and extraction were checked using
  an isolated disposable checkout outside the source directory.

Delivery format
  ZIP file entries are only the changed repository files. Its archive comment
  contains the hash manifest and a gzip/base64 Git binary patch for optional
  review. The BAT uses neither: it extracts and stages an explicit file list,
  verifies the Git working-tree root, and never checks revisions or branches.

Open S57 metadata verification
  IsoIec8211ExportEngine.ExportS57Async writes the shared S101 YAML, invokes
  s100mapper with pipeline-S101-S57.yaml, then invokes s57compiler. The target
  request carries S57's independent SQL edition, but the mapper invocation does
  not supply a separate edition override. Whether encoded edition matches SQL
  depends on the actual pipeline. Its source is explicitly excluded from this
  context. Do not infer a defect or change compiler input without inspecting it.
  Required: artifacts/Product Files/pipeline-S101-S57.yaml and the dataset/header
  mapping rules it includes. A real mismatched-edition compiler run remains to
  be verified after those files are supplied.

Suggested commit
  Fix DPC replay composition, candidate replacement and acceptance transactions
