# Live Workspace geometry

DC-API-04 uses the existing catalogue Workspace detail read; no Feature Service is required.
The live Jobs map displays all available Workspace polygons by default, with Pipeline and
individual Workspace visibility controls. The assignment map renders only the Workspaces from
the selected Package's saved bindings. Neither map invents Package/Job AOIs.

## Data and lifecycle

`catalogueService.workspace()` validates the returned Workspace ID and preserves `esriJSON`.
`shared/api/workspaceGeometry` validates that wire string and creates a 2D horizontal polygon.
`createWorkspaceGeometrySource` deduplicates each batch by the Pipeline/Workspace tuple and
reads with four workers per map. Each read has a 20-second abort deadline. Individual errors
are returned with Workspace context so other valid polygons remain usable. Parent aborts
stop workers from starting further reads. Transport is the existing catalogue client.

`createWorkspaceOverlay` owns one current context generation, its AbortController, prepared
entries and focus intent. SDK preparation never adds graphics. Old overlays are removed as
soon as a new context begins; only the latest complete preparation can replace the layer.
Late success, failure, projection and navigation continuations cannot publish after a newer
selection or destroy. Identical rerenders do not re-fetch or re-zoom. A distinct Package
context reloads even when its relevant Workspace IDs happen to match the previous Package.

There is no persistent/cross-selection cache, since v1 has no geometry revision or ETag.
Only current graphics and SDK projection initialization are retained. An internal catalogue
reload explicitly refreshes the Jobs map geometry without automatically zooming. Assignment Retry map
recreates its view and re-reads the selected context. Explicit Focus actions do not re-read.

`createWorkspaceGraphics` owns a GraphicsLayer, real SDK Polygon conversion, client projection,
finite extent/topology checks and instant `goTo` to an expanded union of displayed polygons.
The focus extent is navigation only, never drawn as a Package AOI. It checks the generation
again after view readiness. SDK layer handles and layers are removed before destroying views.
Application composition and UI never create SDK geometries/layers or call endpoints directly.

## Supported input and limits

- Esri JSON string with nonempty, closed, finite-area straight `rings`; multipart and holes
  retained. Maximum 2,000,000 characters / 100,000 vertices per polygon.
- Explicit horizontal WKID (including latestWKID) or WKT. No default WGS84 assignment and
  no assumption that backend output uses its input fixture SR. The SDK determines projection
  support; unsupported SR/projection assets and invalid projected topology produce errors.
- XY must be finite numbers; WGS84 coordinates must be in longitude/latitude bounds. Optional
  Z/M values are validated as finite/null and omitted from this 2D coverage display. No vertical
  transformation or changes to backend geometries are performed.
- True `curveRings` are explicitly unsupported, even though backend creation accepts them.
  No silent curve flattening, polygon repair, invented rectangle or fallback service is used.
- SDK default equation-based datum transformations are used; grid-based transformations are
  not supplied. Actual projected coverage alignment remains a local acceptance check.

Map status reports coverage counts, a bounded summary of up to three scoped failures plus
an additional-failure count, and the separate missing Package/Job AOI limitation. Working
list/status/binding flows do not depend on map success. The mock assignment map factory and
its Feature/Work stream behavior are unchanged; live errors never invoke that factory.

See [browser verification](../../../../docs/DC_API_GEOMETRY_VERIFICATION.md) and
[backend gaps](../../../../docs/DC_API_BACKEND_GAPS.md).

## Main map default visibility (DC-API-04 correction)

The main map receives the complete Workspace catalogue, grouped under Pipelines and sorted
independently from API order. Every Pipeline starts enabled. Toggling a Pipeline updates only
map coverage; Jobs membership is read from all available Workspaces and does not depend on
map visibility. A full catalogue reload preserves explicit Pipeline exclusions and enables new ones. The
visible Reload button has been removed; refresh the page to fetch a new catalogue.
No Workspace selection or automatic all-coverage fit is required. The existing basemap extent
is retained on initial load and when toggling. Individual Package/Job AOIs remain unavailable
until a verified backend geometry read is provided.

## Main map panel and basemap behavior (v5)

The public Calcite Action Bar occupies a fixed left column. The mutually exclusive
Jobs/Pipelines panel floats over the MapView, without shrinking its container. Zoom
controls are on the unobstructed right. Live Jobs is enabled immediately during map
startup and does not wait for optional Workspace geometry reads.

Both maps share an ArcGIS Basemap Gallery with the same four available options in either
application theme. With no explicit choice, theme changes select Topographic (light) or
Dark Gray (dark). An explicit selection overrides automatic switching until the user
chooses "Use theme default" under Preferences; persistence is independently optional.
