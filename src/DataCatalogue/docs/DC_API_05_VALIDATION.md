# DC-API-05 — Jobs presentation verification

## Scope and baseline

Baseline: `2972cd6356c502a963342122bcbd48a321670eb9`.
Candidate changes are frontend-only. Do not replace existing API, assignment,
ArcGIS map or preference implementations. Package/Job AOI geometry and durable
Workspace overrides remain separate backend gaps.

## Install and quality gate

1. Check the repository status and ensure there are no conflicting local edits.
2. Copy the complete candidate `src/DataCatalogue` replacement/new files into
   the same repository paths. Do not copy `DELIVERY` into the application.
3. From `src/DataCatalogue`, run `npm run format` and `npm run check`.
4. Verify `package.json` and `package-lock.json` were not changed by this candidate.
5. Start the existing API and the frontend with the approved local live-mode settings.

## Live browser verification

1. Open the main map. The Calcite Action Bar, Pipelines overlay, basemap selector
   and Preferences must behave exactly as before. The map must not resize when
   the Jobs panel opens.
2. Open Jobs directly from the Action Bar. Each live card must show the Package
   `shortId` prominently, with a small `Pipeline / Workspace` context under it.
   Two Jobs for the same Package in different Workspaces or Pipelines must remain
   distinguishable; no raw composite ID should appear in visible copy.
3. Confirm each live card has one details icon, the exact Severity badge and the
   existing `To do`, `In Progress` and `Done` status actions. Live cards should not
   show Expand/Collapse controls, Expand all/Collapse all or a Created date chip.
4. Open a Job using the details icon and keyboard activation (Tab and Enter).
   Focus should move to the details view. Its heading should show `shortId`,
   optionally followed by the Package title if present. The header shows status
   and exact Severity once; metadata contains Pipeline and Created (if provided).
   There should be no repeated Package/Severity facts, raw composite Job ID,
   Workspace map buttons, Related AOIs or repeated mock-status explanation.
5. Change status in details. The active status, Jobs list and Workspace coverage
   color should update as before; refresh and mock-status reset behavior should
   remain unchanged. `Done` should remain visible in the current panel session
   and follow the existing hidden-Done rule on refresh.
6. Use `Back to Jobs`, close and reopen Jobs, navigate to Package assignment,
   and return with browser Back/Forward. Verify selected content and map behavior
   do not regress. Test light and dark themes, including visible keyboard focus.
7. With a missing/invalid Package title, verify the details heading still shows
   the `shortId` (or an opaque Package ID only if no `shortId` exists), without
   `undefined`, raw JSON, HTML injection, or fabricated names.

## Mock regression

1. Switch explicitly to mock mode and restart the frontend.
2. Mock Jobs must retain expandable cards, Expand all/Collapse all, AOI counts,
   Created/Deadline chips, Job geometry, related AOIs and mock map actions.
3. Status mutations and popup-to-Jobs/Back flows must behave as before.

## Acceptance boundary

This is a presentation-only correction. The backend still does not provide
verified read endpoints for Package/Job footprints or durable manual Workspace
membership. No browser geometry or assignment acceptance is implied by the
Jobs UI checks above.

## v2 focused correction — Refresh icon and candidate installation

- List and Job Details show a `refresh` icon without visible **Refresh** text, in
  both live and mock modes; hovering reveals **Refresh Jobs** and keyboard
  focus exposes an accessible label. The icon is disabled while loading.
- The missing-Job details state uses the same icon; clicking Refresh must still
  trigger the original single Jobs refresh operation and display failures.
- Verify that live cards show `shortId` plus compact Pipeline / Workspace
  context, and do not show **Expand all**, **Collapse all** or Created chips. If
  those older controls remain, the DC-API-05 candidate source is not actually
  running; check the installed `jobList.js` and restart Vite/refresh the page
  before attributing the behavior to the icon change.
