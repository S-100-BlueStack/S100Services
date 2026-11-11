# DC-DEPLOY-01 — API route base alignment validation

## Post-commit deployment verification (2026-11-11)

The route changes from DC-DEPLOY-01 v1-v3 are present in committed baseline
`a986e7f20f96aa3e4a6d5acbaeebe836b5cb91d0`. The user reports that the
DataCatalogue test deployment started working after removing
`VITE_CATALOGUE_API_BASE_URL=/api` from `.env`. That is a real-world observation,
not proof that the deployed API is mounted at the website root: the observed
browser Request URL, IIS application structure, effective Vite build variables,
reverse-proxy rules and deployed assets were not included in the source export.

Source inspection confirms `catalogueService.js` passes `/v1/...` paths and
`catalogueClient.js` prepends only the configured base. Unset means the browser
requests `/v1/...`; `/api` means `/api/v1/...`. The backend controller templates
are application-relative `v{version:apiVersion}/...`. Existing frontend tests
cover both URL shapes and reject resource paths containing `/api/v1/...`.
There is no source-supported reason to change production routes or introduce
automatic base-path guessing. The remaining acceptance task is to match the
_deployed_ public API prefix and frontend build inputs to observed HTTP traffic.

The original 2026-11-11 v1-v3 instructions below describe the intended IIS
`/api`-subapplication layout. They must not be treated as proof that every test
or production environment uses that hosting topology.

## Authority and scope

- Repository: `S-100-BlueStack/S100Services`
- Committed baseline: `22e2ff7da5578f26559189eca06c9118e8227bfe`.
- Source: verified `DC-DEPLOY-01-Context-22e2ff7da557-20261111-092627.zip` and SHA-256 manifests (268 baseline files, 231 working-tree overlay files).
- Local uncommitted changes at export: DC-SDK-01 frontend/package changes, including README and project tracker. This candidate preserves those exact snapshots; they are **not** committed or approved by DC-DEPLOY-01.
- Scope: controller templates, frontend URL composition, route expectations, OpenAPI UI path handling, and deployment documentation.
- Out of scope: API payloads, API version semantics, authentication/authorization, data persistence, frontend Jobs/Package/Workspace logic, ArcGIS/Calcite, IIS configuration deployment and dependency changes.

## Routing contract

| Context                           | API base URL              | Resource path             | Final request path                     |
| --------------------------------- | ------------------------- | ------------------------- | -------------------------------------- |
| IIS Application mounted at `/api` | `/api`                    | `/v1/pipelines`           | `/api/v1/pipelines`                    |
| IIS Application mounted at `/api` | `/api`                    | `/v1/dispatcher/bindings` | `/api/v1/dispatcher/bindings`          |
| Direct Kestrel on another origin  | `https://localhost:51849` | `/v1/pipelines`           | `https://localhost:51849/v1/pipelines` |
| Same-origin API at site root      | unset / empty             | `/v1/pipelines`           | `/v1/pipelines`                        |

For the **IIS `/api` Application** scenario, IIS/ASP.NET Core Module supplies
`PathBase=/api`. A plain IIS virtual directory is not a substitute for a hosted
ASP.NET Core Application. Hosting the API at the same-origin site root, where
`/v1/...` is publicly reachable, is a different valid topology and uses an
empty frontend base. Do not configure a duplicate prefix in backend routes,
frontend resource paths, a rewrite rule, or `UsePathBase` in production code.
The standalone Kestrel routes are `/v1/...`, even when IIS exposes `/api/v1/...`.
Existing external clients must use the actual public path for their environment.

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

## Test-server verification after removing the base setting

1. In browser Developer Tools, enable Network, reload the deployed frontend with
   a fresh asset load and inspect the successful `pipelines` and `packages`
   requests. Record each **Request URL**, HTTP status and `content-type` (do
   not capture credentials or response payloads containing private data).
2. If the URLs are same-origin `/v1/...`, keep `VITE_CATALOGUE_API_BASE_URL`
   unset for **that build/deployment**. Confirm the API really serves those URLs
   with authenticated JSON responses; do not restore `/api` just to match an IIS
   application name or a previous candidate's example.
3. If the URLs are `/api/v1/...`, verify which build-time input supplies `/api`
   despite removing the `.env` value. Check `.env.local`, `.env.production`,
   `.env.production.local` and the build process environment **by presence only**;
   do not share or commit secrets. Also inspect rewrites and stale bundled assets
   if the browser URL does not match the configured source.
4. If the intended API URL is `/api/v1/...` but the current bundle requests
   `/v1/...`, set the build-time base to `/api` and **rebuild/redeploy** the
   frontend after verifying the backend's public path. If the current `/v1/...`
   route succeeds, changing to `/api` would be a regression without a matching
   host route. There is no Vite development proxy in this project.
5. Verify both main-map Jobs and Package assignment read paths, a selected
   Package's bindings/geometry and the existing mutation/error handling. Confirm
   no unexpected `/api/api/`, `404`, HTML-as-JSON, CORS or auth failures.

The source archive excludes `.env*`, `package-lock.json`, deployed assets and IIS
configuration. These tests cannot be completed from the archive alone. Do not
claim a verified server mount path merely because either configuration worked.

## Manual IIS acceptance (only for an intentional `/api` subapplication)

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
