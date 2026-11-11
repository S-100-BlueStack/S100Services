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

## Package snapshot build time (010)

Apply `010_AddEncPackageBuiltAtUtc.sql` to the ProductCatalogue System database
before deploying the updated API and Worker. The BAT only installs/stages files;
it does not execute this migration. The consolidated creation script includes
the new column for fresh databases.

`EncPackage.built_at_utc` records when the current shared YAML snapshot is created
and saved as a package, before its two candidate compilers run. A saved replacement
receives a new timestamp; a failed replacement that retains the old snapshot does
not change it. Normal scans and recovery of the same snapshot do not change it.
`detected_at_utc` retains its archive-cutoff meaning and is never overwritten by
build timing.

Existing packages retain NULL because their precise snapshot build time was not
recorded. They receive a value on their next successful snapshot replacement.
No approximate time is backfilled from archive timestamps. New direct SQL inserts
that omit the column receive a UTC database default; application-created snapshots
supply their explicit UTC creation time.

API package projections and action snapshots expose `builtAtUtc`. Published
`issueDate` remains separate: the existing finalization path writes it to S-128
only after both IC-ENC acceptances, using the accepted snapshot's issue date.
Creating or rebuilding candidates does not publish that date to S-128.

## IC-ENC mailbox ingestion (011)

Apply `011_AddIcEncEmailProcessing.sql` to the System database after 010 before deploying either process. It adds the outgoing dataset manifest, immutable inbound evidence and mailbox cursor tables. No mail is backfilled into delivery manifests, and no geodatabase schema changes are made. The fresh-schema script includes these tables. Follow `Services/ValidationEmail/DEPLOYMENT.txt` for permissions, dry-run rollout, review, recovery and independent tests. The existing clear script includes only these three additional named application tables in its target inventory; its geodatabase and foreign-key boundary checks remain in force.

## Generated-response workflow simulation

Apply `012_AddSimulationDelivery.sql` to the ProductCatalogue **System** database after `011_AddIcEncEmailProcessing.sql`, before deploying the updated API and Worker. It adds permanent delivery provenance and the Simulation acknowledgement source without changing existing live deliveries. `Create-All-Tables.sql` includes these fields for fresh databases. No script should be run against the S-101 source geodatabase or Hangfire store.

Configure both `SendToIcEnc:Mode` and `ValidationEmail:Mode` to `Simulation` in API and Worker. Package Send now exercises candidate state/history and existing S-128 publication when both replies accept, while external transport and Graph polling remain unused. The standalone email simulation endpoint remains a read-only preview.
