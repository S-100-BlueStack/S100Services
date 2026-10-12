# B1-lite — ENC Package Pause Persistence Foundation (candidate v1)

## Controlled source

- Repository: S100Services.
- Authoritative baseline: `8dc21364e06ba1718b9ec99efb0505bcd0e12cc3`.
- Baseline archive SHA-256: `2D47E4A949EFDEE9473C86E6E422E79DCAFB176D27AD5919CB6BD99E76ED09A4`.
- Baseline context SHA-256: `9EAF7C5372C3B05FFF60CA570A36960F10DCA6550C3488111C90340E2D26476B`.
- Both hashes, ZIP CRC, and all 165 context-to-archive file contents were verified.
- No previous B1-lite implementation candidate. The unapproved four-table B1-R design is background only, not source input or adopted schema.
- No network, GitHub, working-tree or HEAD files used. No commit created.

## Outcome

This is a dormant B1 persistence foundation, not a new working package action.

The current `EncPackage` snapshot, detector, Product tracks/revisions, `EncPackageReplay`, S-101/S-57 mapping, SevenCs/export, IC-ENC transport and finalization remain byte-identical to the authoritative baseline. No new public route or frontend behavior is introduced.

The candidate adds one source-scoped SQL table `EncPackageControl` and a narrow internal Dapper repository. Unlike the replaceable `EncPackage` snapshot, Pause storage survives when a new pre-send candidate is created with a new package GUID. The existing snapshot GUID remains the current candidate identity; no independent work/run ledger or new workflow status is introduced. Pause is not a Product Hold and cannot stop internal processing.

A conditional repository write requires the exact current package GUID, an expected control rowversion, a UTC timestamp, and a serializable transaction. It is not an authorized package action, performs no delivery eligibility checks and is not called by existing runtime flows. No existing Send path consults it yet; future B3 dispatch must enforce Pause before any Pause control is enabled.

No planned send timestamp, manual submitted marker, Send, Accept, simulation, scheduling, external-result processing or changed publication logic is included.

## Files

One existing file changed:

- `src/ProductCatalogueAPI/BackendRegistrations.cs` — register the new internal repository.

New files:

- `src/ProductCatalogueAPI/Data/Migrations/008_AddEncPackageControl.sql`
- `src/ProductCatalogueAPI/Data/Migrations/008_VerifyEncPackageControl.sql`
- `src/ProductCatalogueAPI/Data/Migrations/README.md`
- `src/ProductCatalogueAPI/Data/Models/EncPackageControl.cs`
- `src/ProductCatalogueAPI/Data/Repositories/IEncPackageControlRepository.cs`
- `src/ProductCatalogueAPI/Data/Repositories/EncPackageControlRepository.cs`
- `src/ProductCatalogueAPI/docs/enc-package-B1-lite-foundation.md`
- `src/ProductCatalogueAPI/docs/enc-package-B1-lite-implementation-report.md`
- `tests/TestProductManager/EncPackageControlRepositoryTests.cs`

Deleted files: none.

## Verification performed here

- The baseline ZIP SHA-256 and context SHA-256 match the manifest.
- Baseline ZIP CRC passes.
- All 165 complete-file context blocks equal archived files.
- File inventory and static source-scope/SQL-string contract checks pass.
- No legacy detector, export, controller, Product persistence or frontend production file differs from baseline.
- .NET SDK, Windows ArcGIS runtime and SQL Server are unavailable in this container. **No C# compilation, xUnit execution, SQL migration execution, SQL concurrency test, API or browser smoke test was performed.**
- No npm, NuGet or frontend dependency was added.

## Local checks

From the repository root after overlaying the complete ZIP files:

```powershell
dotnet build .\src\ProductCatalogueAPI\ProductCatalogueAPI.csproj
dotnet test .\tests\TestProductManager\TestProductManager.csproj --filter "FullyQualifiedName~EncPackageControlRepositoryTests|FullyQualifiedName~EncPackageDetectionEligibilityTests|FullyQualifiedName~EncPackageStatusTests|FullyQualifiedName~EncPackageAcknowledgementTests"
```

Run the full backend test suite according to normal local acceptance requirements. Report actual results; no results are assumed here.

### Database-owner verification (test System database only)

1. Verify the correct System connection/database, prerequisites from migration 004, permissions and backup/reset plan.
2. Execute `Data/Migrations/008_AddEncPackageControl.sql` against the test System database.
3. Execute `Data/Migrations/008_VerifyEncPackageControl.sql` against the same database; expect the success PRINT, not an exception.
4. Run migration 008 a second time and rerun verification to establish idempotence.
5. In a disposable test database, exercise overlapping Pause/Resume conditional writes, a deleted/replaced snapshot and a stale expected rowversion through repository integration. The recording ADO tests do not establish SQL locking correctness.
6. Confirm original EncPackage/Replay, Product/revision/delivery/history counts and identities are unchanged by the migration. No historical backfill or data reset is performed by it.

### Manual regression and browser checks

1. Start the app with the baseline-compatible API and Worker. Trigger S-101 source edits and verify one ENC package with S-101 and mapped S-57 candidates still appears.
2. Trigger a SevenCs failure in one member before any actual external send. Make a newer valid source edit. Confirm the existing detector can replace the candidate, keeping independent Product state/diagnostics, without a second map package.
3. Confirm no additional package API mutation, Send/Accept/mark-submitted request or new background job appears in the Network/log output.
4. Confirm F7A package controls remain disabled, even though the repository and new table exist. Do not interpret the new persisted policy as an operational Send blocker yet.
5. Check the existing Product and package popup, History/Analyze/Review/Collection workflows and light/dark display are unaffected. Their code is unchanged by this B1 slice.

## Remaining decisions/limitations

- This is only B1 persistence. No real Pause/Resume/Discard action is available yet.
- Existing legacy Product-level Send remains outside the new control's enforcement. B3 must coordinate/enforce all actual delivery paths before enabling Pause.
- The current snapshot GUID is not a durable historical run ID; B2 must guard stale candidate results and recheck current membership at asynchronous write boundaries. B1 does not claim to solve this.
- Pause survives candidate replacement because it is source-scoped. Whether it should clear after a complete/discarded package is still a later product decision. There is no silent automatic reset.
- Source renames or new source identity namespaces are not part of the current ENC contract. A future identity migration must explicitly address existing policies.
- Exact SQL constraints/concurrency and runtime behavior must be verified locally. The colleague's uncommitted backend state is not available; compare target working-tree files before applying this candidate and resolve any overlaps explicitly.

## Suggested commit after acceptance

`feat(product-catalogue-api): add ENC package pause persistence foundation`
