# ENC package status responses

The aggregate is derived from both export tracks whenever responses are read;
no package status or package-level edition/update is persisted. Member version
numbers remain independent and never determine aggregate status.

The package exposes exactly five statuses: Idle, Error, Hold, Ready, InTransit.
Detailed ProductState values remain on each candidate export.

| Condition | Package status |
| --- | --- |
| A current member failed/rejected, delivery is uncertain, or the shared snapshot has an error | Error |
| An active package has a missing or historically discarded member | Error |
| Either member has a manual hold or Frozen state | Hold |
| No active package exists, without an error or hold | Idle |
| Both members are ReadyForDistribution | Ready |
| Either member is InTransit or AcceptedForDistribution | InTransit |
| Either member is ChangesDetected, Exporting or Validating | Idle |
| Published or Cancelled, without a higher-priority condition | Idle |
| Any remaining inconsistent active pair | Error |

Build progress is visible on the candidates, not as a package-level state.
Accepted members remain InTransit until delivery finalization completes; they do
not make a package Ready again. A wholly published/cancelled pair is Idle.
An active pair whose tracks are both Idle remains a consistency Error, since
no queued or completed candidate work explains the active snapshot.

Any non-discarded Rejected candidate produces an Error message containing
`RejectedByIC-ENC`, the affected specification and its available rejection reason.
A rejection with no stored reason still carries that marker. Existing export
failure sanitization remains in effect for compiler and infrastructure failures.
The source-scoped Pause flag remains a delivery policy, distinct from Hold.

Numeric package values remain Idle=0, Ready=2, InTransit=3, Error=4, Hold=5.
The former Building=1, Accepted=6 and Published=7 values are not emitted.
Held is renamed Hold; no candidate enum values are renamed or removed.
Existing JSON enum formatting is unchanged.

`attributes.package.status` is returned by AOI and targeted status reads.
Product detail (`GET /electronicproducts/{name}`) now includes `data.package`,
using the same resolver whether the requested product is S-57 or S-101. The
action snapshot also exposes `status` and `errorMessage`. Eligibility flags
continue to be evaluated separately by the established workflow rules.

The legacy outer ProductStatus projection uses only Idle, Error, Frozen (Hold),
ReadyForDistribution (Ready), and InTransit for ENC package reads. It never
copies a candidate's detailed progress or acceptance state into package status.
An unavailable ENC pair mapping is Error rather than a fallback to one member's
state. History and candidate export responses retain their detailed states.

The product-detail wrapper no longer returns top-level `edition` or `update`.
Published versions remain in `s57` and `s101`; published and candidate versions
remain in `package.s57` and `package.s101`. Export entries and history retain
their own version fields. EncPackageResponse itself has no edition/update.

This is a read-model/API change. It does not advance workflow states, alter
package actions, write the S-128 geodatabase, or require a SQL migration.

Discard is a whole-package action. The paired SQL transaction validates both
members, clears their candidate identities and deletes the active EncPackage row.
File cleanup follows that commit; a cleanup failure does not undo the SQL discard.
Legacy per-member repository discard calls are now rejected before database access.
Historical per-member flags are still read so old inconsistent snapshots show Error.

Status calculation does not repair, rebuild, or delete a package. Existing DPC
recovery can recreate absent tracks from S-128 versions and resume never-started
members from the persisted shared snapshot when its locking and state guards allow.
Historical per-member discard flags block automatic member queueing. A genuinely
missing track also blocks manual discard until it has been recovered; the status
correction does not bypass that existing guard.
