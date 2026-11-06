# ENC package recovery and lifecycle hardening

## Authority

- Repository baseline: `cb43f9746f25929742a9b4b5f824ba87559fe69f`
- This is a focused backend correction. No new tables, migrations, dependencies, Send/Accept, scheduling or frontend action contract
- The existing Product-track and ENC-package records remain separate authoritative owners

## Reproduced failure model

The manual `/export/{dataset}/newedition` path queues an `ExportOperationJob`. It calls `ExecuteExportAsync`, creates a single `ProductExportTrack` candidate and does not create an `EncPackage`. Successful S-101 compilation can therefore leave a `.000` file, while unavailable SevenCs validation records `SEVENCS_VALIDATION_UNAVAILABLE` and `ProductState.Error`. That result is not evidence of an active package.

The Main Map ENC AOI endpoint can display the Product's `Error` state even without an active `EncPackage` because its status resolver also reads independent Product tracks. The package actions endpoint deliberately requires a real active `EncPackage` and returns `404 PACKAGE_NOT_FOUND` when none exists. It must not synthesize a package from an AOI, a `.000` file or a single failed track.

With no new archive changes, DPC legitimately reports `ChangedAoiCount: 0`. When source edits do exist but a terminal Product candidate has no package owner, DPC retains the replay bound rather than adopting an unrelated manual candidate. An active package can still replace its pre-send failed members after **later verified source changes**; unchanged history never causes a retry of a failed package.

## Corrections

1. **Ownership:** The manual Product export and Product Discard paths reject a member owned by an active ENC package. The detector alone uses `ExecutePackageExportAsync` and the explicit internal scan-bound option when refreshing a package. The actual package-wide Discard remains the existing guarded Worker/SQL transaction.
2. **Orphan recovery:** A failed standalone Product candidate with a current candidate version, or an `Error` track whose build failed before candidate-version creation, can be discarded through the existing `/export/{dataset}/discard` job. This does not create, claim or delete an ENC package. The job's existing Product lock and source version check remain in place.
3. **Safety:** The standalone SQL Discard repeats final unsent-state checks in a serializable transaction and rejects any matching IC-ENC delivery reservation. The repository restores the Product's previous state, clears only candidate fields and records Cancelled/restored state history. Existing published versions and immutable revisions/artifacts are not deleted.
4. **Retry state:** A subsequent export after `Error` retains the original `candidate_previous_state` instead of overwriting it with `Error`. Older failed retries that already saved `Error`/`Rejected` as the previous state safely fall back to `Idle` when discarded, avoiding a self-perpetuating Error state.
5. **Filesystem:** Output cleanup is best effort *after* the SQL discard has committed. The Worker continues to own its Product lock during cleanup. A cleanup failure is logged rather than reported as a rolled-back SQL transaction; operations staff should review any remaining files. The exact previously captured candidate edition/update is used.
6. **Visibility:** Detection logs the unowned candidate reason when it defers package creation, without fabricating a package or advancing past deferred source edits.

## Explicit boundaries

- This does **not** turn an orphan Product candidate into an ENC package, or make the package action button available on an orphan. Manual standalone recovery remains separate from package-wide Discard.
- No automatic discard or retry is triggered by `SEVENCS_VALIDATION_UNAVAILABLE`. Missing `productcatalogue_7cs_credentials` still prevents S-101 validation. Neither source changes nor successful compiler output are proof of SevenCs success.
- A Product with a delivery reservation, externally `Rejected`/submitted state, in-progress export or invalid/partial candidate identity is not recoverable via this path. External rejection requires its separate acknowledgement workflow.
- Manually frozen standalone Product candidates retain their independent hold through the existing Product Discard behavior. This is different from the package-wide eligibility rules, which reject an active manual hold.
- Newer source edits while a package is locked retain the existing replay mechanism. No tombstone, replay rewind, or new generation owner is invented.
- The prior automatic pre-send package refresh/discard sequence is not made atomic in this correction; its full SQL/file-lock race behavior still requires integration verification.
- The HTTP Export endpoints retain their existing authorization model. Production auth and Send/Accept remain separate tasks.

## Read-only diagnosis for a specific dataset

Run `src/ProductCatalogueAPI/scripts/Inspect-EncPackageRecovery.sql` against the *Product Catalogue System database*. By default it reads the S-101 `101DK005RONNE`; set its optional mapped S-57 name from authoritative S-128 mapping before interpreting the second Product. Its SELECT queries inspect current package ownership, replay, Product tracks, latest state errors, freezes and delivery reservations. It does not change data or inspect S-128 itself.

If no package row exists, use the existing standalone `POST /export/101DK005RONNE/discard` only after checking the data, confirming the job is eligible and selecting an intentionally disposable development candidate. HTTP 202 queues the Worker job; it is not proof of completed Discard. Use job status/logs and read-only SQL to verify SQL state before retrying any failed job. Never bypass reservations or clear the Error directly with SQL.

## Verification

Local .NET verification is authoritative:

```powershell
 dotnet build .\src\ProductCatalogueAPI\ProductCatalogueAPI.csproj -c Debug
 dotnet test .\tests\TestProductManager\TestProductManager.csproj -c Debug --filter "FullyQualifiedName~ExportOperationServiceTests|FullyQualifiedName~ProductCandidateRecoveryTests|FullyQualifiedName~EncPackageDetectionEligibilityTests|FullyQualifiedName~EncPackageActionEligibilityTests|FullyQualifiedName~EncPackageControlRepositoryTests|FullyQualifiedName~ExportOperationJobTests"
 git diff --check
```

Then verify on a disposable development SQL database with a running Worker: failed S-101 candidate with `.000`, early failure with no candidate version, repeated failed retry, active package with both members, manually frozen Product, delivery reservation, stale version and new archive edits arriving between operations. Reopen the Main Map popup after each completed job and confirm current candidate/committed attributes. Do not run destructive checks against real active deliveries.
