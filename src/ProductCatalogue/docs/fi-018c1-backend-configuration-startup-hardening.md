# FI-018C1 backend configuration and startup hardening

## Scope

FI-018C1 implements the bounded backend hardening work for:

- A04 — standard ASP.NET Core configuration precedence;
- A11 — required ArcGIS/ProductManager startup failure handling;
- A05 — deployment configuration for the active S-101 compiler executable path.

FI-018C1 does not implement A02 producer, datum, FOID, index naming, signing, or other export-neutrality changes. It also does not implement the remaining FI-018F build, publish, dependency-acquisition, or deployment-runbook work.

## Configuration precedence

ProductCatalogueAPI uses the configuration composition created by `WebApplication.CreateBuilder`. For the deployment configuration sources relevant to FI-018C1, later sources override earlier sources in this order:

```text
appsettings.json
<
appsettings.{Environment}.json
<
environment variables
<
command-line arguments
```

The standard ASP.NET Core providers remain intact. In Development, standard user-secrets behavior from `WebApplication.CreateBuilder` also remains intact. FI-018C1 does not clear or reconstruct configuration sources and does not migrate existing direct environment-variable boundaries.

Nested configuration keys use double underscores in environment variables. For example:

```text
S100Compiler__ExecutablePath=C:\Tools\s100compiler\s100compiler.exe
```

The equivalent command-line override is:

```text
--S100Compiler:ExecutablePath=C:\Tools\s100compiler\s100compiler.exe
```

## Required ArcGIS/ProductManager startup

The S-128 connection is a required startup prerequisite. Startup now follows this boundary:

1. Read and validate `Connections:S128Connection` using only deterministic filesystem checks.
2. Require an existing `.sde` file or an existing `.gdb` directory.
3. Initialize ArcGIS CoreHost.
4. Initialize the ArcGIS-backed `ProductManagerGDB` and S-128 data source.
5. Register the resulting `IProductManager`.
6. Continue with the remaining application registrations and host startup.

Missing, blank, unavailable, or unsupported S-128 configuration aborts startup before ArcGIS native initialization. ArcGIS CoreHost or ProductManager initialization failures also abort startup. The original technical exception is written to the server log through the structured exception channel. The exception allowed to escape the startup boundary contains only a stable high-level failure category and does not include the configured S-128 path, connection contents, credentials, or arbitrary configuration data.

Optional or deferred integrations are not promoted to startup prerequisites by FI-018C1. This includes SevenCs, `DetectProductChangesJob` while disabled, parked mail handling, S57 compiler/mapper support, Send-to-IC-ENC Live, parked Product creation, and other unsupported workflows.

## S-101 compiler executable configuration

The active compiler executable location is owned by ProductCatalogueAPI configuration:

```text
S100Compiler:ExecutablePath
```

The compatibility default remains:

```text
C:\Program Files\s100compiler\s100compiler.exe
```

If the key is absent, the application uses that compatibility default. An explicitly blank value is not replaced by the default; it fails the export prerequisite so that a deployment override cannot silently fall back to another executable.

The compiler is not a global API startup prerequisite. ProductCatalogueAPI can start and serve non-export functionality when the compiler is absent or misconfigured.

Before an S-101 export can begin, ProductCatalogueAPI checks that the configured value is nonblank, resolves to a valid filesystem path, identifies an `.exe` file, and that the file exists. These checks do not invoke the compiler and do not perform compiler-version or output validation.

For the shared Edition operation, compiler validation occurs after non-mutating Product-state validation but before the execution guard callback and before `CreateNewEditionAsync`. The lower-level `CreateS100Export` also performs the prerequisite check before creating export directories or writing temporary YAML. Other active S-101 mutation paths perform the same preflight immediately before their Product mutation.

If the prerequisite fails:

- no compiler process is started;
- a known-unsatisfied Edition operation does not begin Product mutation;
- synchronous Edition export returns a safe service-unavailable response;
- asynchronous Edition jobs persist the stable error code `S100_COMPILER_UNAVAILABLE` and a safe S-101 export message;
- technical server logs retain useful diagnostics without returning the configured path to the frontend;
- the API process remains available.

A failure while the operating system is attempting to start an otherwise present configured executable is normalized to the same application-owned compiler prerequisite error after the original exception is logged. Compiler non-zero exit behavior remains an export execution failure and is not reclassified as deployment-path validation.

The active feature catalogue remains:

```text
ArtifactsPath + 101_FC_2.0.0.xml
```

FI-018C1 does not change `INT.IHO.S-101.2.0`, `FCVer 2.0`, or `101_FC_2.0.0.xml`.

## Reload and restart semantics

`reloadOnChange` on a JSON provider does not make every consumer dynamic. The effective lifecycle for the inspected settings is:

| Setting | Lifecycle in FI-018C1 |
| --- | --- |
| `Connections:S128Connection` | Read during required ProductManager startup. Restart required. |
| `Connections:HangfireConnection` | Read during Hangfire startup and its connection file is consumed once. Restart required. |
| `ArtifactsPath` | Captured when the singleton `IExportService` is constructed. Treat as restart required after the singleton has been created. |
| `S100Compiler:ExecutablePath` | Captured with the singleton `IExportService`. Treat as restart required after the singleton has been created. |
| `EnableDetectProductChanges` | Read during startup after host construction. Restart required to reevaluate the flag. Setting it to `false` does not itself remove a previously persisted Hangfire recurring job. |
| `log_path` | Read directly from the process environment before the application builder is created. Restart required. |
| `SendToIcEnc:Mode` | Consumed through `IOptionsMonitor<SendToIcEncOptions>`. Reload-capable configuration providers can update the monitored value at runtime; changing process environment variables or command-line arguments requires restart. |

For deployment changes to long-lived/native resources, restart the API rather than relying on JSON file reload.

## Preserved export and domain contracts

FI-018C1 intentionally leaves the following contracts unchanged:

- legacy `S100` request/export target identity;
- S-101 user-facing Product specification terminology;
- Cancel Export UI over the Rollback backend identity;
- FOID `110` behavior;
- `101DK00` index basename replacement;
- Product vertical datum behavior;
- producer metadata and codes;
- YAML/signing metadata;
- feature-association and no-geometry FOID semantics;
- feature catalogue filename and version.

FI-018C2 / A02 remains intentionally unimplemented and blocked pending domain, compiler, and security-owner decisions.
