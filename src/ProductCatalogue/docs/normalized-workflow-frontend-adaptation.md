# Normalized workflow frontend adaptation

## Authority and scope

Implementation baseline: `345b79eef2a9225473d57db80243e731739cbc3a`.
Accepted integration commit: `aaf635571503c780517cfc3a76a4fa5e4894f447`.

The supplied `PC-workflow-frontend-adaptation-baseline-345b79ee.zip` was verified against the
SHA-256 recorded in the supplied context before implementation:

```text
0BA454DAEF73423724C3D2AA97FFF759AF356C00D35364953E7FD17205AA84D7
```

The archive was the implementation source. `4dd91285...` and `2ec17a5c...` remain comparison/history
points, not replacement baselines. The completed frontend adaptation was later integrated with the backend
ArcGIS process-isolation work and the AOI cache commit `8a8b77e32502b140890954d1be5143da7b90af01`;
the accepted combined repository state is `aaf635571503c780517cfc3a76a4fa5e4894f447`.
This document supersedes older frontend descriptions of combined AOI transport, Export routes,
export targets, job persistence, and workspace source resolution. The final Analyze/Review performance
correction relies on the additive source-aware targeted Product AOI route.

## Contract-impact matrix

Paths in the evidence column are relative to `src/ProductCatalogueAPI` unless otherwise stated.

