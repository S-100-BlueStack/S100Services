# FI-018A — Open-source and third-party deployment readiness audit

## 1. Executive summary

**Decision: not yet ready for a supported third-party release without organization-specific source changes.** The main obstacles are the active organization-specific ArcGIS portal, producer/datum assumptions in exported data, and the absence of a complete bootstrap contract for the required databases. The application can intentionally remain a Windows/x64, ArcGIS-backed application. Open-source readiness does not require Linux, Docker, independent workers, or arbitrary Product-source support.

The frontend has a working neutral logo/favicon boundary, configurable API base and Locator endpoint, base-aware canonical Analyze/Review routes, and an established source/capability architecture. FI-017 and FI-019 are not reopened. Production branding defaults are neutral; the committed development profile is still organization-branded. The default geographic experience and backend export metadata are not organization-neutral.

Backend connections and artifact roots are already external configuration. However, explicit JSON providers are appended after the default configuration providers, creating an override-precedence problem. The actual database bootstrap, licensed tool acquisition, supported versions, process identity, and deployment verification need a reproducible contract. Authentication is deliberately disabled in application code; publication must clearly separate source availability from approval to expose mutation endpoints in production.

This report contains **24 unique findings**. Counts include accepted boundaries and external dependencies, not just defects; scorecard rows and inventories do not create additional findings.

| Readiness category               | Count | Finding IDs  |
| -------------------------------- | ----: | ------------ |
| Blocker                          |     3 | A01–A03      |
| Required before public release   |     6 | A04–A09      |
| Recommended                      |     6 | A11–A16      |
| Acceptable deployment assumption |     5 | A17–A21      |
| Deferred / external dependency   |     3 | A10, A22–A23 |
| No issue                         |     1 | A24          |

No confirmed committed credential value was identified by the bounded inspection. This is not a secret-history clearance. Rights to third-party packages, catalogue files, fixtures, and assets remain unverified where the repository does not supply sufficient evidence.

## 2. Audited baseline and scope

### 2.1 Baseline identity

| Input                             | Observed identity                                                  |
| --------------------------------- | ------------------------------------------------------------------ |
| Authoritative repository baseline | `53ffebfe30c11f53ab40fb80e80f7302a77fd0b0`                         |
| Authoritative archive             | `FI-018A-baseline-53ffebfe.zip`                                    |
| Archive SHA-256                   | `23a89c823df9c73aa3476eca726a0aa5ed155865e431c3ee3a4e731e506e291c` |
| Git archive ZIP comment           | `53ffebfe30c11f53ab40fb80e80f7302a77fd0b0`                         |
| Audit date                        | 2026-09-09                                                         |

The archive SHA-256 was verified as `23a89c823df9c73aa3476eca726a0aa5ed155865e431c3ee3a4e731e506e291c`. The ZIP comment identifies the archived Git commit as `53ffebfe30c11f53ab40fb80e80f7302a77fd0b0`, which is the authoritative repository baseline for this audit. The attached archive bytes were used as source of truth without relying on HEAD/main, repository history, prior candidates, or memory.

### 2.2 Scope actually inspected

The archive contains 801 files. Discovery covered its complete file manifest and repository-level build, license, configuration and documentation entries. Content inspection and targeted searches covered:

- `src/ProductCatalogue`: entry points, configuration, branding assets/lifecycle, routing, data sources, API helpers, map/Locator/basemap setup, Analyze failure behavior, Dashboard time contract, browser persistence, package manifest/lock, environment files, IIS fallback, README, backend contracts and relevant readiness documents.
- `src/ProductCatalogueAPI`: project/startup/registration, configuration, all controller endpoint declarations and relevant bodies, database/repository SQL, export and scheduled jobs, status services, locking, logging/error handling, Graph/mail stubs, development fixtures and catalogue resource.
- Direct project dependency `src/ProductManagerCore`: project references, settings, active `ProductManagerGDB` initialization, database schema usage, export serialization and producer identity; the alternative REST implementation was inspected to distinguish compiled code from the registered path.
- `README.md`, `LICENSE`, `.gitignore`, `.editorconfig`, `Nexus.slnx`; `tests/TestProductManager/TestProductManager.csproj` for verification dependencies; directly relevant `artifacts/Product Files/101_FC_2.0.0.xml`, constraints, pipeline and mapping samples. Other catalogue assets were inventoried, not semantically audited.

The root README is contextual documentation, not a current application deployment manual. `Nexus.slnx` directly includes the API, core and test project. Neither the project reference chain nor `Program.cs` introduces a JobPlatform runtime dependency. The existing `src/ProductCatalogue/docs/be-106-external-worker-readiness.md` was read solely to reconcile current hosting with its explicitly future direction. JobManager and other applications were not audited.

### 2.3 Method and limits

Findings use exact repository paths and symbols instead of line numbers. Search matches were followed into relevant code to distinguish executable, unreachable, commented, and development-only behavior. Absence claims about bootstrap/notice/configuration support combine the archive inventory with content searches and inspected consumers; filenames alone are not used as proof.

No dependencies were installed. No application, schema, tests, package files, environment files, deployment files or tracker were modified. No commit was created. There was no browser/network trace, licensed Windows execution, database access, infrastructure inspection, external legal research, vulnerability database scan, or Git-history scan. Package internals not contained in the archive remain outside the evidence boundary.

## 3. Current supported deployment shape

The best-supported topology in these files is a static Vite frontend and ProductCatalogueAPI under the same origin, with `/api` selecting the backend. The frontend is built separately; the API project does not build or serve the frontend distribution. The API owns HTTP endpoints, enqueue/status functions and an in-process Hangfire Server.

| Component                    | Current requirement or behavior                                                                                      | Evidence                                                                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend build               | Node/npm; committed npm lock; Vite static build; build-time public configuration                                     | `src/ProductCatalogue/package.json`, `src/ProductCatalogue/package-lock.json`, `src/ProductCatalogue/vite.config.js`                                |
| Frontend host                | Static files and SPA fallback; supplied IIS rewrite configuration                                                    | `src/ProductCatalogue/public/web.config`                                                                                                            |
| API host                     | Windows-targeted .NET 10 web application with native ArcGIS CoreHost initialization                                  | `src/ProductCatalogueAPI/ProductCatalogueAPI.csproj`, `src/ProductCatalogueAPI/Registrations.cs`                                                    |
| Core                         | Direct `ProductManagerCore` reference, x64 platform, installed ArcGIS assembly references and S100Framework packages | `src/ProductManagerCore/ProductManagerCore.csproj`                                                                                                  |
| Databases                    | SQL Server for application state and Hangfire; S-128 geodatabase and source geodatabase connections                  | `src/ProductCatalogueAPI/Program.cs`, `src/ProductCatalogueAPI/Data/Database/DbConnectionFactory.cs`, `src/ProductManagerCore/ProductManagerGDB.cs` |
| Export                       | Local `s100compiler.exe`, feature catalogue, writable output configured inside the S-128 configuration record        | `src/ProductCatalogueAPI/Services/Export/ExportService.cs`, `src/ProductManagerCore/Settings.cs`                                                    |
| Optional automated detection | Disabled in supplied appsettings; when enabled, invokes export and SevenCs validation                                | `src/ProductCatalogueAPI/appsettings.json`, `src/ProductCatalogueAPI/Jobs/DetectProductChangesJob.cs`                                               |
| Process identity             | Must access configured files/databases, native licensing and writable log/temp/output/lock directories               | `src/ProductCatalogueAPI/Registrations.cs`, `src/ProductCatalogueAPI/Services/Locking/DatasetLockService.cs`                                        |

A conservative supported deployment should use one API/job execution host until cross-host concurrency is explicitly validated. The supplied file lock uses the machine's common application-data directory; it is not a distributed lock merely because Hangfire uses shared SQL storage. No claim of Linux, Docker, multi-host workers, or offline maps is made.

## 4. Readiness scorecard

| Audit area                           | Assessment                                                                                             | Findings           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------ |
| Branding and organization identity   | Production logo/favicon/title neutral; development settings and export identity still specific         | A02, A16, A20      |
| Frontend runtime/build configuration | Portal not externalized; API, branding and Locator URL already externalized                            | A01, A13, A19–A20  |
| Backend configuration                | File-based configuration exists; precedence/bootstrap/tool documentation incomplete                    | A02–A05, A11, A18  |
| Authentication/authorization         | Intentionally deferred in app; production ingress policy required                                      | A06                |
| IIS/hosting/reverse proxy            | Usable same-origin design; other topologies need explicit acceptance                                   | A05, A19           |
| ArcGIS/platform                      | Native Windows constraint is legitimate; acquisition/version/license verification outstanding          | A17, A23           |
| URLs/integrations                    | Active portal differs from dormant reference layer; optional SevenCs has fixed host                    | A01, A10, A15, A23 |
| Mock/sample data                     | Development source guards exist; Analyze also has production error fallback                            | A08–A09, A22       |
| Secrets hygiene                      | No confirmed secret found; internal paths, external credential formats and release hygiene need review | A06, A12, A16, A18 |
| Licensing/notices                    | Root license present; third-party and fixture redistribution not cleared                               | A07–A08, A23       |
| Build/reproducibility                | Lock present; native/tool/feed/database prerequisites and publish procedure incomplete                 | A03, A05, A14      |
| Documentation                        | Strong feature contracts; no complete third-party deployment runbook                                   | A05, A15           |
| Telemetry/logging/privacy            | No explicit analytics integration found; logs and external map/search traffic need disclosure          | A12, A23           |
| Portability                          | Windows/x64 is supportable; organization-owned metadata and bootstrap remain material barriers         | A02–A03, A17–A19   |

