# B1-lite v2 — Recording ADO Parameter Name Correction

## Controlled inputs

- Repository: `S100Services`.
- Authoritative baseline commit: `8dc21364e06ba1718b9ec99efb0505bcd0e12cc3`.
- Baseline archive SHA-256: `2D47E4A949EFDEE9473C86E6E422E79DCAFB176D27AD5919CB6BD99E76ED09A4`.
- Controlled B1-lite v1 candidate SHA-256: `92A2AFA7E5E72FF87187258FBA91C282476C3B946200396AB9CDB04D39F48184`.
- Source for v2: the verified full v1 replacement/new-file ZIP, not reconstructed repository files.
- No commit created; no frontend or additional dependency changes.

## Local feedback and cause

The user reported a successful `dotnet build src/ProductCatalogueAPI/ProductCatalogueAPI.csproj` (44 warnings) and a focused `dotnet test` execution with 30 tests: 26 passed and four failed. All four failures occurred in the newly added `EncPackageControlRepositoryTests` recording ADO connection, with an `IndexOutOfRangeException` retrieving the fake collection entry named `@PackageId`.

The test's `SqlParameterCollection` receives parameter names without the SQL placeholder prefix from Dapper (`PackageId`, not `@PackageId`). SQL text correctly retains `@PackageId`; the error is the test double's provider parameter lookup, not evidence of a broken repository query.

## Focused v2 correction

In `tests/TestProductManager/EncPackageControlRepositoryTests.cs`, use the unprefixed ADO names for all seven recorded parameter lookups:

- `PackageId` (two locations)
- `ExpectedVersion`
- `SourceDatasetName`
- `IsPaused`
- `PausedAtUtc`
- `UpdatedAtUtc`

Add one English comment explaining the distinction between SQL placeholders and ADO parameter names.

Preserve all existing assertions, fake state transitions, concurrency/version tests, and test names. This is a test-only correction. Production repository/model/DI behavior, SQL migrations, detector, export, IC-ENC, controllers, frontend and v1 documentation remain byte-identical to v1.

## Complete file inventory

Relative to controlled v1:

- **Changed (1)**: `tests/TestProductManager/EncPackageControlRepositoryTests.cs`
- **New (1)**: `src/ProductCatalogueAPI/docs/enc-package-B1-lite-v2-correction-report.md`
- **Deleted (0)**: none.

The v2 ZIP contains complete replacement/new files relative to the original baseline: the ten v1 files, with only the test adjusted, plus this new correction report. Its original-baseline inventory is one modified existing file, ten new files and no deletions.

## Verification and limitations

- The supplied v1 candidate SHA-256 matched the expected controlled input.
- The authoritative baseline archive SHA-256 matched the recorded value.
- Both input ZIP files passed CRC/integrity inspection.
- Source diff verification and all seven ADO parameter lookups were checked after the change.
- An inventory/byte comparison confirms that all other v1 files are unchanged.
- **No .NET restore/build/xUnit tests or SQL Server tests were run in this container.** `dotnet` is unavailable. The user's v1 results are reported separately from verification performed here.
- No database migration is changed; an already executed v1 migration does not need to be re-applied for this test fix. SQL deployment still requires the separate database-owner verification described in the v1 report.

## Local verification

After applying v2 to the same authoritative baseline (or replacing just the corrected test and adding this report on top of v1), run from the repository root:

```powershell
dotnet build .\src\ProductCatalogueAPI\ProductCatalogueAPI.csproj

dotnet test .\tests\TestProductManager\TestProductManager.csproj --filter "FullyQualifiedName~EncPackageControlRepositoryTests|FullyQualifiedName~EncPackageDetectionEligibilityTests|FullyQualifiedName~EncPackageStatusTests|FullyQualifiedName~EncPackageAcknowledgementTests"
```

Expected test-double result: the four prior `@PackageId` lookup exceptions should no longer occur. Do not claim all tests pass without the actual rerun. Then perform normal broader backend verification and the already documented test-System-database migration/transaction checks when appropriate.

## Commit suggestion after acceptance

`test(product-catalogue-api): correct ENC package pause repository test parameters`
