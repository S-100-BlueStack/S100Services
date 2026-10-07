# DPC archive clocks and scan boundaries

## Confirmed installation evidence

The curve feature `{375dd8b7-f54e-4420-a483-ccc864d4471a}` was edited at 11:14 Copenhagen on 7 October 2026. Direct SQL shows the old version closing and the new version starting at `2026-10-07 11:14:43`. This is `09:14:43Z`. The previous query compared a UTC cursor of `10:37:03Z` directly with those wall-time columns, so both versions passed. Reading the values then converted them to UTC, producing an apparent edit earlier than the query cursor.

## Clock configuration

Set environment variables on the worker process/service and restart it after changing them:

| Variable | Meaning | Default for this installation |
| --- | --- | --- |
| `S101_ARCHIVE_STORAGE_TIME_ZONE` | Timezone of the values physically stored in `GDB_FROM_DATE` / `GDB_TO_DATE`; used for SQL literals | `Europe/Copenhagen` |
| `S101_ARCHIVE_UNSPECIFIED_TIME_ZONE` | Timezone for SDK-returned `DateTimeKind.Unspecified` values only | `Europe/Copenhagen` |

These are independent settings. An installation whose SQL stores UTC and whose SDK returns unspecified local wall time needs storage `UTC` and unspecified-value `Europe/Copenhagen`. Select settings from actual SQL and SDK evidence, not the server's display clock. Explicit UTC and DateTimeOffset values are not converted twice; DateTimeKind.Local follows its .NET host-local contract.

Copenhagen conversion uses TimeZoneInfo and its DST rules. A local timestamp in the repeated autumn hour cannot uniquely identify an instant. Ambiguous/invalid values or ambiguous SQL scan boundaries fail without advancing the watermark. Resolving ambiguous archived edits requires trustworthy UTC/offset evidence; the code does not choose an offset arbitrarily.

## Scan and summary rules

Every global, replay, and package-history scan in an invocation uses `(sinceUtc, scanStartedUtc]`. The SQL lower bound is converted to the storage clock and floored to a whole second before `SQLSyntax.Format`. The exact UTC interval is then checked against BOTH creation and finite closure events. A version that began before the lower bound but closed inside the window is retained as the before state.

The SQL predicate intentionally has no upper bound. Post-cutoff rows remain visible for future-clock validation, while composition uses only events in the fixed UTC window. Normal edits after the cutoff are left for the next scan. This avoids treating a version closed after the cutoff as a deletion at the cutoff. Closed archive versions can supply the after state even if a newer edit has since replaced them.

A year-9999 GDB_TO_DATE is an open-end marker, never a real event or timezone-converted instant. Finite dates more than five minutes beyond the worker clock still fail. Query results inexplicably older than the cutoff beyond fractional precision fail with a clock diagnostic.

DataCoverage cache invalidation uses the same storage-clock conversion and interval rules. The old full-table current-feature-ID read is no longer needed by DPC: deletion is derived from the archive state at the cutoff.

JobRunState remains an append-only history of UTC scan starts and is written only after the invocation completes. Existing SQL datetime2 watermarks are explicitly treated as UTC metadata; they must NOT all be shifted by two hours. Package timestamps and YAML UTC fields also remain UTC. Package refresh still requires a later archive event, so scanning old versions does not authorize repeating a discarded/failed export.

The exporter builds current geodatabase data, not a historical transaction snapshot at scanStartedUtc. A later concurrent edit may already appear in that YAML and will still be detected on the next scan. This change fixes the archive event window; it does not provide an atomic snapshot across the archive, topology compiler, and external encoders.

## Operational verification

For `SinceUtc: 2026-10-07T10:37:03.9366667Z`, expect `QuerySinceStorage: 2026-10-07T12:37:03` and a SQL literal representing that local wall time. The example edit at `09:14:43Z` should not be reported in that ordinary scan.

The first archive clock diagnostic includes feature ID, both raw dates and DateTimeKind values, both normalized dates, and the open-ended flag. Compare it with direct SQL if a deployment uses a different source or driver. `DPC archive query boundary` reports both timezone settings and the literal passed to ArcGIS.

No schema migration is required. Rebuild and restart the worker after applying code. On the Windows development machine, run:

`dotnet test tests/TestProductManager/TestProductManager.csproj --filter FullyQualifiedName~ArchiveClockWindowTests`

## Targeted recovery

Do not clear system tables, rewind all JobRunState rows, or alter old summary timestamps automatically. Different generations of the old code produced different timestamp meanings.

For a missing package whose edit was already consumed, inspect `scripts/Queue-DpcArchiveReplay.sql` against the SYSTEM database. It defaults to a read-only preview for `101DK004DEBCE` from `09:14:42Z`, immediately before the confirmed edit. Pause DPC, inspect the source and mapped S-57 track, and use Apply=1 only when that AOI should be reconsidered. The script rejects existing packages, a held/non-Idle source track, and a discard recorded after that boundary. It queues only a replay entry and leaves the global watermark and candidate history intact.

Replay uses normal package/hold/in-transit safeguards. It does not force export membership: the separately observed `outside the topology selection` problem can still prevent package creation and requires its own source/topology investigation. For an existing package with a legacy incorrectly labelled timestamp, review its original raw dates and lifecycle first; this script deliberately does not rewrite or discard it.
