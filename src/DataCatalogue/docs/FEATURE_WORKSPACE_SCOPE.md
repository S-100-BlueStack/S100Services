# Package, Pipeline, Workspace and Jobs scope

Authoritative decisions: WORK-TASK.md and CONFIRMED-DECISIONS-2026-10-28.md in the supplied
handoff. Baseline: `08d9281fe35b06012bda430c94767ef69a439d3e`.
Status: DC-API frontend candidate implemented; local browser/API acceptance pending.

## Domain

A Package is the assignment unit. It has one generalized rectangular AOI and detailed
Features; it is not a Feature. A Pipeline is a product definition. A Package may have several
Pipeline bindings. A Workspace is a Pipeline-scoped geographic work area. Membership is
computed by the backend from an active binding and generalized AOI intersection. No manual
Workspace membership or per-Feature assignment is saved in live mode.

A Job is a Package in a particular Pipeline and Workspace. Its canonical frontend identity is
an unambiguous serialized tuple `(packageId, pipelineId, workspaceId)`. Package-level Severity
is shared across those contexts; simulated workflow status is independent for every tuple.
Ownership/locks remain distinct from progress.

## Four-panel assignment page

The existing four panels, independent scrolling, explicit selection, Save, dirty navigation
and native Escape/focus behavior remain. In live mode they display:

1. Paged Packages with server-side Category and Assigned/Not assigned filters. Name search is
   disabled because v1 has no such query. An unfiltered row says `Select to view bindings`;
   it does not infer assignment status from a geometry reference or category.
2. Package information, exact Severity, opaque ID, short ID and generalized AOI reference.
   Source descriptions are rendered as text, never inserted as HTML.
3. Multi-Pipeline checkboxes and saved derived Workspaces. Workspace lists are read-only and
   explicitly refer to the last saved binding, not an unsaved draft. Comments are unavailable.
4. A truthful missing-geometry surface. No synthetic Package AOIs, ENC overlays or legacy
   demo layers are substituted.

Save re-reads bindings, computes independent add/remove deltas and uses returned binding IDs
for deletion. It issues one operation per distinct change, then re-reads authoritative state.
Each operation outcome is reported. Partial failure updates the saved baseline when possible
and retains the desired draft. An unsuccessful reconciliation leaves the draft intact and
requires another preflight read before any retry. No atomic transaction or rollback is implied.

## Main-map Jobs

The existing Jobs panel starts closed. Its live Workspace selector groups Workspaces by
Pipeline and makes no automatic selection. After explicit selection, all member pages are
read and Package details are hydrated with at most six concurrent requests. The list is
published only when complete. Severity sorting, counts and supported status filters apply
only to that selected Workspace, never to a claimed global catalogue search.

The existing list/details/status controls remain. A visible banner and status detail explain
that status is mock-only. Reset clears only live mock status memory; it does not change backend
bindings, demo persistence or preferences. Reloading the browser also resets these statuses.
No deadlines or follow-up Jobs are fabricated. Priority bands, AOI filters and clustering
controls are hidden in live mode while their required mapping/band contracts are absent.

Map/MapView ownership remains under `features/map`. Live list access is independent of the
legacy required-AOI startup gate. Existing demo startup, layers, popups, filters and highlights
remain on the demo path. Live overlays and map focus are withheld until geometry is verified.

## Severity

Lower exact unsigned integer means higher priority. `0` is highest. The uint64 maximum is
`Not prioritized` and sorts last. Null is `Unspecified` and sorts after numeric prioritized
values but before that sentinel. This null placement is a frontend display convention, not a
new backend severity tier. Exact decimal strings and raw JSON integer tokens are supported;
already-rounded unsafe JavaScript numbers and unsupported encodings are rejected.

## Preserved demo and excluded work

The earlier [Feature/Work stream scope](FEATURE_WORK_STREAM_SCOPE.md) describes demo behavior
only. Its per-Feature assignments, manual Work stream membership, comments and priority bands
are not live backend contracts. No backend code, final status taxonomy, durability, lock writes,
Workspace override, authentication infrastructure or production deployment is included.
See [backend gaps](DC_API_BACKEND_GAPS.md) and [verification](DC_API_LOCAL_VERIFICATION.md).
