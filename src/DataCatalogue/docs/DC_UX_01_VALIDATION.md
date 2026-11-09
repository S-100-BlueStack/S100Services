## v5 — Selection-owned summaries, full-height map and Zoom spacing (2026-11-06)

Controlled input: `DC-UX-01-Candidate-v4-2d596754-20261106.zip` with SHA-256
`2A36FC68CA108822D6EE059D6D06E7A537E8715FE179522D2FE5105CBDEEC41F`.
Authoritative baseline: `2d596754d43d00352fe0adfac9b0f8420fb817c8`.
This section supersedes v4 tests 1–2 and the previous empty-center map layout.

- Package list loads **only the standard paged Package request**, not an extra
  Pipeline catalogue read or one bindings GET for each listed Package. Selecting
  a Package loads its details and saved bindings as before. After successful
  selection, that row shows Assigned/Not assigned and saved Pipeline names.
  Previously selected rows retain their last verified summary when switching
  Package, changing list page/filter, or returning to a prior page. A never-
  inspected unfiltered Package row does not claim a saved binding status.
- Changing a draft Pipeline checkbox must not change the cached saved row.
  A confirmed Save or read-only reconciliation updates it. An uncertain write
  must not keep showing an unverified saved summary; verify and retry first.
  Reselecting a Package triggers an authoritative refresh. Cache is in memory,
  per assignment-page lifetime, not persistent or synchronized across users.
- Package assignment map fills the **entire center column**, replacing the
  previously reserved blank upper-middle region. Details stay full-height on
  the right. At narrow viewport widths the previous stacked two-column
  fallback remains; verify map remains usable at 100% and 125% zoom and on a
  short laptop display.
- On both main and assignment MapViews, the native Zoom-out button has a visible
  10px gap before the basemap gallery. Confirm the tools align at the same right
  edge, retain uniform surfaces/shadows, and do not duplicate after assignment
  Retry. Verify light/dark, keyboard operation and the basemap popup.

### v5 local browser and Network acceptance

1. Open Package assignment without selecting anything. Check the Network tab:
   no `dispatcher/bindings` GET should be issued merely from listing/paging
   25 Packages. Verify normal list pagination/search and no new waiting state.
2. Select Package A with known saved Pipelines. Confirm exactly the selected
   Package's binding read occurs. Select Package B, then navigate Back/Forward
   through Package list pages: A's confirmed Pipeline names/status remain in
   its row, and B's details remain when B is visible. Unvisited rows are not
   assigned fabricated status or names.
3. Change an unsaved binding, cancel it, then successfully Save and reopen.
   Confirm the row reflects only confirmed backend data, not draft state.
   Simulate an uncertain write and check that the last verified summary is
   invalidated until read-only verification.
4. Review the full-height center map at laptop resolution, both themes and
   100%/125% browser zoom. Validate geometry, controls, Retry and basemap.
   On narrower screens details should still appear above the map.
5. Run `npm run format` and `npm run check` from `src/DataCatalogue`, then
   repeat accepted v4 detail/navbar/status regressions. Record real browser
   behavior; offline tests cannot establish ArcGIS WebGL alignment or API speed.

All subsequent v4 instructions are historical when they conflict with v5.

---

## v4 — Package list summaries, map action alignment and tab titles (2026-11-06)

Status: controlled frontend candidate, not committed; browser layout and full local
`npm run check` are acceptance gates. Based on the verified v3 candidate (SHA-256
`8F7651349123E7EC4DFB90337A5352CDF7D989AC4687DD1D36EEA5419A009DA9`)
on baseline `2d596754d43d00352fe0adfac9b0f8420fb817c8`.

- Show saved assignment status and Pipeline names for **all Packages on the loaded page**,
  before selection. The existing v1 Package list has no inline binding details, so
  `liveAssignmentServices.features.bindingSummaries` uses existing `GET
/api/v1/dispatcher/bindings?packageId=...` for each visible Package and
  `GET /api/v1/pipelines` to resolve Pipeline names. Concurrent detail reads are
  capped at four and canceled on page/filter change or teardown. Summary failures
  leave the Package list usable and report an actual error rather than claiming
  `Not assigned`. These are **per-page reads**, not a global binding index.
