# DataCatalogue frontend

DataCatalogue is an ArcGIS/Vite frontend in `S100Services/src/DataCatalogue`.

## Current candidate

DC-API integrates source-verified v1 reads and Package–Pipeline writes against baseline
`08d9281fe35b06012bda430c94767ef69a439d3e`. It is a frontend integration candidate,
not a claim that deployment, authentication, map geometry or browser acceptance is verified.
No backend files, dependencies or lockfiles are changed.

Two explicit source modes are available:

- `mock` (default): existing Jobs/AOI and four-panel Feature/Work stream demo, including its
  isolated saved assignments, comments, failure controls and reset.
- `live`: whole Packages with multiple Pipeline bindings; read-only derived Workspaces;
  Workspace-backed Jobs in the existing Jobs panel. Job status is mock-only, in memory and
  independently keyed by Package, Pipeline and Workspace. Live failures never load demo data.

Severity is exact uint64 priority, with smaller values first, `0` highest and
`18446744073709551615` displayed as `Not prioritized`. Null is `Unspecified`.
No High/Medium/Low bands are inferred. Jobs are sorted within the complete selected Workspace;
the Package assignment list retains server paging/order.

Live maps do not display Package/Workspace overlays until the approved geographic mapping is
verified. Workspace list and Package/Job access remain usable independently of map readiness.
Demo geometry URLs must not be treated as live catalogue joins.

## Local development

DC-SDK-01 declares matching exact 5.2.1 versions of ArcGIS Core, Map Components,
and Calcite. The committed lockfile must be regenerated with npm **before** running
`npm ci`, `npm run check`, or building the upgrade candidate. From
`src/DataCatalogue`, run:

```powershell
npm install --save-exact @arcgis/core@5.2.1 @arcgis/map-components@5.2.1 @esri/calcite-components@5.2.1
npm run format
npm run check
```

Review and commit both `package.json` and the npm-generated `package-lock.json`
only after the local check and browser tests pass. Do not hand-edit the lockfile.
For the full verification matrix and 6.0 compatibility follow-ups, see
[DC-SDK-01 validation](docs/DC_SDK_01_VALIDATION.md).

For a fresh checkout _after_ the lockfile has been committed, from the repository root:

```powershell
Set-Location src/DataCatalogue
npm ci
Copy-Item .env.example .env.local
npm run check
npm run dev
```

Edit `.env.local` before starting Vite. To test the live API, set `VITE_CATALOGUE_SOURCE=live`.
Set `VITE_CATALOGUE_API_BASE_URL=/api` when hosting the API as an IIS Application at `/api`.
The API client appends application-relative `/v1/...` paths exactly once, producing public
`/api/v1/...` URLs. For standalone local Kestrel, use its origin (for example,
`https://localhost:51849`) with no `/api` suffix; the resulting path is `/v1/...`.
Credentials default to `same-origin`; use `include` only for approved credentialed
cross-origin development with matching CORS. The existing Vite configuration does not
add an API proxy. An empty base URL only works when the frontend origin also routes `/v1`
to the API. Changing `VITE_*` values requires a frontend rebuild for IIS deployment.
See [DC-DEPLOY-01 validation](docs/DC_DEPLOY_01_VALIDATION.md) for release and rollback checks.

`VITE_*` configuration is public in the browser and read at build/start time. Never store
passwords, tokens or service credentials there. Restart Vite after changing source mode.
Windows Negotiate is configured in the backend source; actual SSO permissions, origin and
CORS must be checked locally. Backend in-memory persistence is acceptable for integration
testing only and may be lost at restart.

`npm run check` runs format checking, lint, tests and build. If formatting adjustments are
needed after extraction, review `npm run format` output before rerunning `npm run check`.
This environment had no project dependencies; see the exact executed checks in the delivery
report and [local verification instructions](docs/DC_API_LOCAL_VERIFICATION.md).

## Branding and IIS virtual directories

DataCatalogue supports the same browser-visible branding environment variables as
ProductCatalogue. For an IIS `/branding` virtual directory, set these in the
DataCatalogue `.env.local` (or approved build environment):

```dotenv
VITE_APP_LOGO_URL=/branding/Logo.png
VITE_APP_LOGO_ALT=Geodatastyrelsen
VITE_APP_FAVICON_URL=/branding/Favicon.png
```

The shared navbar applies the logo and alt text to both the main map and Package
assignment. The page icon is set in `index.html` and updated by application startup.
With no overrides, both use the existing `/images/logo96.png` asset and the navbar
keeps its existing `GST` alternative text. A failed custom navbar logo falls back
to the bundled asset; verify that the favicon URL actually resolves in IIS.

`VITE_*` values are included in the Vite build, not fetched dynamically from IIS.
Restart the local dev server or rebuild and redeploy the frontend when changing
these values. IIS must serve the virtual directory at the configured root path;
the Vite development server does not provide the IIS virtual directory. These
paths must not contain secrets or authentication tokens.

## Documentation

- [Project tracker](docs/PROJECT_TRACKER.md): current candidate status and historical work.
- [Current assignment and Jobs scope](docs/FEATURE_WORKSPACE_SCOPE.md).
- [Historical demo scope](docs/FEATURE_WORK_STREAM_SCOPE.md).
- [Architecture](docs/ARCHITECTURE.md).
- [Backend contracts](docs/BACKEND_CONTRACTS.md).
- [Backend gap register](docs/DC_API_BACKEND_GAPS.md).
- [Local verification](docs/DC_API_LOCAL_VERIFICATION.md).
- [IIS route alignment](docs/DC_DEPLOY_01_VALIDATION.md).
- [Calcite usage decisions](docs/CALCITE_USAGE_LOG.md).
