# Configurable Product data sources

This feature area contains the FI-011A generic data-source foundation for the Product Catalogue
Main map.

FI-011 is not complete. This foundation deliberately keeps the existing combined AOI flow outside
the permanent source registry until the backend exposes authoritative S-57 and S-101 read
contracts or an explicit discriminator.

## Logical source model

The target registry contains these independent Product sources:

| Source ID      | Label          | FI-011A runtime availability | Loader                                      |
| -------------- | -------------- | ---------------------------- | ------------------------------------------- |
| `s57`          | `S-57`         | Unavailable                  | Pending authoritative backend read contract |
| `s101`         | `S-101`        | Unavailable                  | Pending authoritative backend read contract |
| `paper-charts` | `Paper Charts` | Development only             | `GET /mock/paper-charts`                    |
| `s102`         | `S-102`        | Development only             | `GET /mock/s102`                            |

There is no permanent `enc`, `enc-products`, or `ENC Products` runtime source, toggle, identity,
or storage entry. The combined AOI endpoint remains a temporary compatibility path and must not be
used to infer or duplicate S-57 and S-101 Products.

The inspected AOI frontend contract normalizes `datasetName`, `displayScale`, `usageBand`, and
`status`, but it does not expose an authoritative Product-standard discriminator. Client-side
S-57/S-101 separation is therefore intentionally not implemented.

## Registry

`config/dataSourceRegistry.js` is the declarative source boundary. A source definition contains:

- stable `id` and user-facing `label`;
- `enabledByConfiguration`, `availability`, and `userSelectable` state;
- first-visit `defaultEnabled` policy;
- loader and normalizer descriptors;
- source-aware identity strategy;
- one or more owned logical layer definitions;
- conservative source and layer capabilities;
- Product type metadata;
- active-only refresh strategy.

UI and workflow code should consume registry metadata and capabilities rather than adding scattered
source-ID conditionals. A future source such as S-122 should be added through the registry and the
corresponding provider/normalizer contract.

## Compatibility AOI boundary

The current `loadAppData -> bindDataToMap` flow remains responsible for the existing combined AOI
representation and current Product workflows. It is not registered in the FI-011 source registry and
has no data-source preference key.

FI-011A changes compatibility refresh only where required to keep the boundary safe: in-place
reconciliation and fallback rebuild select the requested compatibility layer IDs instead of treating
all registered source layers as one structure. This prevents compatibility refresh from deleting or
rebuilding Paper Charts or S-102 layers.

When independent S-57 and S-101 backend reads are available, a later FI-011 package can replace the
compatibility loader with source-owned providers without changing the generic controller contract.

Main-map startup begins compatibility AOI loading and runtime-source initialization as independent
settled tasks. Runtime sources can therefore load, update the Data sources panel, and retain their
layers while the compatibility request is retrying or has failed permanently. The compatibility
pipeline remains the sole owner of the existing fullscreen startup progress and failure state;
source-specific failures remain owned by the source controller and notice infrastructure. The
existing bootstrap starts the shared automatic refresh coordinator only after startup has settled,
and the coordinator keeps at most one active timer.

## Lifecycle and concurrency

Each runtime source owns a monotonic operation generation and an `AbortController`.

Activation and refresh follow this boundary:

```text
fetch
-> normalize and validate identity
-> prepare hidden candidate layers off-map
-> validate source generation
-> guarded synchronous map/registry commit
-> publish enabled/loaded/persisted state
```

Disable and reset increment the source generation before removing runtime state. Older activation or
refresh work cannot publish graphics, visibility, enabled state, persisted state, or errors after it
has been superseded.

Candidate layers are always destroyed when they are stale, invalid, fail commit, or are replaced.
A failed first activation leaves that source disabled with no partial layer. A failed refresh of an
already active source retains the previous successful representation.

## Persistence

Data-source selection uses this versioned browser key:

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
- a deployment with zero runtime-selectable sources does not create or rewrite an initialized empty
  state, so a later deployment with real loaders remains eligible for first-visit defaults;
- first visit with at least one choice uses all configured and available deployment defaults;
- a valid persisted state, including an explicit all-off choice made while choices existed, wins over
  defaults;
