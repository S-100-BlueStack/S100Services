# ENC package live Pause/Resume and Discard (development integration)

## Scope and deployment gate

This development-only action slice builds on B1-lite `dbo.EncPackageControl` and the current `EncPackage`/Product export-track schema, at baseline `e57344d78e9167fa08d235d17d1d74f5b4434e96`.

**Both API and Worker must run in `Development` and have `EncPackageActions:Enabled` set to `true` in their effective application configuration.** Otherwise the new HTTP routes return `503 PACKAGE_ACTIONS_DISABLED` and the Worker refuses queued Discard execution. Add the following to each relevant existing `appsettings.Development.json` or equivalent effective configuration; the candidate does not replace private settings:

```json
{
  "EncPackageActions": {
    "Enabled": true
  }
}
```

This is **not production authorization**. The project's current controller authentication policy is not sufficient for public mutating package actions. The feature must remain disabled outside Development. Do not configure it in production, expose it publicly, or infer that this slice enables the postponed package Send/Accept lifecycle.

No database migration, new external dependencies, global operation registry, scheduling policy or Product-aware frontend compatibility fallback is introduced. Migration `008_AddEncPackageControl.sql` remains a prerequisite.

## HTTP contracts

All routes are relative to the existing Product Catalogue API base:

- `GET electronicproducts/packages/{sourceName}/actions` returns the **current** `packageId`, source name, B1-lite `paused` and `controlVersion` (base64 SQL rowversion), `canPause`, `canResume`, `canDiscard`, and the exact eligible members only after both member tracks have reached acceptable final pre-send states. The source name must match the S-101 package owner; the current S-57 name is read from `EncPackage` and the Product mapping, not derived from a prefix. A current package whose S-101 or S-57 export-track row is absent still produces `200` with all live actions disabled and `restrictionCode: "MEMBER_TRACK_MISSING"`; a nonfinal member state yields `"MEMBERS_NOT_READY"`. No missing Product track is fabricated. `404 PACKAGE_NOT_FOUND` remains reserved for unavailable current packages/control snapshots, while `503 PACKAGE_ACTIONS_DISABLED` means the API gate is off.
- `POST electronicproducts/packages/{sourceName}/pause` and `/resume` accept `{ "packageId": "...", "expectedControlVersion": "..." }`. The version is nullable only when no control row exists. The server conditionally changes B1-lite persistence under a serializable transaction and returns the next version. Stale package IDs and rowversion conflicts fail closed (`409`).
- `POST electronicproducts/packages/{sourceName}/discard` accepts `{ "packageId": "..." }`. A successful admission returns `202` with a Hangfire `jobId`; this does **not** mean Discard finished.
- `GET electronicproducts/packages/discard-jobs/{jobId}` reports the authorized Discard job's `Running`, `Succeeded`, `Failed` or `Cancelled` state, without leaking job arguments or internal error details.

The API performs no ArcGIS or export-file mutation. `DiscardEncPackageJob` executes in the existing single-Worker host and acquires the source S-101 and mapped S-57 Product-track file locks in the same order as detection.

## Transaction and lifecycle safety

- Pause/Resume are delivery-only policy; they do not hold source detection, candidate generation, YAML, export or internal validation. `EncPackageControl` is keyed by stable S-101 source name, so Pause survives replacement of a pre-send candidate. The conditional write checks the exact current snapshot, rowversion, both member states and manual Product hold state. A readable incomplete package does not authorize Pause: the SQL write still requires two completed tracks, and the Discard transaction still requires both track rows and final pre-send eligibility.
- Live IC-ENC transmission reservation now reads and locks the current package Pause policy before reserving a Product track; paused packages cannot enter a new live delivery reservation. Existing *per-Product* simulation has no real delivery side effects and is not called by the new frontend Send/Accept demo.
- Discard rejects replaced snapshots, pending replay entries, active/processing or frozen tracks, unsafe previous states and Product delivery reservations. Under **one serializable SQL transaction**, it writes both Product cancellation/restoration histories, clears both candidates and removes the exact active `EncPackage` row. No replay is created; a previously consumed source edit cannot cause immediate regeneration simply because the package was discarded.
- Only after SQL commit does the Worker attempt best-effort output cleanup for each exact candidate version. A cleanup failure is logged as requiring review; SQL Discard is not falsely undone. The Worker has zero automatic Hangfire retries for this action.
- A queued Discard can fail after HTTP `202` if source state changes before execution. The frontend must only report success after polling the job to `Succeeded`; a failed or uncertain job requires inspection rather than a blind retry.

**Known limitations:** The action slice does not introduce a fully generation-fenced B2/B3 run ledger, a package-wide Send/Accept claim, production authorization or a cross-machine distributed lock. It is suitable only for the single-Worker Development setup. Do not treat the frontend's `Send` and `Accept` demo states as real delivery/IC-ENC results.

## Local verification

1. Confirm the API and Worker use the same target database, that migration 008 is applied, and the Development-only feature flag is enabled in both processes.
2. Build the API and test project; run `EncPackageActionEligibilityTests`, `EncPackageControlRepositoryTests`, `EncPackageDetectionEligibilityTests`, `ExportOperationServiceTests`, and delivery-reservation tests. This candidate cannot establish SQL integration correctness without a real disposable database.
3. Start API and Worker once. Open an existing **failed, unsent** ENC package. Confirm action GET returns the current package UUID and a control version.
4. Pause; verify success, a changed control version and a new read reporting `paused: true`. Attempt a live transmission reservation in a **controlled test environment** only, where transport cannot actually send to IC-ENC; the reservation must fail. Resume and verify the persisted state returns to false. Never perform a real external send for this acceptance.
5. On a package created only for destructive testing, Discard and poll until the Worker reports `Succeeded`. Check both Product export tracks, the active package and both history trails. Verify that a scan with no new source edit does not recreate the discarded package. Confirm published/current Product versions are unchanged.
6. Exercise stale package ID, stale control version, pending source replay, an active member and a delivery reservation; all must reject mutation. Test API/Worker flag mismatch: the Worker must refuse Discard.

The integration actions are **not verified** until these local checks have actually been performed. Do not commit based solely on pure tests or a successful frontend demonstration.
