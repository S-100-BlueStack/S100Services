# Product Catalogue UI/UX design backlog

**Documentation baseline:** `b52a4ac0833edac94b466176f3f7c6154090f502` (2026-10-26).
**Purpose:** A compact index of _current UX decisions, accepted behavior and outstanding design work_. This is not a new manual acceptance report or an instruction to reopen completed tasks. Historical per-iteration plans and detailed original requirements are available in the Git history of this file.

For current task status see the [frontend tracker](frontend-hardening-tracker.md); for the actual demonstration test matrix see [demo readiness](demo-readiness-plan.md); for preserved technical contracts see [invariants](INVARIANTS.md), [module ownership](MODULE_MAP.md) and the relevant feature README.

## Demo-first decision (2026-10-26)

The demo branch prioritizes the accepted application, targeted regression fixes and truthful unavailable states. Do **not** introduce SDK/Calcite upgrades, map labels, Linked Annotations, Sonda, Vitest/Playwright migration, FeatureEffect, React or broad UI refactors as prerequisites for the demonstration.

- **Verify next:** A representative Main-map/Dashboard/Analyze/Review browser/deployment demo smoke after accepted FI-043 and DSA-01–08 stabilization; do not reopen the accepted onboarding work.
- **Preserve:** the accepted interaction contracts below, separate search workflows, Product identity, backend-owned status, generation-safe state, keyboard/focus/Escape and light/dark mode.
- **Do not overstate:** FI-029 icon-row parity does not mean non-package Product mutations are operational. Mutations remain disabled when a source-owned authorization/dispatch contract is missing.
- **Separate work:** FI-030 progress/chunk discovery, FI-016 error-classification palette, FI-020 related Product relationships, FI-023 mutation capabilities, report links and FI-018 cross-repository deployment review.

## Open UX and demo items

| ID                  | Recorded status                                                        | Next acceptance boundary                                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FI-043**          | Accepted at `9280c650`; Back/Forward correction accepted at `69b0d329` | Preserve accepted onboarding; include representative route replay and focus/Escape in the separate full demo smoke. [Detailed onboarding contract](fi-043-onboarding-refresh.md).                                                                    |
| **FI-029**          | Shared UI committed (`dbc14664`); non-package dispatch unverified      | Same action presentation on all Products; disable unsupported operations, do not send them through package-only or historical Freeze/Export routes. [Popup workflow contract](../src/features/map/popups/README.md).                                 |
| **FI-030**          | Deferred frontend completion polish and backend discovery              | A real completion state may briefly reach 100% before dismissal, respecting reduced motion and newer generations. Never invent precise percentages. Backend phase/chunk progress requires a real source contract and must preserve FI-025 isolation. |
| **FI-016**          | Backend-dependent                                                      | Obtain authoritative status/error definitions before changing the final symbology or enabling an error-only first-visit filter preset.                                                                                                               |
| **FI-020 / FI-023** | Backend-dependent                                                      | Explicit cross-source Product relationships and authoritative mutation capabilities. No inferred relationships, candidate state or backend dispatch.                                                                                                 |
| **FI-018**          | Future deployment review                                               | Third-party deployability, environment assumptions, secrets, links, branding and licenses; not a demo UI redesign.                                                                                                                                   |

## Accepted interaction boundaries

The details below are preservation constraints. A new task must use current code and feature tests from its explicit commit before modifying them.

### FI-021 - modifier-click direct Product selection

Accepted at `32efa496f978e20baee834f0becdb95bdadadd98`. Ctrl-click on Windows/Linux and Cmd-click on macOS may open only the _currently highlighted_ valid Product after post-hitTest source/Graphic/generation revalidation. Normal click retains the overlap picker; Shift-click and Product Collection are unchanged. Modifier-click is **not** a Product Collection toggle.

### FI-026 - shared navigation and Preferences consolidation

Accepted at `6bc8d1181beabda254ba19dd483d29ec41cadf41`. Shared navbar owns route/current-page state, compact refresh feedback and entry to Preferences/Theme. Do not recreate page-specific Help/Theme controls or duplicate route state. `aria-current="page"` remains the semantic active-route signal; underline feedback for hover/focus must not falsely mark a route active.

