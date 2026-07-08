# Product Review

Product Review is a workspace for comparing extra product data that does not
belong directly in feature attributes.

The first implementation focuses on multi-product history comparison. The
workspace is intentionally broader than History so it can later contain:

- Product history
- IC-ENC reports
- Internal validation reports
- S-57 and S-100 specific report tracks
- Future dynamic review content types

## Current scope

- `/review` route
- `/review/{datasetName&datasetName}` route
- Sidebar product list
- Add, disable and remove product names
- Per-product content toggles
- Multi-product history cards rendered side by side
- Placeholder cards for IC-ENC reports and internal validation reports
- Existing floating Product History panel remains unchanged

## Content ordering

Review content should be rendered in a deterministic order across products so
comparison stays predictable. The current frontend order is:

1. History
2. IC-ENC reports
3. Internal validation reports

Do not order cards based only on the product that happens to load first. Later,
when the backend exposes S-57/S-100 tracks and report metadata, this order should
be moved into a content registry so new review content types can be added without
rewriting the Review board.

## Content height

Review cards should have bounded height so one long content type does not push
other selected content out of view. The current history card is capped in CSS and
scrolls internally. Future report renderers should follow the same model.

A future comparison mode may align common content types across products. For
example, History could be shown in the same row for all products that have
History enabled, while products without History either leave that row empty or
collapse it depending on the selected comparison mode.

## Future scope

The Review board should move toward a dynamic content registry where each
selected product can contain multiple enabled content items. Example future
items:

```js
{
  id: "history:101DK001NORSO",
  productId: "101DK001NORSO",
  type: "history",
  title: "History",
  params: {}
}
```

```js
{
  id: "report:101DK001NORSO:s100:validation:abc123",
  productId: "101DK001NORSO",
  type: "internal-validation-report",
  title: "S-100 validation report",
  params: {
    productType: "S100",
    reportId: "abc123",
    edition: 5,
    update: 2
  }
}
```

The current column layout is meant to be replaced or extended with comparison
modes once report sizes and backend contracts are known.

## Future review sessions

A later implementation can add live review sessions with `BroadcastChannel` so a
main map tab can add products to an already-open Product Review tab. That should
include an explicit session model so users can decide whether to add to an
existing Review tab or open a new one.

## Review layout notes

The board renders enabled content types in a fixed order for each product so
columns remain comparable across products. History is currently constrained to a
fixed review-card height before later content types render below it. This keeps
IC-ENC and internal validation sections aligned even when products have different
history event counts.

Future work should keep the content type order explicit and add global Open all /
Collapse all controls in the Review page header or board toolbar once more
content types are implemented.
