# Product Catalogue architecture invariants

These are preservation rules for implementation and review, **not** a claim that every current code path was re-audited. Validate file-level details against the task's authoritative commit and feature documentation.

## Product identity, sources and data

1. **Source-aware identity:** A selected Product resolves through the registry and Product context. Stable identity must distinguish independent Product sources even when labels or names overlap. Never infer a source from a dataset-name pattern, title, layer name or popup DOM.
2. **Explicit capabilities:** UI visibility is not authorization. Verify capability, eligible Product state, current source metadata and current backend action projection before mutation. Unknown and inconsistent contexts fail closed.
3. **Source isolation:** Independent Product sources retain their own data, refresh and eligibility boundaries. A compatibility/mock source never becomes a fallback production dispatch path.
4. **Backend authority:** Product/job/candidate states, mutation restrictions and statuses originate from the backend. Do not synthesize a successful mutation, report artifact, authorization result or API contract.
5. **AOI state ownership:** Product-detail and popup reads may enrich the selected Product but must not silently replace authoritative AOI geometry/status. Any targeted status update uses the designated source-controller reconciliation path with current-state guards.

## Asynchronous lifecycle and interaction

6. **One owner per operation:** A logical user action must have one authoritative lifecycle/generation owner. Cancelled, replaced or disposed operations must not publish stale state or duplicate requests.
7. **Explicit teardown:** Watch handles, observers, listeners, timers, polling, pending requests and DOM-linked sessions require a defined owner and disposal path. Treat suspected leaks as hypotheses until verified against the current code.
8. **Popup action boundaries:** The common Pause/Resume, Discard, Send/Accept and Tools presentation does not grant backend permission. At the latest FI-029 acceptance, non-package Products have a shared visual layout, but mutation dispatch is not verified; keep controls disabled if there is no authoritative contract. Do not substitute legacy Freeze/Export/Cancel Export for the package workflow.
9. **Selection and focus:** Selection, Product Collection and tool actions always revalidate current Graphic/source identity. Rerenders preserve native focus/input, keyboard semantics, hover state, Escape behavior and existing tooltip ownership.
10. **Separate search workflows:** Product search resolves a Product to selection/popup. Locator searches places and moves the map; it must not create Product selection or marker/popup side effects as a shortcut.

## Workspace, UI and external effects

11. **Workflow isolation:** Analyze, Review, Timeline/History, Dashboard, Collection, filters and popup sessions retain their established state and refresh boundaries. A workflow cannot silently reuse another workflow's backend behavior.
12. **No imaginary artifacts:** Report links or downloads are enabled only when supported by a verified backend report identifier/URL/storage contract. Missing integration remains explicitly unavailable.
13. **Visual meaning:** Product status colors, mixed-member presentation, visibility filters and selection highlights must remain distinct. Do not use decorative effects that obscure authoritative states. Maintain light/dark and accessible contrast.
14. **Safe deployment:** `VITE_` values are public build inputs, never secrets. Development-only files and organization-specific branding must not be committed inadvertently. A neutral repository default is retained.
15. **Verification truth:** `npm run check` covers format/lint/tests/build; it is not a substitute for a browser demo smoke test or server-side validation. Claim only tests actually run or results reported by the developer.

## Change-control checklist

Before changing a contract, identify its authoritative owner, source dependencies, lifecycle/cleanup boundary, stale-request behavior, failure mode, tests and documentation. Preserve the accepted behavior unless the task explicitly changes it. Mark unverified assumptions as such and ask for baseline-specific files when they are unavailable.