## 5. Detailed evidence-backed findings

### A01 — Active ArcGIS portal requires a source edit

- **Category:** Frontend configuration / external integrations. **Readiness:** Blocker. **Change type:** Frontend. **Impact:** High for using an organization's own portal infrastructure.
- **Evidence:** `src/ProductCatalogue/src/shared/config/arcgisConfig.js`, `configureArcGIS`; `src/ProductCatalogue/src/app/initUI.js`, call to `configureArcGIS`; `src/ProductCatalogue/src/features/map/core/createMap.js`; `src/ProductCatalogue/src/features/themes/basemapTheme.js`.
- **Current behavior:** Startup assigns `esriConfig.portalUrl` to an organization host. Basemap setup uses `topo-vector`, then theme identifiers `arcgis/topographic` / `arcgis/dark-gray`. There is no existing environment input for the portal or these basemap choices.
- **Effect:** Replacing the portal requires editing application source. Which requests the SDK resolves through that portal versus other Esri services requires a browser trace; this report does not claim every basemap request uses that host.
- **Disposition:** Externalize the portal through the existing frontend build configuration boundary. Specify supported basemap selection and failure behavior without changing Map/MapView architecture. Verify with a non-GST portal and record actual browser destinations. Do not add a runtime configuration fetch merely to solve this.

### A02 — Active export serialization assumes Danish producer identity and datum

- **Category:** Backend domain configuration. **Readiness:** Blocker. **Change type:** Backend. **Impact:** High for correct exports belonging to another producer.
- **Evidence:** `src/ProductManagerCore/ProductManagerGDB.cs`, `CreateDatasetAsync` assigns `verticalDatum = "Baltic Sea Chart Datum 2000,44"` and constructs feature FOIDs with producer `110`; `src/ProductCatalogueAPI/Services/Export/ExportService.cs`, `CreateS100Export` strips `101DK00` when naming its expected index; `src/ProductCatalogueAPI/Services/Operations/ExportOperationService.cs`, `ExecuteNewEditionAsync` reaches these paths.
- **Current behavior:** Export metadata and index-name expectations embed deployment/domain choices. They are not FI-017 visual branding. The GDB create-product method also assigns `agencyResponsibleForProduction = "Danish Geodata Agency"`, but `src/ProductCatalogueAPI/Controllers/ElectronicProductsController.cs`, `CreateElectronicProduct`, returns 501 before calling it. `ProductManagerREST.cs` has similar literals but is not the API's registered implementation.
- **Effect:** Another producer cannot reliably obtain its correct output solely by supplying its own database path. The exact index naming contract must be checked against the compiler; do not replace the string blindly.
- **Disposition:** Have domain/tool owners identify authoritative producer, datum and index naming inputs. Prefer Product/data-owned datum where appropriate, rather than an indiscriminate global frontend option. Add validated backend/core settings only for genuine deployment defaults. Preserve existing output for the accepted deployment, wire identities, and disabled create-product behavior. Do not activate the parked endpoint as part of neutrality work.

### A03 — Required database bootstrap is not reproducible from the supplied contract

- **Category:** Data provisioning. **Readiness:** Blocker. **Change type:** Deployment/configuration. **Impact:** High for a clean installation.
- **Evidence:** `src/ProductCatalogueAPI/Data/Repositories/ProductRepository.cs` reads/writes `dbo.JobTable` and `dbo.JobRunState`; `src/ProductManagerCore/ProductManagerGDB.cs`, `InitializeAsync`, opens a `configuration` table, queries `upper(ps) = 'S-128.NuvionPro' AND code = 'ProductCatalogue'`, deserializes `json`, then reads `surface`/bindings. Export uses `featuretype`, `informationtype`, attachment and geometry data. `src/ProductManagerCore/Settings.cs` defines `Connections`, `ProductSpecification`, `ConnectionFile`, `OutputFolder`. `src/ProductCatalogue/BACKEND_CONTRACTS.md` discusses existing database boundaries but does not supply a new-install schema/provisioning procedure.
- **Current behavior:** SQL state and geodatabase schemas/data already have to exist. No complete schema bootstrap, migration set or externally obtainable schema package contract was found in the archive or relevant documentation. The dotnet-ef tool manifest does not establish an EF migration workflow; the inspected application repository uses Dapper SQL.
- **Effect:** Guessing DDL from SELECT/INSERT statements cannot establish constraints, indexes, field types, geometry/topology requirements or valid seed data. Copying organization databases is not a reproducible third-party installation method.
- **Disposition:** DBA and core/schema owners must provide a versioned provisioning contract or approved external provisioning tool/package, including clean synthetic seed data, configuration JSON, schema compatibility and upgrade ownership. Preserve `S-128.NuvionPro` as an existing persisted contract unless a separate migration is approved; its spelling alone is not a defect.

### A04 — Backend configuration precedence undermines ordinary overrides

- **Category:** Backend configuration loading. **Readiness:** Required before public release. **Change type:** Backend. **Impact:** High operational configuration risk, with an existing file-based workaround.
- **Evidence:** `src/ProductCatalogueAPI/Program.cs`, `WebApplication.CreateBuilder(args)` followed later by explicit `AddJsonFile("appsettings.json", ...)` and `AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", ...)`.
- **Current behavior:** The code appends JSON sources after builder defaults rather than merely using the defaults. For keys in those files, ordinary environment/command-line providers are no longer necessarily the final source. This is a static configuration-order conclusion, not an executed .NET probe. `Environment.GetEnvironmentVariable` reads such as `log_path` are separate.
- **Effect:** A deployment may supply overrides yet retain the committed network paths. A deployment-owned environment JSON file is possible; the risk is undocumented precedence, not a total lack of configuration.
- **Disposition:** Establish and test one explicit precedence contract, preserving supported file-based secret inputs. Document restart behavior: `reloadOnChange` does not reconstruct an already initialized ArcGIS manager, Hangfire storage, or captured singleton settings. Require a restart for connection/tool changes unless a later design deliberately supports reload.

### A05 — Build, native acquisition and publish instructions are incomplete

- **Category:** Reproducibility/documentation. **Readiness:** Required before public release. **Change type:** Cross-cutting. **Impact:** High for independently reproducing an installation.
- **Evidence:** `src/ProductCatalogue/README.md`, Build and formatting; `README.md`, Project Structure; both application/core `.csproj` files; `Nexus.slnx`; `src/ProductCatalogue/package.json` and `package-lock.json`; `src/ProductCatalogueAPI/Services/Export/ExportService.cs`.
- **Current behavior:** Frontend README lists format/build/check but no complete clean-install/prerequisite procedure. Root README describes an abstract structure different from the actual projects. API/core target .NET 10 Windows, not the older stack remembered elsewhere. ArcGIS assemblies use traversal-based `HintPath` values ending in `Program Files/ArcGIS/Pro/bin`. Core declares x64 and Debug configuration; solution maps core to Debug. No root SDK pin, NuGet source configuration, NuGet lock, or tracked publish profile was found. The API references an untracked `.pubxml.user` path, not a usable publish procedure.
- **Tool details:** Active S-101 export starts `C:\Program Files\s100compiler\s100compiler.exe` and expects `ArtifactsPath/101_FC_2.0.0.xml`. That catalogue exists under `artifacts/Product Files`. The API's separately copied `101_Feature_Catalogue_2.0.0.xml` is not the active file selected by the service. S57 compiler/mapper paths occur in `CreateS57Export`; its controller call is behind the early 501 return in `NewUpdate`, so these are not requirements for the supported manual S-101 Edition operation.
- **Effect:** A fixed tool install location can be a supported constraint, but acquisition, compatible versions, output layout and service-license requirements are not established here. Missing SDK pin/locks alone do not prove a build fails.
- **Disposition:** Publish a narrow Windows/x64 build/deploy contract with exact tested prerequisites, public/authenticated feed requirements, compiler version and feature catalogue pairing. Either document fixed tool locations or introduce validated overrides in a bounded backend package. Verify solution and direct-project Release publishing on the supported host; do not infer success from project metadata.

### A06 — Application authorization is intentionally open/deferred

- **Category:** Authentication/security. **Readiness:** Required before public release. **Change type:** Security. **Impact:** High before exposing an operational deployment.
- **Evidence:** `src/ProductCatalogueAPI/Program.cs`, disabled Authorization region and active middleware; all five files in `src/ProductCatalogueAPI/Controllers` carry `AllowAnonymous`; `src/ProductCatalogueAPI/Properties/launchSettings.json`; `src/ProductCatalogue/src/shared/api/apiClient.js`.
- **Current behavior:** Negotiate registration, policy-file loading and group policies are commented. Middleware calls do not by themselves establish those policies. Mutation/read controllers allow anonymous access. IIS Express launch settings enable Windows authentication and disable anonymous authentication, but they do not configure production IIS or direct Project launches. Browser fetch uses `credentials: "include"`; this is not proof of backend impersonation or delegated credential forwarding. Swagger is enabled in all environments. The Hangfire dashboard uses default options without an application-supplied authorization filter; its effective behavior must be verified rather than called publicly open.
- **Effect:** Authentication is a production-security requirement, not a prerequisite for publishing source or a reason to require every deployment to join the original domain. An external access boundary may protect a deployment, but it must actually cover all API mutations and management surfaces, with no bypass route.
- **Disposition:** Security/application owners choose the supported access model and trust boundary before a production-ready release claim. Test anonymous/authorized/unauthorized behavior, direct API bypass, management access, identity attribution and, for ambient browser credentials, request-forgery protections. Do not simply uncomment the old policies or implement a new auth system in FI-018A.

