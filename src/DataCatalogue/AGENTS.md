# DataCatalogue Agent Instructions

These instructions apply to `src/DataCatalogue/**` in `S-100-BlueStack/S100Services`. They do not authorize changes to other applications or backend projects. Follow an explicit task's scope and authoritative baseline over historical notes in this file or elsewhere.

## Source of truth and task workflow

- Use the baseline commit explicitly supplied for the task, or a newer explicitly accepted commit/candidate. Do not assume `HEAD`, `main`, a branch tip, previous chats, or old ZIPs contain the authoritative source.
- Before modifying an existing file, inspect its authoritative contents. Verify supplied archives, manifests, and SHA-256 values. Do not reconstruct repository files from memory.
- Prefer a verified baseline archive, task context, or available Project files. If source is missing, request one targeted PowerShell context export. Do not assume GitHub access, a repository checkout, network access, `node_modules`, or an npm registry.
- Begin larger changes by identifying the affected feature boundaries and preservation requirements. Keep changes focused; preserve accepted behavior unless the task explicitly changes it.
- When a contract or behavior is ambiguous, document and defer that part rather than inventing an API or silently changing behavior. Continue independent, verifiable work.
- Do not commit unless explicitly instructed.

## Language and terminology

- Reply to the user in Danish. Use English for UI text, code, identifiers, comments, filenames, documentation, tests, logs, configuration, and commit messages.
- Use **Jobs** in the UI, never **Tasks** or **Opgaver**.
- A **Package** is the assignment unit: one generalized AOI with one or more detailed geographic **Features**. A Feature is not a Package.
- A **Pipeline** is a product definition. A Package may have bindings to multiple Pipelines.
- A **Workspace** is a geographic work area scoped to a Pipeline. `Work area` and `Work stream` are historical frontend terms for Workspace, not additional live entities. Avoid broad internal renames solely to update labels.
- Live Workspace membership is derived by the backend from an active Package–Pipeline binding and intersection with the Package's generalized rectangular AOI. It is not a manually saved Package–Workspace selection.
- A **Job** is a Package in a particular Pipeline and Workspace context. Its contextual identity must distinguish `(packageId, pipelineId, workspaceId)`; do not merge distinct contexts based only on Package ID.
- Job workflow status is currently isolated mock state per contextual identity; it is not persisted by the API. Future status labels are not final. Workspace ownership/locks are not Job progress. Comments remain demo/mock-only until a contract is provided.
- Package `Severity` is an exact unsigned 64-bit value: lower means higher priority, `0` is highest, and `18446744073709551615` means `Not prioritized`. A missing/null value is `Unspecified`. Never round unsafe integers through JavaScript `Number` or invent `High`/`Medium`/`Low` thresholds.

## Architecture and backend boundaries

- Keep `src/app` responsible for composition and lifecycle wiring, not domain rules or API normalization.
- Keep API transport and contract normalization in `src/shared/api` and relevant feature services/adapters. UI must not call backend endpoints directly, manage mock persistence, or construct ArcGIS layers.
- Keep Jobs, assignment, AOI, relation, and map responsibilities within their existing feature boundaries. Preserve the distinction between the assignment page and the Jobs/main-map workflow.
- Keep `mock` and `live` modes explicit and isolated. A failed live request must produce an honest error, never a silent fallback to mock data or a successful empty result.
- Independent Package–Pipeline writes may partially succeed. Show individual outcomes, reconcile against authoritative backend state, preserve unresolved edits, and avoid duplicate logical requests.
- Async operations must have a single lifecycle/generation owner. Stale requests, renders, and teardown callbacks must not publish state after a newer operation.
- The backend owns authentication, authorization, persistence, and API contracts. Never hardcode or commit credentials, tokens, connection strings, or private service URLs. `VITE_*` variables are browser-visible. Do not change backend projects, routes, contracts, or Windows SSO without explicit scope.
- Treat backend data and HTML descriptions as untrusted input. Sanitize any HTML intentionally rendered; do not inject raw source markup into the DOM.

## ArcGIS, Calcite, and UI behavior

- Preserve the existing ArcGIS `Map`/`MapView` architecture. Map lifecycle, geometry conversion, layers, filters, highlights, and popups belong under `src/features/map`.
- Use the existing basemap and add overlays only from verified geometry contracts. Verify Esri JSON structure, spatial references, IDs, and source ownership. Do not invent Feature Service mappings or read a geodatabase directly from the browser. A Feature Service is not required merely to display verified backend-provided geometry.
- Prefer official/public ArcGIS and Calcite APIs, including documented `--calcite-*` CSS variables. Avoid private Calcite shadow-DOM selectors. Record deliberate Calcite opt-outs in `docs/CALCITE_USAGE_LOG.md`.
- Keep the compact, data-oriented desktop/laptop UI. Preserve light/dark mode, keyboard access, Escape and focus restoration, tooltips, scrolling, and reduced-motion preferences. Use `:focus-visible`; do not interrupt native input or replace stable controls unnecessarily.
- Avoid large UI redesigns, broad refactors, and unnecessary dependencies. Use the existing project conventions.

## Documentation and verification

- Consult `docs/PROJECT_TRACKER.md` for current decisions and work status, `docs/ARCHITECTURE.md` for ownership, `docs/BACKEND_CONTRACTS.md` for verified contracts, `docs/FEATURE_WORKSPACE_SCOPE.md` for the live domain, `docs/DC_API_BACKEND_GAPS.md` for unresolved integration gaps, and `docs/CALCITE_USAGE_LOG.md` for component decisions. Older prototype sections may be historical; do not treat them as current over later accepted decisions.
- Update the relevant documentation with implementation changes, new decisions, constraints, mock behavior, and explicitly deferred gaps. Do not bury temporary candidate status in this file.
- Prefer tests for domain mapping, service/adapter boundaries, exact `uint64` parsing, independent writes, persistence isolation, lifecycle/races, and regressions. Avoid tests tied to private ArcGIS/Calcite DOM internals.
- From `src/DataCatalogue`, run `npm run check` after frontend changes; confirm available scripts in `package.json`. Run `npm run format` before commit. Use `npm run rdy` only when a dev server is also wanted. Report exactly which checks ran and which were blocked.
- If a new npm dependency is necessary, specify the exact package/version and install command. Do not hand-edit `package-lock.json`; let local npm generate the lockfile changes.
- Prefer a delivery ZIP containing complete new/replacement files at repository-relative paths. Report the task baseline, files added/changed/deleted, actually executed checks, local browser checks, known uncertainties, ZIP SHA-256, and a suggested English commit message.
