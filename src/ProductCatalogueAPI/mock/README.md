# Synthetic mock fixtures

These files are synthetic fixtures for Product Catalogue sources that do not yet have authoritative backend data.

- `paper-charts.geojson` supports `GET /mock/paper-charts`.
- `s102.geojson` supports `GET /mock/s102`.

The routes are available automatically in Development. A non-Development test deployment must explicitly set `MockDataSources:Enabled=true`; the repository default is disabled.

The geometries are deliberately simple rectangles created for repository testing. The identifiers and Product names are synthetic and are not derived from production/chart datasets.

The fixtures exercise source-aware loading, identity, map rendering, filters, Product search, Analyze, Review, and Product Collection behavior. They are not future backend schemas and must not be used to infer Paper Charts or S-102 service contracts.

Compatibility Products use the real backend path. The obsolete generic `/mock/products` route is intentionally not provided.
