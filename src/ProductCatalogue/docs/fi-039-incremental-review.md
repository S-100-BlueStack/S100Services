# FI-039 — Incremental Review Product loading and reconciliation

Status: **Done**.  
Accepted commit: `1a77af904ec1a41726bcec357b72610c74e793ca`.

## Authoritative input

Implementation baseline: `1033721e4c6300bb92dd66a96dc072fda04fb152`.
The accepted V3 implementation is present in merged repository commit `1a77af904ec1a41726bcec357b72610c74e793ca`. That commit also contains colleague changes and is the authoritative post-FI-039 baseline. V3 used the verified v2 candidate as controlled input:
`75A57343D28CFF056D1137C43E7DC1E7690C0D3E2D2FBFC038AA3ACB5CB448FB`.
The v1 implementation input remains:
`A8C86171B1C9073F2B630BF691440AECDBD5AE39BA5B140FAB08B6FCB205A01C`.
All 13 v2 replacement/new files matched the supplied v2 ZIP before this correction.

Both hashes were calculated from the supplied files before implementation and match the manifest:

| Input                          | SHA-256                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `FI-039-baseline-1033721e.zip` | `26DDFE9F501515F9055BB2F4D54A3AC1EE54B7F06C616606466450F97923BBEE` |
| `FI-039-context-1033721e.md`   | `4109D4123BF1FBF4BDB8C3ACB04CD7D76085230AD0F579B2702903BC5A79C581` |

FI-035, FI-042, FI-036, FI-041, FI-037 and FI-038 acceptance records and commit history are preserved.

## Architecture and lifecycle

`createReviewProductSession` in `src/features/review/core/reviewProductSession.js` is the sole
Review data-generation owner. It replaces the page's full-load/targeted-refresh publication counters;
it does not run alongside them. `initReviewPage.js` still owns composition, FI-038 content intent,
route publication, event wiring and call-local FI-041 snapshots. The picker retains its own catalog
request guard, which cannot publish Review Product content. FI-022 owns revision observations and
its existing timer; all resulting Product reloads go through the Review session. The freshness monitor
also owns a small composition-observation epoch that is separate from the Review data generation and
from additional Product priming. Every `check()` captures that epoch; `retain()` advances it for an
authoritative composition/eligibility edit, so pre-edit observations cannot call `onChanged` or mutate
revision baselines after a remove/re-add or other membership boundary.

The session has one generation and one current request record per normalized route/picker alias.
Resolved payloads are stored by the existing source-aware serializer (`sourceId`, `productKey`) from
the authoritative Product context. Targeted AOI resolution remains responsible for ProductSpecification,
registry/capability validation and malformed/ambiguous/unavailable responses. No dataset-name syntax,
source-name branch or bulk catalog fallback is introduced. Metadata changes use the established opaque
FI-022 revision contract; there is no speculative revision comparison or new backend contract.

| Operation                       | Result                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Add                             | Preserve survivors and pending records; initialize only new item selections through `addReviewProductItem` and current workspace intent; prime only new revisions; start new loads concurrently; project results in current composition order.                                                                                             |
| Remove                          | Discard that record, payload and revision bookkeeping; preserve survivor references and order; late completion cannot reinsert the removed record.                                                                                                                                                                                         |
| Disable/enable                  | Hide/reuse the retained session payload without a reload. Initial data is needed only if that enabled record has no payload or pending request. Content selection remains independent.                                                                                                                                                     |
| Manual Refresh                  | New full generation, full revision prime and reload of every currently enabled Product. All old payload/request ownership is discarded, including disabled payload caches. Product items and workspace intent remain unchanged. The existing icon-only event/control and visible-loading disabled rule remain.                             |
| FI-022 change                   | Reload changed enabled Products only. Preserve other payloads, order and selections. Decline a revision refresh when a selected Product already has an owned request, and discard any observation whose captured composition epoch was superseded by `retain()`, so the next current check retries without crossing membership boundaries. |
| Initial/direct route            | Full generation and load of the requested enabled composition.                                                                                                                                                                                                                                                                             |
| Authoritative route replacement | New full generation and existing all-on FI-038 session defaults. No old-session payload reuse. Popstate is registered before initial asynchronous loading.                                                                                                                                                                                 |
| Destroy                         | Invalidate generation and clear all records/payloads; late completions cannot render.                                                                                                                                                                                                                                                      |

