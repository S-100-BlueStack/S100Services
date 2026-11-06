# DC-API local verification

This is a candidate against `08d9281fe35b06012bda430c94767ef69a439d3e`.
The delivery ZIP contains complete new/replacement frontend files, not backend changes.
No commits were created. Keep your existing work; verify replacement-file hashes before
copying the candidate into a checkout. `DELIVERY/verify_candidate.py` and the delivery report
provide the checks and complete file list.

## Dependencies and automated checks

From the repository root, using the repository's normal Node environment:

```powershell
Set-Location src/DataCatalogue
npm ci
npm run check
```

If format checking fails, run `npm run format`, review the formatting diff, then rerun
`npm run check`. No package or lockfile change is required by this candidate. `npm run check`
runs format, lint, all tests and build in order. A failed earlier step means later steps did
not run. Do not treat focused Node tests as an ArcGIS/browser build test.

Focused dependency-free checks:

```powershell
node --test src/shared/api/catalogueClient.test.js src/shared/api/catalogueService.test.js src/features/assignments/services/liveAssignmentServices.test.js src/features/jobs/services/liveJobServiceAdapter.test.js
```

## Configure and start

1. Copy `.env.example` to `.env.local` if a local environment file does not already exist.
   Preserve existing approved demo settings. Set `VITE_CATALOGUE_SOURCE=live`.
2. Set `VITE_CATALOGUE_API_BASE_URL` to the approved API origin/hosting prefix, without
   `/api/v1`, query, fragment or credentials. Empty means same origin and requires working
   reverse-proxy/hosting routing. The bundled Vite configuration has no API proxy.
3. Default credentials are `same-origin`. Set `VITE_CATALOGUE_API_CREDENTIALS=include` only
   with approved cross-origin Windows authentication and credentialed CORS. No browser
   password, token, API key or service account belongs in environment variables.
4. Run `npm run dev` and use the HTTPS URL printed by Vite. The existing mkcert setup must
   work on the local machine. Restart Vite after changing environment values.
5. In the Network panel, verify requests use the intended origin and `/api/v1` once.
   Confirm real 200 JSON responses rather than an HTML login/proxy page. Verify 401/403
   display failures and do not populate demo data. Do not export credentials in diagnostics.

## Package assignment acceptance

1. Open **Package assignment**. Confirm the original compact four-panel layout, no automatic
   selection, Package terminology and a live-source footer. No comment/failure/reset demo
   controls should be visible. The map must state that live geometry is unavailable.
2. Check an empty successful Package page versus a 401/403/500/network failure: empty is
   `No results`, failure contains an error. Category failure must not prevent Package reads.
3. Use Category and Assigned/Not assigned filters. Confirm query parameters and one-based
   `page` in Network; Next/Previous must navigate server pages. Name search is disabled.
   Unfiltered rows must not claim a binding state before it has been loaded.
4. Select a Package. Compare opaque Package ID, short ID, category, descriptions and AOI
   `featureClass/globalId` to the actual JSON. Description markup must remain text.
5. Select two Pipelines, unselect an existing one, then Save. Inspect one POST per added
   Pipeline with `{ packageId, pipelineId }` and DELETE using the returned binding ID.
   Verify fresh binding GETs before and after the mutations, exact outcomes and derived
   read-only Workspace names. Draft checkboxes must not imply a new geographic intersection.
6. Double-click Save: one logical save operation. While saving, attempt selection/navigation;
   it must not attach a response to another Package. After saving makes the Package leave an
   active list filter, its details must remain open and explain that it is outside the filter.
7. Using an approved local fault-injection setup or browser request blocking, fail one of
   several independent writes. Successful writes must remain effective; the message must
   identify both success and failure. No unconditional `Saved`. If reconciliation succeeds,
   derived Workspaces must reflect the fresh record and unsatisfied choices remain dirty.
8. Block the post-write binding GET. Confirm the draft stays available and the warning says
   authoritative reload failed. Unblock and retry: a fresh preflight GET must prevent duplicate
   successful additions. A 409 must be reported and reconciled, not replaced with demo success.
9. Change selection or navigate with a dirty draft. Exercise Save, Discard, Cancel and Escape.
   Cancel preserves the draft; partial failure prevents Save-and-continue. Test reload/unload
   protection. Verify keyboard focus and that toggling a checkbox requires only one click.

## Workspace-backed Jobs acceptance

1. Open **Jobs** from the navbar. It starts closed. Verify the live-source/mock-status banner
   and Workspace selector grouped by Pipeline. API list access must work even when the
   basemap cannot load or the old demo AOI URL is absent.
2. Select a Workspace. Confirm all membership pages are retrieved, then Package details.
   Counters and filters apply only to this Workspace. A failed detail read must surface an
   error, not show an incomplete list as a successful complete result.
3. Open Job details. Compare Package, Pipeline and Workspace IDs/names to responses.
   Status must say mock-only and must not derive from `owner` or `lockedAtUtc`.
4. In suitable local API test data, use the same Package in two Workspaces and two Pipelines.
   Set its status to Done in one scope. Switch to each other scope: status remains independent.
   Return to the original: Done remains (enable the Done filter because it is normally hidden).
5. Reset mock statuses: each scope returns to To do. Refreshing the browser resets them too.
   No status API request and no generated follow-up Job should occur. Backend assignments
   and demo localStorage must remain untouched.
6. Use network throttling to switch Workspace A → B while A loads; B must remain selected
   and A must not overwrite B or produce stale error notices. Repeat Refresh and switch scope
   during a status update. Filters should preserve their supported scoped meaning.
7. Use fixture/test Packages with Severity `0`, `1`, `9007199254740992`,
   `9007199254740993`, null and `18446744073709551615`. Inspect raw response text, not only
   the browser's parsed object view. Check exact labels and increasing numeric order, then
   Unspecified, then Not prioritized. No numeric bands or sentinel-as-Low label.
8. Live map overlays and Focus map are unavailable; no demo/synthetic Package shape should
   appear. Deadlines, priority bands, AOI filtering and clustering must not imply live support.

## UI and demo regression

Check 1366×768 and a lower-height laptop viewport, light/dark, keyboard-only interaction,
Escape, modal focus restoration, panel Back/Close, scrolling and reduced motion. Live controls
must remain compact and use public component contracts. Browser screenshots/visual checks
were not performed in the candidate environment.

Restart with `VITE_CATALOGUE_SOURCE=mock`. Verify the original Jobs/AOI startup gate, configured
AOI source, popups, highlights, clustering, list/details, filters and simulated follow-ups.
Open Feature assignment and verify NM260004/NM260005 comment history, dirty-navigation,
Fail next load/save, local persistence and Reset mock data. Live mock status reset must not
change those demo assignments, comments or theme preferences.

## Acceptance evidence to retain locally

Record dependency/build results, API origin/hosting arrangement (without credentials), HTTP
statuses and sanitized representative response shapes, binding before/after state, status
isolation across real scopes, raw Severity tokens, UI observations and any errors. Do not
mark geometry integration complete until GEO-01/GEO-02 in the gap register are resolved.
