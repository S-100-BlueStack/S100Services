# S-102 change detection

The ProductCatalogue Worker registers `DetectS102ChangesJob` and `IS102ChangeDetector`. The job implements `IBackgroundJob` and currently has no recurring schedule. The `S102ChangeDetector` scaffold throws on execution so a placeholder run cannot mark source data as processed.

The job reads and writes `dbo.JobRunState` through `IProductRepository`, using the `DetectS102ChangesJob` key. The table is append-only for these calls and the repository reads the last inserted row for that key. The timestamp is the upper UTC boundary of the last successful scan, including a successful scan with no changes. Read Hangfire execution history for attempts and completion times. There is no new SQL migration.

## Implement the detector

1. In `Services/S102/S102ChangeDetector.cs`, establish how the actual S-102 source exposes committed changes and how each change maps to an S-102 dataset. Confirm how to represent deletes or replacements if the source supports them. The worker should get source access from configuration under its service identity. Use the existing ArcGIS execution lane if the source requires ArcGIS CoreHost.
2. Define the first scan when `lastSuccessfulRunUtc` is null. Choose an explicit initial baseline or a full scan with the data owner. Confirm that the source can safely honor the UTC upper bound even when writes commit late or share timestamps. Where appropriate, scan an overlap and deduplicate. If the source requires an ordered token or composite cursor, define its persistence before scheduling instead of encoding it as a timestamp.
3. Make required downstream processing idempotent. A retry can re-read a window if the source was processed but the SQL checkpoint write failed. `DetectAsync` should complete only when the full interval has been processed or unfinished items have been durably recorded for replay. The Hangfire lock limits overlapping job executions, but replay safety must hold even if the lock is lost. The source database and the ProductCatalogue checkpoint are separate stores.
4. Verify the source scan and recovery against disposable data. Then add an S-102 recurring registration in the Worker with an independent enable flag and cadence. Leave the ENC detector on its existing schedule.
