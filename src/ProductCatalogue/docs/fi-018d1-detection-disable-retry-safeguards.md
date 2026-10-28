# FI-018D1 Deterministic Detection Disable and Retry Safeguards

## Purpose

FI-018D1 hardens disable, recurring-job reconciliation, and execution-entry semantics for `DetectProductChanges`. The authoritative implementation baseline is `a32ccd00394aef8f532c06614c373f43a2cea111`, supplied as `FI-018D-discovery-baseline-a32ccd00.zip` with SHA-256 `BA9A7D159C436E249FE4B97B61CCDDA6E794037751867DD47F5BEF65A47E34E5`.

This change does not activate detection. The tracked `EnableDetectProductChanges=false` remains unchanged.

## Configuration

`EnableDetectProductChanges` is resolved once immediately after the application builder is created. `DetectProductChangesState` retains only an immutable Boolean decision and is registered as a singleton for job activation. Startup reconciliation receives the same instance.

| Effective value                                     | Startup decision                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| Missing                                             | Disabled                                                          |
| `false`                                             | Disabled                                                          |
| `true`                                              | Enabled                                                           |
| Explicit invalid Boolean text, including blank text | Startup fails with `DETECT_PRODUCT_CHANGES_CONFIGURATION_INVALID` |

The existing ASP.NET configuration providers and their precedence remain unchanged: command line > environment > environment-specific JSON > base JSON. The state does not retain `IConfiguration`, reread a file, or subscribe to reload notifications. A restart is required after a setting change.

## Disabled contract

After successful startup with a disabled snapshot:

1. `IRecurringJobManager.RemoveIfExists("detect-product-changes-job")` has completed. An absent definition is safe to remove repeatedly. No replacement job is registered or enqueued.
2. Updated consumers reject old, queued, scheduled, retried, and manually triggered invocations at the beginning of the existing public `DetectProductChangesJob.RunAsync(CancellationToken)` method. Its type, method name, return type, and parameter contract remain compatible with persisted Hangfire invocations; constructor dependencies are resolved by the current application.
3. The guard throws `DetectProductChangesDisabledException`, with code `DETECT_PRODUCT_CHANGES_DISABLED` and message `DETECT_PRODUCT_CHANGES_DISABLED: Product change detection is disabled by application configuration.` It executes before watermark reads/writes, repository access, ProductManager access, compiler work, SevenCs, Product mutations, attachments, and output work. A disabled invocation is a failed invocation, not a successful scan.
4. The method has `[AutomaticRetry(Attempts = 0)]`. Hangfire automatic exception retries are disabled for detection. Manual retry remains possible and encounters the same guard. Other jobs and global retry settings are unchanged. This is not an exactly-once guarantee and does not remove already-created invocation records.

Reconciliation runs immediately after `builder.Build()`, before `app.UseHangfireDashboard(...)` and `app.Run()`. Production resolves the application-configured `IRecurringJobManager` through DI inside the reconciliation failure boundary and uses that manager for registration/removal. Both manager resolution and storage-operation failures are covered. Reconciliation is independent of Dashboard middleware initialization and does not use the static `RecurringJob` facade. `DetectProductChangesRecurringJob` retains its internal delegate seam for deterministic tests without SQL Server or a running Hangfire server.

If either registration or removal throws, the original exception is logged server-side. The helper then throws a safe outer `InvalidOperationException` with reason `DETECT_PRODUCT_CHANGES_RECONCILIATION_FAILED`. Its message contains no storage exception details and it has no inner exception. Startup does not continue, and the success log is emitted only after the storage call returns successfully. Storage operations are not assumed to be rolled back if an error occurs after partial work; a later startup reconciles again.

## Enabled boundary

EnableDetectProductChanges=true is not made production-ready by FI-018D1.

Enabled automation is owned separately and requires its own approved execution-safety and domain work. With an enabled snapshot, the guard permits the baseline method body to run. Watermarks, scanning, edition/update selection, Frozen Product behavior, compiler preflight, SevenCs interpretation, Product state/history, attachments, and recovery logic are unchanged. The explicit zero automatic-exception-retry policy applies to the detection method in both states.

No dataset locking, execution-start marker, version guard, concurrency filter, distributed locking, or enabled-flow safety redesign is added.

## Multi-instance limitation

The deterministic guarantee requires all consumers sharing the Hangfire storage to run compatible updated code and consistent startup configuration. An older consumer can still execute the old method body. An enabled consumer can still execute detection or recreate the recurring definition. Restart all relevant consumers with consistent configuration when changing this setting.

D1 cannot stop an already-running old process or undo prior Product mutations. It does not interrupt an invocation that already passed an enabled guard. Removing the recurring definition does not cancel previously created jobs; the updated execution guard handles those invocations when they run.

## Schedule

Enabled reconciliation preserves `detect-product-changes-job`, `job => job.RunAsync(CancellationToken.None)`, and `Cron.Daily(23)` (`0 23 * * *`). The corresponding service-based `IRecurringJobManager.AddOrUpdate` extension is used without an explicit timezone argument, preserving Hangfire's existing default timezone semantics. This is a daily schedule with the existing Hangfire default timezone behavior, not an hourly schedule or an explicit Danish/local-time contract. No timezone or bootstrap decision is introduced.

