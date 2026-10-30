# DC-STAB-02A — Jobs Catalogue Readiness Verification

## Scope and baseline

- Baseline: `4e4790733bc2c59e74254d3f06a12eef3967e513`.
- Audit findings: F01 (P1) and F08 (P3) only.
- No backend endpoints, authentication, persisted data or dependency versions are changed.
- Preserve all Workspace geometry, Package assignment, Jobs status, map visibility,
  Preferences and routing behavior from the accepted baseline.

## Local quality gate

From `src/DataCatalogue`:

```powershell
npm run format
npm run check
```

Do not report either as passing until it has completed locally. Inspect `git status`
and `git diff --check` before staging. There is no need to reinstall packages.

## Browser tests (live mode)

Use approved local request interception or a controlled test API. Do not alter
production responses and do not log credentials or tokens.

| Test    | Steps                                                                                               | Expected result                                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| F01-A   | Block the initial `GET /api/v1/pipelines`; open Jobs; retry while still blocked                     | Jobs displays a real load error with `Retry`. No `Jobs refreshed` success or `No Jobs found` success. No Workspace membership requests. |
| F01-B   | Restore Pipelines; activate Jobs `Retry`                                                            | Pipelines and Workspaces are fetched again, then real Workspace membership and Package details are loaded. No browser refresh required. |
| F01-C   | Repeat failure/recovery with `GET /api/v1/workspaces` failing instead of Pipelines                  | Same truthful error and recovery behavior.                                                                                              |
| F01-D   | Delay the initial catalogue read and open Jobs immediately                                          | Jobs displays loading until the catalogue completes, without duplicate Pipeline/Workspace reads or misleading zero counts.              |
| F01-E   | Return a valid empty Workspace catalogue                                                            | Jobs may display a successful empty list only after both catalogue reads succeed.                                                       |
| F01-F   | With Jobs already loaded, overlap a Jobs Refresh and a newer catalogue reload                       | The latest catalogue scope owns the final Jobs list; older requests cannot publish stale Jobs.                                          |
| F08-A   | Fail the first Workspace membership read, with no cached Jobs                                       | In-panel error has an accessible `Retry` action. Clicking it recovers without closing/reopening Jobs.                                   |
| F08-B   | Repeat F08-A in the selected Job details view if the selected Job disappears after a failed refresh | The error view includes `Retry`; navigation remains usable.                                                                             |
| PRES-01 | Toggle individual Pipelines and Workspaces                                                          | Only map visibility changes; no catalogue reload, Jobs filtering, or mock-status reset.                                                 |
| PRES-02 | Switch to mock mode; open Jobs and update status                                                    | Original mock map and status behavior remain available.                                                                                 |

## Deferred audit findings

F02 (history transitions), F03 (late highlights), F04 (mock layer writes),
F05 (LayerView notices), F06 (binding deadlines), F07 (focus preservation),
and F09 (historical documentation contradictions) are not part of this correction.
The backend-owned Package AOI and manual Workspace assignment gaps are unchanged.
