# Configurable Product data sources

This feature area owns the FI-011 configurable Product data-source foundation for the Product
Catalogue Main map.

FI-011A established the source registry, persisted activation state, independent loading, guarded
layer commits, and source-aware identity. FI-011B added source-aware filters, loaded-feature Product
search, and shared navbar-popover coordination. FI-011C adds central Product-context resolution,
capability-specific popup actions, and a declarative source-aware Export menu. FI-011 remains
incomplete because workspace/history propagation and authoritative S-57/S-101 transport are still
deferred.

## Logical source model

The permanent registry contains these independent Product sources:

| Source ID      | Label          | Runtime availability | Loader                                      |
| -------------- | -------------- | -------------------- | ------------------------------------------- |
| `s57`          | `S-57`         | Unavailable          | Pending authoritative backend read contract |
| `s101`         | `S-101`        | Unavailable          | Pending authoritative backend read contract |
| `paper-charts` | `Paper Charts` | Development only     | `GET /mock/paper-charts`                    |
| `s102`         | `S-102`        | Development only     | `GET /mock/s102`                            |

There is no permanent combined ENC source, toggle, identity, or storage entry. The existing combined
AOI flow remains a temporary compatibility path and must not be used to infer or duplicate S-57 and
S-101 Products.

The inspected compatibility payload exposes normalized Product attributes but no authoritative
Product-standard discriminator. A client-side S-57/S-101 split is therefore intentionally absent.

## Registry and capabilities

`config/dataSourceRegistry.js` is the declarative source boundary. Each source definition contains:

- stable identity and user-facing label;
- configuration, availability, selection, and first-visit defaults;
- loader, normalizer, and source-aware Product identity contracts;
- source-owned layer definitions;
- conservative source and layer capabilities;
- declarative popup Export configuration;
- source-specific filtering definitions;
- source-specific loaded-feature search fields;
- Product type and active-only refresh strategy.

Filtering, search, Product-context, and Export integrations consume registry and layer metadata.
Feature modules must not add source-ID conditionals for Paper Charts, S-102, or future sources. A
future source participates by supplying declarative capabilities, provider metadata, and optional
Export leaves.

The FI-011B mock-source configuration is intentionally limited to attributes present in the current
fixtures:

| Source       | Filter dimensions                   | Loaded-feature search |
| ------------ | ----------------------------------- | --------------------- |
| Paper Charts | Status, Display scale, Usage band   | Yes                   |
| S-102        | Status                              | Yes                   |
| S-57 / S-101 | Deferred with authoritative loaders | Deferred              |

Missing optional attributes omit only the unsupported facet; they do not fail source loading or
filtering.

## Compatibility AOI adapter

The current `loadAppData -> bindDataToMap` path remains responsible for the combined AOI
representation and established Product workflows. It is not registered as a user-selectable FI-011
source and has no data-source preference key.

`features/map/services/compatibilityDerivedStateAdapter.js` adapts the committed compatibility layer
to the shared filter and Product-search provider contracts. It uses the logical Product-corrections
layer metadata rather than introducing a permanent combined source identifier.

Compatibility refresh continues to preserve popup, action, filter, and scale behavior.
`features/products/domain/productContext.js` admits this path only through an explicit internal
`compatibility-aoi` adapter based on Product-corrections layer metadata. The adapter is not a registry
source or storage value. Reconciliation remains limited to compatibility layer IDs, so runtime-source
layers are not removed or rebuilt by the AOI refresh path.

## Lifecycle and guarded derived state

Each runtime source owns a monotonic operation generation and an `AbortController`.

Activation and refresh follow this boundary:

```text
fetch
-> normalize and validate identity
-> prepare hidden candidate layers off-map
-> validate source generation
-> guarded synchronous map/registry commit
-> publish in-memory enabled/loaded state
-> emit committed source lifecycle event
-> atomically publish source filter facets and search entries
-> persist selected source state
```

`services/dataSourceDerivedStateCoordinator.js` subscribes to committed `activated`, `refreshed`, and
`deactivating` lifecycle events. It updates only layers whose metadata declares the corresponding
filter or search capability.