### A07 — Root license exists; redistribution obligations are not inventoried

- **Category:** Licensing/notices. **Readiness:** Required before public release. **Change type:** Licensing/legal verification. **Impact:** Release approval gate.
- **Evidence:** root `LICENSE` contains MIT No Attribution text and a 2025 S-100 Horizon copyright; `src/ProductCatalogue/package-lock.json` records Esri package licenses by reference to package license files; API/core `.csproj` files reference external packages and installed ArcGIS assemblies. `src/ProductCatalogue/src/main.js` imports Bootstrap/Calcite CSS and components. `index.html` and the neutral SVG establish the application asset entry points.
- **Current behavior:** A root license is present. No Product Catalogue-specific license or consolidated third-party redistribution notice was found. A separate application license is not inherently required if root coverage is confirmed. The archive does not include installed npm/NuGet license texts or a resolved backend dependency graph. No independently supplied webfont was found in application styles; dependency-provided fonts/icons still need review. `public/vite.svg` is a public output asset even though it is not the selected favicon; `src/ProductCatalogue/src/javascript.svg` is not imported by the inspected entry graph.
- **Effect:** The root license is not evidence of permission to redistribute all dependency code, vendor assets, native tools or data.
- **Disposition:** **External verification required.** Repository license owner and license/legal reviewers must confirm coverage, package notices, asset attribution and what may be redistributed versus separately installed. Retain useful provenance; do not erase IHO producer/contact metadata as if it were deployment branding.

### A08 — Committed geographic samples need provenance clearance

- **Category:** Mock/sample data. **Readiness:** Required before public release. **Change type:** Licensing/legal verification. **Impact:** Publication gate independent of runtime exposure.
- **Evidence:** `src/ProductCatalogueAPI/mock/products.geojson` has 145 features; `src/ProductCatalogueAPI/mock/some_products.geojson` has 17. Parsed properties include `datasetName`, `edition`, `update`, `status` with Danish-style identifiers and polygon geometry. `src/ProductCatalogueAPI/ProductCatalogueAPI.csproj` copies both files. `src/ProductCatalogueAPI/Program.cs` serves them only in Development. `src/ProductCatalogue/src/features/dataSources/config/dataSourceRegistry.js` applies development identity normalization. `artifacts/products.geojson` and `artifacts/some_products.geojson` are additional archived sample candidates; no direct runtime consumer was established for these copies.
- **Current behavior:** Files contain plausible chart extents and operational identifiers; there is no per-fixture provenance/license declaration. Synthetic frontend names do not change the origin of coordinates. `demoDashboardData.js` and `analyzeApi.js` contain dated sample report/status content.
- **Effect:** Development guards do not make files safe to publish or redistribute. Realistic appearance also does not prove confidential provenance.
- **Disposition:** **External verification required.** Data owner must approve each fixture and catalogue/mapping asset or replace it with demonstrably synthetic/approved data. Record generation/source, rights and intended use. Do not include live production snapshots or infer a license from Git tracking.

### A09 — Analyze can use mock content after production API failure

- **Category:** Production/development separation. **Readiness:** Required before public release. **Change type:** Frontend. **Impact:** Medium/high for truthful third-party operation.
- **Evidence:** `src/ProductCatalogue/src/features/analyze/api/analyzeApi.js`, `fetchCompatibilityAnalyzeProduct`, `createMockAnalyzeProduct`; `src/ProductCatalogue/src/features/analyze/core/initAnalyzePage.js`, `showMockWarningIfNeeded`; `src/ProductCatalogue/src/features/analyze/ui/analyzeSidebar.js`, `loadError` handling.
- **Current behavior:** The deliberate mock toggle is `DEV && false`, but the request catch unconditionally constructs mock geometry, status and report content for a resolved compatibility Product, sets `isMock` and `loadError`, and normalizes it as loaded. The UI does warn that mock Analyze data is used and includes a load warning. This is not a silent fallback, nor is it guarded to Development.
- **Effect:** A misconfigured/unavailable backend can show plausible synthetic Product content in production, complicating deployment acceptance. This is separate from intentional development-only Paper Charts/S-102 sources.
- **Disposition:** In a bounded follow-up, define a truthful failed/unavailable model for production load failures while preserving source resolution, routing and existing useful data for other Products. Keep any allowed mock workflow explicit and development-only. Test API failure for a resolved compatibility Product; do not change FI-019 routes or introduce new mutation ownership.

### A10 — Optional detection job has unsafe-to-assume operational defaults

- **Category:** Scheduled operation configuration. **Readiness:** Deferred / external dependency. **Change type:** Backend. **Impact:** Conditional: high if automation is enabled; not a manual-export blocker when disabled.
- **Evidence:** `src/ProductCatalogueAPI/appsettings.json`, `EnableDetectProductChanges = false`; `src/ProductCatalogueAPI/Program.cs`, recurring registration with `Cron.Daily(23)` despite an hourly log message; `src/ProductCatalogueAPI/Jobs/DetectProductChangesJob.cs`, `initialImportDate`, SevenCs catch branches and `IsNewEdition`; `src/ProductCatalogueAPI/Services/SevenCs/SevenCsService.cs`.
- **Current behavior:** First execution seeds 2026-04-12 and performs no scan. SevenCs validation exceptions can still mark an export successful. The service host is hardcoded. `IsNewEdition` currently always returns true. Disabling the registration flag does not call recurring-job removal, so it does not establish removal of an already persisted job.
- **Effect:** An operator cannot interpret this as a generally ready automated validation/delivery workflow. `Cron.Daily(23)` does not establish a documented local timezone or hourly schedule. Manual Edition through `ExportOperationService` does not invoke SevenCs.
- **Disposition:** Keep automation outside the initial supported third-party feature set unless domain/operations owners approve its watermark, schedule, failure policy and validation behavior. Document removal/disable procedures for persisted jobs. If supported later, externalize endpoint/schedule/bootstrap inputs and verify outage behavior; do not migrate worker execution or add live delivery in this audit.

### A11 — ArcGIS startup errors can surface later as dependency failures

- **Category:** Configuration diagnostics. **Readiness:** Recommended. **Change type:** Backend. **Impact:** Medium operational diagnosability.
- **Evidence:** `src/ProductCatalogueAPI/Registrations.cs`, `AddS100ProductCatalogue` wraps Host initialization, path validation and manager creation in a catch that logs and returns; `src/ProductCatalogueAPI/Program.cs` proceeds with service registrations and host build.
- **Current behavior:** A native license/database initialization failure does not directly terminate this registration method. Dependent services may fail later because the manager was never registered; actual timing depends on host validation/resolution.
- **Disposition:** Add a clear startup readiness/failure contract in later work with safe messages identifying the prerequisite class. Preserve underlying diagnostics in restricted logs; test missing files/license/invalid schema on the supported platform. No failure was reproduced in this container.

### A12 — Logs and browser persistence require an operational privacy contract

- **Category:** Telemetry/logging/privacy. **Readiness:** Recommended. **Change type:** Cross-cutting. **Impact:** Medium for retention, access and shared-browser use.
- **Evidence:** `src/ProductCatalogueAPI/Program.cs`, Serilog sinks and `log_path`; `Registrations.cs`; `Services/Export/ExportService.cs`; `Controllers/ExportController.cs`; `Data/Repositories/ProductRepository.cs`, `owner`; `Jobs/ExportOperationJob.cs`; `CustomExceptionHandler.cs`; `src/ProductCatalogue/src/features/products/services/productJobService.js`; `src/ProductCatalogue/src/features/map/state/mapViewpointPersistence.js`.
- **Current behavior:** Logs include machine, user where available, Product/job/correlation identifiers, network/local paths, compiler command line/stderr and exception detail. Local file sinks have infinite rolling interval and one retained file; this does not set a size cap. Optional central logs use `log_path`, append `productmanager.dev/Logging/<machine>`, and retain 365 daily files. The missing-variable warning incorrectly names `serilog_path`. Browser storage retains active job records, map viewpoint and preferences, with same-origin cross-tab synchronization. No explicit application analytics/export telemetry SDK was found in scoped code/manifests.
- **Balanced evidence:** `CustomExceptionHandler` returns generic ProblemDetails without raw exception detail. General job failures store safe public messages in `ExportOperationJob`; the status service uses those messages. Restricted server/Hangfire diagnostics still contain raw exceptions. No claim is made that those internal diagnostics are automatically public.
- **Disposition:** Document writable paths, rotation/retention, access roles, identifier sensitivity and browser storage/reset behavior. Correct logging-variable guidance and consider configurable central subdirectory/retention. Privacy owner must approve external Locator queries and browser map/resource traffic, which are functional integrations rather than evidence of an analytics system.

### A13 — Geographic defaults remain region-specific

