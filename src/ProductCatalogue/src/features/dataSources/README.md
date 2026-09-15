# Configurable Product data sources

The source registry owns source transport, normalization, identity, capabilities, filters/search,
workspace availability and active-source lifecycle. The [current contract review](../../../docs/normalized-workflow-frontend-adaptation.md)
records the normalized backend evidence and remaining limitations.

## Sources

| Source       | Production transport                                   | Capability boundary                                                                                        |
| ------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| S-57         | `GET electronicproducts/aoi?productSpecification=S57`  | Read, search, Collection, History, diagnostics, Edition/Update/Cancel Export; Freeze/Unfreeze unavailable. |
| S-101        | `GET electronicproducts/aoi?productSpecification=S101` | Read, search, Collection, History, diagnostics, Edition/Update/Cancel Export and current Freeze/Unfreeze.  |
| Paper Charts | No runtime transport                                   | Synthetic registry fixture retained only for explicit tests; not Main-map/workspace selectable.            |
| S-102        | No runtime transport                                   | Synthetic registry fixture retained only for explicit tests; not Main-map/workspace selectable.            |

Send availability is separately gated by the backend Disabled/Simulation capability and normalized
workflow state. No real IC-ENC delivery or report contract is enabled.

Electronic AOI responses contain Esri geometry and DatasetName/Status/DisplayScale/UsageBand/error
attributes. The scoped server request establishes specification; names and geometry never do.
Bulk AOIs omit version metadata. A generic `electronic-aoi` normalizer validates identity and geometry
and preserves the existing GraphicsLayer/MapView path. There is no duplicate combined production layer.
The isolated compatibility layer adapter is not registered, persisted or used as a failed-source fallback.

## Registry and identity

Source definitions carry loaders, normalizers, layer definitions, identity strategies, filtering,
search, export leaves and content permissions. Feature modules consume these capabilities rather
than branching on source names. A Product identity is `{ sourceId, productKey }`; datasetName is the
public globally unique route identity. Missing/duplicate stable keys reject a source before commit.

Workspace resolution reuses registry loaders independently of Main-map enabled-source selection,
while respecting deployment configuration. Duplicate normalized names across providers fail as
ambiguous. Failures are isolated and cannot invoke another provider's backend route.

## Lifecycle

Each source has a monotonic generation and AbortController. Loading and candidate layer preparation
happen before a guarded synchronous commit. Only a committed generation publishes filters/search,
Collection reconciliation, source state and persistence. Disable/reset invalidates pending work first.

Compatible source layers and Graphics reconcile in place by stable feature identity, preserving
popup/menu DOM. Structural replacements reconcile only the currently open selection; closed or
replaced sessions never reopen later. Scale visibility bindings follow the current layer set.

Failed active refresh retains the previous representation, filters and search index. Failed initial
activation leaves no partial representation. Candidate layers are discarded on failure or supersession.
Source removal closes owned popup/hover state, clears that source's filter/search state and removes
its Collection items without cancelling backend jobs. Reactivation fetches fresh data.

Startup and refresh coordinate independent lookup/source outcomes before publishing completion.

## Filters and Product search

Each active provider has independent fields, facets, selections and counts. S57/S101 declare Status,
Display scale and Usage band using backend lookups. Retired synthetic fixtures do not participate in
runtime filtering. Unsupported/missing optional facets do not invent data.

Electronic defaults retain the conservative Idle exclusion; saved explicit unfiltered state wins.
The final AOI error-only preset remains deferred pending an authoritative classification/policy.
Product search result identity is `[providerId, productKey]`; layer identity identifies the current
representative Graphic, not a separate Product. Product search indexes committed active Graphics only. It does not fetch the workspace catalog or
activate sources. Geographic Locator remains independent.

Navbar Data sources and Filters use the existing coordinator, public Calcite controls and common
Escape/outside-click/focus lifecycle. No private shadow DOM or animation-dependent state is used.

## Persistence

Source state keeps `productCatalogue.dataSources.v1`, now schema 2:

```json
{ "schemaVersion": 2, "initialized": true, "enabledSourceIds": ["s57", "s101"] }
```

New visits use configured available defaults. Version 1 migration retains previously fixed S101
but leaves newly available S57 for explicit activation. Retired synthetic fixture IDs can remain in
older persisted payloads but cannot become active because runtime registry construction no longer
enables those sources. Schema-2 all-off remains all-off. Known configured-out sources retain intent;
unknown IDs are sanitized. Reset uses deployment defaults. Nothing copies a combined source identity
into two standards.

Filter state remains separate at `pc.attributeFilters.v3`, schema 2. The old fixed S101 provider's
filter state migrates to s101, never s57, with explicit new state taking precedence. Pending state
survives temporary activation failure. Authoritative source removal clears its filter intent.

## Synthetic fixture boundary

The application runtime no longer enables Paper Charts or S-102 mocks in Development or through a
Vite build flag. `createDataSourceRegistry()` defaults to authoritative sources only. Tests may opt
into the retained synthetic definitions by explicitly constructing the registry with fixture options.
This test-only path is not used by Main-map or workspace bootstrap.

## Content and exports

Flat Edition/Update leaves are registry configured; backend product resolution owns specification,
mapping, version and candidate checks. User-facing S-101 remains distinct from the backend S100
metadata alias. Cancel Export keeps its presentation while using public CancelExport operation identity.

History and validation use separate `visible`/`implemented` content permissions. Electronic History
preserves BE-108A IDs/Events; diagnostics use public artifact history/download routes. Unsupported
sources return unavailable content without electronic API requests. No Batch 2 producers are added.