| Contract                 | Authoritative implementation                                                                                                                                                                                                                                  | Frontend decision                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product listing          | `Controllers/ElectronicProductsController.cs`: lightweight listing contains dataset names without source specification                                                                                                                                        | Change: Analyze/Review picker uses this endpoint only for selection. It is never used to infer Product source.                                                                                                                             |
| S-57/S-101 bulk AOIs     | Same controller: `GET electronicproducts/aoi?productSpecification=S57` or `S101`, independently filtered by the server; global geometry lookup is cached for 24 hours per Product specification while current workflow/status state is still read per request | Main-map registry loaders retain these endpoints. Analyze/Review no longer load either complete AOI catalog for workspace resolution.                                                                                                      |
| Targeted Product AOI     | `GET electronicproducts/{name}/aoi` uniquely resolves the Product dataset identity and returns `Attributes.ProductSpecification`                                                                                                                              | Change: Analyze/Review resolve only the requested Product. Backend identity conflicts return 409; frontend identity/specification validation fails closed with no bulk fallback or dataset-name heuristic.                                 |
| AOI fields               | `Models/ResponseTypes.cs`: Geometry plus Product attributes; targeted response also carries ProductSpecification                                                                                                                                              | Carry returned geometry and stable source identity. Popup metadata refresh supplies versions. Existing Main-map `layerDataApi.fetchAOI` behavior remains unchanged.                                                                        |
| Public Product metadata  | Electronic product read returns S-128 edition/update plus current normalized state and related `Exports`                                                                                                                                                      | Change: Analyze reads Product metadata and retains registry AOI geometry. Popup uses selected source label. Do not infer publication from a successful export.                                                                             |
| Export metadata          | Related tracks use `Name`, `Type`, Edition, Update, Status, Date, ErrorMessage, ValidationArtifacts; S101 intentionally emits `Type=S100`                                                                                                                     | Change: retain alias, support S101 normalization, preserve errors/artifacts and existing comparison grouping. Versions in a track can be candidate or published fallback; they are not proof of publication.                               |
| Export start             | `Controllers/ExportController.cs`: POST `export/{name}/newedition`, `newupdate`, `cancel-export`, returning 202                                                                                                                                               | Change: remove obsolete `/jobs` suffix and target query; enable both supported Edition/Update leaves.                                                                                                                                      |
| Specification selection  | `Services/Export/ExportProductResolver.cs`: exact catalogue product resolves S57 or S101; S128 maps to S101                                                                                                                                                   | Change: registry declares expected standard for presentation/dispatch. Backend selects actual specification; no frontend cross-standard export override.                                                                                   |
| Engines and mapping      | `ExportEngineRegistry`, `IsoIec8211ExportEngine`, normalized operation service; S57 requires a unique mapped S101 source                                                                                                                                      | No engine selection UI: backend owns mapping and execution. Mapping ambiguity/missing source fails through the backend error contract. No inferred paired Product.                                                                         |
| Unsupported combinations | GML/S122 and HDF5/S102 engines are unimplemented boundaries; controller does not support these product exports                                                                                                                                                | Deliberately unavailable. No All, S100 request target, bulk export, or inferred alternate source path.                                                                                                                                     |
| Edition/Update semantics | Operation service builds isolated candidate revisions; Update requires a published edition; duplicate/incompatible workflow states rejected                                                                                                                   | Change: status gates and candidate/non-publication copy. Backend retains final version, prior-index, mapping and candidate validation.                                                                                                     |
| Completion/errors        | Export job result contains code/message/warning/error; successful export is `EXPORT_READY_FOR_DISTRIBUTION`                                                                                                                                                   | Change: surface backend message, including “not published to S-128”; keep safe API result/error formatting. 404/409/503 and asynchronous validation failures do not become successes.                                                      |
| Cancel Export            | Public operation `CancelExport`, direct `cancel-export` route; deletes an unverified candidate                                                                                                                                                                | Change wire route/type, preserve Cancel Export UI and internal rollback state/action IDs. Candidate existence is not separately exposed; backend remains final authority.                                                                  |
| Job reads/recovery       | `Controllers/JobsController.cs`, `Services/Jobs`: `jobs/{id}`, `jobs/active?datasetName=...`; explicit lower-camel responses                                                                                                                                  | Existing finite request timeout, bounded backoff, browser persistence and cross-tab discovery match. Change Update/CancelExport normalization and fail-closed malformed/identity/stale active-job handling.                                |
| State reads              | Current projection backed by normalized workflow repository; ProductState enum has Idle, Exported, Frozen, InTransit and states 7–15                                                                                                                          | Change palette coverage and action gates. InTransit (6) is not Frozen (5). Unknown states disable export. No legacy persistence contract restored.                                                                                         |
| Product History          | `ProductStateHistory.product_state_history_id` -> ProductRecord.Id -> ProductHistoryResponse.Id                                                                                                                                                               | Existing deterministic shared normalizer matches. Change only source-aware loader admission/identity check for electronic products.                                                                                                        |
| BE-108A                  | History envelope Data/TotalHits plus Events/EventTotalHits, StateRecordId association                                                                                                                                                                         | No producer or association change. Empty Events is valid. No timestamp deduplication or Batch 2 recovery. AppendAsync return contract unchanged.                                                                                           |
| Dashboard                | Existing server paging/sorting/filtering and activity state metadata remain public; ReportLinks are empty                                                                                                                                                     | No change: retain FI-009 page size, FI-010 sort/cursors, History and canonical links. No invented activity-to-artifact association.                                                                                                        |
| Validation files         | `electronicproducts/{name}/artifacts/history`, `electronicproducts/{name}/artifacts/{id}`; history includes track/revision/product/specification                                                                                                              | Change: safe configured API-base download URLs; popup retains latest diagnostics; Analyze and Review expose history downloads, with independent content failures. No fabricated inline XML or distribution artifact endpoint.              |
| Send / Upload            | `UploadController` and `UploadSingularProductJob`: only Disabled/Simulation mode, ReadyForDistribution precondition                                                                                                                                           | Change state gate to 11. Preserve capability preflight and truthful simulation (“No data was sent”). Real upload/delivery and IC-ENC report retrieval remain unavailable.                                                                  |
| Freeze/Unfreeze          | Upload routes still pass S-101 to AppendAsync                                                                                                                                                                                                                 | S101 remains supported; S57 capability deliberately disabled because routing it through that contract would write the wrong specification. Backend unchanged.                                                                              |
| Analyze/Review routes    | Existing `/Analyze?Datasets=...` and `/Review?Datasets=...`                                                                                                                                                                                                   | No route change. Preserve source-aware resolution, ambiguity rejection, generation guards and Product picker behavior.                                                                                                                     |
| Paper Charts/S102        | Synthetic mock endpoints only; no authoritative production read contract                                                                                                                                                                                      | Runtime fixtures retired. The frontend bootstrap exposes only S57/S101; retained synthetic registry definitions are explicit test fixtures only.                                                                                           |
| FI-016                   | Enum/lookup provides names and IDs; Dashboard metadata supplies its own activity semantics                                                                                                                                                                    | Partial integration: current states get centralized theme colors and correct mutation semantics. No published AOI error-only/default-filter classification or source palette policy is supplied; final error-only preset remains deferred. |

