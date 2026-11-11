# DC-UX-03B — Live Packages panel read-reuse verification

## Source and scope

- User-reported committed baseline: `f0f139451c0cb73965a0498aad0a12290d0541cf`.
- Available source: complete, hash-verified DataCatalogue JavaScript from
  `a986e7f20f96aa3e4a6d5acbaeebe836b5cb91d0`; the four subsequently
  committed DC-DEPLOY-01 documentation replacements were overlaid after their
  preimage and output checksums matched. The Git contents of `f0f1394` were
  not independently exported. Verify local preimages before applying this ZIP.
- Scope: main-map live Packages panel auto-refresh when opening; in-memory Jobs
  store load metadata; focused tests and active documentation.
- Exclusions: Package assignment paging/summary cache, API routing, backend,
  authentication, Package/Workspace read contracts, SDK/Calcite, mock data,
  visual layout and npm dependencies.

## Behavior

The initial Workspace catalogue load can already trigger a complete Packages
read. The old panel-open path always started another complete read, potentially
aborting that request or repeating all Workspace membership and Package-detail
GETs. It did so even after a recent successful list read.

The Jobs store now records `lastSuccessfulLoadAt` only when the current
non-aborted load succeeds. The value is `null` before the first success and
immediately when a new authoritative Workspace scope starts loading with
`clear: true`. A failed non-clearing read retains the prior timestamp but also
publishes the existing error; errors are never reused as successful cache hits.

For **live mode**, a normal panel-open request is skipped when:

1. The Jobs store is already loading (the current request owns publication); or
2. The store contains a successful read completed less than 60 seconds earlier,
   has no current error, and the local clock has not moved backwards.

Otherwise the normal Packages read runs. The 60-second window uses browser time
since the last accepted completion; it is **not** a backend Last-Modified value,
HTTP cache directive, persisted cache, or server freshness guarantee. Reusing an
empty but successfully fetched catalogue is valid. No synthetic
`data-catalogue:jobs-refreshed` event is emitted when a panel opens with reused
data. The existing `jobStore` subscriber owns regular map/list synchronization.

The Packages header's manual Refresh bypasses this policy. Failed loads and
manual retries still show their existing errors/notices. Mock mode still
reloads when the panel is reopened because the prototype can introduce work
when a user completes a mock Job.

## Local verification

From `src/DataCatalogue`:

```powershell
npm run format
npm run check
```

If dependencies are not available, run the focused dependency-free tests:

```powershell
node --test src/features/jobs/state/jobStore.test.js src/features/jobs/ui/jobList.test.js src/app/ui/createJobsPanelActions.test.js src/features/jobs/services/liveJobServiceAdapter.test.js
node --check src/features/jobs/state/jobStore.js
node --check src/app/ui/createJobsOverlay.js
node --check src/app/createApp.js
```

## Browser acceptance matrix

| ID       | Scenario                                                                       | Expected result                                                                                                                           |
| -------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| UX03B-01 | Load live main map, then open Packages while the initial read is pending       | The in-flight read continues. Opening the panel causes no second membership/Package request burst.                                        |
| UX03B-02 | Close and reopen Packages several times within 60 seconds of a successful load | Previously loaded list remains visible; reopening does not produce another read burst or map refresh event.                               |
| UX03B-03 | Wait more than 60 seconds after successful completion, then reopen             | Fresh membership and Package reads start normally.                                                                                        |
| UX03B-04 | Reopen within 60 seconds, then click the Packages header Refresh icon          | A fresh read is performed, and the existing success/error notice behavior remains unchanged.                                              |
| UX03B-05 | Cause an API read to fail; reopen or select Retry                              | Error is visible and retry invokes a new read; the stale successful timestamp does not hide a failure.                                    |
| UX03B-06 | Reload Pipelines/Workspaces or change the authoritative Workspace scope        | A scope-driven `clear: true` reload invalidates the reusable list; Package identity and map scope update with the new authoritative data. |
| UX03B-07 | Rapidly open/close Packages while requests are delayed or superseded           | No duplicate logical read initiated by opening; only latest-generation data is published.                                                 |
| UX03B-08 | Repeat on mock mode and complete mock work that creates additional Jobs        | Reopening continues to fetch mock Jobs and displays newly created items.                                                                  |
| UX03B-09 | Repeat with keyboard focus, error notices and light/dark UI                    | No focus loss, panel/notice regression, or map reinitialization.                                                                          |

Capture the browser Network waterfall for initial and repeated panel opens
before attributing all previously observed 26 calls to frontend behavior.
A genuinely fresh load still fetches each Workspace membership and each unique
Package detail through the existing API; this candidate does not claim a
first-load request-count improvement or a verified backend performance gain.

## Deployment / rollback

Do not change `.env`, `api_target`, `VITE_CATALOGUE_API_BASE_URL`, IIS hosting,
controller routes, or deployment authentication as part of this change.
Deploy the changed frontend JavaScript and test the compiled build together.
Rollback is limited to replacing the three JavaScript files and their tests;
the read contracts and backend require no rollback.
