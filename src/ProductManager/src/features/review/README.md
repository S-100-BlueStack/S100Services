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

The existing floating Product History panel is still the quick-view workflow for one selected product on the main map. Product Review is the multi-product and multi-content workspace.

## Collection workflow

The Product Collection tray can open a new Review tab with the current collection.

Review pages are intentionally independent once opened. Users can adjust the product list and content toggles directly on each Review page.

This keeps the workflow predictable and avoids hidden cross-tab synchronization. Future work can reintroduce live Review sessions if there is a clear need for it.

## Content model

Review content types should stay dynamic. The current frontend content types are:

1. History
2. IC-ENC reports
3. Internal validation reports

The ordering is fixed so product columns remain comparable even when individual products have different content toggles enabled. History uses bounded height so long histories do not push later content types out of alignment. Future report cards should use the same pattern.

## Backend integration

The Review page currently reuses the existing Product History API and placeholder report cards.

When backend contracts are ready, add loaders/renderers per content type rather than hardcoding report-specific behavior into the core Review page.