## Logging

The existing central log environment variable remains `log_path`. The misleading warning now names `log_path`. Environment lookup, sinks, paths, retention, and technical logging are unchanged. There is no dedicated application-owned logging-configuration seam; no console-output string test is added solely for this correction.

## Regression tests

`tests/TestProductManager/DetectProductChangesTests.cs` covers missing/valid/invalid configuration, disabled removal, repeated reconciliation, enabled ID/method/cron, both reconciliation failure branches, safe outer errors and retained technical diagnostics, dependency-free disabled execution, legacy public invocation compatibility, immutable startup decisions in both directions, and the method-scoped zero-retry policy. Production-entrypoint tests additionally use a DI-registered manager spy without any Dashboard setup, verifying enabled/disabled manager calls, default UTC scheduling, and both resolution and operation failures inside the safe boundary.

Dependency spies throw on every access. The enabled snapshot test reaches the baseline first watermark read and deliberately stops there; it performs no scan or Product mutation. These tests do not initialize ArcGIS, access a geodatabase, start Hangfire, or invoke SevenCs/compiler/IIS. The existing Windows-targeted test project still needs its normal build/reference prerequisites, including referenced ArcGIS assemblies.

Run from the repository root:

```powershell
dotnet test .\tests\TestProductManager\TestProductManager.csproj --filter "FullyQualifiedName~DetectProductChangesTests|FullyQualifiedName~ConfigurationPrecedenceTests|FullyQualifiedName~ProductCatalogueStartupPrerequisiteTests|FullyQualifiedName~S100CompilerConfigurationTests|FullyQualifiedName~ExportOperationJobTests|FullyQualifiedName~ExportOperationServiceTests|FullyQualifiedName~ExportControllerSyncParityTests"
dotnet build .\src\ProductCatalogueAPI\ProductCatalogueAPI.csproj -c Release
```

Where the full suite's environment prerequisites are available:

```powershell
dotnet test .\tests\TestProductManager\TestProductManager.csproj
```

## Manual verification

1. In the existing configured test deployment, leave the tracked `EnableDetectProductChanges=false` and ensure effective environment/command-line overrides also resolve to false. Use consistent updated code/configuration on every consumer of the test storage. Record the detection watermark, relevant Product history/state, and output files before testing stale jobs.
2. Start the API using its normal deployment procedure. A command-line override can make the test decision explicit: `dotnet run --project .\src\ProductCatalogueAPI\ProductCatalogueAPI.csproj -- --EnableDetectProductChanges=false`. Verify normal API startup and the successful reconciliation log with `Enabled: false`.
3. Inspect the existing Hangfire Dashboard recurring-jobs page. Verify `detect-product-changes-job` is absent. Restart with false and verify it remains absent.
4. If a stale detection invocation exists in isolated test storage, retry/enqueue that existing invocation through the Dashboard. Verify failure with `DETECT_PRODUCT_CHANGES_DISABLED`, no automatic exception-retry scheduling, and unchanged watermark, Product history/state, attachments, and output. Do not use an old or enabled consumer for this test. If no stale job exists, the deterministic legacy-invocation test covers this boundary without enabling detection.
5. Run `EnabledDetectionPreservesRecurringContract` to verify enabled registration without Product work. Optional live true-registration verification is only appropriate in separately controlled infrastructure that prevents all detection execution. Do not start the ordinary API with true merely to inspect registration: its background server could consume existing jobs. Live activation is not an acceptance requirement.
6. Return any controlled registration test to false, restart compatible consumers, and verify removal again.
7. Verify ordinary API endpoints and a normal Product export in the existing safe test workflow. Retain FI-018C1 checks: API startup does not require an available S-101 compiler; an unavailable compiler fails an S-101 operation with `S100_COMPILER_UNAVAILABLE` before the relevant Product mutation. Check the existing asynchronous error metadata and synchronous failure behavior.

## Out of scope

The current internal/test access model is intentionally preserved. FI-018D2 authentication, authorization, Windows/Negotiate activation, group access, Hangfire Dashboard security, Swagger security, CSRF/antiforgery, and production ingress/IIS access policy are unchanged.

Separately owned enabled-detection production safety includes dataset locking, execution-start/version guards, SevenCs correctness, watermark/recovery redesign, Frozen Product rules, schedule/bootstrap decisions, and distributed/multi-host Product mutation safety.

FI-018C2 export metadata/producer/datum/index decisions, FI-018E redistribution/dependency/sample provenance, and FI-018F deployment/provisioning/runbook work remain deferred. No frontend behavior or dependencies change.

## Public API references

- [Hangfire recurring-job registration and removal](https://docs.hangfire.io/en/latest/background-methods/performing-recurrent-tasks.html)
- [Hangfire automatic exception retry configuration](https://docs.hangfire.io/en/latest/background-processing/dealing-with-exceptions.html)
