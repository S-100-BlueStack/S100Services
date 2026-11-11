# DC-DEPLOY-01 — API route base alignment validation

## Authority and scope

- Repository: `S-100-BlueStack/S100Services`
- Committed baseline: `22e2ff7da5578f26559189eca06c9118e8227bfe`.
- Source: verified `DC-DEPLOY-01-Context-22e2ff7da557-20261111-092627.zip` and SHA-256 manifests (268 baseline files, 231 working-tree overlay files).
- Local uncommitted changes at export: DC-SDK-01 frontend/package changes, including README and project tracker. This candidate preserves those exact snapshots; they are **not** committed or approved by DC-DEPLOY-01.
- Scope: controller templates, frontend URL composition, route expectations, OpenAPI UI path handling, and deployment documentation.
- Out of scope: API payloads, API version semantics, authentication/authorization, data persistence, frontend Jobs/Package/Workspace logic, ArcGIS/Calcite, IIS configuration deployment and dependency changes.

## Routing contract

| Context | API base URL | Resource path | Final request path |
| --- | --- | --- | --- |
| IIS public frontend | `/api` | `/v1/pipelines` | `/api/v1/pipelines` |
| IIS public frontend | `/api` | `/v1/dispatcher/bindings` | `/api/v1/dispatcher/bindings` |
| Direct Kestrel | `https://localhost:51849` | `/v1/pipelines` | `https://localhost:51849/v1/pipelines` |
| Same-origin standalone | empty | `/v1/pipelines` | `/v1/pipelines` |

IIS must host DataCatalogueAPI as an **Application** mounted at `/api`, not as a
plain virtual directory. The app must receive the expected `PathBase=/api` from
IIS/ASP.NET Core Module. Do not configure a duplicate prefix in backend routes,
frontend resource paths, a rewrite rule, or `UsePathBase` in production code.
The public `/api/v1/...` paths remain familiar, but raw Kestrel clients must
switch from `/api/v1/...` to `/v1/...` when adopting this release.

The frontend has no development proxy. For local cross-origin testing, supply the
standalone Kestrel **origin** through `VITE_CATALOGUE_API_BASE_URL` without `/api`.
Use `VITE_CATALOGUE_API_CREDENTIALS=include` only when that origin is approved for
credentialed CORS/Negotiate; keep `same-origin` for the IIS deployment. Do not put
secrets or tokens in Vite environment variables. Vite injects them at build time;
changing IIS frontend settings requires rebuilding the static assets.

HTTP 201 `Location` headers use the canonical `/api/v1/...` and
`/api/v2/...` paths under IIS (or `/v1/...` and `/v2/...` under
Kestrel). The declared API versions remain `1.0` and `2.0`; only
outbound route values use the major-version shorthand so no `.0`
suffix appears in generated links. The mounted TestServer test
asserts the exact canonical path and follows the created resource.

## Source and automated checks

From the repository root on the Windows x64 development machine, after reviewing
this candidate against the latest uncommitted working tree:

```powershell
Set-Location src/DataCatalogue
npm run format
npm run check
Set-Location ../..
dotnet test tests/DataCatalogueAPI.Tests/DataCatalogueAPI.Tests.csproj -p:Platform=x64
```

Run .NET tests in the existing licensed ArcGIS/.NET environment with its normal
geodatabase sample and configuration. The new mounted TestServer integration
uses `UsePathBase("/api")` before routing, verifying public URLs, no duplicate
`/api`, `Location`, and OpenAPI route paths. Existing integration tests exercise
application-relative `/v1/...` routes. The mounted test also retrieves both
OpenAPI documents and verifies that any v2 paths omit the IIS application
prefix. It does not require `/v2/products`: `DataCatalogueAPI.csproj` explicitly
excludes `Controllers/ProductsController.cs` from compilation, so the sample
product API is not active. Do not enable it merely to satisfy a routing test.
The full .NET integration suite and IIS hosting were not run by the candidate author.

## Manual IIS acceptance

1. Confirm the frontend serves `/` and the API has a distinct IIS Application
   `/api` with its existing app pool and Negotiate/authorization settings.
2. Confirm a signed-in, authorized user receives HTTP 200 JSON from
   `https://datacatalogue.gst.dk/api/v1/pipelines` and a representative Package
   query. The same `/api/api/v1/pipelines` must **not** be required or succeed.
3. With `VITE_CATALOGUE_API_BASE_URL=/api`, rebuild and deploy frontend assets.
   Inspect the browser Network tab; Package list, bindings, Workspace reads,
   geometry and API writes use exactly `/api/v1/...`, with unchanged methods,
   payloads and credentials policy. No `404`, HTML-as-JSON or CORS failures.
4. Verify `GET /api/openapi/v1.json` and `GET /api/openapi/v2.json` (for an
   authorized user). Documented paths must be application-relative
   (`/v1/...`, and `/v2/...` if active v2 endpoints are added); check that
   documentation clients use `/api` as their server base when sending requests.
   Do not expect the excluded sample `/v2/products` endpoint to appear.
5. If `OpenApi:EnableUi` is enabled, check `/api/swagger` and `/api/scalar`.
   Both version documents must load from `/api/openapi/...` rather than the
   website root. Repeat without the IIS prefix against direct Kestrel.
6. Confirm `/api/health` behavior remains compatible with the existing access
   policy. Check anonymous (401) and authenticated unauthorized (403) requests.
7. Smoke-test main map and Package assignment, rapid selection/refresh, 201
   creation (including the `Location` header), 204 deletion and 4xx/5xx notices.
   Verify existing uncommitted SDK and theme changes separately before accepting
   any frontend candidate.

## Deployment ordering and rollback

Deploy backend and rebuilt frontend together in a coordinated release. A
standalone Kestrel client expecting the old `/api/v1/...` route will break after
controller route changes; update those callers before release. No dual-route
compatibility alias is added, to avoid silently preserving the old double prefix.

Rollback should restore both the previous API binary and previous frontend
static build/environment as a matched pair. Reverting only one side can re-create
404s. Preserve the existing IIS Application `/api`, application pool and Windows
SSO settings. No database migration or dependency update is required.

## Verification limitations

- User-reported Windows x64 result for v2 on 2026-11-11: 99/100 .NET tests
  passed. The sole failure was `Iis_sub_application_uses_its_path_base_exactly_once`
  at line 42 because the test assumed `/v2/products` was compiled. The user
  reported four compiler warnings (CS1572, twice AV0029, and AV0030).
  v3 corrects only this invalid test expectation and the related guidance.
- Backend compilation and integration tests require the local Windows/.NET/ArcGIS
  environment and were not run by the candidate author in the Linux sandbox.
- Browser, IIS `PathBase`, Windows SSO, Swagger UI and Scalar UI require manual
  verification. The TestServer PathBase integration checks application-level
  routing; it does not emulate IIS authentication or ANCM startup.
- Recheck the user's latest uncommitted README/tracker content before applying
  those two replacement files; the delivered copies preserve the exact export
  overlay plus the DC-DEPLOY-01 additions.