- Pipeline names are displayed beside Package short IDs; long lists truncate
  visually with the full saved names available in the title tooltip. No Workspace
  names are introduced into this list. Selection and unsaved edits do not replace
  other Packages' saved summaries.
- Package Refresh is positioned directly after `Next`. The Save icon is larger,
  turns blue when Save is actually permitted, and keeps `Unsaved changes` beside it.
  The Pipeline comment icon is slightly larger; the editor placeholder is `Comment`.
  No instructional automatic-match text appears for an unsaved Pipeline binding;
  the existing `n auto-matched workspaces` summary remains when there is a saved
  binding. Unsupported Workspace/comment mutations still block Save truthfully.
- Both MapViews use the public `MapView.ui.add` top-right stack for basemap (index 1)
  and assignment Retry (index 2), after native Zoom (index 0). This replaces
  error-prone absolute top/right offsets. Controls have consistent 32px surfaces
  and a shared zoom-style shadow without shadow-DOM styling.
- The static document title is `Data Catalogue`. Navigation updates it to
  `Package assignment`, or `Package assignment: {shortId}` when a Package with a
  verified short ID is selected; leaving the assignment returns `Data Catalogue`.
  Deep-link selection and history transitions use accepted route/navigation state.
- The Package details panel is intentionally unchanged.

### v4 local browser acceptance

1. Open the first Package assignment page with **no Package selected**. Confirm
   saved `Assigned`/`Not assigned` badges and Pipeline display names for every row.
   Confirm names appear on the same line, truncating appropriately on narrow
   screens. Compare list values against real binding responses, including a Package
   assigned to multiple Pipelines and one with no binding.
2. Change page/filter while Network has an earlier bindings read delayed. Ensure
   only current-page summaries render. Confirm no more than four concurrent binding
   reads, all using authorized existing GET routes. Fail one binding read and
   verify a visible truthful error with a usable Refresh; no invented status.
   Record latency on 25-item pages and discuss a backend batch endpoint if slow.
3. Verify Refresh sits directly beside Next; a click performs one list refresh.
   Edit a Pipeline binding: `Unsaved changes` appears next to a larger blue Save
   icon. Revert the edit: Save becomes inactive. Pending Workspace override and
   comment drafts must continue to block live Save without false success.
4. Check that the Pipeline comment trigger is larger but remains icon-only and
   keyboard accessible. No demo/prototype explanations should appear in bindings.
5. Compare both map control stacks at 100% and 125% browser zoom: Zoom, Basemap
   and assignment Retry align at the right, have matched control dimensions and
   comparable shadows. Test expanded basemap, both themes, map Retry, map startup
   retry, keyboard focus and small laptop heights. No duplicate controls may remain
   after recreation. Confirm selected coverage geometry remains unaffected.
6. Verify browser tab titles at `/`, `/assignments`, and
   `/assignments/packages/{encodedId}`, including direct refresh and Back/Forward.
   Use the Package **short ID** rather than the opaque route ID. Failed Package
   reads must not claim a different Package short ID.
7. Verify Package details remains unchanged in content and field ordering.
8. Run `npm run format`, `npm run check` from `src/DataCatalogue` and record exact
   results. Real ArcGIS/WebGL/UI alignment, API authentication and bulk-read
   timings require the local browser/backend environment.

---

## v3 — Browser feedback correction (2026-11-06)

Status: v3 controlled candidate, not committed or browser-accepted. Controlled inputs are
v2 (`4657C50AFDD2D4677FFBF44CE6EE09D435E30D3A380CFCE1C772F2335B880A91`)
plus the user-applied test correction and `preserve-caught-error` correction. Baseline remains
`2d596754d43d00352fe0adfac9b0f8420fb817c8`.

