# Package, Workstream, Workspace and contextual Job scope

## Live Package geometry clarification (2026-11-05)

A Package's rectangular `aoi` is not a Workspace polygon; detailed Feature
points, curves and surfaces are also not Workspace membership. DC-API-06
renders the **selected** Package from the verified read-only geometry route,
while existing Workspace overlays continue to show the backend's effective
saved Pipeline bindings/intersections. `detailedGeometry: null` means no
additional detailed geometry, not missing Package identity or failed bindings.
Manual Workspace overrides were considered in an earlier prototype but are not
part of the current 2026-11-12 auto-match-only requirement.

## Current terminology (2026-11-24)

The live frontend uses **Workstream** / **Workstreams** for the existing backend
Pipeline concept and **Packages** for the Main Map workflow. A Workstream is
not a Workspace. Keep `pipelineId`, `hasPipeline`, `pipelineBindings`, API
routes, binding and contextual Job identities unchanged. Preserve source entity
names, opaque IDs and backend diagnostic text. The mock Feature/Work stream
prototype uses historical Workspace-like terminology; its `Work stream` and
`WorkStream` references do not denote the new live Workstream label.

The current Main Map uses one Work Scope for Workstream and optional Workspace
selection, with `Show empty Workspaces`. The Compilation/QC design preview is
accepted as presentation only. See the [tracker](PROJECT_TRACKER.md) and
[architecture](ARCHITECTURE.md) for current behavior. Older DC-001, DC-STAB-02E and
integration candidate descriptions are historical where superseded, including
former map-only visibility controls and earlier geometry limitations.

## Domain and backend ownership

A **Package** is an assignment unit with a generalized AOI reference and detailed
geographic **Features**. A Package may be bound to several **Workstreams**
(backend Pipelines). A **Workspace** is a Workstream-scoped geographic work area.
The backend computes Package membership from saved Package/Pipeline bindings
and generalized AOI intersection. The current Package Assignment requirement allows **only automatic
Workspace matches**, read-only from the saved Pipeline binding. The earlier
manual include/exclude concept is not active scope and must not be prototyped
without a new explicit decision and verified backend contract.

A **Job** is a Package within one `(packageId, pipelineId, workspaceId)` context.
That complete tuple is its internal identity. Package Severity is shared across
contexts; Job workflow status is independent mock state per tuple and remains in
browser memory only. The terminal UI actions are `Done` and `No update`.
Ownership and locks are distinct from Job progress, QC and binding state.

Severity uses exact unsigned 64-bit ordering: `0` is highest priority,
`18446744073709551615` is `Not prioritized`, and null or missing is
`Unspecified`. Keep the exact value through normalization and sorting.

The left live Package Details panel shows authorized committed Package and
binding events. Windows actors come from the authenticated mutation principal.
Current AD name/photo enrichment is optional. History retention follows the
event store. See [backend contracts](BACKEND_CONTRACTS.md) for actor fallback,
paging and profile behavior.

## Main Map comment viewer

The speech bubble beneath Severity opens a compact, read-only popup anchored
to that row. It shows retained saved comments for the row's Package–Workstream
binding, including its own unbind/rebind history. Workspace contexts of the
same pair share availability. Other Workstreams and other Packages have
independent availability. Blue signals saved comments and gray confirms
absence. Loading, unknown and failure have separate cues.

The popup names the Workstream and shows one page at a time with recorded UTC
time and actor. Optional directory names and photos use the existing
event-scoped profile route. Comment-only Save refreshes the affected
binding's availability when the list is visible. Existing binding
synchronization applies when bindings also change. Package-level comments
and editable Discarded status remain COMMENT-03.

## Discard reasons and editable Discarded

The Workstreams Save toolbar starts with read-only Discard reasons and
Discard/Reopen. Enter a fresh reason and submit from the Discard popup.
Use the existing binding Save to remove any Workstreams first. Discard
records the reason with the decision. Reopen is direct from the toolbar,
or confirmed by the regular binding Save before assigning a newly selected
Workstream. A Discarded Package remains editable. The Main Map remains
membership-driven and its comment viewer stays binding-scoped.

## Package assignment page

The four-panel page retains independent scrolling, draft navigation decisions,
keyboard/Escape behavior and saved binding reconciliation:

1. **Packages:** paged records with supported Category and Assigned/Not assigned
   filters and search on the loaded page. Global Package search remains a backend
   gap. Display `shortId`, but use canonical `packageId` for API calls and deep links.
2. **Package details:** render language-specific descriptions as **allowlisted
   sanitized HTML**, including useful tables and safe links. Markup is untrusted;
   it is not inserted raw and is not limited to plain text.
3. **Bindings:** Workstream checkboxes form a Package/Pipeline draft. Derived
   Workspaces are read-only and reflect the **saved** bindings. A Package switch
   retains the previous complete selection and disabled bindings while the new
   Package and saved records load; it publishes the replacement atomically.
4. **Map:** the assignment map renders Workspace geography from saved binding
   intersections and the selected Package's generalized AOI and available
   detailed geometry from the verified Package geometry read. The Workspace
   overlay represents saved matches only. Prospective matches require their
   own verified read.

