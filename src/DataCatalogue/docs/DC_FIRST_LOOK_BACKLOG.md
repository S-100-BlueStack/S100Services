# DataCatalogue first-look feedback and outstanding work

> **Latest update (2026-11-25):** The user accepted the Package Details overlay
> in commit `6342966632af3774d336b6f7e7d4e85ac0a51cf9`. The individual Package
> history design preview was accepted in commit
> `c4c1dfcbebdb7dd689cf8edf560ddab971786a62`. TIMELINE-02 was accepted and
> committed at `d453900ffe342354aaf52a628f0b085fd905d6e7`; the left Details shows
> committed Package/binding events. TIMELINE-03 adds Windows actor attribution
> (candidate). History retention follows the event store; no separate durable
> history task. Optional AD profile enrichment remains a follow-up.
> The right panel
> remains dedicated to metadata. `DC-MAP-LABEL` was accepted with scale limits
> of 1:5,000,000 for Workspaces and 1:3,000,000 for Packages in user-reported
> commit `26472a59188f61eed632c59abc0e59d2a06e64e9`. `DC-PACKAGE-QC-01` now
> has an accepted design-only frontend preview in user-reported commit
> `d038defa009814f60e6c25c660f232a2dce6a722`, merged at
> `d91b54b2a0cbe1ff00a60f483a5f0f39f5d3a3fc`. Functional filtering remains
> backend-dependent. See the current QC tracker entry. The live UI now uses
> Workstream / Workstreams for Pipeline; Workspaces remain distinct. Earlier
> wording below is historical or refers to technical Pipeline contracts.
>
> **Planning update (2026-11-24):** The user reports acceptance and commit of the
> Main Map Workspace popup (`a7bd819d46da1e22fcd5dd7036bfc80631a20a91`) and
> previously accepted the map legend/saved-match changes. The popup candidate
> status and earlier suggested execution order below are retained as historical
> context, not the latest priority list. See the `DC-MEETING-02` section of
> [PROJECT_TRACKER.md](PROJECT_TRACKER.md) for accepted status, the recommended
> next Package Details panel, individual Package history, Compilation/QC, and
> the remaining open preview and historical discovery work.

**Recorded:** 2026-11-23 (date of feedback capture; the internal demo date is not confirmed)  
**Accepted frontend baseline reported by user:** `50b12afaee6d26e7fd0b58b06d31687cbaad6c8d`  
**Status:** Planning source; `DC-MAP-POLISH-01` v3 adjusts saved Workspace
symbols after browser feedback. The Assignment legend layout is accepted and
Main Map legend is usable for now. Preview and history remain open.  
**Application:** `src/DataCatalogue`

## Scope and confirmed decisions

This backlog records feedback from the internal first-look demo without changing
accepted behavior or defining an undocumented backend API.

- `DC-ASSIGN-AUTOMATCH` is accepted, locally tested and committed in the reported
  baseline. The saved Package/Pipeline bindings provide authoritative automatic
  Workspace matches; manual Workspace inclusion/exclusion is **not** in scope.
- `DC-PERF-03` is closed without another frontend performance change. The
  earlier combined Workspace overview optimization remains accepted.
- The generalized Package AOI, detailed Package Feature geometry, and
  Pipeline-scoped Workspace coverage are **different kinds of geography**.
  Their display and legend must not imply that they are interchangeable.
- Main Map's former Pipelines panel is removed. Restoring its legend does **not**
  justify restoring a second Pipeline visibility/selection owner; current Work
  Scope remains authoritative.
- Historical Package discovery is distinct from temporary per-context Job
  statuses (`Done` / `No update`). The existing API has not been verified to
  provide a durable historical Package search or completed-Job history feed.

## DC-MAP-POPUP-05 - Main Map Workspace popup (candidate, 2026-11-24)

The Workspace popup is rebuilt from the current committed DataCatalogue
baseline with the verified ProductCatalogue popup layout as reference. The
SDK owns a single native title and close button. The application owns only
the flat action and information content. The visual lock state `unlock`/`None`
is an explicit placeholder; `Take workspace` is disabled until `OWNER-01` gains
an authoritative backend contract. Workspace header colors come from the
existing legend palette; the compatibility adapter for the native header is
isolated and requires real ArcGIS 5.2.1 visual verification before acceptance.
This candidate does not complete the separate Workspace-label task.

