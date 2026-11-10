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

Use the versions in `package.json` and `package-lock.json`. From the repository root:

```powershell
Set-Location src/DataCatalogue
npm ci
Copy-Item .env.example .env.local
npm run check
npm run dev
```

Edit `.env.local` before starting Vite. To test the live API, set `VITE_CATALOGUE_SOURCE=live`.
Set `VITE_CATALOGUE_API_BASE_URL` to the approved origin/hosting prefix, or leave it empty for
same-origin routing. The client appends `/api/v1/...`. Credentials default to `same-origin`;
use `include` only for an approved credentialed cross-origin deployment with matching CORS.
The existing Vite configuration does not add an API proxy. An empty base URL therefore requires
hosting/proxy routing to the API; the Vite server alone does not serve these endpoints.

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
- [Calcite usage decisions](docs/CALCITE_USAGE_LOG.md).
