# Feature-to-Workspace Assignment Scope

Status: Accepted scope; runtime implementation Not started.

This document records the accepted DataCatalogue scoping decisions. The frontend rename is a separate prerequisite. None of the assignment-page behavior described here is implemented by the rename candidate.

Task status belongs in [PROJECT_TRACKER.md](PROJECT_TRACKER.md). Source boundaries and unresolved API questions belong in [BACKEND_CONTRACTS.md](BACKEND_CONTRACTS.md).

## 1. Purpose and delivery boundary

Add a separate page, accessible from the navbar, for manually assessing incoming Features and assigning them to Workspaces.

The existing main map with Jobs remains available and retains its existing behavior. Work-area locking, authoritative spatial relations and per-ENC completion are later workflows, not additions to this first page.

The colleague owns the APIs. Do not modify API implementations, project names, authentication or contracts as part of frontend development without a separate agreement.

## 2. Domain distinctions

| Concept   | Meaning                                                                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feature   | One geographic object. Package API splits incoming ZIP packages into independently assessed Features. The frontend does not unpack packages.                   |
| Workspace | A generic system, database, table or subset of a system. Geography is optional.                                                                                |
| Work area | A geographic AOI spanning Workspaces. It is not a Workspace or an ENC cell. Future work-area locking belongs to the main-map workflow.                         |
| ENC       | An individual chart cell that may require an update. One Feature may affect multiple cells; future completion must be tracked independently per affected cell. |
| Job       | The user-facing name for work in the existing main-map workflow. Do not replace this term with Features, Tasks or DataCatalogue.                               |

A Feature may be assigned to multiple Workspaces, and each Workspace may have multiple Features. Geographic overlap supports the user's assessment but never restricts Workspace selection or creates an assignment automatically.

Do not infer that a Workspace is one polygon, one map layer or one ENC cell.

## 3. Initial Feature data

Use two geographic mock types, `NM` and `KP`. Do not implement pixel data in the first prototype.

Mock display names follow `NM26nnnn` and `KP26nnnn`, where `nnnn` is a sequential four-digit number. Examples are `NM260001` and `KP260001`. The fixture year is explicitly 26; this is not a universal backend validation rule.

Keep stable internal identity, display name, Type and any original source identifier separate. Type filtering must consume a normalized Type value instead of making the mock naming pattern a permanent data contract.

The notice-like read-only information model contains:

| UI label        | Meaning                                                                         |
| --------------- | ------------------------------------------------------------------------------- |
| ID              | Source or display identifier, distinct from internal identity where applicable. |
| Title           | Source title.                                                                   |
| References      | References to earlier notices.                                                  |
| Details         | Free text that may include an effective period and positions.                   |
| Nautical charts | Charts in which the information is published.                                   |
| Publication     | Publication information.                                                        |

Some Features, including KP examples, do not provide all these fields. Missing optional information must not prevent selection, mapping or assignment.

Preserve the source language and meaningful text formatting. English UI labels do not require translating source content. Treat imported details as text, not trusted executable HTML.

The geographic object comes from structured geometry; do not derive operational geometry by parsing positions in Details.

## 4. Workspace catalogue and layer bindings

For the initial test, use five independent selectable Workspaces:

| Workspace | User-specified map layer |
| --------- | ------------------------ |
| DK1       | 4                        |
| DK2       | 5                        |
| DK3       | 6                        |
| DK4       | 7                        |
| DK5       | 8                        |

These are the requested bindings for the configured ArcGIS map service. Layer fields, geometry, capabilities, authentication and browser access still need verification. Do not put the private service URL or credentials in repository documentation or fixtures.

The future catalogue may group DK1-3 and DK4-5 into two Workspaces. Design source bindings to support multiple layers per Workspace without changing assignment identity or the UI's basic model. The grouping is a possible future configuration, not an implementation in the first prototype.

Also support Workspaces without geometry. Do not hardcode five as a domain limit or force every Workspace to expose a map layer.

## 5. Four-panel desktop layout

Use the accepted sketch as the starting point:

| Position    | Surface                                                                   |
| ----------- | ------------------------------------------------------------------------- |
| Upper left  | Feature filters and list.                                                 |
| Lower left  | Read-only information for the selected Feature.                           |
| Upper right | Workspace assignments, new comments and comment history.                  |
| Lower right | Simple ArcGIS/Calcite map for the selected Feature and Workspace context. |

Keep the navbar and map in place while the list, information and assignment content scroll independently. The map occupies approximately one quarter of the page, subject to usable laptop heights.

Desktop and laptop browsers are the supported target. Mobile is not a delivery requirement.

Do not automatically select the first Feature. Until selection, show explicit empty states. Make the selected Feature identity clear across the list, information and assignment panels.

Use a compact Workspace overview with expandable comment history. Keep Save and navigation protection usable while the Workspace area scrolls.

## 6. List capacity and filtering

The Feature list must support thousands of entries, and the Workspace catalogue must not have an arbitrary business limit.

Initial Feature filters:

- Type: `NM` and `KP`.
- Status: `Assigned` and `Not assigned`.
- Free-text search in the Feature display name.

Use bounded rendering and a paged service interface rather than loading or mounting an unlimited list of rows. The mock adapter should exercise the same query boundary that a future remote source can implement.