## First-look follow-ups

Priority is a **recommended implementation order**, not a severity claim.
Status is **Open / not implemented** unless a later, source-verified candidate is
identified below. Candidate is not the same as browser acceptance.

| Order | ID                           | User need                                                                                                                  | Dependency                                                                                 | Suggested scope                                                  |
| ----- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 1     | `DC-ASSIGN-MAP-SYMBOLS-01`   | Separate detailed Package AOI/Features visually from Workspace coverage; correct misleading `Saved Workspaces` legend text | Candidate updates Workspace style; exact Package renderer source and browser check pending | `DC-MAP-POLISH-01` candidate                                     |
| 2     | `DC-MAP-LEGEND-01`           | Restore the Workspace-color legend lost when the Pipelines panel was removed                                               | Existing Main Map count-to-color rules and Work Scope                                      | `DC-MAP-POLISH-01` candidate; browser check pending              |
| 3     | `DC-ASSIGN-LEGEND-01`        | Make the Package Assignment map legend easier to notice/read, while allowing it to collapse as users gain familiarity      | Existing legend layout, accessibility and presentation state                               | `DC-MAP-POLISH-01` candidate; browser check pending              |
| 4     | `DC-ASSIGN-MATCH-PREVIEW-01` | Show prospective automatic Workspace matches, including on the map, when adding an unsaved Pipeline binding                | Verify an authorized, read-only backend preview calculation/contract                       | API analysis first; frontend after contract confirmation         |
| 5     | `DC-PACKAGE-HISTORY-01`      | Provide a low-prominence way to find older/historical Packages                                                             | Define historical lifecycle and verify server-side search, paging and authorization        | API/product decision first; frontend after contract confirmation |

### Candidate update — DC-MAP-POLISH-01 (2026-11-23)

The first three items have a focused **frontend candidate**. The Assignment
legend's expanded/collapsible layout is accepted after local browser testing.
The Main Map legend is usable, but its size/placement may warrant a later
minor adjustment. v3 corrects the assignment-map symbol semantics: **saved**
auto-matched Workspace polygons use **solid orange** outlines; **new predicted**
matches _before Save_ should use **gray dashed** outlines only when an
authoritative read-only preview is available. v2 incorrectly applied a neutral
dotted symbol to saved matches. There is no active preview implementation or
verified preview API; `DC-ASSIGN-MATCH-PREVIEW-01` remains open. The exported
baseline omitted `src/features/map/packages/**`, so Package AOI/detail renderers
remain unchanged and require source-level parity verification. Package history
remains open as a separate backend-dependent task.

### DC-ASSIGN-MAP-SYMBOLS-01 — Map semantics and distinct symbology

**Observed:** Detailed Package AOI/geometry currently resembles Workspace
coverage, while legend wording includes `Saved Workspaces` and does not clearly
explain the displayed data.

**Requirements / acceptance:**

1. Inspect the actual layer/Graphic construction, visibility and symbol ownership
   on the Package Assignment map before choosing symbol changes.
2. Distinguish the generalized Package AOI, detailed Features (point, line,
   surface as applicable), and Workspace polygons using more than color alone
   (e.g. stroke pattern, outline/fill treatment or marker shape).
3. Use accurate, concise English legend labels for the **geography actually
   drawn**. Current auto-matched Workspaces come from saved Package-Pipeline
   bindings and use a solid orange outline; prospective matches before Save
   should use gray dashed outlines only when the backend supplies a verified
   read-only preview. Never imply that a Workspace itself is manually saved.
4. Preserve selected Package focus, background Workspace coverage, light/dark
   contrast, projection handling, and MapView/layer lifecycle.
5. Test with overlapping AOI/Workspace geometries and different detail geometry
   types. No fake geometry or additional unverified backend endpoint.

