# Interrupted ENC export recovery

## Authority and scope

- Repository: `S100Services`, reported branch `experiment/enc-package-workflow`
- Baseline: `0cab4e4f08a88717c25794a85fb691e8d64a7fbd` plus controlled S-101 metadata v6 candidate
- Only the DPC lifecycle of an **already active** ENC package is in scope
- No new database objects, schema migrations, dependencies, manual Export changes, automatic file deletion, or S-101 metadata changes

## Failure model

An interrupted Worker may leave a package-owned member in `ProductState.Exporting` or `ProductState.Validating`. The export path normally marks a failed candidate `Error`, but a second failure writing the System database can leave the member in-progress after its Worker has ended. DPC refuses to refresh such members through `IsRefreshBlocked()`. Calling its existing `RecoverIncompletePackageAsync()` after `CanRefreshAsync()` cannot reach them.

The 2026-10-19 runtime log for `101DK0020157C` entered SevenCs, lost the HTTP connection, and then failed to persist `Error` because the System connection file was inaccessible. The 2026-10-23 lookup showed the S-101 candidate at `Validating` (state `10`), with the original validation timestamp and no new diagnostics. DPC subsequently deferred this package even when source edits were detected.

## Recovery contract

`EncPackageDetectionService` owns the global `ENC-DPC-GLOBAL` lock throughout its scan. For recovery it additionally obtains **both** mapped, exclusive S-101 and S-57 Product locks, the same local file locks used by Product jobs and the package export path. A live exporter holding either lock prevents recovery. The Worker must be deployed as a single instance per shared lock directory. This mechanism is **not sufficient** to establish process exclusion across machines with independent lock directories; multi-host operation requires a distributed lock/lease before enabling automatic recovery.

The recovery helper:

1. Re-reads the exact active package by GUID and verifies member identities and discard flags.
2. Reads both Product tracks. Any manual hold, externally submitted/published/rejected member or unknown/missing in-progress candidate identity blocks recovery of the package.
3. For each `Exporting`/`Validating` member with a candidate edition/update, calls a new **single-transaction** repository operation. That transaction changes only the still-matching member to `Error`, writes `ENC_EXPORT_INTERRUPTED` history, and records the active package error.
4. The SQL mutation is conditioned on the package GUID and member, the track GUID and state, candidate edition/update, and exact last-update timestamp. It rejects holds and IC-ENC delivery reservations. A mismatch returns `false`, causing the DPC scan to stop without advancing its watermark.
5. Candidate edition/update, revision YAML, artifacts, output files, other member states, manual holds and `EncPackageReplay` remain untouched.

Recovery occurs **before replay eligibility is evaluated** and again on a newly detected package edit under the main Product locks. This allows a retained replay to become eligible after a crash even if the global DPC watermark has already moved beyond that edit. No old candidate is re-exported merely because recovery occurred: the existing `HasNewEdits()` verification and DPC refresh/discard flow still control replacement. Recovery does not bypass package approval, ownership, or delivery checks.

## Runtime procedure

1. Stop any old Worker and verify the intended new Worker is the sole exporter on that lock directory. Ensure the System DB connection and SevenCs network access are restored.
2. Apply the complete candidate only over the corresponding authoritative source versions, build and run focused tests, rebuild the Visual Studio Worker, then restart with the new copied runtime.
3. Confirm `Interrupted ENC package export recovered as Error` for `101DK0020157C` if its state is still `Validating`. Inspect the package GUID and original track GUID, candidate edition/update, and history error code.
4. Confirm `ENC replay archive scan started`, verified changed features, and only then the normal package refresh. If no newer archive edit is found, the failed candidate remains for explicit acknowledgement instead of being retried.
5. Confirm S-101 metadata normalization removes the three redundant regions; obtain a new `.vld` or SevenCs result before accepting the topology correction. If SevenCs fails, the Product should reach `Error` rather than remain `Validating`.

Do not edit the Product track state directly in SQL. Do not set a synthetic replay cursor or introduce a timeout for SevenCs. If locks are busy, the package is held, a workflow row has changed or the SQL condition fails, investigate the actual active operation rather than forcing the state.

## Local verification

```powershell
dotnet build .\src\ProductCatalogueAPI\ProductCatalogueAPI.csproj
$filter = 'FullyQualifiedName~EncPackageInterruptedExportRecoveryTests|FullyQualifiedName~EncPackageDetectionEligibilityTests|FullyQualifiedName~ExportOperationServiceTests|FullyQualifiedName~EncMetadataCoverageNormalizerTests|FullyQualifiedName~DatasetLockServiceTests'
dotnet test .\tests\TestProductManager\TestProductManager.csproj --no-restore --filter $filter
git diff --check
```

The new SQL conditional update and file-lock exclusion still require an authoritative Windows/SQL Server integration test. Static checks or in-memory tests alone do not establish production concurrency safety.