- **Category:** Frontend deployment defaults. **Readiness:** Recommended. **Change type:** Frontend. **Impact:** Medium for deployments serving other areas.
- **Evidence:** `src/ProductCatalogue/src/features/map/core/createView.js`, center `[10.3, 56]` and zoom 6; `src/ProductCatalogue/src/features/map/locator/locatorSourceRegistry.js`, `LOCATOR_SOURCE_COUNTRIES = ["DNK", "GRL"]`, categories and provider; `locatorWorldGeocoder.js` and `locatorSearchSources.js`.
- **Current behavior:** The Locator endpoint is configurable and fails closed when missing/invalid; country/category/provider semantics are code-defined. The source calls World-Geocoder-shaped `suggest` and `findAddressCandidates` operations and sets `forStorage: false`. URL configurability does not promise compatibility with any arbitrary geocoding service. Initial map region is overridden when a valid persisted viewpoint is restored.
- **Disposition:** Keep the accepted DK/GL behavior as default. If broader geography is part of release scope, expose validated region/default-view inputs through the existing build boundary; preserve one logical Places source, stale-operation guards and Product search separation. This is not by itself a blocker for an organization deploying the supported geographic scope.

### A14 — Frontend install includes a Windows-only dependency without an identified consumer

- **Category:** Build portability. **Readiness:** Recommended. **Change type:** Frontend. **Impact:** Conditional build-platform restriction.
- **Evidence:** `src/ProductCatalogue/package.json` lists `express` and `node-expose-sspi`; `package-lock.json` records `node-expose-sspi` 0.1.60 with `os: ["win32"]`. Scripts are Vite/Node/lint/format commands; scoped import searches found no application consumer of either server package.
- **Current behavior:** A non-optional Windows-only dependency is in the frontend installation graph even though the inspected frontend is a static client application. No non-Windows npm install was attempted.
- **Disposition:** Either document Windows as the frontend build prerequisite or confirm and remove unused server dependencies in a bounded package. This is not evidence that the supported Windows build fails. Any later manifest/lock updates must be generated through npm by the maintainer; no lockfile is hand-edited here.

### A15 — Dormant organization URL and incomplete documentation entry point

- **Category:** Optional polish / unused integration. **Readiness:** Recommended. **Change type:** Documentation. **Impact:** Low; not an active map-service blocker.
- **Evidence:** `src/ProductCatalogue/src/features/map/config/referenceLayerConfigs.js` contains a GST chart-service URL; `src/ProductCatalogue/src/features/map/layers/addReferenceLayers.js` imports it. Search and inspection of `src/ProductCatalogue/src/app/initMap.js` and entry imports found no caller of `addReferenceLayers`. `src/ProductCatalogue/src/features/layout/services/navbarLoader.js`, `initializeDocumentationButton`, opens `#`.
- **Current behavior:** The reference-layer code exists but is not wired into the current app; the Documentation button does not open a deployment help document. Root `README.md` has a maintainer contact at the original organization, not a runtime support address.
- **Disposition:** Document dormant status and either retain deliberately or remove in separately reviewed cleanup; externalize the service if it is later enabled. Link the help button to useful neutral/deployment-owned documentation if desired. Maintainer attribution/contact is acceptable when accurate and approved; it does not require automatic removal.

### A16 — Development environment is organization-branded and ignore rules are partial

- **Category:** Development-only assumptions / configuration hygiene. **Readiness:** Recommended. **Change type:** Deployment/configuration. **Impact:** Low for production, medium for a clean developer experience.
- **Evidence:** `src/ProductCatalogue/.env.development` configures localhost API, `/branding/Logo.png`, organization alt text and `/branding/Favicon.png`; `.env.production` only configures API and Locator; `.env.example` has neutral branding. `.gitignore` excludes `*.local`, API `config`, specific connection files and `appsettings.Development.json`, but `*.env` is not a general `.env.*` rule. Tracked development/production files are present.
- **Current behavior:** The development URL may fail and use fallback; its alt/config remain organization-specific when the custom image works. `VITE_DEV_API_TARGET` exists but `vite.config.js` contains no proxy consuming it, consistent with the example's reserved-for-future comment. `mkcert` is a development certificate integration, not a production certificate provisioning contract.
- **Disposition:** Use neutral tracked examples/defaults and local override files for deployment branding. Document that all Vite inputs are public and ignored files are not automatically removed from Git history. Expand targeted hygiene patterns only where warranted; do not label paths as passwords.

### A17 — Windows/x64 and native ArcGIS are legitimate supported constraints

- **Category:** Portability. **Readiness:** Acceptable deployment assumption. **Change type:** Infrastructure/admin. **Impact:** Hard platform boundary, not an organization defect.
- **Evidence:** API/core `.csproj` targets and x64 core platform; `src/ProductCatalogueAPI/Registrations.cs`, `Host.Initialize(...ArcGISPro)`; native compiler process in `Services/Export/ExportService.cs`.
- **Disposition:** Explicitly support a verified Windows/x64 deployment, installed native dependencies and appropriate identity/license provisioning. Do not advertise Linux or replace ArcGIS to achieve FI-018. IIS is one hosting choice; the native dependency is the stronger platform constraint. See A23 for unresolved vendor/runtime compatibility.

### A18 — External connection files and database-owned paths are acceptable configuration

- **Category:** Backend configuration / secrets. **Readiness:** Acceptable deployment assumption. **Change type:** Deployment/configuration. **Impact:** Infrastructure provisioning requirement.
- **Evidence:** `src/ProductCatalogueAPI/appsettings.json`, `Connections:HangfireConnection`, `Connections:SystemConnection`, `Connections:S128Connection`, `ArtifactsPath`; `Program.cs`; `Data/Database/DbConnectionFactory.cs`; `Registrations.cs`; `src/ProductManagerCore/Settings.cs` and `ProductManagerGDB.InitializeAsync`.
- **Current behavior:** Connection settings point to files; SQL text is read from external files. `.sde` and `.gdb` are explicitly supported by the registration/core code. Source connection URIs and export `OutputFolder` are loaded from database JSON. Paths do not have to be the committed organization's UNC paths. `Policies` is currently inactive.
- **Disposition:** Keep the boundary, supply safe examples, and document file formats, credential sensitivity, ACLs, backup and process identity. Correct precedence under A04. Do not turn SQL table names, Product specification names or API routes into arbitrary frontend variables. Local paths can avoid UNC/domain requirements if the separately supplied databases/licensing support that topology.

### A19 — Same-origin API and SPA fallback are supported topology choices

- **Category:** Hosting/base paths. **Readiness:** Acceptable deployment assumption. **Change type:** Deployment/configuration. **Impact:** Requires correct web-server mapping.
- **Evidence:** `.env.production`, `src/ProductCatalogue/src/shared/api/apiClient.js`, `public/web.config`, `src/ProductCatalogue/src/shared/routing/workspaceRoute.js`, `src/ProductCatalogue/src/app/routing/appRoute.js`, `src/ProductCatalogue/src/features/layout/services/navbarLoader.js` under `src/ProductCatalogue`; `src/ProductCatalogueAPI/Program.cs` and controller route attributes.
- **Current behavior:** Production selects `/api`. Missing API input instead falls back to origin root. API route attributes use controller-level paths without a universal `/api` prefix, so the host must mount/route the prefix. Frontend URLs/navbar/workspace routes consume Vite `BASE_URL`. IIS fallback excludes real files/directories and API paths; a duplicate `electronicproducts` condition is harmless polish. The API root redirect hardcodes `/api/swagger`. Release code has no configured CORS policy; the localhost policy is `#if DEBUG`. No explicit forwarded-header/path-base setup appears in Program.
- **Disposition:** Document and verify one same-origin mapping and SPA fallback, including query preservation, static assets, `/dashboard` versus API `/dashboard`, HTTPS and API error responses. A deployment may use a frontend subpath with the existing build base and a separate API base. Do not claim arbitrary reverse proxies or relative `./` deep-link deployment is verified. Cross-origin production, alternate API mount points and TLS-termination behavior require explicit later configuration/validation. The supplied IIS rewrite module is a host prerequisite; IIS branding virtual directories and UNC storage are optional.

### A20 — FI-017 branding boundary and neutral production assets are complete

- **Category:** Branding. **Readiness:** Acceptable deployment assumption. **Change type:** Deployment/configuration. **Impact:** No new runtime work required.
- **Evidence:** `src/ProductCatalogue/index.html`, `public/components/navbar.html`, `src/ProductCatalogue/src/assets/product-catalogue-logo.svg`, `src/ProductCatalogue/src/shared/config/brandingConfig.js`, `src/ProductCatalogue/src/app/startApp.js`, `src/ProductCatalogue/src/features/layout/services/navbarBranding.js`, `faviconBranding.js`, `.env.production` and README Branding configuration.
- **Current behavior:** Product Catalogue title/alt and neutral source-owned SVG are defaults. Logo/alt/favicon are independent non-secret build inputs. URLs support app-relative, origin-relative and HTTP(S); invalid inputs select fallback. Image error recovery is bounded. Favicon recovery depends on browser error events, as documented. No runtime GST logo is selected in the production profile.
- **Disposition:** Preserve FI-017. A rebuild for changed configuration is acceptable; replacing bytes at an unchanged image URL is a browser/server cache matter. Do not add a runtime settings service for branding. See A16 for the distinct development profile and A07 for asset ownership verification.

### A21 — Dashboard timezone is an explicit cross-stack contract

- **Category:** Backend/API contract. **Readiness:** Acceptable deployment assumption. **Change type:** Cross-cutting. **Impact:** Documented geographic limitation, not a standalone frontend defect.
- **Evidence:** `src/ProductCatalogue/src/features/dashboard/domain/dashboardRange.js`, `DASHBOARD_TIME_ZONE`; `src/ProductCatalogueAPI/Controllers/ElectronicProductsController.cs`, `DashboardTimeZoneId` and endpoint documentation; `Services/Dashboard/DashboardQueryProcessor.cs`; `Models/ResponseTypes.cs`.
- **Current behavior:** Offset-free/date-only values are interpreted in `Europe/Copenhagen`; frontend guidance explicitly says Danish time. Both sides agree.
- **Disposition:** Document the supported semantics. If the release must use each organization's timezone, approve a coordinated API/UI contract package with DST/date-boundary verification. Do not expose a frontend-only timezone switch that changes query meaning against the existing backend. Keeping this stated contract is sufficient for initial readiness.

