# DataCatalogue frontend

DataCatalogue is an ArcGIS/Vite frontend in `S100Services/src/DataCatalogue`.

## Terminology and source modes

The live frontend calls the backend Pipeline concept **Workstream** (plural
**Workstreams**). **Workspace** is a separate, unchanged geographic work area.
API routes, DTOs, `pipelineId`, `hasPipeline`, `pipelineBindings`, bindings and
contextual Job identities retain the technical Pipeline terminology. Historical
`Work stream` in the mock prototype denotes a different concept and is not a
live Pipeline. Backend-provided names, opaque IDs and diagnostic text are not
rewritten. See [current scope](docs/FEATURE_WORKSPACE_SCOPE.md).

Two explicit source modes are available:

- `mock` (default): existing Jobs/AOI and four-panel Feature/Work stream demo, including its
  isolated saved assignments, comments, failure controls and reset.
- `live`: whole Packages with multiple Workstream bindings; read-only derived Workspaces;
  contextual Jobs displayed in the Packages panel. Job status is mock-only, in memory and
  independently keyed by Package, Pipeline and Workspace. Live failures never load demo data.

Severity is exact uint64 priority, with smaller values first, `0` highest and
`18446744073709551615` displayed as `Not prioritized`. Null is `Unspecified`.
No High/Medium/Low bands are inferred. Jobs are sorted within the complete selected Workspace;
the Package assignment list retains server paging/order.

Live maps use the verified backend geometry contracts for Workspace coverage and
Package AOIs. Workspace list and Package/Job access remain usable independently
of map readiness. Demo geometry URLs are reserved for mock mode.

## Package Assignment