Publication requires all three conditions: current generation, same retained record, and the record's
current operation. Checks precede Product request dispatch and follow resolution, including failure
and finally paths. A remove/re-add creates a new record even within the same generation. Composition
and URL publication occur synchronously from current authority, never from an old asynchronous result.

In-flight records are reserved before awaiting preparation. Rapid adds retain those records; rendering
never initiates loading. Lookup loading shares one promise. Additional revision priming coalesces
matching in-flight names, retains survivor baselines and waits for a pending full prime. Removal drops
obsolete prime ownership. Failed additional primes recover only affected Products. Disabled retained
Products keep their baseline and are checked when enabled, without a second polling loop.

Loaded Product columns remain visible during additions; only new columns display loading. Independent
resolution/History/artifact failures retain the existing FI-037 failure distinctions and download
behavior. A new Product failure does not erase successful survivors. A rejected automatic loader invocation retains the last payload and declines revision acknowledgement for retry; ordinary returned per-content failure states retain the baseline loader contract. History and artifact transport,
source capabilities, sidebar layout and styling remain unchanged.

## Changed files

Paths below are relative to `src/ProductCatalogue/`. All delivered ZIP members include that prefix.

| Kind     | File                                                                           |
| -------- | ------------------------------------------------------------------------------ |
| Modified | `src/features/review/core/initReviewPage.js`                                   |
| Modified | `src/features/review/ui/reviewBoard.js`                                        |
| Modified | `src/features/products/services/workspaceFreshnessMonitor.js`                  |
| Modified | `src/features/review/README.md`                                                |
| Modified | `docs/fi-022-workspace-freshness.md`                                           |
| Modified | `docs/frontend-hardening-tracker.md`                                           |
| Modified | `docs/ui-ux-design-backlog.md`                                                 |
| New      | `src/features/review/core/reviewProductSession.js`                             |
| New      | `src/features/review/core/reviewProductSession.test.js`                        |
| New      | `src/features/review/core/initReviewPage.lifecycle.test.js`                    |
| New      | `src/features/review/core/reviewProductSession.freshnessEligibility.test.js`   |
| New      | `src/features/products/services/workspaceFreshnessMonitor.incremental.test.js` |
| New      | `docs/fi-039-incremental-review.md`                                            |

No deleted files. No dependency, package manifest or lockfile changes.

## V1 verification record

Runtime: Node.js `v24.19.0`. No package installation or external repository access was attempted.

The focused suite passed **122 tests, 0 failures, 0 skipped** using:

```sh
cd src/ProductCatalogue
node --test --test-reporter=tap src/features/review/**/*.test.js src/features/products/services/workspaceFreshnessMonitor*.test.js src/features/products/services/workspaceProductService.test.js src/features/products/tests/normalizedWorkflow.test.js src/shared/routing/workspaceRoute*.test.js src/features/analyze/services/analyzeHistoryLoader.test.js src/features/products/api/workspaceFreshnessApi.test.js
```

This includes FI-022 freshness, FI-024 resolution, FI-036/037 presentation, FI-038 content state,
FI-041 interactions, canonical workspace routes, normalized workflow and independent content failures.
The three new test files contribute **31 passing tests**: 20 session tests, five page event/lifecycle
tests and six incremental freshness tests. Deferred promises, not real timers, control race ordering.

| Loader-count behavior        | Observed result                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| Initial A, add B, add C      | Exactly `A, B, C`; targeted resolver, History and artifact call lists also each equal `A, B, C`. |
| Remove B from A/B/C          | No additional A/C loads.                                                                         |
| Disable and re-enable A      | No additional A or survivor loads.                                                               |
| Full manual Refresh          | All current enabled Products reload; disabled payloads are invalidated at this full boundary.    |
| Changed B                    | Only B reloads; changed B/C reloads B/C once each.                                               |
| Rapid and combined additions | Independent new loads start concurrently once each; reverse completion preserves current order.  |

Race coverage passed for add/remove, remove/re-add, authoritative route replacement (including the
same name), stale success/error, teardown, empty replacement, preparation supersession, rapid adds,
changed-Product freshness versus add/remove, and route replacement during initial loading. V3 additionally
covers an old FI-022 observation spanning remove/re-add of the same Product and an observation invalidated
by an unrelated composition addition. Tests also prove old requests cannot rewrite URLs or carry FI-041
snapshots into replacement renders.