**Boundary:** Cosmetic semantics only. Prospective, unsaved matches belong to
`DC-ASSIGN-MATCH-PREVIEW-01`, not this item.

### DC-MAP-LEGEND-01 — Restore the Workspace-color legend

**Observed:** Main Map still colors Workspace geography, but the color legend
was removed with the former Pipelines panel.

**Requirements / acceptance:**

1. Restore an unobtrusive, legible, map-associated Workspace legend without
   reinstating the deleted Pipelines panel or competing Work Scope inputs.
2. Derive swatches, thresholds and labels from the **actual existing** count-to-
   color rules. Do not invent color thresholds or represent mock Job statuses as
   persisted backend state.
3. Explain zero/unknown/active-count display states only if the renderer
   actually distinguishes them; remain consistent with `Show empty Workspaces`.
4. Use readable text in addition to color, maintain light/dark themes, keyboard
   and screen-reader access, and avoid obstructing map controls.
5. Confirm that changing Work Scope, Job status and theme updates the legend
   consistently without initiating additional Workspace API reads.

### DC-ASSIGN-LEGEND-01 — Prominent, collapsible assignment-map legend

**Observed:** The Package Assignment legend beneath the map is too easy to
miss, especially for a first-time user, but becomes less valuable with use.

**Requirements / acceptance:**

1. Increase initial discoverability/readability with restrained desktop-first
   sizing, spacing, contrast and a clear accessible heading.
2. Provide a compact expand/collapse action; initially expanded is the proposed
   default, to be confirmed in the implementation task. A collapsed state must
   retain a recognizable affordance and not consume excessive map height.
3. Prefer an accessible native disclosure or a supported public Calcite
   component. Respect keyboard focus, rerenders and `prefers-reduced-motion`.
4. Decide whether the user's collapse preference should persist only after
   checking existing Preferences/storage conventions. Do not silently introduce
   another global persistence key.
5. Keep legend text aligned with `DC-ASSIGN-MAP-SYMBOLS-01` and any future
   prospective-match overlay, without suggesting unsaved matches are saved.

### DC-ASSIGN-MATCH-PREVIEW-01 — Read-only prospective auto-matches

**Observed:** When an additional Pipeline (for example ENC) is checked in
Package Assignment, the page currently shows only **saved** automatic matches.
The user wants to see the newly predicted Workspace intersections on the map
**before Save**, ideally as neutral gray dashed geometry.

**Requirements / acceptance:**

1. A newly checked Pipeline can show a clearly named **read-only preview** of
   its predicted automatic Workspace intersections, independently from saved
   Pipeline/Workspace bindings. Keep the Pipeline checkbox as the only editable
   binding control; never revive manual Workspace checkboxes.
2. Preview only if a verified, authorized backend read can calculate the
   authoritative intersection for the current Package, its current AOI and the
   proposed Pipeline **without mutating persisted assignments**. Do not invent
   an API route or infer exact server results from visually overlapping polygons.
3. Distinguish prospective geometry using a neutral dashed treatment and
   appropriate legend text; saved coverage remains visually identifiable.
4. Cancel, uncheck, Package switch, newer preview request, navigation, and
   destruction must invalidate stale previews. A failed/unavailable preview
   shows an honest unavailable state without publishing false matches.
5. On Save, reconcile the real saved binding read and replace the preview with
   authoritative saved matches. An uncertain Save must not present a preview as
   confirmed membership. No duplicate logical requests per user action.

**Backend decision required:** Inspect existing read-only APIs first. If none
provides this calculation, agree on a minimal preview read contract with the
backend owner, including input identity/AOI version, Pipeline scope, geometry,
authorization, staleness, error and result semantics. No backend implementation
is authorized by this backlog entry.

### DC-PACKAGE-HISTORY-01 — Low-prominence historical Package discovery

**Observed:** Users need a way to retrieve older Packages without making
history a prominent part of the daily Package browsing UI.

**Requirements / acceptance:**

1. Define what counts as an older/historical Package (archived, inactive,
   completed, or an actual Package version). Do not assume a temporary Job
   `Done` / `No update` status is durable Package history.