Live Workstream bindings are saved through the existing Pipeline API. The
Workspace list below each selected Workstream shows read-only matches from the
last saved binding response. New bindings get their matches on Save. The
historical mock Feature/Work stream assignment retains its separate draft and
comment behavior. See [live assignment scope](docs/FEATURE_WORKSPACE_SCOPE.md#package-assignment-page).

## Main-map Packages presentation

In the live main-map Packages panel, the Package short ID is the primary item
identity. Workstream/Workspace context and exact Severity remain visible without
treating every value as a heading. Status actions (`Done` and `No update`) are
presented together on each row and in Package Details. Details use compact
label/value rows with alternating neutral surfaces in light and dark modes.
This changes presentation only: contextual identity, temporary status mutations,
keyboard focus recovery and map behavior remain unchanged. Mock Packages retain
their existing distinct presentation. The header Refresh action is available only
in list mode; error-only Retry remains available in Details.

When live Package Details is opened, the right-hand `Package information` panel
shows the same read-only metadata fields and sanitized descriptions as Package
Assignment, using the already loaded contextual Jobs snapshot. The information
panel can be closed independently and reopened using the information action in
the Packages header. Back clears the details selection. Both side panels overlay
the unchanged map and keep their shadows. Narrow windows use a lower-right overlay
so the upper map controls remain accessible. List Refresh and error-only Retry
use the existing Packages read; the information panel adds no metadata requests. The existing selected-Package geometry read is unchanged.
Assignment-specific editing and saved-binding inspection remain in Package
Assignment. The left Details History section loads authorized committed Package and binding
events on demand. Its Refresh, Retry and Load older events controls are separate
from the Package list. Windows accounts are captured at mutation time. Explicit
sample initialization shows `System` and older events without actors show
`Actor not recorded`. Optional AD enrichment reads the current display name
and thumbnail for a recorded event. Unavailable profiles fall back to the
recorded account and neutral icon. The user confirmed local profile rendering
and checks. Verify the deployed IIS execution identity and cross-account access
when deploying. History follows the current in-memory event store's retention.
Temporary `Done` and `No update` statuses create no events. See
[backend contracts](docs/BACKEND_CONTRACTS.md#dc-package-timeline-04---actor-profile-enrichment-2026-11-25)
and [acceptance records](docs/PROJECT_TRACKER.md).

The accepted live Main Map labels display Workspace names at 1:5,000,000 or
closer and Package Short IDs at 1:3,000,000 or closer. Labels reuse existing
visible geometry and metadata and use native SDK collision handling. No
additional catalogue read is required. See `docs/PROJECT_TRACKER.md` for
DC-MAP-LABEL. The accepted Compilation/QC design preview is presentation-only;
functional QC filtering remains open pending a verified backend contract.

See [DC-UX-03D validation](docs/DC_UX_03D_VALIDATION.md) for browser acceptance.

## Local development

The manifest and committed lockfile pin ArcGIS Core, Map Components and Calcite
to 5.2.1. From the repository root, install the locked dependencies and create
a local environment file if one does not already exist:

```powershell
Set-Location src/DataCatalogue
npm ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

See [DC-SDK-01 validation](docs/DC_SDK_01_VALIDATION.md) for the historical
upgrade checks and later compatibility follow-ups.

Edit `.env.local` before starting Vite. To test the live API, set `VITE_CATALOGUE_SOURCE=live`.
`VITE_CATALOGUE_API_BASE_URL` specifies the **public API URL prefix**, not the controller
route or an API on/off switch. The frontend resource paths always start at `/v1/...`:

| Public API topology                                               | `VITE_CATALOGUE_API_BASE_URL`       | Example browser request                |
| ----------------------------------------------------------------- | ----------------------------------- | -------------------------------------- |
| Same origin exposes `/v1/...` at the website root                 | Unset (default empty)               | `/v1/pipelines`                        |
| Same origin exposes `/api/v1/...` via an IIS Application or proxy | `/api`                              | `/api/v1/pipelines`                    |
| Separate standalone Kestrel origin                                | `https://localhost:51849` (example) | `https://localhost:51849/v1/pipelines` |

Determine the correct prefix from the **actual public Request URL** in the browser's
Network panel, not merely the IIS application name. Never add `/api` to resource paths
or the ASP.NET Core controller templates. The 2026-11-11 test-server report says the
site worked after removing `/api` from `.env`; this does not independently establish
whether the deployed assets use an empty base, another build-time override, or a
server-side rewrite. Check the live request before changing the setting again.

Credentials default to `same-origin`; use `include` only for approved credentialed
cross-origin development with matching CORS. The existing Vite configuration does not
add an API proxy. A missing base produces `/v1/...` directly. `VITE_*` values come
from the build environment (`.env`, mode-specific files or process variables), and
changing them requires a rebuild and redeployment of the frontend static assets.
See [DC-DEPLOY-01 validation](docs/DC_DEPLOY_01_VALIDATION.md) for concrete checks.

### Optional ArcGIS Basemap Styles key

`VITE_ARCGIS_BASEMAP_API_KEY` is an optional **public browser** key for the
Human Geography Dark basemap. If configured, `features/map/basemaps/basemapSettings.js`
verifies the style with `BasemapStyle.apiKey`, then uses
`esriConfig.apiKeys.basemapStyles` only after successful validation and
a live settings lifecycle accepts the result.
The protected choice is hidden until validation succeeds; the other three
basemaps and both maps remain usable
if validation fails. Never use this value for the Catalogue API or Windows SSO.

A key working on another site does not prove that it is allowed on this site's
origin: verify the credential's Basemap Styles privileges and referrer restrictions
in ArcGIS, and examine the failed network request without copying the key into
logs or support reports. Changing the Vite variable requires rebuilding the app.
The Esri Gallery and Expand use the active application's `color-scheme` for
light/dark styling, independently of the selected basemap color palette.
See [DC-SDK-02 validation](docs/DC_SDK_02_VALIDATION.md) for local checks.

`VITE_*` configuration is public in the browser and read at build/start time. Never store
private credentials, user access tokens or passwords there. The scoped browser-visible
Basemap Styles API key above must have appropriate privileges and origin restrictions.
After configuring the environment, use `npm run check` and start Vite with
`npm run dev`. Restart Vite after changing source mode.
Windows Negotiate is configured in the backend source; actual SSO permissions, origin and
CORS must be checked locally. Backend in-memory persistence is acceptable for integration
testing only and may be lost at restart.

`npm run check` runs format checking, lint, tests and build. If formatting adjustments are
needed after extraction, review `npm run format` output before rerunning `npm run check`.
Use [local verification instructions](docs/DC_API_LOCAL_VERIFICATION.md) for
live API and browser checks, with current behavior described in the tracker.

## Main Map combined Workspace reads (DC-PERF-FE-01)

Live Main Map startup uses the DC-PERF-BE-02 backend endpoint
`GET /v1/pipelines/{pipelineId}/workspaces/overview?page=N&pageSize=20`.
One complete paged read per Pipeline supplies both the Workspace polygons and
initial Pipeline/Workspace-scoped Package memberships, eliminating the earlier
individual read waterfall in the success case. The existing API base URL and
Windows authentication configuration are unchanged. This deployment requires
DC-PERF-BE-02 on the target API; an unavailable endpoint fails visibly.

Null geometry or membership components use their corresponding existing
per-Workspace read endpoint. Members beyond the embedded first 200 use subsequent
legacy membership pages. Manual Packages refresh reads current membership again;
there is no long-lived membership cache. The Package assignment page is unchanged.
Local verification and three comparable cold/warm HAR runs are described in
[DC-PERF-FE-01 validation](docs/DC_PERF_FE_01_VALIDATION.md).

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

- [Project tracker](docs/PROJECT_TRACKER.md): current decisions, acceptance and historical work.
- [Current Package, Workstream and Workspace scope](docs/FEATURE_WORKSPACE_SCOPE.md).
- [Historical demo scope](docs/FEATURE_WORK_STREAM_SCOPE.md).
- [Architecture](docs/ARCHITECTURE.md).
- [ChatGPT workflow](docs/CHATGPT_PROJECT_INSTRUCTIONS.md).
- [Backend contracts](docs/BACKEND_CONTRACTS.md).
- [Backend gap register](docs/DC_API_BACKEND_GAPS.md).
- [Local verification](docs/DC_API_LOCAL_VERIFICATION.md).
- [IIS route alignment](docs/DC_DEPLOY_01_VALIDATION.md).
- [Calcite usage decisions](docs/CALCITE_USAGE_LOG.md).
- [Basemap authorization and theme checks](docs/DC_SDK_02_VALIDATION.md).
