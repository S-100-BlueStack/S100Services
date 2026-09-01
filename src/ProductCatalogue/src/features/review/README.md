# Product Review

Product Review is a workspace for comparing product-specific data that does not belong directly in main map feature attributes.

It currently supports:

- Multiple products in one Review page
- Per-product content toggles
- Product History cards
- Placeholder cards for IC-ENC reports
- Placeholder cards for internal validation reports
- Fixed content ordering and bounded content heights for comparison
- Opening new Review tabs from the Product Collection tray

The existing floating Product History panel is still the quick-view workflow for one selected product on the main map.

Product Review is the multi-product and multi-content workspace.

## Terminology

User-facing Review UI should use `Product` and `Products`, not `Dataset` or `Datasets`.

Code can keep technical identifiers such as `datasetName` where required by backend contracts or normalized product attributes, but labels, buttons, empty states and help text should use product terminology.

## Collection workflow

The Product Collection tray can open a new Review tab with the current collection. Review pages are intentionally independent once opened. Users can adjust the product list and content toggles directly on each Review page.

This keeps the workflow predictable and avoids hidden cross-tab synchronization. Future work can reintroduce live Review sessions if there is a clear need for it.

## Shared workspace Product picker

Review uses the same source-aware workspace catalog/resolver as Analyze:

```txt
src/features/products/services/workspaceProductService.js
```

The catalog merges the compatibility `GET /electronicproducts` provider with runtime-available registry
workspace providers for Paper Charts and S-102. Product names remain the primary picker label while source
metadata is retained by the runtime model. Provider failures are isolated and stale catalog generations
cannot overwrite newer state.

The workspace catalog is not tied to Main map enabled-source localStorage. A source disabled on the Main
map can still be added in an already open or directly opened Review workspace when its workspace provider
is runtime-available. S-57 and S-101 remain absent as independent sources until authoritative read/catalog
contracts exist.

## Content model

Review content types should stay dynamic.

The current frontend content types are:

1. History
2. IC-ENC reports
3. Internal validation reports

The ordering is fixed so product columns remain comparable even when individual products have different content toggles enabled. History uses bounded height so long histories do not push later content types out of alignment.

Future report cards should use the same pattern.

## Backend integration

The Review page currently reuses the existing Product History API and placeholder report cards.

When backend contracts are ready, add loaders/renderers per content type rather than hardcoding report-specific behavior into the core Review page.

## FI-011D source-aware Review content

Review uses the same workspace Product resolver/catalog as Analyze. Compatibility Product History
continues to load through the existing history endpoint. Paper Charts and S-102 resolve as real
workspace Products but History, IC-ENC reports, and Internal validation render declarative unavailable
states without compatibility backend requests. Per-Product load state distinguishes `loaded`,
`unavailable`, and `failed`, so mixed Review columns remain independent. Product removal/disable and
existing request guards continue to invalidate stale publication. Main-map source visibility does not
control an already opened Review workspace. FI-019 routing remains deferred.
