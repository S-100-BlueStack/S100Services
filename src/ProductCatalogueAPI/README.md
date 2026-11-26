# ProductCatalogue architecture

`Nexus.slnx` contains the API and Worker executable, the ArcGIS-backed product manager, and the Windows xUnit suite. Build for Windows x64 with .NET 10, ArcGIS Pro and the repository's matching NuGet packages.

| Project | Responsibility |
| --- | --- |
| `src/ProductCatalogueAPI` | HTTP contracts, authentication, System SQL persistence, application workflows and Hangfire orchestration. |
| `src/ProductManagerCore` | Product lookup, S-128 metadata and publication, ArcGIS dispatch, source archive scans and verified export snapshots. |
| `tests/TestProductManager` | In-memory and local contract tests, ArcGIS geometry tests, opt-in SQL tests, and manually enabled developer utilities. |

## Finding and adding code

| Area | Start here |
| --- | --- |
| API routes and policies | `Controllers/` for routing, validation and HTTP mapping, `Contracts/` for public request and response shapes, and `Filters/` or `OpenApi/` for HTTP conventions. |
| Process initialization | `Program.cs` and `Hosting/`. `ArcGisRegistrations` initializes CoreHost and the process-owned ArcGIS execution lane. `BackendRegistrations` registers common services and the Worker execution services. |
| Background processing | `Jobs/` for Hangfire invocation methods and `BackgroundProcessing/` for the enqueue and status adapters, scheduling, filters and execution metadata. Place substantial workflows with their owning service. |
| Change detection and exports | `Services/Detection`, [bathymetric surface workflow](docs/s102-change-detection.md), `Services/Operations` and `Services/Export`. Use `Services/Locking` to coordinate operations on the same candidate. |
| Validation and distribution | `Services/SevenCs` for validation, `Services/Distribution` for sending and finalization, and `Services/ValidationEmail` for mailbox ingestion and response matching. |
| SQL | `Data/Database` opens System database connections. `Data/Repositories` owns durable SQL operations and transactions. `Data/Records` and `Data/Models` contain persistence projections and shared workflow records. Add database-owner scripts under [Data/Migrations](Data/Migrations/README.md). |
| ArcGIS | `ProductManagerCore/Archive` for archive intervals and bindings, `ExportSnapshots` for topology and snapshot verification, and `Geodatabase` for the STA scheduler, product mapping and partial ArcGIS implementations. Begin with `IProductManager.cs` for the supported catalogue operations. |

Keep executable Hangfire jobs in `Jobs/` and their request and execution support in `BackgroundProcessing/Execution/`. The standalone validation-email tests link selected contracts and jobs by path. The ENC source checks read the detection and recovery services under `Services/Detection/`. Update those links when moving files.

## From source changes to accepted products

1. The API authenticates operators through Windows SSO and reads product metadata through `IProductManager`. Mutation endpoints validate the product and expected version before enqueueing work. The Worker uses its own STA ArcGIS lane and processes jobs with one Hangfire worker.
2. When enabled, ENC detection reads S-101 archive changes through a UTC cutoff, maps verified edits to product coverage, and persists a shared snapshot and replay state in System SQL. It builds the S-101 and S-57 candidates from that snapshot. Hold, in-transit delivery, replay and interruption guards govern when the pair can be replaced.
3. `ExportJobExecutor` checks the expected product version and acquires the product-track lock. `ExportOperationService` uses the engine registry for compilation and SevenCs for applicable validation. Revisions, artifacts, track state and history are saved in System SQL. The ENC package and replay records are specific to shared ENC snapshots.
4. The distribution workflow reserves the exact revisions it sends. Email processing matches replies to durable delivery evidence. On accepted ENC pairs, finalization writes the publication to S-128 first and then completes System SQL. The S-128 attachment records the package identity so a retry after SQL failure can finish without publishing the attachment twice.

System SQL and the ArcGIS geodatabase have separate transaction boundaries. Hangfire also owns its own schema and durable job state. Maintain the existing order, identities and recovery checks when adding a cross-store operation.

For another specification, start with source detection, the product identity and supported export target, then wire a concrete engine into the existing export registry. Reuse track, revision, artifact, validation and delivery contracts where the specification supports them. The S-102 job and checkpoint are extension points. Its source detector is a scaffold, and it has no recurring registration in this snapshot.

## Background jobs and deployment

| Recurring ID | Registration | Schedule |
| --- | --- | --- |
| `detect-product-changes-job` | API startup reconciles `EnableDetectProductChanges`. A client/server filter coalesces overlapping ticks. | Every minute when enabled. |
| `process-icenc-mailbox` | Worker hosted registration follows the validation-email mode. | Every minute when enabled. |
| `product-history-reconciliation` | Worker hosted registration. | Every 15 minutes UTC, default queue. |

Deploy the API and Worker together during the planned restoration. Stop both before the cutover and point both at the prepared Hangfire store without pre-refactor invocations. The export request type and mailbox entry point have changed CLR identities. Existing serialized invocations are incompatible with those changes. After startup, verify recurring registration and the Worker connection. Preserve the System schema, migration history and business data through the planned restore. This change ships the same SQL scripts and introduces no System or geodatabase migration.

## Build and test

Run these commands on Windows x64 with the ArcGIS Pro runtime and licence, the S-101 feature-catalogue asset, and access to the project's NuGet feeds.

```powershell
dotnet restore Nexus.slnx
dotnet build Nexus.slnx -c Debug -p:Platform=x64 --no-restore
dotnet test tests/TestProductManager/TestProductManager.csproj -c Debug -p:Platform=x64 --no-build --filter "Category!=Manual&Category!=ArcGis&Category!=Sql"
```

- `Unit/` uses test support such as `Support/InMemoryProductRepository.cs`, local fixtures or temporary files. Clear the SQL opt-in variables below before routine runs because the linked SQL fixtures use their own skips.
- `Integration/ArcGis/` uses in-memory geometry with CoreHost. Run these tests with `--filter "Category=ArcGis"` on a licensed test machine.
- The owner SQL test and linked DPC SQL tests require deliberate opt-in. Use a disposable SQL Server target. The owner test uses `BE108A_DATABASE_OWNER_VERIFY` and `BE108A_SYSTEM_CONNECTION_FILE`. The DPC fixtures use `PRODUCTCATALOGUE_DPC_SQL_TEST_CONNECTION` and create and drop a unique test database.
- `Manual/` is skipped by default. To run an import, enable one test locally and select only that test. Set `PRODUCTCATALOGUE_TEST_S128_CONNECTION` to a disposable S-128 copy and set the corresponding source variable, `PRODUCTCATALOGUE_TEST_LALALAND_SOURCE` or `PRODUCTCATALOGUE_TEST_S57_SOURCE`. The separate SevenCs check requires a test validation endpoint plus `PRODUCTCATALOGUE_TEST_ENC_DATASET` and `PRODUCTCATALOGUE_TEST_ENC_OUTPUT`. Leave manual tests skipped in the repository.

See [local startup](docs/product-catalogue-local-startup.md) for process configuration and [migration instructions](Data/Migrations/README.md) for SQL deployment.