`node --check` passed separately on **all seven changed/new JavaScript files**, including tests.

A broad `node --test --test-concurrency=1 --test-reporter=tap` run produced **826 tests: 822 passed, 4 failed, 0 skipped**.
The same four failures were reproduced on the untouched baseline by running their three test files
(**12 tests: 8 passed, 4 failed**):

- `dashboardPage.presentation.test.js`: `range controls keep keyboard time editing local until the range interaction commits` uses an LF-only source regex; the supplied unchanged Dashboard file has CRLF.
- `developmentMockEndpoints.test.js`: both backend registration/embedded-fixture assertions require ProductCatalogueAPI files outside this frontend-only archive.
- `developmentMockIdentity.test.js`: the fixture normalization test requires the absent backend mock GeoJSON files.

These unrelated files were not modified to make the supplied archive pass.

Not run: `npm run check`, Prettier, ESLint or Vite build. Project `node_modules` and a usable runtime
Prettier installation are absent. Browser/backend verification was not performed. The user's local
full check and manual verification remain authoritative.

## Manual verification checklist

1. Open Review with A, add B, then C. Inspect network calls as well as visible content: A must not enter
   a fresh load on B; A/B must stay stable on C. Check order and all-on defaults initially, then repeat
   after changing workspace intent and verify only the new Product inherits it.
2. Remove the middle Product. Verify survivor content, selection, enabled state and relative order,
   with no new survivor loading cycle or requests.
3. Disable and re-enable a loaded Product. Verify no data request solely from visibility, no unrelated
   loading indication, and unchanged content selections. A later genuinely changed revision may reload
   that Product through FI-022.
4. Use the single icon-only Refresh. Verify all enabled Products reload, the button is disabled during
   visible loading, successful content recovers and one failing Product remains independently shown.
5. Where practical, change B's backend revision and observe FI-022. Only B should reload, with A/C
   retaining content. Check multiple changed Products and a temporarily disabled Product as practical.
6. Quickly add/remove and add multiple Products; navigate during loading and reload a canonical Review
   URL. Removed/old-session Products must not reappear or rewrite the route; verify final ordering.
7. Exercise mixed FI-038 selections, each workspace bulk control, per-Product overrides and new-Product
   inheritance. Verify native checked/unchecked/indeterminate states and separate Product visibility.
8. Check FI-041 Product-list scroll/focus, bulk-control focus, picker overlay, keyboard/Escape behavior,
   History sizing/scrollbar, Product-column IC-ENC/Validation scrolling and validation downloads.
9. Repeat relevant interactions in light/dark mode and a narrow viewport; open a direct canonical Review
   URL and reload it. Run local formatting and `npm run check` before accepting/committing.

## Pre-acceptance uncertainty and delivery

Live DOM/layout, real backend timing, downloads and deployment behavior still require the checklist.
Tests use real session/domain/freshness/loader code with controlled I/O; page event tests substitute
browser/API boundaries and do not claim browser coverage. Obsolete network transport may finish because
the existing loader API has no abort contract, but its invalidated result cannot publish.

Deliverable: `FI-039-candidate-v3-1033721e.zip`, containing complete replacement/new files only.
The ZIP SHA-256 is supplied alongside the download; it is not embedded in its own contents.

Suggested commit message:

```text
fix(review): guard freshness observations across composition changes (FI-039)
```

## V2 correction: atomic freshness eligibility acknowledgement

At this correction stage the status remained **Implemented; manual verification pending**.

A targeted refresh now requires its selected records to represent every distinct normalized name in
the requested changed set. Otherwise it returns false before starting any Product loads. After the
owned operations complete, it also requires current enabled membership and the same retained records
before returning success. Existing generation and operation guards remain authoritative.

This prevents `Promise.all([])` or a partially matched changed set from acknowledging a disabled
Product whose cached payload was not refreshed. Mixed A+B observations are declined atomically if B
is disabled; the next normal check can refresh A, and B is retried once enabled. No new lifecycle,
monitor, timer, identity rule, dependency or UI behavior was added. Removal uses existing revision
pruning. The V3 observation-epoch correction further tightens this boundary: any `retain()` occurring
while an observation is in flight discards that old observation before it reaches `onChanged`; a later
current-composition check performs any required retry.