### A22 — Source contracts, delivery and worker migration remain separate work

- **Category:** Backend/external roadmap. **Readiness:** Deferred / external dependency. **Change type:** Cross-cutting. **Impact:** Limits supported feature set; does not block release of the supported compatibility application.
- **Evidence:** `src/ProductCatalogue/src/features/dataSources/config/dataSourceRegistry.js`; `src/ProductCatalogueAPI/Configuration/SendToIcEncOptionsValidator.cs`; `Controllers/LookupController.cs`; `Jobs/UploadSingularProductJob.cs`; `src/ProductCatalogue/BACKEND_CONTRACTS.md`; `src/ProductCatalogue/docs/be-106-external-worker-readiness.md`; `src/ProductCatalogueAPI/Program.cs`.
- **Current behavior:** Separate authoritative S-57/S-101 sources are unavailable. Paper Charts/S-102 are development mock providers, guarded in frontend and backend. Send mode only permits Disabled/Simulation; Live is rejected. API hosts Hangfire Server. Graph/mail registration and implementation are commented, not a required tenant/mailbox integration.
- **Disposition:** State those limitations in release scope and preserve fail-closed source contracts. Do not invent live Send, report services, new Product-source endpoints or a JobPlatform dependency. Assess any requested expansion separately from FI-018.

### A23 — Vendor access, service terms and deployment identities need external verification

- **Category:** External infrastructure and licensing. **Readiness:** Deferred / external dependency. **Change type:** Infrastructure/admin. **Impact:** Deployment acceptance depends on evidence outside this archive.
- **Evidence:** API/core `.csproj` package/native references; `Registrations.cs`, ArcGISPro initialization; frontend lock and ArcGIS configuration/Locator modules; SevenCs HTTP sign-in and version header in `Services/SevenCs/SevenCsService.cs`.
- **Current behavior:** Repository proves dependency use, not entitlement, registry availability, unattended-license suitability or service capacity. There is no frontend application-specific token/OAuth setup in the inspected map/Locator code. SDK behavior and authentication requirements of replacement services cannot be inferred from that absence.
- **Disposition:** **External verification required.** Administrators/vendor owners must confirm supported ArcGIS/.NET combination, license availability to the actual process identity, compiler acquisition, S100Framework feeds, database access and outbound map/Locator/service access. Privacy/license owners verify search/basemap usage and redistribution separately. Do not claim vendor terms or universal no-key operation from repository code alone.

### A24 — Public terminology and stable wire identities are not defects

- **Category:** Architecture preservation. **Readiness:** No issue. **Change type:** Documentation. **Impact:** Preserve compatibility.
- **Evidence:** `src/ProductCatalogue/src/features/data/api/exportApi.js`; `src/ProductCatalogueAPI/Services/Export/ExportTargetContract.cs`; `src/ProductCatalogue/src/shared/routing/workspaceRoute.js`; frontend README and BACKEND_CONTRACTS.
- **Current behavior:** S-101 UI maps to legacy `S100`; Cancel Export maps to rollback operations. Analyze/Review use canonical query routes. Product search and Locator remain separate. These are intentional boundaries.
- **Disposition:** Preserve these contracts and existing tests. FI-018 must not rename wire values or redo FI-019 routing in the name of neutrality.

## 6. Configuration and integration inventories

### 6.1 Configuration ownership

| Existing key/input                                               | Owner and timing                                                              | Classification                                | Required handling                                                                                                |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`                                              | Frontend build; production `/api`, development localhost; helper fallback `/` | Non-secret deployment configuration           | Same-origin preferred; configure API host mapping independently                                                  |
| `VITE_DEV_API_TARGET`                                            | Declared development/example input, no current proxy consumer                 | Safe example/default                          | Do not instruct operators that it enables a proxy                                                                |
| `VITE_ARCGIS_LOCATOR_URL`                                        | Frontend build; browser accesses service when used                            | Non-secret deployment configuration           | HTTP(S) GeocodeServer; blank/invalid fails closed; provider contract remains fixed                               |
| `VITE_APP_LOGO_URL`, `VITE_APP_LOGO_ALT`, `VITE_APP_FAVICON_URL` | Frontend build; images fetched by browser                                     | Non-secret deployment configuration           | Preserve FI-017; do not embed credentials in URLs                                                                |
| Vite `BASE_URL` / build `--base`                                 | Build and routing/static URL resolution                                       | Non-secret deployment configuration           | Validate deep links and assets under an absolute deployment path                                                 |
| `Connections:HangfireConnection`                                 | Startup; file containing SQL connection string                                | Potentially sensitive deployment detail       | Protect file contents as secrets where credentials are present; never publish values                             |
| `Connections:SystemConnection`                                   | Read by connection factory for SQL operations                                 | Potentially sensitive deployment detail       | File path is not itself a password; document ACLs and connection syntax without real values                      |
| `Connections:S128Connection`                                     | ArcGIS startup; `.sde` or `.gdb`                                              | Potentially sensitive deployment detail       | Protect enterprise connection files; provision required schema and access                                        |
| `ArtifactsPath`                                                  | Captured when export service is created                                       | Non-secret deployment configuration           | Supply required catalogue/tools contract; distinguish from export output                                         |
| S-128 `configuration` table, `json` column                       | Core startup; `Connections[]` and `OutputFolder`                              | Potentially sensitive deployment detail       | This is a table's JSON column, not a repository JSON file; document schema, URI and writable output requirements |
| `Policies`                                                       | Present in appsettings; reader commented                                      | Non-secret deployment configuration           | Do not advertise active authorization from this key                                                              |
| `EnableDetectProductChanges`                                     | Startup registration flag                                                     | Non-secret deployment configuration           | Default false; persisted recurring jobs require separate administration                                          |
| `SendToIcEnc:Mode`                                               | Options validated on startup                                                  | Safe example/default                          | Supplied Simulation; only Disabled/Simulation supported; no real delivery credentials required                   |
| `log_path`                                                       | Process environment read before host configuration                            | Potentially sensitive deployment detail       | Optional central directory; current subpath and retention are code-defined                                       |
| `productcatalogue_7cs_credentials`                               | Process environment when optional SevenCs authorization runs                  | Secret                                        | Encrypted credential payload, not a public frontend input                                                        |
| `productmanager_encryption_key`                                  | Process environment in `Configuration.GetKey`                                 | Secret                                        | Base64 AES key; keep separate and access-controlled                                                              |
| `Graph:*`, `MailImport:*`                                        | Options/stubs; application registration commented                             | Safe example/default in current empty options | No active Graph/EWS provisioning requirement; future credentials would be secret                                 |

`Configuration.cs` uses a zero IV and no authenticated-encryption tag in its custom AES helper. The report found no embedded key or ciphertext value. Security owners should review the credential-protection/provisioning approach before enabling SevenCs; an external encrypted value does not by itself establish a sound secret-management lifecycle. Do not generate production secrets in the repository or replace the secret mechanism opportunistically in this audit.

### 6.2 Material URL inventory

URLs below are non-secret literals or safe examples. Internal file paths are deliberately described by key/type rather than reproduced in full. A dependency registry URL is not an application backend.

| Literal or route family                                                                                     | Evidence                                                                                                              | Classification and activity                                                                                  | Disposition                                                                             |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `https://nuvion.gst.dk/portal_guest`                                                                        | `src/ProductCatalogue/src/shared/config/arcgisConfig.js`, invoked by `src/ProductCatalogue/src/app/initUI.js`         | Organization-specific service; active SDK configuration                                                      | A01: externalize                                                                        |
| `https://nuvion.gst.dk/arcgis/rest/services/S-57/S57_Danmark/MapServer/exts/MaritimeChartService/MapServer` | `src/ProductCatalogue/src/features/map/config/referenceLayerConfigs.js`; only imported by `addReferenceLayers.js`     | Organization-specific service; dormant helper in current app                                                 | A15: do not count as active dependency                                                  |
| `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer`                                       | `src/ProductCatalogue/.env.example`, `.env.development`, `.env.production`; Locator registry/request modules          | Public third-party service; configurable browser geographic search                                           | Preserve URL boundary; verify terms/access; external traffic includes entered text      |
| `topo-vector`, `arcgis/topographic`, `arcgis/dark-gray`                                                     | `src/ProductCatalogue/src/features/map/core/createMap.js`, `src/ProductCatalogue/src/features/themes/basemapTheme.js` | SDK basemap identifiers, not literal service URLs                                                            | Record resolved destinations through an actual browser trace; do not invent endpoints   |
| `https://sevencs.gst.dk:43222/api/`                                                                         | `src/ProductCatalogueAPI/Services/SevenCs/SevenCsService.cs`                                                          | Organization-specific service; used by optional detection job; `Accept-version: 1.5`, sign-in/bearer session | A10/A23: externalize before supported use; separate service entitlement                 |
| `/api`, `electronicproducts/...`, `export/...`, `jobs/...`, `lookup/...`, `upload/...`                      | Frontend API helpers under `src/ProductCatalogue/src/features/data/api`, `shared/api/apiClient.js`; API controllers   | Backend contracts; active paths relative to configured API base                                              | Preserve routes and payload contracts; configure hosting base, not each domain route    |
| `/Analyze?Datasets=...`, `/Review?Datasets=...`, `/dashboard`                                               | `src/ProductCatalogue/src/shared/routing/workspaceRoute.js`, `src/ProductCatalogue/src/app/routing/appRoute.js`       | Frontend routes                                                                                              | FI-019 complete; host preserves query on SPA fallback                                   |
| `/api/swagger`, `/swagger`, API `/dashboard`                                                                | `src/ProductCatalogueAPI/Program.cs`                                                                                  | API redirect/documentation/management paths; active                                                          | A06/A19: distinguish ingress mapping and access                                         |
| `https://localhost:7271`, `http://localhost:5290`, `http://localhost:14902`                                 | Frontend `.env.development`; API `Properties/launchSettings.json`                                                     | Development-only browser/API endpoints                                                                       | Document local certificate/profile setup; no public deployment blocker                  |
| `http://localhost:5173`, `https://localhost:5173`, `https://localhost:5174`                                 | `src/ProductCatalogueAPI/Program.cs`                                                                                  | DEBUG-only CORS origins                                                                                      | Do not treat as production allowlist                                                    |
| `/branding/Logo.png`, `/branding/Favicon.png`                                                               | `src/ProductCatalogue/.env.development`                                                                               | Development-owned asset URLs                                                                                 | Neutral local examples; no mandatory UNC mapping                                        |
| `#`                                                                                                         | `src/ProductCatalogue/src/features/layout/services/navbarLoader.js`                                                   | Documentation button placeholder                                                                             | Optional useful documentation target                                                    |
| `https://graph.microsoft.com/.default`                                                                      | `src/ProductCatalogueAPI/Services/Graph/GraphClientFactory.cs`                                                        | Commented implementation / authentication scope                                                              | Inactive; not an active external integration                                            |
| `https://outlook.office365.com/EWS/Exchange.asmx`, `shared-mailbox@contoso.com`                             | `src/ProductCatalogueAPI/Services/MailImport/MailImportOptions.cs`, `Services/Graph/GraphAuthOptions.cs`              | Documentation examples in inactive options                                                                   | Safe examples, not organization credentials                                             |
| `https://github.com/S-100-BlueStack/S100Framework`                                                          | `src/ProductManagerCore/ProductManagerCore.csproj`, `RepositoryUrl`                                                   | Package provenance metadata                                                                                  | Not proof of restore/feed availability                                                  |
| `https://binarybytez.com/understanding-clean-architecture/`                                                 | Root `README.md`                                                                                                      | Documentation reference                                                                                      | Not an application dependency                                                           |
| `https://iho.int/`, `http://registry.iho.int`, `https://schemas.s100dev.net/...`                            | `src/ProductCatalogueAPI/101_Feature_Catalogue_2.0.0.xml`, catalogue producer/definition/schema metadata              | Third-party standards provenance; XML namespace/schema references are not proof of network requests          | Preserve provenance; verify redistributability and compiler offline behavior externally |
| `registry.npmjs.org` resolution URLs                                                                        | `src/ProductCatalogue/package-lock.json`                                                                              | Build dependency metadata; 394 resolved entries                                                              | Not 394 deployment findings; allow restore and retain lock integrity                    |
| `https://cdn.example.org/...`, `http://localhost:8080/logo.svg`, example/test URLs                          | Frontend README and branding/routing tests                                                                            | Documentation/mock/test values                                                                               | No application deployment issue                                                         |

