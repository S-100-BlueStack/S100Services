# B1-lite: ENC package Pause persistence foundation

## Authority and scope

Authoritative source baseline: `8dc21364e06ba1718b9ec99efb0505bcd0e12cc3`.

This candidate deliberately replaces the unapproved B1-R four-table design with a narrowly scoped extension of the existing `EncPackage` lifecycle. The approved direction for this test phase is to reuse the existing detector/shared YAML/two-member export pipeline and retain pre-send candidate replacement, including after an internal SevenCs failure.

B1-lite introduces **no new ProductWork/WorkflowRun**, public API routes, runtime package mutations, background jobs, scheduling, delivery/Accept simulation, manual submission marker, or new external IC-ENC workflow. Existing F7A Send/Accept and Pause/Discard controls remain disabled pending a separately approved backend action implementation.

## Current committed ownership

- `EncPackage.package_id` identifies one active candidate snapshot. A newer pre-send candidate can replace it with a different GUID; its persisted YAML/summary, source names and replay lower bound remain under the existing repository/detector.
- S-101 and mapped S-57 have independent `ProductExportTrack` states/revisions/artifacts. ProductMapping is authoritative for membership. Neither member name is derived from the other.
- `EncPackageStatusResolver` already derives `Idle`, `Building`, `Ready`, `InTransit`, `Error`, `Held`. B1-lite introduces no competing persisted status or numeric Product state.
- `EncPackageReplay` retains scan bounds when processing must wait. The detector currently permits replacing Ready/Error/Rejected candidates when newer verified source edits exist; B1-lite does not narrow that rule.

## Decision: one separate source-scoped control row

`EncPackage` is replaceable and can be deleted between discarding the old candidate and creating the next snapshot. Storing Pause only on that row would lose the user's choice after an interruption. Preserving its GUID across candidate replacement would change the existing S-128 publication `PackageId` recovery contract. Consequently B1-lite adds only `dbo.EncPackageControl`, keyed by the existing authoritative S-101 `source_dataset_name`; this is **delivery policy**, not another workflow, package ledger or second action owner.

Fields:

- `source_dataset_name` (`nvarchar(64)`, primary key).
- `is_paused` (`bit`, required).
- `paused_at_utc` (`datetime2(7)`, nullable; present exactly when paused).
- `updated_at_utc` (`datetime2(7)`, required).
- `row_version` (`rowversion`, required), used as an opaque expected-version token.

There is no FK from this long-lived policy to the disposable `EncPackage` snapshot. The existing `EncPackage.Id` remains the exact candidate identity for future mutation validation. A read requires that the snapshot still exists; absent control rows project unpaused with a null rowversion. A database error or missing migration must not be converted into an unpaused success.

`IEncPackageControlRepository` exposes one bounded read and one **internal persistence primitive**. The latter checks the exact current snapshot GUID, holds a serializable row/key-range transaction and conditionally validates the eight-byte control token before changing Pause. It returns `Changed`, `Unchanged`, `SnapshotNotFound` or `VersionConflict`; it does not publish or authorize a user action. The next action layer must check current Product/delivery states and permission before invoking it.

Because the policy is separate from snapshots, it survives their deletion/replacement without adding logic to `EncPackageDetectionService` or `EncPackageRepository`. No change to their shared YAML, discard/replay, edition/update or error-handling paths is included.

## Boundary and compatibility

- Pause means **block package-level Send**, not block change detection, YAML generation, compiler execution or SevenCs validation. It is not equivalent to existing Product Hold.
- The current Product-level Send/Upload endpoints do not consult this new table. Therefore **Pause is not yet an enforceable runtime delivery lock**. No frontend Pause action may be enabled until a later backend action/dispatch task gates every relevant delivery path.
- In the current design the policy remains persisted until explicitly changed, even if no active package exists. Whether a future terminal package lifecycle resets Pause is a B3 product decision; no automatic reset is hidden in B1.
- Exact snapshot checks reject stale control writes, but do **not** make existing detector/product-export writes generation-safe. B2 must audit stale export completions and preserve current file-lock and archive/replay logic before introducing new execution behavior.
- Send, Accept, IC-ENC return handling, simulated dispatch, manual submission marking, publication changes and scheduled sends are intentionally postponed. No schedule timestamp is introduced merely to reserve an unapproved cadence or contract.

## Migration and deployment

Run the database-owner scripts in `src/ProductCatalogueAPI/Data/Migrations/`:

1. `008_AddEncPackageControl.sql` (non-destructive additive migration).
2. `008_VerifyEncPackageControl.sql` (read-only verification).

Both target only the Product Catalogue System database. Do not hand-run them in S-128 or Hangfire. Existing 001–007 scripts stay unchanged; no historical/active snapshot migration or backfill is needed for the resettable test database. The new repository is registered for both API and Worker; neither current runtime flow invokes it.

An older application binary may ignore the additive control table before activation. There is no automatic down/drop script. Do not treat a successful schema deployment as evidence that Pause/Resume functions end-to-end.

## Tests and later work

`EncPackageControlRepositoryTests` exercises:

- Default absence of a policy row and source-scoped persistence across a changed package GUID.
- Old snapshot preconditions failing closed.
- Rowversion conflicts preventing a stale Resume from overwriting Pause.
- A no-op Resume when no control row exists.
- Required snapshot/rowversion/UTC input checks.
- ADO transaction use for the persistence write.

Recording ADO tests are **not** SQL concurrency integration tests. Database-owner verification and a disposable SQL Server race test remain mandatory before production Pause/Resume activation. Legacy ENC detector, S-101/S-57 export, status, hold, receipt and paired-publication regression tests must remain passing.

### Deferred task boundaries

- **B2 hardening:** revalidate exact `EncPackage.Id`/current member revision at every asynchronous publish boundary; preserve successful pre-send refresh; prevent stale mutations; prove replay correctness. Minimize edits to existing detector/engine paths.
- **B3-MVP:** implement actual package Pause/Resume and whole-package Discard with authorization, current-state preconditions, source awareness and backend-owned action availability. Every potential delivery path must respect Pause before UI activation. No Send/Accept implementation.
- **F7B-MVP:** enable only the backend actions actually implemented and verified; keep Send/Accept disabled, not fake-successful.
