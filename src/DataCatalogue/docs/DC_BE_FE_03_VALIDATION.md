# DC-BE-FE-03 v3 — Main Map scope control correction

This is a complete-file overlay on the **uncommitted DC-BE-FE-03 v2 candidate**
(SHA-256 `057587BD6EAD42627014EAC19198A7F443EE9D2749AC5497E68AB74D8E9BFB32`),
not on the original frontend commit alone. Confirm each `PREIMAGE SHA-256`
before replacement; preserve any additional local changes.

## Live-mode v3 acceptance checks

1. Open `Packages`, open `Pipelines`, then click `Workspaces`: the Pipeline
   menu closes and only the Workspace menu remains open. Reverse the order.
   Repeat with the keyboard using Tab/Enter/Space. Selection must not change
   merely because a menu opens or closes.
2. Open each menu and click outside, including the map, header Refresh/Close
   actions, Package list content and the external `Show empty` switch. Menus
   close, but the actual clicked control retains its normal action and focus.
   Tab to an element outside the dropdown: the menu should dismiss. Escape
   inside an open dropdown closes it and returns focus to its summary.
3. Scroll a long Workspace dropdown to the bottom; selecting an option keeps
   its internal scroll and focus. Click outside and reopen; the panel must not
   scroll unexpectedly. Rapidly open alternate dropdowns and confirm they
   never remain open together. Check light/dark themes and narrow laptop widths.
4. The `Packages` title is vertically centered against the unchanged Refresh
   and Close actions. The sticky header, status buttons, keyboard focus and
   `Show empty` switch remain functional in light and dark themes.
5. A Package shown in multiple Pipelines has a concise `N pipelines` group
   label. A Package with multiple Workspaces in one Pipeline has `N workspaces`.
   The old `N contexts / N open` text is absent. Expand each group and verify
   every contextual Job retains its own status and assignment link.
6. Verify `All pipelines` remains the initial choice, Workspace counts and
   ordering remain correct, AOIs follow the same Work Scope, and Package
   Assignment and mock Main Map are unchanged.

From `src/DataCatalogue`, run `npm run format` and `npm run check` with the
project's installed dependencies. These checks and live ArcGIS/browser
acceptance cannot be replaced by isolated test harnesses.

---

# DC-BE-FE-03 v2 — Main Map scope UI polish validation

This v2 is a controlled overlay **on the uncommitted DC-BE-FE-03 candidate**
(ZIP SHA-256 `246B36CE8E13FEFBD0A5E3A23333449102E0EC4D2CE33A2E5DAF5128DAAE7B69`).
Do not apply it directly on commit `01ad3b4646f66143f01db09b59cd47dda57795f0`
or overwrite unrelated local changes. The earlier v1 checklist below retains the
original behavior for historical reference; its first-Pipeline default and
visible read-only Pipelines panel expectations are superseded here.

## Live-mode v2 acceptance checks

1. Open the Main Map URL directly. `Packages` is open, and the Pipelines action
   and read-only Pipelines panel are not visible. Package Assignment deep links
   remain usable without preloading the hidden Main Map. The catalogue must
   still load for the Packages list and Workspace geometry.
2. Once the verified Pipeline catalogue loads, `All pipelines` is checked.
   Choose a specific Pipeline, then several Pipelines, and verify the existing
   list/Workspace/AOI scopes track each selection. Reload the catalogue and
   verify explicit choices persist and new Pipelines are included when `All`
   remains selected.
3. The Pipeline selector uses the full panel width and the Workspace selector
   sits **below** it. Long Workspace names are readable; truncation is limited
   to the collapsed display, not the option label. The compact `Show empty`
   switch sits beside the Workspace selector and has the full accessible name
   `Show empty Workspaces`. Toggle it while options are open: the menu closes
   without a disruptive size change, and the switch retains focus.
4. With more than 6 Workspace options, scroll the Workspace dropdown to its
   bottom and keep scrolling using mousewheel and trackpad. The Packages
   panel behind it must not scroll. Repeat for Pipelines. Toggle a checkbox
   near the end of a long list; focus and internal scroll position should
   remain stable. Tab, Space/Enter, Escape and outside clicks still work.
5. The Packages header is modestly larger but compact, and the list summary
   says exactly `<n> Packages` with no `visible` or contextual Job subtitle.
   Grouped contextual Jobs still remain independent inside a Package.
6. Verify light and dark themes, narrow laptop panel widths, quick Pipeline
   changes, map reload and Refresh. Mock Main Map, Package Assignment, status
   mutations, canonical Package assignment links and the existing AOI layer
   must be unchanged.

## Remaining required local gate

From `src/DataCatalogue`, run `npm run format` and `npm run check`. The source
export does not contain the full installed dependency tree; a focused Node
suite or an isolated DOM smoke test does not replace a real ArcGIS/Calcite
browser run. No new API, backend permission or dependency was introduced.