Report content in the active Analyze compatibility flow comes from the ProductCatalogueAPI payload, not an identified hardcoded report-server URL. The fallback XML is synthetic content (A09). Dashboard report IDs in `src/ProductCatalogue/src/features/dashboard/data/demoDashboardData.js` are sample metadata; `src/ProductCatalogue/src/features/dashboard/api/dashboardApi.js` requests the backend directly, and no import of the demo payload factory was identified. Report-contract gaps must remain backend work, not fabricated frontend URL configuration.

### 6.3 Dependency and license evidence

Frontend exact locked versions differ from broad package ranges. This is why the archive lock is authoritative for an installation audit.

| Frontend dependency        | Locked version | License metadata in lock / platform evidence   |
| -------------------------- | -------------- | ---------------------------------------------- | --- | ---------- | --- | ----- |
| `@arcgis/core`             | 5.0.15         | `SEE LICENSE IN LICENSE.md`                    |
| `@arcgis/map-components`   | 5.0.15         | `SEE LICENSE IN LICENSE.md`                    |
| `@esri/calcite-components` | 5.0.2          | `SEE LICENSE.md`                               |
| `bootstrap`                | 5.3.8          | MIT metadata                                   |
| `express`                  | 5.2.1          | MIT metadata; no identified application import |
| `node-expose-sspi`         | 0.1.60         | ISC metadata; `os: win32`                      |
| `vite`                     | 8.0.7          | MIT metadata; Node `^20.19.0                   |     | >=22.12.0` |
| `eslint`                   | 10.4.1         | MIT metadata; Node `^20.19.0                   |     | ^22.13.0   |     | >=24` |

These are repository metadata observations, not legal determinations or a declaration that every transitive engine requirement is satisfied. `package.json` also declares Prettier, ESLint supporting packages and `vite-plugin-mkcert`; release inventory must include build tooling where relevant. The current tested Node runtime for the narrow tests was 24.19.0, but a full locked installation/build was not performed.