- an existing valid state does not silently enable later registry entries;
- known selection intent is preserved while a source is temporarily unavailable, but unavailable
  IDs are never treated as active in the current deployment;
- unknown, removed, invalid, or duplicate IDs are ignored and can be sanitized when a deployment
  again has selectable sources;
- invalid JSON, invalid shape, storage errors, and unsupported versions fail safely to current
  deployment defaults without creating false state when no choices exist;
- local `Reset to defaults` and global Preferences reset both use the same controller contract and do
  not create initialized state in a zero-choice deployment;
- no migration copies a combined AOI boolean into S-57 and S-101.

## Product identity

Every normalized Product has an internal source-aware identity equivalent to:

```js
{
  sourceId,
  productKey,
}
```

The deterministic serialized representation is a JSON tuple such as:

```text
["paper-charts","DK-PAPER-001"]
```

`productKey` resolves from a stable field declared by the source strategy, currently:

1. `productKey`;
2. `datasetName`;
3. `productName`;
4. `OBJECTID`;
5. stable `id` property;
6. stable GeoJSON `feature.id`.

Property-name matching is case-insensitive and separator-insensitive. Array position is never an
identity fallback. Missing stable identity or duplicate identity inside one source rejects the full
source payload before candidate preparation. The same Product key in two sources remains distinct.
Dataset names are globally unique by the current domain contract, but runtime state remains
source-aware.

## Refresh semantics

The refresh coordinator owns the single automatic refresh timer for the Main map:

- the compatibility AOI refresh continues to run with its established popup/filter/scale behavior;
- only enabled FI-011 runtime sources are refreshed;
- disabled sources are not fetched in the background;
- reactivation always fetches fresh data;
- source refreshes run independently so one mock failure does not prevent other sources or the
  compatibility AOI flow from completing;
- automatic source refresh failures are silent except for console diagnostics;
- manual failures use the existing notice infrastructure;
- refresh does not use the fullscreen startup loader.

## Capabilities

Paper Charts and S-102 are visualization-only mock sources in FI-011A. They use a safe fields popup
and do not expose custom Product actions. Their source and layer capabilities disable:

- Freeze and Unfreeze;
- Send to IC-ENC;
- Cancel Export / legacy Rollback dispatch;
- History;
- IC-ENC reports;
- internal validation;
- Edition and Update export execution;
- Product Collection, Product search, Analyze, and Review integration.

The popup-header Product Collection action resolves `supportsPopupActions` from the selected Graphic
and its ArcGIS layer metadata. Unsupported sources remove any stale collection action and fail closed
again when the action is invoked. `Copy dataset name` remains independent from this capability.

Do not enable a capability until its source-specific backend and workflow contract exists. Existing
combined AOI Products continue using the current compatibility capabilities and endpoints.

## Deactivation hooks

`services/dataSourceLifecycle.js` provides a central subscription boundary. FI-011A uses the
`deactivating` hook to clear source-related popup, hover, selected-highlight, and locked-highlight
state without making the Data sources panel import map feature modules directly.

Later FI-011 packages can subscribe Product Collection, search, filters, Analyze, Review, History,
and operation-state cleanup to the same lifecycle boundary.

## Development-only mocks

ProductManagerAPI registers these routes only when `app.Environment.IsDevelopment()` is true:

```text
GET /mock/paper-charts -> mock/some_products.geojson
GET /mock/s102         -> mock/products.geojson
```

The fixtures verify the generic multi-source runtime only. They are not production API contracts and
must not be used as evidence for future Paper Charts or S-102 backend shapes.

## Deferred to later FI-011 packages

FI-011A does not implement:

- independent S-57 or S-101 transport;
- a heuristic split of the current combined AOI response;
- source-specific filters;
- Product search aggregation;
- Product Collection cleanup or propagation;
- Analyze/Review source propagation;
- History/report unavailable states;
- source-specific popup action and export dispatch;
- related Products;
- canonical source-aware route migration;
- final all-source onboarding and full FI-011 regression acceptance.

These remain gated by FI-011B and later slices plus the required backend contracts.
