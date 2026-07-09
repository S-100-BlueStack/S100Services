# Products

The Products feature contains shared product-facing frontend helpers that are not owned by the main map, Analyze, Review or Dashboard routes.

## Product catalog picker

`GET /electronicproducts` is used as the lightweight product catalog endpoint for direct Analyze and Review workflows.

Expected lightweight shape:

```json
{ "Data": ["101DK0040943E", "101DK0040944E"] }
```

The shared picker lives in:

```txt
src/features/products/api/productCatalogApi.js
src/features/products/domain/productCatalog.js
src/features/products/ui/productPicker.js
```

Current consumers:

- Analyze sidebar add product form
- Product Review sidebar add product form

The picker must remain lightweight. Do not fetch AOI geometry or full product details just to populate the dropdown.

Typed input is intentionally preserved as a fallback so users can still add products if the catalog endpoint fails or a product is not present in the returned list.

## Terminology

User-facing UI should use `Product` and `Products`, not `Dataset` or `Datasets`.

Code can keep technical identifiers such as `datasetName` where required by backend contracts or normalized product attributes.