- Main-map `Refresh Packages` retains an accessible native button but uses an unbordered,
  transparent, icon-only appearance. This avoids a Calcite shadow-DOM styling dependency.
- Live assignment shows Category, Status and page-local search on one compact toolbar row,
  without visible field-label/help copy. All three retain accessible names.
- Live layout uses three columns: Packages top-left, bindings bottom-left, **upper-middle
  unallocated**, map bottom-middle, and Package details full-height at right. The empty
  region has no fake comments feed. A two-column layout remains for narrower screens.
- Saved Pipeline checkboxes automatically reveal their Workspace choices in-place; no
  `Workspaces` disclosure button, explanatory preview paragraphs or reset button remain.
  The summary may show `n auto-matched workspaces`. A changed choice is reversed by
  returning its checkbox to its saved automatic value. The backend still owns effective
  membership: these local selections are drafts, not saved overlays or writes.
- Each selected Pipeline has an application-owned icon-only `speech-bubble` action with
  an anchored comment editor. Text exists only in the current session draft, is included
  in unsaved-change navigation protection, and **blocks live Save until a verified
  comment persistence contract exists**. Empty comments are removed from the draft.
  Never show this comment as persisted, and never call an invented API endpoint.
- Save and Package-list Refresh use labelled icon-only controls. Successful binding
  mutations no longer show `Add ...: succeeded` confirmation text. Errors, uncertain
  outcomes, and reconciliation warnings are still displayed.
- `Select to view bindings` is no longer synthesized as a Package status. The selected
  Package row can show authoritative Assigned/Not assigned state and saved Pipeline
  names; filtering by assignment status also identifies other filtered rows. A general
  Package list response **does not** supply all binding names, so nonselected rows
  are intentionally not hydrated one-by-one.
- ArcGIS zoom moves to top-right for both maps; basemap and assignment Retry are positioned
  below it using the public MapView UI and documented `arcgis-expand.visualScale`.
  Browser alignment and sizing at different resolutions still require verification.
- Navbar displays `Data Catalogue`, uses ProductCatalogue-style 16px route text, and
  uses the same full-height active underline with reduced-motion support. Preferences
  restyling remains a separate DC-UX-02 task.

### v3 targeted manual acceptance

1. On a 1440px+ desktop, verify the five-pane placement and a quiet empty upper-middle
   area. Reduce width below 1100px and height below 720px; check no hidden Save, list
   controls, scroll traps or clipped Package details. Inspect both themes.
2. Check Category, Status and search stay inline, have accessible labels, and search
   only the loaded page. Check the footer icon refreshes exactly once and navigation
   preserves Package selection and keyboard focus.
3. With a saved multi-Workspace Pipeline, confirm nested checkboxes appear automatically.
   Change and reverse an auto-match and an outside-AOI Workspace. Verify no API write,
   no saved-summary/map mutation and the Save guard with pending preview changes.
4. Open a `speech-bubble` editor by mouse and keyboard. Type, close, reopen and clear.
   Verify Escape and click-outside behavior, dirty-draft leave protection and no comment
   API mutation. Validate popup placement near a scrolled list edge.
5. Save a normal Pipeline-only binding change with no Workspace/comment preview edits;
   confirm success and refreshed saved names without a noisy success banner. Induce
   partial failure/timeout and verify error, retry and read-only reconciliation remain.
6. Show Package rows under All/Assigned/Not assigned filters. Check selected rows show
   only saved Pipeline names and real status, not fabricated Workspace names or generic
   status placeholders. Check no N+1 binding fetch for the unselected list.
7. Compare the zoom, basemap and Retry tool column on both maps with ProductCatalogue
   conventions. Verify uniform 32px actions, no overlap with popups, light/dark and
   basemap-gallery expansion without map resize.
8. Test navbar route underline, title text and keyboard focus at two window sizes.
   Verify no transition when `prefers-reduced-motion` is enabled.
9. Run `npm run format` and `npm run check` in the complete local source tree. Confirm
   ArcGIS modules missing from the exported baseline are present in the real checkout.

---