### FI-027 - navbar search consolidation

Navbar Product search stays visible; the adjacent Locator icon opens the separate geographic Locator workflow. Accepted at `a0fde73c58a554c58028c2220399e3ae1691121b`, with light-theme Locator hover correction at `c4b0f7e1108b40b2cb4f4b40f0ac95e2280d906c`. Product selection/popup belongs exclusively to Product search; Locator only navigates geographically. Recheck focus, Escape and contrast after navbar changes. [Search](../src/features/map/search/README.md) and [Locator](../src/features/map/locator/README.md).

### FI-028 - Scale hiding as an opt-in preference

Accepted at `fce91ee3ee54361f3a0fe79e3dd95c8c1905a718`. Scale hiding is Main-map Preferences state, OFF by default for missing/invalid persisted values. User choices and reset remain independent of source refresh and filters. Non-map routes do not expose the setting.

### FI-029 - unified popup action density

UI accepted at `dbc1466400d18b92d5589d8d7392bd27ae6be86c`. One compact icon-only row has Pause/Resume, Discard, Send/Accept and Tools. Preserve accessible labels, tooltips, disabled reasons, confirmation presentation, focus/Escape and active popup reconciliation. Package actions use existing verified gating; no non-package backend permission or route may be inferred from the common UI. This supersedes the earlier text-heavy Freeze/Export popup design, without changing the underlying legacy API contracts. [Popup documentation](../src/features/map/popups/README.md).

### FI-030 - loading completion and real-progress discovery

Deferred. A completed operation should be recognizable, but do not introduce fictional chunk progress or additional polling/retries to mask backend performance. Abort/supersession and `prefers-reduced-motion` remain authoritative; investigate backend progress separately before implementation.

### FI-031 - non-empty source startup invariant

Accepted at `c1ed794374e56383a7362f3eadb2d16b07dfdb17`. If a previously saved source selection restores to zero and an eligible persistable source exists, recover exactly one eligible source. Preserve deliberate in-session all-off, valid initial defaults and source-generation/persistence guards; do not force-enable a synthetic session-only source.

### FI-032 - Main-map workspace navigation

Accepted at `11491d15272b165b63da58dece83cb0c0776077b`. Main-map Dashboard/Analyze/Review launches open a new tab through the shared base-aware navigation policy; navigation between workspaces stays same-tab. Product Collection, popup Analyze links, keyboard modifiers and truthful blocked-popup feedback preserve route and map state.

### FI-033 - Dashboard visual compaction

Accepted at `01f22a605e8e4d29a8da187306af1dc04b8540ef`. Compact range toolbar and 30x30 icon-only Refresh retain accessible help and keyboard behavior. Last-successful `HH:MM` advances only on successful accepted Dashboard loads; invalid/failed/stale requests do not replace it.

### FI-034 - Dashboard automatic filtering

Accepted at `6a29ee5abee23b5ce741a69732d9f67ad805b95d`. Remove Apply. Committed valid filter/range changes update the results; incomplete time drafts such as `15:--` do **not** auto-complete or dispatch. Native time input, focus transitions, one logical request per commit, cursor reset, sort/page-size and last-successful-result retention remain intact.

### FI-035 - Analyze sidebar compaction

Accepted at `ec11aa1fdbd732eca651cdc2a265657405ec80f0`. Compact accessible Product picker/sidebar and shared neutral `pc-scrollbar`; retain source-aware targeted resolution, auto/manual freshness, independent failures and keyboard/focus behavior.

### FI-036 - Review sidebar compaction

Accepted at `9c07f8a7fb93cd80bbbab59a3d47719e3667863c`. Compact Product picker with anchored suggestion overlay; manual Refresh is in the `Products` header. Preserve existing Product and content-toggle state, source identity and scroll/focus handling.

### FI-037 - Review Product-content layout and empty states

Accepted at `ee37173e31525d990412b3dff7205ec5af4371e8`. History is the intentionally height-bounded scrolling content; IC-ENC and Validation bodies render at natural height so the Product column owns overflow. Differentiate unavailable, failed and empty states without inventing report results.

### FI-038 - Review content defaults and bulk toggles