| Backend project                                      | Direct PackageReference declarations                                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ProductCatalogueAPI/ProductCatalogueAPI.csproj` | Dapper 2.1.72; FluentFTP 54.1.2; Hangfire 1.8.23; Microsoft.AspNetCore.Authentication.Negotiate 10.0.10; Microsoft.AspNetCore.Mvc.Versioning 5.1.0; Microsoft.Data.SqlClient 6.1.4; S100Framework.Catalogues 3.1.14; S100Framework.YAML 3.7.1901.4; SharpZipLib 1.4.2; Swashbuckle.AspNetCore 8.1.4 |
| `src/ProductManagerCore/ProductManagerCore.csproj`   | S100Framework.ArcGIS.Core 3.7.1901.23; S100Framework.Catalogues 3.1.14; S100Framework.Catalogues.ProductSpecifications 3.1.10; S100Framework.REST 1.15.0; S100Framework.Topology 4.3.2; S100Framework.YAML 3.7.1901.4                                                                               |
| Native/reference dependencies                        | ArcGIS.Core and API ArcGIS.CoreHost from installed ArcGIS Pro; active external s100compiler executable                                                                                                                                                                                              |

Referenced versions do not prove the packages are publicly available or compatible with the deployed ArcGIS release. Serilog is used by code without a direct PackageReference in the two inspected project files; the restore graph must identify the transitive provider. Do not declare a missing-package build error without restore evidence.

## 7. Confirmed acceptable deployment assumptions

The following do not require an architectural rewrite:

- **Windows/x64/native runtime:** A17. Verify supported versions and licenses, then state the constraint.
- **SQL Server and schema contracts:** A03/A18. Publish a provisioning contract; do not make schema/table identifiers frontend settings.
- **Deployment-owned connection files, local paths or UNC paths:** A18. Document access and format. UNC/domain access is conditional on the chosen storage/authentication, not universally mandatory.
- **Build-time frontend settings:** A19/A20. Rebuild/redeploy for changed URLs/settings is a valid distribution model. Runtime configuration would permit one immutable build across environments, but would add loading, validation, caching, availability and versioning behavior. No evidence here requires that trade-off.
- **Same-origin `/api` and IIS SPA rewrite:** A19. One supported topology is enough; a browser logo URL does not require an IIS virtual directory or a network share.
- **Danish Dashboard time interpretation:** A21. It is an explicit coordinated contract; optional later internationalization must change both sides together.
- **Development Product sources and deferred live delivery:** A22. Document supported capabilities and retain fail-closed behavior.
- **S100/Rollback wire identities, FI-019 routes and separate search flows:** A24. Preserve them.

## 8. Security and secrets observations

| Classification                          | Observation                                                                                                                                                             | Action                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Committed secret                        | No confirmed credential value found in the bounded textual inspection/pattern scan of application/core/configuration and relevant artifacts                             | Do not interpret this as history clearance; release owner runs a history-aware secret scan and manually reviews flagged values |
| Potentially sensitive deployment detail | Internal UNC paths, database/host naming, organization identifiers and ignored connection filenames in `appsettings.json`, `.gitignore`, project/configuration comments | Decide disclosure policy; neutralize distributable examples where appropriate; these are not automatically credentials         |
| Non-secret deployment configuration     | API/portal/Locator URLs, image URLs, artifact/output paths, mode/schedule choices                                                                                       | Externalize genuine deployment choices and document precedence; never put credentials into Vite inputs                         |
| Safe example/default                    | Neutral SVG/title, `.env.example` branding, localhost launch URLs, empty Graph/EWS option values and Contoso examples                                                   | Preserve as examples, clearly separated from production configuration                                                          |
| Secret expected outside repository      | SQL connection-file contents when credential-bearing; enterprise connection files; SevenCs encrypted credentials and AES key                                            | Provision through a restricted mechanism, validate access, and document rotation without embedding values                      |

The scan checked credential assignment shapes, private-key markers and common token shapes without printing matched values. No such matches were reported in that scan. This does not cover binary connection-file internals, unavailable dependencies, remote configuration, entropy-only secrets or Git history. No credential files were downloaded, no credentials were tested and no production host was contacted.

Authentication (A06), diagnostics privacy (A12), credential-protection review and archive/data provenance need owners. If a later scan finds an actual committed secret, the response is revocation/rotation and controlled history remediation, not only changing an example file. No such secret is asserted here.

## 9. External verification and licensing/provenance list

Every entry in this section is **External verification required**. None is presented as a completed legal or infrastructure check.

| Item                   | Question to resolve                                                                                                                  | Proposed owner                            | Required evidence                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Baseline label         | Confirm the archive comment commit is the intended baseline and the supplied 64-character value is its archive hash                  | Repository owner                          | Confirmed commit/archive mapping                                                        |
| Application license    | Does root MIT No Attribution cover all owned Product Catalogue/core code and the neutral SVG?                                        | Repository/license owner                  | Written release/license scope                                                           |
| npm redistribution     | What notices/asset/font/icon requirements apply to the exact resolved packages and published bundle?                                 | License reviewer/build maintainer         | Resolved inventory plus vendor license texts and required notices                       |
| NuGet/S100Framework    | Are all exact packages obtainable by an external organization, from which feeds, and under which terms?                              | Package owners/build maintainer           | Successful authorized clean restore and license/provenance inventory                    |
| ArcGIS native          | Which installed version and license arrangement supports .NET 10, Windows/x64 and unattended hosting under the selected identity?    | ArcGIS administrator/vendor/license owner | Supported compatibility matrix and a service-identity startup test                      |
| Compiler               | Where is the compatible s100compiler obtained; what license, invocation/index/output contract and catalogue version does it require? | Compiler/domain owner                     | Versioned installation instructions and non-GST export validation                       |
| Geographic assets      | Can all fixture polygons/identifiers be redistributed, and are the neutral/vendor/sample assets owned or licensed?                   | Data/asset owners                         | Approval or synthetic replacement with provenance                                       |
| IHO/catalogue/mappings | May catalogue XML, constraints and mapping YAML be redistributed; what attribution/version conditions apply?                         | Catalogue/license owners                  | Per-asset provenance and approved distribution set                                      |
| Database bootstrap     | What exact state/geodatabase schema, seed configuration and permissions must exist?                                                  | DBA/core schema owner                     | Versioned provisioning package, safe seed, compatibility check and new-install evidence |
| Service access/privacy | What portal/basemap/Locator endpoints are actually contacted; what authentication, usage rights and privacy handling apply?          | GIS/network/privacy owners                | Browser request trace on intended deployment; terms/identity/firewall approval          |
| Production boundary    | Which host/ingress enforces user access, management restrictions and identity attribution?                                           | Security/IIS or reverse-proxy owner       | Negative/positive access tests with direct backend bypass checked                       |
| Optional automation    | Are SevenCs availability, licensing, watermark, validation-failure policy and schedule approved?                                     | Operations/domain/SevenCs owners          | Explicit enablement criteria or release exclusion                                       |

## 10. Documentation gaps and target deployment contract

A new installer should be able to follow one versioned guide instead of reconstructing prerequisites from feature history. Required sections:

1. Supported Windows/x64, .NET SDK/runtime/hosting and ArcGIS/native/compiler versions; frontend Node/npm range validated against the lock; acquisition and feed access.
2. Separate frontend and API build/publish procedures, artifact boundaries, expected output, checks and rollback. Explain `Nexus.slnx` configuration mappings and why optional development tooling is not a schema migration system.
3. Frontend configuration table including API base versus application base, build-time exposure, neutral branding, Locator provider/country scope, local HTTPS and unused `VITE_DEV_API_TARGET`.
4. Backend precedence, connection-file formats, geodatabase configuration JSON, actual `OutputFolder` ownership, artifact catalogue selection, restart requirements, and safe examples.
5. Database provisioning/compatibility contract, schema ownership and backups; do not publish inferred DDL as authoritative.
6. One tested topology: SPA fallback, `/api` forwarding/mount, HTTPS, query preservation, static assets, optional branding storage, error/management paths and process restart/recycle policy. If TLS terminates at a proxy, document verified forwarded-header trust and scheme behavior.
7. Least-privilege service identity: native license access, SQL/geodatabase rights, read access to configuration/catalogues, execute access to compiler and write access to output, temp, local/central logs and common-application-data locks. No requirement to use LocalSystem is established by the repository.
8. Job scope: in-process Hangfire, conservative single-host execution, simulation-only Send, detection disabled by default and removal of existing recurring jobs, licensing/availability checks and outage recovery.
9. Privacy/operations: browser-local data, Locator text sent to external services, map/resource destinations, log retention/rotation/ACLs, backups and incident diagnostics.
10. Release limitations, license/notices/fixture provenance and a non-GST acceptance checklist.

The root contact may remain as maintainer identity if approved. Correct the stale root project structure and misleading log/schedule guidance. Do not rewrite feature histories merely because their historical baseline labels differ from this audit.

## 11. Prioritized remediation plan

| Priority                                 | Outcome                                                                                                       | Finding coverage       | Gate                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------ |
| P0 — establish external inputs           | Confirm baseline, license/data ownership, package/native access and database provisioner                      | A03, A07–A08, A23      | Owners provide evidence; do not guess contracts                          |
| P1 — remove active organization bindings | Configurable portal; correct producer/datum/index inputs; predictable backend overrides                       | A01–A04                | Non-GST data/settings produce valid output without source edits          |
| P1 — define safe release behavior        | Access boundary, truthful Analyze failures, explicit excluded automation                                      | A06, A09–A10           | Operational security/failure tests and documented release scope          |
| P2 — reproduce installation              | Publish prerequisite/configuration/hosting/database/runbook package and demonstrate a clean supported install | A03, A05, A11, A17–A23 | Independent operator succeeds without undocumented organization material |
| P2 — release provenance                  | Approved fixture/assets, dependency inventory/notices, history-aware secrets review                           | A07–A08, A16, A23      | Release owner sign-off                                                   |
| P3 — improve convenience                 | Optional geography controls, unused dependency cleanup, help link, logging configuration                      | A12–A16                | Bounded regression tests; optional items may be explicitly deferred      |

A public source release may be accompanied by clear experimental limitations, but it must not be described as an independently deployable production-ready distribution until the P0/P1 and applicable P2 gates are met. This is a readiness recommendation, not a legal interpretation.

## 12. Proposed bounded follow-up packages

The IDs below are **proposals**, not existing tracker entries or accepted implementation tasks. No tracker status is changed. Each package needs a new authoritative implementation baseline. Findings are grouped into five packages; native/database/legal inputs can be gathered concurrently by their owners without expanding runtime scope.

### FI-018B — Frontend deployment configuration and truthful failure states

- **Scope:** A01, A09 and the agreed subset of A13/A15/A16. Externalize active portal and supported map deployment choices, preserve neutral branding and canonical routes, remove production Analyze mock fallback in favor of explicit failure. Make development examples neutral. Optional geography inputs retain DK/GL defaults.
- **Dependencies:** GIS owner specifies supported portal/basemap/provider behavior. Confirm whether broader geography is release scope. No new backend Product contracts.
- **Likely files/areas:** `src/ProductCatalogue/src/shared/config/arcgisConfig.js`; map creation/theme/Locator config; `src/ProductCatalogue/src/features/analyze/api/analyzeApi.js` and existing failure UI/tests; `.env.example`, `.env.development`, README. Dormant reference-layer code only if deliberately included.
- **Runtime behavior changes:** Yes: configuration-driven portal and production failure presentation. No source-architecture, popup-action or route redesign.
- **External/admin input:** Replacement GIS service access; allowed browser destinations; optional country/view defaults.
- **Verification:** Focused resolver/failure tests; `npm run check` on the supported environment; manual non-GST portal, missing config, API failure, independent Product failures, light/dark, keyboard, Locator closure/stale requests and base-path deep links.
- **Acceptance criteria:** No active GST endpoint is required by the frontend; production never presents generated mock Product content after API failure; FI-017/FI-019 and accepted Product workflows remain intact; build-time configuration documented. Test request behavior, not private ArcGIS DOM.

### FI-018C — Backend deployment and export metadata configuration

- **Scope:** A02, A04, A11 and the executable-location choice in A05. Establish config precedence and startup diagnostics; supply authoritative producer/datum/compiler inputs through backend/data boundaries. Retain existing contract identifiers.
- **Dependencies:** Domain/compiler owner validates FOID, vertical datum and index naming; database owner determines which values are Product-owned versus deployment defaults. Do not invent a new schema without owner approval.
- **Likely files/areas:** `src/ProductCatalogueAPI/Program.cs`, `Registrations.cs`, configuration/options and examples; `Services/Export/ExportService.cs`; `src/ProductManagerCore/Settings.cs`, active export serialization in `ProductManagerGDB.cs`. REST implementation is changed only if shared contract consistency actually requires it; parked endpoints remain parked.
- **Runtime behavior changes:** Yes, narrowly limited to validated configuration and export metadata inputs/startup failure behavior.
- **External/admin input:** Supported tool installation/version, compiler index behavior, producer authority, datum semantics, database configuration ownership and service license.
- **Verification:** Precedence tests for defaults/environment/command line/local JSON; missing/invalid startup input tests; baseline-equivalent exports and non-Danish producer/data exports verified by the domain/compiler owner; safe diagnostics; no wire/schema change without separate approval.
- **Acceptance criteria:** Another producer can configure correct supported exports and tool location policy without editing organization-specific source; old accepted output remains equivalent with corresponding config; overrides are deterministic; unsupported/missing inputs fail clearly.

### FI-018D — Production access and operational safeguards

- **Scope:** A06, A10, A12 and external-secret lifecycle documentation. Approve and implement only the selected production boundary, management exposure and logging behavior. Initially exclude automated detection unless its safety contract is explicitly accepted. Document persisted recurring-job disablement and single-host constraints.
- **Dependencies:** Security/operations/domain decisions first; backend config contract from FI-018C where shared. No automatic selection of Negotiate, OIDC or another auth system by this report.
- **Likely files/areas:** `src/ProductCatalogueAPI/Program.cs`, security/hosting configuration, selected controller authorization metadata only if required by the chosen design; `Jobs/DetectProductChangesJob.cs`, SevenCs configuration only if enablement is in scope; logging configuration/docs. External web-server policy may own much of the implementation.
- **Runtime behavior changes:** Conditional on access model; any authentication or scheduler change requires a separately accepted task scope. A documentation/ingress-first release can keep excluded automation disabled.
- **External/admin input:** Identity/trust model, user/group policy, ingress ownership, credential store/rotation, operational log retention, optional SevenCs failure policy.
- **Verification:** Anonymous/authorized/unauthorized requests; management routes; direct host bypass; attribution and ambient-credential request protections; dependency failure; recurring-job disablement in existing storage; log access/retention and secrets redaction.
- **Acceptance criteria:** Operational deployment has a tested access boundary; restrictions are not inferred from launchSettings or middleware names; no unapproved automation is presented as validated; secret provisioning and diagnostic access are documented. No worker migration or new delivery integration.

### FI-018E — Redistribution, sample provenance and dependency hygiene

- **Scope:** A07–A08 and A14/A16 where justified. Confirm licenses/notices, identify redistributable assets, approve or replace samples, review public examples and run a history-aware secrets check. Remove unneeded frontend Windows/server dependencies only after maintainer confirms no consumer.
- **Dependencies:** License/data/package owners; approved synthetic sample strategy. Dependency cleanup is optional if Windows frontend builds remain the supported constraint.
- **Likely files/areas:** root license/notices documentation; `src/ProductCatalogue` package manifest/lock only through maintainer npm commands; public/source assets; API mock GeoJSON; directly relevant catalogue/mapping artifacts; `.gitignore` and safe examples.
- **Runtime behavior changes:** Normally none; fixture/dependency changes must preserve development contracts. No new dependencies proposed by the audit.
- **External/admin input:** Package license texts, data/asset approvals, native redistribution permission versus separate installation, repository-history secret-review access.
- **Verification:** Approved manifest of shipped files and notices; provenance record; fixture normalization tests; clean locked restore/build on the declared OS after dependency edits; secrets scan reviewed without exposing values.
- **Acceptance criteria:** Every distributed asset/dependency has a documented disposition, no unauthorized live data/secrets are included, required notices accompany the release, and examples remain useful. Retaining the root license is acceptable when coverage is confirmed.

### FI-018F — Reproducible supported deployment and provisioning contract

- **Scope:** A03/A05 and accepted constraints A17–A23. Deliver one complete Windows/x64 installation and operating guide, authoritative database provisioning inputs, release limitations and a recorded independent deployment rehearsal.
- **Dependencies:** Schema/license/native/feed owners provide verified inputs; finalized FI-018B/C settings and FI-018D access model; FI-018E approved distribution set. Documentation can start earlier but verification uses the final candidate.
- **Likely files/areas:** root `README.md`; `src/ProductCatalogue/README.md` and a deployment guide under its docs; API configuration examples/build instructions; owner-supplied versioned schema/provisioning documentation or scripts only if explicitly authorized in that task. No unrequested database migration.
- **Runtime behavior changes:** No application runtime change. Approved provisioning/deployment artifacts may be added; existing database schemas are not redesigned.
- **External/admin input:** Clean supported Windows host, process identity, licensed tools, required feeds, SQL/geodatabase provisioning, test services and access to production-like IIS/ingress.
- **Verification:** A different operator follows the guide from a clean machine; frontend locked install/check/build, API restore/build/publish, database bootstrap, startup, SPA/deep links/assets/API, export/Cancel Export, simulation mode, error paths, logs/recycle/restart and rollback. Record actual commands, versions and results.
- **Acceptance criteria:** Supported third-party install succeeds using only published instructions plus explicitly listed external entitlements/configuration/data; no original-organization source edits or undocumented files are necessary. All limitations and excluded features are visible; overall FI-018 closure requires owner acceptance.

## 13. Verification performed and remaining verification

### 13.1 Commands/checks actually run

- `sha256sum upload/FI-018A-baseline-53ffebfe.zip`: computed the archive hash stated above.
- `unzip -z upload/FI-018A-baseline-53ffebfe.zip`: read Git archive comment.
- `unzip -q upload/FI-018A-baseline-53ffebfe.zip -d baseline`: extracted a scratch copy for read-only inspection.
- `rg --files --hidden`, targeted `rg -n`, `cat`, `sed`, and Python standard-library file/JSON/XML-text inspection: inventory, dependency references, configuration consumers, URL/authentication/mock/secret patterns and fixture counts. No dependency resolution or remote probes.
- `node --version`: `v24.19.0`.
- `npm --version`: `11.9.0`; emitted an environment warning about unknown `http-proxy` config. This is a container environment observation, not a repository defect.
- Tool availability check: `dotnet` not present; frontend `node_modules` not present.
- Existing dependency-free tests, from `src/ProductCatalogue`:

```bash
node --test src/shared/config/brandingConfig.test.js src/features/layout/services/navbarBranding.test.js src/features/layout/services/faviconBranding.test.js src/shared/routing/workspaceRoute.test.js src/features/map/locator/locatorSourceRegistry.test.js
```

Result: **84 tests passed, 0 failed, 0 skipped**. These validate narrow existing configuration/lifecycle/routing boundaries, not browser behavior, production hosting or a complete frontend/API build.

No `npm install`, `npm ci`, `npm run check`, Vite build, .NET restore/build/publish/test or database operation was run. Lack of container tooling/dependencies is not evidence that the repository fails to build.

Delivery validation additionally checks that archive extraction bytes remain identical, every explicitly backticked full file path in this document exists where applicable, the ZIP has exactly the requested new document, and the ZIP integrity/hash. These checks concern the audit artifact, not runtime readiness.

### 13.2 Local verification for later implementation packages

The normal frontend gate remains:

```powershell
cd src/ProductCatalogue
npm run check
```

For a clean dependency installation, the future runbook should use the committed lock (`npm ci`) on its declared supported OS and Node version before the above gate. That command is a proposed verification step, not an executed result. Backend publish/test commands must be finalized from a verified Windows/native toolchain and solution configuration. This audit deliberately does not present an untested publish command as authoritative.

## 14. Explicit non-goals

- No runtime implementation, dependency addition, cleanup, refactor, rename, schema change, tracker update or commit.
- No changes to FI-017 branding lifecycle or FI-019 canonical routing.
- No authentication-system selection/implementation, deployment publication, credential testing or live infrastructure change.
- No Linux/Docker migration, ArcGIS replacement, generic database abstraction or platform-agnostic promise.
- No new source/read/export/report contracts; no S100/Rollback wire renaming.
- No job platform/worker migration, distributed operation registry, live IC-ENC delivery or unrelated application audit.
- No legal opinion, vendor-license interpretation, exhaustive security assessment, vulnerability scan or full binary/dependency/history clearance.

## 15. Acceptance criteria for overall FI-018

Overall FI-018 can be considered complete only when the release owner has evidence that:

1. A named supported Windows/x64 architecture, exact tested prerequisite set and native acquisition/license path are documented and available to a third party.
2. A clean third-party installation can provision the required SQL/geodatabase contracts without copying undocumented organization infrastructure or guessing schemas.
3. Active portal/service choices and correct supported export producer/datum/tool inputs are supplied through documented configuration or data contracts, with no organization-specific source edits.
4. Backend override precedence and restart requirements are deterministic and verified; required files, directories and identities have clear safe examples and permissions.
5. Production access/management exposure is approved and tested, including direct backend access. Publishing source is not conflated with approval to expose an operational instance.
6. Production API failure does not substitute synthetic Analyze Product content; development fixtures remain clearly bounded. FI-017/FI-019, source isolation and existing accepted workflows pass their relevant checks.
7. Optional detection, live Send, unsupported sources/report workflows and future worker direction are either explicitly excluded or separately implemented and verified; no feature is implied merely by an option or service class.
8. Shipped dependencies/assets/catalogues/samples have reviewed license/provenance dispositions and required notices; a release/history secrets review is complete without exposing secret values.
9. Hosting, deep links, API routing, browser resource traffic, local/central logs, service identity, backups and restart/recycle/rollback behavior are verified on the supported topology.
10. A different operator demonstrates build, deployment and supported operation using only the published package/instructions and declared external inputs. Actual commands/results and unresolved accepted limitations are recorded.
11. Blockers and required findings are resolved or explicitly narrowed out of the supported release with owner-approved rationale; recommended items may remain documented deferrals. A scope exclusion must not hide a required part of the advertised workflow.
12. The owner separately accepts the completed FI-018 implementation packages and updates status. **This audit does not mark FI-018 Done.**

FI-018A is the evidence/design input to those decisions. The report is complete as an audit package; the implementation, external approvals and independent deployment rehearsal remain future work.
