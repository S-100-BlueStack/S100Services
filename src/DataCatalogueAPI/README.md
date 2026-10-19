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


## Startup sample data

`Program.Main` resolves `SampleDataInitialization` once in a startup DI scope
and calls `InitializeAsync` after building the app and before `RunAsync`.
Its constructor receives the DI-registered `DispatcherController`,
`PackageController` and logger. It creates categories through
`DispatcherController.CreateCategory` and packages through
`PackageController.CreatePackage`. Request mapping is a private function in the
initializer; no extra dispatcher package endpoint or mapping service is used.
`Initialization/SampleDataInitialization.cs` creates the `NoticeToMariners` and
`Standard` category IDs. The notice category's display name is **Notices to
Mariners**. Every bundled JSON file in `Samples/NoticesToMariners` is registered
as a package. The 14 supplied files are copied to build and publish output.

The source notice UUID is the package ID and metadata `RefId`. Metadata maps
`shortId`, `type`, `number` and `created` directly; `Title` and `Source` come from
the Danish description, falling back to English and then the first description.
Creation dates are converted to UTC. Original JSON files remain available via
file URIs in `PackageCreated`; source status is not used to filter these samples.
There is no invented severity mapping: the existing `ulong.MaxValue` default is
used, and display scale stays null.

`Domain/PackageTypes/NoticeToMariners.cs` reads every geometry from every part and
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
