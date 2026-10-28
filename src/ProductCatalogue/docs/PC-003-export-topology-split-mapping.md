# PC-003 Export Topology Split Mapping Correctness

Baseline: `fa0b1f6b5f48b5a4cf909ef2e178241407b38133`

## Purpose

Correct S-101 feature identity and topology geometry association when the topology builder splits one source curve feature into multiple generated curve candidates.

This package is limited to the ProductManagerCore YAML mapping boundary and focused tests. It does not change frontend behavior, API contracts, SQL, Hangfire, Product History, compiler execution, or other Product workflows.

## UID and mapper contract

The topology mapper direction is:

```text
generated curve UID -> source feature UID
```

Example:

```text
F100:0 -> F100
F100:1 -> F100
```

The mapper is a candidate/superset mapping. A generated UID is emitted only when `IMatrix.MappingFOID` contains a non-empty topology geometry mapping for that UID. A mapper entry alone does not guarantee that the corresponding generated curve survives the complete topology build.

The current topology builder produces generated mapper entries when curves are split. Surfaces and polygons normally retain their source UID and therefore normally have no generated mapper entry.

A source feature without generated entries is considered once with its source UID. A source curve with generated entries considers each generated UID in deterministic ordinal-ignore-case order, then filters out candidates without a usable `MappingFOID`.

## FOID contract

FOIDs are created in one place by `TopologyFeatureMapping.CreateFoid`:

```text
F100   -> 110:100:1
F100:0 -> 110:100:0
F100:1 -> 110:100:1
```

The default `:1` suffix is added only when the feature UID does not already contain a generated split suffix.

## Geometry mapping contract

`IMatrix.MappingFOID` is looked up with the UID considered for the emitted feature:

- generated UID for a split curve candidate;
- source UID for a non-split curve or surface.

Curves and surfaces are emitted only when that lookup returns a non-empty topology geometry reference. Missing, empty, or whitespace-only mappings are omitted. The resolver never falls back to an unproven curve/surface reference such as `F100:1`, and a missing candidate does not abort the entire export.

Example:

```text
Mapper:
F100:0 -> F100
F100:1 -> F100

MappingFOID:
F100:0 -> C200

Emitted feature:
F100:0 -> FOID 110:100:0 -> Geometry C200

Omitted candidate:
F100:1
```

This matches the established exporter behavior, which skips curve/surface candidates without `MappingFOID`.

Non-split point and point-set behavior is preserved. When no topology mapping exists, the source UID remains the temporary geometry reference for the established `Dataset.AddGeometry` reference-update flow.

The topology matrix remains responsible for creating curves and surfaces. No parallel topology engine is introduced.

## Surface and mask contract

A surface currently keeps its source UID. The realistic mapping is:

```text
Source UID:      F100
Generated UID:   none
Mapper:          no entry for F100
MappingFOID:     F100 -> S900
Surface.Ref:     F100
Emitted FOID:    110:100:1
Final surface:   S100
```

`SurfaceFeature.Ref` therefore normally matches the source UID. Surface masks are read from the `SurfaceFeature` whose `Ref` matches the UID used to emit that concrete surface feature.

The feature initially references the temporary surface value from `MappingFOID`. During `Dataset.AddTopology`, the YAML layer creates the final surface name from `SurfaceFeature.Ref` and rewrites the temporary `S{id}` feature reference:

```text
S900 -> S100
```

Mask formatting is unchanged:

```text
Masks1 item 300 -> C300:1
Masks2 item 400 -> C400:2
```

Every emitted feature geometry, surface exterior/interior curve, and mask curve must exist in the completed topology output. Missing surfaces or empty mask collections produce no `Masks` value.

## Runtime acceptance correction

A real New Edition debug run demonstrated this valid topology state:

- `topology.mapper` contained multiple generated UIDs for one source feature;
- at least one generated UID was absent from `MappingFOID`;
- the previous PC-003 guard aborted the export with `InvalidOperationException`.

The resolver now treats `mapper` as a candidate set and filters curve/surface candidates through `MappingFOID`. This preserves valid mapped split parts while omitting candidates that the topology matrix did not materialize.

## Test coverage

`TopologyFeatureMappingTests` covers:

- non-split mapped geometry and existing FOID behavior;
- non-split point fallback;
- multiple realistic generated curve UIDs (`F100:0`, `F100:1`);
- deterministic generated UID ordering;
- split and non-split FOID rules;
- generated-UID `MappingFOID` lookup;
- case-insensitive mapper and mapping lookup;
- omission of generated curves with missing, empty, or whitespace-only mappings;
- partial generated mappings where only the materialized split part is emitted;
- empty results where no generated curve candidates have topology mappings;
- omission of non-split curve/surface features without topology mappings;
- a separately named defensive generated-surface omission test;
- realistic non-split surface mapping through source UID;
- missing surfaces and missing masks;
- serialized split-curve YAML whose emitted geometry references exist in topology output;
- serialized partial split-curve YAML that excludes the unmapped generated UID;
- serialized non-split surface YAML where:
  - `MappingFOID` is found through source UID;
  - `Dataset.AddTopology` rewrites `S900` to `S100`;
  - the final surface exists;
  - the exterior curve exists;
  - every mask curve exists with a valid orientation suffix;
  - the feature geometry reference exists.

## Verification

Run from the repository root in Windows PowerShell:

```powershell
$env:Platform = $null

dotnet restore Nexus.slnx
dotnet build Nexus.slnx --configuration Debug

dotnet test tests/TestProductManager/TestProductManager.csproj `
    --configuration Debug `
    --property:Platform=x64 `
    --filter "FullyQualifiedName~TopologyFeatureMappingTests"

cd src/ProductCatalogue
npm run check
```

The full `TestProductManager` suite has existing environment-dependent tests that require SevenCs files, import fixtures, an API URL, and an encryption key. Record those separately from PC-003 targeted test results.

## Manual acceptance gate

Repeat the controlled New Edition export with the real split curve and verify:

1. source UID;
2. generated UID candidates from `topology.mapper`;
3. which generated UIDs have usable `MappingFOID` values;
4. exactly one emitted feature per generated UID with a usable mapping;
5. generated UIDs without mappings are omitted without aborting the export;
6. expected FOID for each emitted split part;
7. initial `MappingFOID` geometry association;
8. final geometry reference after `Dataset.AddTopology`;
9. every emitted geometry and mask reference exists in topology output;
10. no dangling geometry references in serialized YAML;
11. successful S-100 compilation;
12. successful normal validation;
13. unchanged non-split New Edition behavior;
14. correct edition, update, attachment, and terminal status values.

Output must not be distributed until this acceptance gate succeeds in the configured Windows, ArcGIS, and compiler environment.