---

## Superseded v1 acceptance reference (presentation defaults only)

### DC-BE-FE-03 v1 — Unified Main Map Work Scope validation

## Controlled input

- Frontend committed baseline: `01ad3b4646f66143f01db09b59cd47dda57795f0`.
- Previous **uncommitted** candidate: `DC-BE-FE-02-PipelineScopedPackages-01ad3b46-20261112.zip` (SHA-256 `20712E71BF16A8534070223F96AC9290D6BB9AE72BBDFC48C2174CF9E688C22B`).
- Backend contract source: `313ea65a4fc07276da587a3f0acb038b72190e66`.
- This package is a **complete replacement-file overlay on DC-BE-FE-02**, not a standalone checkout and not a backend update.

## Acceptance checks (live mode)

1. Open Main Map > Packages. Verify `Pipelines` and `Workspaces` each show a compact checkbox dropdown. The first available concrete Pipeline, **not** `All pipelines`, is selected. The initial Workspace scope is `All Workspaces`. Both remain keyboard-operable with Tab, Enter/Space and Escape, and do not lose focus during a Job refresh.
2. Select a second Pipeline. Verify the list includes contextual Jobs from both Pipelines, Workspace overlay visibility follows the same union, and Package AOI requests include `hasPipeline=true`, the specific `pipelineId` and a page size of at most 200 for each Pipeline. Unassigned Packages are never rendered. The same Package in two bound Pipelines has exactly one AOI graphic.
3. Select `All pipelines`: every verified Pipeline is active. Then select a single Pipeline: the all-option is cleared. Unchecking the last concrete Pipeline must leave at least one selected. A Pipeline catalogue reload preserves valid selections; removed Pipeline/Workspace identities must disappear.
4. Select two Workspaces belonging to different Pipelines. Verify only the corresponding contextual Jobs are listed, only matching Workspace polygons are visible, and the AOI background is narrowed to Packages in the selected Workspace membership Jobs **without starting a geometry refetch**. The Pipeline bound overview must return when `All Workspaces` is selected, including bound Packages with no Workspace membership.
5. Workspace options show counts of **open Jobs** (not distinct Packages across Workspaces), sorted largest first. Workspaces with zero open Jobs are hidden from options and map when a successful Job read exists. `Show empty Workspaces` restores them on the map and in options. `Done` and `No update` reduce counts immediately; if all Jobs for a Workspace become terminal, it is hidden unless explicitly selected or `Show empty Workspaces` is on. Until Jobs load successfully, unknown counts must not hide every Workspace.
6. A Package present in several visible contexts is shown under a single disclosure group with contextual children. Verify the Package ID is shown once in the group heading, the children preserve separate Pipeline/Workspace labels, `Done`/`No update` status actions and the same canonical Package Assignment deep link. Collapsing a group must not mutate statuses and the disclosure must remain keyboard operable.
7. Open the old Pipelines panel. It is a **read-only overview** and must not offer an independent checkbox path for hiding Pipelines or Workspaces. Navigate away and back: the current Work Scope should remain within the page lifetime.
8. Change Pipeline selections quickly while geometry requests are pending. Old MapView/generation responses must not draw stale AOIs or overlay graphics. Refresh the Package list manually and verify no duplicate AOI requests for the same accepted scope. A failed same-scope AOI refresh keeps the last valid graphic set and exposes an error notice.
9. Verify the approved Package Assignment `Assigned`/`Not assigned` list, Pipeline names and Package Details null-language behavior remain unchanged. Mock Main Map workflow and native map highlight/selected Package behavior must not regress.
10. Test light/dark themes, laptop widths, focus-visible, and reopening disclosure dropdowns after refresh. Observe network requests for the existing known Workspace-membership N+1 behavior: the new Work Scope adds no per-Workspace count requests, but does **not** solve that separate backend optimization.
11. Test 0, 1, 200, 201 and more than 5,000 **unique** AOIs, repeated Package IDs across selected Pipelines, 401/403/500, stale/aborted/partial pages and missing Workspace membership. A multi-Pipeline request exceeding the limit must fail visibly rather than silently truncate.

## Local gate

From `src/DataCatalogue`:

```powershell
npm run format
npm run check
```

Run `npm run rdy` only if a dev server is also desired. The tool/export environment lacks project `node_modules`; isolated tests are not proof of the local full gate, actual ArcGIS rendering, backend deployment or permissions.

## Architecture and deferred work

The scope is a **view filter**, not a user lock or backend assignment. Backend Workspace ownership, Job persistence, filter-panel unification, Workspace popup/labels, Creator/Editor, external integrations and read-only auto-match-only Bindings UX remain separately tracked. Review the active `docs/CALCITE_USAGE_LOG.md` during local integration: the current source export did not include that file. The native `<details>`, `<summary>` and checkbox controls avoid private Calcite DOM access and use public theme tokens; no new dependency was introduced.
