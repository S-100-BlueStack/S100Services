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

## Phase 1 scope

- `/review` route
- `/review/{datasetName&datasetName}` route
- Sidebar product list
- Add, disable and remove product names
- Multi-product history cards rendered side by side
- Existing floating Product History panel remains unchanged

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
