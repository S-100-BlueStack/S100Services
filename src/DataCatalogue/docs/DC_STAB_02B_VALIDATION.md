# DC-STAB-02B — Navigation and Workspace rendering verification

## Scope and controlled source

- Requested authoritative baseline: `67ae3ba1452075535dec2b59f65a9e53e50833a3`.
- The candidate was prepared from the checksum-verified `4e479073...` archive plus
  the accepted DC-STAB-02A ZIP. Compare with the local baseline commit before
  applying: the exact newer commit tree was not available to this environment.
- Audit findings addressed: F02 and F05 (P2). No API, auth, dependency, backend,
  mock Jobs/map, Package assignment persistence or Preferences changes.

## Local source and quality gate

From the repository root, verify the committed files and ensure no relevant
uncommitted changes will be overwritten. Inspect the candidate file list and
compare the changed files with the current baseline before copying replacements.
From `src/DataCatalogue` after applying the replacement files:

```powershell
npm run format
npm run check
```

Before committing, inspect `git status`, `git diff --check` and all changed files.
Do not claim a successful build or browser verification without running it.

## Browser tests

Use a local/test API account for Package assignments. Browser Back/Forward
and a controlled slow Save/Discard choice are required; a Node fixture cannot
fully prove modal focus or history behavior in a real browser.

| Test    | Steps                                                                                                                                                                          | Expected result                                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F02-01  | Open `/assignments/packages/{encodedPackageId}`, edit a draft, press Back, then Forward while the leave dialog is open; complete with Discard.                                 | URL, selected Package and visible assignment host remain coherent. Jobs must not appear under the assignment URL.                                                             |
| F02-02  | Repeat with Save and continue, cancel, and Escape.                                                                                                                             | Save is attempted at most once; cancel leaves the assignment open and restores its accepted URL.                                                                              |
| F02-03  | Press Back, Forward, Back during a pending leave decision; complete it.                                                                                                        | The last accepted intent wins; no duplicate decision or Jobs panel open operation.                                                                                            |
| F02-04  | With no unsaved changes, navigate between `/`, `/assignments`, and two encoded Package deep links using toolbar and Back/Forward.                                              | Selected Package, URL, visible workflow and keyboard focus remain coherent.                                                                                                   |
| F02-05  | Start a pending decision, navigate through the visible Jobs and assignment buttons and then complete the older decision.                                                       | Older decisions cannot replace the newer visible workflow or focus.                                                                                                           |
| F05-01  | With valid Workspace geometry successfully prepared, inject one `layerview-create-error` for the main `data-catalogue-jobs-workspace` layer in an approved local test harness. | Exactly one visible `Workspace geometry unavailable` notice includes `Workspace rendering failed`; Jobs remain usable. The accessible hidden map status also reports failure. |
| F05-02  | Repeat the same failure event, then cause overlay status to report `ready`.                                                                                                    | The render failure remains visible in status and does not produce duplicate notices.                                                                                          |
| F05-03  | Cause `layerview-create` for the same layer after the failure.                                                                                                                 | Error status clears only on actual successful LayerView creation. A new later failure can notify again.                                                                       |
| F05-04  | Cause an error on an unrelated basemap layer and retry/destroy the map.                                                                                                        | No Workspace notice for unrelated layers; old listeners do not publish after retry/disposal.                                                                                  |
| PRES-01 | Open Jobs, toggle Pipeline and Workspace visibility, change basemap and Preferences, and use Package deep links.                                                               | Accepted DC-API-04/05 and DC-STAB-02A behavior is unchanged.                                                                                                                  |
| PRES-02 | Switch to mock mode and open/close Jobs and select Package assignment.                                                                                                         | The existing mock map remains functional.                                                                                                                                     |

A real LayerView creation failure is not safe to force in production. Use an
approved local fixture or injected SDK event source. No production credentials,
network mutations or fake Package AOI geometry should be introduced for this test.

## Remaining DC-STAB-01 items

F03 and F04 (mock-map stale operations), F06 (binding operation timeout),
F07 (Jobs keyboard focus), and F09 (documentation drift) are not claimed fixed.
