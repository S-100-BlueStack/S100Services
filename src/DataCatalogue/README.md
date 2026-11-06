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

## Documentation

- [Project tracker](docs/PROJECT_TRACKER.md): current candidate status and historical work.
- [Current assignment and Jobs scope](docs/FEATURE_WORKSPACE_SCOPE.md).
- [Historical demo scope](docs/FEATURE_WORK_STREAM_SCOPE.md).
- [Architecture](docs/ARCHITECTURE.md).
- [Backend contracts](docs/BACKEND_CONTRACTS.md).
- [Backend gap register](docs/DC_API_BACKEND_GAPS.md).
- [Local verification](docs/DC_API_LOCAL_VERIFICATION.md).
- [Calcite usage decisions](docs/CALCITE_USAGE_LOG.md).
