# ENC detection: verified source-feature membership

## Scope and baseline

This correction is based on `9455f43d60f5a14528a6d530e2caec446c51e42d` and addresses the source-feature verification performed before an automatic ENC package is created. It does not change topology generation, `TopologyFeatureMapping.Resolve`, archive windowing, product mapping, package refresh, export engines, or Send/Accept behavior.

## What was wrong

`ProductManagerGDB.CreateDatasetAsync` previously relied on selected, exported, and collapsed source GUID collections when completing a verified snapshot. The active feature-processing path built YAML features using `TopologyFeatureMapping.Resolve` but never populated those collections. Their former population lived inside a commented-out legacy feature loop. As a result, an existing changed feature could be logged as outside the topology selection even if the active path emitted it into YAML.

The commented-out legacy implementation remains untouched; it may have been replaced intentionally.

## Active verification contract

Only calls with `requiredFeatureIds` enable `VerifiedSourceFeatureTracker`. Normal manual export does not acquire new membership bookkeeping or extra feature-ID reads.

1. A current source feature returned by the actual selected feature cursor is marked selected only if its canonical `GLOBALID` is among the required changed source GUIDs.
2. A topology-collapsed selected feature is marked collapsed, not exported. The existing intentional-collapse behavior is preserved.
3. A selected source feature is marked emitted only after the active path successfully adds the generated YAML feature and its geometry. A split source GUID can produce multiple YAML features; its inclusion is recorded once.
4. At completion, every selected required feature must have either been emitted or intentionally collapsed. A selected, unaccounted-for feature causes an exception before a verified snapshot is returned. This also covers missing topology mappings and feature types skipped during YAML construction.
5. Required features never selected by the product topology remain outside the selection and do not create a package on their own. Deleted or moved-out changes remain owned by the existing `EncPackageDetectionService` logic.

The DPC watermark is written only after `EncPackageDetectionService.RunAsync` finishes the product loop. An exception during verification therefore prevents the current scan from advancing the successful-run cursor; package-related work already completed for earlier products is not rolled back by this guard.

## Local verification

From the repository root:

```powershell
dotnet build .\src\ProductCatalogueAPI\ProductCatalogueAPI.csproj -c Debug
dotnet test .\tests\TestProductManager\TestProductManager.csproj -c Debug --filter "FullyQualifiedName~VerifiedSourceFeatureTrackerTests|FullyQualifiedName~TopologyFeatureMappingTests|FullyQualifiedName~EncPackageDetectionEligibilityTests|FullyQualifiedName~EncPackageStatusTests|FullyQualifiedName~EncPackageAcknowledgementTests|FullyQualifiedName~EncPackageControlRepositoryTests"
```

Run the broader backend suite if the normal development environment can access its required ArcGIS and SQL dependencies. No additional NuGet package or SQL migration is required by this correction.

## Manual acceptance in a non-production environment

1. Select one S-101 source feature **known to appear in an ENC product's generated topology/YAML**, with a unique valid S-101/S-57 mapping. Modify one legitimate attribute using the normal ArcGIS editing workflow and save the edit.
2. Confirm the worker detects the source GUID without reporting it as outside the verified product selection. Confirm a new source-scoped `dbo.EncPackage` row appears in the configured System database (`Connections:SystemConnection`). Verify the paired S-101/S-57 candidate/export results separately; SevenCs failure remains a valid candidate result.
3. Independently test a changed source feature that genuinely lies outside an ENC product topology. It must not trigger a package for that product.
4. If feasible, test a topology-collapsed feature and a selected feature lacking a usable topology mapping. A collapsed feature remains excluded; an unaccounted-for selected feature must fail closed without updating the DPC watermark.
5. Confirm manual export and existing package refresh/replay/hold behavior are unchanged.

Historical test edits from 12 October 2026 have already been consumed by successful DPC scans. Use a controlled **new edit** or an operator-reviewed targeted replay; do not broadly rewind `JobRunState`, truncate tables, or change the System database to force this test.

## Performance boundary

This change intentionally does **not** optimize full source snapshot generation. A separate measured performance task should profile DataCoverage/topology, geodatabase reads, feature conversion, associations, and YAML generation, especially for large overview products. Keep the established ArcGIS single-thread execution and worker isolation model.
