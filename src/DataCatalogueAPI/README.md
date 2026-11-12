# DataCatalogueAPI

A .NET 10 controller-based REST API with API versioning, OpenAPI document generation,
Serilog logging, HTTPS, and two browsable documentation UIs (Swagger UI and Scalar).


| Purpose            | URL                                            |
| ------------------ | ---------------------------------------------- |
| Scalar             | <https://localhost:51849/scalar>                |
| Swagger UI         | <https://localhost:51849/swagger>               |
| OpenAPI v1 document| <https://localhost:51849/openapi/v1.json>       |
| OpenAPI v2 document| <https://localhost:51849/openapi/v2.json>       |
| Health check       | <https://localhost:51849/health>                |

## API route base and IIS hosting

Controller route templates are relative to the ASP.NET Core application root.
Direct Kestrel hosting exposes `/v1/...` and `/v2/...`. With an IIS Application
mounted at `/api`, IIS supplies the `PathBase` and the **public** URLs are
`/api/v1/...` and `/api/v2/...`. Do not add `/api` to controller attributes or
configure an extra `/api` with `UsePathBase` in the hosted API.

| Resource | Direct Kestrel | IIS Application `/api` |
| --- | --- | --- |
| Pipelines | `/v1/pipelines` | `/api/v1/pipelines` |
| Products v2 | `/v2/products` | `/api/v2/products` |
| OpenAPI v1 | `/openapi/v1.json` | `/api/openapi/v1.json` |
| Swagger UI | `/swagger` | `/api/swagger` |
| Scalar UI | `/scalar` | `/api/scalar` |
| Health | `/health` | `/api/health` |

The request examples later in this document use public IIS paths. For direct
Kestrel calls, remove the leading `/api` prefix. Route alignment changes only
URL composition; controller behavior, Windows Negotiate and access policies stay
unchanged. To verify the IIS deployment and local configuration, see
`src/DataCatalogue/docs/DC_DEPLOY_01_VALIDATION.md`.



## Geometry JSON format

Package creation (`CreatePackageRequest`), severity areas (`AddSeverityAreaRequest`)
and workspaces (`AddWorkspaceRequest`) accept **Esri JSON**, not GeoJSON. Their
C# property is `EsriJSON`, exposed as `esriJSON` in JSON request bodies and OpenAPI.
MA archive imports are an alternative package creation mode: the request supplies
the uploaded ZIP URI and `importFromArchive=true`, and the server converts the
archive's source GeoJSON internally as described below.
Replace the previous request field `geoJSON` with `esriJSON` in API clients;
there is no legacy field alias.

The value is a JSON-encoded **string**, for example:

```json
{
  "esriJSON": "{\"rings\":[[[12,55],[12,56],[13,56],[13,55],[12,55]]],\"spatialReference\":{\"wkid\":4326}}"
}
```

This fragment shows the geometry field only; supply the other required fields
for the endpoint. Esri polygon JSON uses `rings` and `spatialReference`, whereas
GeoJSON uses `type` and `coordinates`. The repository helper `FromEsriJson`
passes Esri JSON directly to `PolygonBuilderEx.FromJson`; it performs no format
conversion. Detailed geometry request fields (`aoi`, `points`, `curves`,
`surfaces`) also contain Esri JSON strings and retain their existing names.

Niord notice samples are different: their source geometry is genuinely GeoJSON.
`PackageTypes/NoticeToMariners.cs` converts those source geometries to Esri JSON
before passing them to the package API. The original notice sample JSON is
therefore retained in its source format.

## Read package coordinates

`GET /api/v1/packages/{id}/geometry` resolves the package's current geometry
references and returns coordinates as Esri JSON **objects**, including each
geometry's stored spatial reference. It requires the `datacatalogue:access`
policy, like the other package endpoints.

| Response field | Content |
| --- | --- |
| `aoi` | Required current AOI geometry object; an absent reference is an integrity error (500). |
| `detailedGeometry` | Current detail groups, or null when no points, curves or surfaces exist. |
| `detailedGeometry.points` | Array of all referenced point or multipoint geometry objects; empty when absent. |
| `detailedGeometry.curves` | Multipart polyline object, or null when absent. |
| `detailedGeometry.surfaces` | Polygon object with all rings and holes, or null when absent. |

Points may be stored as multiple individual features or as one multipoint;
the array includes every referenced feature in reference order. Coordinates
retain their stored spatial reference, Z/M dimensions and curve definitions.
The endpoint does not project, merge or simplify geometry. Read the
`spatialReference` on each object rather than assuming WGS84.

The read captures one package event state and resolves only those references,
so retained historical rows are excluded and concurrent replacements cannot
mix reference sets. Unknown packages return 404. Missing or unusable referenced
geometry returns a generic 500 problem response; details are logged server-side.
Package metadata responses omit internal geometry references. Geometry reads retain
their coordinate response shape; geometry replacement still returns updated metadata.

