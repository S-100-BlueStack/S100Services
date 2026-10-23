# S-101 metadata coverage normalization

## Context

The persisted `101DK0020157C` YAML snapshot (2026-10-16) contains two `DataCoverage`, two `SoundingDatum`, and two `VerticalDatumOfData` surface features. The second footprint is wholly contained in the first for each class. Both features of a class carry equivalent metadata. All 1,053 Sounding entries are covered by both SoundingDatum features, which corresponds to 1,053 occurrences each of `SoundgPartCovSDat` and `SoundingNotCoveredBySoundingDatum` in SevenCs.

The source database also contains overlapping coverage polygons. This fix does not alter those rows or their ownership. The framework still performs the original selection, topology construction, feature mapping, and geometry assembly.

## Owner and boundary

`ProductManagerGDB.CreateDatasetAsync` keeps the three metadata feature classes pending while preserving their source tracking, associations, and geometry processing. It calls `EncMetadataCoverageNormalizer.Normalize` **after** `Dataset.AddTopology` and before the result is returned for YAML serialization. At that boundary the normalizer examines the actual per-ENC topology surfaces rather than guessing from source AOIs. Only retained pending metadata features are committed through the framework's public `Dataset.AddFeature` method.

`Dataset.Features` is derived from `SortedFeatures()` and is not a mutable backing collection. Removing items from that getter result does not remove the serialized features. The pre-commit approach prevents this failure mode and preserves the original framework-owned topology primitives.

The normalizer considers only surface features named `DataCoverage`, `SoundingDatum`, or `VerticalDatumOfData`, comparing each feature class independently. An output feature may be omitted only when:

- Its emitted polygon is completely covered by another polygon of the **same class**.
- Both features have nonempty, canonically equivalent **source `attributeBindings` JSON**, including datum and display-scale information, and equivalent masks. The decision never relies on serialization of a base feature type that might omit derived attributes.
- The feature does not carry outgoing information/feature associations and no surviving feature association points to its FOID.
- The feature is not the output of a required changed source feature in a verified DetectProductChanges snapshot.

The containing feature retains its original FOID and output topology reference, preserving the exact geographic union. For identical regions, the lowest ordinal FOID is retained. All non-metadata features, including every Sounding and its depth, are left intact.

A positive-area **partial overlap** cannot safely be repaired by dropping either feature. If all overlapping pairs have proven equivalent source attributes and masks, the normalizer **skips the entire normalization plan for that ENC**, commits all pending metadata features unchanged, and emits an explicit warning. The original compiler and SevenCs validation then remain authoritative; this fallback does not assert that the ENC is valid or reduce its pre-existing validation findings. The fallback is atomic: containment-based removals in other classes are not applied for that ENC.

Conflicting or unverifiable attributes or masks, invalid geometry or topology references, identity collisions, and unsafe association/source-membership suppressions still raise `InvalidDataException` before any metadata mutation. Every overlapping pair is checked for semantic conflicts before a partial-overlap fallback is allowed, so an early partial overlap cannot conceal a later conflict. Edge-sharing and disjoint features remain unchanged. This is deliberately a contained/equivalent-region correction, **not** a general-purpose partitioning or geometry union engine.

For example, the user-reported v5 runtime attempt on 2026-10-19 stopped `101DK002BORNH` during `TopologyAndAssociations` with `Partially overlapping 'DataCoverage' regions '110:4211375033:1' and '110:1480306587:1'`. With this correction, this case should produce a warning and use unchanged metadata for native validation instead of aborting the entire DPC job. **This behavior is not runtime verified.**

The normalizer suppresses redundant pending feature records before they are added to the dataset; it does not rewrite framework-owned topology primitives, which may be shared by other features, masks, and curves. This must be verified by a native compiler run because the SDK/compiler's treatment of unreferenced geometry is not certified by the offline tests.

## Preservation requirements

- Keep information- and feature-association fixes v1/v2, point geometry correction, archive detection, DPC membership, SevenCs waiting, S-57, and existing lifecycle behavior unchanged.
- Do not mutate the S-101 source geodatabase, discard source rows, or advance DPC watermarks on failed normalization.
- Never merge different metadata classes, datum codes, scale semantics, or masks.
- Do not de-duplicate Sounding features as part of metadata normalization.

## Local verification

From the repository root:

```powershell
dotnet build .\src\ProductCatalogueAPI\ProductCatalogueAPI.csproj

dotnet test .\tests\TestProductManager\TestProductManager.csproj --no-restore --filter "FullyQualifiedName~EncMetadataCoverageNormalizerTests|FullyQualifiedName~EncTopologyQueryFilterTests|FullyQualifiedName~EncPointGeometryReferenceTests|FullyQualifiedName~TopologyFeatureMappingTests|FullyQualifiedName~VerifiedSourceFeatureTrackerTests"

git diff --check
```