## Architecture and lifecycle

S57 and S101 enter the existing source registry through `electronic-aoi` normalization. Main-map layers
use specification-scoped bulk AOI requests. Analyze/Review use the lightweight Product-name list for
picker choices and then resolve each requested dataset through the targeted Product AOI route. The
targeted response's `ProductSpecification` selects the registry definition; dataset-name patterns are
never source authority. Identity conflicts, malformed responses and unavailable configured sources fail
closed without falling back to either bulk AOI catalog.

Map source commits are generation guarded. Compatible layers/Graphics reconcile in place, preserving
popup action DOM and open menus. Structural replacements reconcile only the selection still open
at commit time. Closed/replaced sessions are not reopened later. Popup backend synchronization starts only when content is attached. Metadata requests have their
own generation/disposal/connection checks. Source removal retains existing filter/search/Collection cleanup.

Startup waits for source initialization and lookup loading before reporting readiness. Refresh
coordinates lookup and active-source results; an incomplete refresh is not reported as success.
Failed active-source refresh retains the last successful representation.

Source selection keeps storage key `productCatalogue.dataSources.v1` with schema version 2.
Version 1 never controlled the fixed S101 layer: migration preserves that formerly always-on source
but does not silently enable newly available S57. The runtime registry no longer enables Paper Charts
or S102 from Vite Development/mock flags, so old mock selection intent cannot activate a source. New
visits use the authoritative available defaults. A schema-2 all-off choice remains all off. S57 can
be enabled through Data sources after migration.

Filter snapshots remain schema 2 at `pc.attributeFilters.v3`. The old Product-corrections provider
migrates only to S101 because authoritative baseline `fetchAOI()` defaulted to S101. Explicit new
S101 state wins. No filter state is copied into S57. The conservative Idle exclusion remains the
default; saved explicit empty filter state takes precedence.

Active jobs remain browser-cached projections of backend job discovery, not database locks. Concurrent
same-Product active-job reconciliation shares one in-flight backend request, so popup watchers and
mutation preflight cannot supersede each other. Mutation preflight still fails closed on network errors,
malformed responses or mismatched identities. Poll requests retain a 15-second timeout and retry
intervals capped at 10 seconds. Tracking continues while final status is unknown; no timeout pretends
the job has completed or unlocks it.

Validation diagnostics are read-only downloads. The URL normalizer admits only the public artifact
route and rebases it against the configured API root; external schemes/hosts and unrelated paths
are rejected. Track/revision identity is retained in history. Artifact failures do not discard
successful Analyze metadata or Review History, and a History failure does not hide valid Review
artifacts. Dashboard links are not manufactured from these Product-level lists.

The normalized backend now executes Hangfire export work in a dedicated `Worker` process with its own
`Background` ArcGIS/ProductManager lane. The HTTP API owns a separate `Interactive` lane and does not
run a Hangfire server. Background exports remain serialized with `WorkerCount = 1`, so long export work
cannot monopolize the API's ArcGIS scheduler.

## Preservation gate

- No backend production file, normalized persistence contract, route or engine is rolled back.
- Source boundaries remain registry/capability driven. Unsupported sources make no electronic backend calls.
- BE-108A Batch 1 state IDs and deterministic StateRecordId association are intact.
- No Export/Rollback audit producers, Batch 2 recovery or timestamp-based History deduplication were added.
- FI-009, FI-010, FI-012, FI-013, FI-014, FI-015, FI-017, FI-018 and FI-019 behavior is retained.
- ArcGIS Map/MapView, public popup/Graphic APIs and existing public Calcite controls remain in use.
- Product Collection, independent filters/search, Locator, keyboard/Escape, focus, themes, notices
  and configuration retain their established boundaries; synthetic Paper Charts/S102 runtime opt-in is retired.