The filter service and search index maintain their own latest generation per provider. A stale
refresh cannot republish old facets or search entries after a newer refresh, disable, reset, or
reactivation. Provider replacement is atomic, so the UI never combines old and new entries for one
source.

A failed first activation leaves that source disabled with no partial layer. Its `activation-failed`
lifecycle event invalidates transient derived-state generations and removes any incomplete search
provider, but preserves pending filter snapshot intent. A later successful retry therefore reapplies
the saved provider filters regardless of whether persistence loaded before or after the failure.

A failed refresh of an active source emits no deactivation event and retains its last successful
representation, filters, and search index. Candidate layers are destroyed when stale, invalid,
failed, or superseded.

## Activation and deactivation effects

Activation or successful refresh:

- commits fresh source-owned layers;
- rebuilds only that source's filter facets;
- replaces only that source's Product-search entries;
- preserves all other source filter and search state;
- publishes no duplicate search suggestions.

Authoritative deactivation or reset:

- invalidates pending source work before cleanup;
- removes active and pending filter state plus persisted provider intent for that source;
- removes source-owned layers;
- closes a popup owned by the source;
- clears popup-local Export UI state without cancelling backend-authoritative jobs;
- clears selected and hover highlight state owned by the source;
- removes the source's runtime filter section and filter state;
- removes the source's Product-search entries and stale result selection;
- leaves other sources unchanged.

Reactivation fetches fresh data and begins with the source's configured filter defaults. Runtime
filter state from a disabled source is not retained.

## Source-aware filters

The Main map keeps one compact filter popover with independent sections per active provider.
`features/map/filters/attributeFilterService.js` owns provider facets, selected values, range state,
per-source counts, matching, persistence snapshots, and generation guards.

The compatibility AOI provider keeps its established default exclusion and lookup-backed status
options. FI-011B does not invent an error-state list. The authoritative error-only first-visit preset
remains blocked by FI-016. `ATTRIBUTE_FILTER_CONFIG.compatibilityProvider.errorOnlyStatusClassifier`
is the explicit integration point and remains `null`.

Filter persistence is a separate versioned user-state contract from source activation persistence:

```text
pc.attributeFilters.v3
```

The filter snapshot schema is version 2 and stores provider-specific fields, including explicit empty
provider state. Version 1 knew only the compatibility filter path, so even `{ layers: [] }` migrates
to an explicit unfiltered compatibility provider. Migration is canonicalized before delayed AOI
publication, while newer source providers continue to use their own declarative defaults. Existing
valid user filter state takes precedence over compatibility defaults.

See `features/map/filters/README.md` for the provider and persistence contract.

## Loaded-feature Product search

`features/map/search/sourceAwareProductSearchIndex.js` indexes only graphics currently committed for
active providers. Results are keyed by provider plus logical Product key, so multiple source-owned
layers cannot create duplicate suggestions for one Product. Layer identity remains deterministic
navigation metadata and refresh replaces the current representative Graphic atomically. It does not
query connected data, the Product catalog endpoint, or a backend search
endpoint.

Each result retains provider ID, source ID, stable Product key, generation, the representative layer
ID, and the exact Graphic reference. The logical result ID is the serialized tuple
`[providerId, productKey]`. `layerId` is only deterministic navigation metadata for the current
representative Graphic, so identical visible labels cannot resolve to the wrong Product.

Selecting a result reuses the existing map navigation, selected-Graphic, and popup flow. Search never
enables a disabled source. A stale result that disappears before selection is handled without a
runtime error or source activation.

See `features/map/search/README.md` for the index and selection contract.

## Navbar popover coordination

Filters and Data sources register with the shared coordinator in
`shared/ui/navbarPopoverCoordinator.js`. Only one registered overlapping navbar popover can be open.
The coordinator owns one document click listener and one document keydown listener for its full
lifetime.

Opening one participant closes the active participant first. Trigger toggling, outside click, Escape,
keyboard behavior, ARIA state, and focus restoration remain participant-owned through the shared
lifecycle contract. Non-navbar panels are not registered and are unaffected.

