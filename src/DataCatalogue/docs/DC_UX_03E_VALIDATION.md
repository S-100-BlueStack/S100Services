# DC-UX-03E — Package assignment shortcut and Refresh timestamp

## Source and scope

- Baseline: `4419b3af9bf169eb56241f3ed6ab5ac5c9621674`.
- A new-tab shortcut appears beside the short ID on each live Package card.
- Package Assignment's last successful list refresh displays `HH:MM` only.
- Existing Package Details, contextual Job identity, mock Jobs, status actions,
  API reads, map layers, selection lifecycle, and Basemap Gallery are preserved.
- No additional dependencies, backend/API contracts, or credentials.

## Local developer verification

From `src/DataCatalogue`, run `npm run format` and then `npm run check`.
Both commands require the project's locally installed dependencies.

## Browser acceptance checklist

1. In live mode, open Packages. Confirm a small launch icon beside each short ID.
   Clicking the icon must open a **new tab** with the correct Package selected in
   Package Assignment. The original Packages panel and status controls must remain
   unchanged. Verify that the Details action still opens details in the current tab.
2. Open two contextual Job cards belonging to the same Package but to different
   Pipelines/Workspaces. Both links must resolve to the same canonical Package,
   without exposing a composite Job ID or using the short ID as the route key.
   Test IDs containing `/`, `?`, `%` and spaces where supported by the API.
3. Verify keyboard Tab focus, Enter activation, accessible names, tooltips,
   right-click `Open link in new tab`, and light/dark focus outlines. Mock Jobs
   must not gain an assignment shortcut.
4. On Package Assignment, confirm the refresh indicator looks like
   `Last refreshed: 09:45`, with no date, independent of browser locale. The
   displayed hour must follow the browser's local time; the timestamp changes
   only after a successful list response and stays unchanged on failed Refresh.
5. Verify page switching, Package selection, and Refresh in flight preserve
   their existing behavior; older superseded requests must not change the stamp.
6. If the frontend is hosted in an IIS subapplication, repeat the link test and
   Back/Forward navigation. A direct pasted Package URL must load the SPA shell:
   the hosting server must rewrite unknown assignment routes to the frontend
   `index.html`. Merely generating the correct URL does not establish this.
7. Confirm API requests, map geometry, basemap selection, and status mutations
   are unchanged and no duplicate logical reads are triggered by opening the link.

## Automated verification boundary

- The route helper is SDK-independent and can be run directly in Node.
- The Jobs and Assignment Page DOM tests need their imported feature services;
  context exports may omit some service dependencies. If run with stand-ins,
  report them as isolated tests, not a full suite or browser acceptance.
- Run `npm run check` against the complete local repository with dependencies.