2. Verify whether current authorized Package listing supports the required
   server-side historical filter/search, total/page consistency, sort order,
   identity and details/geometry access. If not, record the precise backend gap.
3. Once an API is confirmed, offer a compact, secondary entry point (e.g.
   advanced filter or `History` action) that does not dominate the normal list.
4. Support genuine server-side pagination and visible empty/error/retry states.
   Avoid client-only search over the currently loaded active Package page.
5. Preserve current Package assignment, selection, status and deep-link behavior.
   Historical records must be read-only unless separate authorized mutations
   and lifecycle rules are explicitly confirmed.

**Backend decision required:** Agree Package retention/lifecycle, historical
query identity, authorized readback, filters and pagination with the API owner.
This is separate from long-term Job status persistence (`JOB-01`) unless the
backend explicitly defines a shared lifecycle.

## Other previously recorded open work (not new first-look findings)

These are carried over as **known deferred topics** from the earlier tracker and
backend-gap register. They must be revalidated against the source of the next
implementation baseline before work begins; older candidate text is not an
up-to-date implementation status claim.

| ID / topic                             | Next action                                                                                               | Current planning classification                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `DC-MAP-POPUP`                         | Design and implement useful Workspace popup context using existing public ArcGIS APIs and verified fields | Frontend investigation, then implementation                           |
| `DC-MAP-LABEL`                         | Accepted label visibility and scales; revisit only on new feedback                                        | Accepted (`26472a59`); complete                                       |
| `DC-PACKAGE-QC-01`                     | Agree authoritative workflow and filter contract before functional QC filtering                           | Preview accepted (`d038defa`); backend-dependent functional filtering |
| `PAGE-01` global Package search        | Confirm server-side title/ID/details filtering across paginated results                                   | Backend contract gap                                                  |
| `JOB-01` durable status/history        | Define persistence for contextual Job status and completion history; do not reuse temporary demo state    | Backend design gap                                                    |
| `COMMENT-01` binding comments          | Agree authorized persistence/readback contract for Pipeline binding comments                              | Backend contract gap                                                  |
| `BIND-02` assignment concurrency       | Define version/precondition or idempotent desired-set semantics for concurrent assignment updates         | Backend contract gap                                                  |
| `OWNER-01` Workspace ownership/locking | Design ownership and authorization separately from Package workflow status                                | Deferred cross-stack work                                             |
| `DC-CREATOR-EDITOR`                    | Separate Package creation/editing and AOI drawing workflow after verified mutation contracts              | Larger future phase                                                   |
| `DC-INTEGRATIONS`                      | Define identifiers, authorization and target actions for Notice to Mariners and WorkZone                  | Larger future phase                                                   |
| `DC-UX-LOADER-01`                      | Reassess startup-loader value after accepted performance work and real deployment measurements            | Low-priority reassessment; do not reopen performance work by default  |

## Suggested execution sequence

1. Implement `DC-ASSIGN-MAP-SYMBOLS-01`, then `DC-MAP-LEGEND-01` and
   `DC-ASSIGN-LEGEND-01`. A coordinated **map legend and symbology** candidate
   could combine these after inspecting the latest shared map component code;
   keep separate acceptance tests so regressions are easy to isolate.
2. Revisit `DC-MAP-POPUP` and `DC-MAP-LABEL` with controlled map screenshots and
   real geometry; popups are usually the smaller, clearer next increment.
3. Investigate the existing backend options for
   `DC-ASSIGN-MATCH-PREVIEW-01` and `DC-PACKAGE-HISTORY-01` independently; do
   not block frontend-only map work on their API decisions.
4. Prioritize the remaining backend-dependent workflows through the product
   roadmap rather than bundling them into a UI-polish candidate.

## Verification when these items are selected

For each frontend implementation: use the explicitly selected baseline, inspect
root/app `AGENTS.md` and the current relevant map/service files, run available
focused tests and the local `npm run check`, validate both themes, keyboard and
screen reader names, real geometries, rapid selection/teardown and authenticated
browser behavior. Keep Package/Pipeline/Workspace/Job identities separate. Do not
modify API contracts, authentication, or backend projects without a specific
follow-up task.
