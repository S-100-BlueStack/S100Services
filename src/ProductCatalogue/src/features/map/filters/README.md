# Source-aware Main map filters

The Main map filter subsystem exposes one compact UI with an independent section for every active
filter provider.

## Provider contract

`attributeFilterService.replaceProvider()` receives committed provider metadata:

```js
{
  providerId,
  sourceId,
  label,
  generation,
  layers,
  filterDefinitions,
  defaultExcludedValues,
  useLookupOptions,
  order,
}
```

`providerId` is the filter-state boundary. Runtime sources use their stable registry ID. Production S57/S101 now use registry provider IDs. The legacy fixed S101 Product-corrections
provider is no longer rendered.

Layer matching resolves provider ownership from committed layer objects and layer metadata. The
service does not depend on layer titles or visible DOM state.

## Supported dimensions

The shared field registry currently defines:

- `status` as the ProductState value filter for single-product sources;
- `packageStatus` as the aggregate EncPackageStatus value filter for package sources;
- `displayScale` as a numeric range filter;
- `usageBand` as a value filter.

A value-mode field definition may supply `readValues(graphic, readScalar)`. Its normalized
values feed both matching and contextual facet counts. The ENC package supplies
`readEncPackageStatusFilterValues()` for the dedicated `packageStatus` field: it reads only
`graphic.attributes.workUnitStatus.packageStatus` as normalized from backend
`Attributes.Package.Status`. Neither member ProductState nor top-level `Attributes.Status`
can match a Package-status filter. Unknown/unsupported aggregate status uses a separate
`unknown` value, never Idle. Product sources still read their scalar `status` field.

Aggregate lookup options are Idle (0), Ready (2), InTransit (3), Error (4), and Hold (5).
These numeric IDs are **not** ProductState IDs. An older saved package `status` selection is
sanitized out when its source activates because it is no longer a supported package field;
no value conversion is attempted. Package source defaults exclude Idle (0); ordinary sources
retain ProductState Idle (1) as their default exclusion.

Selections remain provider/value based in schema version 2. No member key or package identity is
stored in filter preferences beyond the existing provider identity.

A source declares only the dimensions supported by its current data contract. Facets are built from
normalized attributes. Missing optional attributes omit the unsupported field for that provider
without affecting other fields or sources.

Electronic providers use authoritative lookup lists for status and usage labels. Runtime
mock sources derive values from their loaded graphics and do not invent absent attributes.

## Context-aware facet counts (F3)

Committed provider facets retain the full option domain, labels, and lookup order. Each call to
`getValuesForField(providerId, fieldName)` derives fresh counts from that provider's current committed
Graphics and filters. The target field ignores its own active filter; all other active dimensions
are ANDed using the same predicate as map matching. Alternatives within a value field remain ORed.
No contextual cache or network request is involved.

Counts for Status/Package status apply Usage band and Display scale; the other dimensions
apply the active status dimension. A package contributes exactly one aggregate status value
regardless of the number or state of its Export Candidates.

Zero-count options remain visible and selectable, including lookup options and unknown values with
fallback labels. Contextual counts never remove fields or shrink the provider's option domain.
Display scale keeps its full numeric domain so a narrowed range can be expanded again. Its preview
sums contextual scalar scale counts inside the preview range and therefore also respects the other
active dimensions. Map-scale hiding/preferences remain a separate lifecycle.

Provider `visibleCount` still applies ALL active filters; `totalCount` still counts provider Graphics.
Counts are derived metadata and are never persisted. The storage key, version 2 snapshot, selected
values/range formats, migration, pending intent, Auto-save, Clear all, and Reset contracts are unchanged.

A range commit retains `commitFilterChange({ rerender: false })`: visibility and persistence use the
existing path once, while `attributeFilterCounts.js` patches only application-owned provider count
text, checkbox count text/zero-count classes, and range preview/summary text. The existing Calcite
slider and its public values remain intact; no focus calls or private shadow DOM access are used.
Checkbox changes retain their existing full render. A closed panel shows fresh counts on its next render.

## Isolation and lifecycle

Selected values, range state, and base facets are stored per provider; contextual facets,
visible counts, and active-filter counts are derived per provider. A filter change in one provider cannot hide graphics or alter counts in another provider.

Provider replacement rebuilds facets only for that provider and reconciles valid selected values.
Authoritative provider removal clears active filters, pending snapshot filters, explicit persisted
provider intent, and layer association. Reactivation therefore starts from the configured provider
defaults instead of reviving state that belonged to the deactivated source.

Temporary first-activation failure uses provider suspension rather than authoritative removal. The
service records a generation tombstone and removes any incomplete runtime provider while retaining
pending or active filter intent as canonical pending state. It emits no persistence-changing event
when only a pending snapshot exists, so a later successful retry reapplies the saved filter.

`Clear all` has different semantics from provider removal. It clears active and pending filter values
while retaining explicit unfiltered intent for every known active or pending provider. Delayed
providers therefore publish with `fields: []` and cannot revive old migrated values or first-visit
defaults. The panel persists that canonical state immediately.

Preferences `Reset filters` is intentionally different from the Filter panel `Clear all`. Reset
returns current providers to their declarative first-visit defaults, clears old snapshot intent, and
lets later providers receive their configured defaults. For electronic sources this restores the
conservative Idle exclusion. Persistence still follows the Filters Auto-save choice.

The service records the latest source operation generation. A stale activation or refresh cannot
publish facets after a newer replacement or removal.

## Persistence

Filter state is separate from data-source activation state.

```text
Storage key: pc.attributeFilters.v3
Schema version: 2
```

Version 2 stores independent provider field state, including explicit providers with `fields: []`.
The established version 1 schema knew only the compatibility filter track and serialized only layers
with active filters. Migration therefore always materializes the known compatibility provider. A
valid version 1 `{ layers: [] }` becomes an explicit unfiltered compatibility provider rather than
reapplying first-visit exclusions.

Version 1 migration changes only compatibility state. New providers retain or receive their own
declarative defaults regardless of whether they publish before or after the compatibility AOI. The
panel immediately rewrites a successful migration as canonical version 2 state, including pending
compatibility state, so persistence is independent of provider startup order. Invalid snapshots are
rejected and removed before declarative first-visit defaults continue.

The normalized adaptation migrates the formerly fixed S101 provider to s101 at the persistence
read boundary. Explicit new s101 state wins; no state is copied into s57. The source first-visit
contract and filter first-visit contract remain independent.

## Initial error-only view

Electronic sources preserve the conservative Idle exclusion. The normalized enum/lookup now
provides status IDs and names, but does not define an AOI error-only/default-filter classification.

`ATTRIBUTE_FILTER_CONFIG.compatibilityProvider.errorOnlyStatusClassifier` is the explicit future
integration point and remains `null`. FI-016 must supply the semantic error classification before an
error-only first-visit preset replaces the current default.

## UI lifecycle

`attributeFilterPanel.js` renders active providers in configured order with source-specific headings,
counts, field controls, and reset actions. Inactive providers are absent.

The panel registers as `filters` with the shared navbar-popover coordinator. Open, close, trigger
toggle, outside click, Escape, keyboard navigation, and focus restoration therefore use the same
lifecycle as other overlapping navbar popovers.

## FI-042 scrollbar presentation

The outer Filter panel scroller and the nested checkbox option lists use the neutral shared
`pc-scrollbar` contract established by FI-035. The class styles only application-owned elements that
already own overflow; it does not change panel or option-list sizing, overflow ownership, filtering
state, rerender behavior, or private Calcite internals.
