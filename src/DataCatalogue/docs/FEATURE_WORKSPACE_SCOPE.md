## Live Package geometry clarification (2026-11-05)

A Package's rectangular `aoi` is not a Workspace polygon; detailed Feature
points, curves and surfaces are also not Workspace membership. DC-API-06
renders the **selected** Package from the verified read-only geometry route,
while existing Workspace overlays continue to show the backend's effective
saved Pipeline bindings/intersections. `detailedGeometry: null` means no
additional detailed geometry, not missing Package identity or failed bindings.
Manual Workspace overrides were considered in an earlier prototype but are not
part of the current 2026-11-12 auto-match-only requirement.

---

# Package, Workstream, Workspace and contextual Job scope

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
accepted but does not filter data. See the latest `PROJECT_TRACKER.md` and
`ARCHITECTURE.md` entries for current behavior. Older DC-001, DC-STAB-02E and
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
browser memory only. Ownership/locks are distinct from Job progress.

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
4. **Map:** the assignment map renders Workspace geography derived from saved
   binding intersections only. A missing Package or Job AOI is not invented from
   Workspace geography, metadata references or a hypothetical Feature Service.

Save performs a preflight read, independent add/remove mutations and authoritative
reconciliation. Partial definitive errors preserve individual results. Binding
requests and response-body reads have a 30-second frontend deadline. A timed-out
or otherwise uncertain mutation stops remaining writes and preserves the desired
draft until **Check saved bindings** runs a read-only reconciliation. **Discard
local draft** is an explicit local-only action, not a backend rollback. A server
write may still complete late; version/idempotency semantics are backend-owned.

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
