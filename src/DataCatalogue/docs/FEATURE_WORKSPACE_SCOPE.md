# Package, Pipeline, Workspace and Jobs scope

## Current frontend behavior (DC-STAB-02E, 2026-11-04)

This document describes the accepted live frontend behavior after DC-STAB-02D.
Older DC-001 and 2026-10-28 integration candidate requirements are historical where
superseded here. The authoritative implementation baseline for DC-STAB-02E is
`664be515a00d89985005634336392d47a0fb4ca3`.

## Domain and backend ownership

A **Package** is an assignment unit with a generalized AOI reference and detailed
geographic **Features**. A Package may be bound to several **Pipelines**. A
**Workspace** is a Pipeline-scoped geographic work area. The backend computes
Package membership from saved Package/Pipeline bindings and generalized AOI
intersection. Manual Workspace include/exclude is an agreed requirement but has no
verified v1 persistence contract yet; it must not be faked in the frontend.

A **Job** is a Package within one `(packageId, pipelineId, workspaceId)` context.
That complete tuple is its internal identity. Package Severity is shared across
contexts; Job workflow status is independent mock state per tuple and remains in
browser memory only. Ownership/locks are distinct from Job progress.

## Package assignment page

The four-panel page retains independent scrolling, draft navigation decisions,
keyboard/Escape behavior and saved binding reconciliation:

1. **Packages:** paged records with supported Category and Assigned/Not assigned
   filters. Unsupported Package name search stays disabled. Display `shortId`,
   but use canonical `packageId` for API calls and deep links.
2. **Package details:** render language-specific descriptions as **allowlisted
   sanitized HTML**, including useful tables and safe links. Markup is untrusted;
   it is not inserted raw and is not limited to plain text.
3. **Bindings:** Pipeline checkboxes form a Package/Pipeline draft. Derived
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

## Main Jobs map, coverage and filters

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

## Deferred work and historical prototype

- `GEO-01` / `GEO-04`: authorized generalized Package and detailed Feature AOI
  coordinates (including spatial reference) are not verified as browser reads.
- `OVERRIDE-01`: backend durable manual Workspace membership overrides are pending.
- Persistent Job status, deadlines, follow-ups, Package name search, operation
  idempotency/version semantics and remaining API gaps are separately documented.
- [FEATURE_WORK_STREAM_SCOPE.md](FEATURE_WORK_STREAM_SCOPE.md) describes the earlier
  mock prototype; its Work stream vocabulary is not a live backend contract.

See [ARCHITECTURE.md](ARCHITECTURE.md), [BACKEND_CONTRACTS.md](BACKEND_CONTRACTS.md)
and [DC_API_BACKEND_GAPS.md](DC_API_BACKEND_GAPS.md) for feature boundaries.