Files changed relative to v1:

- `src/features/review/core/reviewProductSession.js` — eligibility/record checks only.
- `src/features/review/core/reviewProductSession.freshnessEligibility.test.js` — new regression tests.
- `docs/fi-022-workspace-freshness.md` — atomic acknowledgement contract.
- `docs/fi-039-incremental-review.md` — this correction and verification record.

The eight new tests passed using deferred observation and Product-load promises with the real Review
session and real freshness monitor: disabled B, mixed eligible/ineligible A+B, both full observation
races, disable/re-enable before response, removal and obsolete baseline pruning, full-session
replacement, and disable during the Product request itself. No real timers are used.

The existing focused command above, rerun for v2, passed **130 tests, 0 failures, 0 skipped**, including
all 122 v1 focused tests and the eight new tests. Sequential loader calls remain exactly `A, B, C`;
normal remove/disable/re-enable adds no survivor loads; manual Refresh stays full and FI-022 stays
changed-only. In the corrected B-only race, calls are exactly `A, B, B`: the last B occurs after
re-enable. In the mixed race, calls are `A, B, A, B`: no load from the declined A+B observation, then
A on its next eligible check and B after re-enable. Stable subsequent checks add no loads.

`node --check` passed on both JavaScript files changed/new relative to v1. No dependencies were
installed. `npm run check`, Prettier, ESLint, Vite build and browser verification were not run because
project dependencies remain unavailable. The broad-suite results above are the v1 record, not a new
v2 broad-suite run. Manual verification remains pending; additionally reproduce disable during a
freshness request and confirm B updates after re-enable without unrelated Product loads.

## V3 correction: freshness observation membership ownership

At this correction stage the status remained **Implemented; manual verification pending**.

`workspaceFreshnessMonitor` now has a composition-observation epoch that is deliberately separate from
`lifecycleGeneration`. Each `check()` captures the current epoch. `retain()` increments it whenever the
authoritative Review composition/eligibility state is reconciled. After the freshness transport returns,
and again before accepting a successful `onChanged` result, the monitor requires the captured epoch to
still be current. A stale observation therefore cannot invoke `onChanged`, update `revisions`, mutate
`additionalRecoveryKeys`, or acknowledge a replacement Product membership.

The epoch does not invalidate `primeAdditional()`: additional revision priming retains its existing
per-Product promise/retained-name ownership, so rapid independent additions still prime concurrently and
do not acquire another Review data-generation lifecycle. `createReviewProductSession` remains the sole
owner of Review Product payload publication.

The remove/re-add regression now proves this sequence: an old observation captures B revision 2, B is
removed, B is re-added and primed at revision 3, then the old revision-2 observation completes. The old
check returns false without calling `onChanged` or loading B; the next current check accepts the revision-3
baseline without a redundant B refresh. A second regression proves that adding C invalidates an older A
observation while preserving A's prior baseline, so the next current A+C check still detects A's real
change and leaves C's independent additional prime intact.

Correction-focused verification in this delivery passed **16 tests, 0 failures** across the complete
`workspaceFreshnessMonitor.incremental.test.js` and
`reviewProductSession.freshnessEligibility.test.js` files. The v2 focused-suite record of **130 passed,
0 failed** remains the controlled-input verification record; the full repository suite was not rerun in
this changed-files-only environment. `node --check` passed on every JavaScript file included in the v3
ZIP. No dependency, package manifest, lockfile, polling cadence, backend endpoint or UI behavior changed.

## Final manual acceptance

FI-039 was manually accepted on 2026-09-18 and committed at `1a77af904ec1a41726bcec357b72610c74e793ca`. Acceptance followed the incremental Review browser checklist: existing Product content remains stable while adding new Products, removing a Product does not reload survivors, ordinary disable/re-enable reuses retained payload where valid, and the icon-only manual Refresh remains the explicit full enabled-composition reload. The automated deferred-promise coverage remains authoritative for timing-sensitive stale-publication races that are not practical to reproduce deterministically in a browser, including disable during freshness and old FI-022 observations spanning remove/re-add membership boundaries.

The local frontend check passed and formatting was run before commit. Because the accepted commit also includes colleague merge changes, future implementation context must use the merged commit itself rather than reconstructing repository state from the FI-039 candidate ZIP.
