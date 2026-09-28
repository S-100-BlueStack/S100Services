# DataCatalogue frontend rename

Status: Implementation candidate; local tooling and browser acceptance pending.

## Authoritative input

Commit: `e8bb33256802935592f7bcc700deb2bc21d223ba`.

The supplied archive SHA-256 is `9ABF47043072E891C3926C53F37CE87D880D6900CD4E260207FF38A6B0986903`.
The supplied context SHA-256 is `7D256D1B09D2CF56F55354BAFFEDCD0CAFF4A12A4C43F042EDD8BB2D921BFDCD`.
Both matched the manifest. All 150 exported file entries matched their SHA-256 and Git blob IDs before modification.

This is a scoped frontend snapshot, not the complete repository. The export records a different local HEAD, local changes not exported, and a different local `origin/DataCatalogue` reference. None of those replaces the explicitly selected input commit or proves the current remote tip.

Use a separate worktree at the input commit for testing. Do not overwrite the user's current branch or dirty tree with root files from this snapshot.

## Changes

Move all 144 existing frontend files from `src/JobManager` to `src/DataCatalogue`. Of those, 110 retain identical bytes and 34 also have content changes.

Rename app-owned identities consistently:

| Surface                                  | New identity                             |
| ---------------------------------------- | ---------------------------------------- |
| App title, navbar and startup/error text | DataCatalogue                            |
| npm package and lockfile root            | `data-catalogue`                         |
| App DOM/class/event/layer identifiers    | `data-catalogue-*` or `data-catalogue:*` |
| CSS custom properties                    | `--dc-*`                                 |
| Theme preference key                     | `data-catalogue:theme-mode`              |

The source folder structure, Jobs/AOI domain, existing UI behavior, package scripts, dependency resolutions, public asset paths, Vite configuration and existing environment variable names are preserved.

`README.md` at the repository root links to the renamed frontend. `.gitignore` protects the new frontend's local environment files while leaving `.env.example` trackable and retaining legacy local-artifact ignores for safety.

New frontend files:

```txt
docs/FEATURE_WORKSPACE_SCOPE.md
docs/CHATGPT_PROJECT_INSTRUCTIONS.md
docs/RENAME_NOTES.md
src/app/dataCatalogueBranding.test.js
src/features/theme/state/themeStorage.js
src/features/theme/state/themeStorage.test.js
```

No API file is included in the delivery ZIP. Exported `Nexus.slnx` and API launch settings are unchanged. The export identifies `src/ProductManagerAPI/Controllers/UploadController.cs` as an outside-scope reference by filename only; its implementation was not supplied or inspected. Do not claim that all backend references have been audited.

## Compatibility exceptions

Jobs, AOIs and their internal domain identifiers remain unchanged. This is an app rename, not a domain redesign.

Keep historical `JM-*` tracker IDs for traceability. Documentation updates describe the new direction without marking planned functionality implemented or claiming historical validations were rerun.

Read `job-manager:theme-mode` only as a compatibility fallback when the new key has no valid value. Copy a valid legacy value to the new key best-effort; preserve the old value for rollback. New writes target only the DataCatalogue key.

A valid new value takes precedence. Invalid values allow normal system-theme fallback when there is no valid legacy preference. Failed localStorage property access, reads or writes must not block startup or an in-memory theme.

Migration only sees preferences on the same browser origin. A different development port/host has separate storage; no cross-origin migration is attempted.

Legacy `.gitignore` entries are retained solely to avoid exposing old local configuration or generated context files during the transition.

## Verification performed

Environment: Node.js 22.16.0, npm 10.9.2. No dependencies were upgraded or installed into the candidate.

| Check                                                    | Result                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Input archive/context SHA-256                            | Passed.                                                                                                                                          |
| Per-file SHA-256 and Git blob identity                   | 150 of 150 passed.                                                                                                                               |
| Existing frontend move coverage                          | 144 of 144 files preserved at their new paths.                                                                                                   |
| JavaScript syntax                                        | All 94 JavaScript files passed `node --check`.                                                                                                   |
| Existing source/config mechanical equivalence            | 105 JS/CSS/HTML/JSON files matched exactly after the specified name substitutions; themeStore is the intentional persistence-boundary exception. |
| Package and lockfile preservation                        | Full parsed contents unchanged except package root names.                                                                                        |
| Focused rename, storage and startup tests                | 19 passed, zero failed. Includes 15 new checks and four existing startup tests.                                                                  |
| Baseline full test attempt                               | 102 passed; three test files failed to load because `@arcgis/core` is unavailable.                                                               |
| Candidate full test attempt                              | 117 passed; the same three test files failed to load for the same missing package.                                                               |
| `npm run format:check`                                   | Unavailable: `prettier` not installed.                                                                                                           |
| `npm run lint`                                           | Unavailable: `eslint` not installed.                                                                                                             |
| `npm run build`                                          | Unavailable: `vite` not installed.                                                                                                               |
| Browser, configured AOI service and live DK layer access | Not run. No live integration is added by this candidate.                                                                                         |

The unresolved test files are:

```txt
src/features/map/layers/jobClustering.test.js
src/features/map/popups/aoiPopupActions.test.js
src/features/map/popups/jobPopupActions.test.js
```

The environment could not resolve the npm registry hostname. Do not report the complete suite, formatter, linter or build as passing. The partial test results are not a substitute for the local acceptance checks.

## Safe application

The ZIP contains complete files under their repository-relative destination paths, plus the two changed root files. It cannot encode deletion of the old directory.

In a clean separate worktree at the authoritative commit, move `src/JobManager` to `src/DataCatalogue` first, then overlay the verified ZIP on that worktree root. Do not leave both frontend directories active.

Keep ignored local configuration out of the package. A fresh worktree needs its approved local environment values configured separately. Do not upload service-account credentials to perform the move.

No commit is made. A detached test worktree is for validation, not an instruction to reset the shared branch. Reconcile the accepted change with the intended branch before committing later.

## Remaining local acceptance

From `src/DataCatalogue`, restore the unchanged locked dependencies with `npm ci`. Run the existing formatter as needed, inspect any formatting-only changes, and run `npm run check`. Use `npm run dev` for the browser check or the existing `npm run rdy` flow.

Verify:

- DataCatalogue title, navbar, startup/retry/error text and no console/import errors.
- Jobs panel initially closed, opening from navbar/AOI/Job popup, dedicated details, sticky Back/Close and status buttons.
- AOI-scoped Jobs, selected Job map focus/clear, hover, filters, all point-clustering modes, cluster picker, refresh and notices.
- Dark/light mode, reload persistence, legacy preference migration on the same origin and usable behavior when storage is unavailable.
- Existing environment configuration, public navbar/logo assets and low-height laptop panel scrolling.

Do not change dependencies, API projects or unrelated UI to make this rename pass. Record independent findings separately.

The repository docs include replacement ChatGPT project instructions. The ChatGPT setting itself is not changed by creating or copying that file. Apply the full instruction text after accepting the renamed project context.

Mark DC-REN-001 Done after full local validation and browser acceptance. Mark DC-DOC-001 Done after docs/instructions are accepted and the project instructions are applied. The new page, live test map and all API work remain separate future tasks.
