# ENC detection performance profiling

## Baseline and purpose

Baseline: `dfbc4cea14e859ec534a3c4eec057a86d6fc81a7`.

This is a measurement-only diagnostic for the existing ENC detection and source snapshot pipeline. It does not change the product topology selection, verified source membership, replay cursor, package refresh, export engines, validation or publication semantics. It does not add dependencies, tables, background jobs or network calls.

The initial investigation recorded a detection run taking roughly 20 minutes 40 seconds for 14 affected AOIs, including about 15 minutes 56 seconds for four Greenland overview AOIs. Aggregate elapsed times cannot distinguish expensive topology construction from geodatabase queries, feature conversion, dispatch queue time or YAML serialization.

## Enable locally using appsettings

Profiling is **off by default**. Add this setting to the existing `src/ProductCatalogueAPI/appsettings.json` configuration object (or an applicable `appsettings.{Environment}.json` override):

```json
"EncDetection": {
  "Performance": {
    "Enabled": true
  }
}
```

The example is a JSON property to insert into the existing root object, not a replacement for its other settings. Set `Enabled` to `false` to disable profiling; when `EncDetection:Performance:Enabled` is absent, profiling remains disabled. The Worker reads this through the normal `IConfiguration` pipeline at the beginning of each successful DPC invocation. The prior `productcatalogue_enc_performance` environment variable is no longer consulted.

The local Worker launcher copies the API build output into a separate runtime directory. Build/restart that Worker after modifying appsettings and confirm that its runtime copy contains the updated setting; changing the source JSON alone does not modify an already running Worker. On centrally managed installations, normal deployment permissions still apply, but setting a new machine environment variable is not required.

Instrumentation uses `Stopwatch`'s monotonic timestamps and emits structured `Information` logs. The existing source snapshot start/finish logs remain authoritative for total generation elapsed time. Detailed profiling occurs only for verified snapshots with an explicit required-feature collection.

## Log phases

| Phase | Interpretation |
| --- | --- |
| `CoverageCache` | Check/rebuild S-101 DataCoverage and S-128 AOI cache; includes rebuild counts |
| `ArchiveTable` | Per-table archive query and classification for `point`, `pointset`, `curve`, `surface`; includes scanned row and affected-AOI counts |
| `ResolveSourceProduct` | Resolve one source Product and AOI before snapshot generation |
| `ArcGisQueueWait` | Time waiting on the single ArcGIS execution lane, after snapshot setup |
| `OpenConnections` | Open source geodatabases and create topology logger |
| `DataCoverage` | Fetch S-101 DataCoverage filters for the Product scale and AOI |
| `BuildTopology` | Build the topology and the table selection, including polygon normalization |
| `InformationTypes` | Read and convert information types |
| `FeatureTypes` | Read and convert non-spatial feature types |
| `FeatureTables` | Total time across spatial table enumeration and feature conversion |
| `FeatureTable:<table>` | **Nested** timing for one spatial table, with visited rows and emitted YAML features |
| `GeometryAssembly` | Add non-polygon geometries to the YAML dataset |
| `MembershipVerification` | Check selected/emitted/collapsed source membership; fail closed on omissions |
| `TopologyAndAssociations` | Add topology and spatial associations |
| `ApplyEdits` | Existing optional S-128 write path (normally no-op for verified snapshots) |
| `SerializeYaml` | Serialize the completed shared YAML snapshot and record character count |

`FeatureTable:<table>` rows are details nested within `FeatureTables`; **do not add them to the parent duration**. Source resolution and YAML serialization are outside the `CreateDatasetAsync` dispatch stages. The archive table logs also belong to the preceding detection scan, not snapshot generation.

`InputCount` and `OutputCount` are stage-specific: filter count for DataCoverage, selected topology IDs for BuildTopology, read information/feature types, visited source feature rows and emitted YAML features for spatial tables, and included required features for membership. They are *not* interchangeable across stages. `Success: false` reports an interrupted/failed stage and is not evidence of successful generation.

## Safe measurement procedure

1. Run the focused backend build/tests before using the Worker. Enable profiling only on the single local Worker process that already owns detection.
2. Collect at least one ordinary changed-AOI run without resetting global `JobRunState`, modifying `EncPackageReplay`, discarding packages or forcing synthetic edits. Use the existing approved replay workflow only if independently justified by a real newer source revision and its eligibility checks.
3. Capture the `ENC detection profile` rows together with the existing `ENC source dataset creation started/finished`, `ENC archive scan started/finished`, Worker queue configuration and timestamps. Compare durations per dataset and per stage; record the number of required changed features and topology/feature counts.
4. Prefer repeated measurements on similarly sized inputs before considering an optimization. Native ArcGIS, SQL and network caches can substantially affect wall time. Do not infer accuracy from a single run or sum nested spans.
5. Leave S-57 compiler licensing and SevenCs credentials outside the performance scope. They are known independent blockers to completion of their own export/validation phases.

A subsequent optimization must preserve source-aware topology selection, change verification, archive-clock windows, watermark and replay behavior, package refresh semantics and the independent member results. This candidate deliberately contains no such optimization.

## Focused local checks

```powershell
dotnet build .\src\ProductCatalogueAPI\ProductCatalogueAPI.csproj -c Debug
dotnet test .\tests\TestProductManager\TestProductManager.csproj -c Debug --filter "FullyQualifiedName~EncDetectionPerformanceTests|FullyQualifiedName~VerifiedSourceFeatureTrackerTests|FullyQualifiedName~TopologyFeatureMappingTests|FullyQualifiedName~ArchiveClockWindowTests|FullyQualifiedName~EncPackageDetectionEligibilityTests"
git diff --check
```

Run the broader backend regression suite according to the local environment policy before committing. The Worker/ArcGIS profiling results require the user's Windows runtime and cannot be inferred from unit tests.