Save performs a preflight read, independent add/remove mutations and authoritative
reconciliation. Partial definitive errors preserve individual results. Binding
requests and response-body reads have a 30-second frontend deadline. A timed-out
or otherwise uncertain mutation stops remaining writes and preserves the desired
draft for read-only reconciliation via **Check saved bindings** or **Check saved
changes**. **Discard local draft** clears the browser draft. A server write
may still complete late.

On return to Main Map, confirmed or possibly committed binding writes trigger
a fresh read of backend-derived Workspace membership. A preflight or recovery
read can also invalidate the Main Map when it proves a saved binding change.
Draft-only changes and comment-only saves with unchanged bindings require no
membership read. Home preserves the active Work Scope and panel visibility.
Existing Refresh remains available if an uncertain write lands after the read.
Package History has its own Refresh action.

In live Package Assignment, an explicit Save of a changed draft shows a green
check and reports **Changes saved** after the service confirms the intended
bindings and comments. Ordinary refreshes retain the check. A new draft edit,
a Package switch or leaving Assignment clears it. The clean Save control
remains disabled. Read-only recovery leaves the normal Save icon.

The speech bubble opens saved binding comments and the current row's draft.
Type a draft for an active or newly checked Workstream, then use the toolbar
Save. **OK**, Escape and clicking outside only close the editor. Use **Show all**
to read retained comments on an inactive Workstream. There is no edit/delete
action for saved comments. Reassign the Workstream or discard its local draft
if it is unchecked before Save. A partial Save clears only confirmed comments.
An uncertain comment retry retains the same operation UUID and text. Comments
belong to the canonical Package and Workstream pair and appear in Package
History with their recorded actor and UTC time. See the
[binding comments contract](BACKEND_CONTRACTS.md#comment-01---workstream-binding-comments).

## Historical Main Map behavior (DC-STAB-02E, 2026-11-04)

The following describes the earlier Jobs map before the unified Work Scope and
Package AOI integration; see the current terminology and tracker above. The
authoritative baseline for DC-STAB-02E was `664be515a00d89985005634336392d47a0fb4ca3`.

**All discovered Workspaces across all Pipelines** form the live Jobs scope.
The user does not select a Workspace to make Jobs load. Map-only Pipeline and
individual Workspace visibility toggles **do not filter Jobs**, reset mock
statuses, reread geometry or change membership. Jobs load all member pages and
hydrate unique Packages with bounded concurrency; an incomplete read is an error,
not a successful partial list or an authoritative empty catalogue.

Filters apply to Jobs from all loaded Workspaces, regardless of map visibility.
Supported mock status filters and complete-data Severity ordering apply to this
scope. Lower exact uint64 values have higher priority; `0` is highest; null is
`Unspecified`; `18446744073709551615` is `Not prioritized` and sorts last.
No invented numeric priority bands or unsafe Number rounding are allowed.

The compact live Jobs list/details use `shortId` with Pipeline/Workspace context
and icon Refresh; keyboard focus is retained through rerenders. Job status is
simulated and resettable, not a backend write. Live deadlines, follow-ups, AOI
geometry and unsupported clustering/priority controls remain unavailable.

Both map views use existing ArcGIS `Map`/`MapView`, validating Workspace geometry
from the backend's Esri JSON. All Pipelines start visible; each Workspace may be
hidden independently. Workspace open-Job colors are updated from the last verified
complete Jobs snapshot; normal loading/refresh retains those colors rather than
briefly turning every polygon neutral blue. A changed catalogue identity invalidates
old counts. Main-map LayerView failures create visible notices without disabling
Jobs. Mock map highlights and Job layer writes have separate stale-operation guards.

## Basemaps and Preferences

Basemap Gallery and Expand use public `@arcgis/map-components` components connected
to the retained ArcGIS views. Theme-aware default choice applies until an explicit
user selection; the two maps share basemap settings. Preferences independently
control persistence of theme, basemap and **per-map center/zoom**. Map position
persistence is **implemented but disabled by default**; `main` and `assignment`
slots are independent. Disabling an option clears its persisted values.

## Historical deferred work and prototype

The geometry gaps below record the earlier integration stage; consult the current
tracker and backend gap register for current status.

- `GEO-01` / `GEO-04`: authorized generalized Package and detailed Feature AOI
  coordinates (including spatial reference) are not verified as browser reads.
- `OVERRIDE-01`: historical manual Workspace override proposal, no longer in active
  assignment scope after the 2026-11-12 auto-match-only decision. Reopen only by
  explicit new decision with a verified backend read/write contract.
- Persistent Job status, deadlines, follow-ups, Package name search, operation
  idempotency/version semantics and remaining API gaps are separately documented.
- [FEATURE_WORK_STREAM_SCOPE.md](FEATURE_WORK_STREAM_SCOPE.md) describes the earlier
  mock prototype; its Work stream vocabulary is not a live backend contract.

See [ARCHITECTURE.md](ARCHITECTURE.md), [BACKEND_CONTRACTS.md](BACKEND_CONTRACTS.md)
and [DC_API_BACKEND_GAPS.md](DC_API_BACKEND_GAPS.md) for feature boundaries.