Focused integration coverage is in
`tests/DataCatalogueAPI.Tests/Integration/PackageGeometryReadTests.cs`. Run on
Windows x64 with .NET 10, licensed ArcGIS Pro and the `s100ed17.zip` template:

```powershell
dotnet test tests/DataCatalogueAPI.Tests/DataCatalogueAPI.Tests.csproj -p:Platform=x64 --filter FullyQualifiedName~PackageGeometryReadTests
```

## Filtered package geometry pages

Use `GET /api/v1/packages/geometry` to draw packages across categories or
pipelines without one HTTP request per package. Geometry belongs to packages;
`pipelineId` restricts the selection to an explicit pipeline assignment.
This uses the same subscription-backed filtering as `GET /api/v1/packages`.

| Query parameter | Meaning |
| --- | --- |
| `includeDetails` | Default `false`: load only the simplified, stored AOI. `true`: also load every available point, curve and surface. |
| `geometry` | Optional Esri JSON envelope or polygon with `spatialReference`; intersects the current package AOI. |
| `category` | Optional exact category ID. |
| `pipelineId` | Optional exact active pipeline assignment. |
| `hasPipeline` | Optional `true` for assigned, `false` for unassigned, omitted for both. |
| `page`, `pageSize` | One-based page (default 1); size 1–200 (default 20). |

The response has `items`, `page`, `pageSize`, `totalCount`, and `totalPages`.
Each item contains `packageId`, `shortId`, `aoi`, and `detailedGeometry`.
Geometry fields have the same shape as the individual geometry endpoint.
When `includeDetails=false`, `detailedGeometry` is null and detail rows are
never fetched. With `true`, all three groups are included if present; absent
points are `[]`, absent curves/surfaces are null. If no detail exists, the
whole `detailedGeometry` is null. Simplified means the stored AOI, not a
generalization of the detailed geometry's vertices.

```http
GET /api/v1/packages/geometry?includeDetails=false&pageSize=200
GET /api/v1/packages/geometry?category=GeneralSubmission&includeDetails=true&page=1&pageSize=20
GET /api/v1/packages/geometry?pipelineId=PIPELINE_ID&includeDetails=true
```

All filters combine with AND. Items are ordered by ordinal package ID, with
counting and pagination before coordinate hydration. Only the selected page
is read, using one ArcGIS dispatcher action and one geodatabase connection.
Retained historical AOIs cannot match after replacement. Missing referenced
geometry returns a generic 500 rather than a partial 200 result; malformed
queries return 400. The endpoint has the existing access policy. An unmatched
filter or a page beyond the last page returns an empty `items` array with the
matching total count. Fetch subsequent pages to obtain all matching packages.

## Package pipeline assignment status

Package responses (including `GET /api/v1/packages/{id}` and package listings)
now include `hasPipeline` and `pipelineBindings`. Each binding contains the
existing dispatcher binding `id` and `pipelineId`. Bindings are all active
assignments, ordered by pipeline ID, independently of workspace intersections,
AOI filters and the pipeline filter used to select a package. An unassigned
package returns `false` and `[]`. These fields use the existing assignment
index, which is updated by successful binding mutations and protected against
delayed subscription updates; reading metadata does not trigger spatial queries.
Removed assignments disappear, while restoring an assignment makes it visible
again. This is routing status; it does not introduce a workflow state enum.

## Sample descriptions and workspace coverage

MA descriptions use paragraphs and bold field labels (`p`, `strong`), rather
than definition-list markup. External values remain HTML-encoded and permit
links retain their existing HTTP(S) validation. MA descriptions already use
`en`. General Submission samples now default their description language to
`en`; an optional `language` string in `submission.json` overrides that default
and is trimmed and lowercased. This labels source text; it does not translate it.
The two ENC workspace fixtures are distinct axis-aligned envelope rectangles.
Their existing extents are retained. Paper Chart footprints retain their source
polygons. Restart the development API to recreate samples from these changes.

Regression coverage includes `PackageGeometryPageTests`,
`PackageGeometryReadTests`, `PackageSampleTests`,
`MarineAggregateExtractionTests`, and `InitializationAndSecurityTests`.

## Binding read performance

`GET /api/v1/dispatcher/bindings?packageId=...` returns active Pipeline
bindings with Workspaces intersecting the Package's **current** AOI. Each
Pipeline's Workspace coverage and intersection checks run on the existing
single-threaded `ArcGisDispatcher`. For a Pipeline with N Workspaces the read
now opens one Workspace coverage geodatabase/feature class and one Package AOI
geodatabase/feature class, rather than reopening both for each Workspace.
Each Workspace still uses the existing GlobalID-restricted spatial `Intersects`
query. This is a request-scoped resource reuse optimization, **not** a cache of
Workspace membership or Package geometry. Changes to Package AOIs remain visible
on the next read.

Two structured timing events are emitted at Information level:

- `Bindings read`: `AssignmentReadMs`, `TotalMs`, and returned binding count.
- `Workspace intersection read`: `EventStateMs`, `ArcGisQueueWaitMs`,
  `WorkspaceGeometryMs`, `AoiIntersectionMs`, `TotalMs`, Workspace count and
  match count (one event per active Pipeline).

The difference between elapsed time and the named stages includes coordination,
response mapping, and logging; timings also include failures or cancellation
and should not be interpreted as database-only measurements. The frontend needs
no change. Use the same Package and test dataset for before/after timing and
compare repeated warm requests, not one cold request. See
[DC_BIND_PERF_01_VALIDATION.md](docs/DC_BIND_PERF_01_VALIDATION.md) for tests,
limits, and baseline provenance.

## Workspace Packages read performance

`GET /api/v1/pipelines/{pipelineId}/workspaces/{workspaceId}/packages`
retains its current Esri JSON response, authorization, spatial membership, Pipeline
scoping, pagination and ordinal Package ordering. The spatial AOI query and the
returned page's AOI geometry reads share one request-scoped Package geodatabase
connection. Workspace coverage still uses the separate Dispatcher geodatabase
configuration; there is no cross-request cache or geometry contract change.

`Workspace packages read` logs event state, ArcGIS queue wait, Workspace geometry,
Package spatial query, Package AOI hydration, DTO parsing and full service elapsed
time. `Workspace packages result executed` logs MVC result execution (including
JSON serialization and response writing). The latter is **not** a serializer-only
benchmark. Concurrent frontend Workspace reads still contend for one STA ArcGIS
worker. See [DC_PERF_02_VALIDATION.md](docs/DC_PERF_02_VALIDATION.md) for its
accepted request-scoped read performance baseline.

DC-PERF-03 proposes a bounded internal read batcher (up to four requests, six-millisecond
collection window) while retaining the same HTTP contract and per-request cancellation.
The two configured geodatabases remain separate. During one dispatcher action, Workspace
polygon reads share a Workspace connection/feature class, and spatial Package reads share
a Package connection/feature class. `Workspace packages read` now also reports `BatchSize`,
`BatchWaitMs`, `WorkspaceScopeMs` and `PackageScopeMs`; shared setup timings must not be
summed across request records. This is a candidate pending local acceptance, not a
verified HTTP speedup. See [DC_PERF_03_VALIDATION.md](docs/DC_PERF_03_VALIDATION.md).

## Package search and pagination

`GET /api/v1/packages` keeps the existing response envelope and accepts:

| Query parameter | Meaning |
| --- | --- |
| `category` | Optional exact, case-sensitive category identifier. |
| `geometry` | Optional URL-encoded Esri JSON envelope or polygon with `spatialReference.wkid` or `spatialReference.wkt`. Maximum 16,384 characters; hosting URL limits may be lower. |
| `page` | One-based page number, default 1. |
| `pageSize` | Page size from 1 to 200, default 20. |

All filters are combined before pagination. Results are ordered by catalogue ID
using ordinal string comparison. `totalCount` is the number of matching packages
before pagination, not the number of coverage rows. A page beyond the last page
returns `items: []` and the same total. Invalid geometry or paging values return
400 validation problem details. No geometry filter means no geodatabase query.

**Client change:** the formerly unbounded list now returns at most `pageSize`
items, including requests without filters. Use `totalCount`/`totalPages` to page
through the rest. Reset `page` to 1 when category or map extent changes.

For an ArcGIS Maps SDK for JavaScript/Calcite client, use the MapView extent's
Esri JSON directly; `URLSearchParams` handles query-string encoding:

```javascript
const query = new URLSearchParams({
    geometry: JSON.stringify(view.extent.toJSON()),
    page: "1",
    pageSize: "50"
});
if (category) query.set("category", category);
const response = await fetch(`/api/v1/packages?${query}`, { signal });
if (!response.ok) throw new Error(`Package search failed (${response.status})`);
const result = await response.json();
// result.items, result.page, result.pageSize, result.totalCount, result.totalPages
```

Here `view` is an initialized MapView, `category` is the selected category or
null, and `signal` is the current request's AbortSignal. Debounce map navigation
and abort obsolete requests so earlier responses do not replace newer results.
A typical unencoded `geometry` value is:

```json
{"xmin":12,"ymin":55,"xmax":13,"ymax":56,"spatialReference":{"wkid":4326}}
```

Polygon AOIs use `rings` (or `curveRings`) and the same spatial-reference object.
The supplied rectangle/polygon is projected into the `surface` feature class's
spatial reference when necessary. The repository runs `SpatialQueryFilter`
with `Intersects` and `code = 'PackageCoverage'`, retrieving only GlobalID and
`attributebindings`. It resolves package IDs through the singleton subscription
projection. Shapes are neither fetched nor intersected in application memory.