See `shared/ui/README.md` for the coordinator contract.

## Persistence

Data-source activation uses this independent versioned browser key:

```text
productCatalogue.dataSources.v1
```

Schema:

```json
{
  "schemaVersion": 1,
  "initialized": true,
  "enabledSourceIds": ["paper-charts", "s102"]
}
```

Rules:

- only currently selectable sources can become active runtime sources;
- zero selectable sources do not create a false initialized empty state;
- first visit with choices uses all configured and available deployment defaults;
- an explicit persisted all-off choice wins over defaults;
- valid existing state does not silently enable later registry entries;
- unavailable known IDs preserve user intent but are not active in the current deployment;
- unknown, invalid, duplicate, or removed IDs are sanitized safely;
- local and global reset use the same controller defaults contract;
- no migration copies a combined AOI preference into S-57 and S-101.

Source activation state and source-specific filter state remain separate contracts and versions.

## Product identity

Every normalized runtime Product has an internal source-aware identity equivalent to:

```js
{
  sourceId,
  productKey,
}
```

The Product key resolves from a stable source-declared field. Array position is never an identity
fallback. Missing or duplicate stable identity rejects the source payload before candidate commit.
The same Product key may exist in different sources without colliding, even though the current domain
contract states that dataset names are globally unique.

## Product context, popup actions, and Product Collection boundary

`features/products/domain/productContext.js` resolves every popup Product from Graphic attributes,
layer metadata, and the registry-installed source contract. The context retains `sourceId`, stable
`productKey`, dataset name, Product type, layer ID, capabilities, Graphic, and declarative Export
configuration. Missing, unknown, attribute-only, or mismatched source metadata fails closed for
backend-dependent actions.

Paper Charts and S-102 remain visualization-only mock sources. Their layer capability
`supportsPopupActions: true` permits the safe custom action bar needed for disabled Export
placeholders; it does not grant Product Collection or backend Product workflows. Product Collection
is resolved separately through `ProductContext.capabilities.productCollection`, which remains `false`
for both mock sources. Their source-aware popups expose only an `Export...` root with visible disabled
`Edition` and `Update` placeholders. Their capabilities keep these workflows disabled:

- Freeze and Unfreeze;
- Send to IC-ENC;
- Cancel Export / legacy Rollback dispatch;
- History and reports;
- real Edition and Update export execution;
- Product Collection;
- Analyze and Review;
- compatibility backend refresh and job subscriptions.

The placeholder leaves have no handler or backend target. They cannot call compatibility endpoints,
enter loading state, create success/error notices, or block unrelated Products. Product search opens
the same capability-gated popup and cannot bypass availability.

Existing compatibility AOI Products keep Product Collection, popup mutations, Analyze, Review,
History, and operation workflows. Their simplified Export menu contains only `Edition` and `Update`.
`Edition` keeps the existing S100 wire target; `Update` remains disabled because no implemented Update
contract exists. This does not represent a source-correct S-57/S-101 split.

## Development-only mocks

ProductManagerAPI registers these routes only in Development:

```text
GET /mock/paper-charts -> mock/some_products.geojson
GET /mock/s102         -> mock/products.geojson
```

The fixtures validate the generic multi-source frontend. They are not production API contracts and
must not define future Paper Charts or S-102 backend schemas.

## Deferred to FI-011D and later packages

FI-011C does not implement:

- authoritative separate production S-57 or S-101 reads or export targets;
- a heuristic split of the compatibility AOI response;
- Product Collection propagation for runtime sources;
- Analyze or Review integration for runtime sources;
- History, IC-ENC report, or internal-validation integration for runtime sources;
- real Paper Charts or S-102 Product mutations or Export dispatch;
- related Products;
- route/session identity migration;
- the final error-only filter preset and status palette;
- connected-data, Product-catalog, Locator, or backend Product search;
- final onboarding and all-source workflow regression completion.

Do not enable a deferred capability until its source-specific backend and workflow contract exists.