Accepted at `54a3f89e83ad18c18875921f562f81c58b9d3d8d`. History, IC-ENC and Validation default enabled; per-content workspace bulk controls support checked/unchecked/indeterminate. Workspace-level intent is session-local and remains separate from per-Product overrides and Product enablement.

### FI-039 - incremental Review composition loading

Accepted at `1a77af904ec1a41726bcec357b72610c74e793ca`. A single Review Product session owns payload generations: add genuinely new Products, retain surviving payloads after removal/visibility changes, use full manual Refresh, and refresh only changed eligible Products from FI-022 observations. Superseded operations cannot publish. [Detailed lifecycle](fi-039-incremental-review.md).

### FI-040 - modifier-selection keyboard equivalent and discoverability

Accepted at `33f0089810b1ba8c8a053727e8828f5b519e66c9`. The existing map-focused Ctrl/Cmd+Enter equivalent and visible shortcut guidance must revalidate the current highlighted Product and respect public MapView keyboard events, selection generations and normal overlap/Collection behavior.

### FI-041 - preserve Review Product-list scroll position

Accepted with FI-036 at `9c07f8a7fb93cd80bbbab59a3d47719e3667863c`. Toggling History, IC-ENC or Validation must not reset Product-list scroll or steal focus. Preserve native interaction across rerenders.

### FI-042 - Filter panel scrollbar consistency

Accepted at `e235a15b6d86dc3c5313a4a151fa8c5146612a3a`. Reuse `pc-scrollbar` in Filter-panel scroll surfaces. Do not replace the filter draft/applied state, section ownership or existing overflow behavior.

### FI-043 - onboarding refresh after the UI/UX redesign

Implemented and developer-accepted at `9280c650` (with Back/Forward lifecycle correction accepted at `69b0d329`). Introduction is independently persisted per route, can be replayed from Preferences, skips missing targets safely and restores tour-owned panel/focus state. Its steps must reflect Product search versus Locator, shared Preferences, Dashboard and Analyze/Review content. Preserve [the detailed onboarding specification](fi-043-onboarding-refresh.md) during the separate [full demo smoke](demo-readiness-plan.md); acceptance of FI-043 does not imply a complete deployment verification.

### FI-044 - Preferences information architecture and usability

Accepted at `79616f8af0cda91db8e4b1fa90c0248aef4fef41`. Theme uses Light/Dark with sun/moon endpoints. Scale hiding is Main-map-only. Auto-save persists saved preferences; Reset is independent and restores the declarative defaults, including conservative Idle filter exclusion. Start introduction is a separate secondary action. [Verification contract](fi-044-verification.md).

## Cross-cutting UI rules

- **Source and context:** UI never chooses a backend contract based on displayed source name or guesses across S-57/S-101. Resolve stable Product/source identity and capabilities before rendering or invoking actions.
- **One lifecycle owner:** Each interaction has one authoritative generation owner. Do not publish stale status, filters, search results, route state or popup content after a newer action or teardown.
- **Focus and native controls:** Rerenders must preserve keyboard and native pointer input. Use accessible labels/help, visible focus, Escape/outside-click priority, public Calcite/ArcGIS contracts and light/dark tokens.
- **Truthful progress and errors:** Do not claim complete export, report availability, authorized dispatch or backend progress without authoritative evidence. Preserve independent workflow failure states and honest last-successful-result presentation.
- **Scope:** Product actions belong in popup, Product Collection and Analyzer/Reviewer remain separate workflows, and Product search/Locator have separate owners.

## Deferred experiment branch

Only after the demonstration baseline is accepted, evaluate SDK/Calcite updates, client-side Product labels/Linked Annotations, Sonda, browser testing with Vitest/Playwright, FeatureEffect and optional UI framework changes. This is an exploration queue, **not** an approved implementation scope in the current branch.

## Historical provenance

The older design matrix, original alternatives, detailed FI-021/FI-026–FI-044 implementation notes and acceptance descriptions were deliberately consolidated. Their original text remains retrievable from Git history before documentation-cleanup v2. Where a current feature README or tests differ from this summary, investigate the explicit task baseline rather than reconstructing behavior from historical tracker prose.
