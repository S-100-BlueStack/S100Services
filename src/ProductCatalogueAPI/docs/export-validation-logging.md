# Validation findings and operational failures

SevenCs critical findings still reject the candidate, persist its diagnostics and Error workflow state, and fail a manual export job. They now produce Warning logs, without an expected exception stack trace, in the export service, ENC candidate coordinator and manual job. Validation service outages, compiler faults, SQL/audit persistence failures and unexpected exceptions retain Error logs.

`ExportValidationException.IsFindingFailure` classifies the stable `SEVENCS_VALIDATION_FAILED` code. The separate `SEVENCS_VALIDATION_UNAVAILABLE` code remains an operational error. Safe manual-package exception mapping retains this classification through `ExportOperationJobException.IsValidationFindingFailure`; public job result codes and messages are unchanged.

`ExportOperationJob` keeps zero automatic retries and the normal Failed state. It owns terminal logging through its execution boundary and disables only that method's generic `AutomaticRetryAttribute.LogEvents`, which otherwise emits an additional terminal Error regardless of validation severity. Other Hangfire jobs and database-installer warnings are not suppressed.

## Hangfire startup after a development clear

The supplied startup log reports an existing `[HangFire].[Job]` table but schema version `none`. The existing `Data/Migrations/Clear-All-Tables.sql` selected every Hangfire table, including `[HangFire].[Schema]`, and therefore removed the installation version row. Hangfire then attempted an initial version-1 installation against existing tables.

The corrected clear script preserves the Hangfire `Schema` table and its data. Its dbo allowlist, Hangfire job-data cleanup, excluded geodatabase schemas, foreign-key safety checks and transactional behavior remain unchanged. Stop API and Worker before running this destructive development maintenance script; it is not executed by deployment or startup.

This prevents recurrence on a valid store. It does not restore metadata already deleted in an existing database. That development Hangfire store needs one-time reinitialization using the matching Hangfire package/native installer, or a fresh empty Hangfire-only database selected through `Connections:HangfireConnection`. Do not infer a schema version merely from the presence of tables, insert a guessed number, or reset a shared System/S-128 database to address this. No repair/recovery SQL is supplied, and automatic Hangfire installation/upgrades remain enabled.

Hangfire's documented schema handling and per-job log control are described in its [SQL Server configuration](https://docs.hangfire.io/en/latest/configuration/using-sql-server.html) and [AutomaticRetryAttribute.LogEvents API](https://api.hangfire.io/html/P_Hangfire_AutomaticRetryAttribute_LogEvents.htm).
