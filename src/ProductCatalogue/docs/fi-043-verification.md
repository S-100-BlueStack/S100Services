# FI-043 onboarding correction and workspace selection visibility

Current status: **FI-043 accepted** at `9280c650a0cf28f59af27b0720d986fba22ed2c9` (developer-reported, 2026-10-26). The v1–v3 notes below document the historical correction/verification process. Full-system demo smoke remains a separate gate.

Authoritative source commit: `a31f57a0c3c04e29da3a5627df70fd9c04993902`.

This focused correction follows the developer's 2026-10-26 manual tests. It does not add new product capabilities, change backend operations, or alter the accepted map/source architecture.

## Original manual results (developer-reported)

| ID     | Route or behavior | Baseline result | Concrete findings                                                                                                                               |
| ------ | ----------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| F43-01 | Main map          | Failed          | Product search copy, modifier guidance, Product popup prerequisites and placement, obsolete popup action names, oversized Preferences highlight |
| F43-02 | Dashboard         | Failed          | Sorting/Links/Preferences highlights too broad, sorting card too low, introduction action not highlighted                                       |
| F43-03 | Analyze           | Failed          | Product prerequisite absent, Product list waits for API, redundant introduction copy                                                            |
| F43-04 | Review            | Failed          | Product prerequisite absent, Product list waits for API, technical and redundant copy                                                           |
| F43-05 | Replay            | Passed          | Replay works                                                                                                                                    |
| F43-06 | Escape and focus  | Passed          | Focus returns to Preferences button                                                                                                             |
| F43-07 | Navigation        | Passed          | Developer reports introduction remains open; verify that no stale highlight remains                                                             |
| F43-08 | Panel state       | Passed          | Existing state preserved                                                                                                                        |
| F43-09 | Missing target    | Passed          | Missing target handled safely                                                                                                                   |

## Candidate behavior to verify

- Main map: Product search and current popup actions are described accurately. Product-dependent steps require a selected visible Product popup. Steps for actions and collection position beside application-owned popup content. Preference highlights target Theme/Scale hiding and the saved settings/Introduction control separately.
- Dashboard: sorting buttons are the targets for sorting, the Links controls or their heading for workflow links, and the specific preferences settings for later steps.
- Analyze: the picker step requires a selected Product and the Product-list step waits for actual Product cards before moving to content. A new selection appears in the sidebar before source-aware resolution and other API reads complete.
- Review: the picker step requires a selected Product; the refresh step waits for a loaded Product column. Pending selections appear immediately, while canonical Product/session reconciliation still owns source identity, member aliases, request cancellation and payload loading. Existing content overrides and workspace intent remain authoritative.
- Onboarding completion state uses a new version for each changed route (Main v5, Dashboard/Analyze/Review v3). Previously completed routes may show the first-use introduction again; replay remains available.
- Picker focus is restored to the replacement input after an add-triggered rerender; the selected list item, not a fabricated data record, is shown during loading.

## Manual acceptance after applying candidate

1. Re-run F43-01–F43-09 in the deployed demo browser. In particular, on Main step 6 select a Product only after the guide is waiting, then confirm steps 8 and 9 follow its popup and returning to the map when it closes.
2. Use an initially empty Analyze route. At the Product picker step, Next must be disabled; add a Product and observe its list entry **before** API work finishes. The following content step must wait for a Product card. Check Back, Escape and replay.
3. Repeat in Review: the Product must immediately appear in Products before API completion. Verify that the content column appears when loaded, and history/report selection checkboxes remain correct after adding package aliases, toggling one Product, and Refresh.
4. Confirm Product-picker keyboard focus is usable without an extra click immediately after adding another Product on Analyze and Review.
5. Check Dashboard sort control / activity-link highlights with rows, without rows, and at the actual demo screen resolution. Verify the final step highlights both Saved preferences and Start introduction.
6. Check light/dark, rapid Product switching, failed API response, popup closing/reopening, and route changes during an introduction. Confirm existing Escape/focus and panel-state behavior.
7. Run `cd src/ProductCatalogue`, `npm run format`, `npm run check` locally; record the exact results. Do not execute destructive Product mutations as part of the UI tour.

Historical v1 instruction (superseded by FI-043 v3 acceptance): local runtime verification was required before accepting the candidate. The existing limitation of disabled non-package mutations remains unchanged.

## Follow-up manual regression and focused v3 correction

The developer's subsequent browser pass on FI-043 v2 reported these remaining failures:

- **Main map Step 6:** opening a Product enabled Next but did not advance automatically; the guide remained at the map's top-right rather than accompanying the popup.
- **Main map Step 9:** Product Collection highlighted the entire popup instead of the collection action.
- **Main map Step 10:** Theme and Scale hiding highlights were correct, but the guide card obscured Scale hiding.
- **Analyze Step 2:** adding a Product enabled Next but did not automatically advance. The report repeated this Analyze observation; Review was not separately retested in that message.

**v3 corrective behavior:** A previously missing required Product automatically advances Main map Step 6 and the Analyze/Review Product-picker step once the Product is available. A Product already present before entering a step does not automatically skip guidance, and using Back remains possible. Main map Step 6 waits at the left edge of the map; once a Product opens, Step 7 and the subsequent popup guidance are positioned beside the current popup. Product Collection highlights the real header action passed by the map popup owner; it never substitutes a full-popup highlight if the control is unavailable. Preferences guidance positions relative to the outer panel while highlighting only the designated internal settings. No backend action contract is changed.

**Required v3 browser checks:** Open a Product from an initially empty Main-map Step 6 and confirm automatic transition to Step 7 beside the popup; inspect the exact Product Collection icon highlight in Step 9, close/reopen the popup and use Back. On Step 10, confirm the guide does not hide either Theme or Scale hiding. On initially empty Analyze and Review routes, add one Product during Step 2 and confirm the guide advances without pressing Next, while picker focus and immediate list updates remain correct. Check Escape/replay, both themes and the actual demo screen resolution.

## DSA-04 follow-up — same-document Back/Forward (accepted)

Follow-up baseline: `20cb5c608dc03a2e5bdcf2137bd568509812b572`.
This is a focused lifecycle correction after the accepted FI-043 onboarding work,
not a change to the established step copy, target positioning or prerequisites.

- `popstate` retires the active introduction or first-use welcome, removes its
  highlights and timers, and closes panels opened by onboarding. The current
  route's onboarding service remains reusable by the existing Preferences
  `Start introduction` callback. No welcome is automatically restarted.
- Actual page teardown (`pagehide`) and explicit `destroy()` still remove the
  service's listeners and prevent later start/route-ready callbacks.
- Keyboard focus returns to the original visible trigger if the introduction
  removed/hidden the active control. An application control that retained focus
  through Back/Forward keeps its focus rather than having it stolen.

Manual regression: In Dashboard, Analyze and Review, start Introduction, use
Back/Forward (both with a running tour and with no tour), then use Preferences
`Start introduction` repeatedly. Confirm panel cleanup, Escape, focus, and
absence of stale highlights or automatic welcome replay. Also confirm Main map
replay and that full page teardown does not leave a working old callback.

Status: **accepted and committed** at `69b0d3295ca7cfb96b5a5fb312b7ecbcd45ff703` (developer-reported). The developer verified Dashboard Back/Forward with Introduction inactive and active, including replay from Preferences. Browser Back/Forward intentionally closes an active tour without automatically resuming its previous step. The developer reports running frontend tests, formatting, lint and build before commits. Full demo/browser/deployment regression remains outstanding; historical FI-043 acceptance is unchanged.