Then build through the local Visual Studio/Worker deployment flow, restart the Worker, and export **one** `101DK0020157C` candidate using an already supported workflow. The expected log message includes three removed metadata features: one each of DataCoverage, SoundingDatum, and VerticalDatumOfData. This is an expected result for the analyzed snapshot, not a guarantee for all cells.

Inspect the new `.vld` by rule. Specifically compare `SoundgPartCovSDat`, `SoundingNotCoveredBySoundingDatum`, `SoundingDatumOverlap`, `CoveragesOverlap`, `VerticalDatumOfDataOverlap`, the total error/critical counts, and any new orphan-topology findings. Verify the exported metadata count and Sounding coverage/identity. Do not treat a lower total alone as proof of a correct topology.

Latest user-reported baseline before this fix: `101DK0020157C` 3,796 Errors / 693 Critical / 983 Warnings after association v2. The 507 duplicated Sounding pairs remain a separate issue.

## Risks and limits

- The implementation is based on the controlled v2 `ProductManagerGDB.cs` preimage from the conversation, not a direct read of local HEAD. Verify its SHA-256 before replacement.
- Only fully contained, same-semantics metadata can be collapsed. Equivalent partial overlaps are left unchanged for compiler/SevenCs validation, with an explicit per-ENC warning; a true partitioning fix remains outstanding. Conflicting semantics and unsafe source-membership scenarios still fail closed.
- .NET / ArcGIS / native compiler / SevenCs verification cannot be performed in the supplied container. Runtime acceptance must be done on the local Windows workstation with licensed dependencies.
- The original sensitive dataset YAML contains signing metadata and must not be placed in source control or a general-purpose test fixture.

## Verified-export topology cleanup (v7 candidate)

When the normalizer suppresses a pending feature, its exact original `Geometry` surface reference is recorded in the `Result.SuppressedSurfaceNames` list. The verified Product snapshot carries these identities separately from the unchanged `YAML.Dataset`. The DPC serialization path invokes `EncMetadataSurfaceYamlCleanup.RemoveSuppressedSurfaces` on the framework-generated YAML **before** persisting a replacement package or advancing the DPC scan watermark. Neither the normalizer nor the cleanup method mutates `Dataset.Surfaces`, a collection whose public mutation semantics have not been established.

The cleanup accepts only explicit surface IDs from the successful normalization plan. It requires unique top-level `Surfaces` and `Features` sections and unambiguous surface list items; each removed surface must exist exactly once with its exterior defined, and **must have no remaining reference anywhere outside its own YAML record**, including other topology entities and retained features. Ambiguous or shared references raise `InvalidDataException`, before the new package is persisted. A partial-overlap fallback suppresses no surfaces and leaves the serialized YAML unchanged.

The cleanup preserves every other byte of serialized YAML, including the complete `Curves`, `CompositeCurves`, `Points`, `Depths`, information and surviving feature content. It does not attempt to remove orphan curve or point geometry, change `DataCoverage` boundaries, mask SevenCs diagnostics, or renumber topology identifiers. The historical `101DK0020157C` YAML demonstrates three uniquely unreferenced surfaces after feature normalization, but the actual generated v7 YAML and native compiled `.000` still require local verification.

**Scope:** This topology-record cleanup is currently applied to the **verified DPC shared snapshot** (`CreateVerifiedExportSnapshotAsync` → `EncPackageDetectionService`). Other workflows that independently invoke `YAML.Dataset.Serialize()` without the verified snapshot's suppression plan are unchanged. They must not be claimed as remediated by this v7 candidate. A future shared serialization owner should close that remaining boundary only after its callers and supported API are verified.

**SOTE boundary remains separate:** The historical report shows 15 disappeared `NotTruncatedDataLimit` warnings tied to curves 538–552 of the suppressed smaller `DataCoverage`, and 15 additional `SoteNoDataLimit` Critical findings. Surface-record cleanup does not alter these curves or the retained coverage boundary, so this candidate **does not claim to correct the SOTE delta**. Do not delete, remap or mask those curves without a topology/SOTE ownership analysis. SevenCs must be rerun to confirm `OrphanSurface` is zero and no existing result regresses; the 2,108 eliminated datum-related Errors must remain eliminated.

**Additional local checks:**

```powershell
dotnet test .\tests\TestProductManager\TestProductManager.csproj --no-restore --filter "FullyQualifiedName~EncMetadataSurfaceYamlCleanupTests|FullyQualifiedName~EncMetadataCoverageNormalizerTests|FullyQualifiedName~EncPackageInterruptedExportRecoveryTests"
node --test .\tests\EncMetadataTopology\enc-metadata-topology-contract.test.mjs
```

Do not commit v7 until a new `101DK0020157C.vld` validates the absence of the three `OrphanSurface` findings without losing Sounding content or reintroducing the former metadata Error groups. Record the remaining SOTE and other diagnostics separately.
