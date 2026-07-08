# Product Review

Product Review is a workspace for comparing product-specific data that does not
belong directly in main map feature attributes.

It currently supports:

- Multiple products in one Review page
- Per-product content toggles
- Product History cards
- Placeholder cards for IC-ENC reports
- Placeholder cards for internal validation reports
- Fixed content ordering and bounded content heights for comparison
- A lightweight review session channel for sending products from the main map to
  an already open Review tab
- Explicit `New Review` and `Update Review` collection actions when a Review tab
  is already open

The existing floating Product History panel is still the quick-view workflow for
one selected product on the main map. Product Review is the multi-product and
multi-content workspace.

## Review sessions

A Review page registers itself as an active local Review session while it is
open. The Product Collection tray can then communicate with the latest active
Review tab via `BroadcastChannel`.

When no Review tab is open, the Product Collection tray shows `Review` and opens
a new Review tab. When a Review tab is already open, the tray shows:

- `New Review`: opens a new Review tab with the current collection.
- `Update Review`: replaces the latest active Review tab with the current
  collection, keeping the Review page 1:1 with the collection at the time of the
  click.

This is intentionally lightweight. It does not yet expose a user-facing session
picker and it does not persist Review sessions permanently. If multiple Review
tabs are open, `Update Review` targets the most recently active session.

Future session work can add:

- Named Review sessions
- A session picker in the Product Collection tray
- Session metadata such as product count, last updated time and window title
- Explicit add/replace controls per selected session

## Content model

Review content types should stay dynamic. The current frontend content types are:

1. History
2. IC-ENC reports
3. Internal validation reports

The ordering is fixed so product columns remain comparable even when individual
products have different content toggles enabled.

History uses bounded height so long histories do not push later content types out
of alignment. Future report cards should use the same pattern.

## Backend integration

The Review page currently reuses the existing Product History API and placeholder
report cards. When backend contracts are ready, add loaders/renderers per content
type rather than hardcoding report-specific behavior into the core Review page.