- No npm dependencies or package/lockfile changes were introduced.

## Remaining backend/deployment limits

Candidate presence, publication and mapping readiness are not exposed as a complete mutation-capability
snapshot. The frontend can reject known invalid states, but must display backend validation results
for remaining preconditions. S57 Freeze/Unfreeze awaits a specification-correct backend contract.
Real IC-ENC delivery/reports, production Paper Charts/S102, global timeline and Dashboard report-row
associations remain unsupported. Validation file presence does not assert validation success.
S57/S101 execution still requires the configured Windows/ArcGIS/compiler/validation prerequisites.
The API and `ProductCatalogueWorker` must be deployed from the same backend publish artifact and use the
same Hangfire/workflow configuration. The accepted dev-server deployment verified ArcGIS CoreHost in
both processes, one `Background` Hangfire worker and responsive interactive API work during a long export.
The new frontend must be deployed with the normalized backend; the old export routes are not fallback paths.

## Verification and local acceptance

Final acceptance on 2026-09-15 used the normal Windows/deployment environment after integration onto
`8a8b77e32502b140890954d1be5143da7b90af01` and before commit
`aaf635571503c780517cfc3a76a4fa5e4894f447`:

- frontend normalized-workflow verification was reported green before the final integration;
- the focused backend/process-isolation test set passed after the AOI-cache integration;
- Release x64 framework-dependent publish completed and the same publish output was deployed to IIS API
  and the dedicated worker directory;
- `ProductCatalogueWorker` was installed as LocalSystem with Automatic startup and started successfully;
- worker logs confirmed ArcGIS CoreHost initialization, `ProcessRole: Worker`, `ArcGisExecutionLane: Background`,
  `RunsHangfireServer: true`, and `HangfireWorkerCount: 1`;
- a normal export completed through the worker as expected;
- long-export smoke kept S57/S101 AOI, Analyze/Review, another Product operation enqueue and other pages
  responsive while background export execution remained serialized.

The original Work candidate checks and inventory remain below as implementation evidence. Re-run
`npm run check` and the relevant .NET tests after future changes; do not treat the accepted smoke as a
replacement for regression verification.

## Focused regression checklist

1. Fresh browser: load independent S57/S101 sources, inspect network specification parameters and
   distinct identities for overlapping AOIs; verify labels, scale/status/usage filters and Product search.
2. Existing browser: migrate source/filter preferences, preserve S101 and mock choices, leave S57
   opt-in for that migrated selection; reload and test explicit all-off, source reset and global reset.
3. Disable/re-enable one source during slow loading/refresh/search navigation. No old response may
   restore removed layers, filters, search entries, Collection items or popup navigation.
4. Open popup Tools/Export by keyboard; refresh while open. Compatible refresh preserves menus and
   focus. Close or change Product during a delayed metadata response; verify no late popup publication.
5. Run S101 and uniquely mapped S57 Edition, then eligible Update. Inspect direct POST paths, 202 job
   responses, ReadyForDistribution state and non-publication message. Verify missing mapping,
   invalid Update and compiler/validation failure messages without false success.
6. Reload during a running job and open the Product from another profile. Active jobs block conflicting
   mutations. Break active-job/status requests: actions stay fail closed and polling remains paced.
7. Cancel an eligible unverified candidate. Inspect `cancel-export` and `CancelExport`, retained
   Cancel Export copy/icon, terminal refresh and backend rejection for a Product without a candidate.
8. Test Send Disabled and Simulation at ReadyForDistribution. No real-delivery success text may appear.
   Check S101 Freeze/Unfreeze and confirm S57 cannot dispatch these routes.
9. Open canonical Analyze/Review routes for mixed products. Inspect real metadata, geometry, History
   and diagnostic downloads; fail only artifacts or History and verify independent content retention.
   Check empty diagnostics and API deployments at root, `/api`, nested base and configured API host.
