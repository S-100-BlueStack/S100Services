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


## Initial configuration

**NoticeToMariners**

```
POST /api/v1/dispatcher/packagetypes
Request body
{
    "displayName": "Notice2Mariners",
    "description": "A Notice to Mariners (EfS) is an official weekly or periodic publication issued by national hydrographic offices to provide safety-critical updates for nautical charts and publications."
}
Response body
{
  "id": "yYzKXybaQVkcPJ44a5",
  "displayName": "Notice2Mariners",
  "description": "A Notice to Mariners (EfS) is an official weekly or periodic publication issued by national hydrographic offices to provide safety-critical updates for nautical charts and publications.",
  "lastUpdatedUtc": "2026-10-04T17:46:27.3119026+00:00"
}


POST api/v1/dispatcher/repository	
Response body
{
  "absoluteUri": "database://fd142588-0d78-42f7-9326-67e28a0d042e"
}


POST /api/v1/dispatcher/dispatch/packages
Request body
{
  "packageTypeId": "yYzKXybaQVkcPJ44a5",
  "absoluteUri": "database://fd142588-0d78-42f7-9326-67e28a0d042e",
  "geoJSON": "{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[102.0,0.5]}},{"type":"Feature","geometry":{"type":"LineString","coordinates":[[102.0,0.0],[103.0,1.0]]}}]}"
}
```




















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

