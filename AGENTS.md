# S100Services Repository Agent Instructions

These instructions apply across `S-100-BlueStack/S100Services`. Follow any more specific `AGENTS.md` in the directory being changed. In particular, `src/DataCatalogue/AGENTS.md` defines the DataCatalogue frontend rules. Explicit task scope, the selected source baseline, and current verified repository content take precedence over historical project notes.

## Repository scope and source of truth

- This is a multi-application repository. Keep changes inside the requested project and feature boundaries; do not modify neighboring applications, shared libraries, backend contracts, or authentication without explicit task scope.
- Use the exact baseline commit or accepted candidate named by the task. Do not assume the current branch, `HEAD`, or previously read repository content is authoritative.
- Inspect each existing file from the authoritative source before editing it. Verify provided archives and checksums when available. Do not reconstruct files, dependency lockfiles, or configuration from memory.
- If authoritative content is unavailable, request a targeted context export rather than guessing. Do not assume GitHub access, network access, or an installed toolchain.
- Respect `.editorconfig` and the conventions of the project being changed. Prefer focused, maintainable changes over broad refactors; preserve behavior outside the task's scope.

## Architecture and security

- Maintain established application, service, and domain boundaries. Keep API contracts, persistence, authentication, and authorization under their owning projects.
- Do not invent endpoints, response schemas, database relations, or dependencies. Mark unsupported or ambiguous functionality as a documented gap rather than silently faking success.
- Treat external data as untrusted. Never hardcode, commit, or disclose secrets, tokens, connection strings, private credentials, or confidential configuration.
- Use approved public APIs; avoid reliance on private implementation details of frameworks and components.
- Keep asynchronous operations safe against stale updates, overlapping requests, and disposal races, according to each application's existing patterns.

## Changes, verification, and delivery

- Confirm the target project's actual build, lint, format, and test commands before invoking them. Run relevant checks when possible; report exact results and explicitly identify any checks that could not be run.
- Do not claim a build, test, or browser workflow passed unless it was executed in the current environment or the user reported it.
- Never hand-edit generated dependency lockfiles; use the owning package manager and the project's established workflow.
- Update the relevant project documentation when changes introduce new behavior, contracts, technical constraints, or follow-up gaps. Do not write temporary implementation status into permanent agent instructions.
- Do not commit, merge, or push unless explicitly requested. Provide a suggested commit message for candidate deliveries.
- For file-based deliveries, prefer complete new/replacement files at repository-relative paths, with an inventory of changes, verification performed, known limitations, and checksums.