10. Recheck Dashboard page sizes/sort/cursors, canonical links and History IDs; BE-108A fixtures with
    matching/mismatched/duplicate StateRecordId and empty Events. No inferred row may be hidden by time.
11. Verify Data sources exposes only S57/S101 in Development and production; no frontend request is
    made to `/mock/paper-charts` or `/mock/s102`.
12. Run light/dark, overlap chooser, keyboard/Escape/focus/tooltip, branding, Denmark/Greenland Locator,
    notices and Product Collection smoke tests. Confirm operation states remain understandable without animation.

## Accepted integration commit

```text
aaf635571503c780517cfc3a76a4fa5e4894f447
Implement normalized Product Catalogue workflows and isolate ArcGIS execution
```

## Delivery verification and inventory

Checks actually completed in Work (Node v24.19.0):

| Check                                                                     | Result                                      |
| ------------------------------------------------------------------------- | ------------------------------------------- |
| Supplied archive SHA-256 against context                                  | Match                                       |
| Extracted authoritative baseline against every archive file               | Byte-for-byte match                         |
| Full dependency-free frontend suite                                       | 634 passed, 0 failed, 0 skipped; 11 suites  |
| Final focused normalized-workflow tests after diagnostic label adjustment | 19 passed, 0 failed                         |
| `node --check` for changed/new JavaScript files                           | 62 files passed                             |
| Backend/Core/backend tests and package manifests against baseline         | Unchanged                                   |
| ZIP inventory and each member against final candidate                     | Exact match; repository-relative paths only |

The complete suite used sequential test-file execution to obtain a complete TAP result in Work:

```sh
cd src/ProductCatalogue
node --test --test-concurrency=1 --test-reporter=tap --test-timeout=15000
node --test src/features/products/tests/normalizedWorkflow.test.js
```

`npm run format`, `npm run check`, ESLint and Vite build were not run: project node_modules are
absent, and no dependencies were installed merely to provide checks. .NET tests were not run:
dotnet and the repository's Windows/ArcGIS prerequisites are unavailable. Browser/visual/manual
acceptance was not performed in Work. LF line endings follow the supplied Prettier configuration.
These statements describe the Work candidate environment only; final Windows/deployment acceptance is
recorded above.

There are 64 changed files, 9 new files and no deleted files. The ZIP contains complete files only.

### Changed files

