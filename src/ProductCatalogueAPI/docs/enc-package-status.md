# ENC package status responses

The aggregate is derived from both export tracks whenever responses are read;
no package status or package-level edition/update is persisted. Member version
numbers remain independent and never determine aggregate status.

The shared resolver applies this precedence:

| Condition | Package status |
| --- | --- |
| A non-discarded member failed/rejected, delivery is uncertain, or the shared snapshot has an error | Error |
| Either member is frozen or manually held | Held |
| No active package exists, without an error or hold | Idle |
| An active package has a missing or historically discarded member | Error |
| Both members are ReadyForDistribution | Ready |
| Both members are AcceptedForDistribution | Accepted |
| Both members are Published | Published |
| Both members are Idle but the package row still exists | Error |
| Either member is InTransit | InTransit |
| Either member is queued, exporting, or validating | Building |
| Any remaining combination of active member states | Error |

InTransit and Building indicate ongoing work; they are not paired success.
An accepted member with a ready counterpart is Error. A discarded member
cannot satisfy the requirement for two successful exports. Error diagnostics
retain existing sanitization, including trusted SevenCs validation summaries.
The source-scoped Pause flag remains a delivery policy, distinct from a hold.

Existing EncPackageStatus numeric values 0–5 are unchanged. Accepted and Published
are appended as 6 and 7. Incomplete is not a public package status. Existing JSON enum formatting is
unchanged. Clients must recognize the added values when reading package status.

`attributes.package.status` is returned by AOI and targeted status reads.
Product detail (`GET /electronicproducts/{name}`) now includes `data.package`,
using the same resolver whether the requested product is S-57 or S-101. The
action snapshot also exposes `status` and `errorMessage`. Eligibility flags
continue to be evaluated separately by the established workflow rules.

The legacy outer ProductStatus projection maps Error to Error and maps
Accepted/Published to their corresponding ProductStatus values. It no longer
falls back to one member's successful state when aggregate status is Idle.

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
