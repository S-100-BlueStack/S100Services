DPC source failure isolation - 2026-10-29
Reviewed snapshot: f445e1081d0a4dbf554d2ca2b19fe3493c185273; all 880 hashes verified.

The log identifies four affected products, then the first shared YAML snapshot
fails in topology generation and previously aborted the entire invocation.

Snapshot creation, YAML serialization and metadata cleanup now form a per-source
failure boundary. Persist the source replay lower bound before advancing the
successful archive watermark; record ENC_SOURCE_SNAPSHOT_FAILED in both member
state histories. A fresh source gets two Error tracks with no invented candidate
versions or placeholder YAML. For a failed replacement, preserve the existing
pair, versions, artifacts and workflow states; set its package error and append
failure diagnostics to history. Continue with the remaining sources.

The global archive watermark can advance after all sources are handled. Failed
sources remain in durable replay, so later runs retry them without rebuilding
already completed sources or losing edits. There is no retry cooldown in this
change. Only ENC_SOURCE_SNAPSHOT_FAILED errors without a candidate version may
retry automatically; acknowledge those tracks only after a new snapshot succeeds.
Ordinary standalone errors and candidates cannot be adopted by this retry path. Holds, protected deliveries and cancellation remain enforced. Incomplete
archive scans and persistence failures still abort: they cannot safely be treated
as successful inspections. No migration, auth, compiler or S128 publication change.
The empty DataCoverage/topology query itself is not fixed by this change.

Four new full RunAsync regression cases: first of four sources fails (snapshot
exception or serialization failure), other three complete, repeated failure does
not recreate them, and later recovery consumes replay; replacement failure keeps
its prior pair/baseline; snapshot cancellation preserves the global watermark.
Existing archive-scan failure and compiler-error tests remain in the same suite.

Run on Windows with the existing SDK/ArcGIS prerequisites:
  dotnet test tests/TestProductManager/TestProductManager.csproj -c Debug -p:Platform=x64 --filter "FullyQualifiedName~DpcRunAsyncTests"
Execution here: dotnet is unavailable; no .NET tests compiled or ran. Static and
change-only ZIP extraction/staging checks run separately. BAT not run on Windows.

Keep matching ProductCatalogue-SourceFailureIsolation-20261029-01.bat and ZIP
together. BAT targets C:\source\S-100-BlueStack\S100Services, verifies root and
project markers, extracts/stages explicit files and prints status/count. No branch
or HEAD checks. ZIP comment holds optional review patch/hash manifest; BAT uses
only explicit files. Build/deploy API and Worker together.

Commit: Isolate DPC source snapshot failures and continue remaining products