Geometry replacement retains historic coverage features. Spatial matches must
therefore also equal the projected package's current `GeometryRef`; obsolete
rows, orphan rows and duplicate coverage rows cannot inflate the page or count.
The metadata count and page come from the same captured states, but ArcGIS and
the subscription do not share a transaction. Results are eventually consistent;
concurrent changes can shift results between separate page requests.

For large/complex polygon AOIs, recommend a future `POST /api/v1/packages/search`
with a JSON body containing `category`, `geometry` as a JSON object, `page` and
`pageSize`, returning the same response and reusing this repository query. This
avoids URL length limits and double-encoded JSON. This change implements GET
only; it does not add POST search or alter package creation. For dateline-crossing
AOIs, use a correctly normalized multipart polygon rather than an inverted
envelope (`xmin >= xmax` is rejected).

Verification on a Windows development instance with ArcGIS installed:

- Request pages 1 and 2 with `pageSize=5`; confirm bounded items, ordinal ID
  ordering, no overlap for unchanged data, and identical totals.
- Combine an exact category with a known intersecting extent; verify the total
  excludes both other categories and nonintersecting current package AOIs.
- Query the same footprint in WKID 4326 and 3857; compare IDs and counts.
- Move a package AOI using the existing geometry replacement endpoint, wait for
  its subscription event, then query its old location. The historic row must
  not match unless the new AOI also intersects that location.
- Verify zero matches and an out-of-range page, including `page=2147483647`,
  return empty items without overflow; an unknown category returns total zero.
- Check invalid JSON, missing/unknown spatial reference, empty/degenerate AOI,
  inverted bounds, `page=0`, and `pageSize=201` return 400.

## Pipeline listing

`GET /api/v1/pipelines` returns all pipelines in identifier order using the same
`items`, `page`, `pageSize` and `totalCount` envelope as categories and packages.
An empty catalogue returns an empty `items` array and zero `totalCount`.
`InMemoryPipelineRepository` projects pipeline creation and workspace events
through the existing dispatcher subscription. The controller and subscription
resolve the same singleton; listing does not scan the event store. Like the
other subscription-backed listings, newly created pipelines appear once their
events have been processed, including startup's ENC and Paper Chart pipelines.

## Startup sample data

`Program.Main` resolves `SampleDataInitialization` once in a startup DI scope
and calls `InitializeAsync` after building the app and before `RunAsync`.
Its constructor receives the DI-registered `DispatcherController`,
`PackageController`, `PipelineController`, the initialization-only `SamplePackageReader`
and logger. The sample reader creates API request models from the local fixture files;
all packages still go through `PackageController.CreatePackage`. Production
package types are not responsible for constructing requests to their own API. Startup creates the `NoticeToMariners`,
`GeneralSubmission` and `MarineAggregateExtraction` categories and imports the supplied notice JSON,
submission ZIPs and MA ZIP fixtures.

Startup also creates `ENC` and `Paper Chart` through `PipelineController.Create`.
All sample packages remain unbound. Humans or agents explicitly select package/pipeline
pairs through `POST /api/v1/dispatcher/bindings` using professional judgment.

Bindings use typed package/pipeline stream names and persist their own ID.
Creation returns 201 and a retrievable binding URL; missing package/pipeline IDs
return 404, and an existing pair returns 409. A package can be bound to multiple
pipelines. `GET /api/v1/dispatcher/bindings/{id}` reads the saved link. Startup
does not create sample bindings.
Pipeline IDs are logged at startup and can be read using
`GET /api/v1/pipelines/{id}`. Missing bindings/pipelines return 404; unexpected
store failures and cancellation are no longer disguised as missing records.

Every package receives an 18-character lowercase alphanumeric Nanoid, using the
same alphabet and length as Pipeline. This internal ID is used in routes, event
streams and geometry bindings. The human-readable identifier is stored in
`metaData.shortId`: published notice short IDs are preserved, while sources
without one receive `PREFIX-NNN-YY` using the category prefix and UTC year.
Duplicate short IDs return HTTP 409. Reservations belong to the singleton
`PackageIdentityService`, matching the lifetime of the current in-memory event
store; listing/subscription lag cannot cause duplicate allocations. A failed
pre-geometry create releases its reservation, although generated sequences may
have gaps. Restarting this development host resets the event store and allocator.

Package metadata contains `shortId`, `type`, `title`, `source`, `refId` and
`createdUTC`; there is no metadata `number`. The source notice UUID remains in
metadata `refId`. Title and source use the Danish description, falling back to
English and then the first description; source creation dates are converted to UTC.

Packages expose `descriptions` and `charts` as first-class properties in requests,
commands, creation events, projected state and responses. There is no `content`
wrapper or package-specific serialized document.

