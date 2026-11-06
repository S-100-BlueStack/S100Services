# Product Catalogue development contract

Scope: `src/ProductCatalogue/`. This file applies only to this frontend; it does not define rules for other `S100Services` projects.

## Authority and task input

1. Use the **explicit commit named by the task** as the authoritative repository baseline. Never assume `HEAD` or `main` is that baseline.
2. Verify supplied archives, manifests and SHA-256 hashes before making edits. Read existing files from that commit (`git show` / `git archive`), not from remembered snippets or older candidates.
3. If a relevant file has uncommitted changes, inspect its current working-tree version. Do not silently replace those changes. If the source is unavailable, request a narrowly scoped local context bundle instead of reconstructing the file.
4. A newer explicitly accepted commit/candidate overrides older reports, trackers, archives and conversations. Historical documentation is not a runtime contract.
5. Keep the change limited to the user's task. Prefer complete replacement/new files in the repository's paths. Do not commit or push unless explicitly requested.

## Architecture and behavior

- Keep the established Vite, JavaScript, ArcGIS `Map`/`MapView`, Calcite and feature-boundary architecture. Do not introduce React, new frameworks or broad refactors without a separate decision.
- Resolve Products through the source registry, authoritative Product context, stable identity and capabilities. Support multiple independent sources; never branch authorization on source names or infer source from a display label.
- Keep Product search (lookup/selection/popup) distinct from Locator (geographic search/navigation).
- Backend status, job/candidate state and mutation permissions remain authoritative. Unsupported or unverified workflows fail closed. Never route a Product through another source's compatibility endpoints.
- Maintain independent state owners for Product Collection, History/Timeline, Analyze, Review, filters, popup actions, notices and API errors.
- Each asynchronous workflow needs a clear session/generation owner. Superseded work must not publish state or duplicate logical requests. Destroyed/closed views and popups must not retain active observers or callbacks.
- Use documented public ArcGIS/Calcite APIs. Avoid private shadow DOM selectors. Preserve keyboard, focus, Escape, accessibility, responsive layout and light/dark themes.
- UI text, code, comments, tests, filenames, docs and commit messages use English. Discussion with the project owner may be in Danish.

Read [Architecture invariants](docs/INVARIANTS.md), [Module map](docs/MODULE_MAP.md) and [demo readiness](docs/demo-readiness-plan.md) before changing feature contracts. Consult the relevant feature README, current frontend tracker and task-specific acceptance records for detailed behavior.

## Dependencies and verification

- Do not invent installed package versions, lockfile changes, backend routes or verification results.
- For a new npm dependency, state the exact package/version and `npm install` command. Let the developer generate `package-lock.json` with npm; never hand-edit the lockfile.
- On the developer machine, run from `src/ProductCatalogue`:

  ```powershell
  npm run format
  npm run check
  ```

- If the full check cannot be run in the execution environment, run available focused Node tests and `node --check` for changed JavaScript files. Report precisely which checks ran and which did not.
- Prefer tests for behavior, domain contracts, source capabilities, async generations, teardown and focus/request races. Avoid tests tied only to exact source text or private ArcGIS/Calcite internals.
- Update feature documentation when an accepted lifecycle, architecture, API contract or user interaction changes.

## Delivery and demo stability

- Preserve already accepted behavior unless the task explicitly changes it.
- List the baseline commit, changed/new/deleted files, dependencies, checks actually performed, manual verification, known limitations and ZIP SHA-256 with each candidate. For corrections, compare against the latest accepted candidate and retain its accepted parts.
- Separate **observed**, **user-reported**, **inferred** and **unverified** claims. A passing frontend test does not prove backend or production behavior.
- Prioritize demo reliability and focused bug fixes. Defer SDK upgrades, alternate UI frameworks, experimental map visualizations and new test stacks to a separately approved branch.
- Treat the current frontend tracker and release-readiness review as planning records; reconcile their status against the task's explicit baseline before editing them.
