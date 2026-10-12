# ENC S-101 compiler output paths

## Scope

This documents the verified S-101 filesystem layout for automatic and manual candidate export. It applies to ENC Detection Correctness v3 on baseline `9455f43d60f5a14528a6d530e2caec446c51e42d` with v2 as the controlled preceding candidate. It does not change S-57 mapping, compiler behavior, topology selection, change detection, database schema, package lifecycle, or Send/Accept.

## Observed compiler layout

The 12 October 2026 local Worker run for `101DK001OSTSO` (edition 1, update 000) produced a non-empty S-101 file, signature, and compiler index directly under the edition directory:

```text
<output-root>/101DK001OSTSO/1/
  temp_101DK001OSTSO.yaml
  1OSTSO_000.idx
  S100_ROOT/
    CATALOG.SIGN
    S-101/
      DATASET_FILES/
        101DK001OSTSO.000
```

The previous exporter expected an additional `101DK001OSTSO/` child beneath the edition directory. As a result, it reported the valid dataset as missing and then failed when attempting to read `CATALOG.SIGN` from the wrong path.

## Corrected contract

- `ExportOutputPath.GetCandidateDirectory(...)` remains `<output-root>/<dataset-name>/<edition>` for S-101, without specification or update folders.
- `ExportOutputPath.GetS101DatasetFilesDirectory(...)` now points to `<edition>/S100_ROOT/S-101/DATASET_FILES`, matching the observed compiler output and the pre-existing path test expectation. The SevenCs validation service uses this shared helper.
- `IsoIec8211ExportEngine` verifies that the expected `.000` or `.NNN` file exists and is non-empty before collecting artifacts. Missing or empty output fails closed with a specific error rather than an unrelated missing-signature exception.
- The compiler index and `CATALOG.SIGN` remain separate SQL artifacts. The ZIP exchange set contains `S100_ROOT/` with its files, without staging YAML, `prev.idx`, or the compiler index. The successful export removes index staging files after creating the artifact bytes.
- Update cleanup and discard now target only the intended `.NNN` file in the real dataset-files directory; new-edition discard still deletes the edition root.
- Existing S-57 output layout, mapping, and compiler failure contracts remain unchanged. The current locally installed `s57compiler.exe` expired on 30 September 2026; S-57 acceptance is deliberately deferred, and failures must remain visible as errors.

## Local verification

From the repository root:

```powershell
dotnet build .\src\ProductCatalogueAPI\ProductCatalogueAPI.csproj -c Debug

dotnet test .\tests\TestProductManager\TestProductManager.csproj -c Debug --filter "FullyQualifiedName~S101ExchangeSetOutputTests|FullyQualifiedName~ExportOutputPathTests|FullyQualifiedName~S100CompilerConfigurationTests|FullyQualifiedName~VerifiedSourceFeatureTrackerTests|FullyQualifiedName~TopologyFeatureMappingTests|FullyQualifiedName~EncPackageDetectionEligibilityTests|FullyQualifiedName~EncPackageStatusTests|FullyQualifiedName~EncPackageAcknowledgementTests|FullyQualifiedName~EncPackageControlRepositoryTests"
```

Run the broader backend suite when local ArcGIS and SQL prerequisites are available.

For the manual integration check, relaunch the local Worker with the replacement binaries, use an authorized new change in a known included S-101 feature or a targeted, operator-reviewed replay, then verify a non-empty `.000`/`.NNN`, correct `S100_ROOT` ZIP archive, compiler index and signature artifacts, and successful progression to SevenCs. SevenCs validation findings may still cause a candidate to enter `Error`; that must be distinguished from missing compiler output. Do not reset the shared watermark or discard the failed package solely to force the check. A paired S-57 failure due to its expired license is expected until the tool is renewed.
