# DPC import baseline

Stop the Worker before importing and keep editing paused until the final archive
events from the import have been committed. Add this section to the Worker's
existing `appsettings.json`, or merge the property into an existing `Dpc` section:

```json
{
  "Dpc": {
    "ArchiveBaselineUtc": "2026-11-01T18:41:50+01:00"
  }
}
```

This example represents the supplied completion time in Copenhagen. It is
`2026-11-01T17:41:50Z`. It will NOT exclude the reported archive event at
`2026-11-02T00:15:50Z`. Confirm the actual import archive boundary before using
the example. Do not choose the current time if test or production edits after
the import need to be retained. A cutoff cannot distinguish imports and user
edits interleaved in the same time window.

Use ISO 8601 with `Z` or an explicit offset. UTC is preferable for production.
The equivalent environment variable is `Dpc__ArchiveBaselineUtc`. Restart the
Worker after changing the deployment configuration. No SQL script or schema
migration is required.

The Worker persists the accepted cutoff in the existing system-database
`JobRunState` table under `DetectProductChangesJob.ImportBaseline`. It retains
the cutoff when the configuration property is removed, and rejects a configured
cutoff older than the stored value. A later import can advance it. Configure the
final production import's actual boundary separately from this test database.

Every ordinary, cumulative, failed-snapshot and manual archive scan is constrained
to events strictly after the cutoff. New feature inserts after it are included.
Imported features remain in full export snapshots; only their import events are
excluded as export triggers. With no saved scan checkpoint, the configured
cutoff is used directly, even if it precedes today's midnight. Without any
configured or persisted baseline, existing midnight/checkpoint behavior remains.

When a package's cumulative source window begins before the cutoff, the Worker
uses the normal guarded paired-discard transaction to invalidate that snapshot,
retain post-cutoff replay, and remove its output files. It rebuilds only when
post-cutoff changes remain. History is retained. Holds and protected delivery
states are not overridden: reconciliation stops with a diagnostic identifying
the package and does not advance the scan checkpoint. Resolve those states
through the existing workflow before resuming.

The baseline is committed before package cleanup, so interrupted reconciliation
can safely resume after restart. Replay bounds are moved forward without
deleting pending source records. Retry gates computed against pre-cutoff source
windows are invalidated once. DPC retains its normal per-source failure gate
after the corrected window has been attempted.

Manual NewExport requests also use the baseline, while still allowing a full
paired snapshot without a new archive edit. Such a request records `changes: []`
and `latestArchiveEditUtc: null` rather than claiming an import was a user edit.

This code does not modify S-101 archive rows or publish data to S-128. Replacing
the source geodatabase requires restarting the Worker to clear cached coverage
and connection state.