`descriptions` contains `PackageDescription` records with `partIndex`, `language`
and `description`. Notice mapping reads every `parts[].descs[].details` entry and
preserves its HTML unchanged as a string, with the source `indexNo` and `lang`.
Entries remain separate and in source order; repeated indices or languages are
not merged. Root notice descriptions still supply metadata title/source. General
submissions use `submission.json.description` with null part index and language.
No supplied descriptions yields null.

`charts` contains `PackageChart` records with `chartNumber` (text) and nullable
`internationalNumber` (integer), keeping each pair together. Missing, null or
empty source charts yield null. GeneralSubmission does not infer chart numbers
and leaves this property null. Other notice source fields are not retained as
package attributes; the original source remains identified by its source URI.

`POST /packages` does not accept a package `id`; it is generated by the server.
An optional published short ID belongs in `metaData.shortId`. Existing package
routes continue to identify packages by their internal `id`.

There is no invented severity mapping: the existing `ulong.MaxValue` default is
used, and display scale stays null.

### Marine aggregate extraction samples (Indvindingsområder)

The category ID is `MarineAggregateExtraction`, its display name is
**Marine Aggregate Extraction Areas**, and its identifier prefix is `MA`.
This describes seabed sand, gravel and stone extraction; it is separate from
dumping dredged material. Miljøstyrelsen describes the source layers at
<https://mst.dk/erhverv/groen-produktion-og-affald/raastofindvinding/raastofindvinding-paa-havet/kort-og-gis-data>.

The supplied ArcGIS Pro project is a collection/inspection workflow. Its notebook
fetches `https://api.raastofindvinding.dk/v1/extraction-sites`, exports MARIS
GeoJSON and projects it into its own file geodatabase. It also exports four WFS
layers from `https://wfs2-miljoegis.mim.dk/raastofpaahavet/ows`.
Neither the project, ArcPy, notebook nor file geodatabase is needed for fixture
parsing. The existing Windows/ArcGIS CoreHost requirements still apply to
persisting and retrieving the package geometry.

MA submissions use one ZIP per site. Each ZIP has this version 1.0 contract:

| File | Contents |
| --- | --- |
| `manifest.json` | Submission category, schema version, source URL, actual retrieval time and file references |
| `areas.geojson` | A WGS84 FeatureCollection containing exactly one site's geometry and properties |
| `documents/*.pdf` | Optional PDFs explicitly referenced by the manifest; retained in the original archive |

Example `manifest.json`:

```json
{
  "schemaVersion": "1.0",
  "category": "MarineAggregateExtraction",
  "sourceUrl": "https://api.raastofindvinding.dk/v1/extraction-sites",
  "retrievedAtUtc": null,
  "geoJsonFile": "areas.geojson",
  "documents": []
}
```

`retrievedAtUtc` is null when capture time is unknown. When known, supply an ISO
8601 timestamp with an explicit UTC offset (`Z` or `+00:00`). Packaging time and
permit effective/expiry dates must not be substituted for source retrieval time.
Manifest fields are submission metadata; site attributes remain solely in each
GeoJSON feature's `properties`. Unrecognized manifest fields are rejected for
version 1.0. No URLs are fetched during import, including permit links.

The ten `MA-01-*.zip` through `MA-10-*.zip` fixtures contain the first ten sites
from the supplied snapshot, with source properties and geometry unchanged.
They contain no downloaded PDFs. The original 141-site
`MARIS_Raastof_Live.geojson` remains a reference fixture and parser test input;
startup imports only the first ten ZIPs in ordinal filename order. It uploads
each ZIP through `PackageController.UploadFile` before calling
`PackageController.CreatePackage` with archive import enabled. Existing category
and pipeline creation still uses the registered controllers. After import,
half of all sample packages are randomly assigned to the sample pipelines.

| Source value | Package mapping |
| --- | --- |
| Site UUID | `metaData.refId`; exactly one site per ZIP |
| Number, name, optional subsite | `metaData.title` and description; area numbers are not assumed unique |
| Common / Auction / Builder | `metaData.type` |
| Authority | `metaData.source = Miljøstyrelsen / MARIS` |
| No published catalogue short ID | Server allocates `MA-NNN-YY` |
| No source creation timestamp | `metaData.createdUTC = null` |
| Polygon or MultiPolygon | Full `detailedGeometry.surfaces`, preserving parts and holes |
| Geometry envelope | Rectangular AOI; existing persistence projects and recomputes it |
| Permit dates, snapshot status, remarks, deadline value, volume ID, permit URL | HTML-encoded description; HTTP(S) permit URLs become links |
| Manifest provenance and PDF paths | Additional HTML-encoded description; PDFs are not extracted or linked as external resources |
| Original ZIP | Existing attachment repository, referenced by the package's `database://UUID` source URI |

#### Import through the existing API

1. Upload the original ZIP as multipart field `File` to
   `POST /api/v1/packages/repository` and retain its returned `absoluteUri`.
2. POST JSON to the existing `POST /api/v1/packages` route:

