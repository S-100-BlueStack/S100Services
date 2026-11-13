> **Superseded for current implementation:** DC-BE-FE-03 replaces this historical
> single-Pipeline scope with a shared multi-Pipeline/Workspace Work Scope and
> read-only Pipelines overview. Use [DC_BE_FE_03_VALIDATION.md](DC_BE_FE_03_VALIDATION.md)
> for current acceptance; retain this file as the DC-BE-FE-02 candidate record.

# DC-BE-FE-02 — Pipeline-scoped Main Map Package AOIs and meeting feedback

## Authority and scope

- Frontend baseline: `01ad3b4646f66143f01db09b59cd47dda57795f0`.
- Controlled input: `DC-BE-FE-01-PackageSummariesAndAOIOverview-01ad3b46-20261112.zip`, SHA-256 `C47BF077BF6F77F1DDB6C969AFC22ED75CB13CE50E79E3C48E9A3E1D87A00787`.
- Verified backend source: `313ea65a4fc07276da587a3f0acb038b72190e66`.
- Scope: Correct the **unaccepted** v1 Main Map Layers overview; retain the user-approved Package Assignment list summaries and the previous UX/MapView behavior.

## Expected live behavior

1. Main Map no longer has a standalone `Layers` popup or user-toggle for all Package AOIs. Open `Packages`; the Pipeline dropdown is required. The first available Pipeline is selected after the catalogue loads.
2. Selecting `ENC` loads only generalized AOIs for Packages with an **active ENC binding**. Check DevTools: every geometry-page request includes `hasPipeline=true`, `pipelineId=<ENC id>`, `includeDetails=false`, and pages at most 200 items. No request without Pipeline and no unassigned Packages.
3. A Package bound to two Pipelines may appear in each relevant Pipeline context. Changing Pipeline hides the old background until the new response is ready. An assigned Package with no Workspace intersection still belongs on the selected Pipeline's AOI overview, even if it has no contextual Job row.
4. `Workspace` defaults to `All Workspaces`; choosing one filters Main Map Package rows **within the selected Pipeline**. When `All Workspaces` is chosen, multiple contextual Jobs for the same Package may still be visible with different Workspace names/statuses. No status mutation or contextual identity is merged.
5. The existing Pipeline panel continues to govern Workspace geometry visibility independently. The Package Details and selected Package highlight are unchanged.
6. Selecting a related AOI through an existing popup retains the original AOI relation behavior; clearing its filter returns to the selected Pipeline/Workspace scope.
7. The Packages header Refresh updates the list and the selected Pipeline's AOI overview, without duplicate geometry requests for a single refresh. On failure, the last valid overview remains for the **same** Pipeline; a failed read for a new Pipeline must not expose the previous Pipeline's geometry.
8. Test 0, 1, 200, 201 and 5,001 assigned AOIs, a page-total change, duplicate Package IDs, 401/403, 500 and an aborted request. The 5,000 display cap is an explicit browser safety boundary; the backend offers no cross-page snapshot token.
9. Rapidly switch Pipelines, navigate away, change MapView or close the app during a delayed fetch. Stale geometry must not be published; the selected Package highlight/Workspace overlays must remain independent.
10. Open Package Assignment: list-level `Assigned`/`Not assigned` and saved Pipeline IDs must remain authoritative. In Package Details, null/blank description language must not show `Unspecified language`; nonempty language labels and the HTML sanitizer must remain intact.
11. Check both themes, browser zoom, keyboard Tab/Enter/Space, focus-visible and narrow laptop widths. Native selectors must retain focus through list refresh/status actions.

## Local verification commands

From `src/DataCatalogue`:

```powershell
npm run format
npm run check
```

Do not use `npm run rdy` unless a dev server is also required. Record full npm, browser and deployed API results separately from focused tests run in an isolated source sandbox.

## Deferred from the 2026-11-12 meeting

Workspace popup/labels, default empty-Workspace filtering, read-only auto-match-only Bindings UX, Creator/Editor page, NM/WorkZone integrations, and the persistent Job/Workspace-membership performance work are documented in `PROJECT_TRACKER.md`, not silently implemented here.