# DC-UX-01 — UI Cleanup and Package Assignment Redesign

Date: 2026-11-06  
Status: v3 correction candidate, **not committed or browser-accepted**

## Authority and scope

- Repository: `S-100-BlueStack/S100Services`
- Verified baseline: `2d596754d43d00352fe0adfac9b0f8420fb817c8` (local `main`, 2026-11-06T09:43:51+01:00)
- Source: uploaded `DC-UX-01-Context-2d596754d43d-20261106-094830.zip`, commit-pinned Git archive
- Integrity: outer ZIP SHA-256 matched its adjacent checksum file, and **418 of 418** exported source files matched `metadata/source-files.sha256` before any changes
- Changed scope: `src/DataCatalogue/` only. No backend, API contract, authentication, dependency, lockfile, or ProductCatalogue changes. No commit.

## Implemented behavior

### Main map and Packages panel

1. Use **Packages** for user-facing main-map navigation, headings, notices, tooltips, filters and accessible names while preserving internal Job identity, event names, adapters and the `(packageId, pipelineId, workspaceId)` key.
2. Remove the live/mock status banner, Reset statuses control, and Pipeline/Workspace visibility counter. Keep a single icon-only **Refresh Packages** action in the mounted panel header, with a proper accessible name and focus retention across list/details rerenders.
3. Expose exactly **Done** and **No update** as status actions. Pressing the active button again returns the contextual entry to the internal open (`todo`) state; pressing the opposite button switches directly. The buttons are mutually exclusive, use the existing blue/neutral selected styling and `aria-pressed`, and disable while mutation is pending.
4. Treat both statuses as completed for list visibility, status filters, colors and map layer filters. A just-completed entry stays visible in the current panel until refresh/panel reset, and explicit status filters can expose completed entries from the currently loaded snapshot.
5. Keep status persistence **mock-only**, scoped to full Job context and not sent to the backend. Removing Reset does not make statuses durable. A reload or adapter reset can discard them.

### Package assignment

1. Place the compact Package selector above Pipeline bindings in the left column. Show Package details above the map in the right column; reserve more space for bindings and map.
2. Retain the existing server-side **Category** and **Status** filters and server paging. Add **Search this page** on currently loaded Package name, short ID and title. This does not search other pages, backend details or all Packages, and it does not introduce an unverified API search parameter. Selection survives a local search that excludes its row.
3. Render selected Package name in bold. Show **saved** Pipeline and Workspace names from reconciled binding records; never present draft checkbox changes as saved. Keep a truthful fallback to Pipeline ID if name metadata is unavailable.
4. Display exactly: **Title**, **Category**, **Severity**, **Details**, **Nautical charts**, **Publication**. Keep existing exact Severity and safe rich-description rendering. Do not show redundant technical IDs, AOI Reference, References, or generic Assigned heading.
5. Remove decorative binding counters, Show active, permanent Reload pipelines, Focus geography, prototype banner and routine "Showing selected..." map text. Preserve recovery controls when loading/saving fails, actual map errors, the basemap selector, saved geometry and the binding reconciliation workflow.

## v2 follow-up — Workspace preview editor and lint (2026-11-06)

- Live Pipeline rows expose an expandable **Workspaces** selector. The saved auto-matched
  Workspaces appear checked, and the user can check/uncheck other Workspaces under the
  same Pipeline. The complete list is fetched lazily from the existing paginated
  Workspace API, scoped by `pipelineId`; failed reads offer **Retry Workspaces**.
- These are **preview-only choices**. New Pipeline auto-matches are unknown until
  the Pipeline binding is saved. The backend has no authorized mutation contract
  for Package/Pipeline/Workspace overrides. Drafts identify each changed choice
  explicitly; `Reset Workspace edits` restores the saved automatic selections.
- Pending manual Workspace edits block Save rather than silently discarding the
  edits while saving Pipeline bindings. The authoritative saved-binding details,
  map overlays, Workspace membership queries and main-map Packages view do **not**
  change from this preview. Pending edits are included in the leave confirmation.
  Persistent manual overrides require `OVERRIDE-01` in the gap register.