```json
{
  "category": "MarineAggregateExtraction",
  "absoluteUri": "database://<UUID-returned-by-upload>",
  "importFromArchive": true
}
```

Successful creation returns 201. The response retains the complete database URI
and the original archive filename. Severity and display scale may still be
supplied; geometry, metadata, descriptions and charts must be omitted because
they are derived from the archive. Existing explicit-geometry JSON requests
continue to work when `importFromArchive` is false or omitted; `esriJSON` remains
required in that mode. Archive import currently supports only MA. It does not
read client-supplied local paths or arbitrary HTTP URLs.

Missing uploaded archives return 404. Invalid manifests, geometry, file
references, conflicting input fields and size/path violations return 400 before
package identity or geometry writes. The already uploaded original stays in the
repository if creation fails, allowing inspection or another create attempt.
Uploading and creating are separate operations, as before; repeated create
requests create separate packages and are not a source synchronization/upsert.

`MarineAggregateArchive.ReadAsync` reads a ZIP in memory without extracting to
disk. Limits are 16 MiB compressed, 64 MiB cumulative expanded, 100 entries,
64 KiB manifest and 8 MiB GeoJSON. Header sizes and actual streamed sizes are
bounded. Unsafe paths, duplicate names (case insensitive), symbolic links,
undeclared files and missing referenced PDFs are rejected. ZIP entry names use
portable ASCII paths with forward slashes. The GeoJSON parser validates finite
WGS84 positions and closed nonzero-area rings, converts shell/hole winding to
Esri JSON, and does not repair polygon topology. Existing CoreHost dispatching,
geometry projection, transaction and event creation flow remain in use.

The source snapshot labels 42 sites `Aktiv` and 99 `Udløbet`. These labels were
calculated by the notebook when it ran; the importer does not assert that they
are current. The other supplied exports contain 19 common-area features,
5 auction permits, 18 builder permits and 264 potential/historical features.
They are deliberately not merged into the MARIS packages: layers can overlap,
their identifiers differ, and permit dates conflict (for example, Thyborøn
562-PA expires in 2024 in the MARIS snapshot and in 2034 in the builder WFS
snapshot). The potential/historical export also uses EPSG:25832, whereas MARIS
and the other three WFS exports use longitude/latitude.

To inspect these packages after startup, use
`GET /api/v1/packages?category=MarineAggregateExtraction&pageSize=200`, then
`GET /api/v1/packages/{id}/geometry` for the AOI and detailed coordinates.
The reference snapshot and ZIP fixtures are copied to build, publish and test output.

Live synchronization is a separate feature. Before implementing it, decide the
authoritative source and reconciliation rules, whether expired/missing sites
remain available, and whether one package represents a site or a source change.
The current sample initializer assumes fresh stores and is not a recurring,
idempotent import. After verifying every sample geometry through the package read
path, it randomly assigns half of all samples to pipelines, balanced between ENC
and Paper Chart. The remaining samples stay unassigned. Chart data is unchanged.

`PackageTypes/NoticeToMariners.cs` reads every geometry from every part and
converts GeoJSON into Esri JSON in WGS84. The AOI is always a rectangle covering
the combined detailed geometry envelope in the target coordinate system.
Point-only/collapsed extents are expanded by 0.000005 degrees on each collapsed
side before projection so the AOI has positive area. Complete point coordinates
are grouped into a multipoint, line parts into a multipart curve, and polygon
rings into a multipart surface. Polygon shell/hole orientation is converted to
Esri convention without simplifying coordinates or dropping parts.

`PackageRepository.AddPackageGeometries` writes AOI/detail rows on the existing
ArcGIS dispatcher in one transaction, projecting into each destination feature
class. Single points use the point feature class; multiple points use pointset.
The actual destination shape type determines storage: a Point feature class
receives one row per coordinate, while a Multipoint feature class receives one
multipoint row. The supplied template's `main.pointset` is a Point class.
All references are retained in `DetailedGeometry.PointRefs`; `PointRef` is only
populated when exactly one feature represents the point details. Every point
row is associated with the same package through its attribute bindings.
Before assignment, geometry is checked against the actual feature class shape
type and rebuilt with the feature class's Z/M settings. When a 2D sample must be
stored in a Z-enabled class, the development Z placeholder is zero; missing M
values remain NaN. Logs include the source/target type and dimensional flags,
and any native write failure includes the package and table in its diagnostic.
The supplied context excludes the geodatabase itself, so a precise native-schema
failure cannot be reproduced without the runtime data. The method returns the
references used by the existing `PackageCreated` and `DetailedGeometryAdded`
events. `PackageState` now folds the already-defined
detail and severity events. `PackageState.DetailedGeometry` is one
`DetailedGeometry(PointRef, CurveRef, SurfaceRef)` record. These storage references
are internal; clients read coordinates through the geometry endpoint. The existing event's three reference
parameters remain available. An optional `PointRefs` collection carries all point
references through the command/event and replay; older events without it fall
back to their single `PointRef`.

