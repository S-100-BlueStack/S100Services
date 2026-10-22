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

Sample endpoints:

```
GET    /api/v1/dispatcher
GET    /api/v2/dispatcher?page=1&pageSize=20
```


## Geometry JSON format

Package creation (`CreatePackageRequest`), severity areas (`AddSeverityAreaRequest`)
and workspaces (`AddWorkspaceRequest`) accept **Esri JSON**, not GeoJSON. Their
C# property is `EsriJSON`, exposed as `esriJSON` in JSON request bodies and OpenAPI.
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
package types are not responsible for constructing requests to their own API. Startup creates the `NoticeToMariners` and
`GeneralSubmission` categories and imports the supplied notice JSON and submission
ZIP samples.

Startup also creates `ENC` and `Paper Chart` through `PipelineController.Create`.
After importing packages in sorted file order, it applies the repeating sample
pattern ENC, unbound, Paper Chart, Paper Chart, unbound, ENC, unbound, Paper Chart.
With the supplied 14 notices and two submissions this creates 10 bindings and
leaves six packages unbound. This is arbitrary development fixture data, not a
production routing rule. Humans or agents explicitly select package/pipeline
pairs through `POST /api/v1/dispatcher/bindings` using professional judgment.

Bindings use typed package/pipeline stream names and persist their own ID.
Creation returns 201 and a retrievable binding URL; missing package/pipeline IDs
return 404, and an existing pair returns 409. A package can be bound to multiple
pipelines. `GET /api/v1/dispatcher/bindings/{id}` reads the saved link. Startup
reads each sample link back through this controller and checks its IDs.
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
`DetailedGeometry(PointRef, CurveRef, SurfaceRef)` record, and package responses
expose the same nested reference shape. The existing event's three reference
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

Package responses now expose each geometry reference as
`{ "featureClass": "point", "globalId": "cd9ab46c-734b-4121-b14f-b27316c0dd19" }`.
This deliberately changes the package response reference fields from strings to
objects, including `geometryRef` and all `detailedGeometry` members. Clients must
read `featureClass` and `globalId` instead of splitting a string. These are feature
identifiers, not coordinate geometry. The feature class is needed because points
can be stored in either `point` or `pointset`; the GlobalID identifies the row.
Existing event/command payloads retain their original `featureClass::{GlobalID}`
encoding, so replay requires no migration. Geometry storage and coordinates are
unchanged. Other endpoints retain their existing response contracts.
