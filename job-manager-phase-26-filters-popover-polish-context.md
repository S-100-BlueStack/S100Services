# Job Manager Phase 26 Filters popover polish context


---

## Repository metadata

```
0a417970e63d38aa3e92174c291ea51218c4fa8d
?? job-manager-phase-26-filters-popover-polish-context.md
```

---

## src/JobManager/docs/PROJECT_TRACKER.md

```
# Job Manager Project Tracker

This document is the source of truth for Job Manager project goals, requirements, architecture decisions, folder structure, implementation order, open questions and progress.

Keep this document updated when requirements, technical decisions, backend assumptions or implementation status change.

## 1. Project summary

Job Manager is an ArcGIS/Vite frontend app for working with Areas of Interest and the Jobs that affect them.

The core workflow is to start from Areas of Interest instead of starting from individual corrections. Users should be able to quickly identify which Areas of Interest have active Jobs, inspect those Jobs, update simple Job status, and switch between geographic map-based work and list-based Job work.

Job Manager lives in the same repository as Product Manager:

```txt
S100Services/
  src/
    ProductManager/
    JobManager/
```

Job Manager should follow Product Manager patterns where they fit, but the domain model must be Jobs and Areas of Interest.

## 2. Current project status

Status: Phase 25 UI polish complete; next polish target selection ready

Current known baseline:

- `JobManager` project exists under `src`.
- Vite dev server works.
- `npm run rdy` is the preferred local readiness command because it formats, lints, tests, builds and then starts the dev server.
- Calcite stylesheet import uses `@esri/calcite-components/main.css`.
- ArcGIS Maps SDK theme CSS is switched at runtime between light and dark mode.
- Package versions are aligned with the current Product Manager major-version baseline.
- Feature-based folder structure is in place.
- Jobs are loaded through a mock backend hidden behind services.
- ArcGIS Map/MapView lifecycle is isolated under `features/map/core`.
- AOIs are displayed through an ArcGIS FeatureLayer from runtime configuration.
- Current AOI field mapping uses the test Feature Service and is not final backend contract.
- Jobs are displayed on the map through read-only client-side point and polygon FeatureLayers.
- Jobs panel starts closed and can be opened from the navbar, AOI popup flow or Job popup flow.
- Shared Job filters affect both the Jobs panel and map Job layers.
- Done Jobs are hidden by default and can be shown with the explicit `Done` status filter.
- AOI popup content shows related Job summary counts.
- AOI `Show related Jobs` opens the Jobs panel, highlights the selected AOI and scopes map Job layers to related Jobs.
- Selecting a Job highlights the Job geometry and related AOIs.
- Job point clustering is implemented with count, priority pie and priority group modes.
- Job cluster picker is implemented for point clusters.
- Hover feedback supports Jobs and AOIs and clears reliably when the pointer leaves the map.
- Jobs panel supports a dedicated Job details mode in addition to list mode.
- Job details mode has sticky panel navigation, sticky selected Job context, status mutation controls and read-only Job metadata.
- AOI overview filters are available from the Filters popover and can filter AOIs by visible Jobs, active Jobs and high-priority Jobs.
- AOI overview controls use compact button groups, a stable active-filter summary, section header hover hints and a dedicated `Clear AOI overview` action.
- Global `Clear filters` is available from the Filters popover header and clears both Job filters and AOI overview filtering.
- AOI overview map filtering surfaces a map warning when the active overview produces no matching AOIs or when relation ids are incompatible with the current AOI service identifier field.
- Job status mutations now sync map Job layers, AOI renderer summaries and active map scope/highlight state without requiring manual refresh.
- Job service now uses an explicit adapter boundary. The mock backend remains the default adapter, and a future HTTP adapter seam exists without introducing endpoint or auth assumptions.
- AOI service readiness has been reviewed after the Job service adapter work. AOI FeatureLayer ownership remains the right current approach, and canonical queried AOI state remains deferred until final AOI service inputs are known.
- Phase 20 adds regression tests for Job service adapter boundaries, Job store mutation metadata, AOI readiness validation and AOI overview fallback/no-match behavior without changing runtime behavior.
- Startup stage coordination is now isolated behind a startup controller with regression tests for stage order, retry reuse and invalid Jobs load results.
- Map refresh and selection restore coordination is now isolated behind a map sync coordinator with regression tests for manual refresh, mutation sync, selected AOI restore, selected Job restore and stale refresh guards.
- Cluster picker popup state detection is more robust when Job filters, AOI-scoped Job map filters, cluster settings or refreshed Job data change while a cluster popup is open.
- Job popup lifecycle is now coordinated with selected-Job panel context so normal Job popups can stay open while details are used, but close when the selected-Job context is left.
- Jobs overlay layout now fills the map workspace height without leaving a bottom gap in list or details mode.

Current known limitations:

- AOI renderer enrichment is still asynchronous after filter changes, but mutation-driven AOI renderer flashing has been fixed.
- AOI overview filtering can only apply destructive AOI layer filtering when relation AOI ids are compatible with the current provisional AOI `GlobalID` field.
- AOI clustering or AOI cluster-like overview is still deferred until real AOI geometry density and shape are confirmed.
- Job polygon clustering is deferred because centroid-based clustering could hide real polygon footprint.
- Final AOI Feature Service fields, auth requirements, geometry characteristics and backend relation ownership remain unconfirmed.

## 3. Product principles

### 3.1 Primary goal

Make it difficult to miss Areas of Interest that require work.

The user should be able to:

- open the app and understand where Jobs exist geographically
- quickly filter to AOIs with active Jobs
- inspect an AOI and see related Jobs
- inspect a Job and see related AOIs
- update simple Job status
- use either the map or a Job list depending on workflow

### 3.2 What Job Manager is not

Job Manager is not intended to become a heavy case-management system.

Avoid adding complex workflow unless it becomes an explicit requirement.

Jobs should remain simple:

- created date
- optional deadline
- priority
- status
- related AOIs
- simple status buttons

### 3.3 User-facing language

All app text must be English.

Use the user-facing term `Jobs`.

Do not use these as app labels:

- Tasks
- Opgaver
- Corrections, unless a later requirement explicitly introduces it as a different domain concept

Danish can be used in internal planning conversations, but not in app UI.

## 4. Core domain concepts

## 4.1 Area of Interest

An Area of Interest, abbreviated AOI, represents a geographic area defined through an ArcGIS/Esri Feature Service.

AOIs are expected to be polygons unless the actual Feature Service proves otherwise.

AOI responsibilities:

- load from ArcGIS/Esri Feature Service
- display on the map
- support hover/selection feedback
- support popup
- show related Jobs
- support filtering
- participate in clustering or cluster-like overview
- support navigation from AOI to related Jobs

Important constraint:

AOI geometry and AOI clustering must be treated carefully. If AOIs are large or irregular polygons, clustering the polygons directly may misrepresent the work distribution. The implementation should support using an AOI display layer and a separate derived cluster layer if needed.

## 4.2 Job

A Job is a simple work item that can affect one or more AOIs.

Minimum Job fields:

```txt
id
title
summary or description
createdAt
deadline
priority
status
relatedAoiIds
```

Initial priority values:

```txt
Low
Medium
High
```

Initial status values:

```txt
To do
In Progress
Done
```

Suggested internal enum values:

```txt
todo
inProgress
done
```

Use stable internal values and map them to user-facing labels in UI/domain helpers.

## 4.3 AOI/Job relationship

A Job may affect one or more AOIs.

An AOI may have zero or more Jobs.

The final backend responsibility is not decided yet. The relation may be:

- returned directly by backend
- calculated by backend using geometry
- temporarily calculated by frontend
- temporarily mocked

Architecture rule:

UI must not know whether AOI/Job relations came from mock data, frontend spatial calculation or backend relation data.

Use a relation service/domain layer.

## 5. Functional requirements

## 5.1 Map

The map must support:

- ArcGIS Maps SDK for JavaScript
- AOI Feature Service loading
- AOI display
- AOI hover feedback
- AOI selection feedback
- AOI popup
- clustered or cluster-like overview
- filtering
- quick filters
- filtering AOIs by selected Job
- clear loading states
- clear empty states
- clear error states

## 5.2 Clustering and geographic overview

The app must help users quickly identify areas with many Jobs.

Initial clustering/overview requirements:

- show AOIs with related Jobs
- visually distinguish AOIs with active Jobs
- visually distinguish high-priority Jobs where possible
- support zooming from overview to individual AOIs
- avoid misleading polygon clustering

Preferred initial direction:

- display actual AOI polygons for detailed spatial context
- consider a derived AOI centroid/representative-point layer for clustering
- keep cluster configuration isolated in `features/map/layers`
- keep cluster business meaning isolated in domain helpers
- disable clustering or change representation when zoomed in enough to inspect AOIs directly

Open issue:

The correct cluster strategy depends on actual AOI geometry size, shape and density.

## 5.3 Filters

The app must support shared filters used by both map and list where possible.

Initial filters:

- AOIs with Jobs
- AOIs with active Jobs
- AOIs with high-priority Jobs
- Jobs by status
- Jobs by priority
- Jobs due soon
- Jobs without deadline
- AOIs affected by selected Job

Filtering principles:

- filters should be represented as state, not scattered DOM logic
- filter predicates should live in domain/service utilities
- map and list should consume the same filter state
- quick filters should be easy to extend

## 5.4 AOI popup

AOI popup must show:

- AOI name or display identifier
- AOI metadata needed for user recognition
- related Job count
- active Job count
- high-priority Job count, if available
- action to open related Jobs
- action to filter or focus related Jobs, if useful

The AOI popup should follow the Product Manager pattern of custom popup UI/actions where appropriate.

Avoid locking the app into Esri default popup actions if custom actions give better control and consistency.

## 5.5 Job list

The app must include a Job list view/panel.

The Job list must show:

- title
- status
- priority
- created date
- deadline, if set
- related AOI count
- clear loading/error/empty states

The Job list should support:

- selecting a Job
- changing Job status
- filtering by status
- filtering by priority
- focusing/filtering the map to AOIs affected by the selected Job
- opening related AOI information where practical

## 5.6 Job details

Job details should show:

- title
- summary or description
- created date
- deadline
- status
- priority
- related AOIs
- mutation state if status update is running
- clear error feedback if update fails

Do not add heavy editing forms unless required later.

## 5.7 Job status mutations

Users must be able to change status using simple buttons:

- To do
- In Progress
- Done

Mutation behavior:

- show per-Job loading state
- prevent duplicate mutation clicks for the same Job
- show success notice
- show failure notice
- preserve user context after mutation
- allow mock backend failures to surface in UI

## 5.8 Cyclic mock work

The mock backend must simulate cyclic work.

When a Job is marked `Done`, the mock backend should sometimes create a new Job.

This behavior must be:

- isolated in mock backend/service code
- visible through a user-facing notice
- deterministic enough for development if seeded mode is later added
- easy to disable or tune

## 5.9 Notices

Notices must be used for important user-visible outcomes:

- Job status updated
- Job status update failed
- new mock Job created
- AOI loading failed
- Job loading failed
- refresh failed
- filters produce no results, if useful
- backend conflict, when later supported

Notices should use a centralized service, not ad hoc DOM messages scattered across features.

## 5.10 Theme

Job Manager must support dark and light mode.

Theme behavior should follow Product Manager patterns where useful.

Initial requirements:

- support light mode
- support dark mode
- persist or respect existing app preference if Product Manager has a reusable pattern
- ensure map, Calcite components and custom CSS remain readable in both modes

## 5.11 Refresh

Refresh behavior should be planned early, even if not fully implemented first.

Expected future behavior:

- manual refresh
- possible auto-refresh
- preserve filters where practical
- preserve selected AOI/Job where practical
- do not use full-screen loader for silent refresh
- show notice on refresh failure

## 6. Non-functional requirements

## 6.1 Maintainability

Code should be easy to replace, test manually and refactor.

Rules:

- keep UI components thin
- keep backend/mock normalization out of UI
- centralize app state where needed
- avoid circular imports between features
- avoid hidden global mutable state unless documented
- keep file responsibilities narrow
- document important flows in README files when they become non-trivial

## 6.2 Security

The project is open source.

Never commit:

- tokens
- credentials
- private service URLs
- private portal configuration
- user-specific settings
- generated secrets
- real sensitive operational data

Use `.env.example` with placeholders.

Environment variables must use the `VITE_` prefix only when they are safe to expose to browser code.

## 6.3 Backend flexibility

There is no backend yet.

Frontend must not lock itself to a final backend contract too early.

Rules:

- use services/adapters
- normalize incoming data to frontend models
- isolate mock data
- make mocked responses resemble likely backend result shapes without pretending the contract is final
- document backend assumptions in this file or `BACKEND_CONTRACTS.md`

## 6.4 Performance

Performance concerns to keep in mind:

- AOI Feature Service may contain many geometries
- clustering and filtering can become expensive
- Job/AOI relation mapping can become expensive
- map refresh should avoid unnecessary full reloads
- large data updates should avoid blocking UI

Early implementation can be simple, but architecture should not prevent later optimization.

## 6.5 Accessibility and UX

Use Calcite and Bootstrap patterns consistently.

UX requirements:

- clear button labels
- visible focus states
- no status conveyed by color alone
- readable empty/error/loading states
- status and priority labels should be text-based
- map interactions should have list/panel alternatives where practical

## 7. Folder structure

Initial structure:

```txt
JobManager/
  docs/
    PROJECT_TRACKER.md
    BACKEND_CONTRACTS.md
    ARCHITECTURE.md

  public/

  src/
    app/

    features/
      aoi/
        api/
        config/
        domain/
        services/
        state/
        ui/

      jobs/
        api/
        domain/
        mock/
        services/
        state/
        ui/

      relations/
        domain/
        services/

      map/
        config/
        core/
        filters/
        layers/
        popups/

      notices/
        services/
        ui/

      theme/

    shared/
      api/
      config/
      dom/
      errors/
      events/
      utils/

    styles/
```

## 7.1 Folder responsibilities

### `src/app`

Application composition and lifecycle wiring.

Allowed responsibilities:

- app bootstrap
- root layout composition
- feature initialization
- high-level state wiring

Avoid:

- backend calls
- feature-specific business logic
- direct mock data access

### `src/features/aoi`

AOI-specific logic.

Allowed responsibilities:

- AOI frontend model
- AOI Feature Service loading
- AOI normalization
- AOI state
- AOI UI components
- AOI filtering helpers
- AOI display metadata

### `src/features/jobs`

Job-specific logic.

Allowed responsibilities:

- Job frontend model
- Job service API
- mock Job backend
- status mutation service
- cyclic mock Job behavior
- Job state
- Job list UI
- Job detail UI
- Job filtering helpers

Rule:

UI may use `jobs/services`, but must not import from `jobs/mock` directly.

### `src/features/relations`

AOI/Job relation-specific logic.

Allowed responsibilities:

- relation frontend model
- relation source values
- relation lookup helpers
- deriving relations from mock Jobs
- deriving AOI Job summaries
- finding Jobs for an AOI
- finding AOIs for a Job

Rules:

- relation code may use `jobs/services`, but must not import from `jobs/mock` directly
- relation code must not own canonical Job or AOI state
- UI must not know whether relations came from mock Jobs, frontend geometry or backend data

### `src/features/map`

Map-specific logic.

Allowed responsibilities:

- ArcGIS Map and MapView creation
- layer creation
- layer lifecycle
- clustering config
- map filters
- popup integration
- map selection/highlight behavior

Avoid:

- storing canonical Job state
- backend response normalization
- mock data creation

### `src/features/notices`

Notice system.

Allowed responsibilities:

- notice rendering
- notice queue/state
- notice service API
- mapping API/mutation outcomes to user-facing messages

### `src/features/theme`

Theme integration.

Allowed responsibilities:

- dark/light mode
- persisted theme preference
- Calcite theme integration
- theme toggle UI, if needed

### `src/shared`

Shared utilities with no domain ownership.

Allowed:

- generic API result wrapper
- error normalization
- DOM helpers
- config helpers
- event utilities
- small pure utilities

Avoid:

- dumping domain logic here
- creating vague catch-all files
- moving feature logic into shared prematurely

## 8. Architecture decisions

## 8.1 Use feature-based structure from project start

Status: Done

Job Manager will use a feature-based frontend structure from the beginning instead of growing folders organically. The top-level app structure follows Product Manager where useful, but Job Manager separates AOI, Jobs, Map, Notices and Theme responsibilities early to avoid later structural refactoring.

## 8.2 Keep mock backend behind services

Status: Done

Initial Jobs data will be provided by a mock backend, but UI code must not import mock data directly. Job UI should depend on service/domain functions so the mock backend can later be replaced by a real backend adapter.

## 8.3 Keep package versions aligned with Product Manager

Status: Done

Job Manager should initially stay aligned with Product Manager package major versions unless there is a specific reason to diverge. The initial Vite dependency was changed from an open-ended `>=7.3.1` range to `^7.3.1` to avoid unintentionally installing Vite 8 during project bootstrap.

## 8.4 Use Calcite 5 stylesheet entrypoint

Status: Done

Calcite 5 stylesheet imports should use `@esri/calcite-components/main.css` instead of deep `dist/...` CSS imports, because package exports can block deep imports in modern Vite versions.

## 8.5 Treat AOI/Job relation mapping as a service concern

Status: Proposed

The UI should not know whether AOI/Job relations are mocked, calculated in frontend or returned by backend. Relation lookup should be provided through a service/domain layer.

Rationale:

This keeps the app flexible while the backend contract is not decided.

## 8.6 Avoid direct polygon clustering assumptions

Status: Proposed

AOI clustering must not assume that clustering AOI polygons directly is always correct. If AOIs are large or irregular, a derived representative point layer should be considered for clustering while preserving polygon display for detailed inspection.

Rationale:

Direct polygon clustering can misrepresent spatial distribution if AOIs vary greatly in size or shape.

## 8.7 Use stable frontend models

Status: Proposed

Incoming AOI and Job data should be normalized into stable frontend model shapes before reaching UI components.

Rationale:

Backend contracts are not final, and UI should not be refactored whenever response casing, field names or metadata structure change.

## 8.8 Use user-facing status labels separately from internal status values

Status: Proposed

Internal Job statuses should use stable code values such as `todo`, `inProgress` and `done`, while UI labels should display `To do`, `In Progress` and `Done`.

Rationale:

This avoids coupling UI labels to logic and makes future localization or label changes safer.

## 8.9 Use Product Manager-style map-first shell

Status: Done

Job Manager should use a Product Manager-style map-first shell instead of a generic dashboard layout. The map should be the primary workspace, with navigation/header and panels layered over the map where practical.

Rationale:

Product Manager uses a full-height map workspace with app UI around and over the map. Job Manager should preserve that UX direction so Jobs, filters and AOI details can become panels or overlays without later layout refactoring.

## 8.10 Match Product Manager navbar and overlay behavior

Status: Done

Job Manager should use Product Manager's navbar baseline more closely: GST logo, `#456178` navbar color, 50px header height, text navigation in the navbar and action/filter controls in the header area.

Jobs should open as a left-side overlay panel above the map and must be closable. This preserves the right side of the map workspace for future Job-related tools and detail actions.

Quick filters should be accessible from the navbar. A dedicated Filters panel can be used when filters need more explanatory text or advanced controls.

## 8.11 Use a navbar HTML template like Product Manager

Status: Done

Job Manager should use a static navbar template in `public/components/navbar.html` and enrich it from JavaScript, matching the Product Manager pattern more closely than constructing the entire navbar in JS.

The navbar should use Product Manager's header baseline: `#456178`, 50px height, GST logo, centered text navigation and Calcite action icons on the right.

Filters should be opened from a right-side navbar Calcite dropdown, not as a permanent map panel. Quick filters should live inside that dropdown until shared filter state is implemented.

Rationale:

This keeps the shell closer to Product Manager, makes the navbar easier to compare and maintain, and avoids hardcoding too much Product Manager-style markup inside `createApp.js`.

## 8.12 Prefer Calcite components and log active opt-outs

Status: Done

Job Manager should use Calcite and Calcite Components where they fit the UI need. When the project actively chooses not to use Calcite for a UI element where a relevant Calcite component was considered, the decision must be logged in `docs/CALCITE_USAGE_LOG.md` with the reason and any feedback that may be useful to Esri.

Normal semantic HTML used for layout and document structure is not considered a Calcite opt-out.

Rationale:

This keeps UI decisions explicit, makes Product Manager alignment easier to review and preserves feedback that may be useful when Calcite components do not fit a specific app-shell need.

## 8.13 Use native navbar panel toggle when Calcite button styling does not fit

Status: Done

The Jobs navbar control uses a native `button` with `calcite-icon` instead of `calcite-button`.

Rationale:

`calcite-button` worked functionally but produced styling and focus behavior that did not fit the Product Manager-style navbar. The decision is logged in `docs/CALCITE_USAGE_LOG.md` as an active Calcite opt-out.

## 8.14 Add lint, format and HTTPS dev server foundation

Status: Done

Job Manager uses ESLint flat config, Prettier and an HTTPS Vite dev server through `vite-plugin-mkcert`.

Rationale:

Linting and formatting should be available early so implementation quality does not drift. HTTPS should be available from the start because ArcGIS/browser integrations and future auth-related flows may require secure local development behavior.

## 8.15 Align package versions with current Product Manager state

Status: Done

Job Manager should align package versions with the current Product Manager implementation, not only with the originally documented package versions. Vite is kept on version 8 because Product Manager has also been updated to Vite 8.

Rationale:

Product Manager is the practical baseline for Job Manager. Package alignment should follow the actively maintained project state to avoid unnecessary divergence.

## 8.16 Use square corners for panels and app surfaces

Status: Done

Job Manager should generally use square corners for panels, popovers, notices, map overlays and app surfaces. Rounded corners are acceptable for navbar actions and compact header controls where they match the Product Manager style.

Rationale:

This keeps Job Manager closer to the visual style used in Product Manager and avoids drifting into a generic rounded dashboard look.

## 8.17 Include Job geometry in mock data without coupling UI to spatial logic

Status: Done

Mock Jobs include geometry within Denmark and the surrounding Danish waters. Mock geometry may be either point or polygon geometry.

The UI must not use Job geometry directly for AOI/Job relation logic. Initial relation flow should use mocked `relatedAoiIds` through the relation/service layer. Later, relation logic can be replaced by frontend spatial calculation or backend-provided AOI/Job relations.

Rationale:

This supports realistic map-oriented development while avoiding early coupling to an unconfirmed backend or spatial relation strategy.

## 8.18 Add lightweight color guide before expanding UI states

Status: Done

Job Manager should define a lightweight color guide early instead of letting priority, status, filter and notice colors emerge randomly during implementation.

The first color guide should be implemented as CSS variables and used for Job priority and status UI. It should stay small and practical, and can be refined later when dark mode and map symbology are implemented.

Rationale:

Priority and status are central to the Job workflow. Defining their colors early improves consistency and avoids a later UI color refactor.

## 8.19 Hide Done Jobs from the default Jobs list

Status: Done

Done Jobs should remain in state/mock data but be hidden from the default Jobs list. The default list should focus on actionable work.

A later filter can allow users to include Done Jobs when needed.

Rationale:

The main workflow is to identify remaining work. Showing Done Jobs by default adds noise and reduces the usefulness of the Jobs panel.

## 8.20 Use collapsible Job cards in the Jobs panel

Status: Done

Job cards should be collapsed by default and show only title, status, priority and status action buttons. Users can expand a Job to inspect summary, created date, deadline and related AOI count.

Geometry type should not be shown in the Job card because geometry is primarily map information.

Rationale:

The Jobs panel should remain scannable. Users need to identify and act on Jobs quickly, while detailed metadata should still be available on demand.

## 8.21 Use status buttons as the primary Job status indicator

Status: Done

Job cards should not show a separate status badge when status action buttons are already visible. The active status button should visually indicate the current Job status.

Rationale:

Showing both a status badge and status buttons duplicates information and makes the card harder to scan.

## 8.22 Keep collapsed Job cards information-dense

Status: Done

Collapsed Job cards should show the key operational information: title, priority, created date, deadline, affected AOI count and status actions. Expanded content should be reserved for summary text and later supporting links/actions.

Rationale:

The Jobs panel is primarily a work queue. Users should be able to scan and act on Jobs without expanding each card.

## 8.23 Defer deadline editing until workflow is confirmed

Status: Done

Deadline should be displayed in the Job card, but editing deadline should not be implemented until it is confirmed as part of the frontend workflow.

Rationale:

Deadline editing introduces mutation handling, validation and backend contract assumptions. It should not be implemented before the workflow is confirmed.

## 8.24 Split global CSS by UI area

Status: Done

Job Manager CSS should be split by UI area once the app has more than generic bootstrap styling. `main.css` should only import CSS sections, while navbar, map, overlays, notices, Jobs UI, filter popover and design tokens live in separate files.

Rationale:

This follows the Product Manager direction and prevents `main.css` from becoming a large mixed-responsibility stylesheet.

## 8.25 Keep newly completed Jobs visible until refresh or panel close

Status: Done

When a user marks a Job as Done, the Job should remain visible in the current Jobs panel session so the result of the action is visible. Done Jobs are hidden again after refresh or when the Jobs panel is closed and reopened.

Rationale:

Removing a Job immediately after clicking Done makes the UI feel abrupt and can make users unsure whether the update succeeded.

## 8.26 Queue mock-created Jobs until refresh or panel reopen

Status: Done

Mock-created Jobs should be stored in the mock backend immediately, but should not be inserted into the currently visible Jobs list immediately after a status update.

New mock-created Jobs should become visible after refresh or after the Jobs panel is closed and reopened.

Rationale:

The real backend is expected to create later Jobs through a slower process. Showing newly created Jobs immediately after clicking Done makes the mock UI feel less realistic and visually abrupt.

## 8.27 Avoid transient updating UI for Job status mutations

Status: Done

Job status updates should not show a temporary inline "updating" message or force a visible card re-render before the mutation result is returned.

A local pending guard prevents duplicate status clicks while the mock/backend mutation is running, but the card UI should only change when the mutation result updates the Job state.

Rationale:

The inline updating state made the Jobs panel flash and made small status updates feel visually heavier than necessary.

## 8.28 Add dedicated relation feature boundary

Status: Done

AOI/Job relation logic lives under `features/relations` instead of being owned by either `features/aoi` or `features/jobs`.

Rationale:

AOI/Job relations are shared by AOI popups, Job details, filters and map rendering. A dedicated relation feature keeps cross-domain logic out of UI components and avoids making either AOI or Jobs responsible for the other domain's canonical state.

## 8.29 Add AOI renderer foundation before final relation matching

Status: Done

AOI renderer logic lives under `features/map/layers` and uses relation summaries as best-effort input.

Current behavior:

- AOIs get a neutral default renderer when no relation summaries match.
- AOIs can be styled as having active Jobs or high-priority active Jobs when relation summary ids match the AOI Feature Service id field.
- Renderer enrichment does not block map startup.

Rationale:

The current test Feature Service uses `GlobalID` as the provisional AOI id, while mock Jobs may still use mock AOI ids. The renderer must therefore be ready for real relation matching without making the current map depend on matching test data.

## 8.30 Add selected AOI to related Jobs flow

Status: Done

AOI popup actions can now open the Jobs panel scoped to Jobs related to the selected AOI.

Current behavior:

- AOI popup includes a `Show related Jobs` action.
- The action resolves the selected AOI id from the Feature Service attributes.
- Selected AOI state is stored in `features/aoi/state`.
- The Jobs panel can show a scoped view for the selected AOI.
- The scoped Jobs list uses relation service helpers instead of importing mock data directly.

Rationale:

The main workflow requires users to start from an AOI and inspect related Jobs. This flow connects the map and Jobs panel while keeping relation-source details isolated behind service/domain code.

## 8.31 Keep AOI popup action wiring production-safe

Status: Done

Temporary AOI popup debug logging was removed after the `PopupViewModel` action flow was verified.

The Jobs overlay close flow now moves focus back to the navbar Jobs control before hiding the panel.

Rationale:

The popup action debug logs were useful while diagnosing the lazy ArcGIS popup lifecycle, but they should not remain in normal development output. Moving focus before hiding the panel avoids browser accessibility warnings caused by hiding a panel while a descendant still has focus.

## 8.32 Add read-only Job geometry layer foundation

Status: Done

Job geometry is displayed on the map through client-side ArcGIS `FeatureLayer`s populated from Job service data.

Current behavior:

- Point Jobs are displayed in a dedicated Job point layer.
- Polygon Jobs are displayed in a dedicated Job polygon layer.
- Job geometry layers are read-only.
- Job geometry is styled by active priority and Done status.
- Job geometry popups show basic Job metadata.
- Job data is loaded through `jobs/services`, not directly from `jobs/mock`.

Rationale:

Jobs may use different geometry types, and ArcGIS client-side FeatureLayers are geometry-type specific. Splitting point and polygon Jobs keeps renderer, popup and later selection/highlight behavior isolated while preserving the service boundary around mock data.

Implementation note:

Client-side Job FeatureLayer data is replaced with `FeatureLayer.applyEdits()` instead of mutating `layer.source` after load. ArcGIS does not propagate `source` mutations after a client-side FeatureLayer has loaded.

## 8.33 Add Job selection as shared map/list state

Status: Done

Job selection is represented as frontend state shared by the map and Jobs panel.

Current behavior:

- selecting a Job geometry popup action opens the Jobs panel
- the matching Job card is expanded and focused
- selected Job geometry is highlighted on the map
- AOI scoped mode is cleared when opening a specific Job from the map
- selected Job state is cleared when returning to the normal Jobs list or closing the Jobs panel
- related AOI highlighting is deferred until the basic Job selection flow is stable

Rationale:

Job geometry is now visible on the map, and users can move directly from map geometry to operational Job details. Keeping selected Job state outside the map layer keeps map UI, Jobs UI and later backend integration decoupled.

Implementation note:

AOI popup actions use `PopupViewModel trigger-action` because the selected AOI flow is stable there.

Job details uses a `PopupTemplate` action for action bar placement. A hidden Esri `CustomContent` item captures the feature-scoped Job selection from the rendered popup graphic, because `PopupViewModel` selected feature state can be ambiguous for point Jobs when multiple popup features are present.

## 8.34 Add selected Job related AOI highlight

Status: Done

Selecting a Job highlights the AOIs listed in the selected Job's `relatedAoiIds`.

Current behavior:

- selected Job geometry remains highlighted
- related AOIs are highlighted on the map through the AOI FeatureLayerView
- clearing selected Job also clears related AOI highlight
- AOI popup and related Jobs flow continue to work while highlight is active
- clustering remains deferred

Rationale:

The user can now move from Job geometry to Job details and see which AOIs are affected by the selected Job. This closes the basic Job-to-AOI navigation loop before broader shared filters and clustering are introduced.

Status: Done

Implementation note:

Related AOI highlight queries AOI graphics through the `FeatureLayerView` and highlights the returned graphics. The first implementation queried the AOI `FeatureLayer` and passed object ids to `FeatureLayerView.highlight()`, which was not reliable for the current AOI service/view state.

## 8.35 Add shared Jobs filter state before clustering

Status: Done

Shared Jobs filter state has been introduced before clustering and broader AOI filtering.

Current behavior:

- navbar filter controls update central frontend Job filter state
- Jobs panel uses the shared filter state
- Jobs can be filtered by active-only, high priority and Jobs with AOIs
- Jobs can be filtered by explicit status values
- Jobs can be filtered by explicit priority values
- active filter state is shown in the Jobs panel
- the navbar filter action shows an indicator when filters are active
- map Job layers hide Done Jobs by default, matching the Jobs panel
- map Job layers reveal Done Jobs when the user explicitly selects the `Done` status filter
- Job filter state is owned by `features/jobs` because the filter rules are Job-domain rules. Map-specific application of the same filter state should live under `features/map/filters`.

Implementation note:

Done Jobs remain hidden by default unless the user explicitly selects the `Done` status filter. Selecting `Done` disables the Jobs panel's hidden-Done rule for the filtered result set, so the status filter behaves as an explicit request to view Done Jobs.

Rationale:

The app now supports AOI-to-Job and Job-to-AOI navigation. Shared filtering is the next foundation needed before clustering, because clusters and map counts should reflect the same filtered Job set shown in the Jobs panel.

Implementation note:

Job filter rules and filter state are owned by `features/jobs` because the filters describe Job-domain properties. ArcGIS-specific application of those filters lives under `features/map/filters`.

Done Jobs remain hidden by default in the Jobs panel unless the user explicitly selects the `Done` status filter. Selecting `Done` disables the Jobs panel's hidden-Done rule for the filtered result set, so the status filter behaves as an explicit request to view Done Jobs.

Current map behavior:

- shared Job filters are applied to Job point and polygon layers through `definitionExpression`
- map Job layers use the same filter state as the Jobs panel
- map Job layers hide Done Jobs by default, matching the Jobs panel
- map Job layers reveal Done Jobs when the user explicitly selects the `Done` status filter
- AOI renderer summaries are rebuilt from the same visible Job set used by map filtering
- selected Job highlight and related AOI highlight remain independent of layer filter state

Implementation note:

The map filter expression includes `status <> 'done'` by default so Job point and polygon layers match the Jobs panel's hidden-Done behavior. The default Done exclusion is removed only when the explicit `Done` status filter is active.

AOI renderer summaries use `filterJobsForVisibleJobSet(...)` before relations and summaries are built, so AOI severity follows active Job filters and the hidden-Done default. Existing unfiltered relation-service calls remain supported when no `jobFilters` argument is provided.

Deferred:

- clustering

## 8.36 Add Job point clustering foundation

Status: Done

Job point clustering has been enabled through the ArcGIS `FeatureLayer.featureReduction` cluster configuration.

Current behavior:

- Job point layer uses `featureReduction: { type: "cluster" }`
- cluster labels show the number of Jobs in each cluster
- cluster popup shows the cluster Job count
- Job point clusters respect the existing Job layer `definitionExpression` filters
- individual Job point popups still use the existing `Show Job details` popup action
- Job polygon layer is not clustered yet
- mock data includes enough active point Jobs to visibly exercise clustering
- mock polygon Jobs use compact footprints so they do not dominate the map

Rationale:

Initial clustering is limited to Job points because it provides a low-risk geographic overview without changing polygon rendering. Polygon and AOI clustering can be misleading if centroid-based clusters hide the actual polygon footprint, so those strategies remain deferred until the actual AOI geometry density and scale are better understood.

Known limitation:

AOI renderer color updates can take roughly a second after filters are cleared because relation summaries and the AOI renderer are rebuilt asynchronously. This is acceptable for now and should be optimized later only if it becomes disruptive.

Deferred:

- AOI clustering or cluster-like overview
- polygon Job clustering strategy
- cluster styling based on priority/severity
- AOI renderer refresh performance optimization

Implementation note:

Initial point clustering did not visibly cluster because the mock dataset had too few active point Jobs and oversized polygon Jobs dominated the map. The mock dataset now includes clustered point Jobs around several Danish waters and smaller polygon Jobs that better approximate realistic Job footprints.

Point clustering remains limited to the Job point layer. Polygon Jobs are still rendered individually.

## 8.37 Add Job point clustering UI settings

Status: Done

Job point clustering can now be controlled from the navbar popover.

Current behavior:

- clustering is map state, not Job filter state
- available presets are `Off`, `Low`, `Medium` and `High`
- `Medium` remains the default clustering preset
- `Off` disables point clustering by setting the point layer feature reduction to `null`
- `Low`, `Medium` and `High` map to different ArcGIS cluster radius values
- Job polygon layer remains unclustered
- Job filters continue to affect clustered Job points through layer filtering

Rationale:

Clustering distance is a map presentation concern, not a Job-domain rule. Presets are used instead of a free slider to keep the behavior predictable and easier to test.

Known limitation:

Clustering settings are frontend runtime state only and are not persisted across reloads.

## 8.38 Add priority-aware Job point clustering modes

Status: Done

Job point clustering now supports multiple demo styles.

Current behavior:

- `Count` keeps the existing count-based cluster style.
- `Priority pie` uses ArcGIS smart mapping pie-chart cluster rendering to show the priority distribution inside each cluster.
- `Priority groups` uses separate Low, Medium and High point layers so clusters only contain Jobs with the same priority.
- Priority group layers reuse the same point Job features but add priority-specific layer filters.
- Job filters still apply to all point clustering modes.
- Job polygon layer remains unclustered.
- Mock point Job density has been increased to make clustering modes easier to test.

Rationale:

Priority pie clustering is useful for overview and demo value because mixed-priority clusters show their composition directly. Priority-separated clustering cannot be expressed as one normal spatial cluster layer, so it is implemented with separate priority point layers.

Deferred:

- polygon Job clustering
- AOI clustering or AOI overview aggregation
- persisting clustering settings across reloads

## 8.39 Extract app-shell UI wiring from createApp

Status: Done

App-shell UI construction has been extracted from `src/app/createApp.js` into focused modules under `src/app/ui`.

Current structure:

```txt
src/app/createApp.js
  -> app composition
  -> store creation
  -> high-level map/list/selection wiring
  -> lifecycle cleanup

src/app/ui/createNavbarController.js
  -> navbar template loading
  -> Filters popover creation
  -> Job filter controls
  -> Job point clustering controls
  -> popover open/close behavior

src/app/ui/createJobsOverlay.js
  -> Jobs overlay shell
  -> hosts Jobs list UI

src/app/ui/createMapWorkspace.js
  -> map workspace shell
  -> map status region
```

Decision:

- Keep Job filter rules and filter state under `features/jobs`.
- Keep Job point clustering settings under `features/map`.
- Keep ArcGIS layer filtering and clustering application under `features/map`.
- Keep app-shell UI modules under `src/app/ui` when they coordinate multiple features but do not own feature-domain logic.
- Keep `createApp.js` focused on app composition, store creation, high-level feature wiring and lifecycle cleanup.

Rationale:

`createApp.js` had grown to mix app composition with detailed navbar/filter/clustering DOM construction. Extracting this keeps the next feature work simpler without changing domain ownership or behavior.

Known limitation:

AOI renderer color updates can lag after filter reset because relation summaries and renderer enrichment are rebuilt asynchronously. Keep this documented as a later optimization unless it becomes disruptive.

## 8.40 Add AOI popup Job summary content

Status: Done

AOI popup content now includes a related Jobs summary.

Current behavior:

- AOI popup shows related Job count.
- AOI popup shows active Job count.
- AOI popup shows high-priority active Job count.
- Counts use relation service snapshots and current Job filters where available.
- Done Jobs remain hidden by default unless the `Done` filter is active.
- If an AOI has no matching relation summary, the popup shows a neutral empty summary.
- The existing `Show related Jobs` action still opens the Jobs panel scoped to the selected AOI.
- Open AOI popup summary counts live-refresh after Job filter changes, successful Jobs refresh and Job status changes.
- Popup summary refresh uses the current shared Jobs store snapshot when available, instead of loading a separate Jobs snapshot from the relation service.

Rationale:

Users can now inspect an AOI and see the operational Job signal before opening the Jobs panel. The implementation keeps relation source details behind the relation service and does not import mock Job data into popup UI.

Implementation note:

AOI popup summary content keeps track of active custom content containers and re-renders them best-effort when Job-derived state changes. Closed popup content is cleaned up on later refresh attempts.

## 8.41 Add selected AOI highlight from popup action

Status: Done

Selecting `Show related Jobs` from an AOI popup now highlights the selected AOI on the map.

Current behavior:

- AOI popup action still opens the Jobs panel scoped to the selected AOI.
- Selected AOI state remains owned by `features/aoi/state`.
- Visual AOI highlight remains owned by the map controller/layer highlight code.
- Closing the Jobs panel clears selected AOI highlight.
- Reopening the normal Jobs list clears selected AOI highlight.
- Selecting a Job clears selected AOI highlight before applying selected Job and related AOI highlights.

Rationale:

The AOI-to-Jobs workflow now gives immediate geographic feedback, so users can see which AOI the scoped Jobs panel refers to without relying only on popup/list context.

## 8.42 Add map hover feedback for Jobs and AOIs

Status: Done

Map hover feedback now supports both Job geometry and AOI polygons.

Current behavior:

- Pointer movement performs frame-throttled map hit testing against registered Job/AOI layers.
- Job geometry has hover priority over AOIs below it.
- Hovered Jobs get a transient ArcGIS layer-view highlight.
- Hovered AOIs get a transient ArcGIS layer-view highlight.
- Hover layer views are warmed and cached to avoid resolving layer views during normal pointer movement.
- Hover hit testing coalesces pointer movement instead of cancelling every in-flight hit test.
- Hover highlight clears when the pointer leaves the map.
- Hover highlight clears when the user drags the map.
- Hover highlight clears when a map click begins, so selected highlight can take over.
- Hover cleanup runs through the map controller destroy flow.
- Cursor styling remains the default map cursor for now.
- Selected AOI, selected Job and related AOI highlights use separate controllers and are not overwritten by hover cleanup.

Rationale:

The first AOI-only hover implementation worked, but AOI-only hit testing could highlight an AOI underneath a Job geometry. The hover controller now respects map hit-test order and treats Jobs as the top-priority interactive target while keeping hover separate from selection state.

The hover controller follows the Product Manager hover pattern more closely by caching layer views, limiting hit testing to relevant layers and frame-throttling pointer movement. This avoids the delayed feel caused by invalidating each in-flight hit test while the pointer is still moving.

## 8.43 Add AOI-scoped Job map filtering

Status: Done

Selecting `Show related Jobs` from an AOI popup now scopes both the Jobs panel and map Job layers to Jobs related to the selected AOI.

Current behavior:

- The selected AOI still highlights on the map.
- The Jobs panel still shows Jobs related to the selected AOI.
- Map Job point and polygon layers are filtered to the same related Job ids.
- Existing Job filters are combined with the selected AOI Job scope.
- Done Jobs remain hidden by default unless the `Done` filter is active.
- Job point clustering follows the AOI scope because clustering uses the filtered point layer.
- Clearing the AOI scope in the Jobs panel clears the map Job scope.
- Opening the normal Jobs list clears the map Job scope.
- Closing the Jobs panel clears the map Job scope.
- Selecting a specific Job clears the AOI Job scope before applying selected Job highlight and related AOI highlight.

Rationale:

The AOI-to-Jobs workflow should make related Jobs visible on both the list and the map. Filtering the Job layers is clearer than adding another highlight color because clusters and visible counts then represent only the scoped Job set.

## 8.44 Add Job cluster picker

Status: Done

Job point cluster popups now include a compact picker for the Jobs represented by the cluster.

Current behavior:

- Clicking a Job point cluster opens a compact Job picker.
- The picker queries the clustered layer view for member Jobs using the cluster aggregate id.
- Picker items show Job title, status, priority, deadline and affected AOI count.
- Selecting a Job from the picker opens the normal Job feature popup.
- The normal Job feature popup remains responsible for `Show Job details`.
- Count, priority pie and priority group clustering modes can use the picker.
- Existing Job filters and AOI-scoped Job map filtering continue to determine which Jobs are included in clusters.
- Default popup actions such as `Zoom to` and `Browse features` are disabled for the map popup.

Rationale:

The picker should behave like the Product Manager overlap picker: show the underlying features first, then open the selected feature popup. This keeps cluster interaction compact and avoids sending users directly into the Jobs panel before they have chosen a specific Job from the map.

## 8.45 Polish hover cleanup and initial Jobs panel state

Status: Done

Small UX polish after Job cluster picker implementation.

Current behavior:

- Map hover highlight clears when the pointer leaves the map container.
- Map hover highlight clears when the browser window loses focus.
- Map hover highlight clears when the document is hidden.
- Stale asynchronous hit-test results cannot re-apply hover highlight after the pointer has left the map.
- The Jobs panel starts closed when the app loads.
- The Jobs panel still opens when the user clicks the Jobs navbar button.
- The Jobs panel still opens from AOI `Show related Jobs`.
- The Jobs panel still opens from Job `Show Job details`.

Rationale:

Hover highlight should behave as transient pointer feedback and must not remain visible after the pointer leaves the map. Starting with the Jobs panel closed gives the map-first workspace more room on load while preserving all explicit Jobs workflows.

## 8.46 Add manual refresh coordination

Status: Done

Manual refresh now coordinates the Jobs panel and map-derived Job data.

Current behavior:

- Clicking `Refresh` in the Jobs panel reloads Jobs through the Jobs service/store.
- Reopening the Jobs panel from the navbar also refreshes Jobs through the same path.
- A successful Jobs refresh triggers map Job layer refresh using the refreshed Jobs already returned to the Jobs panel.
- Map Job point, priority point and polygon layers are repopulated from the refreshed Jobs.
- Existing Job filters remain active after refresh.
- Existing Job point clustering settings remain active after refresh.
- AOI renderer summaries are rebuilt after refresh.
- If an AOI scope is active, related Job ids are resolved again and map Job layer scope is reapplied.
- If a Job is selected, selected Job and related AOI highlights are reapplied best-effort.
- If Jobs refresh fails, map refresh is not attempted.
- If map refresh fails after Jobs refresh, a user-facing notice is shown.

Rationale:

Manual refresh should not only update the Jobs panel. It should keep the map/list workflow coherent by refreshing map Job layers, derived AOI severity and active scope/highlight state without resetting filters or forcing a full app reload.

## 8.47 Add theme foundation and dark mode

Status: Done

Job Manager now has a basic light/dark theme foundation.

Current behavior:

- Theme state lives under `features/theme`.
- The app applies `calcite-mode-light` or `calcite-mode-dark` to the root `html` element.
- The selected theme is persisted in browser storage.
- If no persisted theme exists, the app follows the system color-scheme preference.
- The navbar includes a theme toggle action.
- Calcite components follow the active Calcite mode.
- Custom UI surfaces use semantic Job Manager CSS tokens.
- Jobs panel, Filters popover, notices, map status, popup custom content and cluster picker use theme-aware tokens.
- ArcGIS Maps SDK theme CSS is switched at runtime between light and dark mode instead of statically importing only the light ArcGIS theme.

Rationale:

Theme behavior is cross-cutting UI state and should be centralized before more panels and backend-driven states are added. Using Calcite mode classes keeps Job Manager aligned with the Product Manager theme token pattern while allowing Job Manager-specific colors and surfaces.

## 8.48 Harden AOI Feature Service readiness checks

Status: Done

AOI Feature Service integration now performs a lightweight readiness check when the map starts.

Current behavior:

- AOI FeatureLayer still owns map display of AOIs.
- AOI service exposes a readiness validation helper for the configured FeatureLayer.
- Missing AOI Feature Service configuration shows a map warning.
- AOI layer load failure keeps the map usable and shows a user-facing notice.
- AOI field metadata is validated after the FeatureLayer loads.
- Required provisional AOI fields are `GlobalID` and `PRODUCTNAME`.
- Recommended test-service metadata fields are checked and reported as warnings.
- AOI feature count is checked best-effort.
- Empty AOI sources show a map warning.
- AOI popup field rows are filtered to fields that actually exist in the loaded service.
- AOI `outFields` uses `*` while the AOI service contract remains provisional.

Rationale:

The current AOI service is still provisional, but the map should fail gracefully when configuration, service loading or field assumptions do not match expectations. Validation belongs in the AOI feature boundary, while ArcGIS layer lifecycle and map status remain owned by the map controller.

## 8.49 Fix hover coalescing and click highlight transition

Status: Done

Map hover feedback now avoids the delayed feel introduced by stale hit-test cancellation.

Current behavior:

- Hover hit testing runs at most one ArcGIS hit test at a time.
- Pointer moves are coalesced while a hit test is in flight.
- Completed hit-test results can update hover state even if the pointer moved during the async hit test.
- A queued pointer move triggers the next hit test after the current one finishes.
- Clicking a hovered AOI or Job no longer clears hover immediately.
- Hover highlight is cleared after selected highlight has taken over, reducing visible blink between hover and selected state.
- Drag, wheel, pointer exit, window blur, document hidden and controller destroy still clear hover immediately.

Rationale:

Discarding every hit-test result when `pointerEvent` changed made hover appear only after the pointer stopped moving. Clearing hover on click before selected highlight was ready caused a visual blink. The hover controller should coalesce pointer work without making pointer feedback feel delayed.

## 8.50 Add startup loader and required data gate

Status: Done

Job Manager now blocks initial app access until required startup data is available.

Current behavior:

- Startup is coordinated from app composition instead of being split between map startup and Jobs UI startup.
- The app shell is rendered behind a full-screen startup loader, but remains inert until startup succeeds.
- Jobs are loaded once through a shared Jobs store during startup.
- The Jobs panel consumes the shared startup-loaded Jobs store instead of triggering its own initial load.
- AOI Feature Service readiness is required during startup.
- Missing AOI Feature Service configuration blocks startup.
- AOI layer load failure blocks startup.
- AOI readiness warning states that mean the AOI source is not usable block startup.
- Job map layer population is required during startup and uses the Jobs snapshot already loaded by the startup flow.
- Startup failures retry automatically with exponential backoff and countdown text in the loader.
- After retries are exhausted, the loader remains visible and offers `Retry now`.
- User-facing app controls are unavailable until startup succeeds.
- Post-startup manual Jobs refresh remains non-blocking and can still show an inline refresh failure while stale Jobs are available.
- Startup loader styling now follows the Product Manager glass-overlay pattern so the app/map can be seen loading behind the required startup gate.
- Startup order now matches the Product Manager pattern more closely: the map workspace starts behind the transparent loader before required Jobs are loaded and rendered.
- Map status UI is suppressed during startup so the loader remains the only startup status surface.

Cleanup:

- Removed the old map status retry action path from startup-related map errors.
- Kept Jobs inline retry only for post-startup refresh failures where stale Jobs are still available.
- Defensive empty Jobs error state no longer exposes an alternate initial retry path because initial Jobs loading is owned by the startup gate.
- Startup retry now runs per startup stage. Once the map/AOI workspace is ready, later Jobs load retries no longer recreate the map. Once Jobs are loaded, later Job map rendering retries reuse the loaded Jobs snapshot.
- Removed stale startup/map-status action styling and unused loader destroy cleanup code after the startup retry surface moved fully into the loader.

Rationale:

Job Manager cannot be used meaningfully without both AOIs and Jobs. Initial load failures should therefore be handled before the user enters the app, instead of exposing a partial map/list workspace. Non-blocking inline refresh errors still make sense after a successful startup because the app already has a valid previous data snapshot.

## 9. Backend assumptions

Status: Draft

There is no backend yet.

Current assumptions:

- AOIs are loaded from an ArcGIS/Esri Feature Service.
- Jobs are initially served by mock data.
- Backend will later provide Jobs.
- Backend may later provide AOI/Job relationships.
- Backend may later own all geometric relation calculation.
- Backend owns automatic priority changes over time.
- Backend may later support conflict responses for concurrent updates.
- Backend may later support operation/job status endpoints.

Frontend should be ready for these without implementing final backend behavior too early.

## 10. Mock backend requirements

The mock backend must support:

- loading Jobs
- loading AOI/Job relations
- latency simulation
- status mutation
- mutation failure simulation
- cyclic Job creation
- partial failure scenarios, if useful
- predictable development behavior where possible

Mock backend rules:

- must live under `features/jobs/mock`
- must not be imported by UI components
- must be accessed through service functions
- must have clear comments explaining what behavior is mock-only and why
- must be easy to remove when real backend is introduced

Mock Jobs must include at least:

- title
- created date
- priority
- status
- geometry within Denmark or surrounding Danish waters
- related AOI ids for initial UI testing

Suggested initial mock configuration:

```txt
latencyMinMs: 250
latencyMaxMs: 1000
loadFailureRate: 0.05
mutationFailureRate: 0.15
cyclicJobCreationRate: 0.85
```

These values are tuned for frontend UX testing and are not final backend behavior.

## 11. Data model draft

## 11.1 Job frontend model

Draft shape:

```js
{
  id: "job-001",
  title: "Review affected AOIs",
  summary: "Short user-facing description of the work.",
  createdAt: "2026-06-15T10:00:00.000Z",
  deadline: "2026-06-30T00:00:00.000Z",
  priority: "medium",
  status: "todo",
  relatedAoiIds: ["aoi-001", "aoi-002"]
}
```

## 11.2 AOI frontend model

Draft shape:

```js
{
  id: "aoi-001",
  name: "Area of Interest 001",
  geometry: null,
  attributes: {},
  jobSummary: {
    total: 2,
    active: 1,
    highPriority: 1
  }
}
```

## 11.3 Relation model

Draft shape:

```js
{
  jobId: "job-001",
  aoiIds: ["aoi-001", "aoi-002"],
  source: "mock"
}
```

Possible `source` values:

```txt
mock
frontendGeometry
backend
```

The `source` field is useful for diagnostics and development, but should normally not be displayed to users.

## 12. Implementation roadmap

## Phase 0 - Project foundation

Goal:

Create the project shell and establish the source-of-truth documentation.

Tasks:

| ID      | Task                                                   | Status | Notes                                                                                        |
| ------- | ------------------------------------------------------ | -----: | -------------------------------------------------------------------------------------------- |
| JM-0001 | Create Job Manager Vite project under `src/JobManager` |   Done | Initial shell created and pushed.                                                            |
| JM-0002 | Align package versions with Product Manager baseline   |   Done | Vite range corrected to avoid Vite 8 drift.                                                  |
| JM-0003 | Create initial feature-based folder structure          |   Done | AOI, Jobs, Map, Notices, Theme and Shared folders created.                                   |
| JM-0004 | Create project tracker/source-of-truth document        |   Done | This document is now the active source of truth and is updated during implementation phases. |
| JM-0005 | Create backend contract notes document                 |   Done | Initial skeleton created in `docs/BACKEND_CONTRACTS.md`.                                     |
| JM-0006 | Create architecture notes document                     |   Done | Initial skeleton created in `docs/ARCHITECTURE.md`.                                          |

Exit criteria:

- app shell builds
- tracker exists
- folder structure is documented
- initial decisions are recorded

## Phase 1 - App shell and shared foundations

Goal:

Create a maintainable app shell with shared helpers before adding domain-heavy map logic.

Status: Done

Tasks:

| ID      | Task                                             | Status | Notes                                                                                                                                                                                    |
| ------- | ------------------------------------------------ | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JM-0101 | Create root app layout shell                     |   Done | Root layout uses Product Manager-style navbar template, GST logo, map-first workspace, native Jobs panel toggle with Calcite icon, closable left Jobs panel and Calcite Filters popover. |
| JM-0102 | Add shared config helper                         |   Done | Runtime config reads safe `VITE_` values from `import.meta.env`.                                                                                                                         |
| JM-0103 | Add shared API result helper                     |   Done | Added success/error result helpers for future services.                                                                                                                                  |
| JM-0104 | Add shared error normalization                   |   Done | Added normalized frontend error shape for mock and future backend errors.                                                                                                                |
| JM-0105 | Add notice service shell                         |   Done | Added notice service and UI container for user-visible messages. Notice UI is currently custom and should be reviewed against Calcite alert/notice options before hardening.             |
| JM-0106 | Add basic dark/light theme foundation            |   Done | Theme state, persisted preference, Calcite mode classes and navbar theme toggle are implemented.                                                                                         |
| JM-0107 | Extract app-shell UI modules from `createApp.js` |   Done | Navbar/filter/clustering UI, Jobs overlay shell and map workspace DOM helpers now live under `src/app/ui`.                                                                               |

Exit criteria:

- app has stable layout
- notices can be shown
- config is centralized
- errors can be normalized
- theme foundation is ready

## Phase 2 - Mock Jobs domain and service

Goal:

Implement Jobs without UI depending directly on mock data.

Tasks:

| ID      | Task                                            | Status | Notes                                                                                                                                                                          |
| ------- | ----------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| JM-0201 | Define Job status and priority domain constants |   Done | Added stable internal status and priority values with user-facing labels.                                                                                                      |
| JM-0202 | Define Job model normalization helpers          |   Done | Added normalization for Job fields and point/polygon geometry.                                                                                                                 |
| JM-0203 | Implement mock Job data                         |   Done | Mock Jobs include titles, dates, priority, status, point/polygon geometry and related AOI ids.                                                                                 |
| JM-0204 | Implement mock Job backend adapter              |   Done | Mock backend supports latency, failures, status mutation, cyclic Job creation and both follow-up/separate generated Jobs. Generated Jobs appear after refresh or panel reopen. |
| JM-0205 | Implement Job service facade                    |   Done | UI consumes Job service/store instead of importing mock backend directly.                                                                                                      |
| JM-0206 | Implement status update service flow            |   Done | Status updates return API result objects and support created follow-up Jobs.                                                                                                   |

Exit criteria:

- Jobs can be loaded through service
- Job status can be changed through service
- failures can be simulated
- completing a Job can sometimes create a new Job
- UI has no direct mock imports

Phase 12 polish notes:

- In Job details mode, Back to Jobs belongs in the sticky Jobs panel header as an icon action next to Close.
- Details mode should avoid nested box-in-box styling. Use one main details surface with section headers and thin separators.
- `Refresh` in details mode intentionally refreshes all Jobs for now because no single-Job backend endpoint exists yet.
- Mouse/programmatic focus should not show a large blue outline around Job cards or details surfaces. Keyboard focus should still use `:focus-visible`.
- Jobs panel header remains sticky and flush to the top of the scroll area.
- In details mode, the Selected Job summary header remains sticky under the panel header so key Job context stays visible while scrolling.
- Status buttons suppress mouse/click outlines while preserving keyboard `:focus-visible` behavior.
- Jobs panel header is sticky and flush to the top of the panel scroll area.
- Jobs panel header actions stay right-aligned in both list mode and details mode.
- Selected Job header remains sticky below the panel header in details mode.
- Status button click focus is suppressed for pointer interactions while keyboard focus remains visible.
- Selected Job sticky header spacing has been tightened so the details view keeps context visible without taking excessive vertical space.
- Jobs overlay overrides the generic panel flex layout because the shared panel gap creates unwanted spacing below the sticky Jobs header.

## Phase 3 - Job list UI

Goal:

Provide list-based work access before complex map interaction.

Tasks:

| ID      | Task                                         | Status | Notes                                                                                                                                                                                                                                                                                            |
| ------- | -------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| JM-0301 | Create Job list component                    |   Done | Jobs panel now renders active mock Jobs with compact collapsible cards using separate title/badge and date/action rows, fixed-width date chips, fixed-width priority/AOI badges and Calcite brand status actions. Done Jobs remain visible until refresh or panel close after being marked Done. |
| JM-0302 | Create Job detail/selection component        |   Done | Dedicated Job details mode is implemented in the Jobs panel. Compact card expansion remains available for list scanning.                                                                                                                                                                         |
| JM-0303 | Add Job status buttons                       |   Done | Added To do, In Progress and Done buttons per Job.                                                                                                                                                                                                                                               |
| JM-0304 | Add per-Job mutation loading state           |   Done | Replaced visible per-Job loading text with a local pending guard to avoid card flashing while still preventing duplicate status updates.                                                                                                                                                         |
| JM-0305 | Show success/failure notices for Job updates |   Done | Status updates show success and error notices.                                                                                                                                                                                                                                                   |
| JM-0306 | Show cyclic Job creation notice              |   Done | Mock-created follow-up Jobs show an info notice.                                                                                                                                                                                                                                                 |
| JM-0307 | Add selected AOI Jobs scope                  |   Done | AOI popup action opens the Jobs panel and scopes map Job layers to Jobs related to the selected AOI.                                                                                                                                                                                             |

Exit criteria:

- user can view Jobs
- user can update Job status
- mutation failures are visible
- cyclic mock behavior is visible
- list has loading/error/empty states

## Phase 4 - AOI Feature Service foundation

Goal:

Load AOIs through a service layer and prepare them for map display and relation mapping.

Tasks:

| ID      | Task                                | Status | Notes                                                                                                                                          |
| ------- | ----------------------------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| JM-0401 | Add AOI Feature Service config      |   Done | Added AOI Feature Service config helper using safe runtime config from `VITE_AOI_FEATURE_SERVICE_URL`. No private URL or credential is stored. |
| JM-0402 | Implement AOI service facade        |   Done | AOI service exposes FeatureLayer readiness validation. Real queried AOI state remains deferred while FeatureLayer owns map display.            |
| JM-0403 | Implement AOI normalization helpers |   Done | AOI normalization helpers and centralized field validation metadata are implemented for the current test Feature Service.                      |
| JM-0404 | Add AOI loading state               |   Done | Map status handles missing AOI config, AOI layer load failure, field validation warnings and empty source count.                               |
| JM-0405 | Document required AOI fields        |   Done | Required and recommended provisional AOI fields are centralized and documented. Final service fields remain open.                              |

Exit criteria:

- AOI config is centralized
- AOIs can be loaded
- AOI data is normalized
- errors are user-visible
- no secrets or private URLs are committed

## Phase 5 - AOI/Job relation service

Goal:

Make AOI/Job relations available without coupling UI to relation source.

Tasks:

| ID      | Task                                  | Status | Notes                                                                                                                      |
| ------- | ------------------------------------- | -----: | -------------------------------------------------------------------------------------------------------------------------- |
| JM-0501 | Define relation model                 |   Done | Added relation model helpers with `jobId`, `aoiIds` and `source`.                                                          |
| JM-0502 | Implement mock relation lookup        |   Done | Relations are derived from normalized Jobs using `relatedAoiIds`.                                                          |
| JM-0503 | Implement AOI summary derivation      |   Done | Added total, active, high-priority and active high-priority Job summary derivation per AOI.                                |
| JM-0504 | Implement Job related AOI lookup      |   Done | Relation helpers support Job-to-AOI lookup. Selected Job map highlight currently uses related AOI ids carried on Job data. |
| JM-0505 | Implement AOI related Jobs lookup     |   Done | Jobs panel and AOI-scoped map filtering can resolve Jobs related to a selected AOI.                                        |
| JM-0506 | Document backend relation assumptions |   Done | Relation implementation uses source markers so mock, frontend geometry and backend relations can be swapped later.         |

Exit criteria:

- AOIs can show related Job counts.
- Jobs can show related AOIs.
- Relation source is abstracted.
- UI does not care whether relations are mocked, frontend-derived or backend-provided.

## Phase 6 - Map foundation

Goal:

Create the ArcGIS map and layer architecture.

Tasks:

| ID      | Task                                    | Status | Notes                                                                                                                                |
| ------- | --------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------ |
| JM-0601 | Implement ArcGIS Map/MapView creation   |   Done | Added isolated ArcGIS Map/MapView creation under `features/map/core`.                                                                |
| JM-0602 | Add map container to app shell          |   Done | Replaced the map placeholder with a real MapView container while preserving the overlay Jobs panel layout.                           |
| JM-0603 | Add AOI layer creation                  |   Done | Added AOI `FeatureLayer` creation from configured service URL and connected popup/outFields/actions to centralized AOI field config. |
| JM-0604 | Add AOI renderer foundation             |   Done | Added neutral AOI renderer and best-effort Job summary renderer support using relation summaries matched by AOI id.                  |
| JM-0605 | Add map loading/error state integration |   Done | Added loading, warning and error status surface for the map. Renderer and Job layer enrichment failures do not block map loading.    |
| JM-0606 | Add basic view cleanup                  |   Done | Added MapView cleanup through the app lifecycle destroy flow.                                                                        |
| JM-0607 | Add read-only Job geometry layers       |   Done | Added client-side point and polygon FeatureLayers populated from Job service geometry.                                               |

Exit criteria:

- map loads
- AOIs are visible when a service URL is configured
- map lifecycle is isolated
- AOI layer creation is not mixed into app bootstrap
- Job geometry layers are isolated under map/layers

## Phase 7 - Map selection, hover and popup

Goal:

Make AOIs inspectable from the map.

Tasks:

| ID      | Task                                  | Status | Notes                                                                                                                                     |
| ------- | ------------------------------------- | -----: | ----------------------------------------------------------------------------------------------------------------------------------------- |
| JM-0701 | Add AOI hover feedback                |   Done | Map hover now highlights Jobs or AOIs using hit-test order, with Job geometry taking priority over AOIs underneath.                       |
| JM-0702 | Add AOI selection feedback            |   Done | `Show related Jobs` now stores selected AOI state, opens the scoped Jobs panel and highlights the selected AOI on the map.                |
| JM-0703 | Add AOI popup shell                   |   Done | Added ArcGIS popup template using current test Feature Service metadata, related Job summary content and a Show related Jobs action.      |
| JM-0704 | Show related Job summary in popup     |   Done | AOI popup now shows related, active and high-priority active Job counts using relation summaries and current Job filters where available. |
| JM-0705 | Add popup action to open related Jobs |   Done | AOI popup action opens the Jobs panel scoped to Jobs related to the selected AOI.                                                         |
| JM-0706 | Document popup flow                   |   Done | AOI popup relation summary content and `Show related Jobs` action flow are documented in `ARCHITECTURE.md`.                               |

Exit criteria:

- user can click AOI
- popup shows useful AOI and Job summary
- popup can open related Jobs
- popup flow is documented

## Phase 8 - Filtering and quick filters

Goal:

Create shared filtering used by map and list.

Tasks:

| ID      | Task                             |      Status | Notes                                                                                                                              |
| ------- | -------------------------------- | ----------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| JM-0801 | Define filter state model        |        Done | Job filter state lives in `features/jobs/state/jobFilterStore.js`.                                                                 |
| JM-0802 | Implement Job filter predicates  |        Done | Job filter predicates and summaries live in `features/jobs/domain/jobFilters.js`.                                                  |
| JM-0803 | Implement AOI filter predicates  |        Done | AOI overview filter modes and map filter state are implemented under `features/map`; relation membership remains service-derived.  |
| JM-0804 | Add quick filter UI              |        Done | Navbar Filters popover exposes Job quick filters and explicit status/priority filters.                                             |
| JM-0805 | Apply filters to Job list        |        Done | Jobs panel consumes shared Job filter state.                                                                                       |
| JM-0806 | Apply filters to AOI map layer   |        Done | AOI overview filters can apply AOI FeatureLayer `definitionExpression` when relation AOI ids are compatible with the AOI id field. |
| JM-0807 | Add filter-by-selected-Job flow  | In progress | Selecting a Job highlights related AOIs. Persistent AOI layer filtering for selected Job remains deferred.                         |
| JM-0808 | Apply filters to Job map layers  |        Done | Map Job point, polygon and priority point layers use shared Job filter definition expressions.                                     |
| JM-0809 | Add AOI-scoped Job map filtering |        Done | AOI `Show related Jobs` scopes map Job layers to Jobs related to the selected AOI while preserving active filters.                 |

Exit criteria:

- quick filters work
- Job map and list filtering are consistent
- selected AOI can scope related Jobs in both list and map
- empty states are clear
- AOI-specific filtering is documented as a later step where still deferred

## Phase 9 - Clustering and geographic overview

Goal:

Implement geographic overview without misleading AOI geometry.

Tasks:

| ID      | Task                                       |      Status | Notes                                                                                                     |
| ------- | ------------------------------------------ | ----------: | --------------------------------------------------------------------------------------------------------- |
| JM-0901 | Inspect real AOI geometry characteristics  |     Blocked | Requires actual Feature Service or representative sample data.                                            |
| JM-0902 | Decide AOI cluster strategy                |     Blocked | Direct polygon clustering vs derived representative points depends on real AOI geometry.                  |
| JM-0903 | Implement Job point cluster layer/config   |        Done | Job point clustering is implemented through ArcGIS FeatureLayer `featureReduction`.                       |
| JM-0904 | Add Job cluster labels                     |        Done | Job point cluster labels show cluster count.                                                              |
| JM-0905 | Add Job cluster popup/picker               |        Done | Job point clusters open a compact picker that lists cluster member Jobs and opens the selected Job popup. |
| JM-0906 | Disable/change clustering at detailed zoom | Not started | Deferred until clustering behavior has been tested with real AOI and Job density.                         |
| JM-0907 | Document clustering decision               |        Done | Job point clustering is documented. AOI clustering decision remains blocked by real geometry.             |
| JM-0908 | Add Job cluster UI settings                |        Done | Navbar clustering controls support Off, Low, Medium and High presets.                                     |
| JM-0909 | Add priority-aware Job clustering modes    |        Done | Count, priority pie and priority group modes are implemented.                                             |

Exit criteria:

- users can identify dense Job areas
- Job clustering does not hide polygon Job footprints
- AOI clustering remains explicitly deferred until geometry is understood
- cluster implementation is isolated

## Phase 10 - Refresh, resilience and UX hardening

Goal:

Make the app resilient to realistic loading, mutation and refresh scenarios.

Tasks:

| ID      | Task                                         |      Status | Notes                                                                                                                                                                |
| ------- | -------------------------------------------- | ----------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JM-1001 | Add manual refresh flow                      |        Done | Jobs panel refresh also refreshes map Job layers, AOI renderer summaries, filters, clustering and active scope/highlight state best-effort.                          |
| JM-1002 | Add silent refresh plan                      |    Deferred | Manual refresh and startup retry cover current needs. Revisit when backend behavior and auto-refresh requirements are clearer.                                       |
| JM-1003 | Preserve selected AOI/Job across refresh     |        Done | Manual refresh reapplies active AOI scope or selected Job highlight best-effort. Stale/deleted selection policy is deferred to backend work.                         |
| JM-1004 | Add mutation conflict handling placeholder   | Not started | Backend future.                                                                                                                                                      |
| JM-1005 | Add startup loader and automatic retry gate  |        Done | Initial startup blocks app access until Jobs, AOI readiness and Job map layer data are available. Retry runs per startup stage in loader.                            |
| JM-1006 | Review loading states across app             |        Done | Startup loading is gated. Post-startup manual refresh and AOI popup summary refresh are non-blocking. Backend-driven states are deferred.                            |
| JM-1007 | Polish hover cleanup and initial panel state |        Done | Hover clears on map exit/stale hit-test, and Jobs panel starts closed on app load.                                                                                   |
| JM-1008 | Add AOI popup live-refresh for Job summaries |        Done | Open AOI popup summary counts refresh after Job filter changes, successful Jobs refresh and Job status changes.                                                      |
| JM-1009 | Sync map presentation after Job mutation     |        Done | Successful Job status mutations now refresh map Job layers, AOI renderer summaries, AOI popup summaries and active scope/highlight state from the shared Jobs store. |

Exit criteria:

- refresh does not destroy user context unnecessarily
- failures are visible
- loading states are consistent
- mock failure scenarios are handled

Current known limitations:

- Generated mock Jobs are still queued in the mock backend and intentionally become visible only after refresh or panel reopen.
- Silent/auto refresh remains deferred until backend behavior and freshness requirements are clearer.
- Backend conflict handling remains deferred until a real backend contract exists.

## Phase 11 - Documentation and backend preparation

Goal:

Prepare for backend integration and reduce future rework.

Tasks:

| ID      | Task                                                    | Status | Notes                                                                                                                                            |
| ------- | ------------------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| JM-1101 | Create `docs/BACKEND_CONTRACTS.md`                      |   Done | Draft backend assumptions, frontend models, AOI fields and open questions are documented.                                                        |
| JM-1102 | Create `docs/ARCHITECTURE.md`                           |   Done | Folder ownership, state rules, service rules and map flows are documented.                                                                       |
| JM-1103 | Document mock backend behavior                          |   Done | Mock loading, latency, failures, status mutation, cyclic Job creation and generated Job visibility rules are documented.                         |
| JM-1104 | Document AOI Feature Service requirements               |   Done | Current test service fields and provisional readiness rules are documented. Final service fields, auth and geometry characteristics remain open. |
| JM-1105 | Document clustering decision                            |   Done | Job point clustering is documented. AOI clustering remains blocked by real geometry.                                                             |
| JM-1106 | Review for secrets before backend config work           |   Done | `.env.example` uses placeholders, and runtime config only exposes safe `VITE_` browser values.                                                   |
| JM-1107 | Review AOI service and backend readiness after Phase 10 |   Done | Current service seams are ready for later adapter work. AOI FeatureLayer ownership remains the right current approach.                           |

Exit criteria:

- backend assumptions are documented
- mock behavior is documented
- architecture decisions are recorded
- future backend integration path is clear

Phase 11 readiness review:

- Keep AOI FeatureLayer ownership for map display until real AOI geometry, field stability, auth and service size are confirmed.
- Do not introduce normalized canonical AOI state yet. The current AOI service skeleton and FeatureLayer readiness validation are sufficient for the current UI.
- Keep `GlobalID` and `PRODUCTNAME` as provisional test-service assumptions only.
- Keep mock Jobs behind `features/jobs/services/jobService.js` until a real backend adapter exists.
- Keep relation source flexibility through `mock`, `frontendGeometry` and `backend`.
- Do not add backend API environment variables until a real backend endpoint is known.

Mock backend behavior review:

- Mock Jobs are accessed through `features/jobs/services/jobService.js`.
- UI code must not import from `features/jobs/mock`.
- Mock Jobs are normalized before they reach store/UI consumers.
- Mock loading simulates latency and load failures.
- Mock status mutation simulates latency and mutation failures.
- Completing a Job can create a generated Job.
- Generated Jobs are stored in the mock backend immediately and returned as `createdJobs`.
- The current Jobs store updates the mutated Job in the visible state but does not immediately insert generated Jobs.
- Generated Jobs become visible after refresh or panel reopen, matching the intended slower backend-like workflow.
- Mock relations are derived from normalized Job `relatedAoiIds` through the relation service/domain layer.
- Mock relation behavior can later be replaced by backend-provided relations without changing UI ownership.

## Phase 12 - Job details workflow polish

Goal:

Improve the Job details workflow without introducing heavy editing or final backend assumptions.

Tasks:

| ID      | Task                                          | Status | Notes                                                                                                                          |
| ------- | --------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------ |
| JM-1201 | Define Job details panel scope                |   Done | Details view remains read-only except for existing status buttons. Deadline editing remains deferred.                          |
| JM-1202 | Implement dedicated Job details view          |   Done | Jobs panel supports list mode and a dedicated selected Job details mode.                                                       |
| JM-1203 | Wire map/list Job selection to details mode   |   Done | Map popup flow opens details mode with Job/related AOI highlights. Job list cards can open details mode without map selection. |
| JM-1204 | Preserve status mutation and notices          |   Done | Details view reuses existing status mutation flow, notices and mock-created Job queue notice behavior.                         |
| JM-1205 | Defer AOI details until real AOI fields exist |   Done | AOI details panel is deferred until final AOI Feature Service fields/auth/geometry are confirmed.                              |

Exit criteria:

- Jobs panel supports list mode and details mode
- selected Job details are readable and focused
- status changes work from details mode
- map-selected Jobs still highlight Job geometry and related AOIs
- backing out of details mode clears map selection only when the details view was opened from the map
- no new backend contract is introduced

Phase 12 implementation notes:

- Job details mode uses the existing normalized frontend Job model.
- Job details mode is read-only except for existing Job status mutation buttons.
- Deadline editing remains deferred until workflow and backend ownership are confirmed.
- The Jobs panel header remains sticky and flush to the top of the panel scroll area.
- In details mode, `Back to Jobs` is shown as a header icon action beside `Close`.
- In details mode, selected Job context remains sticky under the panel header.
- Details content uses one main surface with section dividers instead of nested card boxes.
- Status mutation controls are placed near the top of details mode, directly under selected Job context.
- Pointer/click focus outlines are suppressed on non-interactive details surfaces and status buttons, while keyboard focus remains visible through `:focus-visible`.
- Details refresh intentionally uses the shared all-Jobs refresh flow for now because no single-Job backend endpoint exists yet.
- AOI details remain deferred until real AOI fields, auth and geometry are confirmed.

## Phase 13 - Selected Job map focus / filtering

Goal:

Improve the Job details map workflow by making it possible to focus the map on the selected Job and its related AOIs without introducing AOI details or a final backend/AOI relation contract.

Tasks:

| ID      | Task                                       | Status | Notes                                                                                          |
| ------- | ------------------------------------------ | -----: | ---------------------------------------------------------------------------------------------- |
| JM-1301 | Define selected Job map focus scope        |   Done | Initial focus scope filters Job layers to the selected Job and highlights related AOIs.        |
| JM-1302 | Add Job details map focus controls         |   Done | Job details includes explicit `Focus map` and `Clear map focus` controls.                      |
| JM-1303 | Reuse existing Job layer filtering         |   Done | Selected Job focus reuses the existing Job layer definition-expression scope path.             |
| JM-1304 | Preserve focus state across manual refresh |   Done | Manual refresh reapplies selected Job map focus when it is active.                             |
| JM-1305 | Clear focus when backing out of details    |   Done | `Back to Jobs` clears selected Job map focus after `Focus map` has been used from Job details. |
| JM-1306 | Keep AOI details deferred                  |   Done | Related AOIs are highlighted only; AOI details and permanent AOI filtering remain deferred.    |

Exit criteria:

- Job details can request selected Job map focus
- related AOIs remain highlighted for selected Job context
- Job layers can be scoped to the selected Job
- clearing map focus restores normal Job layer filtering
- backing out of details mode clears selected Job map focus when focus was active
- existing shared Job filters still combine with selected Job map scope
- manual refresh preserves active selected Job map focus
- existing AOI `Show related Jobs` and Job `Show Job details` flows continue to work
- no new backend or AOI details contract is introduced

Phase 13 implementation notes:

- `Focus map` is intentionally explicit for now instead of automatic when Job details opens. This makes the behavior easier to demo and avoids surprising map context changes from list-opened details.
- `Clear map focus` restores normal Job layer filtering while keeping Job details open.
- `Back to Jobs` clears selected Job map focus after `Focus map` has been used, because the user is leaving the focused details context.
- Selected Job map focus is coordinated by app composition. Job details UI only raises events and does not import map controller logic.
- Selected Job map focus uses the same map filtering path as AOI-scoped Job filtering, so filters and clustering continue to operate on the scoped visible Job set.
- Related AOIs are highlighted, not hidden/filtered, until real AOI Feature Service identifiers, geometry behavior and UX expectations are confirmed.

## Phase 14 - AOI overview/filtering foundation

Goal:

Add a controlled AOI map overview/filtering foundation without introducing AOI details, AOI clustering or a final backend/AOI relation contract.

Tasks:

| ID      | Task                                     | Status | Notes                                                                                                                     |
| ------- | ---------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------- |
| JM-1401 | Define AOI map filter modes              |   Done | Added AOI map filter modes for all AOIs, visible Jobs, active Jobs and high-priority Jobs.                                |
| JM-1402 | Add AOI map filter state                 |   Done | AOI map filter state is map presentation state under `features/map/state`.                                                |
| JM-1403 | Add AOI FeatureLayer filter translation  |   Done | AOI map filter state is translated into AOI FeatureLayer `definitionExpression` when relation AOI ids are compatible.     |
| JM-1404 | Wire AOI map filters into navbar and map |   Done | Filters popover controls AOI map overview filtering through app composition and map controller.                           |
| JM-1405 | Keep AOI details deferred                |   Done | Phase 14 does not add AOI details panel or canonical queried AOI state.                                                   |
| JM-1406 | Keep backend/AOI contract provisional    |   Done | AOI filtering uses provisional `GlobalID` matching and relation summaries behind services.                                |
| JM-1407 | Validate AOI filter UX with current data |   Done | Current AOI overview filters work with the current service/mock data and showed no observed regression in manual testing. |

Exit criteria:

- AOI map filter modes are represented as explicit frontend state
- AOI filtering can be applied to the AOI FeatureLayer without UI knowing relation source
- current Job filters can be reused when deriving AOI filter membership
- default AOI display remains unchanged
- AOI details remain deferred
- no final backend/AOI contract is introduced

Implementation notes:

- AOI overview filters are exposed from the Filters popover.
- Current modes are `All AOIs`, `AOIs with visible Jobs`, `AOIs with active Jobs` and `AOIs with high-priority Jobs`.
- AOI map filter state is map presentation state, not Job-domain state.
- AOI membership is derived from relation service snapshots, not from direct mock imports.
- Current Job filters are applied before AOI filter membership is calculated, so AOI overview follows the same visible Job set as the map/list workflow.
- AOI filtering applies an AOI FeatureLayer `definitionExpression` only when relation AOI ids look compatible with the provisional `GlobalID` AOI id field.
- Mock or incompatible relation ids fall back to showing all AOIs instead of hiding the AOI layer.
- AOI overview filtering does not validate active filters through ArcGIS `queryFeatures`, because the current AOI Feature Service can fail tile/query operations for generated relation expressions.
- AOI overview filtering worked in manual validation after the non-destructive matching change, with no observed regression in existing AOI, Job details, Job filter or map focus flows.
- AOI details, canonical queried AOI state, AOI clustering and final backend/AOI relation ownership remain deferred.

## Phase 15 - Mutation-to-map sync

Goal:

Keep map-derived Job presentation in sync after successful Job status mutations without introducing a new backend contract or moving map responsibility into Jobs UI.

Tasks:

| ID      | Task                                          | Status | Notes                                                                                                  |
| ------- | --------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------ |
| JM-1501 | Track Job store mutation changes              |   Done | Job store snapshots expose a `lastChange` marker for successful and failed status mutation results.    |
| JM-1502 | Sync map after successful Job status mutation |   Done | App composition refreshes map Job layers from the shared Jobs store after successful status mutations. |
| JM-1503 | Preserve active map context after mutation    |   Done | Active AOI scope, selected Job focus and selected/related AOI highlights are reapplied best-effort.    |
| JM-1504 | Keep generated mock Jobs queued               |   Done | Generated mock Jobs remain backend-queued and become visible after refresh or panel reopen.            |
| JM-1505 | Keep Job UI free of map controller dependency |   Done | Status buttons still call the Jobs store only; map sync is coordinated by app composition.             |

Exit criteria:

- successful status mutations update visible Job map layers
- AOI renderer summaries update after mutation
- AOI popup summaries continue to update from shared Jobs state
- active AOI scope is reapplied after mutation
- active selected Job map focus is reapplied after mutation
- generated mock Jobs remain queued until refresh or panel reopen
- Job UI does not import map controller code
- no new backend contract is introduced

Implementation notes:

- `jobStore` exposes `lastChange` metadata so app composition can distinguish status mutations from startup/manual refresh loads.
- App composition only syncs map presentation for `jobStatusUpdated` changes.
- Startup `loadJobs()` and manual refresh still use their existing map refresh paths and do not trigger duplicate mutation sync.
- Map sync after mutation uses the current shared Jobs store snapshot, so the map receives the same Job data as the Jobs panel.
- If map sync fails after a successful mutation, a non-blocking `Map sync failed` notice is shown.
- Generated mock Jobs remain intentionally excluded from the visible Jobs store until refresh or panel reopen.
- AOI renderer refresh after Job status mutation keeps the existing AOI renderer visible while new relation summaries are calculated. This avoids a brief neutral-color flash on AOIs with related Jobs.
- AOI renderer refresh now uses the shared Jobs store snapshot when available, matching the Jobs panel and mutation-to-map sync behavior.
- Manual validation confirmed that setting a Job to `Done` removes it from the map without manual refresh.
- Manual validation confirmed that existing Job filters and AOI overview filters still work after mutation-to-map sync.
- Manual validation confirmed that generated mock Jobs remain queued and only become visible after refresh or panel reopen.
- Manual validation confirmed that AOI renderer flash after Job status mutation was removed by keeping the existing renderer visible until replacement summaries are ready.

## Phase 16 - Docs/status cleanup

Goal:

Clean tracker, architecture and backend-contract status drift after the completed map/list foundation phases before selecting the next feature phase.

Tasks:

| ID      | Task                                     | Status | Notes                                                                                         |
| ------- | ---------------------------------------- | -----: | --------------------------------------------------------------------------------------------- |
| JM-1601 | Align tracker phase statuses             |   Done | Early foundation phases and documented map/list flows now reflect implemented status.         |
| JM-1602 | Clean current known limitations          |   Done | Limitations now focus on remaining AOI/backend/polygon-clustering/silent-refresh constraints. |
| JM-1603 | Clean backend-contract duplication       |   Done | Duplicate generated Job backend implication text was consolidated.                            |
| JM-1604 | Fix stale wording and encoding artifacts |   Done | Open questions and backend notes use plain ASCII quotes/apostrophes to avoid mojibake.        |
| JM-1605 | Keep next feature choice explicit        |   Done | Next phase remains open and should be selected from a clean baseline.                         |

Exit criteria:

- tracker statuses match the current implemented state
- known limitations describe remaining constraints instead of completed work
- backend-contract notes do not duplicate generated Job behavior
- architecture notes remain aligned with implemented app composition and map ownership
- no code behavior changes are introduced

## Phase 17 - AOI overview polish

Goal:

Make the existing AOI overview filtering easier to understand and safer to operate without introducing AOI details, AOI clustering or a final AOI/backend relation contract.

Tasks:

| ID      | Task                                              | Status | Notes                                                                                                                                        |
| ------- | ------------------------------------------------- | -----: | -------------------------------------------------------------------------------------------------------------------------------------------- |
| JM-1701 | Clarify AOI overview controls                     |   Done | Filters popover now exposes AOI overview as compact button controls with a dedicated clear action.                                           |
| JM-1702 | Separate Job and AOI filter summaries             |   Done | Combined filter summary prefixes Job filters and AOI overview state so active filters are easier to read.                                    |
| JM-1703 | Add AOI overview no-match map feedback            |   Done | Map status warns when active AOI overview filters produce no matching AOIs.                                                                  |
| JM-1704 | Add AOI relation-id fallback map feedback         |   Done | Map status warns when relation AOI ids cannot safely filter the current AOI FeatureLayer and all AOIs are shown.                             |
| JM-1705 | Keep deferred AOI work explicit                   |   Done | Phase 17 does not add AOI details, canonical queried AOI state, AOI clustering or final backend relation assumptions.                        |
| JM-1706 | Keep filter actions accessible in small viewports |   Done | Filters popover uses a fixed header, stable summary and scrollable filter body so actions remain reachable.                                  |
| JM-1707 | Compact filter popover controls                   |   Done | Filter popover controls now use compact button groups for AOI overview, quick filters, Job status, Job priority and Job point cluster style. |
| JM-1708 | Stabilize filter summary and add section hints    |   Done | Filter summary remains visible with `No filters active`, and compact section headers expose hover hints without adding visible text.         |
| JM-1709 | Polish filter popover actions and focus behavior  |   Done | `Clear filters` moved to the header and pointer-activated filter buttons no longer keep persistent focus highlight.                          |

Exit criteria:

- AOI overview controls are understandable without opening docs
- active AOI overview state is visibly separate from Job filters
- `Clear AOI overview` resets only AOI overview filtering
- global `Clear filters` still clears both Job filters and AOI overview filtering
- no-match AOI overview states are communicated on the map
- incompatible relation-id fallback is communicated on the map
- AOI details remain deferred
- AOI clustering remains deferred
- no final backend/AOI relation contract is introduced

Implementation notes:

- `createNavbarController` still owns Filters popover composition and does not own AOI filter rules.
- AOI overview mode state remains owned by `features/map/state/aoiMapFilterStore.js`.
- AOI overview filtering still uses `features/map/filters/applyAoiLayerFilters.js`.
- Map controller restores the normal AOI readiness status after AOI overview filters are cleared or successfully applied.
- The map warning for incompatible AOI relation ids is informational and preserves the non-destructive fallback to all AOIs.
- The map warning for no matching AOIs is shown only when the active filter safely produced an empty AOI set.
- Filters popover layout keeps the header and current filter summary outside the scrollable filter body.
- `Clear filters` lives in the filter popover header next to the close action and remains reachable without using the scroll body.
- `Clear AOI overview` remains inside the AOI overview section and only resets AOI overview filtering.
- Filter popover sections use compact toggle button groups instead of checkbox rows where the choices are short and known.
- Quick filters, Job status and Job priority remain multi-select filters even though they are rendered as button groups.
- AOI overview duplicate status/hint text was removed because the active state is already shown in the popover summary.
- Filter summary space is always rendered so the popover layout does not jump when filters are toggled.
- Section descriptions are available through hover hints on section headers instead of visible helper text blocks.
- Pointer-activated filter buttons blur after click to avoid persistent focus highlight.
- Keyboard focus remains available through `:focus-visible`.
- The Phase 17 changes are UI/map-status polish only and do not change Job filter, AOI overview filter or clustering state ownership.

## Phase 18 - Backend adapter preparation

Goal:

Prepare the Job service layer for a future backend adapter without introducing a final backend contract, endpoint configuration or authentication assumptions.

Tasks:

| ID      | Task                                  | Status | Notes                                                                                                      |
| ------- | ------------------------------------- | -----: | ---------------------------------------------------------------------------------------------------------- |
| JM-1801 | Define Job service adapter source ids |   Done | Job service adapter sources are centralized as `mock` and `http`.                                          |
| JM-1802 | Move mock backend behind adapter      |   Done | `jobService.js` now depends on a Job service adapter instead of importing mock backend functions directly. |
| JM-1803 | Preserve existing Job service API     |   Done | Existing `loadJobs()` and `updateJobStatus(jobId, status)` exports remain available for current callers.   |
| JM-1804 | Add future HTTP adapter seam          |   Done | An unavailable HTTP adapter placeholder exists but is not wired to runtime config or endpoints.            |
| JM-1805 | Avoid premature backend contract      |   Done | No backend URL, auth config, endpoint path or response contract beyond the existing draft is introduced.   |

Exit criteria:

- current app behavior remains mock-backed by default
- UI and Jobs store continue using the same Job service methods
- mock backend is explicitly one adapter implementation
- future backend adapter work has a clear file seam
- no private endpoints, credentials or auth assumptions are introduced
- no final backend response contract is implied

Implementation notes:

- `features/jobs/services/jobService.js` owns API result wrapping and the service-facing methods consumed by stores/UI.
- `features/jobs/services/mockJobServiceAdapter.js` owns the current mock adapter implementation.
- `features/jobs/services/unavailableHttpJobServiceAdapter.js` is a deliberate placeholder for future backend work and should not be wired into runtime until a real backend exists.
- `features/jobs/services/jobServiceAdapter.js` chooses adapter implementations by source id.
- The default adapter remains `mock`.
- The HTTP adapter placeholder returns normalized service errors through the existing `toApiResult` path if used accidentally.
- Phase 18 does not introduce `VITE_JOB_API_BASE_URL`, endpoint paths, auth behavior or backend response normalization rules.

## Phase 19 - AOI service readiness review

Goal:

Review the current AOI service, configuration and map readiness boundary after backend adapter preparation without introducing AOI details, AOI clustering, canonical queried AOI state or final AOI/backend contract assumptions.

Tasks:

| ID      | Task                                         | Status | Notes                                                                                                                     |
| ------- | -------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------- |
| JM-1901 | Review AOI FeatureLayer ownership            |   Done | AOI FeatureLayer should continue to own map AOI display until real service fields, auth, geometry and size are confirmed. |
| JM-1902 | Review AOI service responsibility            |   Done | AOI service should continue to own readiness validation and normalization helpers, not canonical AOI state yet.           |
| JM-1903 | Review provisional AOI field assumptions     |   Done | `GlobalID` and `PRODUCTNAME` remain provisional test-service assumptions only.                                            |
| JM-1904 | Avoid premature AOI backend/config expansion |   Done | No new AOI env vars, auth config, endpoint assumptions or backend relation assumptions are introduced.                    |
| JM-1905 | Keep deferred AOI work explicit              |   Done | AOI details, AOI clustering and selected-Job AOI filtering remain blocked by real AOI/backend inputs.                     |

Exit criteria:

- AOI FeatureLayer ownership is still explicitly accepted
- AOI service readiness/validation boundary is still explicitly accepted
- canonical queried AOI state remains deferred
- current test-service field mapping remains provisional
- no new AOI backend contract is introduced
- blocked AOI/backend inputs remain visible in tracker

Implementation notes:

- Phase 19 is a readiness review only.
- No code behavior changes are needed from the current uploaded context.
- `features/aoi/services/aoiService.js` remains a readiness/validation service while `features/map/layers/createAoiLayer.js` owns the ArcGIS FeatureLayer construction.
- `loadAois()` remains a stable service facade skeleton and should not become a full AOI query path before a concrete UI/backend need appears.
- `validateAoiFeatureLayer()` remains the current startup readiness boundary for configured AOI FeatureLayers.
- AOI popup, hover, highlight, renderer enrichment and AOI overview filtering continue to use the FeatureLayer path.
- AOI relation ids still depend on provisional `GlobalID` compatibility for destructive AOI layer filtering.
- The next AOI implementation step is blocked until final AOI Feature Service fields, auth requirements, geometry characteristics, spatial reference, service size and backend relation ownership are confirmed.

## Phase 20 - Test and resilience hardening

Goal:

Harden regression coverage around service boundaries, store mutation metadata and AOI/map filter resilience without adding new UI, backend contracts, AOI details or clustering behavior.

Tasks:

| ID      | Task                                      | Status | Notes                                                                                                          |
| ------- | ----------------------------------------- | -----: | -------------------------------------------------------------------------------------------------------------- |
| JM-2001 | Test Job service adapter boundary         |   Done | `createJobService()` is covered with injected adapters and unavailable HTTP adapter behavior.                  |
| JM-2002 | Test Job service adapter source selection |   Done | Mock default, HTTP seam and unsupported source behavior are covered.                                           |
| JM-2003 | Test Job store mutation metadata          |   Done | Load, successful status update and failed status update paths are covered, including queued `createdJobs`.     |
| JM-2004 | Test AOI readiness validation edge cases  |   Done | Missing layer, load failure, ready layer, missing required fields and feature count warning paths are covered. |
| JM-2005 | Test AOI overview filter resilience       |   Done | AOI layer fallback, compatible no-match and incompatible relation-id behavior are covered.                     |

Exit criteria:

- service adapter seams are covered by tests
- unavailable HTTP adapter behavior is covered without adding backend config
- Job store mutation metadata is covered
- generated/created Jobs remain queued in visible state tests
- AOI readiness validation edge cases are covered
- AOI overview fallback and no-match behavior are covered
- runtime app behavior is unchanged

Implementation notes:

- Phase 20 adds tests only.
- No production source files are changed.
- Tests use injected services/adapters where possible to avoid coupling to mock internals.
- The HTTP adapter remains unavailable and unconfigured.
- AOI readiness tests use lightweight FeatureLayer stubs instead of ArcGIS runtime objects.
- AOI overview filter tests exercise definition-expression behavior through simple layer/relation stubs.

## Phase 21 - Startup/map coordination test hardening

Goal:

Harden startup coordination coverage without adding new UI, backend contracts, AOI details, AOI clustering or ArcGIS-heavy integration tests.

Tasks:

| ID      | Task                               | Status | Notes                                                                                                        |
| ------- | ---------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------ |
| JM-2101 | Extract startup stage coordination |   Done | Startup stage orchestration now lives in `app/startup/createStartupController.js`.                           |
| JM-2102 | Preserve app composition ownership |   Done | `createApp.js` still owns app shell composition, feature wiring and startup shell blocking/unblocking.       |
| JM-2103 | Test startup stage order           |   Done | Tests cover map workspace, Jobs load and Job map rendering order.                                            |
| JM-2104 | Test startup retry stage reuse     |   Done | Tests cover retry after Jobs load failure and Job map rendering failure without restarting completed stages. |
| JM-2105 | Test invalid Jobs startup result   |   Done | Invalid Jobs load data fails startup before Job map rendering.                                               |
| JM-2106 | Avoid ArcGIS-heavy startup tests   |   Done | Startup tests use injected map/job/loader stubs instead of ArcGIS runtime objects.                           |

Exit criteria:

- startup coordination is testable outside `createApp.js`
- retry after Jobs load failure reuses the ready map workspace
- retry after Job map rendering failure reuses loaded map and Jobs
- invalid Jobs load results fail before Job map rendering
- startup shell blocking remains owned by app composition
- no UI, backend, AOI or ArcGIS runtime behavior is intentionally changed

Implementation notes:

- `createStartupController` owns startup stage orchestration and stage-local loader updates.
- `createApp.js` owns shell blocking/unblocking through callbacks passed to the startup controller.
- The startup controller keeps startup state across retry attempts so completed stages are not repeated unnecessarily.
- Tests use injected `mapController`, `jobStore`, `startupLoader`, `runWithRetry` and `waitForNextPaint` dependencies.
- The refactor keeps the existing required startup sequence: map/AOI readiness, Jobs load, Job map rendering.
- Phase 21 does not add endpoint assumptions, auth behavior, AOI details, AOI clustering or new map presentation behavior.

## Phase 22 - Map refresh and selection coordination hardening

Goal:

Harden map refresh and selection restore coordination coverage without adding new UI, backend contracts, AOI details, AOI clustering or ArcGIS-heavy integration tests.

Tasks:

| ID      | Task                                    | Status | Notes                                                                                                             |
| ------- | --------------------------------------- | -----: | ----------------------------------------------------------------------------------------------------------------- |
| JM-2201 | Extract map sync coordination           |   Done | Manual refresh and mutation-to-map sync coordination now lives in `app/coordination/createMapSyncCoordinator.js`. |
| JM-2202 | Preserve app composition ownership      |   Done | `createApp.js` still owns app composition, feature event wiring and panel/map state transitions.                  |
| JM-2203 | Test selected AOI restore after refresh |   Done | Tests cover selected AOI map scope and highlight restore after Jobs refresh.                                      |
| JM-2204 | Test selected Job restore after refresh |   Done | Tests cover selected Job map focus and related AOI highlight restore from refreshed Jobs snapshots.               |
| JM-2205 | Test mutation-to-map sync gating        |   Done | Tests cover startup-time mutation sequence handling and post-startup mutation sync behavior.                      |
| JM-2206 | Test stale refresh guard                |   Done | Tests cover that stale map refresh results cannot restore old selection state.                                    |
| JM-2207 | Test map refresh failure handling       |   Done | Tests cover user-facing notice behavior and skipped selection restore after map refresh failure.                  |
| JM-2208 | Avoid ArcGIS-heavy coordination tests   |   Done | Tests use injected map/store/notice stubs instead of ArcGIS runtime objects.                                      |

Exit criteria:

- map refresh coordination is testable outside `createApp.js`
- manual Jobs refresh still refreshes map Job layers
- selected AOI scope/highlight is restored after refresh
- selected Job focus/highlight is restored after refresh
- mutation-to-map sync remains gated by startup completion and change sequence
- stale refresh results cannot overwrite newer map selection state
- refresh failure shows a user-facing notice and does not restore stale selection state
- no UI, backend, AOI or ArcGIS runtime behavior is intentionally changed

Implementation notes:

- `createMapSyncCoordinator` owns map refresh and restore orchestration.
- `createApp.js` still owns user events, selected AOI/Job transitions, Jobs panel visibility and feature wiring.
- The coordinator uses injected `mapController`, selected AOI/Job stores and notice function so tests can avoid ArcGIS runtime objects.
- The coordinator keeps the existing restore precedence: selected AOI scope first, then selected Job context.
- The coordinator keeps the existing behavior where a startup-time mutation sequence is recorded even when map sync is skipped before startup completion.
- Phase 22 does not add endpoint assumptions, auth behavior, AOI details, AOI clustering or new map presentation behavior.

## Phase 23 - Hardened baseline review and next feature selection

Goal:

Review the hardened baseline after service, startup and map refresh coordination test hardening, clean documentation drift and identify the next safe feature direction without adding backend, AOI contract or ArcGIS-heavy assumptions.

Tasks:

| ID      | Task                                    | Status | Notes                                                                                                          |
| ------- | --------------------------------------- | -----: | -------------------------------------------------------------------------------------------------------------- |
| JM-2301 | Review tracker status after Phase 20-22 |   Done | Current status and next-task rows are aligned with the committed test-hardening phases.                        |
| JM-2302 | Review architecture status drift        |   Done | Duplicate map refresh coordination text is removed and Job service adapter status is aligned as `Done`.        |
| JM-2303 | Confirm backend/AOI blockers            |   Done | Job HTTP adapter contract and final AOI inputs remain blocked by real backend/AOI decisions.                   |
| JM-2304 | Select next safe work direction         |   Done | Next recommended work is small UI/UX polish that does not depend on backend or final AOI Feature Service data. |
| JM-2305 | Keep Phase 23 docs-only                 |   Done | No runtime behavior, backend contract or feature implementation is introduced.                                 |

Exit criteria:

- tracker status reflects the hardened baseline
- Phase 20, Phase 21 and Phase 22 remain documented as completed
- architecture duplication introduced during Phase 22 docs update is removed
- backend and final AOI blockers remain explicit
- next feature direction is selected without requiring unavailable backend/AOI inputs
- no runtime code behavior changes are introduced

Implementation notes:

- Phase 23 is a docs/status cleanup and next-feature selection pass.
- The current internal technical risk is lower after targeted tests for service boundaries, startup coordination and map refresh/selection restore coordination.
- Backend adapter implementation remains blocked until real endpoint shape, authentication behavior and guaranteed Job fields are known.
- AOI details, canonical queried AOI state, selected-Job permanent AOI filtering and AOI clustering remain blocked until final AOI Feature Service inputs are known.
- The next recommended implementation direction is UI/UX polish around existing map/list behavior, because it can be validated without locking backend or AOI contracts.

## Phase 24 - Cluster picker popup state polish

Goal:

Polish the existing Job cluster picker edge case where stale cluster popup content could remain visible after Job filter, AOI-scope, cluster setting or Job data changes.

Tasks:

| ID      | Task                                  | Status | Notes                                                                                                  |
| ------- | ------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------ |
| JM-2401 | Extract aggregate popup detection     |   Done | Aggregate popup detection now lives in `features/map/core/mapPopupState.js`.                           |
| JM-2402 | Harden cluster popup close behavior   |   Done | Cluster popups are closed through robust popup selected-feature and feature-collection detection.      |
| JM-2403 | Preserve normal Job popup behavior    |   Done | Normal Job popups are not closed by the aggregate popup helper.                                        |
| JM-2404 | Add targeted popup-state tests        |   Done | Tests cover aggregate detection through `isAggregate`, `cluster_count`, popup template and view model. |
| JM-2405 | Fix cluster picker subtitle separator |   Done | The subtitle separator no longer contains mojibake.                                                    |

Exit criteria:

- open cluster picker popups are closed when visible Job layer membership changes
- normal Job popups are not closed by aggregate popup cleanup
- cluster popup detection is covered without ArcGIS-heavy tests
- no backend, AOI contract, AOI details or new feature scope is introduced

Implementation notes:

- `mapController.js` still owns when popup cleanup happens.
- `mapPopupState.js` only owns pure popup aggregate detection and close fallback behavior.
- Detection checks popup selected feature, popup view model selected feature and popup feature collections.
- The implementation avoids relying only on `selectedFeature.isAggregate`, because ArcGIS popup state can expose aggregate graphics through different popup/view model properties.

## Phase 25 - Job popup and Jobs panel interaction polish

Goal:

Polish the interaction between normal Job popups and the Jobs panel without changing backend contracts, AOI contracts, clustering behavior or the core map/list workflow.

Tasks:

| ID      | Task                                      | Status | Notes                                                                                                        |
| ------- | ----------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------ |
| JM-2501 | Add Job popup state detection             |   Done | Job popup detection now lives in `features/map/core/mapPopupState.js` beside aggregate popup detection.      |
| JM-2502 | Preserve popup while Job details is used  |   Done | Normal Job popup can remain open while the selected Job details panel is active.                             |
| JM-2503 | Close popup when selected context is left |   Done | Job popup closes when Back to Jobs, Clear map focus or Jobs panel close leaves the selected-Job context.     |
| JM-2504 | Keep cluster popup cleanup unchanged      |   Done | Existing aggregate/cluster popup cleanup remains intact.                                                     |
| JM-2505 | Add targeted popup-state tests            |   Done | Tests cover Job popup detection, specific Job id matching and close behavior without ArcGIS runtime objects. |
| JM-2506 | Remove Jobs panel bottom gap              |   Done | Jobs overlay CSS now fills the workspace height without reserving bottom space.                              |

Exit criteria:

- normal Job popup can stay open while Job details panel is used
- leaving selected-Job context closes stale Job popup state
- aggregate/cluster popup cleanup still works
- Jobs panel fills the available map workspace height in list and details mode
- tests cover popup-state helper behavior without ArcGIS-heavy tests
- no backend, AOI contract, clustering mode or new feature scope is introduced

Implementation notes:

- `mapController.js` exposes a focused `closeJobPopup` method for app-level selected-Job lifecycle wiring.
- `createApp.js` decides when selected-Job panel context is left.
- `mapPopupState.js` keeps popup detection pure and testable.
- Job popup detection checks popup selected feature, popup view model selected feature and popup feature collections.
- The Jobs overlay uses top/bottom insets and border-box sizing so panel padding does not create a bottom gap.
- Manual validation confirmed that the Jobs panel can be used while a normal Job popup is open, selected-context cleanup works, cluster modes still work and the panel bottom gap is removed.

## 13. Suggested implementation order

Recommended order:

1. Finish tracker and docs skeleton.
2. Build app shell and shared foundations.
3. Implement notices early.
4. Implement mock Jobs service.
5. Implement Job list and status mutations.
6. Add ArcGIS MapView foundation.
7. Continue AOI service and normalization.
8. Implement AOI/Job relation service.
9. Connect AOI Feature Service loading to AOI state.
10. Implement AOI popup and related Jobs flow.
11. Implement filters and quick filters.
12. Implement clustering/overview after AOI geometry is understood.
13. Harden refresh, errors and UX.
14. Prepare backend contracts.

Reasoning:

The Job service and list came before map complexity because they validate domain behavior, mutation flow, notices and mock backend behavior without being blocked by ArcGIS geometry details.

The initial MapView foundation is now in place before full AOI loading so future AOI layer, popup, selection and filtering work can be added inside `features/map` and `features/aoi` without putting ArcGIS lifecycle details in `src/app`.

Clustering should not be implemented too early because the correct approach depends on real AOI geometry.

## 14. Open questions

| ID     | Question                                                          |      Status | Notes                                                                                                                                 |
| ------ | ----------------------------------------------------------------- | ----------: | ------------------------------------------------------------------------------------------------------------------------------------- |
| OQ-001 | What is the actual AOI geometry type?                             |        Open | Test service exposes geometry, but final geometry type and density must still be verified against the real service.                   |
| OQ-002 | Are AOIs small/uniform enough for direct polygon clustering?      |        Open | Important for AOI clustering strategy. Job point clustering is already implemented separately.                                        |
| OQ-003 | Which AOI fields are stable and user-friendly?                    | In progress | Test service uses `GlobalID` as provisional id and `PRODUCTNAME` as provisional display name. Final service fields are not confirmed. |
| OQ-004 | Will AOI Feature Service require authentication?                  |        Open | Must avoid committing secrets. Current test integration does not settle final auth requirements.                                      |
| OQ-005 | Will backend return AOI/Job relations directly?                   |        Open | Frontend should remain flexible.                                                                                                      |
| OQ-006 | Will backend calculate spatial intersections?                     |        Open | Preferred for authoritative relation logic.                                                                                           |
| OQ-007 | What counts as "due soon"?                                        |        Open | Suggested default: deadline within 7 days.                                                                                            |
| OQ-008 | Should `Done` Jobs remain visible by default?                     |    Resolved | Done Jobs are hidden by default. The explicit `Done` status filter reveals them.                                                      |
| OQ-009 | Should cyclic mock Job creation be deterministic in dev?          |        Open | A seed option may make testing easier.                                                                                                |
| OQ-010 | Should the app use Product Manager's server/SSPI setup initially? |        Open | Only if needed for auth or deployment.                                                                                                |
| OQ-011 | Should users be able to edit Job deadlines in the frontend?       |        Open | Display deadline now, but defer editing until workflow/backend ownership is confirmed.                                                |

## 15. Risks and mitigations

## 15.1 Risk: folder structure becomes unclear

Mitigation:

- keep feature ownership explicit
- update this document when folders are added
- avoid generic dumping grounds
- add feature README files for non-trivial flows

## 15.2 Risk: mock backend leaks into UI

Mitigation:

- enforce service facade
- forbid UI imports from `features/jobs/mock`
- keep mock-only behavior documented

## 15.3 Risk: clustering misrepresents AOIs

Mitigation:

- inspect real geometry first
- consider representative-point clustering
- preserve polygon layer for detail
- disable clusters at detailed zoom levels
- document cluster decision

## 15.4 Risk: future backend contract forces UI refactor

Mitigation:

- normalize data before UI
- keep relation mapping in services/domain
- use stable frontend models
- document backend assumptions

## 15.5 Risk: app becomes too complex

Mitigation:

- keep Jobs simple
- avoid heavy workflow
- prioritize map/list/filter/status basics
- require explicit decision before adding large new features

## 16. Validation checklist

Use relevant steps depending on the change.

Common commands:

```powershell
npm install
npm run format:check
npm run lint
npm run test
npm run build
```

Preferred full local readiness command:

```powershell
npm run rdy
```

`npm run rdy` formats, lints, tests, builds and starts the dev server.

Use `npm run check` when the dev server should not be started.

Manual validation flows:

- app loads without console errors
- Jobs panel starts closed on app load
- Jobs panel opens from navbar
- Job list shows loading, data, empty and error states
- Job status can be changed
- failed Job update shows notice
- completing a Job can trigger mock cyclic Job creation
- AOIs load from configured source
- AOI popup shows related Job summary
- opening related Jobs from AOI scopes both Jobs panel and map Job layers
- selecting a Job opens the Jobs panel and highlights related AOIs
- quick filters affect Job list and Job map layers consistently
- Job point clustering works in Count, Priority pie and Priority groups modes
- Job cluster picker opens normal Job popup for selected Job
- hover highlight clears when the pointer leaves the map
- dark/light mode remains readable when theme work is introduced
- no secrets are present in committed files

## 17. Definition of done for implementation tasks

A task is only `Done` when:

- code is implemented
- relevant UI state is handled
- relevant error state is handled
- user-facing text is English
- no secrets are introduced
- build passes
- manual validation steps are described or completed
- tracker is updated if the task changes requirements, architecture or status

## 18. Future documentation split

This document is the primary source of truth for now.

Split into separate documents only when useful:

```txt
docs/PROJECT_TRACKER.md
  Goals, requirements, decisions, roadmap, task status.

docs/BACKEND_CONTRACTS.md
  Backend assumptions, endpoint drafts, data contracts, unresolved backend questions.

docs/ARCHITECTURE.md
  Folder structure, data flow, map/layer architecture, important implementation patterns.
```

Do not duplicate content across documents. Link or summarize instead.

## 19. Next immediate tasks

Recommended next tasks:

| ID          | Task                                                     |      Status | Notes                                                                                                                              |
| ----------- | -------------------------------------------------------- | ----------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| JM-NEXT-001 | Add `docs/BACKEND_CONTRACTS.md` skeleton                 |        Done | Initial backend assumptions and open questions documented.                                                                         |
| JM-NEXT-002 | Add `docs/ARCHITECTURE.md` skeleton                      |        Done | Initial architecture boundaries and data flow documented.                                                                          |
| JM-NEXT-003 | Implement app shell layout                               |        Done | Product Manager-style navbar, map-first workspace, Jobs panel and notices are implemented.                                         |
| JM-NEXT-004 | Implement notice service foundation                      |        Done | Notice service and UI container are implemented.                                                                                   |
| JM-NEXT-005 | Implement mock Jobs service                              |        Done | Mock Jobs service supports loading, failures, status mutation and cyclic mock Job creation.                                        |
| JM-NEXT-006 | Connect AOI Feature Service loading                      | In progress | AOI FeatureLayer is wired from runtime config. Dedicated AOI service querying remains deferred.                                    |
| JM-NEXT-007 | Add AOI/Job relation service                             |        Done | Mock `relatedAoiIds` are exposed through relation helpers and snapshots.                                                           |
| JM-NEXT-008 | Add AOI renderer and popup foundation                    |        Done | AOI renderer and popup related Job summary are implemented.                                                                        |
| JM-NEXT-009 | Extract navbar/filter/clustering UI from `createApp.js`  |        Done | App-shell navbar UI now lives in `src/app/ui/createNavbarController.js`.                                                           |
| JM-NEXT-010 | Extract Jobs overlay and map workspace DOM helpers       |        Done | Jobs overlay and map workspace DOM helpers now live under `src/app/ui`.                                                            |
| JM-NEXT-011 | Clean up tracker/docs status drift                       |        Done | Phase 8/9 and latest map/list interaction statuses have been aligned with implementation.                                          |
| JM-NEXT-012 | Add manual refresh flow                                  |        Done | Jobs panel refresh now refreshes map Job layers, derived AOI renderer state and active scope/highlight state best-effort.          |
| JM-NEXT-013 | Add theme foundation / dark mode                         |        Done | Theme foundation, persisted preference and navbar toggle are implemented.                                                          |
| JM-NEXT-014 | Review final AOI Feature Service field/auth requirements |     Blocked | Requires confirmation of real AOI Feature Service fields, auth requirements, geometry type, spatial reference and data volume.     |
| JM-NEXT-015 | Phase 10 wrap-up and backend preparation review          |        Done | Refresh, retry, loading and popup consistency are wrapped. Remaining mutation-to-map sync is deferred unless needed.               |
| JM-NEXT-016 | Start backend/AOI-service preparation                    |        Done | Phase 11 readiness review completed. Next implementation should focus on docs alignment and confirmed external AOI/backend inputs. |
| JM-NEXT-017 | Clean Phase 11 docs drift                                |        Done | Mock backend behavior is documented and stale docs placement/status drift has been cleaned.                                        |
| JM-NEXT-018 | Await final AOI/backend inputs                           |     Blocked | Requires real AOI Feature Service fields, auth requirements, geometry characteristics and backend contract direction.              |
| JM-NEXT-019 | Start Phase 12 Job details workflow polish               |        Done | Dedicated Job details mode is implemented and polished.                                                                            |
| JM-NEXT-020 | Start Phase 13 selected Job map focus                    |        Done | Job details now provides explicit map focus controls that scope Job layers to the selected Job and highlight related AOIs.         |
| JM-NEXT-021 | Review selected Job AOI filtering after real AOI inputs  |     Blocked | Requires confirmed AOI Feature Service identifiers, geometry characteristics and UX decision on hiding vs highlighting AOIs.       |
| JM-NEXT-022 | Wire Phase 14 AOI map filters into UI and map            |        Done | Filters popover now exposes AOI overview modes and applies them to the AOI FeatureLayer.                                           |
| JM-NEXT-023 | Validate Phase 14 AOI filter UX                          |        Done | AOI overview filters work with current service/mock data and no regression was observed in existing map/list flows.                |
| JM-NEXT-024 | Implement mutation-to-map sync                           |        Done | Successful Job status mutations now refresh map Job layers, AOI renderer summaries and active map context.                         |
| JM-NEXT-025 | Clean final docs/status drift after Phase 15             |        Done | Tracker, architecture and backend-contract status drift has been cleaned after mutation-to-map sync.                               |
| JM-NEXT-026 | Polish AOI overview filters from clean baseline          |        Done | AOI overview controls and map feedback have been clarified without adding AOI details or AOI clustering.                           |
| JM-NEXT-027 | Choose next feature phase after AOI overview polish      |        Done | Backend adapter preparation was selected as the next recommended feature direction.                                                |
| JM-NEXT-028 | Start backend adapter preparation                        |        Done | Job service now has an explicit adapter boundary with mock as the default adapter and an unavailable HTTP seam for future work.    |
| JM-NEXT-029 | Define future Job HTTP adapter contract                  |     Blocked | Blocked until real backend endpoint shape, auth behavior and guaranteed Job fields are known.                                      |
| JM-NEXT-031 | Continue test hardening for startup/map coordination     |        Done | Startup coordination was extracted and covered with targeted stage-order and retry-reuse tests.                                    |
| JM-NEXT-032 | Review map refresh and selection coordination tests      |        Done | Map refresh and selected AOI/Job restore coordination was extracted and covered with targeted tests.                               |
| JM-NEXT-033 | Choose next feature phase from hardened baseline         |        Done | Backend/AOI-dependent work remains blocked; next safe direction is UI/UX polish against existing map/list behavior.                |
| JM-NEXT-034 | Start small UI polish from hardened baseline             |        Done | Cluster picker popup state cleanup was hardened without adding backend, AOI details or new contract assumptions.                   |
| JM-NEXT-035 | Continue small UI polish from hardened baseline          |        Done | Job popup and Jobs panel selected-context cleanup was polished without adding backend, AOI details or new contract assumptions.    |
| JM-NEXT-036 | Choose next polish target from manual testing            |        Done | Phase 25 validation found a Jobs panel bottom gap, which was fixed as a small CSS-only follow-up.                                  |
| JM-NEXT-037 | Choose next polish target from current UI baseline       | Not started | Continue with the next reproducible map/list, filter popover or panel interaction issue, or pause for backend/AOI inputs.          |
```

---

## src/JobManager/docs/ARCHITECTURE.md

```
# Job Manager Architecture

This document describes the frontend architecture for Job Manager.

The app should follow Product Manager patterns where useful, but the Job Manager domain must remain clearly separated around Areas of Interest, Jobs, map behavior, notices and theme.

## 1. Architectural goals

Job Manager should be:

- easy to extend
- easy to connect to a future backend
- safe to develop with mock data
- structured enough to avoid large refactors later
- consistent with Product Manager UX patterns where relevant

## 2. High-level data flow

Current frontend flow:

```txt
AOI Feature Service
  -> ArcGIS FeatureLayer
  -> AOI readiness validation
  -> map AOI display, popup, hover and highlight

Mock Job backend
  -> mock Job service adapter
  -> Job service
  -> Job normalization
  -> Jobs store
  -> Jobs panel and app composition

Jobs store + Job filter state
  -> Job map FeatureLayers
  -> AOI popup summaries
  -> AOI renderer summaries
  -> AOI overview filters

Jobs + AOI identifiers
  -> relation service/domain helpers
  -> AOI summaries, scoped Jobs, related AOI highlights and map filters
```

Future backend flow should replace the mock backend behind the Job service without requiring UI components to change significantly.

AOI FeatureLayer ownership should remain in place until real AOI fields, auth requirements, geometry characteristics and service size are confirmed.

## 3. Folder ownership

```txt
src/
  app/
  features/
    aoi/
    jobs/
    relations/
    map/
    notices/
    theme/
  shared/
  styles/
```

## 4. `src/app`

Owns app composition and lifecycle wiring.

Allowed responsibilities:

- root layout
- feature initialization
- high-level event wiring
- app-level state composition

Avoid:

- backend calls
- mock data access
- AOI-specific business rules
- Job-specific business rules
- ArcGIS layer details

### App shell UI modules

Status: Done

`src/app` may contain small app-shell UI modules when the UI coordinates multiple features but does not own feature-domain logic.

Current modules:

```txt
app/ui/createNavbarController.js
  -> loads the static navbar template
  -> owns Filters popover UI rendering
  -> wires Job filter controls to Job filter state
  -> wires Job point clustering controls to map clustering state
  -> owns Filters popover open/close behavior

app/ui/createJobsOverlay.js
  -> creates the app-shell Jobs overlay panel
  -> owns sticky Jobs panel header sizing and full-height overlay shell behavior
  -> hosts `features/jobs/ui/jobList.js`

app/ui/createMapWorkspace.js
  -> creates the map workspace DOM container and map status region
```

Rules:

- App-shell UI modules may wire feature stores to controls, but must not own Job, AOI or map business rules.
- Job filter state remains owned by `features/jobs/state`.
- Job point clustering settings remain owned by `features/map/state`.
- ArcGIS-specific layer filtering and clustering application remain owned by `features/map`.
- `createApp.js` should stay focused on store creation, feature composition, high-level event wiring and lifecycle cleanup.

### Jobs overlay layout

Status: Done

The Jobs overlay is an app-shell panel hosted above the map workspace.

Current behavior:

- The Jobs panel starts closed and opens from the navbar, AOI popup flow or Job popup flow.
- The Jobs overlay fills the map workspace from top to bottom.
- The Jobs overlay uses `box-sizing: border-box` so panel padding does not reserve extra bottom space.
- The Jobs overlay keeps the panel header sticky while the list/details body scrolls.
- The generic overlay panel uses flex/gap layout, but the Jobs overlay opts out because sticky details/list modes need full-height layout control.

Rules:

- Keep Jobs overlay shell layout under `src/app/ui` and `src/styles/overlays.css`.
- Keep Jobs list and details rendering under `features/jobs/ui`.
- Layout fixes for the app-shell overlay should not change Job domain state, map state or backend assumptions.
- Verify list mode and details mode when changing panel sizing, padding or sticky header behavior.

### Startup coordination

Status: Done

Startup stage orchestration lives under `src/app/startup`.

Current module:

```txt
app/startup/createStartupController.js
  -> coordinates required startup stages
  -> keeps startup stage state across retry attempts
  -> updates startup loader text/progress for startup stages
  -> exposes injected dependencies for focused tests
```

Current startup stages:

```txt
map workspace
  -> mapController.start({ requireAois: true, deferJobGeometry: true, suppressStatus: true })

Jobs load
  -> jobStore.loadJobs()

Job map rendering
  -> mapController.refreshJobData({ jobs })
```

Rules:

- `createApp.js` owns app shell composition and shell blocking/unblocking.
- Startup controller owns startup stage orchestration, not app DOM composition.
- Startup controller should use injected dependencies in tests instead of ArcGIS runtime objects.
- Completed startup stages should be reused on later retry attempts where possible.
- Startup controller must not introduce backend endpoint, auth or AOI contract assumptions.

### Map refresh coordination

Status: Done

Map refresh and selection restore orchestration lives under `src/app/coordination`.

Current module:

```txt
app/coordination/createMapSyncCoordinator.js
  -> coordinates manual Jobs refresh to map refresh
  -> coordinates successful Job mutation to map sync
  -> restores selected AOI map scope and highlight after refresh
  -> restores selected Job focus and related AOI highlight after refresh
  -> guards stale refresh results from restoring old selection state
  -> exposes injected dependencies for focused tests
```

Current refresh inputs:

```txt
Jobs panel refresh event
  -> createMapSyncCoordinator.refreshMapAfterJobsRefresh({ jobs })

Jobs store mutation change
  -> createMapSyncCoordinator.syncMapAfterJobStoreChange(snapshot)
```

Rules:

- `createApp.js` owns feature event wiring and panel/map state transitions.
- Map sync coordinator owns refresh/restore orchestration, not app DOM composition.
- Map sync coordinator should use injected dependencies in tests instead of ArcGIS runtime objects.
- Selected AOI restore takes precedence over selected Job restore when both states exist.
- Stale refresh results must not restore old selected AOI or selected Job map state.
- Map sync coordination must not introduce backend endpoint, auth or AOI contract assumptions.

## 5. `src/features/aoi`

Owns AOI-specific behavior.

Subfolders:

```txt
aoi/
  api/
  config/
  domain/
  services/
  state/
  ui/
```

Responsibilities:

- AOI Feature Service integration
- AOI frontend model normalization
- AOI state
- AOI display metadata
- AOI UI components
- AOI-specific filtering helpers

Rules:

- AOI UI should not directly know raw Feature Service response shapes.
- AOI geometry handling should stay out of generic shared utilities.
- Required AOI source fields must be documented once known.

### Current test AOI field configuration

Status: In progress

The current test AOI Feature Service fields are centralized in `features/aoi/config/aoiFieldConfig.js`.

Current provisional field decisions:

- `GlobalID` is used as the provisional frontend AOI identifier.
- `PRODUCTNAME` is used as the provisional AOI display name.
- `PRODUCTID`, `SERIES`, `EDITION`, `ISSUEDATE`, `LOCKED`, `IS_TECHNICAL` and `UPDT` are treated as metadata.
- `OBJECTID` is preserved for ArcGIS/service mechanics, but should not be treated as the long-term AOI/Job relation id.

Current validation behavior:

- AOI FeatureLayer readiness is validated through `features/aoi/services/aoiService.js`.
- Missing configuration returns a stable missing-config result and is shown as a map warning.
- AOI layer load failure is surfaced as an AOI-specific notice while keeping the map usable.
- Required provisional fields are validated after the FeatureLayer loads.
- Recommended metadata fields are reported as warnings, not hard failures.
- AOI feature count is checked best-effort.
- Empty AOI sources are shown as warnings.
- AOI popup field rows are filtered to fields available in the loaded Feature Service.
- AOI `outFields` uses `*` while the service contract is provisional.

Rules:

- Keep test-service field names centralized.
- Do not spread raw field names across UI components.
- Do not treat the test-service field mapping as final backend contract.
- Keep AOI readiness validation in the AOI feature boundary.
- Keep ArcGIS layer lifecycle and map status in the map feature boundary.
- Update this section when the real AOI Feature Service is created.

### AOI service direction after Phase 10

Status: Reviewed

Decision:

Keep the ArcGIS `FeatureLayer` as the owner of AOI map display for now.

The AOI service should continue to own readiness validation and future AOI normalization helpers, but it should not eagerly query all AOIs into canonical frontend state until the real AOI service is confirmed.

Rationale:

- The map already needs the FeatureLayer for display, popup, hover and highlight.
- Real AOI geometry type, density, service size and auth are still open.
- Eager AOI querying could introduce unnecessary startup cost before the backend/AOI contract is known.
- Current UI workflows use stable selected AOI values from popup graphics and relation lookups, not a canonical AOI list.

Rules:

- Keep test-service field names centralized.
- Keep AOI readiness validation in `features/aoi/services`.
- Keep ArcGIS layer lifecycle in `features/map`.
- Introduce canonical AOI state only when a concrete UI/backend need appears.

Phase 19 review:

- Keep the ArcGIS `FeatureLayer` as the owner of AOI map display.
- Keep AOI readiness validation in `features/aoi/services/aoiService.js`.
- Keep AOI FeatureLayer construction in `features/map/layers/createAoiLayer.js`.
- Keep `loadAois()` as a stable service facade skeleton until a concrete UI/backend need requires queried canonical AOI state.
- Do not introduce canonical queried AOI state before final AOI fields, auth requirements, geometry characteristics and service size are known.
- Do not introduce AOI details, AOI clustering or final relation-id ownership from the current test Feature Service.
- Continue treating `GlobalID` and `PRODUCTNAME` as provisional test-service assumptions only.

### Current selected AOI state

Status: Done

Selected AOI state lives under `features/aoi/state`.

Current behavior:

- selected AOI state stores the selected AOI id, display name and object id
- map popup actions can update selected AOI state through app-level wiring
- Jobs UI can consume selected AOI scope without owning map state

Rules:

- selected AOI state must not depend on mock Jobs
- selected AOI state must not contain raw ArcGIS Graphic objects
- selection should store stable frontend values, not full Feature Service responses

## 6. `src/features/jobs`

Owns Job-specific behavior.

Subfolders:

```txt
jobs/
  api/
  domain/
  mock/
  services/
  state/
  ui/
```

Responsibilities:

- Job domain constants
- Job normalization
- Job service facade
- mock Job backend
- Job state
- Job list UI
- Job detail UI
- Job status mutations

Rules:

- UI must not import from `features/jobs/mock`.
- Mock behavior must be accessed through services.
- Cyclic mock Job creation must stay isolated from UI logic.
- Backend-specific fields must be normalized before UI use.

### Job service adapter boundary

Status: Done

Current flow:

```txt
Jobs store / UI callers
  -> jobs/services/jobService.js
  -> selected Job service adapter
  -> mock backend for current development
```

Current adapter files:

```txt
jobs/services/jobService.js
  -> wraps adapter calls in API result objects
  -> preserves current service-facing methods

jobs/services/jobServiceAdapter.js
  -> selects adapter implementations by source id

jobs/services/jobServiceAdapterSource.js
  -> centralizes supported source ids

jobs/services/mockJobServiceAdapter.js
  -> adapts the current mock backend to the service adapter shape

jobs/services/unavailableHttpJobServiceAdapter.js
  -> placeholder seam for future backend work
```

Rules:

- `jobService.js` should not import mock backend functions directly.
- The mock backend remains isolated under `features/jobs/mock`.
- The default Job service adapter is still `mock`.
- Future HTTP adapter work should use the same service-facing methods before changing UI or store code.
- Do not add backend endpoint paths, API base URLs or auth behavior until the real backend exists.
- UI components and Jobs store should continue consuming service functions and must not choose adapter implementations directly.

### Job details view

Status: Done

The Jobs panel supports two UI modes:

```txt
Jobs list mode
  -> scan and filter Jobs
  -> expand compact card summary
  -> open dedicated Job details

Job details mode
  -> inspect one selected Job
  -> update Job status
  -> return to Jobs list
```

Current behavior:

- Job details mode is part of `features/jobs/ui`.
- Job details mode uses the normalized frontend Job model.
- Job details mode does not import mock data directly.
- Job details mode reuses existing status mutation service/store behavior.
- Job details mode is read-only except for existing status buttons.
- Deadline editing is not implemented.
- Opening Job details from a map popup opens details mode and keeps selected Job map highlight behavior.
- Opening Job details from a list card is local panel navigation and does not force map selection.
- Returning from map-opened Job details clears selected Job map highlights through app-level selection cleanup.
- Details mode keeps `Back to Jobs` and `Close` available in the sticky Jobs panel header.
- Details mode keeps selected Job context sticky below the panel header.
- Details content uses one main details surface with section dividers instead of nested card boxes.
- Status mutation controls are placed near the top of details mode.
- Details refresh currently uses the shared all-Jobs refresh flow.

Rules:

- Job details must not add deadline editing until workflow and backend ownership are confirmed.
- Job details must not introduce a single-Job refresh contract before a real backend endpoint exists.
- Job details should keep status mutation behavior aligned with the Jobs list.
- Job details should suppress pointer/click focus outlines on non-interactive surfaces while preserving keyboard focus on controls.
- AOI details remain deferred until real AOI fields, auth and geometry are confirmed.

### Mock backend behavior

Status: Done

Current flow:

```txt
Jobs UI / startup / refresh
  -> jobs/state/jobStore.js
  -> jobs/services/jobService.js
  -> jobs/mock/mockJobBackend.js
  -> normalized frontend Job models
```

Current mock behavior:

- `loadJobs()` simulates latency before returning Jobs.
- `loadJobs()` can fail with a mock backend error.
- `updateJobStatus(jobId, status)` simulates latency before applying the mutation.
- `updateJobStatus(jobId, status)` can fail with a mock backend error.
- Completing a Job can create a generated Job.
- Generated Jobs can be follow-up Jobs based on the completed Job or separate Jobs from rotating templates.
- Generated Jobs are written to the mock backend's internal Job list immediately.
- Generated Jobs are returned in the mutation result as `createdJobs`.
- The Jobs store only updates the mutated Job in the visible current state.
- Generated Jobs become visible after a later Jobs load, such as manual refresh or panel reopen.

Current default mock configuration:

```txt
latencyMinMs: 250
latencyMaxMs: 1000
loadFailureRate: 0.05
mutationFailureRate: 0.15
cyclicJobCreationRate: 0.85
```

Rules:

- UI code must use `jobs/services/jobService.js`, not `jobs/mock`.
- Mock-only cyclic behavior must stay isolated in `jobs/mock`.
- Mock errors should continue to use the shared API result/error normalization path.
- Generated Jobs should not be inserted directly into the visible Jobs list unless the product decision changes.
- Mock data should remain realistic enough to exercise map, clustering, filters, popup summaries and relation flows.
- Mock behavior must remain easy to remove when a real backend adapter is introduced.

### Jobs filter ownership

Job filter rules and filter state are owned by `src/features/jobs`.

Current ownership:

```txt
jobs/domain/jobFilters.js
  -> normalize Job filters
  -> apply Job filter predicates
  -> build shared visible Job sets for map-derived features
  -> summarize active Job filters

jobs/state/jobFilterStore.js
  -> own current frontend Job filter state
  -> notify Jobs UI, map UI and app composition when filters change

jobs/ui/jobList.js
  -> consume Job filter state
  -> render filtered Jobs

map/filters/applyJobLayerFilters.js
  -> translate Job filter state into ArcGIS layer definition expressions

map/layers/applyAoiRenderer.js
  -> apply AOI renderer summaries from filtered relation snapshots

relations/services/relationService.js
  -> optionally build AOI/Job relation snapshots from filtered Job sets
```

Rules:

- Job filter predicates belong in `features/jobs/domain` because status, priority and related AOI rules are Job-domain rules.
- Job filter state belongs in `features/jobs/state` while the filters only describe Jobs.
- Map-specific application of Job filters must live under `features/map/filters`.
- Done Jobs are hidden by default in the Jobs panel, but the explicit `Done` status filter reveals matching Done Jobs.
- Map Job layers use shared Job filter state and hide Done Jobs by default, matching the Jobs panel.
- Map Job layers reveal Done Jobs when the explicit `Done` status filter is active.
- AOI renderer summaries must use the same shared visible Job set as map filtering.
- Do not introduce a generic top-level `features/filters` folder unless filters become truly cross-domain app state.

## 6.1 `src/features/relations`

Owns AOI/Job relation behavior.

Subfolders:

```txt
relations/
  domain/
  services/
```

Responsibilities:

- relation frontend model
- relation source values
- relation lookup helpers
- deriving mock relations from Job `relatedAoiIds`
- deriving AOI Job summaries
- resolving Jobs for an AOI
- resolving AOIs for a Job

Rules:

- relation code must not import from `features/jobs/mock`.
- relation code may use Job service functions.
- relation code must not own canonical Job or AOI state.
- UI must consume relation helpers/services without knowing whether relation data is mocked, geometry-derived or backend-provided.

## 7. `src/features/map`

Owns ArcGIS map behavior.

Subfolders:

```txt
map/
  config/
  core/
  filters/
  layers/
  popups/
```

Responsibilities:

- ArcGIS Map creation
- ArcGIS MapView lifecycle
- AOI layer creation
- clustering configuration
- layer filters
- map selection and hover behavior
- popup integration

Rules:

- Map code may render AOI/Job summaries, but must not own canonical Job state.
- Map layer code should receive prepared data/configuration where practical.
- Popup action flows should be documented when they become non-trivial.
- Clustering decisions must be documented because AOI polygons can be misleading if clustered incorrectly.

### AOI map overview filters

Status: Done for initial implementation

AOI map overview filtering is map presentation state.

Current flow:

```txt
Filters popover
  -> map/state/aoiMapFilterStore.js
  -> app-level store subscription
  -> map/core/mapController.js
  -> map/filters/applyAoiLayerFilters.js
  -> relation service snapshot
  -> AOI FeatureLayer definitionExpression
```

Current modes:

```txt
All AOIs
AOIs with visible Jobs
AOIs with active Jobs
AOIs with high-priority Jobs
```

Current behavior:

- The default mode shows all AOIs.
- The Filters popover exposes AOI overview modes as explicit buttons.
- The Filters action indicator is active when either Job filters or AOI map filters are active.
- `Clear filters` clears both Job filters and AOI map filters.
- AOI membership is derived from relation service snapshots.
- Current Job filters are applied before AOI filter membership is calculated, so AOI overview follows the same visible Job set as the map/list workflow.
- Manual Jobs refresh reapplies active AOI map filters.
- Changing Job filters reapplies active AOI map filters.
- AOI filtering uses the AOI FeatureLayer `definitionExpression`.
- AOI filtering applies a `definitionExpression` only when relation AOI ids look compatible with the provisional AOI `GlobalID` field.
- Incompatible relation ids fall back to showing all AOIs instead of hiding the AOI layer.
- AOI overview filtering does not validate generated expressions through ArcGIS `queryFeatures`.

Rules:

- AOI map filters must not introduce canonical queried AOI state.
- AOI map filters must not import mock Jobs directly.
- AOI membership must be derived through relation service snapshots.
- Filtering currently uses provisional AOI `GlobalID` matching. This must remain documented as provisional until real AOI fields and backend relation ownership are confirmed.
- AOI overview filtering must be non-destructive: uncertain relation matching should not hide all AOIs.
- AOI details panel remains deferred.
- AOI clustering remains deferred until real AOI geometry density and shape are confirmed.
- AOI overview UI may explain map filter behavior, but the filtering rules must remain in map/domain and map/filter modules.
- AOI overview warnings should be non-blocking map status messages, not startup failures.
- AOI overview no-match states are allowed to hide all AOIs only when relation ids are compatible with the AOI FeatureLayer identifier field.
- AOI overview fallback states must show all AOIs when relation ids cannot be matched safely.

Phase 17 polish behavior:

- Filters popover shows AOI overview state separately from Job filter state in the combined summary.
- `Clear AOI overview` clears only AOI overview mode and leaves Job filters unchanged.
- Global `Clear filters` clears both Job filters and AOI overview filters.
- `Clear filters` is available from the filter popover header instead of a sticky bottom footer.
- Combined filter summary prefixes Job filters and AOI overview filters separately.
- Filter summary remains visible even when no filters are active, using `No filters active` to avoid layout pop-in when filters are toggled.
- Filter popover uses a fixed header and stable summary with a scrollable body so global actions remain available in smaller viewports.
- The scrollable body contains AOI overview controls, Job filters and Job point clustering controls.
- Filter popover controls use compact button groups for short known option sets.
- Quick filters, Job status and Job priority are still multi-select filter state even though they are rendered as toggle buttons instead of checkboxes.
- Compact filter sections expose explanations through header hover hints instead of visible helper text, keeping the popover lightweight.
- AOI overview mode descriptions remain available as button titles/header hints, but duplicate visible status/hint text is intentionally avoided.
- Pointer activation should not leave persistent focus highlight on filter buttons, while keyboard focus remains visible through `:focus-visible`.
- If an active AOI overview mode produces no matching AOIs, the map status explains that the active AOI overview and Job filters match no AOIs.
- If relation AOI ids are incompatible with the current AOI FeatureLayer identifier field, the map status explains that the filter could not be safely applied and all AOIs are shown.
- Clearing or successfully applying AOI overview filters restores the normal AOI readiness status.
- The layout and interaction polish does not move filter ownership into app-shell UI; `createNavbarController` still only composes controls and forwards changes to feature stores.

### Job point clustering

Job point clustering is owned by `src/features/map`.

Current flow:

```txt
Navbar popover
  -> map/state/jobClusterSettingsStore.js
  -> map/core/mapController.js
  -> map/layers/jobClustering.js
  -> point FeatureLayer.featureReduction
```

Responsibilities:

- `map/domain/jobClusterSettings.js` owns clustering radius presets, cluster style values and normalization.
- `map/state/jobClusterSettingsStore.js` owns selected clustering settings.
- `map/layers/jobClustering.js` translates clustering settings into ArcGIS `featureReduction` configuration and layer visibility.
- `map/core/mapController.js` applies clustering settings to Job point layers.
- `src/app/ui/createNavbarController.js` wires navbar UI controls to the clustering settings store.

Cluster styles:

- `Count` uses the main Job point layer with count-based clustering.
- `Priority pie` uses the main Job point layer with ArcGIS smart mapping pie-chart cluster rendering.
- `Priority groups` uses separate Low, Medium and High Job point layers so clusters do not mix priority values.

Rules:

- Job point clustering may be enabled directly on the Job point `FeatureLayer`.
- Job clustering settings are map presentation state, not Job filter state.
- Priority-separated clustering must use separate point layers unless ArcGIS later supports category-constrained clustering directly.
- Job polygon clustering must not be enabled casually, because centroid-based clustering can hide the actual polygon footprint.
- AOI clustering or AOI cluster-like overview must be designed separately from Job point clustering.
- Cluster configuration belongs in `features/map`, not in Jobs UI or relation services.
- Cluster behavior must continue to respect shared Job layer filters.

### Job cluster picker

Status: Done

Current flow:

```txt
Job point cluster popup
  -> cluster custom popup content
  -> FeatureLayerView query using aggregateIds
  -> cluster member Job features
  -> compact Job picker
  -> selected picker item opens the normal Job feature popup
  -> normal Job popup can trigger Show Job details
```

Rules:

- Job cluster picker is owned by `features/map/popups/jobClusterPopupContent.js`.
- Cluster configuration remains owned by `features/map/layers/jobClustering.js`.
- Cluster picker must use ArcGIS cluster aggregate queries, not mock Job data.
- Cluster picker must open the normal Job feature popup when a Job is selected.
- Cluster picker must not bypass the normal `Show Job details` popup action.
- Cluster picker popup content should stay compact and Product Manager-like.
- Cluster picker should not include internal headers, explanatory text, chart content or duplicated actions.
- Default popup actions such as `Zoom to` and `Browse features` should stay disabled.
- Cluster picker applies only to Job point clusters.
- Job polygon Jobs remain unclustered.
- Existing Job filters and AOI-scoped Job map filtering must continue to affect cluster membership through layer filtering.

Phase 24 popup-state polish:

- Aggregate popup detection is isolated in `features/map/core/mapPopupState.js`.
- Map controller still decides when popup cleanup happens.
- Open cluster picker popups are closed before Job filters, AOI-scoped Job map filters, cluster settings or refreshed Job data can make the picker stale.
- Aggregate detection checks popup selected feature, popup view model selected feature and popup feature collections.
- Detection supports ArcGIS aggregate graphics through `isAggregate`, `cluster_count` attributes and cluster popup template titles.
- Normal Job popups should remain open when they are not aggregate/cluster popups.

### Current MapView foundation

Status: Done

ArcGIS `Map` and `MapView` creation is isolated under `features/map/core`.

Current responsibilities:

- `features/map/core/createMapView.js` creates the ArcGIS `Map`, operational layers and `MapView`.
- `features/map/core/mapController.js` owns map startup, loading/error status, renderer enrichment, Job layer data enrichment, popup action wiring and cleanup.
- `features/map/layers/createAoiLayer.js` owns AOI `FeatureLayer` construction and connects popup/outFields/actions to AOI field config and popup helpers.
- `features/map/layers/createJobLayers.js` owns read-only Job geometry layer construction.
- `features/map/layers/applyJobLayerData.js` loads Job service data into the Job geometry layers.
- `features/map/layers/aoiRenderer.js` owns AOI renderer configuration.
- `features/map/layers/mapHover.js` owns map pointer hit testing and transient Job/AOI hover highlight.
- `features/map/layers/jobRenderer.js` owns Job geometry renderer configuration.
- `features/map/layers/applyAoiRenderer.js` applies AOI renderer enrichment from relation summaries without blocking map startup.
- `features/map/popups/aoiPopupActions.js` owns AOI popup action definitions and selected AOI extraction from popup graphics.
- `src/app/createApp.js` creates app-level stores, composes app-shell UI modules, wires feature callbacks and owns lifecycle cleanup.
- `src/app/ui/createMapWorkspace.js` creates the map workspace DOM container used by the map controller.

Rules:

- Do not add ArcGIS layer construction directly to `src/app`.
- Do not put AOI field normalization in map layer code.
- Do not make map code the canonical owner of AOI or Job state.
- Keep future AOI popup content, filter and clustering logic under `features/map`.

## 8. `src/features/notices`

Owns user-facing notices.

Subfolders:

```txt
notices/
  services/
  ui/
```

Responsibilities:

- notice state/queue
- rendering success/error/info messages
- exposing service functions for other features
- mapping operation results to user-facing messages where useful

Rules:

- Do not scatter ad hoc error message DOM updates across the app.
- User-facing notice text must be English.
- Notices should be used for important mutation and loading outcomes.

## 9. `src/features/theme`

Owns dark/light mode behavior.

Current flow:

```txt
createApp
  -> createThemeStore()
  -> apply theme mode to html element
  -> createNavbarController({ themeStore })
  -> navbar theme toggle
  -> themeStore.toggleThemeMode()
  -> persisted theme preference
  -> html.calcite-mode-light / html.calcite-mode-dark
  -> Calcite components and Job Manager CSS tokens
```

Responsibilities:

- theme state
- theme preference persistence
- system color-scheme fallback
- Calcite mode integration
- app CSS theme hooks
- navbar theme toggle UI

Rules:

- Theme behavior is frontend UI state.
- Theme state must stay under `features/theme`.
- Theme code must not depend on Jobs, AOIs, relations or map data.
- The root `html` element is the source of truth for active Calcite mode.
- Custom CSS should use semantic `--jm-*` tokens instead of hardcoded light-mode colors.
- Theme preference persistence must not block app startup if browser storage is unavailable.
- Map and custom popup content should remain readable in both modes.

## 10. `src/shared`

Owns generic utilities with no domain ownership.

Subfolders:

```txt
shared/
  api/
  config/
  dom/
  errors/
  events/
  utils/
```

Allowed responsibilities:

- API result wrappers
- generic error normalization
- safe config helpers
- DOM helpers
- event utilities
- small pure helpers

Avoid:

- AOI domain logic
- Job domain logic
- map-specific behavior
- vague catch-all files

If a helper starts depending on AOI, Job or map concepts, it belongs in that feature instead.

## 11. State principles

State is lightweight JavaScript state and should be introduced only where it solves coordination between UI, map, services and filters.

Current state ownership:

- Jobs store owns the visible frontend Jobs snapshot and Job mutation change metadata.
- Job filter store owns shared Job-domain filter state.
- AOI map filter store owns AOI overview map presentation state.
- Job cluster settings store owns Job point clustering presentation state.
- Selected AOI store owns selected AOI frontend values.
- Selected Job store owns selected Job frontend values.
- Theme store owns light/dark mode state.

Rules:

- Keep canonical Jobs state in `features/jobs/state`.
- Keep selected AOI state in `features/aoi/state`.
- Keep selected Job state in `features/jobs/state`.
- Keep Job filter rules and Job filter state in `features/jobs` while they only describe Jobs.
- Keep map-specific application of filters in `features/map/filters`.
- Keep AOI overview filtering state in `features/map/state` because it is map presentation state.
- Introduce a broader app-level filter state only if filters become truly cross-domain.
- Avoid hidden global mutable state unless documented.
- Preserve selected AOI/Job across refresh where practical.
- App composition may coordinate stores, but should not become the owner of feature-domain rules.

## 12. Service principles

Services isolate data source details from UI.

Expected service boundaries:

```txt
features/jobs/services
  loadJobs
  updateJobStatus
  getJobById
  getJobsByStatus

features/aoi/services
  loadAois
  getAoiById

features/relations/services
  loadAoiJobRelations
  loadAoiJobRelationSnapshot
  getJobsForAoi
  getAoisForJob

features/relations/domain
  buildRelationsFromJobs
  buildAoiJobSummaries
```

The exact APIs can change as implementation matures, but UI must not depend on mock/backend details directly.

Current relation service behavior:

- derives initial mock relations from normalized Job `relatedAoiIds`
- returns relation source metadata
- supports AOI summary derivation for future map renderer and popup use
- supports lookup from AOI to Jobs and from Job to AOIs

Current AOI service behavior:

- `features/aoi/services/aoiService.js` exposes AOI readiness validation for the configured ArcGIS FeatureLayer.
- `loadAois()` is intentionally still a facade skeleton while FeatureLayer owns current AOI display.
- AOI service does not own canonical AOI state yet.
- AOI service does not query all AOIs eagerly.
- AOI service should not become a backend contract layer before the real AOI Feature Service is confirmed.

Rules:

- Keep AOI readiness validation in the AOI feature boundary.
- Keep ArcGIS FeatureLayer lifecycle and display in the map feature boundary.
- Introduce canonical AOI state only when there is a confirmed UI/backend requirement.
- Keep test-service field mapping provisional until final AOI Feature Service inputs are known.

## 13. Map and clustering architecture

Clustering must be treated as an explicit design decision.

Important constraints:

- AOIs are expected to be polygons.
- Polygon clustering can be misleading if AOIs are large or irregular.
- The app may need both an AOI polygon layer and a derived representative-point layer for clustering.
- The cluster strategy must be based on actual AOI geometry characteristics.

Preferred initial direction:

```txt
Detailed AOI polygon layer
  -> used for inspection, selection and popup

Derived AOI overview layer
  -> used for clustering or high-density overview if needed

Do not finalize clustering implementation before real AOI geometry or representative sample data has been inspected.

Current implementation status:

ArcGIS Map and MapView lifecycle is implemented under features/map/core.
AOI layer creation is isolated under features/map/layers.
AOI layer creation can use a configured Feature Service URL, but renderer, popup content and clustering are intentionally not finalized.
The app shows an initial map status warning when AOI Feature Service configuration is missing.

Do not finalize clustering implementation before real AOI geometry or representative sample data has been inspected.
```

### Job geometry layer architecture

Status: Done

Job geometry is displayed through read-only client-side ArcGIS FeatureLayers.

Current layer split:

```txt
Job polygon layer
  -> displays Jobs with polygon geometry

Job point layer
  -> displays Jobs with point geometry
```

Current behavior:

- Job geometry layers are created under `features/map/layers`.
- Job layer source data is loaded from `jobs/services`.
- Job layer source data is not loaded directly from `jobs/mock`.
- Job geometry renderer distinguishes active priority and Done status.
- Job geometry popup shows basic Job metadata.
- Job geometry selection and highlight are implemented through map controller highlight flows and app-level selected Job wiring.
- Job geometry popup actions open the dedicated Jobs panel details mode.

Rules:

- Keep point and polygon Jobs in separate layers because client-side FeatureLayers are geometry-type specific.
- Keep Job geometry display read-only until editing/selection workflows are explicitly introduced.
- Keep Job layer data refresh replaceable so it can later consume central Job state or backend data instead of a separate service snapshot.

### Job selection flow

Status: Done

Current flow:

```txt
Job geometry popup action
  -> app-level selected Job callback
  -> selected Job state
  -> Jobs panel opens in Job details mode
  -> selected Job geometry is highlighted on the map
  -> related AOIs are highlighted on the map
```

Rules:

- Job details should use feature-scoped custom popup content so the selected Job is derived from the popup content graphic rather than ambiguous popup ViewModel state.
- Job popup action wiring should wait for `view.popup.viewModel` with `reactiveUtils.whenOnce`.
- Selected Job state should live outside map layer construction.
- Map highlight should be owned by map layer/controller code.
- Jobs panel focus/expanded state should be owned by Jobs UI code.
- Selecting a Job from the map clears AOI-scoped list mode.
- Closing the Jobs panel or returning to the normal Jobs list clears selected Job highlight.
- Related AOI highlight for selected Job is handled through selected Job state and map controller highlight flows.
- Jobs panel details mode is the primary selected Job detail surface; compact card expansion remains a list-scanning aid.

Implementation note:

Job details uses a `PopupTemplate` action for action bar placement. A hidden Esri `CustomContent` item captures the feature-scoped Job selection from the rendered popup graphic, because `PopupViewModel` selected feature state can be ambiguous for point Jobs when multiple popup features are present.

Phase 25 popup/panel polish:

- Normal Job popups may remain open while the selected Job details panel is active.
- Leaving selected-Job context from the Jobs panel closes stale Job popup state.
- `createApp.js` owns the decision about when selected-Job context is left.
- `mapController.js` exposes a focused `closeJobPopup` method instead of making app composition inspect ArcGIS popup state.
- `mapPopupState.js` owns pure Job popup detection and close fallback behavior.
- Job popup detection should not close aggregate/cluster popups, because cluster cleanup is handled separately.
- The Phase 25 layout follow-up keeps the Jobs overlay pinned from top to bottom so list/details mode does not leave a bottom gap.

### Selected Job related AOI highlight

Status: Done

Current flow:

```txt
Selected Job
  -> relatedAoiIds from Job layer popup attributes
  -> app-level selected Job state
  -> map controller AOI highlight request
  -> AOI FeatureLayerView query by GlobalID
  -> AOI FeatureLayerView highlight returned graphics
```

Rules:

- Related AOI highlight should use selected Job state, not direct mock imports.
- Related AOI ids should come from normalized Job data carried through the Job map layer attributes.
- AOI matching currently uses `GlobalID`, matching the provisional frontend AOI id strategy.
- Clearing selected Job should clear related AOI highlight.
- Related AOI highlight is visual only; it does not change the AOI layer source or apply a permanent filter.
- Clustering and de-emphasis effects remain separate future map presentation decisions.

### Selected Job map focus

Status: Done

Selected Job map focus is an explicit Job details workflow.

Current flow:

```txt
Job details
  -> Focus map
  -> app-level selected Job event
  -> selected Job state
  -> Job layer scope filtered to selected Job id
  -> selected Job geometry highlight
  -> related AOI highlight
```

Clear flow:

```txt
Job details
  -> Clear map focus
  -> clear selected Job map scope
  -> clear selected Job highlight
  -> clear related AOI highlight
  -> restore normal Job layer filtering
```

Back flow:

```txt
Focused Job details
  -> Back to Jobs
  -> clear selected Job map scope
  -> clear selected Job highlight
  -> clear related AOI highlight
  -> show normal Jobs list
```

Rules:

- Selected Job map focus is initiated from Job details UI but coordinated by app composition.
- Job details UI must not import map controller code or relation backend details directly.
- Map focus uses the existing Job layer filtering path so shared Job filters and point clustering continue to work.
- Related AOIs are highlighted, not permanently filtered, until real AOI identifiers, geometry behavior and UX expectations are confirmed.
- Clearing selected Job map focus restores the normal map context without closing Job details.
- Backing out of focused Job details clears the selected Job map context because the user is leaving that focused details workflow.
- This flow must not introduce a final backend/AOI relation contract.

Implementation note:

`Focus map` is explicit rather than automatic. This avoids surprising map context changes when Job details is opened from the list, while still supporting a clear demo flow from Job details to focused map context.

### Map hover feedback

Status: Done

Current flow:

```txt
MapView pointer-move
  -> frame-throttled hitTest against registered Job/AOI layers
  -> first supported Job or AOI graphic
  -> cached FeatureLayerView highlight
  -> transient hover highlight
```

Rules:

- Map hover feedback is owned by `features/map/layers/mapHover.js`.
- Job geometry has hover priority over AOIs below it in the hit test result order.
- Hover state must remain transient map presentation state.
- Hovering an AOI must not update selected AOI state.
- Hovering a Job must not update selected Job state.
- Hover highlight must use a separate highlight handle from selected AOI, selected Job and related AOI highlights.
- Hover hit testing should be limited to registered Job/AOI layers.
- Hover layer views should be warmed and cached so normal pointer movement does not wait on layer-view resolution.
- Hover hit testing should be frame-throttled and coalesce pointer moves.
- Hover highlight should clear when the pointer leaves the map, when the window loses focus, when the document is hidden, when the user drags the map, when a map click begins or when the map controller is destroyed.
- Stale asynchronous hit-test results must not re-apply hover highlight after the pointer has left the map.
- Cursor styling is left to the default map cursor for now because the pointer cursor made hover feedback feel visually delayed.

### AOI popup action flow

Status: Done

Current flow:

```txt
AOI PopupTemplate action
  -> PopupViewModel trigger-action event
  -> app-level selected AOI callback
  -> selected AOI state
  -> selected AOI highlight
  -> Jobs panel scoped to selected AOI
```

Rules:

- Popup actions should be defined on the AOI `PopupTemplate`.
- Popup action wiring should wait for `view.popup.viewModel` with `reactiveUtils.whenOnce` because popup internals can be created lazily.
- Popup action handlers should extract stable AOI values from the selected popup feature.
- Popup action handlers should not load mock Jobs directly.
- Jobs panel filtering should use relation service/domain helpers.
- App-level composition should wire map events to Jobs UI behavior.
- Selecting `Show related Jobs` highlights the selected AOI on the map.
- Selected AOI highlight is visual only; relation filtering remains owned by the Jobs panel/relation flow.
- Closing the Jobs panel, reopening the normal Jobs list or selecting a Job clears the selected AOI highlight.
- Temporary popup debug logging should not remain in production-ready code.

Current action:

```txt
Show related Jobs
```

The action opens the Jobs panel, scopes it to Jobs related to the selected AOI and highlights the selected AOI.

Accessibility note:

When closing the Jobs panel, focus is moved back to the navbar Jobs control before the panel is hidden. This avoids hiding focused descendants from assistive technology.

### AOI-scoped Job map filtering

Status: Done

Current flow:

```txt
AOI PopupTemplate action
  -> selected AOI state
  -> Jobs panel scoped to selected AOI
  -> relation service resolves related Job ids
  -> map Job layer definition expressions include related Job ids
  -> Job point clustering follows the scoped visible Job set
```

Rules:

- AOI-scoped Job map filtering is map presentation state.
- The selected AOI state remains owned by `features/aoi/state`.
- AOI-to-Job relation lookup remains owned by `features/relations`.
- Map Job layer filtering remains owned by `features/map/filters`.
- Existing Job filters and AOI scope must be combined, not treated as competing filter modes.
- Done Jobs remain hidden by default inside an AOI scope unless the `Done` filter is explicitly active.
- Job point clustering should naturally reflect AOI scope through layer `definitionExpression` filtering.
- AOI scope must be cleared when the user returns to the normal Jobs list, closes the Jobs panel or selects a specific Job.
- If AOI scope resolution fails, the map must not leave a stale previous AOI Job scope active.

### Manual refresh flow

Status: Done

Current flow:

```txt
Jobs panel Refresh button or panel reopen
  -> Jobs store reloads through jobs/services
  -> Jobs panel rerenders
  -> job-manager:jobs-refreshed custom event with refreshed Jobs
  -> app-level refresh coordinator
  -> mapController.refreshJobData({ jobs })
  -> Job map layers repopulate from the same refreshed Jobs snapshot
  -> current Job filters reapplied
  -> current Job clustering settings reapplied
  -> AOI renderer summaries rebuilt
  -> active AOI scope or selected Job highlight reapplied best-effort
```

Mutation consistency flow:

```txt
Job status mutation
  -> Jobs store updates shared Jobs state
  -> Jobs panel rerenders
  -> open AOI popup summary re-renders from shared Jobs state
  -> app-level Jobs store subscription sees successful mutation change
  -> mapController.refreshJobData({ jobs })
  -> Job map layers repopulate from the shared Jobs store snapshot
  -> current Job filters reapplied
  -> current Job clustering settings reapplied
  -> active AOI map filters reapplied
  -> AOI renderer summaries rebuilt
  -> active AOI scope or selected Job focus/highlight reapplied best-effort
```

Rules:

- Job UI owns status button clicks and calls the Jobs store.
- Job UI must not import map controller code.
- The Jobs store may expose change metadata, but it does not own map behavior.
- App composition owns mutation-to-map synchronization because it coordinates Jobs state, map controller, selected AOI state and selected Job state.
- Map controller owns refreshing ArcGIS Job layer data and reapplying map-specific presentation state.
- Generated mock Jobs remain queued in the mock backend and should not appear on the map until they become part of the visible Jobs store after refresh or panel reopen.
- If map sync fails after a successful Job mutation, the mutation remains successful and a non-blocking map sync notice can be shown.
- AOI renderer refresh should not reset the AOI layer to the neutral default renderer before relation summaries are ready. Keep the previous renderer visible until the replacement renderer can be applied.
- AOI renderer summaries should use the shared Jobs store snapshot when available, so generated mock Jobs do not affect map-derived summaries before refresh or panel reopen.

Implementation note:

Mutation-to-map sync uses the same `mapController.refreshJobData({ jobs })` path as manual refresh, but it is triggered from app composition when `jobStore` reports a successful `jobStatusUpdated` change.

The Jobs UI remains unaware of the map. Status buttons call the Jobs store only. App composition coordinates the map update because it owns access to the Jobs store snapshot, selected AOI state, selected Job state and map controller.

The AOI renderer keeps the previous renderer active while relation summaries are rebuilt. This avoids a short neutral-color flash on AOIs that are colored because they have related Jobs.

Phase 22 test hardening:

- Manual refresh and mutation-to-map sync orchestration is isolated in `app/coordination/createMapSyncCoordinator.js`.
- The coordinator refreshes Job map data before attempting to restore selected AOI or selected Job map context.
- Selected AOI restore reapplies AOI Job scope and selected AOI highlight.
- Selected Job restore can reselect the refreshed Job model before reapplying map focus and related AOI highlight.
- Startup-time mutation changes remain recorded even when map sync is skipped before startup completion.
- Stale refresh results are ignored so older async refreshes cannot restore old selection state.
- Tests use injected map controller, selected-state stores and notice stubs to avoid ArcGIS-heavy integration tests.

### Startup loader and required data gate

Status: Done

Current startup flow:

```txt
createApp
  -> render app shell behind startup loader
  -> make app shell inert
  -> show transparent startup loader
  -> start map workspace behind loader
  -> validate AOI FeatureLayer readiness
  -> load Jobs through shared Jobs store
  -> populate Job map layers from loaded Jobs snapshot
  -> initialize map popup, hover, highlight, filters and clustering
  -> hide loader
  -> release app shell
```

Retry behavior:

```txt
Map/AOI startup fails
  -> startup loader shows map workspace retry countdown
  -> retry only map/AOI startup

Jobs load fails
  -> keep the ready map/AOI workspace
  -> startup loader shows Jobs load retry countdown
  -> retry only Jobs load

Job map rendering fails
  -> keep the ready map/AOI workspace
  -> keep the loaded Jobs snapshot
  -> startup loader shows Job map rendering retry countdown
  -> retry only Job layer population
```

Rules:

- Initial app access requires both AOIs and Jobs.
- Startup must not expose a partially usable app when AOIs or Jobs cannot load.
- Jobs initial load belongs to app startup, not to the Jobs panel.
- The Jobs panel should consume the shared startup-loaded Jobs store.
- Startup map layer population should use the Jobs snapshot already loaded by startup.
- AOI missing configuration is a startup blocker.
- AOI load failure is a startup blocker.
- AOI readiness states that indicate unusable AOI data are startup blockers.
- Post-startup manual refresh remains non-blocking when stale Jobs are still available.
- Notices are appropriate for post-startup outcomes, but startup failures should primarily be visible in the loader.
- Startup retry UI must not introduce backend-specific assumptions.
- The map workspace should start behind the loader, matching the Product Manager startup pattern.
- The startup loader is the only visible startup status surface.
- Map status messages must be suppressed during startup.
- Startup retry should resume from the failed stage where possible.
- A completed map/AOI startup stage must not be repeated just because Jobs loading failed.
- A completed Jobs load stage must not be repeated just because Job map layer rendering failed.

Cleanup notes:

- Startup retry is owned by the startup loader, not by map status or Jobs panel UI.
- Map status can still show post-startup map warnings, but it should not be used as the initial app retry surface.
- Jobs panel inline retry is reserved for post-startup refresh failures with stale Jobs still available.
- Initial Jobs loading must remain owned by app startup.
- Stale map status retry styling was removed after startup retry became loader-owned.
- Startup loader destroy cleanup now removes the loader element directly.
- Retry delay cleanup removes abort listeners after both abort and normal timeout.

Phase 21 test hardening:

- Startup stage orchestration is isolated in `app/startup/createStartupController.js`.
- The startup controller keeps stage readiness state across retry attempts.
- Retry after Jobs load failure should not recreate the map workspace.
- Retry after Job map rendering failure should not reload the map workspace or Jobs.
- Invalid Jobs load results fail startup before Job map rendering starts.
- Tests use injected stubs for map controller, job store and startup loader to avoid ArcGIS-heavy integration tests.

### AOI popup Job summary content

Status: Done

Current flow:

```txt
AOI PopupTemplate custom content
  -> selected AOI id from popup graphic attributes
  -> current shared Jobs store snapshot, when available
  -> current Job filters
  -> relation service snapshot
  -> AOI Job summary lookup
  -> popup summary metrics
```

Live-refresh flow:

```txt
Job filters change
  -> map controller reapplies Job layer filters
  -> AOI renderer refresh starts
  -> open AOI popup summary content re-renders

Jobs store changes
  -> app-level Jobs store subscription
  -> map controller asks open AOI popup summary content to re-render

Jobs refresh succeeds
  -> Jobs store changes
  -> Job map layers refresh
  -> open AOI popup summary content re-renders

Job status mutation succeeds
  -> Jobs store changes
  -> open AOI popup summary content re-renders
```

Current popup summary metrics:

- Related Jobs
- Active Jobs
- High-priority active Jobs

Rules:

- AOI popup summary content lives under `features/map/popups`.
- Popup summary content may use relation service snapshots, but must not know whether relations are mocked, geometry-derived or backend-provided.
- Popup summary content must not import from `features/jobs/mock`.
- Popup summary counts should reflect current Job filters where available.
- If the selected AOI id does not match relation summaries, the popup should show a neutral empty summary instead of failing.
- `Show related Jobs` remains a popup action and continues to open the Jobs panel scoped to the selected AOI.
- Open AOI popup summaries should refresh from current shared Jobs state when available.
- Popup summary live-refresh is best-effort and must not close/reopen the ArcGIS popup.
- Popup summary refresh must not block Job filter application, AOI renderer updates or manual refresh.
- Closed popup custom content can be cleaned up lazily on later refresh attempts.

Implementation note:

AOI popup live-refresh intentionally uses the shared Jobs store snapshot when available. This means popup summaries can reflect individual Job status mutations before the map Job layers are refreshed.

## 14. UI composition direction

Expected initial layout:

```txt
App shell
  Header / toolbar
  Main content
    Map area
    Job panel / list panel
  Notices
```

The layout should support both:

- map-first workflow
- list-first workflow

The exact responsive behavior can be refined later.

## 15. Calcite-first UI principle

Job Manager should use Calcite and Calcite Components where they fit the UI need.

Default approach:

- use Calcite for interactive UI controls
- use Calcite for forms and filter controls where practical
- use Calcite for popovers, dropdowns, panels and actions where practical
- keep semantic HTML for layout and document structure
- follow Product Manager patterns when they are already established

When Calcite is actively not used for a UI element where a relevant Calcite component was considered, log the decision in `docs/CALCITE_USAGE_LOG.md`.

This log is intended to preserve project reasoning and provide useful feedback to Esri.

## 16. Validation principles

For implementation changes, validate relevant flows:

- app builds
- app loads
- no console errors
- loading states are visible
- error states are visible
- notices appear for important outcomes
- map interactions do not break list state
- list interactions can affect map state
- user-facing text is English
- no secrets are committed

Phase 20 test hardening:

- Service boundary tests should prefer injected adapters/services instead of reaching into mock internals.
- Store tests should verify externally visible state snapshots and change metadata.
- AOI readiness tests should use lightweight FeatureLayer-compatible stubs instead of ArcGIS runtime objects.
- AOI overview filter tests should cover both safe no-match filtering and non-destructive fallback when relation ids are incompatible with the AOI identifier field.
- Tests should not introduce backend endpoint, auth or environment assumptions.

Phase 21 startup coordination tests:

- Startup coordination tests should use injected map/job/loader dependencies.
- Tests should verify stage order and retry reuse through externally visible calls.
- Tests should avoid ArcGIS runtime objects unless a later integration-test setup is explicitly introduced.
- Startup tests must not introduce backend endpoint, auth or AOI contract assumptions.

Phase 22 map refresh coordination tests:

- Map refresh coordination tests should use injected map controller and selected-state stores.
- Tests should verify externally visible map controller calls instead of ArcGIS runtime objects.
- Tests should cover selected AOI restore, selected Job restore, mutation sync gating, stale refresh guards and refresh failure notices.
- Tests must not introduce backend endpoint, auth or AOI contract assumptions.

Phase 23 baseline review:

- Docs/status cleanup should not introduce runtime behavior changes.
- Backend and final AOI blockers should remain explicit when selecting the next work item.
- Next feature work should prefer existing UI/UX polish unless real backend or AOI Feature Service inputs are available.
- Documentation should avoid duplicating identical architecture sections during wrap-up updates.

Phase 24 cluster picker popup-state tests:

- Popup-state tests should stay pure and avoid ArcGIS runtime objects.
- Tests should cover aggregate popup detection through selected feature, view model selected feature and popup feature collections.
- Tests should verify that normal Job popups are not closed by aggregate popup cleanup.

Phase 25 Job popup/panel tests:

- Popup-state tests should stay pure and avoid ArcGIS runtime objects.
- Tests should cover normal Job popup detection, specific Job id matching and close behavior.
- Tests should verify that aggregate/cluster popup detection remains separate from normal Job popup detection.
- Manual layout validation should include Jobs panel list mode, details mode, sticky header behavior and full-height bottom alignment.

## 17. Documentation rules

Update documentation when:

- a new feature boundary is introduced
- a backend assumption changes
- a mock behavior is added or removed
- a clustering decision is made
- a new important UI flow is implemented
- a known limitation is discovered

Avoid duplicating large sections between docs. Keep:

- roadmap and status in `PROJECT_TRACKER.md`
- backend contract notes in `BACKEND_CONTRACTS.md`
- architecture and folder ownership in `ARCHITECTURE.md`
```

---

## src/JobManager/docs/BACKEND_CONTRACTS.md

```
# Job Manager Backend Contracts

This document tracks backend assumptions, draft contracts, open questions and integration decisions for Job Manager.

The backend does not exist yet. Do not treat any draft in this document as final until it has been confirmed with the backend implementation.

## 1. Current backend status

Status: Not available

Current assumptions:

- AOIs are loaded from an ArcGIS/Esri Feature Service.
- Jobs are initially loaded from mock data.
- AOI/Job relations are initially mocked or derived from mock Job data.
- The future backend may provide Jobs, Job mutations and AOI/Job relations.
- Automatic priority changes over time are owned by the backend, not the frontend.

## 2. Frontend integration principles

The frontend must not be tightly coupled to the future backend contract.

Rules:

- UI must use service functions, not raw backend or mock calls.
- Incoming data must be normalized before it reaches UI components.
- Mock backend behavior must stay isolated behind services.
- Backend-specific field names must not leak into UI components.
- The app must not commit private endpoints, tokens or credentials.

## 2.1 Phase 11 readiness review

Status: Reviewed after Phase 10

Current findings:

- `.env.example` contains placeholder URLs only.
- Runtime config only reads safe browser-exposed `VITE_` values.
- No private backend endpoint, token, credential or portal-specific secret is committed.
- Jobs are accessed through `features/jobs/services/jobService.js`.
- Mock Jobs remain isolated under `features/jobs/mock`.
- AOI Feature Service assumptions are centralized in `features/aoi/config/aoiFieldConfig.js`.
- AOI FeatureLayer readiness validation is isolated in `features/aoi/services/aoiService.js`.
- AOI map display is still owned by the ArcGIS FeatureLayer.
- AOI/Job relation source values already allow `mock`, `frontendGeometry` and `backend`.

Decision:

Do not add a backend API base URL or backend auth config until the backend exists. Keep browser-exposed runtime config limited to values that are safe to expose.

## 2.2 Phase 18 Job service adapter preparation

Status: Done

Current decision:

Job service now has an explicit adapter boundary.

Current behavior:

- Mock remains the default Job data source.
- `features/jobs/services/jobService.js` exposes the current service-facing methods.
- `features/jobs/services/mockJobServiceAdapter.js` adapts the existing mock backend.
- `features/jobs/services/unavailableHttpJobServiceAdapter.js` exists only as a future seam.
- No backend API base URL is introduced.
- No endpoint path is introduced.
- No authentication behavior is introduced.
- No final backend response contract is introduced.

Adapter expectation:

```txt
loadJobs()
  -> { jobs }

updateJobStatus(jobId, status)
  -> { job, createdJobs }
```

The adapter expectation mirrors the existing frontend service need and mock behavior. It should not be treated as a final backend contract until a real backend exists.

Backend implication:

Future backend work can implement an HTTP adapter behind the existing Job service without changing Jobs UI or map/list coordination first.

## 2.3 Current mock backend behavior

Status: Done for current mock/frontend phase

The mock backend exists to exercise frontend UX and service boundaries before the real backend exists.

Current behavior:

- Jobs are loaded through `features/jobs/services/jobService.js`.
- Mock implementation lives under `features/jobs/mock`.
- UI components must not import mock backend modules directly.
- Mock Jobs are normalized into the stable frontend Job model.
- Mock Jobs include point and polygon geometry.
- Mock Jobs include `relatedAoiIds` for relation testing.
- Mock load operations simulate latency.
- Mock load operations can fail.
- Mock status mutations simulate latency.
- Mock status mutations can fail.
- Completing a Job can create a generated Job.
- Generated Jobs are stored in the mock backend immediately.
- Generated Jobs are returned from the mutation result as `createdJobs`.
- Generated Jobs are not inserted into the current visible Jobs store immediately.
- Generated Jobs become visible after refresh or panel reopen.

Default mock configuration:

```txt
latencyMinMs: 250
latencyMaxMs: 1000
loadFailureRate: 0.05
mutationFailureRate: 0.15
cyclicJobCreationRate: 0.85
```

Generated Job behavior:

```txt
Job marked Done
  -> mock backend updates the completed Job
  -> mock backend may create a generated Job
  -> generated Job is stored in mock backend
  -> mutation result returns updated Job and createdJobs
  -> Jobs store updates the completed Job only
  -> created Job becomes visible after refresh or panel reopen
```

Current frontend mutation-to-map sync behavior:

```txt
Visible Job status updated
  -> Jobs store updates the visible Job snapshot
  -> app composition detects a successful jobStatusUpdated change
  -> map Job layers are refreshed from the shared Jobs store snapshot
  -> AOI renderer summaries are rebuilt from the same visible Jobs snapshot
  -> active map scope/highlight state is reapplied best-effort
```

Generated Job behavior remains intentionally different:

```txt
Generated mock Job created
  -> generated Job is stored in mock backend
  -> generated Job is returned for notice/future compatibility
  -> generated Job is not inserted into the visible Jobs store
  -> generated Job is not rendered on the map until refresh or panel reopen
```

Backend implication:

The future backend may choose whether status mutation responses can include newly created follow-up Jobs. The current frontend supports a `createdJobs` mutation result shape for notices and future compatibility, but treats returned generated Jobs as queued work for the current visible session. New Jobs should not appear in the current visible map/list snapshot until the frontend receives them through the normal load/refresh path, unless that product decision changes later.

## 2.4 Phase 23 hardened baseline review

Status: Reviewed

Current decision:

No backend contract changes are introduced by the hardened baseline review.

Current blockers remain unchanged:

- Job HTTP adapter implementation is blocked until a real endpoint shape, authentication behavior and guaranteed Job fields are known.
- Final AOI integration work is blocked until real AOI Feature Service fields, auth requirements, geometry type, spatial reference, service size and relation identifier ownership are confirmed.
- AOI details, canonical queried AOI state, selected-Job permanent AOI filtering and AOI clustering remain deferred until those inputs exist.

Backend implication:

The next safe frontend work should avoid adding endpoint paths, auth assumptions or final AOI relation assumptions.

## 2.5 Phase 25 UI polish review

Status: Reviewed

Current decision:

No backend contract changes are introduced by the Job popup, Jobs panel or panel layout polish.

Current behavior remains unchanged:

- Job data still flows through the Job service adapter boundary.
- AOIs still flow through the configured ArcGIS FeatureLayer.
- AOI/Job relations remain service/domain-derived and source-flexible.
- No Job endpoint paths, auth behavior, response shapes or AOI relation ownership assumptions are introduced.

Backend implication:

The next safe frontend work should continue to avoid endpoint paths, auth assumptions and final AOI relation assumptions unless real backend/AOI inputs are available.

## 3. Expected backend responsibilities

Likely future backend responsibilities:

- return Jobs
- update Job status
- return or calculate AOI/Job relations
- manage automatic priority changes over time
- return user-safe errors
- possibly return operation conflict responses
- possibly support refresh or operation status endpoints later

## 4. Draft frontend Job model

The frontend should normalize backend or mock Job data into this shape:

```js
{
  id: "job-001",
  title: "Review affected AOIs",
  summary: "Short user-facing description of the work.",
  createdAt: "2026-06-15T10:00:00.000Z",
  deadline: "2026-06-30T00:00:00.000Z",
  priority: "medium",
  status: "todo",
  geometry: {
    type: "polygon",
    rings: [],
    spatialReference: {
      wkid: 4326
    }
  },
  relatedAoiIds: ["aoi-001", "aoi-002"]
}
```

Mock Jobs may use either point or polygon geometry. Geometry should be within Denmark or the surrounding Danish waters.

Initial geometry types:

```txt
point
polygon
```

Internal status values:

```txt
todo
inProgress
done
```

User-facing status labels:

```txt
To do
In Progress
Done
```

Internal priority values:

```txt
low
medium
high
```

User-facing priority labels:

```txt
Low
Medium
High
```

### Current frontend Job geometry map implementation

Status: Done for current mock/frontend phase

The frontend displays mock Job geometry on the map through read-only client-side FeatureLayers.

Current behavior:

- point Job geometry is displayed in a dedicated point layer
- polygon Job geometry is displayed in a dedicated polygon layer
- Job map attributes are derived from the normalized frontend Job model
- Job layer data is loaded through `jobs/services`
- Job geometry popup shows basic Job metadata
- Job popup action can open Job details in the Jobs panel
- selecting a Job can highlight the selected Job geometry and related AOIs
- Job point clustering is implemented for geographic overview
- Job cluster picker can open the normal Job feature popup for a cluster member Job

Current limitations:

- editing Job geometry is not supported
- Job polygon clustering is not supported
- final backend geometry ownership is not confirmed
- map Job layers are refreshed from the shared startup/manual-refresh Jobs snapshot and from successful visible Job status mutations
- generated mock Jobs are intentionally not inserted into map Job layers until they become part of the visible Jobs store after refresh or panel reopen

Backend assumptions remain unchanged:

- backend may later provide Jobs and Job geometry directly
- backend may later own authoritative Job/AOI relation calculation
- frontend should continue normalizing incoming Job geometry before UI or map use

Decision:

Keep AOI FeatureLayer ownership for map display until the real AOI Feature Service is confirmed. The AOI service should provide validation and normalization helpers, but should not eagerly query all AOIs into frontend state without a concrete UI/backend requirement.

## 5. Draft frontend AOI model

The frontend should normalize AOI data into a stable model before UI use.

```js
{
  id: "aoi-001",
  name: "Area of Interest 001",
  geometry: null,
  attributes: {},
  jobSummary: {
    total: 2,
    active: 1,
    highPriority: 1
  }
}
```

The actual source fields from the AOI Feature Service are not known yet.

### Current AOI Feature Service integration status

Status: In progress

The frontend has an AOI Feature Service configuration skeleton based on `VITE_AOI_FEATURE_SERVICE_URL`.

No private endpoint, token or credential is committed.

Current frontend implementation:

- resolves AOI source configuration from runtime config
- can create an ArcGIS `FeatureLayer` from the configured AOI Feature Service URL
- centralizes current test-service field names in `features/aoi/config/aoiFieldConfig.js`
- exposes an AOI service facade with a stable API result shape
- validates AOI FeatureLayer readiness after the layer loads
- validates required and recommended provisional AOI fields
- checks AOI feature count best-effort
- shows map warnings for missing config, field mismatch and empty AOI sources
- shows a user-facing notice when the AOI layer cannot be loaded
- filters AOI popup field rows to fields available in the loaded Feature Service
- includes AOI normalization helpers for current test-service field names and legacy/provisional fallbacks
- configures an AOI popup template using available test-service metadata

Current limitations:

- real AOI querying into AOI state is not implemented in the AOI service yet
- AOI FeatureLayer remains the owner of map AOI display
- AOI clustering is deferred until real geometry characteristics are known
- current field mapping is based on a temporary test Feature Service and must not be treated as the final backend contract
- normalized canonical AOI state is intentionally deferred until real AOI field, auth, geometry and service-size requirements are confirmed

Current required provisional AOI fields:

```txt
GlobalID
PRODUCTNAME
```

Current recommended provisional AOI fields:

```txt
OBJECTID
PRODUCTID
SERIES
EDITION
ISSUEDATE
```

Decision:

Use `GlobalID` as the provisional frontend AOI identifier for the test Feature Service. Use `PRODUCTNAME` as the provisional display name. Use `OBJECTID` for ArcGIS/service mechanics only. Do not treat this as the final backend contract until the real AOI Feature Service is created.

Keep AOI FeatureLayer ownership for map display until the real AOI Feature Service is confirmed. The AOI service should provide validation and normalization helpers, but should not eagerly query all AOIs into frontend state without a concrete UI/backend requirement.

### Phase 19 AOI service readiness review

Status: Reviewed

Current decision:

AOI FeatureLayer ownership remains the right current approach.

Current behavior to preserve:

- AOI FeatureLayer owns current map AOI display.
- AOI service owns readiness validation for the configured FeatureLayer.
- AOI service exposes a stable `loadAois()` facade but does not query all AOIs into canonical frontend state.
- AOI field mapping remains based on the current test service only.
- `GlobalID` remains the provisional AOI identifier.
- `PRODUCTNAME` remains the provisional AOI display field.
- `OBJECTID` remains ArcGIS/service mechanics only.
- AOI overview filtering can only safely filter AOIs when relation ids are compatible with the configured AOI identifier field.

Deferred until real AOI/backend inputs exist:

- canonical queried AOI state
- AOI details
- AOI clustering or representative-point overview layer
- selected-Job permanent AOI layer filtering
- AOI auth handling
- final AOI relation identifier ownership

Backend implication:

A future backend or relation service should return AOI identifiers compatible with the configured AOI Feature Service identifier field if those relations are expected to drive AOI map filtering.

## 6. Draft relation model

AOI/Job relation data should be represented independently of its source.

```js
{
  jobId: "job-001",
  aoiIds: ["aoi-001", "aoi-002"],
  source: "mock"
}
```

Possible relation sources:

```txt
mock
frontendGeometry
backend
```

The `source` field is intended for diagnostics and development. It should normally not be shown to users.

## 7. Draft Job API assumptions

These are draft assumptions only.

### Load Jobs

Expected frontend service need:

```txt
loadJobs()
```

Possible backend shape later:

```txt
GET /jobs
```

Expected result:

```js
{
  jobs: [];
}
```

### Update Job status

Expected frontend service need:

```txt
updateJobStatus(jobId, status)
```

Possible backend shape later:

```txt
PATCH /jobs/{jobId}/status
```

Expected request:

```js
{
  status: "inProgress";
}
```

Expected result:

```js
{
  job: {},
  createdJobs: []
}
```

`createdJobs` supports the cyclic work scenario where completing one Job may create follow-up Jobs.

## 8. Draft AOI/Job relation API assumptions

Expected frontend service needs:

```txt
loadAoiJobRelations()
getJobsForAoi(aoiId)
getAoisForJob(jobId)
```

Possible backend options:

1. Backend returns relations with Jobs.
2. Backend returns a dedicated relation endpoint.
3. Backend calculates spatial intersections and returns affected AOIs per Job.
4. Frontend temporarily derives relations from mock data.

No option is final yet.

### Current frontend relation implementation

Status: Done for current mock/frontend phase

The frontend has a relation foundation under `features/relations`.

Current behavior:

- relation model uses `jobId`, `aoiIds` and `source`
- initial relation source is `mock`
- mock relations are derived from normalized Job `relatedAoiIds`
- AOI summaries can be derived from Jobs and relations
- relation lookup supports both AOI-to-Jobs and Job-to-AOIs direction
- map renderer consumes AOI summaries as best-effort data
- Jobs panel can show Jobs scoped to a selected AOI using relation helpers
- map Job layers can be scoped to Jobs related to a selected AOI
- relation snapshots can apply current Job filters before summaries are built

Current AOI summary fields:

```txt
total
active
highPriority
activeHighPriority
jobIds
```

Field meaning:

- `total` counts all related Jobs.
- `active` counts related Jobs that are not `Done`.
- `highPriority` counts all related high-priority Jobs.
- `activeHighPriority` counts related high-priority Jobs that are not `Done`.
- `jobIds` is intended for frontend lookup and diagnostics.

User-facing AOI summaries should normally display counts, not raw IDs.

Backend assumptions remain unchanged:

- backend may later return AOI/Job relations directly
- backend may later calculate spatial intersections
- frontend relation source can change from `mock` to `frontendGeometry` or `backend`
- UI should not need to change when the relation source changes

### Current AOI overview filtering implication

Status: Done for current frontend phase

AOI overview filters currently use relation service snapshots to derive which AOIs should remain visible on the map.

Current frontend behavior:

- AOI overview filtering is controlled by frontend map state.
- Relation membership is derived behind `features/relations`.
- Current Job filters are applied before AOI membership is calculated.
- AOI FeatureLayer filtering uses provisional `GlobalID` matching.
- If relation AOI ids do not look compatible with `GlobalID`, the frontend falls back to showing all AOIs.
- The frontend does not call ArcGIS `queryFeatures` to validate generated AOI filter expressions.

Backend implications:

- A future backend relation contract should provide AOI identifiers that match the configured AOI Feature Service identifier field.
- If the backend provides AOI/Job relations directly, those relation ids should be stable and documented.
- If the backend calculates spatial intersections, the returned AOI ids should be compatible with the frontend AOI id field.
- Final AOI identifier ownership remains open until the real AOI Feature Service and backend relation direction are confirmed.

Phase 17 frontend UX implication:

The frontend now distinguishes between two AOI overview edge cases:

```txt
Active AOI overview filter has compatible AOI ids but no matches
  -> AOI FeatureLayer can be filtered to no AOIs
  -> map status explains that no AOIs match the active AOI overview and Job filters

Active AOI overview filter has relation AOI ids that are incompatible with the current AOI service id field
  -> AOI FeatureLayer is not destructively filtered
  -> all AOIs remain visible
  -> map status explains that the AOI overview filter could not be safely applied
```

Backend implication remains unchanged: future relation ids should match the configured AOI Feature Service identifier field if backend-provided AOI/Job relations are expected to drive AOI map filtering.

## 9. Error handling assumptions

Backend errors should eventually be normalized into user-safe frontend errors.

The frontend should distinguish at least:

- load failure
- mutation failure
- validation failure
- conflict
- unauthorized
- unavailable backend
- unknown error

User-facing error messages must be English.

## 10. Open backend questions

| ID     | Question                                                |      Status | Notes                                                                                                                    |
| ------ | ------------------------------------------------------- | ----------: | ------------------------------------------------------------------------------------------------------------------------ |
| BE-001 | Will the backend provide AOI/Job relations directly?    |        Open | Important for relation service design.                                                                                   |
| BE-002 | Will backend calculate spatial intersections?           |        Open | Preferred if backend has authoritative geometry access.                                                                  |
| BE-003 | What Job fields are guaranteed?                         |        Open | Needed before final normalization.                                                                                       |
| BE-004 | Can updating a Job return newly created follow-up Jobs? |        Open | Useful for cyclic work UX.                                                                                               |
| BE-005 | Will status updates support conflict responses?         |        Open | Useful for multi-user safety.                                                                                            |
| BE-006 | Will AOI Feature Service require authentication?        |        Open | Important for config/security. Do not add tokens or credentials to source code.                                          |
| BE-007 | Which AOI fields are stable identifiers?                | In progress | Test service uses `GlobalID` provisionally. Final service identifier is not confirmed.                                   |
| BE-008 | Will priority be returned as a current computed value?  |        Open | Frontend should not compute long-term priority.                                                                          |
| BE-009 | What AOI field should be used as the display name?      | In progress | Test service uses `PRODUCTNAME` provisionally. Final display field is not confirmed.                                     |
| BE-010 | What is the AOI geometry type and spatial reference?    |        Open | Required before deciding renderer, selection behavior and clustering strategy.                                           |
| BE-011 | How large and dense is the AOI Feature Service?         |        Open | Required before deciding whether to query all AOIs eagerly or page/filter.                                               |
| BE-012 | Should `PRODUCTID` participate in AOI/Job relations?    |        Open | It may be domain-relevant, but current test field is nullable, so it should not replace `GlobalID` without confirmation. |

## 11. Notes for future updates

When backend work begins, update this document with:

- confirmed endpoints
- request/response examples
- error response shapes
- authentication assumptions
- relation calculation ownership
- known limitations
```

---

## src/JobManager/docs/CALCITE_USAGE_LOG.md

```
# Calcite Usage Log

Job Manager should use Calcite and Calcite Components where they fit the UI need.

This document tracks deliberate decisions to use Calcite, and especially deliberate decisions not to use Calcite where a Calcite component looked applicable.

Normal semantic HTML elements such as `header`, `main`, `section`, `nav`, `div`, `h1` and `p` are not considered Calcite opt-outs. An opt-out means choosing custom/native UI where a relevant Calcite component was considered and rejected.

## Policy

Default:

- Prefer Calcite components for buttons, actions, panels, dropdowns, popovers, forms, notices and other interactive UI.
- Use Product Manager patterns where they are already established.
- Use plain semantic HTML for layout and document structure.
- Log active Calcite opt-outs with the reason and any feedback that may be useful to Esri.

## Current Calcite usage

| Area                    | Calcite usage                                         | Notes                                                                                                        |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Navbar Jobs control     | `calcite-icon`                                        | Used inside a native `button` because `calcite-button` styling did not fit the Product Manager-style navbar. |
| Navbar icon actions     | `calcite-action`                                      | Used for Filters and Test notice.                                                                            |
| Navbar theme toggle     | `calcite-action`                                      | Used for light/dark mode toggle, matching Product Manager navbar action pattern.                             |
| Filters panel-dropdown  | `calcite-popover`                                     | Used because filter UI needs panel-like content, not a short menu list.                                      |
| Filter form controls    | `calcite-checkbox`, `calcite-button`, `calcite-label` | Used for Job filters and Job point clustering settings.                                                      |
| Jobs panel close action | `calcite-action`                                      | Used instead of a native close button.                                                                       |

## Active Calcite opt-outs

| Date       | Area                     | Calcite component considered | Decision                                | Reason                                                                                                                                                                                                                     | Esri feedback                                                                                                                                       |
| ---------- | ------------------------ | ---------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-15 | Navbar Jobs panel toggle | `calcite-button`             | Use native `button` with `calcite-icon` | `calcite-button` worked functionally, but the shadow-DOM button styling and focus outline did not align well with the Product Manager navbar style. A native button gives better control while still using a Calcite icon. | A lightweight navbar/panel-toggle variant for `calcite-button` could be useful for app headers that need Product Manager-style navigation controls. |

## Decision notes

### Filters use `calcite-popover` instead of `calcite-dropdown`

Status: Done

The Filters UI needs room for quick filters at the top and later fuller AOI/Job attribute filters. A short list-style dropdown is too restrictive for that layout.

This is not a Calcite opt-out because the implementation still uses Calcite. The decision is to use `calcite-popover` rather than `calcite-dropdown`.
```

---

## src/JobManager/package.json

```
{
  "name": "job-manager",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint .",
    "test": "node --test",
    "check": "npm run format:check && npm run lint && npm run test && npm run build",
    "rdy": "npm run format && npm run lint && npm run test && npm run build && npm run dev"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "eslint": "^10.5.0",
    "eslint-config-prettier": "^10.1.8",
    "globals": "^17.6.0",
    "prettier": "^3.8.4",
    "vite": "^8.0.16",
    "vite-plugin-mkcert": "^1.17.10"
  },
  "dependencies": {
    "@arcgis/core": "^5.0.9",
    "@esri/calcite-components": "^5.0.2",
    "bootstrap": "^5.3.8",
    "express": "^5.2.1",
    "node-expose-sspi": "^0.1.60"
  }
}
```

---

## src/JobManager/public/components/navbar.html

```
<header id="header">
  <div class="header-left">
    <img src="/images/logo96.png" alt="GST" class="navbar-logo" width="42" height="42" />
  </div>

  <nav class="header-center" aria-label="Primary navigation">
    <a href="#" class="navbar-title-link">Job Manager</a>

    <button
      id="jobs-toggle"
      type="button"
      class="navbar-panel-button"
      aria-controls="job-manager-jobs-panel"
      aria-expanded="true"
    >
      <calcite-icon icon="list" scale="s" aria-hidden="true"></calcite-icon>
      <span>Jobs</span>
    </button>
  </nav>

  <div class="header-right">
    <span id="last-updated">Updated: -</span>

    <calcite-action
      id="filters-button"
      icon="filter"
      text="Filters"
      title="Filters"
      aria-expanded="false"
    ></calcite-action>

    <calcite-action
      id="theme-toggle"
      icon="moon"
      text="Switch to dark mode"
      label="Switch to dark mode"
      title="Switch to dark mode"
    ></calcite-action>

    <calcite-popover
      id="filters-popover"
      label="Filters"
      placement="bottom-end"
      overlay-positioning="fixed"
      scale="m"
      trigger-disabled
    >
      <section class="job-manager-filter-popover" aria-label="Filters">
        <div class="job-manager-filter-popover__header">
          <div>
            <h2 class="job-manager-filter-popover__title">Filters</h2>
            <p class="job-manager-filter-popover__subtitle">Filter AOIs and Jobs.</p>
          </div>

          <calcite-action
            id="filters-close-button"
            icon="x"
            text="Close Filters"
            title="Close Filters"
          ></calcite-action>
        </div>

        <section class="job-manager-filter-popover__section">
          <h3 class="job-manager-filter-popover__section-title">Quick filters</h3>

          <div class="job-manager-filter-popover__quick-filters">
            <calcite-button
              appearance="outline"
              kind="neutral"
              scale="s"
              data-filter-placeholder="AOIs with Jobs"
            >
              AOIs with Jobs
            </calcite-button>

            <calcite-button
              appearance="outline"
              kind="neutral"
              scale="s"
              data-filter-placeholder="Active Jobs"
            >
              Active Jobs
            </calcite-button>

            <calcite-button
              appearance="outline"
              kind="neutral"
              scale="s"
              data-filter-placeholder="High Priority"
            >
              High Priority
            </calcite-button>
          </div>
        </section>

        <section class="job-manager-filter-popover__section">
          <h3 class="job-manager-filter-popover__section-title">AOI filters</h3>

          <p class="job-manager-filter-popover__placeholder">
            AOI attribute filters will be added after the AOI Feature Service fields are verified.
          </p>
        </section>

        <section class="job-manager-filter-popover__section">
          <h3 class="job-manager-filter-popover__section-title">Job filters</h3>

          <p class="job-manager-filter-popover__placeholder">
            Status, priority and deadline filters will be connected after shared filter state
            exists.
          </p>
        </section>
      </section>
    </calcite-popover>

    <calcite-action
      id="test-notice-button"
      icon="bell"
      text="Test notice"
      title="Test notice"
    ></calcite-action>
  </div>
</header>
```

---

## src/JobManager/src/app/createApp.js

```
import { createSelectedAoiStore } from "../features/aoi/state/selectedAoiStore.js";
import { createJobFilterStore } from "../features/jobs/state/jobFilterStore.js";
import { createJobStore } from "../features/jobs/state/jobStore.js";
import { createSelectedJobStore } from "../features/jobs/state/selectedJobStore.js";
import { createMapController } from "../features/map/core/mapController.js";
import { createAoiMapFilterStore } from "../features/map/state/aoiMapFilterStore.js";
import { createJobClusterSettingsStore } from "../features/map/state/jobClusterSettingsStore.js";
import { showErrorNotice, showSuccessNotice } from "../features/notices/services/noticeService.js";
import { createNoticeRegion } from "../features/notices/ui/noticeContainer.js";
import { createThemeStore } from "../features/theme/state/themeStore.js";
import { getRuntimeConfig } from "../shared/config/runtimeConfig.js";
import { createStartupController } from "./startup/createStartupController.js";
import { createMapSyncCoordinator } from "./coordination/createMapSyncCoordinator.js";
import { createStartupLoader } from "../shared/ui/startupLoader.js";
import { createJobsOverlay } from "./ui/createJobsOverlay.js";
import { createMapWorkspace } from "./ui/createMapWorkspace.js";
import { createNavbarController } from "./ui/createNavbarController.js";

export async function createApp(rootElement) {
  const runtimeConfig = getRuntimeConfig();
  const selectedAoiStore = createSelectedAoiStore();
  const selectedJobStore = createSelectedJobStore();
  const jobFilterStore = createJobFilterStore();
  const jobStore = createJobStore();
  const aoiMapFilterStore = createAoiMapFilterStore();
  const jobClusterSettingsStore = createJobClusterSettingsStore();
  const themeStore = createThemeStore();
  const noticeRegion = createNoticeRegion();
  const startupLoader = createStartupLoader();
  const appEventAbortController = new AbortController();

  let isStartupComplete = false;
  let isSelectedJobMapScopeActive = false;

  const navbar = await createNavbarController({
    jobFilterStore,
    aoiMapFilterStore,
    jobClusterSettingsStore,
    themeStore,
    onTestNotice() {
      showSuccessNotice({
        title: "Notice pipeline ready",
        message: "User-facing notices can now be triggered from services.",
      });
    },
  });

  const jobsPanel = createJobsOverlay({
    jobFilterStore,
    jobStore,
  });
  const workspace = createMapWorkspace();

  const mapController = createMapController({
    container: workspace.mapViewElement,
    statusElement: workspace.mapStatusElement,
    runtimeConfig,
    onError(error) {
      showErrorNoticeAfterStartup({
        title: "Map could not be loaded",
        message: error.message,
      });
    },
    onJobLayerError(error) {
      showErrorNoticeAfterStartup({
        title: "Job geometry could not be loaded",
        message: error.message,
      });
    },
    onAoiLayerError(error) {
      showErrorNoticeAfterStartup({
        title: "AOIs could not be loaded",
        message: error.message,
      });
    },
    getJobs() {
      return jobStore.getSnapshot().jobs;
    },
    onShowRelatedJobs(selectedAoi) {
      const normalizedSelectedAoi = selectedAoiStore.selectAoi(selectedAoi);

      isSelectedJobMapScopeActive = false;

      if (!normalizedSelectedAoi.aoiId) {
        showErrorNotice({
          title: "AOI selection failed",
          message: "The selected AOI does not expose a usable identifier.",
        });

        return;
      }

      selectedJobStore.clearSelection();
      jobsPanel.clearSelectedJob();
      mapController.clearJobHighlight();

      void mapController
        .applyAoiJobScope(normalizedSelectedAoi)
        .then((result) => {
          if (!result.ok) {
            showErrorNotice({
              title: "Related Jobs could not be shown on the map",
              message: result.error.message,
            });
          }
        })
        .catch((error) => {
          showErrorNotice({
            title: "Related Jobs could not be shown on the map",
            message: error.message,
          });
        });

      void mapController.highlightAoiById(normalizedSelectedAoi.aoiId).catch((error) => {
        mapController.clearAoiHighlight();

        showErrorNotice({
          title: "AOI highlight failed",
          message: error.message,
        });
      });

      jobsPanel.showJobsForAoi(normalizedSelectedAoi);
      setPanelOpen(jobsPanel.element, navbar.jobsButton, true);
    },
    onShowJobDetails(selectedJob) {
      const normalizedSelectedJob = selectedJobStore.selectJob(selectedJob);

      if (!normalizedSelectedJob.jobId) {
        showErrorNotice({
          title: "Job selection failed",
          message: "The selected Job does not expose a usable identifier.",
        });

        return;
      }

      isSelectedJobMapScopeActive = false;
      selectedAoiStore.clearSelection();
      mapController.clearAoiJobScope();
      jobsPanel.showJobDetails(normalizedSelectedJob);
      setPanelOpen(jobsPanel.element, navbar.jobsButton, true);
      applySelectedJobMapHighlights(normalizedSelectedJob);
    },
  });

  workspace.element.appendChild(jobsPanel.element);

  const shellElement = document.createElement("div");
  shellElement.className = "job-manager-app job-manager-app--startup-blocked";
  shellElement.inert = true;
  shellElement.setAttribute("aria-hidden", "true");
  shellElement.append(navbar.element, workspace.element, noticeRegion);

  rootElement.replaceChildren(shellElement, startupLoader.element);

  const startupController = createStartupController({
    startupLoader,
    mapController,
    jobStore,
  });
  const mapSyncCoordinator = createMapSyncCoordinator({
    mapController,
    selectedAoiStore,
    selectedJobStore,
    showErrorNotice,
    getIsStartupComplete() {
      return isStartupComplete;
    },
    getIsSelectedJobMapScopeActive() {
      return isSelectedJobMapScopeActive;
    },
  });

  const unsubscribeMapJobFilters = jobFilterStore.subscribe((snapshot) => {
    mapController.applyJobFilters(snapshot.filters);
  });

  const unsubscribeMapJobClusterSettings = jobClusterSettingsStore.subscribe((snapshot) => {
    mapController.applyJobClusterSettings(snapshot.settings);
  });

  const unsubscribeMapAoiFilters = aoiMapFilterStore.subscribe((snapshot) => {
    mapController.applyAoiMapFilters(snapshot.filters);
  });

  const unsubscribeJobStoreSync = jobStore.subscribe((snapshot) => {
    mapController.refreshAoiPopupContent();
    void mapSyncCoordinator.syncMapAfterJobStoreChange(snapshot);
  });

  jobsPanel.element.addEventListener(
    "job-manager:aoi-filter-cleared",
    () => {
      isSelectedJobMapScopeActive = false;
      selectedAoiStore.clearSelection();
      mapController.clearAoiHighlight();
      mapController.clearAoiJobScope();
    },
    {
      signal: appEventAbortController.signal,
    }
  );

  jobsPanel.element.addEventListener(
    "job-manager:job-selection-cleared",
    () => {
      isSelectedJobMapScopeActive = false;
      selectedJobStore.clearSelection();
      mapController.closeJobPopup();
      mapController.clearJobHighlight();
      mapController.clearAoiHighlight();
      mapController.clearAoiJobScope();
    },
    {
      signal: appEventAbortController.signal,
    }
  );

  jobsPanel.element.addEventListener(
    "job-manager:job-map-focus-requested",
    (event) => {
      const normalizedSelectedJob = selectedJobStore.selectJob(event.detail?.job);

      if (!normalizedSelectedJob.jobId) {
        showErrorNotice({
          title: "Job map focus failed",
          message: "The selected Job does not expose a usable identifier.",
        });

        return;
      }

      isSelectedJobMapScopeActive = true;
      selectedAoiStore.clearSelection();

      void mapController
        .applySelectedJobMapScope(normalizedSelectedJob)
        .then((result) => {
          if (!result.ok) {
            showErrorNotice({
              title: "Job map focus failed",
              message: result.error.message,
            });
          }
        })
        .catch((error) => {
          showErrorNotice({
            title: "Job map focus failed",
            message: error.message,
          });
        });

      applySelectedJobMapHighlights(normalizedSelectedJob);
    },
    {
      signal: appEventAbortController.signal,
    }
  );

  jobsPanel.element.addEventListener(
    "job-manager:job-map-focus-cleared",
    () => {
      isSelectedJobMapScopeActive = false;
      selectedAoiStore.clearSelection();
      selectedJobStore.clearSelection();
      mapController.closeJobPopup();
      mapController.clearJobHighlight();
      mapController.clearAoiHighlight();
      mapController.clearAoiJobScope();
    },
    {
      signal: appEventAbortController.signal,
    }
  );

  jobsPanel.element.addEventListener(
    "job-manager:jobs-refreshed",
    (event) => {
      void mapSyncCoordinator.refreshMapAfterJobsRefresh({
        jobs: event.detail?.jobs,
      });
    },
    {
      signal: appEventAbortController.signal,
    }
  );

  setPanelOpen(jobsPanel.element, navbar.jobsButton, false);

  navbar.jobsButton.addEventListener(
    "click",
    () => {
      const shouldOpen = jobsPanel.element.hidden;

      isSelectedJobMapScopeActive = false;
      selectedAoiStore.clearSelection();
      selectedJobStore.clearSelection();
      jobsPanel.clearSelectedJob();
      mapController.clearJobHighlight();
      mapController.clearAoiHighlight();
      mapController.clearAoiJobScope();

      if (shouldOpen) {
        jobsPanel.clearAoiFilter();
        jobsPanel.refreshJobs();
      } else {
        jobsPanel.hideCompletedJobs();
      }

      setPanelOpen(jobsPanel.element, navbar.jobsButton, shouldOpen);
    },
    {
      signal: appEventAbortController.signal,
    }
  );

  jobsPanel.closeButton.addEventListener(
    "click",
    () => {
      isSelectedJobMapScopeActive = false;
      selectedAoiStore.clearSelection();
      selectedJobStore.clearSelection();
      jobsPanel.clearSelectedJob();
      mapController.closeJobPopup();
      mapController.clearJobHighlight();
      mapController.clearAoiHighlight();
      mapController.clearAoiJobScope();
      jobsPanel.hideCompletedJobs();
      setPanelOpen(jobsPanel.element, navbar.jobsButton, false);
    },
    {
      signal: appEventAbortController.signal,
    }
  );

  void startupController.runStartup({
    onStartupBlocked() {
      isStartupComplete = false;
      blockShellForStartup(shellElement);
    },
    onStartupComplete() {
      isStartupComplete = true;
      releaseShellAfterStartup(shellElement);
    },
  });

  function applySelectedJobMapHighlights(selectedJob) {
    void mapController.highlightJob(selectedJob).catch((error) => {
      showErrorNotice({
        title: "Job highlight failed",
        message: error.message,
      });
    });

    if (selectedJob.relatedAoiIds.length > 0) {
      void mapController.highlightRelatedAoisForJob(selectedJob).catch((error) => {
        mapController.clearAoiHighlight();

        showErrorNotice({
          title: "Related AOIs could not be highlighted",
          message: error.message,
        });
      });

      return;
    }

    mapController.clearAoiHighlight();
  }

  function showErrorNoticeAfterStartup(options) {
    if (!isStartupComplete) {
      return;
    }

    showErrorNotice(options);
  }

  return {
    destroy() {
      startupController.destroy();
      mapSyncCoordinator.destroy();
      appEventAbortController.abort();
      unsubscribeMapJobFilters();
      unsubscribeMapJobClusterSettings();
      unsubscribeMapAoiFilters();
      unsubscribeJobStoreSync();
      navbar.destroy();
      themeStore.destroy();
      jobsPanel.destroy();
      mapController.destroy();
      noticeRegion.destroy?.();
      startupLoader.destroy();
      rootElement.replaceChildren();
    },
  };
}

function blockShellForStartup(shellElement) {
  shellElement.classList.add("job-manager-app--startup-blocked");
  shellElement.inert = true;
  shellElement.setAttribute("aria-hidden", "true");
}

function releaseShellAfterStartup(shellElement) {
  shellElement.classList.remove("job-manager-app--startup-blocked");
  shellElement.inert = false;
  shellElement.setAttribute("aria-hidden", "false");
}

function setPanelOpen(panelElement, triggerButton, isOpen) {
  if (!isOpen) {
    moveFocusOutOfPanel(panelElement, triggerButton);
  }

  panelElement.hidden = !isOpen;
  panelElement.inert = !isOpen;
  panelElement.setAttribute("aria-hidden", String(!isOpen));
  triggerButton.setAttribute("aria-expanded", String(isOpen));
}

function moveFocusOutOfPanel(panelElement, fallbackElement) {
  const activeElement = document.activeElement;

  if (!activeElement || !panelElement.contains(activeElement)) {
    return;
  }

  // Move focus before hiding the panel so browsers do not block aria-hidden on focused content.
  fallbackElement?.focus?.({
    preventScroll: true,
  });
}
```

---

## src/JobManager/src/app/ui/createNavbarController.js

```
import {
  getActiveJobFilterSummary,
  hasActiveJobFilters,
} from "../../features/jobs/domain/jobFilters.js";
import { JOB_PRIORITY_OPTIONS } from "../../features/jobs/domain/jobPriority.js";
import { JOB_STATUS_OPTIONS } from "../../features/jobs/domain/jobStatus.js";
import {
  AOI_MAP_FILTER_MODE_OPTIONS,
  getAoiMapFilterSummary,
  hasActiveAoiMapFilters,
} from "../../features/map/domain/aoiMapFilters.js";
import {
  JOB_CLUSTER_PRESET_OPTIONS,
  JOB_CLUSTER_STYLE_OPTIONS,
  getJobClusterSettingSummary,
} from "../../features/map/domain/jobClusterSettings.js";
import { THEME_MODE } from "../../features/theme/domain/themeMode.js";

export async function createNavbarController({
  jobFilterStore,
  aoiMapFilterStore,
  jobClusterSettingsStore,
  themeStore,
  onTestNotice,
} = {}) {
  await ensureNavbarComponentsDefined();

  const element = await loadNavbarTemplate();
  const jobsButton = getRequiredElement(element, "#jobs-toggle");
  const filtersButton = getRequiredElement(element, "#filters-button");
  const filtersPopover = getRequiredElement(element, "#filters-popover");
  const themeToggle = getRequiredElement(element, "#theme-toggle");
  const testNoticeButton = getRequiredElement(element, "#test-notice-button");

  await configureFiltersPopover({ filtersButton, filtersPopover });

  const filterControlRefs = createJobFilterPopoverContent({
    filtersPopover,
    jobFilterStore,
    aoiMapFilterStore,
    jobClusterSettingsStore,
  });

  const unsubscribeJobFilters =
    jobFilterStore?.subscribe?.((snapshot) => {
      syncJobFilterControls({
        filtersButton,
        filterControlRefs,
        filters: snapshot.filters,
      });
    }) ?? (() => {});

  const unsubscribeAoiMapFilters =
    aoiMapFilterStore?.subscribe?.((snapshot) => {
      syncAoiMapFilterControls({
        filtersButton,
        filterControlRefs,
        filters: snapshot.filters,
      });
    }) ?? (() => {});

  const unsubscribeJobClusterSettings =
    jobClusterSettingsStore?.subscribe?.((snapshot) => {
      syncJobClusterSettingControls({
        filterControlRefs,
        settings: snapshot.settings,
      });
    }) ?? (() => {});

  const unsubscribeTheme =
    themeStore?.subscribe?.((snapshot) => {
      syncThemeToggle({
        themeToggle,
        themeMode: snapshot.themeMode,
      });
    }) ?? (() => {});

  const handleFiltersButtonClick = () => {
    setFilterPopoverOpen(filtersPopover, filtersButton, !filtersPopover.open);
  };

  const handleFiltersCloseClick = () => {
    setFilterPopoverOpen(filtersPopover, filtersButton, false);
  };

  const handleThemeToggleClick = () => {
    themeStore?.toggleThemeMode?.();
  };

  const handleTestNoticeClick = () => {
    onTestNotice?.();
  };

  const handleDocumentClick = (event) => {
    if (!filtersPopover.open) {
      return;
    }

    if (isEventInsideElements(event, [filtersButton, filtersPopover])) {
      return;
    }

    setFilterPopoverOpen(filtersPopover, filtersButton, false);
  };

  filtersButton.addEventListener("click", handleFiltersButtonClick);
  filterControlRefs.closeButton.addEventListener("click", handleFiltersCloseClick);
  themeToggle.addEventListener("click", handleThemeToggleClick);
  testNoticeButton.addEventListener("click", handleTestNoticeClick);
  document.addEventListener("click", handleDocumentClick);

  setFilterPopoverOpen(filtersPopover, filtersButton, false);

  return {
    element,
    jobsButton,
    filtersButton,
    filtersPopover,
    themeToggle,
    destroy() {
      filtersButton.removeEventListener("click", handleFiltersButtonClick);
      filterControlRefs.closeButton.removeEventListener("click", handleFiltersCloseClick);
      themeToggle.removeEventListener("click", handleThemeToggleClick);
      testNoticeButton.removeEventListener("click", handleTestNoticeClick);
      document.removeEventListener("click", handleDocumentClick);
      unsubscribeJobFilters();
      unsubscribeAoiMapFilters();
      unsubscribeJobClusterSettings();
      unsubscribeTheme();
    },
  };
}

async function ensureNavbarComponentsDefined() {
  await Promise.all([
    customElements.whenDefined("calcite-action"),
    customElements.whenDefined("calcite-button"),
    customElements.whenDefined("calcite-icon"),
    customElements.whenDefined("calcite-popover"),
  ]);
}

async function loadNavbarTemplate() {
  const response = await fetch("/components/navbar.html", {
    cache: "no-cache",
  });

  if (!response.ok) {
    throw new Error(`Job Manager could not load the navbar template.\nStatus: ${response.status}`);
  }

  const template = document.createElement("template");
  template.innerHTML = await response.text();

  const headerElement = template.content.firstElementChild;

  if (!headerElement) {
    throw new Error("Job Manager navbar template did not contain a root element.");
  }

  return headerElement;
}

async function configureFiltersPopover({ filtersButton, filtersPopover }) {
  await filtersPopover.componentOnReady?.();

  // Use the actual element reference to avoid brittle document-wide id lookups.
  filtersPopover.referenceElement = filtersButton;
  filtersPopover.triggerDisabled = true;
  filtersPopover.overlayPositioning = "fixed";
  filtersPopover.placement = "bottom-end";
}

function createJobFilterPopoverContent({
  filtersPopover,
  jobFilterStore,
  aoiMapFilterStore,
  jobClusterSettingsStore,
}) {
  const contentElement = document.createElement("div");
  contentElement.className = "job-manager-filters";

  const headerElement = document.createElement("div");
  headerElement.className = "job-manager-filters__header";

  const titleElement = document.createElement("h2");
  titleElement.className = "job-manager-filters__title";
  titleElement.textContent = "Filters";

  const headerActionsElement = document.createElement("div");
  headerActionsElement.className = "job-manager-filters__header-actions";

  const clearButton = document.createElement("calcite-button");
  clearButton.className = "job-manager-filters__clear-button";
  clearButton.appearance = "outline";
  clearButton.kind = "neutral";
  clearButton.scale = "s";
  clearButton.textContent = "Clear filters";
  clearButton.addEventListener("pointerdown", markPointerActivation, { passive: true });
  clearButton.addEventListener("click", () => {
    jobFilterStore.clearFilters();
    aoiMapFilterStore?.clearFilters?.();
    blurAfterPointerActivation(clearButton);
  });

  const closeButton = document.createElement("calcite-action");
  closeButton.id = "filters-close-button";
  closeButton.icon = "x";
  closeButton.scale = "s";
  closeButton.text = "Close filters";
  closeButton.title = "Close filters";

  headerActionsElement.append(clearButton, closeButton);
  headerElement.append(titleElement, headerActionsElement);

  const summaryElement = document.createElement("p");
  summaryElement.className = "job-manager-filters__summary";
  summaryElement.textContent = "No filters active";

  const scrollElement = document.createElement("div");
  scrollElement.className = "job-manager-filters__scroll";

  const aoiOverviewSection = createFilterSection({
    title: "AOI overview",
    description:
      "Controls which AOIs are visible on the map. Current Job filters are applied first.",
  });
  aoiOverviewSection.body.classList.add("job-manager-filters__button-grid");

  const aoiMapFilterButtons = AOI_MAP_FILTER_MODE_OPTIONS.map((modeOption) =>
    createPresetButton({
      option: modeOption,
      onSelect() {
        aoiMapFilterStore?.setFilters?.({
          mode: modeOption.value,
        });
      },
    })
  );

  aoiOverviewSection.body.append(...aoiMapFilterButtons.map((button) => button.buttonElement));

  const aoiOverviewActionsElement = document.createElement("div");
  aoiOverviewActionsElement.className = "job-manager-filters__section-actions";

  const clearAoiOverviewButton = document.createElement("calcite-button");
  clearAoiOverviewButton.appearance = "outline";
  clearAoiOverviewButton.kind = "neutral";
  clearAoiOverviewButton.scale = "s";
  clearAoiOverviewButton.textContent = "Clear AOI overview";
  clearAoiOverviewButton.addEventListener("pointerdown", markPointerActivation, { passive: true });
  clearAoiOverviewButton.addEventListener("click", () => {
    aoiMapFilterStore?.clearFilters?.();
    blurAfterPointerActivation(clearAoiOverviewButton);
  });

  aoiOverviewActionsElement.append(clearAoiOverviewButton);
  aoiOverviewSection.element.append(aoiOverviewActionsElement);

  const quickFilterSection = createFilterSection({
    title: "Quick filters",
    description:
      "Toggle common Job filters. Multiple quick filters can be active at the same time.",
  });
  quickFilterSection.body.classList.add("job-manager-filters__button-grid--three");

  const activeOnlyButton = createToggleButton({
    label: "Active Jobs",
    onChange(checked) {
      jobFilterStore.setFilters({
        activeOnly: checked,
      });
    },
  });
  const highPriorityOnlyButton = createToggleButton({
    label: "High Priority",
    onChange(checked) {
      jobFilterStore.setFilters({
        highPriorityOnly: checked,
      });
    },
  });
  const withRelatedAoisOnlyButton = createToggleButton({
    label: "Jobs with AOIs",
    onChange(checked) {
      jobFilterStore.setFilters({
        withRelatedAoisOnly: checked,
      });
    },
  });

  quickFilterSection.body.append(
    activeOnlyButton.buttonElement,
    highPriorityOnlyButton.buttonElement,
    withRelatedAoisOnlyButton.buttonElement
  );

  const statusSection = createFilterSection({
    title: "Job status",
    description:
      "Show Jobs matching one or more selected statuses. Done Jobs are hidden by default unless Done is selected.",
  });
  statusSection.body.classList.add("job-manager-filters__button-grid--three");

  const statusButtons = JOB_STATUS_OPTIONS.map((statusOption) =>
    createMultiValueFilterButton({
      label: statusOption.label,
      value: statusOption.value,
      getCurrentValues() {
        return jobFilterStore.getSnapshot().filters.statusValues;
      },
      setCurrentValues(nextValues) {
        jobFilterStore.setFilters({
          statusValues: nextValues,
        });
      },
    })
  );

  statusSection.body.append(...statusButtons.map((button) => button.buttonElement));

  const prioritySection = createFilterSection({
    title: "Job priority",
    description: "Show Jobs matching one or more selected priorities.",
  });
  prioritySection.body.classList.add("job-manager-filters__button-grid--three");

  const priorityButtons = JOB_PRIORITY_OPTIONS.map((priorityOption) =>
    createMultiValueFilterButton({
      label: priorityOption.label,
      value: priorityOption.value,
      getCurrentValues() {
        return jobFilterStore.getSnapshot().filters.priorityValues;
      },
      setCurrentValues(nextValues) {
        jobFilterStore.setFilters({
          priorityValues: nextValues,
        });
      },
    })
  );

  prioritySection.body.append(...priorityButtons.map((button) => button.buttonElement));

  const clusteringSection = createFilterSection({
    title: "Job point clustering radius",
    description: "Controls how close Job points must be before they cluster on the map.",
  });
  clusteringSection.body.classList.add("job-manager-filters__button-grid--four");

  const clusteringSummaryElement = document.createElement("p");
  clusteringSummaryElement.className = "job-manager-filters__section-hint";
  clusteringSummaryElement.textContent = "Radius: Medium";
  clusteringSection.element.insertBefore(clusteringSummaryElement, clusteringSection.body);

  const clusterPresetButtons = JOB_CLUSTER_PRESET_OPTIONS.map((presetOption) =>
    createPresetButton({
      option: presetOption,
      onSelect() {
        jobClusterSettingsStore.setSettings({
          preset: presetOption.value,
        });
      },
    })
  );

  clusteringSection.body.append(...clusterPresetButtons.map((button) => button.buttonElement));

  const clusterStyleSection = createFilterSection({
    title: "Job point cluster style",
    description: "Controls how Job point clusters are visualized on the map.",
  });
  clusterStyleSection.body.classList.add("job-manager-filters__button-grid--three");

  const clusterStyleButtons = JOB_CLUSTER_STYLE_OPTIONS.map((styleOption) =>
    createPresetButton({
      option: styleOption,
      onSelect() {
        jobClusterSettingsStore.setSettings({
          style: styleOption.value,
        });
      },
    })
  );

  clusterStyleSection.body.append(...clusterStyleButtons.map((button) => button.buttonElement));

  scrollElement.append(
    aoiOverviewSection.element,
    quickFilterSection.element,
    statusSection.element,
    prioritySection.element,
    clusteringSection.element,
    clusterStyleSection.element
  );

  contentElement.append(headerElement, summaryElement, scrollElement);

  filtersPopover.replaceChildren(contentElement);

  return {
    closeButton,
    summaryElement,
    clearButton,
    activeOnlyButton: activeOnlyButton.buttonElement,
    highPriorityOnlyButton: highPriorityOnlyButton.buttonElement,
    withRelatedAoisOnlyButton: withRelatedAoisOnlyButton.buttonElement,
    statusButtons,
    priorityButtons,
    aoiMapFilterButtons,
    clearAoiOverviewButton,
    clusteringSummaryElement,
    clusterPresetButtons,
    clusterStyleButtons,
    hasActiveJobFilters: false,
    hasActiveAoiMapFilters: false,
  };
}

function createFilterSection({ title, description = "" }) {
  const element = document.createElement("section");
  element.className = "job-manager-filters__section";

  const titleElement = document.createElement("h3");
  titleElement.className = "job-manager-filters__section-title";
  titleElement.textContent = title;

  const normalizedDescription = normalizeOptionalString(description);

  if (normalizedDescription) {
    titleElement.title = normalizedDescription;
    titleElement.setAttribute("aria-label", `${title}. ${normalizedDescription}`);
    titleElement.classList.add("job-manager-filters__section-title--hinted");
  }

  const body = document.createElement("div");
  body.className = "job-manager-filters__button-grid";

  element.append(titleElement, body);

  return {
    element,
    body,
  };
}

function createMultiValueFilterButton({ label, value, getCurrentValues, setCurrentValues }) {
  return createToggleButton({
    label,
    value,
    onChange(checked) {
      const currentValues = new Set(getCurrentValues());

      if (checked) {
        currentValues.add(value);
      } else {
        currentValues.delete(value);
      }

      setCurrentValues([...currentValues]);
    },
  });
}

function createPresetButton({ option, onSelect }) {
  const buttonElement = document.createElement("calcite-button");

  buttonElement.className = "job-manager-filters__preset-button";
  buttonElement.appearance = "outline";
  buttonElement.kind = "neutral";
  buttonElement.scale = "s";
  buttonElement.title = option.description;
  buttonElement.textContent = option.label;
  buttonElement.addEventListener("pointerdown", markPointerActivation, { passive: true });
  buttonElement.addEventListener("click", () => {
    onSelect();
    blurAfterPointerActivation(buttonElement);
  });

  return {
    buttonElement,
    value: option.value,
    description: option.description,
  };
}

function createToggleButton({ label, value = "", onChange }) {
  const buttonElement = document.createElement("calcite-button");

  buttonElement.className = "job-manager-filters__toggle-button";
  buttonElement.appearance = "outline";
  buttonElement.kind = "neutral";
  buttonElement.scale = "s";
  buttonElement.textContent = label;
  buttonElement.setAttribute("aria-pressed", "false");

  if (value) {
    buttonElement.value = value;
  }

  buttonElement.addEventListener("pointerdown", markPointerActivation, { passive: true });
  buttonElement.addEventListener("click", () => {
    onChange(buttonElement.getAttribute("aria-pressed") !== "true");
    blurAfterPointerActivation(buttonElement);
  });

  return {
    buttonElement,
    value,
  };
}

function syncJobFilterControls({ filtersButton, filterControlRefs, filters }) {
  const hasActiveFilters = hasActiveJobFilters(filters);

  syncToggleButton(filterControlRefs.activeOnlyButton, filters.activeOnly);
  syncToggleButton(filterControlRefs.highPriorityOnlyButton, filters.highPriorityOnly);
  syncToggleButton(filterControlRefs.withRelatedAoisOnlyButton, filters.withRelatedAoisOnly);

  syncValueButtons(filterControlRefs.statusButtons, filters.statusValues);
  syncValueButtons(filterControlRefs.priorityButtons, filters.priorityValues);

  filterControlRefs.hasActiveJobFilters = hasActiveFilters;
  filterControlRefs.latestJobFilterSummary = getActiveJobFilterSummary(filters);
  syncCombinedSummaryFromRefs(filterControlRefs);
  syncFilterClearAndIndicator({ filtersButton, filterControlRefs });
}

function syncAoiMapFilterControls({ filtersButton, filterControlRefs, filters }) {
  const hasActiveFilters = hasActiveAoiMapFilters(filters);
  const aoiMapFilterSummary = getAoiMapFilterSummary(filters);

  filterControlRefs.hasActiveAoiMapFilters = hasActiveFilters;
  filterControlRefs.latestAoiMapFilterSummary = aoiMapFilterSummary;
  filterControlRefs.clearAoiOverviewButton.disabled = !hasActiveFilters;

  syncPresetButtons({
    buttons: filterControlRefs.aoiMapFilterButtons,
    activeValue: filters.mode,
  });
  syncCombinedSummaryFromRefs(filterControlRefs);
  syncFilterClearAndIndicator({ filtersButton, filterControlRefs });
}

function syncJobClusterSettingControls({ filterControlRefs, settings }) {
  filterControlRefs.clusteringSummaryElement.textContent = getJobClusterSettingSummary(settings);

  syncPresetButtons({
    buttons: filterControlRefs.clusterPresetButtons,
    activeValue: settings.preset,
  });
  syncPresetButtons({
    buttons: filterControlRefs.clusterStyleButtons,
    activeValue: settings.style,
  });
}

function syncThemeToggle({ themeToggle, themeMode }) {
  const isDark = themeMode === THEME_MODE.DARK;
  const nextLabel = isDark ? "Switch to light mode" : "Switch to dark mode";

  themeToggle.icon = isDark ? "brightness" : "moon";
  themeToggle.text = nextLabel;
  themeToggle.label = nextLabel;
  themeToggle.title = nextLabel;
  themeToggle.setAttribute("aria-label", nextLabel);
}

function syncPresetButtons({ buttons, activeValue }) {
  for (const presetButton of buttons) {
    const isActive = presetButton.value === activeValue;

    presetButton.buttonElement.appearance = isActive ? "solid" : "outline";
    presetButton.buttonElement.kind = isActive ? "brand" : "neutral";
    presetButton.buttonElement.setAttribute("aria-pressed", String(isActive));
  }
}

function syncToggleButton(buttonElement, isActive) {
  buttonElement.appearance = isActive ? "solid" : "outline";
  buttonElement.kind = isActive ? "brand" : "neutral";
  buttonElement.setAttribute("aria-pressed", String(isActive));
}

function syncValueButtons(buttonRefs, activeValues) {
  const activeValueSet = new Set(activeValues);

  for (const buttonRef of buttonRefs) {
    syncToggleButton(buttonRef.buttonElement, activeValueSet.has(buttonRef.value));
  }
}

function syncCombinedSummaryFromRefs(filterControlRefs) {
  const summary = getCombinedFilterSummary({
    jobFilters: filterControlRefs.latestJobFilterSummary ?? "No filters active",
    aoiMapFilters: filterControlRefs.latestAoiMapFilterSummary ?? "All AOIs",
  });

  filterControlRefs.summaryElement.textContent = summary;
}

function syncFilterClearAndIndicator({ filtersButton, filterControlRefs }) {
  const hasAnyActiveFilters =
    filterControlRefs.hasActiveJobFilters || filterControlRefs.hasActiveAoiMapFilters;

  filterControlRefs.clearButton.disabled = !hasAnyActiveFilters;
  filtersButton.indicator = hasAnyActiveFilters;
}

function getCombinedFilterSummary({ jobFilters, aoiMapFilters }) {
  const normalizedJobFilters = normalizeOptionalString(jobFilters);
  const normalizedAoiMapFilters = normalizeOptionalString(aoiMapFilters);
  const parts = [];

  if (normalizedJobFilters && normalizedJobFilters !== "No filters active") {
    parts.push(`Jobs: ${normalizedJobFilters}`);
  }

  if (normalizedAoiMapFilters && normalizedAoiMapFilters !== "All AOIs") {
    parts.push(`AOI overview: ${normalizedAoiMapFilters}`);
  }

  return parts.length > 0 ? parts.join(", ") : "No filters active";
}

function markPointerActivation(event) {
  event.currentTarget.dataset.pointerActivation = "true";
}

function blurAfterPointerActivation(element) {
  if (element.dataset.pointerActivation !== "true") {
    return;
  }

  delete element.dataset.pointerActivation;
  element.blur?.();
}

function getRequiredElement(rootElement, selector) {
  const element = rootElement.querySelector(selector);

  if (!element) {
    throw new Error(`Expected navbar element was not found: ${selector}`);
  }

  return element;
}

function setFilterPopoverOpen(popoverElement, triggerButton, isOpen) {
  popoverElement.open = isOpen;
  popoverElement.toggleAttribute("open", isOpen);
  triggerButton.active = isOpen;
  triggerButton.toggleAttribute("active", isOpen);
  triggerButton.setAttribute("aria-expanded", String(isOpen));
}

function isEventInsideElements(event, elements) {
  const composedPath = event.composedPath?.() ?? [];

  return elements.some(
    (element) => element.contains(event.target) || composedPath.includes(element)
  );
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
```

---

## src/JobManager/src/features/jobs/domain/jobFilters.js

```
import { JOB_PRIORITY, JOB_PRIORITY_OPTIONS } from "./jobPriority.js";
import { JOB_STATUS, JOB_STATUS_OPTIONS } from "./jobStatus.js";

const VALID_STATUS_VALUES = new Set(JOB_STATUS_OPTIONS.map((option) => option.value));
const VALID_PRIORITY_VALUES = new Set(JOB_PRIORITY_OPTIONS.map((option) => option.value));

export function createDefaultJobFilters() {
  return {
    activeOnly: false,
    highPriorityOnly: false,
    withRelatedAoisOnly: false,
    statusValues: [],
    priorityValues: [],
  };
}

export function normalizeJobFilters(filters = {}) {
  const source = filters && typeof filters === "object" ? filters : {};

  return {
    activeOnly: Boolean(source.activeOnly),
    highPriorityOnly: Boolean(source.highPriorityOnly),
    withRelatedAoisOnly: Boolean(source.withRelatedAoisOnly),
    statusValues: normalizeValues(source.statusValues, VALID_STATUS_VALUES),
    priorityValues: normalizeValues(source.priorityValues, VALID_PRIORITY_VALUES),
  };
}

export function filterJobs(jobs = [], filters = createDefaultJobFilters()) {
  const normalizedFilters = normalizeJobFilters(filters);
  const statusValues = new Set(normalizedFilters.statusValues);
  const priorityValues = new Set(normalizedFilters.priorityValues);

  return normalizeArray(jobs).filter((job) => {
    if (normalizedFilters.activeOnly && job.status === JOB_STATUS.DONE) {
      return false;
    }

    if (normalizedFilters.highPriorityOnly && job.priority !== JOB_PRIORITY.HIGH) {
      return false;
    }

    if (normalizedFilters.withRelatedAoisOnly && normalizeArray(job.relatedAoiIds).length === 0) {
      return false;
    }

    if (statusValues.size > 0 && !statusValues.has(job.status)) {
      return false;
    }

    if (priorityValues.size > 0 && !priorityValues.has(job.priority)) {
      return false;
    }

    return true;
  });
}

export function filterJobsForVisibleJobSet(jobs = [], filters = createDefaultJobFilters()) {
  const filteredJobs = filterJobs(jobs, filters);

  if (shouldRevealDoneJobsForFilters(filters)) {
    return filteredJobs;
  }

  return filteredJobs.filter((job) => job.status !== JOB_STATUS.DONE);
}

export function hasActiveJobFilters(filters = createDefaultJobFilters()) {
  const normalizedFilters = normalizeJobFilters(filters);

  return (
    normalizedFilters.activeOnly ||
    normalizedFilters.highPriorityOnly ||
    normalizedFilters.withRelatedAoisOnly ||
    normalizedFilters.statusValues.length > 0 ||
    normalizedFilters.priorityValues.length > 0
  );
}

export function shouldRevealDoneJobsForFilters(filters = createDefaultJobFilters()) {
  const normalizedFilters = normalizeJobFilters(filters);

  return normalizedFilters.statusValues.includes(JOB_STATUS.DONE);
}

export function getActiveJobFilterSummary(filters = createDefaultJobFilters()) {
  const normalizedFilters = normalizeJobFilters(filters);
  const summaryParts = [];

  if (normalizedFilters.activeOnly) {
    summaryParts.push("Active Jobs");
  }

  if (normalizedFilters.highPriorityOnly) {
    summaryParts.push("High Priority");
  }

  if (normalizedFilters.withRelatedAoisOnly) {
    summaryParts.push("Jobs with AOIs");
  }

  if (normalizedFilters.statusValues.length > 0) {
    summaryParts.push(`${normalizedFilters.statusValues.length} status filter`);
  }

  if (normalizedFilters.priorityValues.length > 0) {
    summaryParts.push(`${normalizedFilters.priorityValues.length} priority filter`);
  }

  return summaryParts.length > 0 ? summaryParts.join(", ") : "No filters active";
}

function normalizeValues(values, validValues) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(values.map(normalizeOptionalString).filter((value) => validValues.has(value))),
  ];
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
```

---

## src/JobManager/src/features/jobs/state/jobFilterStore.js

```
import { createDefaultJobFilters, normalizeJobFilters } from "../domain/jobFilters.js";

export function createJobFilterStore(initialFilters = createDefaultJobFilters()) {
  let state = {
    filters: normalizeJobFilters(initialFilters),
  };

  const listeners = new Set();

  function subscribe(listener) {
    listeners.add(listener);
    listener(getSnapshot());

    return () => {
      listeners.delete(listener);
    };
  }

  function getSnapshot() {
    return {
      filters: cloneFilters(state.filters),
    };
  }

  function setFilters(nextFilters) {
    state = {
      filters: normalizeJobFilters({
        ...state.filters,
        ...nextFilters,
      }),
    };

    emit();

    return getSnapshot();
  }

  function clearFilters() {
    state = {
      filters: createDefaultJobFilters(),
    };

    emit();

    return getSnapshot();
  }

  function emit() {
    const snapshot = getSnapshot();

    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  return {
    subscribe,
    getSnapshot,
    setFilters,
    clearFilters,
  };
}

function cloneFilters(filters) {
  return {
    ...filters,
    statusValues: [...filters.statusValues],
    priorityValues: [...filters.priorityValues],
  };
}
```

---

## src/JobManager/src/features/map/domain/jobClusterSettings.js

```
export const JOB_CLUSTER_PRESET = Object.freeze({
  OFF: "off",
  SMALL: "small",
  MEDIUM: "medium",
  LARGE: "large",
});

export const JOB_CLUSTER_STYLE = Object.freeze({
  COUNT: "count",
  PRIORITY_PIE: "priorityPie",
  PRIORITY_GROUPS: "priorityGroups",
});

export const JOB_CLUSTER_PRESET_OPTIONS = Object.freeze([
  {
    value: JOB_CLUSTER_PRESET.OFF,
    label: "Off",
    description: "Show individual Job points.",
  },
  {
    value: JOB_CLUSTER_PRESET.SMALL,
    label: "Small",
    description: "Use a smaller Job point clustering radius.",
  },
  {
    value: JOB_CLUSTER_PRESET.MEDIUM,
    label: "Medium",
    description: "Use ArcGIS-style basic Job point clustering.",
  },
  {
    value: JOB_CLUSTER_PRESET.LARGE,
    label: "Large",
    description: "Use a larger Job point clustering radius.",
  },
]);

export const JOB_CLUSTER_STYLE_OPTIONS = Object.freeze([
  {
    value: JOB_CLUSTER_STYLE.COUNT,
    label: "Count",
    description: "Show clusters as simple Job counts.",
  },
  {
    value: JOB_CLUSTER_STYLE.PRIORITY_PIE,
    label: "Priority pie",
    description: "Show the priority mix inside each cluster.",
  },
  {
    value: JOB_CLUSTER_STYLE.PRIORITY_GROUPS,
    label: "Priority groups",
    description: "Cluster Low, Medium and High priority Jobs separately.",
  },
]);

const DEFAULT_JOB_CLUSTER_PRESET = JOB_CLUSTER_PRESET.MEDIUM;
const DEFAULT_JOB_CLUSTER_STYLE = JOB_CLUSTER_STYLE.COUNT;

const VALID_JOB_CLUSTER_PRESETS = new Set(JOB_CLUSTER_PRESET_OPTIONS.map((option) => option.value));
const VALID_JOB_CLUSTER_STYLES = new Set(JOB_CLUSTER_STYLE_OPTIONS.map((option) => option.value));

const JOB_CLUSTER_PRESET_CONFIG = Object.freeze({
  [JOB_CLUSTER_PRESET.OFF]: null,
  [JOB_CLUSTER_PRESET.SMALL]: Object.freeze({
    clusterRadius: "40px",
    clusterMinSize: 16.5,
  }),
  [JOB_CLUSTER_PRESET.MEDIUM]: Object.freeze({
    clusterMinSize: 16.5,
  }),
  [JOB_CLUSTER_PRESET.LARGE]: Object.freeze({
    clusterRadius: "100px",
    clusterMinSize: 16.5,
  }),
});

export function createDefaultJobClusterSettings() {
  return {
    preset: DEFAULT_JOB_CLUSTER_PRESET,
    style: DEFAULT_JOB_CLUSTER_STYLE,
  };
}

export function normalizeJobClusterSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const preset = normalizeOptionalString(source.preset);
  const style = normalizeOptionalString(source.style);

  return {
    preset: VALID_JOB_CLUSTER_PRESETS.has(preset) ? preset : DEFAULT_JOB_CLUSTER_PRESET,
    style: VALID_JOB_CLUSTER_STYLES.has(style) ? style : DEFAULT_JOB_CLUSTER_STYLE,
  };
}

export function getJobClusterPresetConfig(settings = createDefaultJobClusterSettings()) {
  const normalizedSettings = normalizeJobClusterSettings(settings);
  const presetConfig = JOB_CLUSTER_PRESET_CONFIG[normalizedSettings.preset];

  return presetConfig ? { ...presetConfig } : null;
}

export function getJobClusterSettingSummary(settings = createDefaultJobClusterSettings()) {
  const normalizedSettings = normalizeJobClusterSettings(settings);
  const presetOption = JOB_CLUSTER_PRESET_OPTIONS.find(
    (option) => option.value === normalizedSettings.preset
  );
  const styleOption = JOB_CLUSTER_STYLE_OPTIONS.find(
    (option) => option.value === normalizedSettings.style
  );

  return `Radius: ${presetOption?.label ?? "Medium"}; Style: ${styleOption?.label ?? "Count"}`;
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
```

---

## src/JobManager/src/features/map/state/aoiMapFilterStore.js

```
import { createDefaultAoiMapFilters, normalizeAoiMapFilters } from "../domain/aoiMapFilters.js";

export function createAoiMapFilterStore(initialFilters = createDefaultAoiMapFilters()) {
  let state = {
    filters: normalizeAoiMapFilters(initialFilters),
  };

  const listeners = new Set();

  function subscribe(listener) {
    listeners.add(listener);
    listener(getSnapshot());

    return () => {
      listeners.delete(listener);
    };
  }

  function getSnapshot() {
    return {
      filters: {
        ...state.filters,
      },
    };
  }

  function setFilters(nextFilters) {
    state = {
      filters: normalizeAoiMapFilters({
        ...state.filters,
        ...nextFilters,
      }),
    };

    emit();

    return getSnapshot();
  }

  function clearFilters() {
    state = {
      filters: createDefaultAoiMapFilters(),
    };

    emit();

    return getSnapshot();
  }

  function emit() {
    const snapshot = getSnapshot();

    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  return {
    subscribe,
    getSnapshot,
    setFilters,
    clearFilters,
  };
}
```

---

## src/JobManager/src/features/map/state/jobClusterSettingsStore.js

```
import {
  createDefaultJobClusterSettings,
  normalizeJobClusterSettings,
} from "../domain/jobClusterSettings.js";

export function createJobClusterSettingsStore(initialSettings = createDefaultJobClusterSettings()) {
  let state = {
    settings: normalizeJobClusterSettings(initialSettings),
  };

  const listeners = new Set();

  function subscribe(listener) {
    listeners.add(listener);
    listener(getSnapshot());

    return () => {
      listeners.delete(listener);
    };
  }

  function getSnapshot() {
    return {
      settings: {
        ...state.settings,
      },
    };
  }

  function setSettings(nextSettings) {
    state = {
      settings: normalizeJobClusterSettings({
        ...state.settings,
        ...nextSettings,
      }),
    };

    emit();

    return getSnapshot();
  }

  function resetSettings() {
    state = {
      settings: createDefaultJobClusterSettings(),
    };

    emit();

    return getSnapshot();
  }

  function emit() {
    const snapshot = getSnapshot();

    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  return {
    subscribe,
    getSnapshot,
    setSettings,
    resetSettings,
  };
}
```

---

## src/JobManager/src/styles/main.css

```
@import "@esri/calcite-components/main.css";
@import "./tokens.css";
@import "./base.css";
@import "./loader.css";
@import "./navbar.css";
@import "./filterPopover.css";
@import "./map.css";
@import "./overlays.css";
@import "./notices.css";
@import "./jobs.css";
```

---

## src/JobManager/src/styles/navbar.css

```
#header {
  display: flex;
  align-items: center;
  height: var(--jm-navbar-height);
  padding: 0 12px;
  gap: 18px;
  background-color: var(--jm-header-bg);
}

.header-left {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}

.header-center {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 24px;
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  min-width: 0;
}

.navbar-logo {
  display: block;
  width: 42px;
  height: 42px;
}

.navbar-title-link,
.navbar-title-link:visited {
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 0 2px;
  color: inherit;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
}

.navbar-title-link:hover,
.navbar-title-link:focus,
.navbar-title-link:active {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 4px;
}

.navbar-panel-button {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0 0.55rem;
  border: 0;
  border-radius: 10px;
  color: #ffffff;
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}

.navbar-panel-button calcite-icon {
  color: currentColor;
}

.navbar-panel-button:hover,
.navbar-panel-button:focus-visible,
.navbar-panel-button[aria-expanded="true"] {
  background: rgba(255, 255, 255, 0.22);
  outline: none;
}

.navbar-panel-button:focus-visible {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.65);
}

#last-updated {
  color: #ffffff;
  font-size: 14px;
  white-space: nowrap;
}

.header-right > calcite-action {
  border-radius: 10px;
  --calcite-color-foreground-1: transparent;
  --calcite-color-text-3: white;
  --calcite-action-background-color-hover: rgba(255, 255, 255, 0.25);
  --calcite-action-text-color-press: white;
}

.header-right > calcite-action:hover {
  --calcite-color-foreground-1: white;
  --calcite-action-background-color-hover: rgba(255, 255, 255, 0.25);
}

#filters-button[active],
#test-notice-button[active] {
  --calcite-color-foreground-1: rgb(255, 255, 255);
}

@media (max-width: 54rem) {
  #header {
    align-items: flex-start;
    height: auto;
    min-height: var(--jm-navbar-height);
    padding: 0.5rem 0.75rem;
    flex-wrap: wrap;
  }

  .header-center {
    order: 3;
    flex-basis: 100%;
    gap: 20px;
  }

  .header-right {
    margin-left: auto;
  }
}

.job-manager-filters {
  display: grid;
  gap: 0.9rem;
  width: min(22rem, calc(100vw - 2rem));
  padding: 0.85rem;
  color: var(--jm-text);
}

.job-manager-filters__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: center;
  gap: 0.75rem;
}

.job-manager-filters__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
}

.job-manager-filters__summary {
  margin: 0;
  color: var(--jm-text-muted);
  font-size: 0.82rem;
}

.job-manager-filters__section {
  display: grid;
  gap: 0.45rem;
}

.job-manager-filters__section-title {
  margin: 0;
  color: var(--jm-text);
  font-size: 0.84rem;
  font-weight: 800;
}

.job-manager-filters__checkbox-grid {
  display: grid;
  gap: 0.35rem;
}

.job-manager-filters__checkbox-label {
  margin: 0;
  color: var(--jm-text);
}

.job-manager-filters__actions {
  display: flex;
  justify-content: flex-end;
}

.job-manager-filters calcite-button::part(button) {
  border-radius: 0;
}

.job-manager-filters__section-hint {
  margin: 0;
  color: var(--jm-text-muted);
  font-size: 0.76rem;
}

.job-manager-filters__button-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.job-manager-filters__preset-button::part(button) {
  justify-content: center;
  border-radius: 0;
}
```

---

## src/JobManager/src/styles/filterPopover.css

```
#filters-popover {
  z-index: 1001;
}

.job-manager-filters {
  display: flex;
  flex-direction: column;
  width: min(26rem, calc(100vw - 0.75rem));
  max-height: min(40rem, calc(100vh - var(--jm-navbar-height) - 0.75rem));
  color: var(--jm-text);
  background: var(--jm-surface);
  overflow: hidden;
}

.job-manager-filters__header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.45rem 0.65rem 0.4rem 0.75rem;
  border-bottom: 1px solid var(--jm-border);
  background: var(--jm-surface);
}

.job-manager-filters__header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.4rem;
}

.job-manager-filters__header calcite-action {
  --calcite-color-foreground-1: transparent;
}

.job-manager-filters__clear-button {
  min-width: 6.1rem;
}

.job-manager-filters__title {
  margin: 0;
  color: var(--jm-text);
  font-size: 1rem;
  font-weight: 700;
}

.job-manager-filters__summary {
  flex: 0 0 auto;
  margin: 0;
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid var(--jm-border);
  color: var(--jm-text-muted);
  font-size: 0.82rem;
  line-height: 1.3;
  background: var(--jm-surface-alt);
}

.job-manager-filters__scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0.55rem 0.75rem 0.8rem;
}

.job-manager-filters__section {
  padding: 0.15rem 0 0.65rem;
}

.job-manager-filters__section + .job-manager-filters__section {
  padding-top: 0.65rem;
  border-top: 1px solid var(--jm-border);
}

.job-manager-filters__section-title {
  margin: 0 0 0.4rem;
  color: var(--jm-text);
  font-size: 0.92rem;
  font-weight: 700;
}

.job-manager-filters__section-title--hinted {
  cursor: help;
}

.job-manager-filters__section-hint {
  margin: 0 0 0.45rem;
  color: var(--jm-text-muted);
  font-size: 0.8rem;
  line-height: 1.3;
}

.job-manager-filters__section-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.45rem;
}

.job-manager-filters__button-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.35rem;
}

.job-manager-filters__button-grid--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.job-manager-filters__button-grid--four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.job-manager-filters__preset-button,
.job-manager-filters__toggle-button {
  width: 100%;
}

.job-manager-filters__preset-button:focus:not(:focus-visible),
.job-manager-filters__toggle-button:focus:not(:focus-visible),
.job-manager-filters__clear-button:focus:not(:focus-visible) {
  outline: none;
}

.job-manager-filters__preset-button:focus-visible,
.job-manager-filters__toggle-button:focus-visible,
.job-manager-filters__clear-button:focus-visible {
  outline: 2px solid var(--calcite-color-brand, #007ac2);
  outline-offset: 2px;
}

@media (max-width: 420px) {
  .job-manager-filters__button-grid--three,
  .job-manager-filters__button-grid--four {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-height: 640px) {
  .job-manager-filters {
    max-height: calc(100vh - var(--jm-navbar-height) - 0.5rem);
  }

  .job-manager-filters__header {
    padding-top: 0.35rem;
    padding-bottom: 0.3rem;
  }

  .job-manager-filters__summary,
  .job-manager-filters__scroll {
    padding-right: 0.65rem;
    padding-left: 0.65rem;
  }

  .job-manager-filters__section + .job-manager-filters__section {
    padding-top: 0.55rem;
  }
}
```

---

## src/JobManager/src/styles/overlays.css

```
.job-manager-overlay-panel {
  position: absolute;
  z-index: 10;
  top: 0;
  width: min(31rem, calc(100vw - 2rem));
  max-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  overflow: auto;
  border: 1px solid var(--jm-border);
  border-top: 0;
  border-left: 0;
  border-radius: 0;
  background: var(--jm-overlay);
  box-shadow: var(--jm-shadow);
  backdrop-filter: blur(14px);
}

.job-manager-overlay-panel[hidden] {
  display: none;
}

.job-manager-jobs-overlay {
  --jm-jobs-panel-padding: 0.85rem;
  top: 0;
  bottom: 0;
  box-sizing: border-box;
  display: block;
  gap: 0;
  height: auto;
  max-height: none;
  padding: 0 var(--jm-jobs-panel-padding) var(--jm-jobs-panel-padding);
  overflow-y: auto;
}

.job-manager-jobs-overlay .job-manager-overlay-panel__header {
  position: sticky;
  top: 0;
  z-index: 7;
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: start;
  gap: 0.75rem;
  margin: 0 calc(-1 * var(--jm-jobs-panel-padding)) 0;
  padding: var(--jm-jobs-panel-padding);
  border-bottom: 1px solid var(--jm-border);
  background: var(--jm-overlay);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.job-manager-overlay-panel__header-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.15rem;
  justify-self: end;
  flex: 0 0 auto;
}

.job-manager-overlay-panel__back,
.job-manager-overlay-panel__close {
  --calcite-color-foreground-1: transparent;
}

.job-manager-overlay-panel__title-group {
  min-width: 0;
}

.job-manager-overlay-panel__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.job-manager-overlay-panel__subtitle {
  margin: 0.2rem 0 0;
  color: var(--jm-text-muted);
  font-size: 0.85rem;
}

.job-manager-overlay-panel__description {
  margin: 0;
  color: var(--jm-text);
  font-size: 0.92rem;
}

.job-manager-overlay-panel__close {
  --calcite-color-foreground-1: transparent;
}

@media (max-width: 54rem) {
  .job-manager-overlay-panel {
    top: auto;
    right: 0.75rem;
    bottom: 0.75rem;
    left: 0.75rem;
    width: auto;
    max-height: 50%;
    border: 1px solid var(--jm-border);
  }
}
```

---

## src/JobManager/src/styles/tokens.css

```
:root,
html.calcite-mode-light {
  color-scheme: light;

  --jm-navbar-height: 50px;
  --jm-header-bg: #456178;

  --jm-surface: var(--calcite-color-surface-1, #ffffff);
  --jm-surface-alt: var(--calcite-color-surface-2, #f8f9fa);
  --jm-border: var(--calcite-color-border-1, rgba(33, 37, 41, 0.16));
  --jm-text: var(--calcite-color-text-1, #212529);
  --jm-text-muted: var(--calcite-color-text-3, #6c757d);
  --jm-overlay: rgba(255, 255, 255, 0.94);
  --jm-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);

  --jm-popup-surface: var(--calcite-color-surface-1, #ffffff);
  --jm-popup-surface-alt: var(--calcite-color-surface-2, #f8f9fa);
  --jm-popup-border: var(--calcite-color-border-1, rgba(33, 37, 41, 0.16));
  --jm-popup-text: var(--calcite-color-text-1, #212529);
  --jm-popup-text-muted: var(--calcite-color-text-3, #6c757d);

  --jm-button-secondary-bg-hover: rgba(69, 97, 120, 0.12);

  --jm-notice-success-bg: #f4fbf7;
  --jm-notice-error-bg: #fff5f5;
  --jm-notice-warning-bg: #fffaf2;
  --jm-notice-info-bg: #f3f8ff;

  --jm-color-brand: #456178;

  --jm-color-priority-low-bg: #2f6b2f;
  --jm-color-priority-low-text: #ffffff;
  --jm-color-priority-medium-bg: #ffae00;
  --jm-color-priority-medium-text: #ffffff;
  --jm-color-priority-high-bg: #9b1c31;
  --jm-color-priority-high-text: #ffffff;

  --jm-color-status-todo-bg: #e7f1ff;
  --jm-color-status-todo-text: #084298;
  --jm-color-status-in-progress-bg: #fff3cd;
  --jm-color-status-in-progress-text: #664d03;
  --jm-color-status-done-bg: #d1e7dd;
  --jm-color-status-done-text: #0f5132;

  --jm-color-aoi-none-bg: #f1f3f5;
  --jm-color-aoi-none-text: #495057;
  --jm-color-aoi-low-bg: #d1e7dd;
  --jm-color-aoi-low-text: #0f5132;
  --jm-color-aoi-medium-bg: #fff3cd;
  --jm-color-aoi-medium-text: #664d03;
  --jm-color-aoi-high-bg: #f8d7da;
  --jm-color-aoi-high-text: #842029;
}

html.calcite-mode-dark {
  color-scheme: dark;

  --jm-surface: var(--calcite-color-surface-1, #1f2428);
  --jm-surface-alt: var(--calcite-color-surface-2, #2b3137);
  --jm-border: var(--calcite-color-border-1, rgba(255, 255, 255, 0.18));
  --jm-text: var(--calcite-color-text-1, #f8f9fa);
  --jm-text-muted: var(--calcite-color-text-3, #c8ced3);
  --jm-overlay: rgba(18, 22, 26, 0.9);
  --jm-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);

  --jm-popup-surface: var(--calcite-color-surface-1, #1f2428);
  --jm-popup-surface-alt: var(--calcite-color-surface-2, #2b3137);
  --jm-popup-border: var(--calcite-color-border-1, rgba(255, 255, 255, 0.18));
  --jm-popup-text: var(--calcite-color-text-1, #f8f9fa);
  --jm-popup-text-muted: var(--calcite-color-text-3, #c8ced3);

  --jm-button-secondary-bg-hover: rgba(255, 255, 255, 0.12);

  --jm-notice-success-bg: #142b20;
  --jm-notice-error-bg: #32171d;
  --jm-notice-warning-bg: #302613;
  --jm-notice-info-bg: #14243a;

  --jm-color-status-todo-bg: rgba(13, 110, 253, 0.22);
  --jm-color-status-todo-text: #9ec5fe;
  --jm-color-status-in-progress-bg: rgba(255, 193, 7, 0.22);
  --jm-color-status-in-progress-text: #ffda6a;
  --jm-color-status-done-bg: rgba(25, 135, 84, 0.22);
  --jm-color-status-done-text: #75b798;

  --jm-color-aoi-none-bg: rgba(173, 181, 189, 0.16);
  --jm-color-aoi-none-text: #ced4da;
  --jm-color-aoi-low-bg: rgba(25, 135, 84, 0.22);
  --jm-color-aoi-low-text: #75b798;
  --jm-color-aoi-medium-bg: rgba(255, 193, 7, 0.22);
  --jm-color-aoi-medium-text: #ffda6a;
  --jm-color-aoi-high-bg: rgba(220, 53, 69, 0.22);
  --jm-color-aoi-high-text: #ea868f;
}
```

---

## src\JobManager\src\app\coordination\createMapSyncCoordinator.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import { createSelectedAoiStore } from "../../features/aoi/state/selectedAoiStore.js";
import { JOB_STORE_CHANGE_TYPE } from "../../features/jobs/state/jobStore.js";
import { createSelectedJobStore } from "../../features/jobs/state/selectedJobStore.js";
import { createMapSyncCoordinator } from "./createMapSyncCoordinator.js";

const BASE_JOBS = Object.freeze([
  Object.freeze({
    id: "job-1",
    title: "Inspect AOI Jobs",
    relatedAoiIds: ["aoi-1"],
  }),
]);

const UPDATED_JOBS = Object.freeze([
  Object.freeze({
    id: "job-1",
    title: "Inspect AOI Jobs - refreshed",
    priority: "high",
    relatedAoiIds: ["aoi-2", "aoi-3"],
  }),
]);

test("manual Jobs refresh reapplies selected AOI scope and highlight", async () => {
  const mapController = createMapControllerSpy();
  const selectedAoiStore = createSelectedAoiStore();
  const selectedJobStore = createSelectedJobStore();
  const notices = [];
  selectedAoiStore.selectAoi({
    aoiId: "aoi-1",
    aoiName: "AOI 1",
  });

  const coordinator = createMapSyncCoordinator({
    mapController,
    selectedAoiStore,
    selectedJobStore,
    showErrorNotice: (notice) => notices.push(notice),
  });

  await coordinator.refreshMapAfterJobsRefresh({ jobs: BASE_JOBS });

  assert.deepEqual(mapController.refreshJobDataCalls, [{ jobs: BASE_JOBS }]);
  assert.deepEqual(mapController.applyAoiJobScopeCalls, [
    {
      aoiId: "aoi-1",
      aoiName: "AOI 1",
      objectId: "",
    },
  ]);
  assert.deepEqual(mapController.highlightAoiByIdCalls, ["aoi-1"]);
  assert.equal(mapController.applySelectedJobMapScopeCalls.length, 0);
  assert.equal(mapController.highlightJobCalls.length, 0);
  assert.deepEqual(notices, []);
});

test("manual Jobs refresh restores selected Job focus from the refreshed Jobs snapshot", async () => {
  const mapController = createMapControllerSpy();
  const selectedAoiStore = createSelectedAoiStore();
  const selectedJobStore = createSelectedJobStore();
  selectedJobStore.selectJob({
    jobId: "job-1",
    jobTitle: "Old title",
    relatedAoiIds: ["aoi-old"],
  });

  const coordinator = createMapSyncCoordinator({
    mapController,
    selectedAoiStore,
    selectedJobStore,
    getIsSelectedJobMapScopeActive: () => true,
  });

  await coordinator.refreshMapAfterJobsRefresh({ jobs: UPDATED_JOBS });

  assert.deepEqual(mapController.applySelectedJobMapScopeCalls, [
    {
      jobId: "job-1",
      jobTitle: "Inspect AOI Jobs - refreshed",
      objectId: null,
      geometryType: "",
      priority: "high",
      relatedAoiIds: ["aoi-2", "aoi-3"],
    },
  ]);
  assert.deepEqual(mapController.highlightJobCalls, mapController.applySelectedJobMapScopeCalls);
  assert.deepEqual(
    mapController.highlightRelatedAoisForJobCalls,
    mapController.applySelectedJobMapScopeCalls
  );
  assert.deepEqual(selectedJobStore.getSnapshot().selectedJob.relatedAoiIds, ["aoi-2", "aoi-3"]);
});

test("mutation sync ignores already handled startup-time mutations", async () => {
  const mapController = createMapControllerSpy();
  const selectedAoiStore = createSelectedAoiStore();
  const selectedJobStore = createSelectedJobStore();
  let isStartupComplete = false;
  const coordinator = createMapSyncCoordinator({
    mapController,
    selectedAoiStore,
    selectedJobStore,
    getIsStartupComplete: () => isStartupComplete,
  });
  const firstMutationSnapshot = createMutationSnapshot({ sequence: 1 });

  await coordinator.syncMapAfterJobStoreChange(firstMutationSnapshot);
  isStartupComplete = true;
  await coordinator.syncMapAfterJobStoreChange(firstMutationSnapshot);
  await coordinator.syncMapAfterJobStoreChange(createMutationSnapshot({ sequence: 2 }));

  assert.deepEqual(mapController.refreshJobDataCalls, [
    {
      jobs: BASE_JOBS,
    },
  ]);
});

test("stale map refresh results cannot restore old selection state", async () => {
  const firstRefresh = createDeferred();
  const mapController = createMapControllerSpy({
    refreshResults: [firstRefresh.promise, createMapSuccessResult()],
  });
  const selectedAoiStore = createSelectedAoiStore();
  const selectedJobStore = createSelectedJobStore();
  const coordinator = createMapSyncCoordinator({
    mapController,
    selectedAoiStore,
    selectedJobStore,
  });

  selectedAoiStore.selectAoi({
    aoiId: "aoi-1",
    aoiName: "Old AOI",
  });
  const staleRefresh = coordinator.refreshMapAfterJobsRefresh({ jobs: BASE_JOBS });

  selectedAoiStore.selectAoi({
    aoiId: "aoi-2",
    aoiName: "Current AOI",
  });
  await coordinator.refreshMapAfterJobsRefresh({ jobs: UPDATED_JOBS });

  firstRefresh.resolve(createMapSuccessResult());
  await staleRefresh;

  assert.deepEqual(mapController.refreshJobDataCalls, [
    { jobs: BASE_JOBS },
    { jobs: UPDATED_JOBS },
  ]);
  assert.deepEqual(mapController.applyAoiJobScopeCalls, [
    {
      aoiId: "aoi-2",
      aoiName: "Current AOI",
      objectId: "",
    },
  ]);
  assert.deepEqual(mapController.highlightAoiByIdCalls, ["aoi-2"]);
});

test("map refresh failure shows the requested notice and skips selection restore", async () => {
  const mapController = createMapControllerSpy({
    refreshResults: [
      {
        ok: false,
        error: new Error("Layer update failed"),
      },
    ],
  });
  const selectedAoiStore = createSelectedAoiStore();
  const selectedJobStore = createSelectedJobStore();
  const notices = [];
  selectedAoiStore.selectAoi({
    aoiId: "aoi-1",
  });
  const coordinator = createMapSyncCoordinator({
    mapController,
    selectedAoiStore,
    selectedJobStore,
    showErrorNotice: (notice) => notices.push(notice),
  });

  await coordinator.refreshMapAfterJobsRefresh({ jobs: BASE_JOBS });

  assert.deepEqual(notices, [
    {
      title: "Map refresh failed",
      message: "Layer update failed",
    },
  ]);
  assert.equal(mapController.applyAoiJobScopeCalls.length, 0);
  assert.equal(mapController.highlightAoiByIdCalls.length, 0);
});

function createMutationSnapshot({ sequence }) {
  return {
    jobs: BASE_JOBS,
    lastChange: {
      type: JOB_STORE_CHANGE_TYPE.JOB_STATUS_UPDATED,
      sequence,
      jobId: "job-1",
      status: "done",
    },
  };
}

function createMapControllerSpy({ refreshResults = [] } = {}) {
  const controller = {
    refreshJobDataCalls: [],
    applyAoiJobScopeCalls: [],
    highlightAoiByIdCalls: [],
    applySelectedJobMapScopeCalls: [],
    highlightJobCalls: [],
    highlightRelatedAoisForJobCalls: [],
    clearAoiHighlightCalls: 0,
    async refreshJobData(options) {
      controller.refreshJobDataCalls.push({
        jobs: options?.jobs,
      });

      return shiftResult(refreshResults, createMapSuccessResult());
    },
    async applyAoiJobScope(selectedAoi) {
      controller.applyAoiJobScopeCalls.push({ ...selectedAoi });

      return createMapSuccessResult({ jobIds: ["job-1"] });
    },
    async highlightAoiById(aoiId) {
      controller.highlightAoiByIdCalls.push(aoiId);
    },
    async applySelectedJobMapScope(selectedJob) {
      controller.applySelectedJobMapScopeCalls.push(cloneSelectedJob(selectedJob));

      return createMapSuccessResult({ jobIds: [selectedJob.jobId] });
    },
    async highlightJob(selectedJob) {
      controller.highlightJobCalls.push(cloneSelectedJob(selectedJob));
    },
    async highlightRelatedAoisForJob(selectedJob) {
      controller.highlightRelatedAoisForJobCalls.push(cloneSelectedJob(selectedJob));
    },
    clearAoiHighlight() {
      controller.clearAoiHighlightCalls += 1;
    },
  };

  return controller;
}

function cloneSelectedJob(selectedJob) {
  return {
    ...selectedJob,
    relatedAoiIds: [...selectedJob.relatedAoiIds],
  };
}

function createMapSuccessResult(data = {}) {
  return {
    ok: true,
    data,
  };
}

function shiftResult(results, fallback) {
  if (!Array.isArray(results) || results.length === 0) {
    return fallback;
  }

  return results.shift();
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
}
```

---

## src\JobManager\src\app\startup\createStartupController.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import { createStartupController } from "./createStartupController.js";

const SAMPLE_JOBS = Object.freeze([
  Object.freeze({
    id: "job-1",
    title: "Inspect AOI Jobs",
    relatedAoiIds: ["aoi-1"],
  }),
]);

test("startup controller loads map, Jobs and Job map layers in order", async () => {
  const calls = [];
  const loader = createStartupLoaderSpy(calls);
  const mapController = createMapControllerStub({ calls });
  const jobStore = createJobStoreStub({ calls });
  let blockedCount = 0;
  let completeCount = 0;

  const controller = createStartupController({
    startupLoader: loader,
    mapController,
    jobStore,
    runWithRetry: createDirectRetryRunner(calls),
    waitForNextPaint: async () => {
      calls.push("paint");
    },
  });

  const result = await controller.runStartup({
    onStartupBlocked() {
      blockedCount += 1;
    },
    onStartupComplete() {
      completeCount += 1;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(blockedCount, 1);
  assert.equal(completeCount, 1);
  assert.deepEqual(mapController.startCalls[0], {
    requireAois: true,
    deferJobGeometry: true,
    suppressStatus: true,
  });
  assert.deepEqual(mapController.refreshCalls[0], { jobs: SAMPLE_JOBS });
  assert.deepEqual(controller.getSnapshot(), {
    mapReady: true,
    mapResult: { viewId: "map-view" },
    jobsReady: true,
    jobs: SAMPLE_JOBS,
    jobMapReady: true,
  });
  assert.deepEqual(getStageCallOrder(calls), [
    "retry:map workspace",
    "map:start",
    "retry:Jobs load",
    "jobs:load",
    "retry:Job map rendering",
    "map:refreshJobData",
    "paint",
  ]);
  assert.equal(loader.completeCalls.at(-1).text, "Job Manager ready.");
});

test("startup retry after Jobs load failure reuses the ready map workspace", async () => {
  const calls = [];
  const loader = createStartupLoaderSpy(calls);
  const mapController = createMapControllerStub({ calls });
  const jobStore = createJobStoreStub({
    calls,
    loadResults: [
      {
        ok: false,
        error: new Error("Jobs unavailable"),
      },
      {
        ok: true,
        data: {
          jobs: SAMPLE_JOBS,
        },
      },
    ],
  });
  const controller = createStartupController({
    startupLoader: loader,
    mapController,
    jobStore,
    runWithRetry: createDirectRetryRunner(calls),
    waitForNextPaint: async () => {},
  });

  const firstResult = await controller.runStartup();
  const secondResult = await controller.runStartup();

  assert.equal(firstResult.ok, false);
  assert.equal(firstResult.error.message, "Jobs unavailable");
  assert.equal(secondResult.ok, true);
  assert.equal(mapController.startCalls.length, 1);
  assert.equal(jobStore.loadCalls.length, 2);
  assert.equal(mapController.refreshCalls.length, 1);
  assert.equal(loader.startLoadingCalls[1], "Loading Jobs...");
  assert.equal(loader.failCalls.length, 1);
});

test("startup retry after Job map rendering failure reuses loaded map and Jobs", async () => {
  const calls = [];
  const loader = createStartupLoaderSpy(calls);
  const mapController = createMapControllerStub({
    calls,
    refreshResults: [
      {
        ok: false,
        error: new Error("Job layers unavailable"),
      },
      {
        ok: true,
        data: {
          pointCount: 1,
          polygonCount: 0,
        },
      },
    ],
  });
  const jobStore = createJobStoreStub({ calls });
  const controller = createStartupController({
    startupLoader: loader,
    mapController,
    jobStore,
    runWithRetry: createDirectRetryRunner(calls),
    waitForNextPaint: async () => {},
  });

  const firstResult = await controller.runStartup();
  const secondResult = await controller.runStartup();

  assert.equal(firstResult.ok, false);
  assert.equal(firstResult.error.message, "Job layers unavailable");
  assert.equal(secondResult.ok, true);
  assert.equal(mapController.startCalls.length, 1);
  assert.equal(jobStore.loadCalls.length, 1);
  assert.equal(mapController.refreshCalls.length, 2);
  assert.equal(loader.startLoadingCalls[1], "Rendering Jobs on the map...");
  assert.equal(loader.failCalls.length, 1);
});

test("startup controller rejects invalid Jobs load results before rendering Job layers", async () => {
  const calls = [];
  const loader = createStartupLoaderSpy(calls);
  const mapController = createMapControllerStub({ calls });
  const jobStore = createJobStoreStub({
    calls,
    loadResults: [
      {
        ok: true,
        data: {
          jobs: null,
        },
      },
    ],
  });
  const controller = createStartupController({
    startupLoader: loader,
    mapController,
    jobStore,
    runWithRetry: createDirectRetryRunner(calls),
    waitForNextPaint: async () => {},
  });

  const result = await controller.runStartup();

  assert.equal(result.ok, false);
  assert.equal(result.error.message, "Jobs loader returned an invalid result.");
  assert.equal(mapController.startCalls.length, 1);
  assert.equal(jobStore.loadCalls.length, 1);
  assert.equal(mapController.refreshCalls.length, 0);
});

function createDirectRetryRunner(calls) {
  return async (task, options) => {
    calls.push(`retry:${options?.label ?? "unknown"}`);

    return task();
  };
}

function createStartupLoaderSpy(calls) {
  const loader = {
    startLoadingCalls: [],
    retryCountdownCalls: [],
    markDataReceivedCalls: [],
    renderingCalls: [],
    completeCalls: [],
    failCalls: [],
    startLoading(text) {
      calls.push(`loader:start:${text}`);
      loader.startLoadingCalls.push(text);
    },
    setText(text) {
      calls.push(`loader:text:${text}`);
    },
    setDetail(detail) {
      calls.push(`loader:detail:${detail}`);
    },
    setProgress(progress) {
      calls.push(`loader:progress:${progress}`);
    },
    startRetryCountdown(options) {
      calls.push(`loader:retry:${options.label}`);
      loader.retryCountdownCalls.push(options);
    },
    markDataReceived(options) {
      calls.push(`loader:data:${options.text}`);
      loader.markDataReceivedCalls.push(options);
    },
    startRendering(options) {
      calls.push(`loader:render:${options.text}`);
      loader.renderingCalls.push(options);
    },
    complete(options) {
      calls.push(`loader:complete:${options.text}`);
      loader.completeCalls.push(options);
    },
    fail(options) {
      calls.push(`loader:fail:${options.text}`);
      loader.failCalls.push(options);
    },
  };

  return loader;
}

function createMapControllerStub({ calls, startResults, refreshResults } = {}) {
  const controller = {
    startCalls: [],
    refreshCalls: [],
    async start(options) {
      calls.push("map:start");
      controller.startCalls.push({ ...options });

      return shiftResult(startResults, {
        ok: true,
        data: {
          viewId: "map-view",
        },
      });
    },
    async refreshJobData(options) {
      calls.push("map:refreshJobData");
      controller.refreshCalls.push({
        jobs: options?.jobs,
      });

      return shiftResult(refreshResults, {
        ok: true,
        data: {
          pointCount: 1,
          polygonCount: 0,
        },
      });
    },
  };

  return controller;
}

function createJobStoreStub({ calls, loadResults } = {}) {
  const store = {
    loadCalls: [],
    async loadJobs() {
      calls.push("jobs:load");
      store.loadCalls.push({});

      return shiftResult(loadResults, {
        ok: true,
        data: {
          jobs: SAMPLE_JOBS,
        },
      });
    },
  };

  return store;
}

function shiftResult(results, fallback) {
  if (!Array.isArray(results) || results.length === 0) {
    return fallback;
  }

  return results.shift();
}

function getStageCallOrder(calls) {
  return calls.filter((call) =>
    ["retry:", "map:", "jobs:", "paint"].some((prefix) => call.startsWith(prefix))
  );
}
```

---

## src\JobManager\src\features\aoi\domain\aoiModel.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAoi, normalizeAoiJobSummary } from "./aoiModel.js";

test("normalizeAoi uses the current test Feature Service fields", () => {
  const aoi = normalizeAoi({
    attributes: {
      OBJECTID: 42,
      PRODUCTNAME: "DK Test Product",
      SERIES: "DK",
      EDITION: 3,
      PRODUCTID: "{9BCE3666-D5D9-4D3D-A32B-0B6F3E9E46F7}",
      GlobalID: "{E8C7C857-6A9A-4A64-81E2-2B38E7B49F91}",
    },
    geometry: {
      type: "polygon",
    },
  });

  assert.equal(aoi.id, "{E8C7C857-6A9A-4A64-81E2-2B38E7B49F91}");
  assert.equal(aoi.name, "DK Test Product");
  assert.equal(aoi.objectId, "42");
  assert.equal(aoi.globalId, "{E8C7C857-6A9A-4A64-81E2-2B38E7B49F91}");
  assert.equal(aoi.productId, "{9BCE3666-D5D9-4D3D-A32B-0B6F3E9E46F7}");
  assert.equal(aoi.series, "DK");
  assert.equal(aoi.edition, 3);
  assert.deepEqual(aoi.geometry, {
    type: "polygon",
  });
});

test("normalizeAoi falls back to OBJECTID when stable identifiers are missing", () => {
  const aoi = normalizeAoi({
    attributes: {
      OBJECTID: 7,
    },
  });

  assert.equal(aoi.id, "aoi-7");
  assert.equal(aoi.name, "Unnamed Area of Interest");
});

test("normalizeAoiJobSummary keeps invalid counts safe for UI use", () => {
  assert.deepEqual(
    normalizeAoiJobSummary({
      total: "5",
      active: -1,
      highPriority: "not-a-number",
    }),
    {
      total: 5,
      active: 0,
      highPriority: 0,
    }
  );
});
```

---

## src\JobManager\src\features\aoi\services\aoiService.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import { AOI_LAYER_READINESS_STATUS, validateAoiFeatureLayer } from "./aoiService.js";

test("validateAoiFeatureLayer returns a missing-config readiness result without a layer", async () => {
  const result = await validateAoiFeatureLayer();

  assert.equal(result.ok, true);
  assert.equal(result.data.status, AOI_LAYER_READINESS_STATUS.MISSING_CONFIG);
  assert.equal(result.data.isConfigured, false);
  assert.equal(result.data.featureCount, null);
  assert.deepEqual(result.data.warnings, ["AOI Feature Service URL is not configured."]);
});

test("validateAoiFeatureLayer returns an error result when the layer cannot load", async () => {
  const result = await validateAoiFeatureLayer({
    aoiLayer: createAoiLayerStub({
      loadError: new Error("Layer load failed."),
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.message, "Layer load failed.");
  assert.equal(result.meta.operation, "validateAoiFeatureLayer");
  assert.equal(result.meta.layerId, "aoi-layer-test");
});

test("validateAoiFeatureLayer reports ready when required fields and feature count are available", async () => {
  let observedQuery = null;
  const result = await validateAoiFeatureLayer({
    aoiLayer: createAoiLayerStub({
      fields: [{ name: "GlobalID" }, { name: "PRODUCTNAME" }, { name: "OBJECTID" }],
      featureCount: 12,
      onQueryFeatureCount(query) {
        observedQuery = query;
      },
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, AOI_LAYER_READINESS_STATUS.READY);
  assert.equal(result.data.isConfigured, true);
  assert.equal(result.data.featureCount, 12);
  assert.equal(result.data.fieldReport.hasRequiredFields, true);
  assert.equal(result.data.spatialReference.wkid, 25832);
  assert.equal(observedQuery.where, "1=1");
});

test("validateAoiFeatureLayer warns when required fields are missing", async () => {
  const result = await validateAoiFeatureLayer({
    aoiLayer: createAoiLayerStub({
      fields: [{ name: "OBJECTID" }],
      featureCount: 4,
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, AOI_LAYER_READINESS_STATUS.WARNING);
  assert.equal(result.data.fieldReport.hasRequiredFields, false);
  assert.deepEqual(
    result.data.fieldReport.missingRequiredFields.map((fieldInfo) => fieldInfo.fieldName),
    ["GlobalID", "PRODUCTNAME"]
  );
  assert.match(result.data.warnings[0], /Missing required AOI field/);
});

test("validateAoiFeatureLayer keeps validation successful but warning when feature count cannot be checked", async () => {
  const result = await validateAoiFeatureLayer({
    aoiLayer: createAoiLayerStub({
      fields: [{ name: "GlobalID" }, { name: "PRODUCTNAME" }],
      queryError: new Error("Count failed."),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.status, AOI_LAYER_READINESS_STATUS.WARNING);
  assert.equal(result.data.featureCount, null);
  assert.ok(result.data.warnings.some((warning) => warning.includes("Count failed.")));
});

function createAoiLayerStub({
  fields = [{ name: "GlobalID" }, { name: "PRODUCTNAME" }],
  featureCount = 1,
  loadError = null,
  queryError = null,
  onQueryFeatureCount = () => {},
} = {}) {
  return {
    id: "aoi-layer-test",
    title: "AOI Test Layer",
    url: "https://example.com/aoi/FeatureServer/0",
    fields,
    objectIdField: "OBJECTID",
    geometryType: "polygon",
    spatialReference: {
      toJSON() {
        return {
          wkid: 25832,
        };
      },
    },
    async load() {
      if (loadError) {
        throw loadError;
      }
    },
    createQuery() {
      return {
        where: "original",
      };
    },
    async queryFeatureCount(query) {
      onQueryFeatureCount(query);

      if (queryError) {
        throw queryError;
      }

      return featureCount;
    },
  };
}
```

---

## src\JobManager\src\features\aoi\state\selectedAoiStore.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import { createSelectedAoiStore } from "./selectedAoiStore.js";

test("selected AOI store normalizes and exposes selected AOI snapshots", () => {
  const store = createSelectedAoiStore();
  const snapshots = [];

  const unsubscribe = store.subscribe((snapshot) => {
    snapshots.push(snapshot);
  });

  const selectedAoi = store.selectAoi({
    id: "{AOI-GLOBAL-ID}",
    name: "Test AOI",
    objectId: 17,
  });

  assert.deepEqual(selectedAoi, {
    aoiId: "{AOI-GLOBAL-ID}",
    aoiName: "Test AOI",
    objectId: "17",
  });
  assert.deepEqual(store.getSnapshot().selectedAoi, selectedAoi);

  store.clearSelection();

  assert.equal(store.getSnapshot().selectedAoi, null);
  assert.equal(snapshots.length, 3);

  unsubscribe();
});
```

---

## src\JobManager\src\features\jobs\domain\jobFilters.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultJobFilters,
  filterJobs,
  filterJobsForVisibleJobSet,
  getActiveJobFilterSummary,
  hasActiveJobFilters,
  normalizeJobFilters,
  shouldRevealDoneJobsForFilters,
} from "./jobFilters.js";

const JOBS = Object.freeze([
  {
    id: "job-1",
    status: "todo",
    priority: "high",
    relatedAoiIds: ["{AOI-1}"],
  },
  {
    id: "job-2",
    status: "inProgress",
    priority: "medium",
    relatedAoiIds: [],
  },
  {
    id: "job-3",
    status: "done",
    priority: "high",
    relatedAoiIds: ["{AOI-2}"],
  },
]);

test("createDefaultJobFilters creates an inactive filter state", () => {
  const filters = createDefaultJobFilters();

  assert.equal(hasActiveJobFilters(filters), false);
  assert.deepEqual(filters.statusValues, []);
  assert.deepEqual(filters.priorityValues, []);
});

test("normalizeJobFilters removes invalid status and priority values", () => {
  assert.deepEqual(
    normalizeJobFilters({
      activeOnly: true,
      statusValues: ["todo", "unknown", "done", "todo"],
      priorityValues: ["high", "bad-value"],
    }),
    {
      activeOnly: true,
      highPriorityOnly: false,
      withRelatedAoisOnly: false,
      statusValues: ["todo", "done"],
      priorityValues: ["high"],
    }
  );
});

test("normalizeJobFilters handles nullish filter input", () => {
  assert.deepEqual(normalizeJobFilters(null), createDefaultJobFilters());
});

test("filterJobs applies quick filters and explicit multi-select filters", () => {
  assert.deepEqual(
    filterJobs(JOBS, {
      activeOnly: true,
      highPriorityOnly: true,
      withRelatedAoisOnly: true,
    }).map((job) => job.id),
    ["job-1"]
  );

  assert.deepEqual(
    filterJobs(JOBS, {
      statusValues: ["done"],
      priorityValues: ["high"],
    }).map((job) => job.id),
    ["job-3"]
  );
});

test("filterJobsForVisibleJobSet hides Done Jobs by default", () => {
  assert.deepEqual(
    filterJobsForVisibleJobSet(JOBS).map((job) => job.id),
    ["job-1", "job-2"]
  );
});

test("filterJobsForVisibleJobSet reveals Done Jobs for explicit Done status filter", () => {
  assert.deepEqual(
    filterJobsForVisibleJobSet(JOBS, {
      statusValues: ["done"],
    }).map((job) => job.id),
    ["job-3"]
  );
});

test("filterJobsForVisibleJobSet keeps contradictory Active and Done filters empty", () => {
  assert.deepEqual(
    filterJobsForVisibleJobSet(JOBS, {
      activeOnly: true,
      statusValues: ["done"],
    }).map((job) => job.id),
    []
  );
});

test("shouldRevealDoneJobsForFilters only reveals Done Jobs for explicit Done status filter", () => {
  assert.equal(
    shouldRevealDoneJobsForFilters({
      statusValues: ["done"],
    }),
    true
  );

  assert.equal(
    shouldRevealDoneJobsForFilters({
      activeOnly: true,
    }),
    false
  );

  assert.equal(
    shouldRevealDoneJobsForFilters({
      priorityValues: ["high"],
    }),
    false
  );
});

test("getActiveJobFilterSummary describes active filters", () => {
  assert.equal(
    getActiveJobFilterSummary({
      activeOnly: true,
      priorityValues: ["high", "medium"],
    }),
    "Active Jobs, 2 priority filter"
  );
});
```

---

## src\JobManager\src\features\jobs\mock\mockJobData.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import { createInitialMockJobs, createRectanglePolygonGeometry } from "./mockJobData.js";

test("createInitialMockJobs creates enough active point Jobs to demonstrate clustering", () => {
  const jobs = createInitialMockJobs();
  const activePointJobs = jobs.filter(
    (job) => job.geometry?.type === "point" && job.status !== "done"
  );

  assert.ok(activePointJobs.length >= 40);
});

test("createInitialMockJobs keeps polygon Jobs compact for realistic map testing", () => {
  const jobs = createInitialMockJobs();
  const polygonJobs = jobs.filter((job) => job.geometry?.type === "polygon");

  assert.ok(polygonJobs.length >= 8);

  for (const job of polygonJobs) {
    const ring = job.geometry.rings[0];
    const longitudes = ring.map((coordinate) => coordinate[0]);
    const latitudes = ring.map((coordinate) => coordinate[1]);
    const width = Math.max(...longitudes) - Math.min(...longitudes);
    const height = Math.max(...latitudes) - Math.min(...latitudes);

    assert.ok(width <= 0.4);
    assert.ok(height <= 0.25);
  }
});

test("createRectanglePolygonGeometry creates a closed WGS84 polygon ring", () => {
  const geometry = createRectanglePolygonGeometry([10, 56], [0.2, 0.1]);

  assert.equal(geometry.type, "polygon");
  assert.deepEqual(geometry.spatialReference, {
    wkid: 4326,
  });
  assert.deepEqual(geometry.rings[0][0], geometry.rings[0].at(-1));
});
```

---

## src\JobManager\src\features\jobs\services\jobService.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import { createJobService } from "./jobService.js";

test("createJobService wraps injected adapter load results in API result objects", async () => {
  const jobs = [
    {
      id: "job-001",
      relatedAoiIds: ["aoi-001"],
    },
  ];
  const service = createJobService({
    adapter: {
      source: "test-adapter",
      async loadJobs() {
        return {
          jobs,
        };
      },
      async updateJobStatus() {
        return {
          job: jobs[0],
          createdJobs: [],
        };
      },
    },
  });

  const result = await service.loadJobs();

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    jobs,
  });
  assert.equal(result.meta.source, "test-adapter");
});

test("createJobService wraps injected adapter mutation results in API result objects", async () => {
  const service = createJobService({
    adapter: {
      source: "test-adapter",
      async loadJobs() {
        return {
          jobs: [],
        };
      },
      async updateJobStatus(jobId, status) {
        return {
          job: {
            id: jobId,
            status,
            relatedAoiIds: [],
          },
          createdJobs: [
            {
              id: "job-created",
              status: "todo",
              relatedAoiIds: [],
            },
          ],
        };
      },
    },
  });

  const result = await service.updateJobStatus("job-001", "done");

  assert.equal(result.ok, true);
  assert.equal(result.data.job.id, "job-001");
  assert.equal(result.data.job.status, "done");
  assert.equal(result.data.createdJobs.length, 1);
  assert.equal(result.meta.source, "test-adapter");
  assert.equal(result.meta.jobId, "job-001");
});

test("createJobService normalizes adapter failures", async () => {
  const service = createJobService({
    adapter: {
      source: "failing-adapter",
      loadJobs() {
        throw {
          name: "JobServiceTestError",
          message: "Raw load failure",
          userMessage: "Jobs could not be loaded.",
          status: 503,
          code: "JOB_LOAD_FAILED",
        };
      },
      async updateJobStatus() {
        return {
          job: null,
          createdJobs: [],
        };
      },
    },
  });

  const result = await service.loadJobs();

  assert.equal(result.ok, false);
  assert.equal(result.error.name, "JobServiceTestError");
  assert.equal(result.error.message, "Jobs could not be loaded.");
  assert.equal(result.error.status, 503);
  assert.equal(result.error.code, "JOB_LOAD_FAILED");
  assert.equal(result.meta.source, "failing-adapter");
});

test("createJobService rejects incomplete adapters", () => {
  assert.throws(
    () =>
      createJobService({
        adapter: {
          loadJobs() {},
        },
      }),
    /updateJobStatus\(\)/
  );
});
```

---

## src\JobManager\src\features\jobs\services\jobServiceAdapter.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import { createJobService } from "./jobService.js";
import { createJobServiceAdapter, JOB_SERVICE_ADAPTER_SOURCE } from "./jobServiceAdapter.js";

test("createJobServiceAdapter creates the mock adapter by default", () => {
  const adapter = createJobServiceAdapter();

  assert.equal(adapter.source, JOB_SERVICE_ADAPTER_SOURCE.MOCK);
  assert.equal(typeof adapter.loadJobs, "function");
  assert.equal(typeof adapter.updateJobStatus, "function");
});

test("createJobServiceAdapter creates an unavailable HTTP adapter seam", async () => {
  const adapter = createJobServiceAdapter({
    source: JOB_SERVICE_ADAPTER_SOURCE.HTTP,
  });
  const service = createJobService({ adapter });

  const result = await service.loadJobs();

  assert.equal(adapter.source, JOB_SERVICE_ADAPTER_SOURCE.HTTP);
  assert.equal(result.ok, false);
  assert.equal(result.error.message, "Job backend is not configured yet.");
  assert.equal(result.error.status, 501);
  assert.equal(result.error.code, "JOB_HTTP_ADAPTER_UNAVAILABLE");
  assert.equal(result.meta.source, JOB_SERVICE_ADAPTER_SOURCE.HTTP);
});

test("createJobServiceAdapter rejects unsupported sources", () => {
  assert.throws(
    () =>
      createJobServiceAdapter({
        source: "unsupported",
      }),
    /Unsupported Job service adapter source: unsupported/
  );
});
```

---

## src\JobManager\src\features\jobs\state\jobFilterStore.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import { createJobFilterStore } from "./jobFilterStore.js";

test("createJobFilterStore stores, normalizes and clears filters", () => {
  const store = createJobFilterStore();
  const snapshots = [];

  const unsubscribe = store.subscribe((snapshot) => {
    snapshots.push(snapshot);
  });

  store.setFilters({
    activeOnly: true,
    statusValues: ["todo", "bad-value"],
  });

  assert.deepEqual(store.getSnapshot().filters, {
    activeOnly: true,
    highPriorityOnly: false,
    withRelatedAoisOnly: false,
    statusValues: ["todo"],
    priorityValues: [],
  });

  store.clearFilters();

  assert.equal(store.getSnapshot().filters.activeOnly, false);
  assert.deepEqual(store.getSnapshot().filters.statusValues, []);
  assert.equal(snapshots.length, 3);

  unsubscribe();
});
```

---

## src\JobManager\src\features\jobs\state\jobStore.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import { createJobStore, JOB_STORE_CHANGE_TYPE } from "./jobStore.js";

const BASE_JOB = Object.freeze({
  id: "job-001",
  title: "Test Job",
  status: "todo",
  priority: "high",
  relatedAoiIds: ["aoi-001"],
});

test("createJobStore loads Jobs through the injected service", async () => {
  const store = createJobStore({
    service: {
      async loadJobs() {
        return createSuccessResult({
          jobs: [BASE_JOB],
        });
      },
      async updateJobStatus() {
        return createSuccessResult({
          job: BASE_JOB,
          createdJobs: [],
        });
      },
    },
  });

  const result = await store.loadJobs();
  const snapshot = store.getSnapshot();

  assert.equal(result.ok, true);
  assert.equal(snapshot.isLoading, false);
  assert.equal(snapshot.error, null);
  assert.deepEqual(
    snapshot.jobs.map((job) => job.id),
    ["job-001"]
  );
  assert.equal(snapshot.lastChange.type, JOB_STORE_CHANGE_TYPE.JOBS_LOADED);
  assert.equal(snapshot.lastChange.jobCount, 1);
});

test("createJobStore replaces the mutated Job and keeps created Jobs queued", async () => {
  const updatedJob = {
    ...BASE_JOB,
    status: "done",
  };
  const createdJob = {
    id: "job-created",
    title: "Created Job",
    status: "todo",
    priority: "medium",
    relatedAoiIds: ["aoi-002"],
  };
  const store = createJobStore({
    service: {
      async loadJobs() {
        return createSuccessResult({
          jobs: [BASE_JOB],
        });
      },
      async updateJobStatus() {
        return createSuccessResult({
          job: updatedJob,
          createdJobs: [createdJob],
        });
      },
    },
  });

  await store.loadJobs();
  const result = await store.updateJobStatus("job-001", "done");
  const snapshot = store.getSnapshot();

  assert.equal(result.ok, true);
  assert.deepEqual(
    snapshot.jobs.map((job) => job.id),
    ["job-001"]
  );
  assert.equal(snapshot.jobs[0].status, "done");
  assert.equal(snapshot.lastChange.type, JOB_STORE_CHANGE_TYPE.JOB_STATUS_UPDATED);
  assert.equal(snapshot.lastChange.jobId, "job-001");
  assert.equal(snapshot.lastChange.status, "done");
  assert.equal(snapshot.lastChange.createdJobCount, 1);
});

test("createJobStore keeps existing Jobs after mutation failure", async () => {
  const store = createJobStore({
    service: {
      async loadJobs() {
        return createSuccessResult({
          jobs: [BASE_JOB],
        });
      },
      async updateJobStatus() {
        return createErrorResult("Mutation failed.");
      },
    },
  });

  await store.loadJobs();
  const result = await store.updateJobStatus("job-001", "done");
  const snapshot = store.getSnapshot();

  assert.equal(result.ok, false);
  assert.deepEqual(
    snapshot.jobs.map((job) => job.id),
    ["job-001"]
  );
  assert.equal(snapshot.jobs[0].status, "todo");
  assert.equal(snapshot.error.message, "Mutation failed.");
  assert.equal(snapshot.lastChange.type, JOB_STORE_CHANGE_TYPE.JOB_STATUS_UPDATE_FAILED);
  assert.equal(snapshot.lastChange.jobId, "job-001");
  assert.equal(snapshot.lastChange.status, "done");
});

function createSuccessResult(data) {
  return {
    ok: true,
    data,
    error: null,
    meta: {},
  };
}

function createErrorResult(message) {
  return {
    ok: false,
    data: null,
    error: {
      isNormalizedError: true,
      name: "Error",
      message,
      status: null,
      code: null,
    },
    meta: {},
  };
}
```

---

## src\JobManager\src\features\jobs\state\selectedJobStore.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import { createSelectedJobStore, normalizeSelectedJob } from "./selectedJobStore.js";

test("normalizeSelectedJob normalizes popup-derived Job values", () => {
  assert.deepEqual(
    normalizeSelectedJob({
      jobId: "job-001",
      jobTitle: "Harbour update",
      objectId: "12",
      geometryType: "polygon",
      priority: "high",
      relatedAoiIds: ["{AOI-1}", "{AOI-2}", "{AOI-1}"],
    }),
    {
      jobId: "job-001",
      jobTitle: "Harbour update",
      objectId: 12,
      geometryType: "polygon",
      priority: "high",
      relatedAoiIds: ["{AOI-1}", "{AOI-2}"],
    }
  );
});

test("normalizeSelectedJob parses serialized related AOI ids", () => {
  assert.deepEqual(
    normalizeSelectedJob({
      id: "job-002",
      title: "Depth review",
      relatedAoiIds: '["{AOI-1}","{AOI-2}"]',
    }),
    {
      jobId: "job-002",
      jobTitle: "Depth review",
      objectId: null,
      geometryType: "",
      priority: "",
      relatedAoiIds: ["{AOI-1}", "{AOI-2}"],
    }
  );
});

test("createSelectedJobStore stores and clears selected Job state", () => {
  const store = createSelectedJobStore();
  const snapshots = [];

  const unsubscribe = store.subscribe((snapshot) => {
    snapshots.push(snapshot);
  });

  const selectedJob = store.selectJob({
    jobId: "job-003",
    jobTitle: "Navigation warning",
    objectId: 7,
    geometryType: "point",
    priority: "",
    relatedAoiIds: ["{AOI-3}"],
  });

  assert.equal(selectedJob.jobId, "job-003");
  assert.deepEqual(store.getSnapshot().selectedJob.relatedAoiIds, ["{AOI-3}"]);

  store.clearSelection();

  assert.equal(store.getSnapshot().selectedJob, null);
  assert.equal(snapshots.length, 3);

  unsubscribe();
});
```

---

## src\JobManager\src\features\map\core\mapPopupState.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import {
  closePopupIfAggregate,
  closePopupIfJob,
  isAggregatePopupFeature,
  isAggregatePopupOpen,
  isJobPopupFeature,
  isJobPopupOpen,
} from "./mapPopupState.js";

test("isAggregatePopupFeature detects ArcGIS aggregate graphics", () => {
  assert.equal(
    isAggregatePopupFeature({
      isAggregate: true,
    }),
    true
  );
});

test("isAggregatePopupFeature detects cluster_count popup graphics", () => {
  assert.equal(
    isAggregatePopupFeature({
      attributes: {
        cluster_count: 3,
      },
    }),
    true
  );
});

test("isAggregatePopupFeature detects cluster popup templates without relying only on selectedFeature.isAggregate", () => {
  assert.equal(
    isAggregatePopupFeature({
      popupTemplate: {
        title: "{cluster_count} Jobs in this cluster",
      },
    }),
    true
  );
});

test("isAggregatePopupFeature ignores normal Job graphics", () => {
  assert.equal(
    isAggregatePopupFeature({
      attributes: {
        jobId: "job-001",
        title: "Normal Job",
      },
      popupTemplate: {
        title: "{title}",
      },
    }),
    false
  );
});

test("isAggregatePopupOpen checks popup selectedFeature, viewModel selectedFeature and feature collections", () => {
  assert.equal(
    isAggregatePopupOpen({
      selectedFeature: null,
      viewModel: {
        selectedFeature: null,
        features: {
          toArray() {
            return [
              {
                attributes: {
                  title: "Normal Job",
                },
              },
              {
                attributes: {
                  cluster_count: 2,
                },
              },
            ];
          },
        },
      },
    }),
    true
  );
});

test("closePopupIfAggregate closes aggregate popups through view.closePopup when available", () => {
  let closeCount = 0;

  const result = closePopupIfAggregate({
    view: {
      popup: {
        viewModel: {
          selectedFeature: {
            attributes: {
              cluster_count: 4,
            },
          },
        },
      },
      closePopup() {
        closeCount += 1;
      },
    },
  });

  assert.equal(result, true);
  assert.equal(closeCount, 1);
});

test("closePopupIfAggregate falls back to popup.close", () => {
  let closeCount = 0;

  const result = closePopupIfAggregate({
    view: {
      popup: {
        selectedFeature: {
          isAggregate: true,
        },
        close() {
          closeCount += 1;
        },
      },
    },
  });

  assert.equal(result, true);
  assert.equal(closeCount, 1);
});

test("closePopupIfAggregate keeps normal Job popups open", () => {
  let closeCount = 0;

  const result = closePopupIfAggregate({
    view: {
      popup: {
        selectedFeature: {
          attributes: {
            jobId: "job-001",
          },
        },
        close() {
          closeCount += 1;
        },
      },
    },
  });

  assert.equal(result, false);
  assert.equal(closeCount, 0);
});

test("isJobPopupFeature detects normal Job popup graphics", () => {
  assert.equal(
    isJobPopupFeature({
      attributes: {
        jobId: "job-001",
      },
    }),
    true
  );
});

test("isJobPopupFeature can match a specific Job id", () => {
  assert.equal(
    isJobPopupFeature(
      {
        attributes: {
          jobId: "job-001",
        },
      },
      {
        jobId: "job-001",
      }
    ),
    true
  );

  assert.equal(
    isJobPopupFeature(
      {
        attributes: {
          jobId: "job-001",
        },
      },
      {
        jobId: "job-002",
      }
    ),
    false
  );
});

test("isJobPopupFeature ignores aggregate popup graphics", () => {
  assert.equal(
    isJobPopupFeature({
      isAggregate: true,
      attributes: {
        cluster_count: 4,
      },
    }),
    false
  );
});

test("isJobPopupOpen checks popup selectedFeature, viewModel selectedFeature and feature collections", () => {
  assert.equal(
    isJobPopupOpen(
      {
        selectedFeature: null,
        viewModel: {
          selectedFeature: null,
        },
        features: [
          {
            attributes: {
              PRODUCTNAME: "Underlying AOI",
            },
          },
          {
            attributes: {
              jobId: "job-001",
            },
          },
        ],
      },
      {
        jobId: "job-001",
      }
    ),
    true
  );
});

test("closePopupIfJob closes matching Job popups", () => {
  let closeCount = 0;

  const result = closePopupIfJob({
    view: {
      popup: {
        selectedFeature: {
          attributes: {
            jobId: "job-001",
          },
        },
      },
      closePopup() {
        closeCount += 1;
      },
    },
    jobId: "job-001",
  });

  assert.equal(result, true);
  assert.equal(closeCount, 1);
});

test("closePopupIfJob keeps other Job popups open when a specific Job id is requested", () => {
  let closeCount = 0;

  const result = closePopupIfJob({
    view: {
      popup: {
        selectedFeature: {
          attributes: {
            jobId: "job-002",
          },
        },
        close() {
          closeCount += 1;
        },
      },
    },
    jobId: "job-001",
  });

  assert.equal(result, false);
  assert.equal(closeCount, 0);
});
```

---

## src\JobManager\src\features\map\domain\jobClusterSettings.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import {
  JOB_CLUSTER_PRESET,
  JOB_CLUSTER_STYLE,
  createDefaultJobClusterSettings,
  getJobClusterPresetConfig,
  getJobClusterSettingSummary,
  normalizeJobClusterSettings,
} from "./jobClusterSettings.js";

test("createDefaultJobClusterSettings uses medium count clustering", () => {
  assert.deepEqual(createDefaultJobClusterSettings(), {
    preset: JOB_CLUSTER_PRESET.MEDIUM,
    style: JOB_CLUSTER_STYLE.COUNT,
  });
});

test("normalizeJobClusterSettings rejects invalid preset and style values", () => {
  assert.deepEqual(
    normalizeJobClusterSettings({
      preset: "very-large",
      style: "bad-style",
    }),
    {
      preset: JOB_CLUSTER_PRESET.MEDIUM,
      style: JOB_CLUSTER_STYLE.COUNT,
    }
  );

  assert.deepEqual(normalizeJobClusterSettings(null), {
    preset: JOB_CLUSTER_PRESET.MEDIUM,
    style: JOB_CLUSTER_STYLE.COUNT,
  });
});

test("getJobClusterPresetConfig returns null when clustering is off", () => {
  assert.equal(
    getJobClusterPresetConfig({
      preset: JOB_CLUSTER_PRESET.OFF,
    }),
    null
  );
});

test("getJobClusterPresetConfig returns Esri-style basic config for medium", () => {
  assert.deepEqual(
    getJobClusterPresetConfig({
      preset: JOB_CLUSTER_PRESET.MEDIUM,
    }),
    {
      clusterMinSize: 16.5,
    }
  );
});

test("getJobClusterPresetConfig returns radius settings for small and large presets", () => {
  assert.deepEqual(
    getJobClusterPresetConfig({
      preset: JOB_CLUSTER_PRESET.SMALL,
    }),
    {
      clusterRadius: "40px",
      clusterMinSize: 16.5,
    }
  );

  assert.deepEqual(
    getJobClusterPresetConfig({
      preset: JOB_CLUSTER_PRESET.LARGE,
    }),
    {
      clusterRadius: "100px",
      clusterMinSize: 16.5,
    }
  );
});

test("getJobClusterSettingSummary describes selected clustering settings", () => {
  assert.equal(
    getJobClusterSettingSummary({
      preset: JOB_CLUSTER_PRESET.SMALL,
      style: JOB_CLUSTER_STYLE.PRIORITY_PIE,
    }),
    "Radius: Small; Style: Priority pie"
  );
});
```

---

## src\JobManager\src\features\map\filters\applyAoiLayerFilters.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import { AOI_MAP_FILTER_MODE } from "../domain/aoiMapFilters.js";
import { applyAoiLayerFilters } from "./applyAoiLayerFilters.js";

const GLOBAL_ID = "11111111-1111-1111-1111-111111111111";

test("applyAoiLayerFilters returns safely when the AOI layer is missing", async () => {
  const result = await applyAoiLayerFilters({
    filters: {
      mode: AOI_MAP_FILTER_MODE.WITH_VISIBLE_JOBS,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, false);
  assert.equal(result.reason, "aoi-layer-missing");
});

test("applyAoiLayerFilters clears the layer expression when AOI overview filters are inactive", async () => {
  const aoiLayer = createAoiLayerStub();
  aoiLayer.definitionExpression = "GlobalID IN ('previous')";

  const result = await applyAoiLayerFilters({
    aoiLayer,
    filters: {
      mode: AOI_MAP_FILTER_MODE.ALL,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(aoiLayer.definitionExpression, "");
  assert.deepEqual(result.data, {
    definitionExpression: "",
    aoiIds: [],
    didFallbackToAllAois: false,
  });
});

test("applyAoiLayerFilters falls back to all AOIs when the relation service is missing", async () => {
  const aoiLayer = createAoiLayerStub();

  const result = await applyAoiLayerFilters({
    aoiLayer,
    filters: {
      mode: AOI_MAP_FILTER_MODE.WITH_VISIBLE_JOBS,
    },
    relationService: null,
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(result.reason, "relation-service-missing");
  assert.equal(aoiLayer.definitionExpression, "");
  assert.equal(result.data.didFallbackToAllAois, true);
});

test("applyAoiLayerFilters falls back to all AOIs when relation snapshot loading fails", async () => {
  const aoiLayer = createAoiLayerStub();

  const result = await applyAoiLayerFilters({
    aoiLayer,
    filters: {
      mode: AOI_MAP_FILTER_MODE.WITH_ACTIVE_JOBS,
    },
    relationService: {
      async loadAoiJobRelationSnapshot() {
        return {
          ok: false,
          error: new Error("Relation snapshot failed."),
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(result.reason, "relation-snapshot-failed");
  assert.equal(aoiLayer.definitionExpression, "");
  assert.equal(result.data.didFallbackToAllAois, true);
});

test("applyAoiLayerFilters creates a safe GlobalID expression for compatible relation ids", async () => {
  const aoiLayer = createAoiLayerStub();
  let receivedJobFilters = null;
  let receivedJobs = null;

  const result = await applyAoiLayerFilters({
    aoiLayer,
    filters: {
      mode: AOI_MAP_FILTER_MODE.WITH_HIGH_PRIORITY_JOBS,
    },
    jobFilters: {
      highPriorityOnly: true,
    },
    jobs: [{ id: "job-001" }],
    relationService: {
      async loadAoiJobRelationSnapshot({ jobFilters, jobs }) {
        receivedJobFilters = jobFilters;
        receivedJobs = jobs;

        return {
          ok: true,
          data: {
            summaryByAoiId: {
              [GLOBAL_ID]: {
                aoiId: GLOBAL_ID,
                total: 1,
                active: 1,
                highPriority: 1,
                activeHighPriority: 1,
                jobIds: ["job-001"],
              },
            },
          },
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.equal(aoiLayer.definitionExpression, `GlobalID IN ('${GLOBAL_ID}', '{${GLOBAL_ID}}')`);
  assert.equal(result.data.didFallbackToAllAois, false);
  assert.deepEqual(result.data.matchedAoiIds, [GLOBAL_ID]);
  assert.deepEqual(receivedJobFilters, {
    highPriorityOnly: true,
  });
  assert.deepEqual(receivedJobs, [{ id: "job-001" }]);
});

test("applyAoiLayerFilters hides all AOIs only for a compatible no-match result", async () => {
  const aoiLayer = createAoiLayerStub();

  const result = await applyAoiLayerFilters({
    aoiLayer,
    filters: {
      mode: AOI_MAP_FILTER_MODE.WITH_ACTIVE_JOBS,
    },
    relationService: {
      async loadAoiJobRelationSnapshot() {
        return {
          ok: true,
          data: {
            summaryByAoiId: {
              [GLOBAL_ID]: {
                aoiId: GLOBAL_ID,
                total: 1,
                active: 0,
                highPriority: 1,
                activeHighPriority: 0,
                jobIds: ["job-001"],
              },
            },
          },
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(aoiLayer.definitionExpression, "1 = 0");
  assert.equal(result.data.didFallbackToAllAois, false);
  assert.equal(result.data.reason, "no-aoi-ids-for-active-filter");
});

test("applyAoiLayerFilters keeps all AOIs visible for incompatible relation ids", async () => {
  const aoiLayer = createAoiLayerStub();

  const result = await applyAoiLayerFilters({
    aoiLayer,
    filters: {
      mode: AOI_MAP_FILTER_MODE.WITH_VISIBLE_JOBS,
    },
    relationService: {
      async loadAoiJobRelationSnapshot() {
        return {
          ok: true,
          data: {
            summaryByAoiId: {
              "mock-aoi-001": {
                aoiId: "mock-aoi-001",
                total: 1,
                active: 1,
                highPriority: 1,
                activeHighPriority: 1,
                jobIds: ["job-001"],
              },
            },
          },
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(aoiLayer.definitionExpression, "");
  assert.equal(result.data.didFallbackToAllAois, true);
  assert.equal(result.data.reason, "relation-aoi-ids-are-not-globalids");
});

function createAoiLayerStub() {
  return {
    fields: [
      {
        name: "GlobalID",
      },
    ],
    definitionExpression: "",
  };
}
```

---

## src\JobManager\src\features\map\filters\applyJobLayerFilters.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import {
  applyJobLayerFilters,
  createJobLayerDefinitionExpression,
} from "./applyJobLayerFilters.js";

test("createJobLayerDefinitionExpression hides Done Jobs by default", () => {
  assert.equal(createJobLayerDefinitionExpression(), "(status <> 'done')");
});

test("createJobLayerDefinitionExpression applies quick filters while keeping Done hidden", () => {
  assert.equal(
    createJobLayerDefinitionExpression({
      activeOnly: true,
      highPriorityOnly: true,
      withRelatedAoisOnly: true,
    }),
    "(status <> 'done') AND (priority = 'high') AND (relatedAoiCount > 0)"
  );
});

test("createJobLayerDefinitionExpression reveals Done Jobs for explicit Done status filter", () => {
  assert.equal(
    createJobLayerDefinitionExpression({
      statusValues: ["done"],
    }),
    "(status IN ('done'))"
  );
});

test("createJobLayerDefinitionExpression keeps contradictory Active and Done filters explicit", () => {
  assert.equal(
    createJobLayerDefinitionExpression({
      activeOnly: true,
      statusValues: ["done"],
    }),
    "(status <> 'done') AND (status IN ('done'))"
  );
});

test("createJobLayerDefinitionExpression applies explicit non-Done status and priority filters", () => {
  assert.equal(
    createJobLayerDefinitionExpression({
      statusValues: ["todo"],
      priorityValues: ["high", "medium"],
    }),
    "(status <> 'done') AND (status IN ('todo')) AND (priority IN ('high', 'medium'))"
  );
});

test("createJobLayerDefinitionExpression applies mixed status filters without default Done hiding", () => {
  assert.equal(
    createJobLayerDefinitionExpression({
      statusValues: ["todo", "done"],
      priorityValues: ["high"],
    }),
    "(status IN ('todo', 'done')) AND (priority IN ('high'))"
  );
});

test("createJobLayerDefinitionExpression adds scoped Job ids", () => {
  assert.equal(
    createJobLayerDefinitionExpression(
      {},
      {
        scopedJobIds: ["job-001", "job-002"],
      }
    ),
    "(status <> 'done') AND (jobId IN ('job-001', 'job-002'))"
  );
});

test("createJobLayerDefinitionExpression creates an empty scoped result", () => {
  assert.equal(
    createJobLayerDefinitionExpression(
      {},
      {
        scopedJobIds: [],
      }
    ),
    "(status <> 'done') AND (1 = 0)"
  );
});

test("createJobLayerDefinitionExpression combines active filters and scoped Job ids", () => {
  assert.equal(
    createJobLayerDefinitionExpression(
      {
        highPriorityOnly: true,
      },
      {
        scopedJobIds: ["job-001"],
      }
    ),
    "(status <> 'done') AND (priority = 'high') AND (jobId IN ('job-001'))"
  );
});

test("createJobLayerDefinitionExpression escapes scoped Job ids", () => {
  assert.equal(
    createJobLayerDefinitionExpression(
      {},
      {
        scopedJobIds: ["job-'quoted"],
      }
    ),
    "(status <> 'done') AND (jobId IN ('job-''quoted'))"
  );
});

test("createJobLayerDefinitionExpression keeps no-scope filters unchanged", () => {
  const expression = createJobLayerDefinitionExpression({});

  assert.equal(expression, "(status <> 'done')");
  assert.doesNotMatch(expression, /jobId IN/);
  assert.doesNotMatch(expression, /1 = 0/);
});

test("applyJobLayerFilters updates both Job geometry layers", () => {
  const pointLayer = {};
  const polygonLayer = {};

  const result = applyJobLayerFilters({
    jobLayers: {
      pointLayer,
      polygonLayer,
    },
    filters: {
      statusValues: ["done"],
    },
  });

  assert.equal(result.definitionExpression, "(status IN ('done'))");
  assert.equal(pointLayer.definitionExpression, "(status IN ('done'))");
  assert.equal(polygonLayer.definitionExpression, "(status IN ('done'))");
});

test("applyJobLayerFilters applies scoped Job ids to base layers", () => {
  const pointLayer = {};
  const polygonLayer = {};

  const result = applyJobLayerFilters({
    jobLayers: {
      pointLayer,
      polygonLayer,
    },
    scopedJobIds: ["job-001"],
  });

  assert.equal(result.definitionExpression, "(status <> 'done') AND (jobId IN ('job-001'))");
  assert.equal(pointLayer.definitionExpression, "(status <> 'done') AND (jobId IN ('job-001'))");
  assert.equal(polygonLayer.definitionExpression, "(status <> 'done') AND (jobId IN ('job-001'))");
});
```

---

## src\JobManager\src\features\map\layers\aoiRenderer.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import {
  AOI_RENDERER_SEVERITY,
  createAoiJobSeverityExpression,
  createAoiJobSummaryRenderer,
  createDefaultAoiRenderer,
  getAoiJobSeverity,
} from "./aoiRenderer.js";

test("createDefaultAoiRenderer returns a neutral simple renderer", () => {
  const renderer = createDefaultAoiRenderer();

  assert.equal(renderer.type, "simple");
  assert.equal(renderer.label, "Areas of Interest");
  assert.equal(renderer.symbol.type, "simple-fill");
});

test("getAoiJobSeverity prioritizes active high-priority Jobs", () => {
  assert.equal(
    getAoiJobSeverity({
      active: 0,
      highPriority: 2,
      activeHighPriority: 0,
    }),
    AOI_RENDERER_SEVERITY.NONE
  );

  assert.equal(
    getAoiJobSeverity({
      active: 2,
      highPriority: 0,
      activeHighPriority: 0,
    }),
    AOI_RENDERER_SEVERITY.ACTIVE
  );

  assert.equal(
    getAoiJobSeverity({
      active: 2,
      highPriority: 1,
      activeHighPriority: 1,
    }),
    AOI_RENDERER_SEVERITY.HIGH
  );
});

test("createAoiJobSummaryRenderer returns class breaks for matching summaries", () => {
  const renderer = createAoiJobSummaryRenderer({
    "{GLOBAL-ID-1}": {
      active: 1,
      highPriority: 0,
      activeHighPriority: 0,
    },
    "{GLOBAL-ID-2}": {
      active: 2,
      highPriority: 1,
      activeHighPriority: 1,
    },
  });

  assert.equal(renderer.type, "class-breaks");
  assert.match(renderer.valueExpression, /Text\(\$feature\["GlobalID"\]\)/);
  assert.match(renderer.valueExpression, /\{GLOBAL-ID-1\}/);
  assert.match(renderer.valueExpression, /\{GLOBAL-ID-2\}/);
  assert.equal(renderer.classBreakInfos.length, 3);
});

test("createAoiJobSeverityExpression ignores neutral entries", () => {
  const expression = createAoiJobSeverityExpression([
    ["{GLOBAL-ID-1}", AOI_RENDERER_SEVERITY.NONE],
    ["{GLOBAL-ID-2}", AOI_RENDERER_SEVERITY.HIGH],
  ]);

  assert.doesNotMatch(expression, /\{GLOBAL-ID-1\}/);
  assert.match(expression, /\{GLOBAL-ID-2\}/);
});
```

---

## src\JobManager\src\features\map\layers\applyAoiRenderer.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import { applyAoiJobSummaryRenderer } from "./applyAoiRenderer.js";

test("applyAoiJobSummaryRenderer passes Job filters to relation snapshot loading", async () => {
  let receivedJobFilters = null;
  const aoiLayer = {};
  const jobFilters = {
    highPriorityOnly: true,
  };

  const result = await applyAoiJobSummaryRenderer({
    aoiLayer,
    jobFilters,
    relationService: {
      async loadAoiJobRelationSnapshot(options) {
        receivedJobFilters = options.jobFilters;

        return {
          ok: true,
          data: {
            relations: [{ jobId: "job-001", aoiIds: ["aoi-001"], source: "mock" }],
            summaries: [
              {
                aoiId: "aoi-001",
                total: 1,
                active: 1,
                highPriority: 1,
                activeHighPriority: 1,
                jobIds: ["job-001"],
              },
            ],
            summaryByAoiId: {
              "aoi-001": {
                aoiId: "aoi-001",
                total: 1,
                active: 1,
                highPriority: 1,
                activeHighPriority: 1,
                jobIds: ["job-001"],
              },
            },
          },
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, true);
  assert.deepEqual(receivedJobFilters, jobFilters);
  assert.equal(aoiLayer.renderer.type, "class-breaks");
});

test("applyAoiJobSummaryRenderer skips stale renderer requests before applying default renderer", async () => {
  const existingRenderer = {
    type: "simple",
  };
  const aoiLayer = {
    renderer: existingRenderer,
  };

  const result = await applyAoiJobSummaryRenderer({
    aoiLayer,
    shouldApply() {
      return false;
    },
  });

  assert.deepEqual(result, {
    ok: true,
    applied: false,
    reason: "stale-renderer-request",
  });
  assert.equal(aoiLayer.renderer, existingRenderer);
});
```

---

## src\JobManager\src\features\map\layers\jobClustering.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import { JOB_CLUSTER_PRESET } from "../domain/jobClusterSettings.js";
import {
  createCountJobPointFeatureReduction,
  createJobClusterPopupTemplate,
} from "./jobClustering.js";

test("createCountJobPointFeatureReduction creates Esri-style medium point clustering config by default", () => {
  const featureReduction = createCountJobPointFeatureReduction();

  assert.equal(featureReduction.type, "cluster");
  assert.equal(featureReduction.clusterRadius, undefined);
  assert.equal(featureReduction.clusterMinSize, 16.5);
  assert.equal(featureReduction.clusterMaxSize, undefined);
  assert.equal(featureReduction.popupTemplate.title, "{cluster_count} Jobs in this cluster");
  assert.equal(featureReduction.popupTemplate.actions.length, 0);
  assert.equal(featureReduction.popupTemplate.content.length, 1);
  assert.deepEqual(featureReduction.labelingInfo, [
    {
      deconflictionStrategy: "none",
      labelExpressionInfo: {
        expression: "Text($feature.cluster_count, '#,###')",
      },
      labelPlacement: "center-center",
      symbol: {
        type: "text",
        color: "white",
        font: {
          family: "Noto Sans",
          size: "12px",
        },
      },
    },
  ]);
});
test("createCountJobPointFeatureReduction supports small clustering preset", () => {
  const featureReduction = createCountJobPointFeatureReduction({
    preset: JOB_CLUSTER_PRESET.SMALL,
  });

  assert.equal(featureReduction.clusterRadius, "40px");
  assert.equal(featureReduction.clusterMinSize, 16.5);
});

test("createCountJobPointFeatureReduction supports large clustering preset", () => {
  const featureReduction = createCountJobPointFeatureReduction({
    preset: JOB_CLUSTER_PRESET.LARGE,
  });

  assert.equal(featureReduction.clusterRadius, "100px");
  assert.equal(featureReduction.clusterMinSize, 16.5);
});

test("createCountJobPointFeatureReduction returns null when clustering is off", () => {
  assert.equal(
    createCountJobPointFeatureReduction({
      preset: JOB_CLUSTER_PRESET.OFF,
    }),
    null
  );
});

test("createJobClusterPopupTemplate exposes compact picker content and cluster count formatting", () => {
  const popupTemplate = createJobClusterPopupTemplate();

  assert.equal(popupTemplate.title, "{cluster_count} Jobs in this cluster");
  assert.equal(popupTemplate.actions.length, 0);
  assert.equal(popupTemplate.content.length, 1);
  assert.deepEqual(popupTemplate.fieldInfos, [
    {
      fieldName: "cluster_count",
      label: "Jobs",
      format: {
        places: 0,
        digitSeparator: true,
      },
    },
  ]);
});
```

---

## src\JobManager\src\features\map\layers\jobLayerFeatureData.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import {
  createJobLayerFeatureData,
  getJobRenderClass,
  JOB_LAYER_FIELD,
  JOB_RENDER_CLASS,
} from "./jobLayerFeatureData.js";

const JOBS = Object.freeze([
  {
    id: "job-point",
    title: "Point Job",
    summary: "Point summary",
    createdAt: "2026-06-10T00:00:00.000Z",
    deadline: "2026-06-30T00:00:00.000Z",
    priority: "high",
    status: "todo",
    relatedAoiIds: ["aoi-001"],
    geometry: {
      type: "point",
      longitude: 10.1,
      latitude: 56.2,
      spatialReference: {
        wkid: 4326,
      },
    },
  },
  {
    id: "job-polygon",
    title: "Polygon Job",
    summary: "Polygon summary",
    createdAt: "2026-06-11T00:00:00.000Z",
    deadline: null,
    priority: "medium",
    status: "inProgress",
    relatedAoiIds: ["aoi-001", "aoi-002"],
    geometry: {
      type: "polygon",
      rings: [
        [
          [10, 56],
          [10.2, 56],
          [10.2, 56.2],
          [10, 56],
        ],
      ],
      spatialReference: {
        wkid: 4326,
      },
    },
  },
  {
    id: "job-missing-geometry",
    title: "Missing geometry",
    priority: "low",
    status: "todo",
    relatedAoiIds: [],
    geometry: null,
  },
]);

test("createJobLayerFeatureData splits point and polygon Jobs into separate feature sets", () => {
  const featureData = createJobLayerFeatureData(JOBS);

  assert.equal(featureData.pointFeatures.length, 1);
  assert.equal(featureData.polygonFeatures.length, 1);

  assert.equal(featureData.pointFeatures[0].geometry.type, "point");
  assert.equal(featureData.pointFeatures[0].geometry.x, 10.1);
  assert.equal(featureData.pointFeatures[0].geometry.y, 56.2);

  assert.equal(featureData.polygonFeatures[0].geometry.type, "polygon");
  assert.deepEqual(featureData.polygonFeatures[0].geometry.rings[0][0], [10, 56]);
});

test("createJobLayerFeatureData creates stable popup and renderer attributes", () => {
  const featureData = createJobLayerFeatureData(JOBS);
  const pointAttributes = featureData.pointFeatures[0].attributes;
  const polygonAttributes = featureData.polygonFeatures[0].attributes;

  assert.equal(pointAttributes[JOB_LAYER_FIELD.OBJECT_ID], 1);
  assert.equal(pointAttributes[JOB_LAYER_FIELD.JOB_ID], "job-point");
  assert.equal(pointAttributes[JOB_LAYER_FIELD.STATUS_LABEL], "To do");
  assert.equal(pointAttributes[JOB_LAYER_FIELD.PRIORITY_LABEL], "High");
  assert.equal(pointAttributes[JOB_LAYER_FIELD.RELATED_AOI_COUNT], 1);
  assert.equal(pointAttributes[JOB_LAYER_FIELD.RENDER_CLASS], JOB_RENDER_CLASS.ACTIVE_HIGH);

  assert.equal(polygonAttributes[JOB_LAYER_FIELD.OBJECT_ID], 2);
  assert.equal(polygonAttributes[JOB_LAYER_FIELD.DEADLINE], "-");
  assert.equal(polygonAttributes[JOB_LAYER_FIELD.RELATED_AOI_COUNT], 2);
  assert.equal(polygonAttributes[JOB_LAYER_FIELD.RENDER_CLASS], JOB_RENDER_CLASS.ACTIVE_MEDIUM);
});

test("getJobRenderClass keeps Done Jobs visually separate from priority", () => {
  assert.equal(
    getJobRenderClass({
      priority: "high",
      status: "done",
    }),
    JOB_RENDER_CLASS.DONE
  );

  assert.equal(
    getJobRenderClass({
      priority: "low",
      status: "todo",
    }),
    JOB_RENDER_CLASS.ACTIVE_LOW
  );
});
```

---

## src\JobManager\src\features\map\popups\aoiPopupActions.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import { createAoiSelectionFromGraphic } from "./aoiPopupActions.js";

test("createAoiSelectionFromGraphic uses GlobalID and PRODUCTNAME from AOI attributes", () => {
  const selectedAoi = createAoiSelectionFromGraphic({
    attributes: {
      OBJECTID: 9,
      PRODUCTNAME: "Demo AOI",
      PRODUCTID: "{PRODUCT-ID}",
      GlobalID: "{GLOBAL-ID}",
    },
  });

  assert.deepEqual(selectedAoi, {
    aoiId: "{GLOBAL-ID}",
    aoiName: "Demo AOI",
    objectId: "9",
  });
});

test("createAoiSelectionFromGraphic falls back to PRODUCTID before OBJECTID", () => {
  const selectedAoi = createAoiSelectionFromGraphic({
    attributes: {
      OBJECTID: 9,
      PRODUCTID: "{PRODUCT-ID}",
    },
  });

  assert.deepEqual(selectedAoi, {
    aoiId: "{PRODUCT-ID}",
    aoiName: "Selected AOI",
    objectId: "9",
  });
});

test("createAoiSelectionFromGraphic falls back to prefixed OBJECTID", () => {
  const selectedAoi = createAoiSelectionFromGraphic({
    attributes: {
      OBJECTID: 9,
    },
  });

  assert.deepEqual(selectedAoi, {
    aoiId: "aoi-9",
    aoiName: "Selected AOI",
    objectId: "9",
  });
});
```

---

## src\JobManager\src\features\map\popups\jobPopupActions.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import { JOB_LAYER_FIELD } from "../layers/jobLayerFeatureData.js";
import { createJobSelectionFromGraphic } from "./jobPopupActions.js";

test("createJobSelectionFromGraphic extracts selected Job values from popup graphic", () => {
  const selectedJob = createJobSelectionFromGraphic({
    attributes: {
      [JOB_LAYER_FIELD.OBJECT_ID]: 14,
      [JOB_LAYER_FIELD.JOB_ID]: "job-001",
      [JOB_LAYER_FIELD.TITLE]: "Review harbour update",
      [JOB_LAYER_FIELD.GEOMETRY_TYPE]: "polygon",
    },
  });

  assert.deepEqual(selectedJob, {
    jobId: "job-001",
    jobTitle: "Review harbour update",
    objectId: 14,
    geometryType: "polygon",
    priority: "",
    relatedAoiIds: [],
  });
});

test("createJobSelectionFromGraphic extracts related AOI ids from serialized popup attributes", () => {
  const selectedJob = createJobSelectionFromGraphic({
    attributes: {
      [JOB_LAYER_FIELD.OBJECT_ID]: 14,
      [JOB_LAYER_FIELD.JOB_ID]: "job-001",
      [JOB_LAYER_FIELD.TITLE]: "Review harbour update",
      [JOB_LAYER_FIELD.GEOMETRY_TYPE]: "polygon",
      [JOB_LAYER_FIELD.RELATED_AOI_IDS]: '["{AOI-1}","{AOI-2}"]',
    },
  });

  assert.deepEqual(selectedJob, {
    jobId: "job-001",
    jobTitle: "Review harbour update",
    objectId: 14,
    geometryType: "polygon",
    priority: "",
    relatedAoiIds: ["{AOI-1}", "{AOI-2}"],
  });
});

test("createJobSelectionFromGraphic falls back to graphic geometry type", () => {
  const selectedJob = createJobSelectionFromGraphic({
    geometry: {
      type: "point",
    },
    attributes: {
      [JOB_LAYER_FIELD.OBJECT_ID]: 2,
      [JOB_LAYER_FIELD.JOB_ID]: "job-002",
      [JOB_LAYER_FIELD.TITLE]: "Point Job",
    },
  });

  assert.deepEqual(selectedJob, {
    jobId: "job-002",
    jobTitle: "Point Job",
    objectId: 2,
    geometryType: "point",
    priority: "",
    relatedAoiIds: [],
  });
});

test("createJobSelectionFromGraphic uses fallback title for missing title", () => {
  const selectedJob = createJobSelectionFromGraphic({
    attributes: {
      [JOB_LAYER_FIELD.OBJECT_ID]: 2,
      [JOB_LAYER_FIELD.JOB_ID]: "job-002",
      [JOB_LAYER_FIELD.GEOMETRY_TYPE]: "point",
    },
  });

  assert.deepEqual(selectedJob, {
    jobId: "job-002",
    jobTitle: "Selected Job",
    objectId: 2,
    geometryType: "point",
    priority: "",
    relatedAoiIds: [],
  });
});

test("createJobSelectionFromGraphic returns empty Job id when graphic is missing Job attributes", () => {
  const selectedJob = createJobSelectionFromGraphic({
    attributes: {
      PRODUCTNAME: "Underlying AOI",
    },
  });

  assert.deepEqual(selectedJob, {
    jobId: "",
    jobTitle: "Selected Job",
    objectId: undefined,
    geometryType: "",
    priority: "",
    relatedAoiIds: [],
  });
});

test("createJobSelectionFromGraphic extracts Job priority", () => {
  const selectedJob = createJobSelectionFromGraphic({
    attributes: {
      [JOB_LAYER_FIELD.OBJECT_ID]: 14,
      [JOB_LAYER_FIELD.JOB_ID]: "job-001",
      [JOB_LAYER_FIELD.TITLE]: "Review harbour update",
      [JOB_LAYER_FIELD.GEOMETRY_TYPE]: "point",
      [JOB_LAYER_FIELD.PRIORITY]: "high",
    },
  });

  assert.equal(selectedJob.priority, "high");
});
```

---

## src\JobManager\src\features\map\state\jobClusterSettingsStore.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import { JOB_CLUSTER_PRESET, JOB_CLUSTER_STYLE } from "../domain/jobClusterSettings.js";
import { createJobClusterSettingsStore } from "./jobClusterSettingsStore.js";

test("createJobClusterSettingsStore stores and resets clustering settings", () => {
  const store = createJobClusterSettingsStore();
  const snapshots = [];

  const unsubscribe = store.subscribe((snapshot) => {
    snapshots.push(snapshot);
  });

  store.setSettings({
    preset: JOB_CLUSTER_PRESET.LARGE,
    style: JOB_CLUSTER_STYLE.PRIORITY_PIE,
  });

  assert.deepEqual(store.getSnapshot().settings, {
    preset: JOB_CLUSTER_PRESET.LARGE,
    style: JOB_CLUSTER_STYLE.PRIORITY_PIE,
  });

  store.resetSettings();

  assert.deepEqual(store.getSnapshot().settings, {
    preset: JOB_CLUSTER_PRESET.MEDIUM,
    style: JOB_CLUSTER_STYLE.COUNT,
  });
  assert.equal(snapshots.length, 3);

  unsubscribe();
});

test("createJobClusterSettingsStore normalizes invalid presets and styles", () => {
  const store = createJobClusterSettingsStore();

  store.setSettings({
    preset: "bad-value",
    style: "bad-style",
  });

  assert.deepEqual(store.getSnapshot().settings, {
    preset: JOB_CLUSTER_PRESET.MEDIUM,
    style: JOB_CLUSTER_STYLE.COUNT,
  });
});

test("createJobClusterSettingsStore preserves existing style when only preset changes", () => {
  const store = createJobClusterSettingsStore({
    preset: JOB_CLUSTER_PRESET.MEDIUM,
    style: JOB_CLUSTER_STYLE.PRIORITY_GROUPS,
  });

  store.setSettings({
    preset: JOB_CLUSTER_PRESET.SMALL,
  });

  assert.deepEqual(store.getSnapshot().settings, {
    preset: JOB_CLUSTER_PRESET.SMALL,
    style: JOB_CLUSTER_STYLE.PRIORITY_GROUPS,
  });
});
```

---

## src\JobManager\src\features\relations\domain\relationModel.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAoiJobSummaries,
  buildAoiJobSummaryByAoiId,
  getAoiJobSummary,
  toAoiModelJobSummary,
} from "./aoiJobSummary.js";
import {
  buildRelationsFromJobs,
  getAoiIdsForJob,
  getJobIdsForAoi,
  RELATION_SOURCE,
} from "./relationModel.js";

const JOBS = Object.freeze([
  {
    id: "job-001",
    status: "todo",
    priority: "high",
    relatedAoiIds: ["aoi-001", "aoi-002", "aoi-002"],
  },
  {
    id: "job-002",
    status: "inProgress",
    priority: "medium",
    relatedAoiIds: ["aoi-001"],
  },
  {
    id: "job-003",
    status: "done",
    priority: "high",
    relatedAoiIds: ["aoi-001"],
  },
  {
    id: "job-004",
    status: "todo",
    priority: "low",
    relatedAoiIds: [],
  },
]);

test("buildRelationsFromJobs creates normalized mock relations from Job AOI ids", () => {
  const relations = buildRelationsFromJobs(JOBS, { source: RELATION_SOURCE.MOCK });

  assert.deepEqual(relations, [
    {
      jobId: "job-001",
      aoiIds: ["aoi-001", "aoi-002"],
      source: "mock",
    },
    {
      jobId: "job-002",
      aoiIds: ["aoi-001"],
      source: "mock",
    },
    {
      jobId: "job-003",
      aoiIds: ["aoi-001"],
      source: "mock",
    },
  ]);
});

test("relation lookup works from both Job and AOI direction", () => {
  const relations = buildRelationsFromJobs(JOBS);

  assert.deepEqual(getAoiIdsForJob({ relations, jobId: "job-001" }), ["aoi-001", "aoi-002"]);
  assert.deepEqual(getJobIdsForAoi({ relations, aoiId: "aoi-001" }), [
    "job-001",
    "job-002",
    "job-003",
  ]);
});

test("buildAoiJobSummaries derives total, active and high priority Job counts", () => {
  const relations = buildRelationsFromJobs(JOBS);
  const summaries = buildAoiJobSummaries({ jobs: JOBS, relations });
  const summaryByAoiId = buildAoiJobSummaryByAoiId({ jobs: JOBS, relations });

  assert.deepEqual(summaries, [
    {
      aoiId: "aoi-001",
      total: 3,
      active: 2,
      highPriority: 2,
      activeHighPriority: 1,
      jobIds: ["job-001", "job-002", "job-003"],
    },
    {
      aoiId: "aoi-002",
      total: 1,
      active: 1,
      highPriority: 1,
      activeHighPriority: 1,
      jobIds: ["job-001"],
    },
  ]);
  assert.deepEqual(toAoiModelJobSummary(summaryByAoiId.get("aoi-001")), {
    total: 3,
    active: 2,
    highPriority: 2,
  });
});

test("getAoiJobSummary supports plain object snapshots returned by relation services", () => {
  const summary = getAoiJobSummary(
    {
      "aoi-001": {
        aoiId: "aoi-001",
        total: 3,
        active: 2,
        highPriority: 2,
        activeHighPriority: 1,
        jobIds: ["job-001", "job-002", "job-002"],
      },
    },
    "aoi-001"
  );

  assert.deepEqual(summary, {
    aoiId: "aoi-001",
    total: 3,
    active: 2,
    highPriority: 2,
    activeHighPriority: 1,
    jobIds: ["job-001", "job-002"],
  });
});

test("getAoiJobSummary returns an empty summary when an AOI has no matching Jobs", () => {
  assert.deepEqual(getAoiJobSummary({}, "aoi-missing"), {
    aoiId: "aoi-missing",
    total: 0,
    active: 0,
    highPriority: 0,
    activeHighPriority: 0,
    jobIds: [],
  });
});
```

---

## src\JobManager\src\features\relations\services\relationService.test.js

```
import assert from "node:assert/strict";
import test from "node:test";

import { loadAoiJobRelationSnapshot } from "./relationService.js";

const JOBS = Object.freeze([
  {
    id: "job-001",
    status: "todo",
    priority: "high",
    relatedAoiIds: ["aoi-001", "aoi-002"],
  },
  {
    id: "job-002",
    status: "inProgress",
    priority: "medium",
    relatedAoiIds: ["aoi-001"],
  },
  {
    id: "job-003",
    status: "done",
    priority: "high",
    relatedAoiIds: ["aoi-001"],
  },
]);

test("loadAoiJobRelationSnapshot preserves existing unfiltered behavior when no Job filters are provided", async () => {
  const result = await loadAoiJobRelationSnapshot({
    jobs: JOBS,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.summaryByAoiId["aoi-001"], {
    aoiId: "aoi-001",
    total: 3,
    active: 2,
    highPriority: 2,
    activeHighPriority: 1,
    jobIds: ["job-001", "job-002", "job-003"],
  });
});

test("loadAoiJobRelationSnapshot hides Done Jobs when default Job filters are provided", async () => {
  const result = await loadAoiJobRelationSnapshot({
    jobs: JOBS,
    jobFilters: {},
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.summaryByAoiId["aoi-001"], {
    aoiId: "aoi-001",
    total: 2,
    active: 2,
    highPriority: 1,
    activeHighPriority: 1,
    jobIds: ["job-001", "job-002"],
  });
});

test("loadAoiJobRelationSnapshot applies explicit Job filters before building AOI summaries", async () => {
  const result = await loadAoiJobRelationSnapshot({
    jobs: JOBS,
    jobFilters: {
      highPriorityOnly: true,
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.summaryByAoiId["aoi-001"], {
    aoiId: "aoi-001",
    total: 1,
    active: 1,
    highPriority: 1,
    activeHighPriority: 1,
    jobIds: ["job-001"],
  });
});

test("loadAoiJobRelationSnapshot reveals Done Jobs for explicit Done status filter", async () => {
  const result = await loadAoiJobRelationSnapshot({
    jobs: JOBS,
    jobFilters: {
      statusValues: ["done"],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.summaryByAoiId["aoi-001"], {
    aoiId: "aoi-001",
    total: 1,
    active: 0,
    highPriority: 1,
    activeHighPriority: 0,
    jobIds: ["job-003"],
  });
});
```

---

## src\JobManager\src\styles\base.css

```
html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
}

html {
  font-size: 16px;
}

body {
  overflow: hidden;
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  background: #d7e3ef;
  color: var(--jm-text);
}

button {
  font: inherit;
}

.job-manager-app {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: var(--jm-navbar-height) minmax(0, 1fr);
  overflow: hidden;
}

@media (max-width: 54rem) {
  .job-manager-app {
    grid-template-rows: auto minmax(0, 1fr);
  }
}
```

---

## src\JobManager\src\styles\filterPopover.css

```
#filters-popover {
  z-index: 1001;
}

.job-manager-filters {
  display: flex;
  flex-direction: column;
  width: min(26rem, calc(100vw - 0.75rem));
  max-height: min(40rem, calc(100vh - var(--jm-navbar-height) - 0.75rem));
  color: var(--jm-text);
  background: var(--jm-surface);
  overflow: hidden;
}

.job-manager-filters__header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.45rem 0.65rem 0.4rem 0.75rem;
  border-bottom: 1px solid var(--jm-border);
  background: var(--jm-surface);
}

.job-manager-filters__header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.4rem;
}

.job-manager-filters__header calcite-action {
  --calcite-color-foreground-1: transparent;
}

.job-manager-filters__clear-button {
  min-width: 6.1rem;
}

.job-manager-filters__title {
  margin: 0;
  color: var(--jm-text);
  font-size: 1rem;
  font-weight: 700;
}

.job-manager-filters__summary {
  flex: 0 0 auto;
  margin: 0;
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid var(--jm-border);
  color: var(--jm-text-muted);
  font-size: 0.82rem;
  line-height: 1.3;
  background: var(--jm-surface-alt);
}

.job-manager-filters__scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0.55rem 0.75rem 0.8rem;
}

.job-manager-filters__section {
  padding: 0.15rem 0 0.65rem;
}

.job-manager-filters__section + .job-manager-filters__section {
  padding-top: 0.65rem;
  border-top: 1px solid var(--jm-border);
}

.job-manager-filters__section-title {
  margin: 0 0 0.4rem;
  color: var(--jm-text);
  font-size: 0.92rem;
  font-weight: 700;
}

.job-manager-filters__section-title--hinted {
  cursor: help;
}

.job-manager-filters__section-hint {
  margin: 0 0 0.45rem;
  color: var(--jm-text-muted);
  font-size: 0.8rem;
  line-height: 1.3;
}

.job-manager-filters__section-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.45rem;
}

.job-manager-filters__button-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.35rem;
}

.job-manager-filters__button-grid--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.job-manager-filters__button-grid--four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.job-manager-filters__preset-button,
.job-manager-filters__toggle-button {
  width: 100%;
}

.job-manager-filters__preset-button:focus:not(:focus-visible),
.job-manager-filters__toggle-button:focus:not(:focus-visible),
.job-manager-filters__clear-button:focus:not(:focus-visible) {
  outline: none;
}

.job-manager-filters__preset-button:focus-visible,
.job-manager-filters__toggle-button:focus-visible,
.job-manager-filters__clear-button:focus-visible {
  outline: 2px solid var(--calcite-color-brand, #007ac2);
  outline-offset: 2px;
}

@media (max-width: 420px) {
  .job-manager-filters__button-grid--three,
  .job-manager-filters__button-grid--four {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-height: 640px) {
  .job-manager-filters {
    max-height: calc(100vh - var(--jm-navbar-height) - 0.5rem);
  }

  .job-manager-filters__header {
    padding-top: 0.35rem;
    padding-bottom: 0.3rem;
  }

  .job-manager-filters__summary,
  .job-manager-filters__scroll {
    padding-right: 0.65rem;
    padding-left: 0.65rem;
  }

  .job-manager-filters__section + .job-manager-filters__section {
    padding-top: 0.55rem;
  }
}
```

---

## src\JobManager\src\styles\jobs.css

```
.job-list {
  min-height: 0;
}

.job-list--details {
  margin-inline: -0.85rem;
}

.job-list__scope {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: start;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
  padding: 0.75rem;
  border: 1px solid var(--jm-border);
  border-left: 4px solid var(--jm-color-brand);
  background: var(--jm-surface);
}

.job-list__scope-text {
  min-width: 0;
}

.job-list__scope-label {
  margin: 0;
  color: var(--jm-text-muted);
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
}

.job-list__scope-title {
  margin: 0.2rem 0 0;
  color: var(--jm-text);
  font-size: 0.92rem;
  font-weight: 700;
}

.job-list__scope calcite-button::part(button) {
  border-radius: 0;
}

.job-list__toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.job-list__count-group {
  min-width: 0;
}

.job-list__count {
  margin: 0;
  color: var(--jm-text);
  font-size: 0.92rem;
  font-weight: 700;
}

.job-list__hidden-done-count {
  margin: 0.15rem 0 0;
  color: var(--jm-text-muted);
  font-size: 0.78rem;
}

.job-list__toolbar-actions {
  display: grid;
  gap: 0.35rem;
  justify-items: end;
}

.job-list__toolbar-action-row {
  display: flex;
  justify-content: flex-end;
  gap: 0.35rem;
}

.job-list__toolbar-actions calcite-button::part(button) {
  border-radius: 0;
}

.job-list__items {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.job-list__state,
.job-list__inline-error {
  margin: 0;
  padding: 0.75rem;
  border: 1px dashed var(--jm-border);
  color: var(--jm-text-muted);
  font-size: 0.92rem;
}

.job-list__state {
  display: grid;
  gap: 0.65rem;
}

.job-list__inline-error {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: start;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
  border-style: solid;
  border-left: 4px solid #dc3545;
  color: var(--jm-text);
  background: var(--jm-notice-error-bg);
}

.job-list__state--error {
  border-style: solid;
  border-left: 4px solid #dc3545;
  color: var(--jm-text);
  background: var(--jm-notice-error-bg);
}

.job-list__state--loading {
  border-style: solid;
  color: var(--jm-text);
  background: var(--jm-surface);
}

.job-list__state-content {
  min-width: 0;
}

.job-list__state-title {
  margin: 0;
  color: var(--jm-text);
  font-weight: 800;
}

.job-list__state-message {
  margin: 0.25rem 0 0;
  color: var(--jm-text-muted);
}

.job-list__state-actions {
  display: flex;
  justify-content: flex-end;
}

.job-list__state calcite-button::part(button),
.job-list__inline-error calcite-button::part(button) {
  border-radius: 0;
}

.job-card {
  padding: 0.7rem;
  border: 1px solid var(--jm-border);
  border-left: 4px solid var(--jm-color-status-todo-text);
  background: var(--jm-surface);
}

.job-card:focus,
.job-card:focus-visible,
.job-details:focus,
.job-details:focus-visible {
  outline: none;
}

.job-card[data-job-status="inProgress"] {
  border-left-color: var(--jm-color-status-in-progress-text);
}

.job-card[data-job-status="done"] {
  border-left-color: var(--jm-color-status-done-text);
}

.job-card--selected {
  border-left-color: var(--calcite-color-brand);
  background: color-mix(in srgb, var(--calcite-color-brand) 5%, var(--jm-surface));
}

.job-card--selected .job-card__title::after {
  content: "Selected";
  display: inline-flex;
  margin-left: 0.5rem;
  padding: 0.1rem 0.35rem;
  border: 1px solid var(--calcite-color-brand);
  border-radius: 0;
  color: var(--calcite-color-brand);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.job-card__summary-layout {
  display: grid;
  gap: 0.65rem;
}

.job-card__top-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  gap: 0.75rem;
  align-items: start;
}

.job-card__bottom-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  gap: 0.75rem;
  align-items: end;
}

.job-card__title-row {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  min-width: 0;
}

.job-card__expand-action,
.job-card__details-action {
  flex: 0 0 auto;
  margin-top: -0.25rem;
  --calcite-color-foreground-1: transparent;
}

.job-card__title {
  min-width: 0;
  margin: 0;
  font-size: 0.93rem;
  font-weight: 700;
  line-height: 1.25;
}

.job-card__badge-column {
  display: grid;
  justify-items: end;
  gap: 0.35rem;
}

.job-card__date-chips {
  display: grid;
  grid-template-columns: max-content;
  gap: 0.3rem;
}

.job-card__date-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  width: 7.4rem;
  min-height: 1.55rem;
  padding: 0.15rem 0.45rem;
  border: 1px solid var(--jm-border);
  background: var(--calcite-color-foreground-2, #f8f9fa);
  color: var(--jm-text);
  font-size: 0.78rem;
  line-height: 1;
}

.job-card__date-chip calcite-icon {
  flex: 0 0 auto;
  color: var(--jm-text-muted);
}

.job-card__date-chip-text {
  min-width: 0;
  white-space: nowrap;
}

.job-card__priority,
.job-card__aoi-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3.35rem;
  min-height: 1.55rem;
  padding: 0.15rem 0.4rem;
  border: 1px solid transparent;
  font-size: 0.76rem;
  font-weight: 800;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
}

.job-card__priority--low {
  border-color: var(--jm-color-priority-low-bg);
  background: var(--jm-color-priority-low-bg);
  color: var(--jm-color-priority-low-text);
}

.job-card__priority--medium {
  border-color: var(--jm-color-priority-medium-bg);
  background: var(--jm-color-priority-medium-bg);
  color: var(--jm-color-priority-medium-text);
}

.job-card__priority--high {
  border-color: var(--jm-color-priority-high-bg);
  background: var(--jm-color-priority-high-bg);
  color: var(--jm-color-priority-high-text);
}

.job-card__aoi-count--none {
  border-color: var(--jm-color-aoi-none-bg);
  background: var(--jm-color-aoi-none-bg);
  color: var(--jm-color-aoi-none-text);
}

.job-card__aoi-count--low {
  border-color: var(--jm-color-aoi-low-bg);
  background: var(--jm-color-aoi-low-bg);
  color: var(--jm-color-aoi-low-text);
}

.job-card__aoi-count--medium {
  border-color: var(--jm-color-aoi-medium-bg);
  background: var(--jm-color-aoi-medium-bg);
  color: var(--jm-color-aoi-medium-text);
}

.job-card__aoi-count--high {
  border-color: var(--jm-color-aoi-high-bg);
  background: var(--jm-color-aoi-high-bg);
  color: var(--jm-color-aoi-high-text);
}

.job-card__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-self: end;
  gap: 0.35rem;
}

.job-status-button {
  outline: none;
}

.job-status-button:focus {
  outline: none;
}

.job-status-button:focus-visible {
  outline: 2px solid var(--calcite-color-brand);
  outline-offset: 2px;
}

.job-status-button--pointer-focus,
.job-status-button--pointer-focus:focus,
.job-status-button--pointer-focus:focus-visible {
  outline: none;
  box-shadow: none;
  --calcite-color-focus: transparent;
}

.job-status-button::part(button) {
  border-radius: 0;
  font-weight: 600;
}

.job-status-button::part(button):focus,
.job-status-button::part(button):focus-visible {
  outline: none;
  box-shadow: none;
}

.job-status-button--active::part(button) {
  font-weight: 800;
}

.job-card__details {
  margin-top: 0.65rem;
  padding-top: 0.65rem;
  border-top: 1px solid var(--jm-border);
}

.job-card__description {
  margin: 0;
  color: var(--jm-text-muted);
  font-size: 0.88rem;
}

.job-details__header {
  position: sticky;
  top: var(--jm-jobs-panel-header-height, 5.25rem);
  z-index: 6;
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: start;
  gap: 0.55rem;
  margin: 0;
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid var(--jm-border);
  border-left: 4px solid var(--calcite-color-brand);
  background: var(--jm-surface);
}

.job-details__title-group {
  min-width: 0;
}

.job-details__eyebrow {
  margin: 0;
  color: var(--jm-text-muted);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.job-details__title {
  margin: 0.1rem 0 0;
  color: var(--jm-text);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.2;
}

.job-details__badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.45rem;
}

.job-details__header-actions {
  display: grid;
  gap: 0.35rem;
  justify-items: end;
}

.job-details__header-actions calcite-button::part(button) {
  border-radius: 0;
}

.job-details__status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 5.5rem;
  min-height: 1.55rem;
  padding: 0.15rem 0.5rem;
  border: 1px solid transparent;
  font-size: 0.76rem;
  font-weight: 800;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
}

.job-details__status--todo {
  border-color: var(--jm-color-status-todo-bg);
  background: var(--jm-color-status-todo-bg);
  color: var(--jm-color-status-todo-text);
}

.job-details__status--in-progress {
  border-color: var(--jm-color-status-in-progress-bg);
  background: var(--jm-color-status-in-progress-bg);
  color: var(--jm-color-status-in-progress-text);
}

.job-details__status--done {
  border-color: var(--jm-color-status-done-bg);
  background: var(--jm-color-status-done-bg);
  color: var(--jm-color-status-done-text);
}

.job-details {
  display: grid;
  gap: 0;
  margin: 0;
  border-bottom: 1px solid var(--jm-border);
  background: var(--jm-surface);
}

.job-details__section {
  display: grid;
  gap: 0.5rem;
  padding: 0.65rem 0.75rem;
  border: 0;
  border-top: 1px solid var(--jm-border);
  background: transparent;
}

.job-details__section:first-child {
  border-top: 0;
}

.job-details__section-title {
  margin: 0;
  color: var(--jm-text);
  font-size: 0.9rem;
  font-weight: 800;
}

.job-details__summary,
.job-details__hint,
.job-details__empty {
  margin: 0;
  color: var(--jm-text-muted);
  font-size: 0.9rem;
  line-height: 1.45;
}

.job-details__fact-grid {
  display: grid;
  gap: 0.45rem;
  margin: 0;
}

.job-details__fact {
  display: grid;
  grid-template-columns: 7.5rem minmax(0, 1fr);
  gap: 0.65rem;
  align-items: baseline;
}

.job-details__fact-label {
  color: var(--jm-text-muted);
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

.job-details__fact-value {
  min-width: 0;
  margin: 0;
  color: var(--jm-text);
  font-size: 0.9rem;
  overflow-wrap: anywhere;
}

.job-details__aoi-list {
  display: grid;
  gap: 0.35rem;
  margin: 0;
  padding-left: 1.1rem;
}

.job-details__aoi-item {
  color: var(--jm-text);
  font-size: 0.86rem;
  overflow-wrap: anywhere;
}

@media (max-width: 34rem) {
  .job-list--details {
    margin-inline: -0.65rem;
  }

  .job-list__toolbar {
    grid-template-columns: 1fr;
  }

  .job-list__toolbar-actions {
    justify-items: start;
  }

  .job-list__toolbar-action-row {
    justify-content: flex-start;
  }

  .job-card__top-row,
  .job-card__bottom-row {
    grid-template-columns: 1fr;
  }

  .job-card__badge-column {
    justify-items: start;
  }

  .job-card__actions {
    justify-content: flex-start;
  }

  .job-details__header {
    grid-template-columns: 1fr;
  }

  .job-details__header-actions {
    justify-items: start;
  }

  .job-details__fact {
    grid-template-columns: 1fr;
    gap: 0.15rem;
  }
}
```

---

## src\JobManager\src\styles\loader.css

```
.job-manager-startup-loader {
  position: fixed;
  z-index: 5000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 2rem;
  background: rgba(10, 18, 26, 0.28);
  color: #ffffff;
  opacity: 1;
  transition: opacity 200ms ease;
}

.job-manager-startup-loader[hidden] {
  display: none;
  opacity: 0;
  pointer-events: none;
}

.job-manager-startup-loader__card {
  width: min(560px, calc(100vw - 48px));
  display: grid;
  gap: 12px;
  padding: 18px 22px 16px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.08)),
    rgba(28, 35, 43, 0.46);
  box-shadow:
    0 18px 48px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
  text-align: center;
  backdrop-filter: blur(16px) saturate(145%);
  -webkit-backdrop-filter: blur(16px) saturate(145%);
}

.job-manager-startup-loader__title {
  margin: 0;
  color: #ffffff;
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1.25;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
}

.job-manager-startup-loader__text {
  min-height: 24px;
  margin: 0;
  padding: 0 8px;
  color: #ffffff;
  font-size: 15px;
  font-weight: 650;
  line-height: 1.35;
  text-align: center;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
  text-wrap: balance;
  white-space: pre-line;
}

.job-manager-startup-loader__detail {
  min-height: 16px;
  margin: 0;
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
  text-align: center;
  text-wrap: balance;
  white-space: pre-line;
}

.job-manager-startup-loader__detail[hidden] {
  display: none;
}

.job-manager-startup-loader__progress {
  position: relative;
  width: 100%;
  height: 8px;
  overflow: hidden;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.24);
}

.job-manager-startup-loader__progress-fill {
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: var(--calcite-color-brand, #009af2);
  box-shadow: 0 0 16px color-mix(in srgb, var(--calcite-color-brand, #009af2) 60%, transparent);
  transition: width 160ms ease;
}

.job-manager-startup-loader__progress.is-indeterminate .job-manager-startup-loader__progress-fill {
  width: 45%;
  animation: job-manager-loader-indeterminate 1.2s ease-in-out infinite;
}

.job-manager-startup-loader__progress-label {
  min-height: 16px;
  margin: 0;
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  text-align: center;
}

.job-manager-startup-loader__action {
  justify-self: center;
  min-height: 2rem;
  margin-top: 0.1rem;
  padding: 0.35rem 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
  font: inherit;
  font-size: 0.86rem;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  cursor: pointer;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.job-manager-startup-loader__action:hover,
.job-manager-startup-loader__action:focus-visible {
  background: rgba(255, 255, 255, 0.2);
  outline: 2px solid var(--calcite-color-brand, #009af2);
  outline-offset: 2px;
}

@keyframes job-manager-loader-indeterminate {
  0% {
    transform: translateX(-120%);
  }

  100% {
    transform: translateX(240%);
  }
}
```

---

## src\JobManager\src\styles\main.css

```
@import "@esri/calcite-components/main.css";
@import "./tokens.css";
@import "./base.css";
@import "./loader.css";
@import "./navbar.css";
@import "./filterPopover.css";
@import "./map.css";
@import "./overlays.css";
@import "./notices.css";
@import "./jobs.css";
```

---

## src\JobManager\src\styles\map.css

```
.job-manager-workspace {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.job-manager-map {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #d7e3ef;
}

.job-manager-map__view {
  position: absolute;
  inset: 0;
}

.job-manager-map__screen-reader-title {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  border: 0;
  white-space: nowrap;
}

.job-manager-map-status {
  position: absolute;
  z-index: 5;
  top: 1rem;
  left: 50%;
  width: min(26rem, calc(100vw - 2rem));
  padding: 0.75rem 1rem;
  border: 1px solid var(--jm-border);
  border-radius: 0;
  background: var(--jm-overlay);
  box-shadow: var(--jm-shadow);
  transform: translateX(-50%);
  backdrop-filter: blur(12px);
}

.job-manager-map-status[hidden] {
  display: none;
}

.job-manager-app--startup-blocked .job-manager-map-status {
  display: none;
}

.job-manager-map-status[data-status="error"] {
  border-color: rgba(155, 28, 49, 0.42);
}

.job-manager-map-status[data-status="warning"] {
  border-color: rgba(255, 174, 0, 0.55);
}

.job-manager-map-status__title {
  margin: 0;
  color: var(--jm-header-bg);
  font-size: 0.9rem;
  font-weight: 700;
}

.job-manager-map-status__message {
  margin: 0.25rem 0 0;
  color: var(--jm-text);
  font-size: 0.85rem;
}

.job-manager-aoi-popup-summary {
  display: grid;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--jm-border);
}

.job-manager-aoi-popup-summary__title {
  margin: 0;
  color: var(--jm-header-bg);
  font-size: 0.9rem;
  font-weight: 800;
}

.job-manager-aoi-popup-summary__message,
.job-manager-aoi-popup-summary__hint {
  margin: 0;
  color: var(--jm-text-muted);
  font-size: 0.82rem;
}

.job-manager-aoi-popup-summary__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.35rem;
}

.job-manager-aoi-popup-summary__metric {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
  padding: 0.45rem;
  border: 1px solid var(--jm-border);
  background: rgba(255, 255, 255, 0.72);
}

.job-manager-aoi-popup-summary__metric-value {
  color: var(--jm-header-bg);
  font-size: 1rem;
  font-weight: 800;
  line-height: 1;
}

.job-manager-aoi-popup-summary__metric-label {
  color: var(--jm-text-muted);
  font-size: 0.72rem;
  line-height: 1.15;
}

.job-manager-cluster-picker {
  display: grid;
  gap: 6px;
  min-width: 320px;
  max-width: 380px;
  padding: 4px 2px;
  color: var(--jm-popup-text, var(--jm-text));
  background: var(--jm-popup-surface, transparent);
}

.job-manager-cluster-picker__message {
  margin: 0;
  color: var(--jm-text-muted);
  font-size: 0.82rem;
}

.job-manager-cluster-picker__list {
  display: grid;
  gap: 6px;
}

.job-manager-cluster-picker__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: flex-start;
  width: 100%;
  min-height: 54px;
  padding: 9px 10px;
  color: var(--jm-popup-text, var(--jm-text));
  background: var(--jm-popup-surface-alt, rgba(255, 255, 255, 0.72));
  border: 1px solid var(--jm-popup-border, var(--jm-border));
  border-radius: 6px;
  text-align: left;
  cursor: pointer;
}

.job-manager-cluster-picker__item:hover,
.job-manager-cluster-picker__item:focus-visible {
  background: var(--jm-button-secondary-bg-hover, rgba(69, 97, 120, 0.12));
  outline: none;
}

.job-manager-cluster-picker__content {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.job-manager-cluster-picker__job-title {
  overflow: hidden;
  color: var(--jm-popup-text, var(--jm-text));
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-manager-cluster-picker__job-subtitle {
  overflow: hidden;
  color: var(--jm-popup-text-muted, var(--jm-text-muted));
  font-size: 12px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-manager-cluster-picker__priority-marker {
  flex: 0 0 auto;
  width: 0.75rem;
  height: 0.75rem;
  margin-top: 0.2rem;
  border: 1px solid rgba(0, 0, 0, 0.25);
  border-radius: 999px;
  background: var(--jm-color-priority-medium-bg);
}

.job-manager-cluster-picker__priority-marker[data-priority="low"] {
  background: var(--jm-color-priority-low-bg);
}

.job-manager-cluster-picker__priority-marker[data-priority="medium"] {
  background: var(--jm-color-priority-medium-bg);
}

.job-manager-cluster-picker__priority-marker[data-priority="high"] {
  background: var(--jm-color-priority-high-bg);
}

@media (max-width: 54rem) {
  .job-manager-map-status {
    top: 0.75rem;
  }
}
/* =========================================================
   ArcGIS popup theme integration
   Feed popup-related Calcite tokens into ArcGIS popup surfaces so
   the SDK UI follows the same theme as the rest of the app.
   ========================================================= */

.esri-popup {
  --calcite-color-background: var(--jm-popup-surface);
  --calcite-color-foreground-1: var(--jm-popup-surface);
  --calcite-color-foreground-2: var(--jm-popup-surface-alt);
  --calcite-color-foreground-3: var(--jm-popup-surface-alt);

  --calcite-color-surface-1: var(--jm-popup-surface);
  --calcite-color-surface-2: var(--jm-popup-surface-alt);
  --calcite-color-surface-3: var(--jm-popup-surface-alt);

  --calcite-color-border-1: var(--jm-popup-border);
  --calcite-color-border-2: var(--jm-popup-border);
  --calcite-color-border-3: var(--jm-popup-border);

  --calcite-color-text-1: var(--jm-popup-text);
  --calcite-color-text-2: var(--jm-popup-text);
  --calcite-color-text-3: var(--jm-popup-text-muted);

  --calcite-ui-background: var(--jm-popup-surface);
  --calcite-ui-foreground-1: var(--jm-popup-surface);
  --calcite-ui-foreground-2: var(--jm-popup-surface-alt);
  --calcite-ui-foreground-3: var(--jm-popup-surface-alt);
  --calcite-ui-border-1: var(--jm-popup-border);
  --calcite-ui-border-2: var(--jm-popup-border);
  --calcite-ui-border-3: var(--jm-popup-border);
  --calcite-ui-text-1: var(--jm-popup-text);
  --calcite-ui-text-2: var(--jm-popup-text);
  --calcite-ui-text-3: var(--jm-popup-text-muted);

  --calcite-action-bar-background-color: var(--jm-popup-surface);
  --calcite-action-background-color: transparent;
  --calcite-action-background-color-hover: var(--jm-popup-surface-alt);
  --calcite-action-background-color-press: var(--jm-popup-surface-alt);
  --calcite-action-text-color: var(--jm-popup-text);
  --calcite-action-text-color-press: var(--jm-popup-text);
}

.esri-popup__main-container {
  background: var(--jm-popup-surface);
  color: var(--jm-popup-text);
}

.esri-popup__content {
  margin: 0;
  background: var(--jm-popup-surface);
  color: var(--jm-popup-text);
}

.esri-popup__content p {
  margin: 0;
}

.esri-popup__header-title {
  color: var(--jm-popup-text);
  font-size: 14px;
  font-weight: 600;
}

.esri-popup__footer,
.esri-popup__button-container,
.esri-popup__action-menu {
  background: var(--jm-popup-surface);
  color: var(--jm-popup-text);
  border-color: var(--jm-popup-border);
}

.esri-popup__action.is-disabled,
.esri-popup__action[disabled] {
  color: var(--jm-popup-text-muted);
  opacity: 0.65;
}

html.calcite-mode-dark .job-manager-map {
  background: #1f2933;
}

.job-manager-aoi-popup-summary,
.job-manager-cluster-picker {
  color: var(--jm-popup-text);
  background: var(--jm-popup-surface);
}

.job-manager-aoi-popup-summary__metric,
.job-manager-cluster-picker__item {
  color: var(--jm-popup-text);
  background: var(--jm-popup-surface-alt);
  border-color: var(--jm-popup-border);
}

.job-manager-aoi-popup-summary__title,
.job-manager-aoi-popup-summary__metric-value,
.job-manager-cluster-picker__job-title {
  color: var(--jm-popup-text);
}

.job-manager-aoi-popup-summary__message,
.job-manager-aoi-popup-summary__hint,
.job-manager-aoi-popup-summary__metric-label,
.job-manager-cluster-picker__message,
.job-manager-cluster-picker__job-subtitle {
  color: var(--jm-popup-text-muted);
}
/* =========================================================
   Accessibility / map focus cleanup
   ========================================================= */

.esri-view-surface:focus::after,
.esri-view-surface:focus-visible::after,
.esri-ui:focus::after,
.esri-ui:focus-visible::after {
  display: none;
  opacity: 0;
  box-shadow: none;
}
```

---

## src\JobManager\src\styles\navbar.css

```
#header {
  display: flex;
  align-items: center;
  height: var(--jm-navbar-height);
  padding: 0 12px;
  gap: 18px;
  background-color: var(--jm-header-bg);
}

.header-left {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}

.header-center {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 24px;
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  min-width: 0;
}

.navbar-logo {
  display: block;
  width: 42px;
  height: 42px;
}

.navbar-title-link,
.navbar-title-link:visited {
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 0 2px;
  color: inherit;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
}

.navbar-title-link:hover,
.navbar-title-link:focus,
.navbar-title-link:active {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 4px;
}

.navbar-panel-button {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0 0.55rem;
  border: 0;
  border-radius: 10px;
  color: #ffffff;
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}

.navbar-panel-button calcite-icon {
  color: currentColor;
}

.navbar-panel-button:hover,
.navbar-panel-button:focus-visible,
.navbar-panel-button[aria-expanded="true"] {
  background: rgba(255, 255, 255, 0.22);
  outline: none;
}

.navbar-panel-button:focus-visible {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.65);
}

#last-updated {
  color: #ffffff;
  font-size: 14px;
  white-space: nowrap;
}

.header-right > calcite-action {
  border-radius: 10px;
  --calcite-color-foreground-1: transparent;
  --calcite-color-text-3: white;
  --calcite-action-background-color-hover: rgba(255, 255, 255, 0.25);
  --calcite-action-text-color-press: white;
}

.header-right > calcite-action:hover {
  --calcite-color-foreground-1: white;
  --calcite-action-background-color-hover: rgba(255, 255, 255, 0.25);
}

#filters-button[active],
#test-notice-button[active] {
  --calcite-color-foreground-1: rgb(255, 255, 255);
}

@media (max-width: 54rem) {
  #header {
    align-items: flex-start;
    height: auto;
    min-height: var(--jm-navbar-height);
    padding: 0.5rem 0.75rem;
    flex-wrap: wrap;
  }

  .header-center {
    order: 3;
    flex-basis: 100%;
    gap: 20px;
  }

  .header-right {
    margin-left: auto;
  }
}

.job-manager-filters {
  display: grid;
  gap: 0.9rem;
  width: min(22rem, calc(100vw - 2rem));
  padding: 0.85rem;
  color: var(--jm-text);
}

.job-manager-filters__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: center;
  gap: 0.75rem;
}

.job-manager-filters__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
}

.job-manager-filters__summary {
  margin: 0;
  color: var(--jm-text-muted);
  font-size: 0.82rem;
}

.job-manager-filters__section {
  display: grid;
  gap: 0.45rem;
}

.job-manager-filters__section-title {
  margin: 0;
  color: var(--jm-text);
  font-size: 0.84rem;
  font-weight: 800;
}

.job-manager-filters__checkbox-grid {
  display: grid;
  gap: 0.35rem;
}

.job-manager-filters__checkbox-label {
  margin: 0;
  color: var(--jm-text);
}

.job-manager-filters__actions {
  display: flex;
  justify-content: flex-end;
}

.job-manager-filters calcite-button::part(button) {
  border-radius: 0;
}

.job-manager-filters__section-hint {
  margin: 0;
  color: var(--jm-text-muted);
  font-size: 0.76rem;
}

.job-manager-filters__button-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.job-manager-filters__preset-button::part(button) {
  justify-content: center;
  border-radius: 0;
}
```

---

## src\JobManager\src\styles\notices.css

```
.job-manager-notices {
  position: fixed;
  z-index: 1000;
  right: 1rem;
  bottom: 1rem;
  width: min(26rem, calc(100vw - 2rem));
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  pointer-events: none;
}

.job-manager-notice {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--jm-border);
  border-left-width: 0.35rem;
  border-radius: 0;
  color: var(--jm-text);
  background: var(--jm-surface);
  box-shadow: var(--jm-shadow);
  pointer-events: auto;
}

.job-manager-notice--success {
  border-left-color: #198754;
  background: var(--jm-notice-success-bg);
}

.job-manager-notice--error {
  border-left-color: #dc3545;
  background: var(--jm-notice-error-bg);
}

.job-manager-notice--warning {
  border-left-color: #ffc107;
  background: var(--jm-notice-warning-bg);
}

.job-manager-notice--info {
  border-left-color: #0d6efd;
  background: var(--jm-notice-info-bg);
}

.job-manager-notice__content {
  min-width: 0;
}

.job-manager-notice__title {
  display: block;
  margin: 0;
  color: var(--jm-text);
  font-weight: 800;
}

.job-manager-notice__message {
  margin: 0.25rem 0 0;
  color: var(--jm-text-muted);
}

.job-manager-notice__close {
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--jm-text-muted);
  line-height: 1;
  cursor: pointer;
}

.job-manager-notice__close:hover,
.job-manager-notice__close:focus-visible {
  background: var(--jm-button-secondary-bg-hover);
  color: var(--jm-text);
}
```

---

## src\JobManager\src\styles\overlays.css

```
.job-manager-overlay-panel {
  position: absolute;
  z-index: 10;
  top: 0;
  width: min(31rem, calc(100vw - 2rem));
  max-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  overflow: auto;
  border: 1px solid var(--jm-border);
  border-top: 0;
  border-left: 0;
  border-radius: 0;
  background: var(--jm-overlay);
  box-shadow: var(--jm-shadow);
  backdrop-filter: blur(14px);
}

.job-manager-overlay-panel[hidden] {
  display: none;
}

.job-manager-jobs-overlay {
  --jm-jobs-panel-padding: 0.85rem;
  top: 0;
  bottom: 0;
  box-sizing: border-box;
  display: block;
  gap: 0;
  height: auto;
  max-height: none;
  padding: 0 var(--jm-jobs-panel-padding) var(--jm-jobs-panel-padding);
  overflow-y: auto;
}

.job-manager-jobs-overlay .job-manager-overlay-panel__header {
  position: sticky;
  top: 0;
  z-index: 7;
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: start;
  gap: 0.75rem;
  margin: 0 calc(-1 * var(--jm-jobs-panel-padding)) 0;
  padding: var(--jm-jobs-panel-padding);
  border-bottom: 1px solid var(--jm-border);
  background: var(--jm-overlay);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.job-manager-overlay-panel__header-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.15rem;
  justify-self: end;
  flex: 0 0 auto;
}

.job-manager-overlay-panel__back,
.job-manager-overlay-panel__close {
  --calcite-color-foreground-1: transparent;
}

.job-manager-overlay-panel__title-group {
  min-width: 0;
}

.job-manager-overlay-panel__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.job-manager-overlay-panel__subtitle {
  margin: 0.2rem 0 0;
  color: var(--jm-text-muted);
  font-size: 0.85rem;
}

.job-manager-overlay-panel__description {
  margin: 0;
  color: var(--jm-text);
  font-size: 0.92rem;
}

.job-manager-overlay-panel__close {
  --calcite-color-foreground-1: transparent;
}

@media (max-width: 54rem) {
  .job-manager-overlay-panel {
    top: auto;
    right: 0.75rem;
    bottom: 0.75rem;
    left: 0.75rem;
    width: auto;
    max-height: 50%;
    border: 1px solid var(--jm-border);
  }
}
```

---

## src\JobManager\src\styles\tokens.css

```
:root,
html.calcite-mode-light {
  color-scheme: light;

  --jm-navbar-height: 50px;
  --jm-header-bg: #456178;

  --jm-surface: var(--calcite-color-surface-1, #ffffff);
  --jm-surface-alt: var(--calcite-color-surface-2, #f8f9fa);
  --jm-border: var(--calcite-color-border-1, rgba(33, 37, 41, 0.16));
  --jm-text: var(--calcite-color-text-1, #212529);
  --jm-text-muted: var(--calcite-color-text-3, #6c757d);
  --jm-overlay: rgba(255, 255, 255, 0.94);
  --jm-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);

  --jm-popup-surface: var(--calcite-color-surface-1, #ffffff);
  --jm-popup-surface-alt: var(--calcite-color-surface-2, #f8f9fa);
  --jm-popup-border: var(--calcite-color-border-1, rgba(33, 37, 41, 0.16));
  --jm-popup-text: var(--calcite-color-text-1, #212529);
  --jm-popup-text-muted: var(--calcite-color-text-3, #6c757d);

  --jm-button-secondary-bg-hover: rgba(69, 97, 120, 0.12);

  --jm-notice-success-bg: #f4fbf7;
  --jm-notice-error-bg: #fff5f5;
  --jm-notice-warning-bg: #fffaf2;
  --jm-notice-info-bg: #f3f8ff;

  --jm-color-brand: #456178;

  --jm-color-priority-low-bg: #2f6b2f;
  --jm-color-priority-low-text: #ffffff;
  --jm-color-priority-medium-bg: #ffae00;
  --jm-color-priority-medium-text: #ffffff;
  --jm-color-priority-high-bg: #9b1c31;
  --jm-color-priority-high-text: #ffffff;

  --jm-color-status-todo-bg: #e7f1ff;
  --jm-color-status-todo-text: #084298;
  --jm-color-status-in-progress-bg: #fff3cd;
  --jm-color-status-in-progress-text: #664d03;
  --jm-color-status-done-bg: #d1e7dd;
  --jm-color-status-done-text: #0f5132;

  --jm-color-aoi-none-bg: #f1f3f5;
  --jm-color-aoi-none-text: #495057;
  --jm-color-aoi-low-bg: #d1e7dd;
  --jm-color-aoi-low-text: #0f5132;
  --jm-color-aoi-medium-bg: #fff3cd;
  --jm-color-aoi-medium-text: #664d03;
  --jm-color-aoi-high-bg: #f8d7da;
  --jm-color-aoi-high-text: #842029;
}

html.calcite-mode-dark {
  color-scheme: dark;

  --jm-surface: var(--calcite-color-surface-1, #1f2428);
  --jm-surface-alt: var(--calcite-color-surface-2, #2b3137);
  --jm-border: var(--calcite-color-border-1, rgba(255, 255, 255, 0.18));
  --jm-text: var(--calcite-color-text-1, #f8f9fa);
  --jm-text-muted: var(--calcite-color-text-3, #c8ced3);
  --jm-overlay: rgba(18, 22, 26, 0.9);
  --jm-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);

  --jm-popup-surface: var(--calcite-color-surface-1, #1f2428);
  --jm-popup-surface-alt: var(--calcite-color-surface-2, #2b3137);
  --jm-popup-border: var(--calcite-color-border-1, rgba(255, 255, 255, 0.18));
  --jm-popup-text: var(--calcite-color-text-1, #f8f9fa);
  --jm-popup-text-muted: var(--calcite-color-text-3, #c8ced3);

  --jm-button-secondary-bg-hover: rgba(255, 255, 255, 0.12);

  --jm-notice-success-bg: #142b20;
  --jm-notice-error-bg: #32171d;
  --jm-notice-warning-bg: #302613;
  --jm-notice-info-bg: #14243a;

  --jm-color-status-todo-bg: rgba(13, 110, 253, 0.22);
  --jm-color-status-todo-text: #9ec5fe;
  --jm-color-status-in-progress-bg: rgba(255, 193, 7, 0.22);
  --jm-color-status-in-progress-text: #ffda6a;
  --jm-color-status-done-bg: rgba(25, 135, 84, 0.22);
  --jm-color-status-done-text: #75b798;

  --jm-color-aoi-none-bg: rgba(173, 181, 189, 0.16);
  --jm-color-aoi-none-text: #ced4da;
  --jm-color-aoi-low-bg: rgba(25, 135, 84, 0.22);
  --jm-color-aoi-low-text: #75b798;
  --jm-color-aoi-medium-bg: rgba(255, 193, 7, 0.22);
  --jm-color-aoi-medium-text: #ffda6a;
  --jm-color-aoi-high-bg: rgba(220, 53, 69, 0.22);
  --jm-color-aoi-high-text: #ea868f;
}
```