Event storage stays in memory. Geometry rows use the disposable
`s100ed17.geodatabase` already rebuilt from ZIP by `Program`; the initializer
requires `Packages:Geodatabase` to refer to that file in the application output
folder. Existing ArcGIS runtime, archive and package archive-folder prerequisites
still apply. No SQL connection or migration is required. A fresh process rebuilds
the development data. The initializer assumes fresh stores and performs no stream existence lookups.
Creation actions retain their duplicate guards; calling initialization again in
the same process can therefore fail on an existing category or package.
Failures propagate and stop startup.

Example: `GET /api/v1/packages/00e4d439-a4fc-49cd-b0b1-0abcd35c9247`.
To add more development notices, add JSON files in the same source folder.
To stop sample loading later, remove the startup initialization scope in
`Program.cs`. This delivery does not add or change any test project.

## Notice naming and initial configuration

Use the following names consistently:

| Purpose | Name |
| --- | --- |
| One notice / domain record | `NoticeToMariners` |
| Package type / default category ID | `NoticeToMariners` |
| Category display name | Notices to Mariners |
| Sample collection folder | `Samples/NoticesToMariners` |
| Danish display name | Efterretninger for Søfarende |

`Notice` is singular for one item; `Mariners` remains plural because a notice is
addressed to seafarers collectively. Use `To` in identifiers rather than `2`.

Sample initialization creates the default category using the equivalent of:

```http
POST /api/v1/dispatcher/categories
Content-Type: application/json
```

```json
{
  "id": "NoticeToMariners",
  "displayName": "Notices to Mariners",
  "description": "Incoming Notices to Mariners packages."
}
```

Package creation uses the existing `POST /api/v1/packages` endpoint with
`category` set to `NoticeToMariners`. The category ID identifies the stream;
the display name is the human-readable label. Sample startup recreates the
in-memory data with these names; no stored-data migration is needed for this
development setup.

## How the pieces fit together

**Versioning.** `Asp.Versioning.Mvc` handles version selection; `Asp.Versioning.Mvc.ApiExplorer`
makes the versions visible to the API explorer. The explorer's `GroupNameFormat` of `'v'VVV`
produces group names `v1` and `v2`, which is what ties an operation to an OpenAPI document.

URL segment versioning is the primary strategy (`/api/v2/products`). The header
(`X-Api-Version`) and query string (`?api-version=2.0`) readers are also registered, so
clients can choose. `ReportApiVersions` adds `api-supported-versions` and
`api-deprecated-versions` response headers.

**OpenAPI.** Documents come from the built-in `Microsoft.AspNetCore.OpenApi`. One document is
registered per entry in `ApiVersions.DocumentNames`, and `OpenApiOptions.ShouldInclude` filters
each document down to the operations in the matching group. `ApiVersionDocumentTransformer`
fills in the title, version, contact, licence and the deprecation notice.

`GenerateDocumentationFile` is on, so .NET 10 lifts the XML doc comments on controllers,
actions and models directly into the generated documents — the `<summary>`, `<response>` and
`<example>` tags you see in the source are what shows up in the UIs.

**UIs.** Swagger UI and Scalar are both just viewers here; neither generates documents. Both
are driven from `IApiVersionDescriptionProvider`, so adding a version automatically adds an
entry to both version pickers. They are served only when `OpenApi:EnableUi` is `true`
(default: `true` in Development, `false` elsewhere — see `appsettings*.json`).

**Serilog.** Configured from the `Serilog` configuration section, so sinks and levels can be
changed without a rebuild. A bootstrap logger catches startup failures before the host exists.
`UseSerilogRequestLogging` collapses the per-request ASP.NET Core noise into a single enriched
event, including the resolved API version.

**Client cancellation.** `ClientCancellationMiddleware` runs immediately inside Serilog
request logging. If a downstream operation throws `OperationCanceledException` **and**
`HttpContext.RequestAborted` is canceled, the middleware marks the request `499`
(Client Closed Request) before Serilog completes its request log, without writing a
response body. Status-code pages are disabled for that request. Cancellation that is
not tied to a disconnected client, and unrelated exceptions even after a disconnect,
continue to the existing exception handling and are not silently suppressed. If
response headers have already started, they cannot be replaced with `499`; the
middleware still stops expected cancellation exceptions from propagating. No
controller, authentication, API contract or ArcGIS cancellation behavior changes.
See `docs/DC_CANCEL_01_VALIDATION.md` for verification and browser checks.

**HTTPS.** `UseHttpsRedirection` with a 308 (method-preserving) redirect, plus HSTS outside
Development. For production, configure Kestrel endpoints via environment variables or a
`Kestrel:Endpoints` configuration section rather than `launchSettings.json`, which is a
local-development-only file.

## Adding a version 3.0

