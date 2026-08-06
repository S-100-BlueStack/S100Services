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

`providerId` is the filter-state boundary. Runtime sources use their stable registry ID. The combined
AOI compatibility path uses the Product-corrections layer adapter and is not persisted as a permanent
source.

Layer matching resolves provider ownership from committed layer objects and layer metadata. The
service does not depend on layer titles or visible DOM state.

## Supported dimensions

The shared field registry currently defines:

- `status` as a value filter;
- `displayScale` as a numeric range filter;
- `usageBand` as a value filter.

A source declares only the dimensions supported by its current data contract. Facets are built from
normalized attributes. Missing optional attributes omit the unsupported field for that provider
without affecting other fields or sources.

The compatibility provider may use authoritative lookup lists for status and usage labels. Runtime
mock sources derive values from their loaded graphics and do not invent absent attributes.

## Isolation and lifecycle

Selected values, range state, facets, visible counts, and active-filter counts are stored per
provider. A filter change in one provider cannot hide graphics or alter counts in another provider.

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

The source first-visit contract and filter first-visit contract must evolve independently.

## Initial error-only view

FI-011B preserves the established compatibility default exclusion. It does not define a new error
status list because the authoritative status classification is not available.

`ATTRIBUTE_FILTER_CONFIG.compatibilityProvider.errorOnlyStatusClassifier` is the explicit future
integration point and remains `null`. FI-016 must supply the semantic error classification before an
error-only first-visit preset replaces the current default.

## UI lifecycle

`attributeFilterPanel.js` renders active providers in configured order with source-specific headings,
counts, field controls, and reset actions. Inactive providers are absent.

The panel registers as `filters` with the shared navbar-popover coordinator. Open, close, trigger
toggle, outside click, Escape, keyboard navigation, and focus restoration therefore use the same
lifecycle as other overlapping navbar popovers.
