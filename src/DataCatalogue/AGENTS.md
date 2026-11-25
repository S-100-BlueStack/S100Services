# DataCatalogue Agent Instructions

These instructions apply to `src/DataCatalogue/**` in `S-100-BlueStack/S100Services`. They do not authorize changes to other applications or backend projects. Follow an explicit task's scope and authoritative baseline over historical notes in this file or elsewhere.

## Source of truth and task workflow

- Use the baseline commit explicitly supplied for the task, or a newer explicitly accepted commit/candidate. Do not assume `HEAD`, `main`, a branch tip, previous chats, or old ZIPs contain the authoritative source.
- Before modifying an existing file, inspect its authoritative contents. Verify the archive SHA-256 and each manifest entry against its bytes and recorded Git blob ID. Use Git blobs for commit-pinned exports, with an explicitly scoped working-tree export for relevant uncommitted changes.
- Prefer a verified baseline archive, task context, or available Project files. If source is missing, request one targeted PowerShell context export. Do not assume GitHub access, a repository checkout, network access, `node_modules`, or an npm registry.
- Begin larger changes by identifying the affected feature boundaries and preservation requirements. Keep changes focused; preserve accepted behavior unless the task explicitly changes it.
- When a contract or behavior is ambiguous, document and defer that part rather than inventing an API or silently changing behavior. Continue independent, verifiable work.
- Do not commit unless explicitly instructed.

## Language and terminology

- Reply to the user in Danish. Use English for UI text, code, identifiers, comments, filenames, documentation, tests, logs, configuration, and commit messages.
- Use **Packages** for the user-facing Main Map workflow. Retain `Job` for the internal contextual work item and preserve the isolated historical mock workflow. Do not introduce **Tasks** or **Opgaver**.
- A **Package** is the assignment unit: one generalized AOI with one or more detailed geographic **Features**. A Feature is not a Package.
- A **Workstream** (plural **Workstreams**) is the user-facing name for a backend **Pipeline**, a product definition. A Package may have bindings to multiple Pipelines. Keep Pipeline identifiers, routes, payload fields, keys and service boundaries unchanged. Use Workstream in application-owned UI text, accessible names and user-facing messages; retain actual entity names, opaque IDs and backend diagnostics verbatim.
- A **Workspace** is a geographic work area scoped to a Pipeline (shown as a Workstream). Workspaces remain Workspaces. `Work area` and `Work stream` are historical prototype terms for Workspace, not synonyms for the live Workstream/Pipeline concept. Preserve the historical mock UI and its technical identifiers; do not perform a global search-and-replace.
- Live Workspace membership is derived by the backend from an active Package–Pipeline binding and intersection with the Package's generalized rectangular AOI. It is not a manually saved Package–Workspace selection.
- A **Job** is a Package in a particular Pipeline and Workspace context. Its contextual identity must distinguish `(packageId, pipelineId, workspaceId)`; do not merge distinct contexts based only on Package ID.
- Use **Done** and **No update** for the established terminal status actions. Keep Job progress, quality control, Workspace ownership and Package assignment distinct. See the [backend gaps](docs/DC_API_BACKEND_GAPS.md) for persistence and workflow availability.
- Package `Severity` is an exact unsigned 64-bit value: lower means higher priority, `0` is highest, and `18446744073709551615` means `Not prioritized`. A missing/null value is `Unspecified`. Never round unsafe integers through JavaScript `Number` or invent `High`/`Medium`/`Low` thresholds.

## Architecture and backend boundaries

- Keep `src/app` responsible for composition and lifecycle wiring, not domain rules or API normalization.
- Keep API transport and contract normalization in `src/shared/api` and relevant feature services/adapters. UI must not call backend endpoints directly, manage mock persistence, or construct ArcGIS layers.
- Keep Jobs, assignment, AOI, relation, and map responsibilities within their existing feature boundaries. Preserve the distinction between the assignment page and the Jobs/main-map workflow.
- Keep `mock` and `live` modes explicit and isolated. A failed live request must produce an honest error, never a silent fallback to mock data or a successful empty result.
- Independent Package–Pipeline writes may partially succeed. Show individual outcomes, reconcile against authoritative backend state, preserve unresolved edits, and avoid duplicate logical requests.
- Async operations must have a single lifecycle/generation owner. Stale requests, renders, and teardown callbacks must not publish state after a newer operation.
- The backend owns authentication, authorization, persistence, and API contracts. Never hardcode or commit credentials, tokens, connection strings, or private service URLs. `VITE_*` variables are browser-visible. Do not change backend projects, routes, contracts, or Windows SSO without explicit scope.
- Capture history actors from the authenticated backend principal at mutation time. History retention follows the event store. Keep optional directory enrichment outside writes, events and persistent browser storage.
- Treat backend data and HTML descriptions as untrusted input. Sanitize any HTML intentionally rendered; do not inject raw source markup into the DOM.

## ArcGIS, Calcite, and UI behavior

- Preserve the existing ArcGIS `Map`/`MapView` architecture. Map lifecycle, geometry conversion, layers, filters, highlights, and popups belong under `src/features/map`.
- Use the existing basemap and add overlays only from verified geometry contracts. Verify Esri JSON structure, spatial references, IDs, and source ownership. Do not invent Feature Service mappings or read a geodatabase directly from the browser. A Feature Service is not required merely to display verified backend-provided geometry.
- Prefer official/public ArcGIS and Calcite APIs, including documented `--calcite-*` CSS variables. Keep the existing private Calcite header access confined to the [documented Workspace popup exception](docs/CALCITE_USAGE_LOG.md#dc-map-popup-05---native-header-compatibility-exception-2026-11-24). Record deliberate Calcite opt-outs in [the usage log](docs/CALCITE_USAGE_LOG.md).
- Keep the compact, data-oriented desktop/laptop UI. Preserve light/dark mode, keyboard access, Escape and focus restoration, tooltips, scrolling, and reduced-motion preferences. Use `:focus-visible`; do not interrupt native input or replace stable controls unnecessarily.
- Avoid large UI redesigns, broad refactors, and unnecessary dependencies. Use the existing project conventions.

## Documentation and verification

- Consult `docs/PROJECT_TRACKER.md` for current decisions and work status, `docs/ARCHITECTURE.md` for ownership, `docs/BACKEND_CONTRACTS.md` for verified contracts, `docs/FEATURE_WORKSPACE_SCOPE.md` for the live domain, `docs/DC_API_BACKEND_GAPS.md` for unresolved integration gaps, and `docs/CALCITE_USAGE_LOG.md` for component decisions. Older prototype sections may be historical; do not treat them as current over later accepted decisions.
- Update the relevant documentation with implementation changes, new decisions, constraints, mock behavior, and explicitly deferred gaps. Do not bury temporary candidate status in this file.
- Prefer tests for domain mapping, service/adapter boundaries, exact `uint64` parsing, independent writes, persistence isolation, lifecycle/races, and regressions. Avoid tests tied to private ArcGIS/Calcite DOM internals.
- From `src/DataCatalogue`, verify the scripts in `package.json`, then run `npm run format` followed by `npm run check`. Use `npm run rdy` only when a dev server is also wanted. Report exactly which checks ran and which were blocked.
- If a new npm dependency is necessary, specify the exact package/version and install command. Do not hand-edit `package-lock.json`; let local npm generate the lockfile changes.
- Prefer a delivery ZIP containing complete new/replacement files at repository-relative paths. Report the task baseline, files added/changed/deleted, actually executed checks, local browser checks, known uncertainties, ZIP SHA-256, and a suggested English commit message.