```text
src/ProductCatalogue/README.md
src/ProductCatalogue/docs/frontend-hardening-tracker.md
src/ProductCatalogue/src/app/initMap.js
src/ProductCatalogue/src/app/initialDataStartup.contract.test.js
src/ProductCatalogue/src/app/initialDataStartup.test.js
src/ProductCatalogue/src/app/loadInitialData.js
src/ProductCatalogue/src/features/analyze/README.md
src/ProductCatalogue/src/features/analyze/api/analyzeApi.js
src/ProductCatalogue/src/features/analyze/api/analyzeApi.sourceAware.test.js
src/ProductCatalogue/src/features/analyze/ui/analyzeSidebar.js
src/ProductCatalogue/src/features/data/api/exportApi.js
src/ProductCatalogue/src/features/data/api/exportApi.test.js
src/ProductCatalogue/src/features/data/config/dataLayerSources.js
src/ProductCatalogue/src/features/data/domain/exportTarget.js
src/ProductCatalogue/src/features/data/normalizers/productExportMetadata.js
src/ProductCatalogue/src/features/data/stores/statusStore.js
src/ProductCatalogue/src/features/dataSources/README.md
src/ProductCatalogue/src/features/dataSources/config/dataSourceRegistry.js
src/ProductCatalogue/src/features/dataSources/config/dataSourceRegistry.test.js
src/ProductCatalogue/src/features/dataSources/core/createDataSourceRuntime.js
src/ProductCatalogue/src/features/dataSources/domain/dataSourcePersistence.js
src/ProductCatalogue/src/features/dataSources/domain/dataSourcePersistence.test.js
src/ProductCatalogue/src/features/dataSources/map/createDataSourcePopup.js
src/ProductCatalogue/src/features/dataSources/map/dataSourceMapAdapter.js
src/ProductCatalogue/src/features/dataSources/map/dataSourceMapAdapter.test.js
src/ProductCatalogue/src/features/dataSources/services/dataSourceController.test.js
src/ProductCatalogue/src/features/dataSources/services/dataSourceNormalizer.js
src/ProductCatalogue/src/features/dataSources/services/dataSourceRefreshCoordinator.js
src/ProductCatalogue/src/features/map/filters/README.md
src/ProductCatalogue/src/features/map/filters/attributeFilterConfig.js
src/ProductCatalogue/src/features/map/filters/attributeFilterPersistence.js
src/ProductCatalogue/src/features/map/filters/attributeFilterPersistence.test.js
src/ProductCatalogue/src/features/map/popups/README.md
src/ProductCatalogue/src/features/map/popups/cancelExportTerminology.contract.test.js
src/ProductCatalogue/src/features/map/popups/createPopup.js
src/ProductCatalogue/src/features/map/popups/popupActionConfig.js
src/ProductCatalogue/src/features/map/popups/popupActionConfig.sourceAware.test.js
src/ProductCatalogue/src/features/map/popups/popupExportConfig.js
src/ProductCatalogue/src/features/map/popups/popupExportConfig.test.js
src/ProductCatalogue/src/features/map/popups/popupExportContract.js
src/ProductCatalogue/src/features/map/popups/popupExportContract.test.js
src/ProductCatalogue/src/features/map/popups/popupProductActions.js
src/ProductCatalogue/src/features/map/popups/popupProductActions.test.js
src/ProductCatalogue/src/features/map/services/refreshService.js
src/ProductCatalogue/src/features/products/README.md
src/ProductCatalogue/src/features/products/domain/productActionAvailability.js
src/ProductCatalogue/src/features/products/domain/productActionAvailability.test.js
src/ProductCatalogue/src/features/products/domain/productContext.js
src/ProductCatalogue/src/features/products/domain/productJob.js
src/ProductCatalogue/src/features/products/domain/productJob.test.js
src/ProductCatalogue/src/features/products/services/productJobService.js
src/ProductCatalogue/src/features/products/services/workspaceProductService.js
src/ProductCatalogue/src/features/products/services/workspaceProductService.test.js
src/ProductCatalogue/src/features/products/state/README.md
src/ProductCatalogue/src/features/products/tests/s101Terminology.contract.test.js
src/ProductCatalogue/src/features/review/README.md
src/ProductCatalogue/src/features/review/services/reviewHistoryLoader.js
src/ProductCatalogue/src/features/review/services/reviewHistoryLoader.test.js
src/ProductCatalogue/src/features/review/ui/reviewBoard.js
src/ProductCatalogue/src/features/timeline/README.md
src/ProductCatalogue/src/features/timeline/api/productHistoryApi.js
src/ProductCatalogue/src/shared/api/apiClient.js
src/ProductCatalogue/src/shared/config/colorsConfig.js
src/ProductCatalogue/src/shared/routing/workspaceRoute.resolution.test.js
```

### New files

```text
src/ProductCatalogue/docs/normalized-workflow-frontend-adaptation.md
src/ProductCatalogue/src/features/data/api/productArtifactApi.js
src/ProductCatalogue/src/features/data/normalizers/productArtifact.js
src/ProductCatalogue/src/features/dataSources/map/reconcileSourceInteractions.js
src/ProductCatalogue/src/features/dataSources/map/reconcileSourceInteractions.test.js
src/ProductCatalogue/src/features/dataSources/services/dataSourceRefreshCoordinator.normalized.test.js
src/ProductCatalogue/src/features/products/domain/electronicProductContract.js
src/ProductCatalogue/src/features/products/services/productJobService.normalized.test.js
src/ProductCatalogue/src/features/products/tests/normalizedWorkflow.test.js
```

### Deleted files

None.
