# BE-106 External Worker Readiness Review

Product Catalogue runtime baseline: `785567b4440129ea192798f0199d44a5cee94289`.

Status: **Complete as architecture/readiness documentation only.**

This review does not move a worker, change Hangfire configuration, add queues, extract assemblies, change project references, alter scheduled tasks, introduce new persistence, or modify runtime behavior.

## 1. Confirmed target direction

The agreed future deployment direction is:

```text
Product Catalogue frontend
        |
        v
ProductCatalogueAPI
  - keeps public Product Catalogue endpoints
  - validates and enqueues Product Catalogue jobs
  - returns job status to the frontend
  - reads shared operation/job state
        |
        v
Shared Hangfire storage
        ^
        |
JobPlatform.Worker
  - later executes Product Catalogue jobs
  - may later host selected scheduled tasks
```

The Product Catalogue API remains in the current application. Only Hangfire Server/worker hosting is a candidate for later extraction to the separate JobPlatform solution.

## 2. Review boundary

### Included

- Current Product Catalogue Hangfire client, server, status and job execution dependencies.
- Portability requirements for executing Product Catalogue jobs in `JobPlatform.Worker`.
- Required compatibility between ProductCatalogueAPI and JobPlatform.
- Scheduled-task migration candidates and risk classification.
- Deployment, cutover and rollback prerequisites.
- Explicit implementation gates and unresolved decisions.

### Excluded

- Removing `AddHangfireServer()` from ProductCatalogueAPI.
- Adding Product Catalogue references to JobPlatform.
- Creating shared job assemblies or queue constants.
- Changing the Hangfire database or schema owner.
- Moving `ExportOperationJob` or `DetectProductChangesJob`.
- Adding an atomic Product operation registry.
- Replacing the existing dataset lock.
- Changing frontend job polling or public API routes.

## 3. Current Product Catalogue job architecture

### 3.1 Hosting

`ProductCatalogueAPI/Program.cs` currently acts as all of the following:

- Hangfire client;
- Hangfire Server host;
- Hangfire dashboard host;
- Product Catalogue job-status reader;
- recurring-job registration host;
- Product Catalogue HTTP API.

The current application configures Hangfire SQL storage, serializer settings and `ExportJobMetadataClientFilter`, then starts `AddHangfireServer()` in the same process.

### 3.2 Public API ownership

The following public contracts should remain owned by ProductCatalogueAPI after worker extraction:

```http
POST /export/{name}/newedition/jobs?exportTarget=S100
POST /export/{name}/rollback/jobs
GET /jobs/{jobId}
GET /jobs/active?datasetName={datasetName}
```

This keeps the frontend isolated from JobPlatform deployment details and prevents the shared job platform from becoming a Product Catalogue domain API.

### 3.3 Enqueue contract

ProductCatalogueAPI currently enqueues a strongly typed Hangfire invocation:

```text
ExportOperationJob.RunAsync(
  ExportOperationJobRequest,
  PerformContext,
  CancellationToken
)
```

The request is already a serializable DTO containing:

- dataset name;
- operation type;
- export target;
- expected edition;
- expected update;
- correlation ID;
- creation timestamp.

Application-owned metadata is written atomically through `ExportJobMetadataClientFilter` during job creation.

### 3.4 Status contract

ProductCatalogueAPI reads Hangfire state and Product Catalogue job parameters directly from shared Hangfire storage. This can continue after worker extraction provided ProductCatalogueAPI retains compatible read access to the same storage and serializer contract.

The status API must continue to hide raw Hangfire arguments, implementation types, paths, stack traces and internal exceptions.

## 4. Product Catalogue worker dependency inventory

### 4.1 Direct job dependencies

`ExportOperationJob` currently requires:

| Dependency                    | Purpose                                                    | Worker requirement                                                    |
| ----------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| `IProductManager`             | Authoritative Product/version and ArcGIS-backed operations | Must be registered and operational in the external worker             |
| `IDatasetLockService`         | Execution-time per-dataset exclusion                       | Must be replaced or made genuinely shared before multi-host execution |
| `IExportOperationService`     | New Edition and Rollback orchestration                     | Must be registered with all transitive dependencies                   |
| `ILogger<ExportOperationJob>` | Structured job logging                                     | Must route into JobPlatform logging/operations                        |
| Hangfire `PerformContext`     | Job ID and persisted job parameters                        | Requires compatible Hangfire runtime and storage                      |
| Hangfire cancellation token   | Cooperative cancellation checks                            | Worker must preserve current execution-token behavior                 |

### 4.2 Operation-service dependencies

`ExportOperationService` requires:

| Dependency                                      | Purpose                                            | Portability concern                                                 |
| ----------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| `IProductManager` / `IElectronicProductManager` | Product mutation, attachment writes, output folder | ArcGIS runtime, ProductManagerCore and environment configuration    |
| `IExportService`                                | S-100 export creation and output cleanup           | Compiler/export binaries, artifacts path and filesystem permissions |
| `IProductRepository`                            | Product state and audit persistence                | Product Catalogue system database connection and schema access      |
| YAML/catalogue libraries                        | Serialization and Product processing               | Compatible package versions and deployment assets                   |

### 4.3 Build and platform dependencies

ProductCatalogueAPI currently targets:

```text
net10.0-windows10.0.20348
x64-capable build
```

It references:

- `ProductManagerCore`;
- `ArcGIS.Core`;
- `ArcGIS.CoreHost`;
- Hangfire 1.8.23;
- S100 Framework catalogue/YAML packages;
- SQL, FTP, ZIP and export-related packages.

A future worker cannot be treated as a platform-neutral generic .NET job host. It must run on a compatible Windows/x64 host with the required ArcGIS runtime, licensing and native dependencies.

### 4.4 Configuration and external resources

The worker will need explicit access to all configuration currently resolved by ProductCatalogueAPI/ProductManagerCore, including:

- Product Catalogue/S-128 and system database connections;
- Hangfire SQL storage connection;
- ArcGIS geodatabase and service configuration;
- connection files;
- Product Catalogue output folder;
- export artifacts path;
- compiler/validation tools;
- feature catalogues and packaged data assets;
- central and local logging locations;
- service-account credentials and filesystem permissions.

No implementation should assume that copying `appsettings.json` alone recreates the Product Catalogue execution environment.

## 5. Dataset locking and distributed execution

The current `DatasetLockService` stores persistent lock files under:

```text
%ProgramData%/ProductManager/Locks
```

Ownership is the exclusive open file handle. This is safe only when all competing executions observe the same lock namespace and filesystem locking semantics.

A local `%ProgramData%` path on two machines creates two unrelated locks. Therefore:

- worker extraction must not enable Product Catalogue execution on both the old API host and the new worker host at the same time;
- a multi-worker rollout must not rely on machine-local lock files;
- a shared operation-ownership design must be approved before distributed Product Catalogue execution;
- the existing execution guard and authoritative Product-version recheck remain mandatory even after a shared registry is introduced.

The readiness review does not select or implement registry persistence.

## 6. JobPlatform integration profile

The current JobPlatform solution already separates job management/API concerns from worker execution and contains dedicated contracts, core, persistence, Hangfire, jobs, API and worker projects.

That structure is suitable as the future host, but Product Catalogue integration should be modular rather than copied directly into `JobPlatform.Worker/Program.cs`.

Recommended later module boundary:

```text
ProductManager job contracts/DTOs
ProductManager job implementation/DI registration
JobPlatform.Worker host
```

The exact project/assembly arrangement is deliberately not created by BE-106. Before implementation, the selected JobPlatform commit and project graph must be recorded as the integration baseline.

## 7. Hangfire compatibility requirements

Before ProductCatalogueAPI can enqueue jobs for a separate worker, both processes must agree on:

- Hangfire major/minor compatibility;
- SQL storage schema and owner;
- `CompatibilityLevel.Version_180` behavior;
- simple assembly-name type serialization;
- recommended serializer settings;
- job type and method identity;
- request DTO shape and enum values;
- client filters and atomic Product Catalogue metadata creation;
- queue name and queue ordering;
- terminal-state and retention behavior.

Existing queued Product Catalogue jobs serialize the current type and method identity. A deployment that removes or relocates those types without a compatibility bridge can strand queued jobs.

## 8. Queue recommendation for later implementation

Product Catalogue jobs should later use a dedicated queue, provisionally:

```text
product-catalogue
```

Reasons:

- Product Catalogue jobs require Windows/x64/ArcGIS dependencies not needed by every JobPlatform job;
- ArcGIS dispatch and export work may need lower worker concurrency;
- deployment and incident isolation should not stop unrelated jobs;
- Product Catalogue jobs should not be consumed by generic workers that lack required runtime assets.

BE-106 does not add this queue. The final queue name and worker count must be approved when JobPlatform is ready.

## 9. Scheduled-task inventory

### 9.1 `DetectProductChangesJob`

Current registration:

- controlled by `EnableDetectProductChanges`;
- registered from ProductCatalogueAPI startup;
- recurring ID: `detect-product-changes-job`;
- currently scheduled with `Cron.Daily(23)`;
- directly performs Product scans, New Edition/New Update work, export, SevenCs validation, attachment writes and repository updates.

Risk classification: **high**.

Reasons:

- it has the same ArcGIS/export/filesystem/database dependencies as interactive Product operations;
- it does not currently use the Product Catalogue dataset-lock/job-execution framework consistently;
- it contains separate export/update orchestration instead of delegating fully to the shared async operation service;
- SevenCs failure handling contains temporary behavior;
- moving it while interactive jobs remain elsewhere could create competing Product mutations.

Decision: treat `DetectProductChangesJob` as a separate later migration package. Do not move it automatically with the first worker extraction.

### 9.2 Mail import and other commented jobs

Mail-import job registration is currently commented/disabled in ProductCatalogueAPI. Disabled code is not a migration candidate until its ownership, configuration and production requirement are explicitly restored.

### 9.3 Other scheduled tasks

Any additional scheduled task considered for JobPlatform must receive its own inventory entry covering:

- current owner and trigger;
- business and technical dependencies;
- mutation scope;
- concurrency interaction with Product Catalogue operations;
- retry/idempotency behavior;
- service identity and secrets;
- required monitoring and manual recovery.

## 10. Target responsibility split

### ProductCatalogueAPI remains responsible for

- Product Catalogue HTTP routes and response models;
- request validation and public error semantics;
- authoritative Product lookup/version capture before enqueue;
- Hangfire client/enqueue behavior;
- atomic Product Catalogue creation metadata;
- frontend-compatible job status and active-operation endpoints;
- Product Catalogue authorization when production security is enabled.

### JobPlatform.Worker later becomes responsible for

- consuming the Product Catalogue queue;
- resolving Product Catalogue job implementation dependencies;
- executing Export/Rollback jobs;
- worker health, process lifecycle and operational logging;
- cooperative Hangfire cancellation behavior;
- applying the same no-automatic-retry rule unless a later idempotency review changes it.

### Shared infrastructure later owns

- Hangfire SQL storage and schema lifecycle;
- compatible retention/cleanup policies;
- service-account access;
- shared operation ownership if/when approved;
- deployment monitoring and recovery procedures.

## 11. Implementation prerequisites

Worker extraction must not begin until all items below are resolved.

