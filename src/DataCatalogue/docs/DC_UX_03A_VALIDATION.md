# DC-UX-03A — Frontend consistency and loading-state validation

## Authority and scope

- Baseline: `fc75611c06b0d9e531dc5a68c136bb90fce3450a`
- Source: verified commit-pinned frontend export, with an external archive SHA-256
  and 273/273 source-file manifest matches
- Candidate scope: navbar action order, initial-route focus, unsaved-dialog
  alignment, comment dismissal, Package selection loading states and a
  last-successful-Package-list-refresh timestamp
- No backend, authentication, endpoint, dependency, lockfile or ArcGIS geometry
  changes; no commits are part of the delivery

## Behavior and safety contracts

1. Notifications precedes Preferences in the shared navbar, including on direct
   navigation to `/assignments`.
2. A direct route should not receive synthesized keyboard focus. A workflow
   transition relocates focus only when the focused control would otherwise be
   hidden. Genuine keyboard `:focus-visible` styling remains.
3. Unsaved-changes Save, Discard and Cancel behavior is unchanged; only paragraph
   margins are corrected. The comment dialog's dismissal label is `OK`, retaining
   existing click, Escape and focus-return behavior.
4. While selecting Package B from Package A, `Loading Package…` remains visible.
   The previous Package name, details, saved binding summaries and Pipeline rows
   disappear. No previous Pipeline row is rendered as Package B's content.
   Session/map state is retained internally until the request resolves. A failed
   selection can restore A and allow Retry without losing the accepted draft
   ownership, map context or history safeguards. Pending work remains subject to
   existing generations and teardown.
5. The Package assignment list's timestamp starts as `Last refreshed: —` and
   updates only for an accepted successful list response. A failed, canceled or
   superseded list read does not change it. The time is _client fetch completion_,
   not the server's Package modification time. The indicator appears immediately
   right of the list Refresh control and is hidden in mock mode.

## Local verification

From `src/DataCatalogue` on the exact baseline with these replacement files:

```powershell
npm run format
npm run check
```

`npm run check` runs formatting verification, lint, Node tests and a Vite build.
Do not treat offline Node tests as an ArcGIS/WebGL or browser acceptance run.

## Manual browser matrix

| ID       | Scenario                                                                                        | Expected behavior                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| UX03A-01 | Open `/` and `/assignments`; inspect the right-hand navbar                                      | Notifications is immediately before Preferences on both pages                                                                |
| UX03A-02 | Navigate directly to `/assignments` and `/assignments/packages/{encodedId}` after a full reload | Correct route opens without a white pointer-like outline; keyboard Tab still displays `:focus-visible`                       |
| UX03A-03 | Focus a control in the main-map workflow, then open assignment; repeat in reverse               | Focus moves to a visible route control only when its original host will be hidden                                            |
| UX03A-04 | Make an unsaved binding change and attempt to leave or select another Package                   | Dialog title and paragraph share the same left alignment; Save/Discard/Cancel behavior stays unchanged                       |
| UX03A-05 | Open a Pipeline comment, type text, click `OK`, then repeat using Escape                        | Popover closes, focus returns to the trigger and the draft remains unchanged                                                 |
| UX03A-06 | Select Package A, then select a slow-loading Package B                                          | `Loading Package…` stays visible; old details and old Pipeline rows are cleared during the request; map is not reinitialized |
| UX03A-07 | Fail B's Package or bindings fetch and Retry                                                    | Error is visible, prior committed context remains recoverable, and successful Retry shows B without stale A rows             |
| UX03A-08 | Rapidly select Packages or navigate Back/Forward during delayed reads                           | Only the newest accepted selection is published; no post-disposal errors or duplicate logical writes                         |
| UX03A-09 | Open Package assignment, wait for list load, then click Packages Refresh                        | Timestamp is shown directly right of the Refresh icon and advances only when the list successfully loads                     |
| UX03A-10 | Fail the list Refresh request, then restore connectivity and retry                              | Error is visible; the previously successful timestamp remains until the next successful response                             |
| UX03A-11 | Repeat in light/dark mode and compact laptop-width layouts                                      | Text remains legible; actions stay reachable; Refresh and timestamp stay grouped                                             |
| UX03A-12 | Open Jobs/main map; refresh and change Job status                                               | No change to Jobs data, map overlays, main-map refresh timing or focus recovery                                              |

## Acceptance and remaining work

This file documents candidate behavior and the _required_ local checks. Full
browser acceptance and local dependency-backed `npm run check` must be reported
separately; do not infer their completion from this document.

Follow-ups outside scope: the comprehensive panel redesign, request/caching
review, guided onboarding, reset-all Preferences, editable binding preview,
Package AOI layers, and SDK component migration audit.
