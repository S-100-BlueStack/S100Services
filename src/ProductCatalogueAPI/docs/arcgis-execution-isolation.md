# ArcGIS execution isolation

## Accepted implementation and deployment status

Accepted integration commit: `aaf635571503c780517cfc3a76a4fa5e4894f447`. The implementation also
contains AOI cache commit `8a8b77e32502b140890954d1be5143da7b90af01`.

Dev-server acceptance on 2026-09-15 verified the production-equivalent process split: the IIS API and
`ProductCatalogueWorker` were deployed from the same Release x64 framework-dependent publish output
into separate directories. The Windows Service is registered as `ProductCatalogueWorker`, runs as
LocalSystem, uses Automatic startup, and fixes the process role to `Worker` on the command line.

Worker startup logs confirmed ArcGIS CoreHost initialization, `ArcGisExecutionLane: Background`, one
Hangfire server and `HangfireWorkerCount: 1`. The Windows Service installer was also corrected for valid
PowerShell `${LASTEXITCODE}` interpolation before installation and then completed successfully. A normal
export completed through the worker. During a long export, S57/S101 AOI reads, Analyze/Review, another
Product operation enqueue and other application pages remained responsive while background export
execution stayed serialized. This closes the original API-starvation acceptance gate for the dev deployment.

Reboot/startup-order behavior and permissions for every production remote resource remain deployment
checks for each target environment; they are not inferred from the successful live-service smoke.

## Why ArcGIS work is serialized

`ProductManagerGDB` owns one `Geodatabase` and one dedicated STA scheduler. ArcGIS operations for that owner are serialized because ArcGIS Core objects have thread and lifetime requirements. Do not increase scheduler concurrency or share a `ProductManagerGDB` across concurrent execution lanes.

Export snapshot creation can spend minutes in synchronous topology, feature, association, geometry, and support-file processing. A long snapshot must therefore never run on the ProductManager instance used by HTTP requests.

## Process roles

The same `ProductCatalogueAPI` deployment supports two mutually exclusive roles:

| Role | HTTP | Hangfire client/storage | Hangfire server | ArcGIS lane | ProductManager lifetime |
| --- | --- | --- | --- | --- | --- |
| `Api` | Yes | Yes | No | `Interactive` | One singleton owned by the API process |
| `Worker` | No | Yes | Yes | `Background` | One singleton owned by the worker process |

`Api` is the default. It serves the existing routes, performs authoritative enqueue-time Product reads, writes jobs to Hangfire storage, exposes job status, and hosts the Hangfire dashboard. It never executes Hangfire jobs.

`Worker` is a generic host with no HTTP listener. It initializes ArcGIS Core and its own ProductManager, then processes jobs from the same Hangfire storage. `WorkerCount` is fixed at `1`, preserving serialized background ArcGIS execution and preventing exports for different datasets from running concurrently in the supported deployment.

The process boundary is the isolation boundary. A long or stalled background scheduler cannot occupy the interactive scheduler because the two ProductManager instances, schedulers, geodatabase connections, ArcGIS hosts, and OS processes are distinct.

## AOI read behavior

The specification-scoped global AOI route caches the ArcGIS geometry dictionary for 24 hours per
`ProductSpecification`. The cache stores one `Lazy<Task<Dictionary<string, string>>>` so concurrent
requests share the same geometry lookup; a failed lookup is removed so the next request can retry.
Current workflow/status state is still loaded from SQL on every request and is not frozen by the geometry
cache.

`GET /electronicproducts/{name}/aoi` remains a separate targeted path. It resolves exact source-aware
Product identity and calls `GetDatasetBoundary` for that Product only. It does not use the global AOI cache,
perform a bulk AOI scan, infer source identity from the dataset name, or fall back across specifications.

## Deployment

Publish the existing project once as the existing x64 framework-dependent deployment. ArcGIS CoreHost documentation does not recommend self-contained deployment. API and worker must run the same release so the Hangfire client and server always use the same job types and assembly version.

