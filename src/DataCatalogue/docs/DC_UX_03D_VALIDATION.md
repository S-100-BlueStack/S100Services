# DC-UX-03D — Main-map Packages presentation validation

Date: 2026-11-12  
Authoritative source archive: `DC-UX-03D-Context-b3de325d5710-20261112-084944.zip`  
Source commit: `b3de325d57100170be49415b5d7ea8e122bb23cc`  
Previously user-reported commit: `0cbe2c99fa5e1c7ce196e734389c6dca9b593184`  
Status: Implementation candidate; local browser acceptance pending.

## Purpose and preservation

Reduce competing bold typography in live Packages list and Details, make the
Package short ID dominant and contextual information quieter, keep exact
Severity visible and group `Done` / `No update` actions into a consistent compact
strip. Style the saved source facts as readable label/value rows. No new status
choices, navigation, API or auth contracts, geometry changes or dependencies.

Only `src/features/jobs/ui/jobList.js` changes the DOM, by adding live-only
styling hooks and a status action group label and omitting an empty action
container in live Details. Job identity/status mutations, focus recovery,
page routing, notifications, Refresh and the mock presentation stay unchanged.

## Automated verification

See the accompanying delivery report for checks performed in this environment.
The complete `npm run check` requires the actual project dependencies and build
inputs from the repository; no browser test is performed by focused Node tests.

## Local checks

From `src/DataCatalogue` after confirming expected file hashes and applying the
candidate to the exact source commit:

```powershell
npm run format
npm run check
```

## Manual browser checklist

1. Open the main map in `live` mode, open Packages and compare several cards.
   Confirm each short ID is visually primary, long Pipeline/Workspace context
   wraps, exact Severity remains readable, and `Done`/`No update` are aligned.
2. Open a Package with and without a title and Created value. Confirm no
   placeholder information is introduced; the detail header has no blank
   action area; fact labels and values align, and long values wrap safely.
3. Toggle `Done`, toggle it off, toggle `No update` and toggle it off from both
   list and Details; confirm `aria-pressed` matches the active option and the
   current Package does not disappear immediately. Verify temporary live
   statuses remain mock-only.
4. Navigate List -> Details -> Back and Refresh with a keyboard. Confirm
   Tab/Shift+Tab, Enter/Space, focus restoration and visible `:focus-visible`;
   pointer clicks should not leave conspicuous focus outlines.
5. Repeat list/detail checks in light and dark modes, at a narrow viewport and
   with long short IDs / Pipeline names / exact 64-bit Severity values.
6. Run the mock main-map Packages workflow: expand/collapse, map focus,
   status, AOI content, and keyboard behavior must remain unchanged.
7. Confirm Pipeline/Workspace visibility, Package assignment, basemap selection,
   and Gallery theme still behave as before. No new network request should be
   caused by merely opening or displaying a Package card.

## Known limitations

- The archive reports a different commit than the preceding conversation's
  accepted baseline. Validate local preimage hashes before applying the ZIP;
  its files should not be overlaid blindly on a diverged worktree.
- Visual hierarchy, focus appearance, dark-mode contrast and Calcite component
  layout require browser acceptance on the local Vite/IIS build.
- This candidate deliberately does not implement deep-link routing for details,
  API read optimization, or expandable backend fields. Those remain separate
  follow-up scopes.
