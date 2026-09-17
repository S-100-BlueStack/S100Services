# Product Review

Product Review is a workspace for comparing product-specific data that does not belong directly in main map feature attributes.

It currently supports:

- Multiple products in one Review page
- Per-product content toggles
- Product History cards
- Placeholder cards for IC-ENC reports
- Public validation diagnostic downloads for supported electronic Products
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

The picker loads the lightweight `GET electronicproducts` dataset-name list. Review resolves only each
selected Product through `GET electronicproducts/{datasetName}/aoi`; the targeted response supplies the
authoritative `ProductSpecification` used to select the registry source. Review therefore does not load
the complete S57 and S101 AOI catalogs during workspace startup.

Workspace resolution is not tied to Main-map enabled-source localStorage and does not infer source from
dataset-name conventions. Backend identity conflicts, malformed targeted responses and unavailable
deployment-configured sources fail closed rather than falling through another source.

## FI-036 compact sidebar presentation

The route already identifies Product Review, so the sidebar omits the repeated visible workspace
eyebrow, title, and explanatory description while retaining an accessible `Product Review workspace
controls` landmark name. The shared Product picker keeps its accessible `Add product` name but suppresses
its normal visible label and instructional help for Review. Loading, catalog failure, invalid Product,
and already-selected Product messages remain visible when relevant.

Review explicitly opts the shared Product picker into its anchored results-overlay presentation. The
listbox is positioned relative to the picker control and overlays the `Products` section without
changing sidebar layout. Analyze and other picker consumers retain the default in-flow presentation.

The existing manual Refresh action is an icon-only native button in the `Products` header immediately
before the counter. Its event, accessible name, title, loading/disabled rules, and FI-022 full-refresh
lifecycle are unchanged. The sidebar retains the shared `pc-scrollbar` contract and does not change
Product composition, content toggles, targeted source resolution, automatic freshness, routing, or
independent content failures.

## FI-041 Product-list interaction preservation

Per-Product History, IC-ENC, and Validation toggles still update the authoritative Review state and
rerender the board and sidebar. Before that specific synchronous render, Review captures the Product
list's `scrollTop` plus the focused Product/content-type identity. The accepted replacement DOM restores
the scroll offset and focuses the corresponding toggle with `preventScroll` immediately after render.

The snapshot is passed only through the current content-toggle render call. It is not global, delayed,
or reused by add/remove, route replacement, manual Refresh, automatic freshness, or teardown, so an old
interaction cannot restore state into a newer Review composition or session.

## Content model

Review content types should stay dynamic.

The current frontend content types are:

1. History
2. IC-ENC reports
3. Internal validation reports

The ordering is fixed so product columns remain comparable even when individual products have different content toggles enabled. History uses bounded height so long histories do not push later content types out of alignment.

Future report cards should use the same pattern.

## Backend integration

Review reads Product History and validation artifact history independently. A failed History request
retains resolved Product context and successful diagnostics; failed artifacts do not discard History.
IC-ENC reports remain unavailable. Diagnostic download URLs use the configured API base.

Content loaders remain capability-gated. No unsupported source may call an electronic backend route.

## FI-011D source-aware Review content

Review uses the same workspace Product resolver/catalog as Analyze. S57/S101 Product History
loads through the existing history endpoint with explicit source permission. Paper Charts and S-102 resolve as real
workspace Products but History, IC-ENC reports, and Internal validation render declarative unavailable
states without compatibility backend requests. Per-Product load state distinguishes `loaded`,
`unavailable`, and `failed`, so mixed Review columns remain independent. Product removal/disable and
existing request guards continue to invalidate stale publication. Main-map source visibility does not
control an already opened Review workspace.

## Public route

The canonical route is `/Review?Datasets=ProductA,ProductB`. See
[workspace routing](../../shared/routing/README.md) for the shared URL boundary, local picker
synchronization, and temporary legacy-path compatibility. Content toggles remain local state.