- Lint corrections: `prefer-const` in `liveCatalogueReadiness.test.js` and unused
  `workspaceOverlayMessage` import in `mapController.js` are addressed.
  The `preserve-caught-error` error in `map/packages/createPackageGeometrySource.js`
  is **not yet addressed** because the source file was missing from the verified
  418-file baseline export as well as the v1 candidate. Request the exact local
  file before changing it; never reconstruct map geometry code.

### Additional local browser acceptance

1. Expand a Pipeline's Workspaces and confirm all saved automatically intersecting
   Workspaces are prechecked; other Workspaces remain available regardless of AOI.
2. Uncheck an auto-match, check a non-auto Workspace, then reset. Before reset,
   Save must be disabled with an explicit preview-only message. Check that no
   Workspace write is issued and saved details/map/Jobs are unaffected.
3. Unselect and reselect a Pipeline with preview changes; reset must remain
   accessible even if Pipeline selection is off. Discarding the draft must
   restore saved state.
4. Select another Package while a Workspace read is delayed; the old result
   must not populate the new Package editor. Verify per-row retry after a 403
   or timeout and the keyboard focus in expanded rows.
5. Run `npm run format` followed by `npm run check` locally with installed
   dependencies. Upload `src/features/map/packages/createPackageGeometrySource.js`
   if the remaining caught-error lint violation persists.

## Deferred backend-dependent capabilities

- **Historical Packages:** Done and No update entries must remain findable after leaving the current membership snapshot, restarting the browser or changing status filters. The current v1 APIs do not provide a verified durable status, history-search or globally paginated history contract.
- **Server-side search:** Package v1 list filters and pages by documented fields, but does not support a verified free-text name/title/details query. Page-local matching cannot be promoted to a global search.
- **Design parity:** ProductCatalogue navbar/Preferences visual parity is **DC-UX-02**, deliberately excluded from this candidate.

Ownership and precise questions are recorded in `BACKEND_CONTRACTS.md` and `DC_API_BACKEND_GAPS.md`. Do not invent endpoints, sorting contracts or persistence behavior.

## v2 verification actually performed in the authoring environment

| Check                                                                             | Observed result                                                                                                                                                     |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controlled v1 candidate ZIP SHA-256                                               | `3E3D0E732079F002217A615B418F35EEB0343137E6DCF624511AF361D062C503`, verified before correction                                                                      |
| Targeted Workspace draft, Pipeline row, session, API and Package assignment tests | Passing in this environment; includes automatic matches, preview inclusion/exclusion, reset, paging, retry and stale responses                                      |
| Full offline Node suite without the three ArcGIS-dependent test files             | **397 passed, 0 failed**                                                                                                                                            |
| Full `node --test`                                                                | **397 passed**, 3 import failures from unavailable `@arcgis/core`; no claim of a complete passing full suite                                                        |
| `node --check` on all JavaScript files in the consolidated v2 ZIP                 | **63 passed, 0 failed**                                                                                                                                             |
| `npm run check`                                                                   | Blocked at `prettier --check .` because Prettier is not available; ESLint, Vite build and browser testing unavailable here                                          |
| User-reported local `npm run lint` before v2                                      | 1 error and 2 warnings. The two warnings are corrected in included source; the error in `createPackageGeometrySource.js` is not verifiable from the pinned handoff. |

No backend mutations, live authentication or browser/ArcGIS rendering tests were performed here.

## v1 verification (retained for comparison)

