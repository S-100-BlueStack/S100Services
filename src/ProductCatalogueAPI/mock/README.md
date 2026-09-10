# Development mock fixtures

These files are synthetic Development-only fixtures for Product Catalogue sources that do not yet have authoritative backend data.

- `paper-charts.geojson` supports the `GET /mock/paper-charts` Development route.
- `s102.geojson` supports the `GET /mock/s102` Development route.

The geometries are deliberately simple rectangles created for repository testing. The identifiers and Product names are synthetic and are not derived from production/chart datasets.

The fixtures exercise source-aware loading, identity, map rendering, filters, Product search, Analyze, Review, and Product Collection behavior. They are not future backend schemas and must not be used to infer Paper Charts or S-102 service contracts.

Compatibility Products use the real backend path. The obsolete generic `/mock/products` Development route is intentionally not provided.
