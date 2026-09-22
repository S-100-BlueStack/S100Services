# DataCatalogue project instructions

Help with the DataCatalogue frontend in `S-100-BlueStack/S100Services/src/DataCatalogue`, formerly `src/JobManager`, alongside Product Manager.

Preserve the Jobs/AOI map workflow and add a separate Feature-to-Workspace assessment page. Do not import decisions from the separate Product Catalogue project.

## Language and terminology

- Reply to the user in Danish.
- Write UI text, code, identifiers, comments, filenames, documentation, test names, log messages, configuration names and commit messages in English.
- Preserve the original language of source data, such as Danish notice content.
- Use DataCatalogue as the app name and Jobs as the user-facing work-item term. Do not replace Jobs with Tasks or Features.
- A Feature is one geographic object. A Workspace is a system/table/subset with optional geography. A work area is an AOI spanning Workspaces. An ENC is an individual chart cell. Keep these concepts separate.
- Code comments should explain why, not repeat what the code does.

## Source of truth and working method

- Use the supplied commit/archive/context/manifest. Verify hashes and relevant files before implementation.
- Do not substitute memory, earlier chats/candidates, HEAD or a moving branch tip for the authoritative baseline.
- Prefer uploads; never assume local repository access. Request one Markdown context export with a concrete PowerShell command when more files are needed.
- Export commit-pinned context from Git blobs, not a dirty working tree.
- Be practical. Recommend a better approach only for material correctness, maintainability, performance or simplicity benefits.
- Ask questions only when missing information could materially change implementation. Otherwise state narrow assumptions and proceed.
- Do not commit unless requested. Preserve unrelated behavior and dependencies.
- Continue controlled candidates without reimplementation or unrelated redesign.

## Ownership and architecture

- The colleague owns the APIs. Do not modify or rename backend projects, implementations or contracts without agreement.
- Follow existing Vite, ArcGIS, Calcite and Bootstrap conventions; verify actual versions and scripts.
- Keep feature-based ownership, central service/error handling, notices and documented popup flows.
- Keep backend normalization, domain logic, storage and layer construction out of UI components.
- Isolate mock and API data behind replaceable service/adapter boundaries.
- Prefer Calcite controls where suitable. Record deliberate alternatives in `docs/CALCITE_USAGE_LOG.md`.
- Never expose credentials or private endpoints in source, documentation examples or bundles. Use placeholder values in `.env.example`.

## Documentation and planning

Use and update these documents with the implementation:

- `docs/PROJECT_TRACKER.md`: goals, current status, decisions and concrete tasks.
- `docs/FEATURE_WORKSPACE_SCOPE.md`: accepted assignment-page requirements and boundaries.
- `docs/ARCHITECTURE.md`: implemented structure and explicitly labelled planned boundaries.
- `docs/BACKEND_CONTRACTS.md`: integration assumptions, required inputs and unresolved contracts.
- `docs/CALCITE_USAGE_LOG.md`: UI component decisions.

Distinguish requirements, implementation, historical notes and unverified contracts. Preserve historical task IDs; use DataCatalogue IDs for new work.

Update docs with implementation, not as a separate user prerequisite. Use Not started, In progress, Blocked, Deferred and Done; report missing validation before proposing Done.

For larger plans cover recommendation, assumptions, files, plan and tracker updates.

## First Feature-to-Workspace prototype

The frontend rename must be accepted before implementing this page.

- A separate navbar page uses four desktop/laptop panels: Feature filters/list upper left, read-only Feature information lower left, Workspace assignments/comments upper right, and a simple map lower right. Keep independent scrolling and no automatic first selection.
- Package API splits packages into individual Features. Geographic mock types NM/KP use NM26nnnn/KP26nnnn names. Keep identity/name/Type separate. Pixel data is deferred.
- Read-only notice information uses ID, Title, References, Details, Nautical charts and Publication. Optional fields may be absent.
- DK1-DK5 initially map to layers 4-8. Support multiple layers per Workspace for possible DK1-3 / DK4-5 grouping, optional geography and no fixed Workspace count limit.
- Users can assign any Workspace regardless of overlap. Assigned means one or more active links; Not assigned means none. This is not a work-completion status.
- Only assignments and new comments are editable. Comments are optional and append-only after Save. Preserve history when a link is removed, recreated or replaced. The mock history model is provisional, not an agreed API schema.
- Use explicit Save and protect dirty state during selection changes, navigation, unload and reset. Failed saves preserve drafts. Keep the selected details context when a successful save changes list-filter membership.
- Support thousands of Features through bounded rendering and service-level paging/filtering. Initial Feature filters are Type, Status and name search. Keep Workspace selection usable with a large searchable catalogue.
- Use one full-access mock user, local saved-data persistence, Reset mock data, latency/loading and reproducible read/save failures. Keep Jobs mocks independent.
- Initial testing requires live ArcGIS directly from the frontend, not synthetic geography. Verify metadata/auth/CORS and isolate access. Never embed or persist service passwords/tokens in frontend config/storage.
- The map shows linked and unlinked Workspace context, supports zoom, and has no popups or editing. Focus on Feature selection, not on each assignment/comment edit.

## Future integration

Expect Features from Package API and Workspaces/work areas from Workspace API. Assignment/comment ownership is unresolved. Verify routes, payloads, auth and pagination.

Production ArcGIS service-account access and Microsoft AD identity/authorization belong behind the backend, without a new application login page. Concurrent-edit conflicts require an API contract. Work-area locking, per-ENC completion, pixel data and automation are deferred. Do not equate Assigned with every affected ENC having been updated.

## Existing Jobs/map preservation

- Jobs panel starts closed and opens explicitly from navbar, AOI popup or Job popup.
- Dedicated Job details mode is the primary details surface; compact expansion is only for list scanning.
- Details remain read-only except existing status controls. All-Jobs refresh is acceptable until a single-Job endpoint exists.
- Preserve sticky Back/Close navigation, Jobs overlay sizing, filters, map/list coordination, hover cleanup, clustering and notices.
- Preserve dark/light preference during renames and avoid large pointer focus outlines while retaining keyboard `:focus-visible`.
- Do not finalize AOI fields/auth/geometry or expand AOI details/clustering from provisional test data.
- Prefer targeted screenshot/test-driven UI fixes over refactors.

## Delivery and validation

For inline files give repository path and Create, Replace entire file or exact insertion. Multiple edits require full files. One file per block; no diffs unless requested. Use `~~~md` around nested documentation fences.

Prefer ZIPs with complete changed/new files, full docs and repository-relative paths. Explain moves/deletions explicitly; ZIP extraction cannot remove old files. Never overwrite a dirty/different baseline silently.

Report scope, exact files, validation, limits and an English commit message. Verify `package.json` before naming scripts such as format, format:check, lint, test, build, check or rdy.

Describe browser checks and unavailable validation. Never claim build, browser, service or API success without verification.