Use separate deployment directories for API and worker, populated from the same publish artifact. This keeps the release identical while preventing IIS and the Windows Service from locking the same executable during deployment.

API process configuration:

```text
ProductCatalogue__ProcessRole=Api
```

`Api` remains the default, so the IIS deployment does not require a new setting unless an explicit value is preferred.

Worker process configuration:

```text
ProductCatalogue__ProcessRole=Worker
```

The equivalent worker command-line override is:

```powershell
ProductCatalogueAPI.exe --ProductCatalogue:ProcessRole=Worker
```

The Worker host registers the .NET Windows Service lifetime through `Microsoft.Extensions.Hosting.WindowsServices`. The registration is context-aware: the same Worker command still runs normally in a developer console, while Service Control Manager startup uses `WindowsServiceLifetime`.

Do not place the worker behind IIS and do not start the API executable in a combined role. Unsupported role values fail startup.

Both processes require access to the same configuration values and external resources:

- `Connections:HangfireConnection`
- `Connections:SystemConnection`
- `Connections:S128Connection`
- `ArtifactsPath`
- `S100Compiler:ExecutablePath`
- SevenCs and other existing export prerequisites

The worker identity also requires:

- an ArcGIS Pro installation and a valid ArcGIS Pro/CoreHost license;
- read access to the S-128 connection file and source geodatabases;
- read/write access to Hangfire and workflow SQL databases;
- read/write access to artifact, temporary validation, and dataset-lock paths;
- permission to start the configured S-100 compiler.

Deploy exactly one supported `Worker` process unless global background serialization is redesigned. The file-based per-dataset lock remains active and protects the existing dataset-level mutation boundary, but it does not replace the one-worker deployment rule for different datasets.

### Windows Service installation

The supported service contract is:

```text
Service name: ProductCatalogueWorker
Display name: Product Catalogue Worker
Account: LocalSystem
Startup: Automatic
Process role: Worker
```

The publish output includes `scripts/Install-ProductCatalogueWorker.ps1`. Run it from an elevated PowerShell session and point it at the worker deployment copy of `ProductCatalogueAPI.exe`. For a first installation, prefer installing it stopped so registration and deployment configuration can be inspected before execution:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Install-ProductCatalogueWorker.ps1 `
    -ExecutablePath F:\Applications\ProductCatalogueWorker\ProductCatalogueAPI.exe

Get-CimInstance Win32_Service -Filter "Name='ProductCatalogueWorker'" |
    Select-Object Name, DisplayName, StartName, StartMode, State, PathName

sc.exe qfailure ProductCatalogueWorker
Start-Service ProductCatalogueWorker
```

The script registers the fixed Worker role on the service command line, configures LocalSystem and automatic startup, and configures three one-minute restart recovery actions. It fails if a service with the same name already exists rather than silently replacing an existing deployment. `-StartService` remains available when the deployment configuration has already been validated. Automatic startup is intentional; delayed start is not used as a substitute for explicit dependency/recovery handling and should only be considered if reboot testing demonstrates an actual startup-order problem.

For an upgrade, stop the service, deploy the new worker copy into the existing worker directory, then start the service again. Recreate the service only when its binary path or service registration must change.

To remove a dev-server installation:

```powershell
Stop-Service ProductCatalogueWorker
sc.exe delete ProductCatalogueWorker
```

`LocalSystem` presents the server computer credentials to remote resources. If connection files, artifacts, locks, compiler inputs/outputs, or other required paths live on network shares, grant the server machine account (for example `DOMAIN\DEVSERVER$`) the required access or use local paths. Do not assume an interactive developer account's mapped drives or user profile are available to the service.

API and worker each initialize ArcGIS CoreHost in their own process. Running both on the same server or under the same Windows identity is not treated as shared ArcGIS object state. The dev-server acceptance proved simultaneous API/worker CoreHost initialization for that deployment; every target environment must still prove its own ArcGIS license and external-resource access.

