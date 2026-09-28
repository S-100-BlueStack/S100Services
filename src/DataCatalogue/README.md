# DataCatalogue frontend

DataCatalogue is an ArcGIS/Vite frontend in `S100Services/src/DataCatalogue`, alongside Product Manager.

## Current implementation

The existing main-map workflow displays Areas of Interest and related Jobs. It includes the Jobs list/details panel, status changes, filters, clustering, popup actions, notices, refresh coordination and dark/light mode.

The frontend rename preserves this behavior. It does not implement the new Feature-to-Workspace assignment page or connect the APIs.

## Next delivery

The accepted next workflow is a separate desktop/laptop page for manually assigning individual Features to Workspaces and adding comments. See [Feature-to-Workspace scope](docs/FEATURE_WORKSPACE_SCOPE.md) for the complete accepted requirements and explicit exclusions.

Features are expected from Package API, and Workspaces/work areas from Workspace API. Assignment/comment ownership is unresolved. The initial page will use mock application data and live ArcGIS map context through a temporary direct-browser integration. Production access and AD authorization will later be backend-mediated.

API implementation is owned by the colleague and is outside the frontend rename scope.

## Technology

- ArcGIS Maps SDK for JavaScript
- Vite
- Calcite Components
- Bootstrap
- JavaScript and HTML/CSS

Use the versions in `package.json` and `package-lock.json`. The rename changes package identity, not dependency versions or scripts.

## Local development

From the repository root:

```powershell
Set-Location src/DataCatalogue
npm ci
npm run check
npm run dev
```

The existing map requires local AOI configuration. Copy `.env.example` to a local environment file and configure the approved source locally. Never put credentials or tokens in `VITE_*` values or commit local configuration. The new assignment-page map-source settings have not been implemented yet.

`npm run check` runs format checking, lint, tests and build without starting a server. `npm run rdy` formats, lints, tests, builds and starts the existing HTTPS dev server. No dependency upgrade is part of this rename.

## Documentation

- [Project tracker](docs/PROJECT_TRACKER.md): requirements, history and current task status.
- [Assignment scope](docs/FEATURE_WORKSPACE_SCOPE.md): accepted next delivery, not implemented behavior.
- [Architecture](docs/ARCHITECTURE.md): existing ownership and planned boundaries.
- [Backend contracts](docs/BACKEND_CONTRACTS.md): integration inputs and unresolved contracts.
- [Calcite usage log](docs/CALCITE_USAGE_LOG.md): component decisions.
- [Rename notes](docs/RENAME_NOTES.md): migration scope, safety and validation.
- [ChatGPT project instructions](docs/CHATGPT_PROJECT_INSTRUCTIONS.md): replacement text to apply to the ChatGPT project; creating this file does not change ChatGPT settings.