| Check                                                                         | Outcome                                                                                                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Uploaded outer ZIP and all extracted source-file checksums                    | Passed: 418/418 verified before editing                                                                                                          |
| `node --test` (full available test suite)                                     | 387 tests: **384 passed, 3 import failures** because `@arcgis/core` is not installed in this environment; not functional test assertion failures |
| Node tests excluding the three ArcGIS-dependent test files                    | **384 passed, 0 failed**                                                                                                                         |
| Selected assignment and status UI regression tests after final behavior edits | **22 passed, 0 failed**; includes reversible and cross-status switching, focus, search and saved bindings                                        |
| `npm run check`                                                               | **Blocked** at `prettier --check .` (`prettier: not found`); lint, Vite build and full quality gate were not run                                 |
| `node --check` on all changed/new JavaScript files                            | **54 passed, 0 failed**                                                                                                                          |
| Browser / ArcGIS WebGL / live SSO / CORS                                      | **Not run** in this environment                                                                                                                  |

### Source completeness blocker inherited from the pinned baseline

`src/features/map/core/mapController.js` and `src/features/map/assignment/createLiveCatalogueMap.js` import `../packages/createPackageGeometrySource.js`, `createPackageGraphics.js` and `createPackageGeometryOverlay.js`, but **no `src/features/map/packages/` directory appears in the pinned 418-file export**. These imports were already present in the baseline. The candidate neither reconstructs nor replaces this missing source. The user must verify those tracked files exist in the local checked-out baseline before relying on a successful full build or map runtime. A passing offline subset is not proof that the app builds.

## Local verification and browser acceptance

1. Apply the candidate's complete replacement/new files to the **exact** baseline commit above, or reconcile explicitly if the local tree has moved. Confirm the three `src/features/map/packages/` modules exist at the intended commit; if absent, resolve that baseline issue separately rather than inventing geometry logic.
2. From `src/DataCatalogue`, use existing installed dependencies and run `npm run format`, then `npm run check`. Record the actual outcome and resolve any formatting/lint/build issues before committing. Do not edit `package-lock.json` manually.
3. Open the main map in mock and live modes. Confirm navigation, panel heading, AOI-popup actions, tooltips and accessibility labels say **Packages**; no reset button, mock-status banner or redundant Pipeline/Workspace counter remains. Header Refresh stays keyboard-focusable across list/detail changes and displays errors and retry behavior correctly.
4. For the same contextual entry: click Done, click No update directly, click No update again, click Done again, and click Done again. Exactly one or zero buttons should be blue/pressed at each step. A terminal change must not immediately hide the current card. Confirm separate Package/Pipeline/Workspace contexts keep separate status values, and an intentional refresh hides completed entries unless explicitly filtered back in.
5. Select explicit Done and No update filters and the Open-only filter. Check the list and map agree with the selected filter. Confirm no claim of historical results that the backend cannot return.
6. In Package assignment, filter Category and Status, then search by Package name, short ID and title. Check searches only operate on the current displayed page, retain server-side page counts, make no extra network requests, and do not steal input focus. Change pages and confirm the local query applies to the new page. A Package selected before filtering must retain its details and state.
7. Select a Package that has multiple saved Pipeline/Workspace bindings. Confirm Pipeline names and saved Workspace names in details, no duplicate ID/AOI fields, six fields in the required order, and no stale names from the previously selected Package. Change a draft Pipeline checkbox without saving: the saved summary must not change until an authoritative reconciliation.
8. Verify Save, partial failure, retry/reconciliation, uncertain outcome, rapid Package changes and leave-navigation confirmation. Error-specific retry controls must remain available; routine Reload pipelines must not be visible.
9. Inspect live Package AOI, detailed Features and saved Workspace geometry. Confirm removing Focus geography and routine status text does not remove real map errors, saved overlays, map resize, pan/zoom or basemap choice. Test invalid geometry and live 401/403/timeout separately.
10. Test low-height desktop layouts, light/dark mode, keyboard-only and Escape navigation, reduced-motion settings, cross-view Preferences and return to main map. Verify no unexpected redraws, duplicate network calls, lost focus or clipped fields.

## Suggested commit message

`feat(datacatalogue): simplify package workflows and assignment layout`

## Candidate inventory

The delivery archive contains only complete changed/new `src/DataCatalogue` files, relative to the repository root; it includes this report. The exact changed/new path list and ZIP SHA-256 are generated alongside the candidate ZIP. No repository files are deleted.
