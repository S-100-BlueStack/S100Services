# Product Catalogue System database migrations

The SQL scripts in this folder are database-owner executed. They are not startup migrations. The System database is distinct from the S-128 geodatabase and Hangfire database. Existing scripts 001 through 007 remain unchanged; there is no script numbered 005 in this committed baseline.

## B1-lite (migration 008)

1. Verify that the normalized Product workflow and existing ENC package schema are present (in particular `dbo.EncPackage` and `dbo.EncPackageReplay`). Review the actual database rather than assuming a reset produced an identical schema.
2. Run `008_AddEncPackageControl.sql` in the System database as the database owner.
3. Run `008_VerifyEncPackageControl.sql` in the same database. Both scripts fail closed on missing or incompatible structures. The verification script is read-only.
4. Deploy the corresponding API/Worker binaries together if they will consume the new repository.

This migration creates one small source-scoped delivery policy table. `EncPackage` remains an active, replaceable candidate snapshot; its GUID is still the current snapshot identity. The source-scoped policy deliberately has no foreign key to that replaceable row. The policy survives its deletion/recreation during pre-send candidate replacement. No backfill is needed in a reset test database. A source without a control row defaults to unpaused when read through its current package.

This foundation does not enable Pause or Resume as user actions, does not block legacy Send paths, and introduces no automatic/manual delivery mark, Accept, scheduler, or publication operation. Do not expose Pause controls until the later dispatch layer verifies all relevant operations. A schema-only or repository-only deployment is not proof that delivery can be paused.

For application rollback before activating package actions, retain this additive table; earlier binaries ignore it. No down/drop script is supplied. A later decision about whether Pause persists across terminal/discarded package lifecycles must be made before exposing actions; the current storage retains it until explicitly changed.

## Failed snapshot retry checkpoint (009)

Apply `009_AddEncSnapshotAttempt.sql` to the System database before deploying the
DPC retry gate. It adds `EncPackageReplay.last_snapshot_attempt_utc`, the exact
archive cutoff inspected by a failed shared snapshot build. Replay still retains
the cumulative source baseline; only a subsequent matching change permits another
build. The migration adds no geodatabase tables and does not backfill guessed
cutoffs from old exception/finish timestamps.