After deployment, the Hangfire dashboard should show one `product-catalogue-worker:<machine>:<process-id>` server. The API process must not appear as a Hangfire server. When the API is mounted as the IIS `/api` application, the dashboard registered at `/dashboard` is reached externally at `/api/dashboard/`. The accepted dev-server smoke verified the worker-only Hangfire execution model with one worker while the API remained responsive during export processing.

## Version and integrity guards

The API still reads the authoritative S-128 Product version before enqueue and records `ExpectedEdition` and `ExpectedUpdate`. The worker reads the authoritative version again after acquiring the existing dataset lock and before workflow mutation. A Product change between enqueue and execution still fails with `PRODUCT_VERSION_CHANGED`.

The SQL workflow, source-aware S-57/S-101 mapping, execution-start guard, compiler checks, SevenCs validation, artifact history, and public routes are unchanged.

## Cancellation

ArcGIS APIs that do not accept a cancellation token cannot be interrupted while a native call is executing. Snapshot creation now observes cancellation before dispatch and between substantial managed processing phases, including table rows, feature classes, feature mappings, attachments, geometry assembly, associations, and the optional edit phase.

Candidate snapshot creation uses `applyEdits: false`, so cancellation checkpoints do not leave partial S-128 publication edits. If cancellation occurs after the SQL workflow entered `Exporting`, the existing best-effort failure transition records `Error`; the job cannot record a successful result. Existing artifacts may require operator review and are intentionally not reported as a completed export.

## Observability and starvation diagnosis

Inspect these structured log events:

- `ArcGIS operation completed`: `ExecutionLane`, `OperationType`, `DatasetName`, `CorrelationId`, `ArcGisQueueWaitMs`, and `ArcGisExecutionMs`;
- `AOI ArcGIS profiling completed`: the existing detailed AOI timings plus `ExecutionLane` and `OperationType`;
- `Background ArcGIS export snapshot starting/finished`: dataset, source dataset, Product specification, operation type, cancellation state, and duration;
- `Product Manager job starting/completed/failed`: job ID, dataset, operation type, and correlation ID;
- `Product Catalogue backend configured`: process role, lane, Hangfire server state, and worker count.

A healthy long export shows `CreateDataset:*` on the `Background` lane while concurrent AOI/version reads complete on the `Interactive` lane. High interactive `ArcGisQueueWaitMs` then indicates contention among interactive calls, not starvation behind an export. If jobs remain queued, verify that exactly one worker server is present and that its startup log confirms the `Background` lane.

## Alternatives considered

### Multiple ProductManager instances in one process

Rejected because ArcGIS CoreHost is initialized and licensed at process scope, while the public documentation does not establish that this application's independently created Core objects and schedulers may safely execute concurrently in one process. Separate schedulers alone do not prove safe ArcGIS concurrency or object ownership.

### Request-path read model

Rejected as the primary correction. Moving enqueue-time reads to SQL would not keep AOI and other interactive ArcGIS operations responsive, would duplicate Product truth, and could weaken source-aware identity/version integrity. The worker-side authoritative revalidation remains required.

### Timeouts

Rejected as the primary correction because a timeout only bounds the symptom. It does not free an interactive ArcGIS lane occupied by a legitimate long export.

### Higher scheduler concurrency

Rejected because the single scheduler protects ArcGIS thread affinity and Geodatabase ownership. Increasing its concurrency would combine shared mutable Core objects with unproven parallel access.

## References

- [Esri ArcGIS Pro SDK: CoreHost](https://pro.arcgis.com/en/pro-app/latest/sdk/api-reference/conceptdocs/docs/ProConcepts-CoreHost.html)
- [Hangfire: Placing Processing into Another Process](https://docs.hangfire.io/en/latest/background-processing/placing-processing-into-another-process.html)
- [Hangfire: Configuring the Degree of Parallelism](https://docs.hangfire.io/en/latest/background-processing/configuring-degree-of-parallelism.html)
- [Microsoft: Create a Windows Service using BackgroundService](https://learn.microsoft.com/dotnet/core/extensions/windows-service)
- [Microsoft: LocalSystem account](https://learn.microsoft.com/windows/win32/services/localsystem-account)