1. Add `V3Text` / `V3` and `"v3"` to `ApiVersions`.
2. Add `Controllers/V3/` with `[ApiVersion(ApiVersions.V3Text)]`.
3. Mark v1 or v2 `Deprecated = true` when appropriate.

Nothing in the OpenAPI or UI wiring needs to change.

## Note on `Asp.Versioning.OpenApi`

Asp.Versioning 10 ships a companion package, `Asp.Versioning.OpenApi`, that replaces the
per-version `AddOpenApi(name)` loop and the `ShouldInclude` filter with:

```csharp
services.AddApiVersioning()
        .AddApiExplorer(options => options.GroupNameFormat = "'v'VVV")
        .AddMvc()
        .AddOpenApi();          // from the Asp.Versioning namespace

app.MapOpenApi().WithDocumentPerVersion();
```

It also adds sunset and deprecation policy links to the documents automatically. This project
does **not** use it, because as of the 10.0.0 release that package is still published as
`10.0.0-rc.1` (pending [dotnet/aspnetcore#66408](https://github.com/dotnet/aspnetcore/issues/66408)),
and a project skeleton shouldn't depend on a prerelease. Once it goes stable it is worth
switching to — the manual wiring in `OpenApiConfiguration` and `ApiVersionDocumentTransformer`
becomes redundant.

Note that with that package, `AddOpenApi(options => ...)` hands you a `VersionedOpenApiOptions`,
so transformers are registered through `options.Document.AddDocumentTransformer(...)`.



### Category queries and geometry references

Default categories are event streams created before packages. They are not
geodatabase rows. `GET /api/v1/dispatcher/categories` now returns their current
states directly from the in-memory event store, without waiting for the
background subscription. Categories created through POST are included as well.
`GET /api/v1/dispatcher/categories/{id}` reads an individual category. The old
`categoriess` routes remain aliases. Specification events are replayed when
reading category state. Sample startup creates categories before packages through the registered
controllers, without looking up streams before creation.

Package category values identify category streams; they are not SQL foreign keys.
The HTTP package creation endpoint rejects missing/terminated categories before
writing geometry.

Package and workspace metadata responses omit `geometryRef`. Package metadata
also omits `detailedGeometry`, which previously contained feature references.
Severity creation returns `201` with `{}`. Bindings and pipelines use the same
workspace response without coverage references. Geometry references remain in
internal state/events for replay; no event migration or storage change is required.
Read package coordinates through `GET /api/v1/packages/{id}/geometry` and workspace
coordinates through `GET /api/v1/pipelines/{id}/workspaces/{workspace}`.

### Editable sample workspace coverage

`Samples/Workspaces/ENC.json` and `Samples/Workspaces/PaperChart.json` define
independent Danish work areas. Each file is an array of objects with
`displayName`, an optional `displayScale`, and `aoi` as an Esri JSON polygon
object containing `rings` and `spatialReference`. Add Paper Chart areas to
`PaperChart.json`; no C# changes are needed. Names must be unique per pipeline.
Files are copied to build, publish and test output. Restart the application to
load edits; normal startup rebuilds the development stores as before.

```json
[
  {
    "displayName": "Copenhagen approaches",
    "displayScale": { "maximumDisplayScale": 1, "minimumDisplayScale": 19999999 },
    "aoi": {
      "rings": [[[12.3,55.5],[12.3,55.9],[12.8,55.9],[12.8,55.5],[12.3,55.5]]],
      "spatialReference": { "wkid": 4326 }
    }
  }
]
```

Initialization validates all samples through `PackageController.GetGeometry`
after import and before assignment. Every sample must resolve a nonempty AOI
and at least one detail group; a failed native lookup or incomplete geometry
stops startup with the sample identifier rather than leaving unusable samples.
All supplied notice fixtures already contain source geometry. No fabricated
fallback coordinates are used. Roughly half (`count / 2`, rounded down) are
shuffled and assigned once through `DispatcherController.CreateBinding`;
pipeline totals differ by at most one. Package choices vary each startup.

`GET /api/v1/pipelines/{id}/workspaces/{workspace}/packages` retains pagination,
ordinal package ordering and total matching count. Every item now includes
`packageId`, `shortId`, and `aoi`: the current simple AOI as an Esri JSON object
with its stored spatial reference, matching the package geometry read. Only AOIs
for the returned page are loaded; detailed geometry is not hydrated for this list.

Regression coverage is in `InitializationAndSecurityTests`,
`PackageGeometryReadTests`, and `WorkspaceAndRoutingTests`. It checks every
seeded package's coordinates, half-assignment counts, independent file-based
workspaces, absence of public storage references, and current AOIs after replacement.
Run on Windows x64 with .NET 10, licensed ArcGIS Pro, `s100ed17.zip`, and the
sample ZIP fixtures (binary fixtures are excluded from filtered context exports):

```powershell
dotnet test tests/DataCatalogueAPI.Tests/DataCatalogueAPI.Tests.csproj -p:Platform=x64
```