| Gate                     | Required evidence                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------- |
| JobPlatform ready        | Stable API/worker deployment and recorded clean commit                              |
| Host compatibility       | Windows/x64 host with verified ArcGIS runtime/licensing                             |
| Dependency registration  | Product Catalogue job and transitive services resolve in worker DI                  |
| Shared storage           | API and worker can access the selected Hangfire SQL storage                         |
| Serializer compatibility | Existing and newly created jobs can be read and executed                            |
| Queue isolation          | Dedicated queue configured and only compatible workers consume it                   |
| Filesystem access        | Output, artifacts, connections and tools are reachable with correct permissions     |
| Database access          | Product Catalogue/S-128/system DB connectivity verified under worker identity       |
| Concurrency decision     | No dual-host execution with unrelated local locks; shared ownership design approved |
| Status compatibility     | Existing frontend routes return unchanged public state across worker cutover        |
| Cutover procedure        | Queue drain, deployment sequence and rollback steps rehearsed                       |
| Scheduled-task decision  | Each recurring task explicitly stays or moves; no implicit migration                |

## 12. Recommended later cutover sequence

This is a planning sequence only.

1. Record exact Product Catalogue and JobPlatform commits.
2. Freeze runtime contract changes during cutover preparation.
3. Add compatible Product Catalogue job assemblies/module to JobPlatform.
4. Configure a dedicated Product Catalogue queue without consuming it yet.
5. Verify worker startup, DI, ArcGIS runtime, database and filesystem access.
6. Pause new Product Catalogue job creation or enter a controlled maintenance window.
7. Drain or explicitly resolve existing Product Catalogue jobs in the old storage/queue.
8. Deploy ProductCatalogueAPI as client/status reader without Hangfire Server.
9. Enable the Product Catalogue queue on JobPlatform.Worker.
10. Run one controlled Export and one controlled Rollback through the unchanged frontend/API contract.
11. Verify status, active-job visibility, execution guard, output, Product state and logs.
12. Keep scheduled-task migration disabled until separately approved.

## 13. Rollback strategy for later implementation

A rollback must preserve job-type compatibility and avoid two active workers.

Required rollback rules:

- stop Product Catalogue queue consumption in JobPlatform before restarting the old worker;
- verify no Product Catalogue job is Processing;
- complete, delete or explicitly account for queued jobs whose type is unavailable in the target rollback build;
- restore the previous API/worker configuration as one coordinated deployment;
- verify shared storage schema compatibility;
- do not restore both worker hosts simultaneously;
- treat any job with `ProductManagerExecutionStarted = true` and uncertain side effects as `MANUAL_REVIEW_REQUIRED`.

## 14. Open decisions

These decisions remain intentionally unresolved until JobPlatform is ready:

1. Whether Product Catalogue keeps its current Hangfire database or moves to JobPlatform storage.
2. Which application owns Hangfire schema migrations and retention.
3. Exact shared assembly/project structure.
4. Final Product Catalogue queue name and worker concurrency.
5. Worker host and ArcGIS licensing model.
6. Service identity, secrets and filesystem permissions.
7. Whether ProductCatalogueAPI continues direct Hangfire status reads long term.
8. Persistence and recovery semantics for an atomic Product operation registry.
9. Final relationship between distributed ownership and the current file lock.
10. Which scheduled tasks move, remain, or are retired.
11. Hangfire dashboard ownership and authorization.
12. Production authentication/authorization for Product Catalogue job endpoints.

## 15. Review conclusion

The current async Product Catalogue design is portable to a separate JobPlatform worker without changing the frontend or public ProductCatalogueAPI routes.

The move is **not** a connection-string-only change. The future worker must reproduce the Product Catalogue execution environment, and distributed concurrency must be resolved before more than one host can execute Product Catalogue mutations.

BE-106 is complete as a readiness review. No worker extraction or operation-registry implementation should start until JobPlatform is declared ready and the open decisions above are approved.

BE-107 Dashboard Filtering and Pagination was completed and manually verified at commit `7eb0fe25e2a8d44b9e4da29cba280c8091a6f8cd`. The next planned Product Catalogue package is BE-108 Product History failure hardening when its producer contract is ready.