Provide a searchable Workspace selector with bounded results. Existing selections and unsaved assignment changes must not disappear when the user searches or pages through available Workspaces.

## 7. Assignment status and edit boundary

`Not assigned` means zero active Workspace assignments. `Assigned` means one or more active Workspace assignments.

Use red/green as supplementary status cues alongside text or another accessible indicator. Assigned does not mean fully assessed, reviewed, updated or completed.

Do not add a separate assessment-completion status in the first prototype. A Feature assessed as relevant to no Workspaces therefore remains Not assigned. This is an explicit first-version limitation.

Only assignments and new comments are editable. Features, geometry, Workspace definitions and work areas are read-only on this page.

## 8. Comments and retained history

Comments are optional for every assignment. Multiple comments may be added to a Feature/Workspace connection.

New, unsaved comments are drafts. After Save succeeds, comments cannot be edited or deleted in the first version. Display a mock author and timestamp; do not add an authentication flow to produce them.

Use an isolated, provisional history model in the mock adapter:

- Removing an assignment preserves its comment history and keeps that history readable.
- Reassigning to another Workspace creates a separate connection. Old comments stay associated with the original Workspace.
- Recreating a connection to the same Workspace exposes its previous history alongside new comments.
- Adding or changing a connection allows an optional new comment for the relevant Workspace.

Final API ownership, identifiers, history retention and removal semantics remain unresolved. The mock model must not be presented as an agreed backend schema.

## 9. Save, selection and failure behavior

Save assignment changes and new comments explicitly with `Save` for the selected Feature.

Protect dirty drafts when changing Feature selection, navigating away, resetting mock data or leaving/reloading the page. In-app navigation should offer Save, Discard and Cancel. Browser unload protection uses the browser's supported mechanism, not a promise of a custom unload dialog.

Do not lose dirty selections merely because a list filter or page changes. Resolve the dirty state before replacing the editing context.

A failed save leaves the draft available for retry and does not show a success state. A successful save updates the committed assignment status and comment history together from the mock service result.

If saving makes the selected Feature no longer match the active list filter, keep its details visible rather than automatically selecting another Feature. Explain the filtered-out state where needed.

Only explicitly saved changes persist across reload. Reset restores the original fixture state and clears only this prototype's mock data, not unrelated app preferences or browser storage.

## 10. Mock service behavior

Use one mock user with full access and no login page.

Simulate reads, loading, latency, assignment changes, comment additions and controllable read/save failures. Keep controls deterministic enough to reproduce error flows during testing.

Persist saved prototype data locally using a versioned, isolated storage key. Recover predictably from invalid persisted mock data and expose a clear `Reset mock data` action.

Do not mix this persistence with the existing Jobs mock backend. The existing cyclic Job creation behavior is retained independently.

UI components must consume service functions and normalized models, not import fixture arrays, read storage directly or choose API adapters.

## 11. Live ArcGIS test integration

Live service access directly from the browser is a requirement for the first assignment-page test. Local synthetic Workspace geometry is not an accepted replacement.

The map shows linked and unlinked Workspace context and visually distinguishes assignments. It permits normal map navigation and zoom, but no popups or editing. Focus the selected Feature when selection changes; do not reset zoom after assignment or comment edits.

Isolate direct browser access behind a replaceable map-source/authentication boundary. Verify layer metadata, HTTPS access, CORS, authentication, token expiry and cancellations before declaring live integration ready.

If interactive ArcGIS authentication is needed for testing, establish it at runtime. Do not embed a shared password or token in source, `VITE_*` values, built assets, URLs committed to the repository, localStorage, sessionStorage or exported mock data. A browser-held runtime token is visible to that browser and is only a temporary test approach.

Report loading/authentication/service failures explicitly. Do not silently switch to mock geography or report a live layer as loaded when it failed.

The later production integration will move service-account access and Microsoft AD identity/authorization behind the backend. The rename candidate implements neither the live test integration nor that backend boundary.

## 12. Source ownership and deferred work

Expected, but not verified, source ownership:

- Features: Package API.
- Workspaces and work areas: Workspace API.
- Assignments and comments: ownership undecided.

Do not invent routes, payloads, pagination rules or auth contracts before the actual API inputs are supplied.

Deferred: API adapters, server-mediated ArcGIS access, AD authorization, concurrent-edit conflict handling, work-area locking, per-ENC completion, pixel data, automated ingestion/assignment and possible editing of saved comments.

A future affected-ENC workflow must represent partial completion, for example ENC 1-3 updated while ENC 4 still needs work. That state is separate from the first prototype's Assigned/Not assigned indicator.

## 13. Prototype acceptance checks

Verify explicit selection and all four panels on normal and low-height laptop viewports; Type/Status/name filters; bounded long lists; Workspace search with preserved selections; optional and multiple comments; removal/recreation with retained history; dirty navigation and reset protection; failed-save retry; reload persistence; and reset.

Verify live DK1-DK5 context, selection-driven map focus without edit-driven zoom resets, no popups, no overlap-based restrictions, Workspace entries without geometry, dark/light mode, accessible controls and useful failure notices.

Re-run existing Jobs/AOI map, popup, clustering, filtering, refresh and panel flows. New assignment-page work must not silently replace their domain state or startup ownership.
