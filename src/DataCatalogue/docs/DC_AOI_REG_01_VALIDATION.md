# DC-AOI-REG-01 — Package AOI regression validation

## Controlled source

- Committed frontend baseline: `01ad3b4646f66143f01db09b59cd47dda57795f0`.
- Controlled uncommitted candidate: DC-BE-FE-03 v3, SHA-256 `63CE548D5D98A366D22558CAA653E2056E806A0E65AC059FF29B192EE3069D23`.
- DC-AOI-REG-01 v4a is accepted by user browser testing: overview AOIs are correctly restricted to Workspace membership.
- This combined v4 renderer correction overlays that accepted v4a candidate using the verified working-tree Package renderer. It does not revert the accepted overview filtering.

## Implemented and focused verification

- Pipeline-assigned AOIs must be visible only when a contextual Job exists for
  that Package in the current Work Scope. `All Workspaces` means all known
  Workspace memberships, **not** all Pipeline-assigned Packages.
- Multiple Workspace entries for the same Package still produce one overview
  AOI. `Done` and `No update` Jobs still establish Workspace membership.
- Before the first successful membership read, no Pipeline-only AOIs can appear.
- Changing the Pipeline/Workspace selection or refreshing the list applies the
  same restriction to the AOI overview. The existing AOI loader and map layer
  lifecycle remain unchanged.

## Required local browser checks

1. Open Main Map with `All pipelines` and `All Workspaces`; wait for the
   Workspace-membership Jobs request to finish. Verify out-of-Workspace
   rectangles disappear while Packages belonging to one or more Workspaces
   remain visible.
2. Select one or several Pipelines and Workspaces, change rapidly while the
   geometry API is loading, and verify no removed Package AOIs reappear.
3. Mark a contextual Job `Done` or `No update`: the Package must remain visible
   if it still belongs to a Workspace. Only filtering the membership scope
   should hide it.
4. Simulate a failed Workspace-membership read; the map must not show unscoped
   Pipeline geometry. Retry loading and confirm the correct Package set returns.
5. Open Package Details for a Package with a very small WGS84 `aoi` polygon
   (WKID 4326) and a single detailed Point Feature. Confirm the AOI outline
   and the detailed point both render, map focus works, and no `Package
geometry is empty or unsupported after projection` notice appears.
6. Test a Package containing **only** detailed Point geometry (no AOI), then
   one with several detailed points. The map should focus on the point or
   their combined extent without a missing-extent error.
7. Test selected Packages with normal polygon/curve/surface Features. Existing
   symbols, AOI bounds, and zoom behavior must remain unchanged.
8. Switch selected Packages rapidly while a geometry request is pending, then
   close the panel or change Work Scope. No stale selected-Package graphics
   or notices may overwrite the newer selection.
9. Repeat the tiny-AOI selection in light/dark mode and after changing the
   basemap. If the basemap changes the MapView spatial reference, confirm the
   selected geometry still projects correctly without any frontend geometry
   fabrication.

The point-extent behavior is documented by the public ArcGIS Maps SDK for
JavaScript Point API: https://developers.arcgis.com/javascript/latest/references/core/geometry/Point/.

Run `npm run format` and `npm run check` from `src/DataCatalogue` after applying
the candidate. Do not commit until both overview filtering and the selected
Package detail rendering have passed local browser acceptance.
