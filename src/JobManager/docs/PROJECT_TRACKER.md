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

Status: Map/list foundation in progress

Current known baseline:

- `JobManager` project exists under `src`.
- Vite dev server works.
- `npm run rdy` is the preferred local readiness command because it formats, lints, tests, builds and then starts the dev server.
- Calcite stylesheet import uses `@esri/calcite-components/main.css`.
- ArcGIS Maps SDK stylesheet import uses `@arcgis/core/assets/esri/themes/light/main.css`.
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

Current known limitations:

- AOI popup summary counts do not live-refresh while the popup is already open. Reopening the AOI popup refreshes counts.
- AOI renderer color updates can lag briefly after filter changes because relation summaries and renderer enrichment are rebuilt asynchronously.
- AOI clustering or AOI cluster-like overview is still deferred until real AOI geometry density and shape are confirmed.
- Job polygon clustering is deferred because centroid-based clustering could hide real polygon footprint.
- Theme/dark mode foundation is still not implemented.
- Manual refresh across map layers, Jobs panel and selected state is still not implemented.

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

Rationale:

Users can now inspect an AOI and see the operational Job signal before opening the Jobs panel. The implementation keeps relation source details behind the relation service and does not import mock Job data into popup UI.

Known limitation:

Open AOI popup summary counts do not live-refresh when Job filters change. Reopening the AOI popup refreshes the summary counts. This is acceptable for now because the map renderer and Jobs panel already update from the shared filters, and live popup refresh can be added later if it becomes important.

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

| ID      | Task                                                   |      Status | Notes                                                      |
| ------- | ------------------------------------------------------ | ----------: | ---------------------------------------------------------- |
| JM-0001 | Create Job Manager Vite project under `src/JobManager` |        Done | Initial shell created and pushed.                          |
| JM-0002 | Align package versions with Product Manager baseline   |        Done | Vite range corrected to avoid Vite 8 drift.                |
| JM-0003 | Create initial feature-based folder structure          |        Done | AOI, Jobs, Map, Notices, Theme and Shared folders created. |
| JM-0004 | Create project tracker/source-of-truth document        | In progress | This document.                                             |
| JM-0005 | Create backend contract notes document                 |        Done | Initial skeleton created in `docs/BACKEND_CONTRACTS.md`.   |
| JM-0006 | Create architecture notes document                     |        Done | Initial skeleton created in `docs/ARCHITECTURE.md`.        |

Exit criteria:

- app shell builds
- tracker exists
- folder structure is documented
- initial decisions are recorded

## Phase 1 - App shell and shared foundations

Goal:

Create a maintainable app shell with shared helpers before adding domain-heavy map logic.

Status: In progress

Tasks:

| ID      | Task                                             |      Status | Notes                                                                                                                                                                                    |
| ------- | ------------------------------------------------ | ----------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JM-0101 | Create root app layout shell                     |        Done | Root layout uses Product Manager-style navbar template, GST logo, map-first workspace, native Jobs panel toggle with Calcite icon, closable left Jobs panel and Calcite Filters popover. |
| JM-0102 | Add shared config helper                         |        Done | Runtime config reads safe `VITE_` values from `import.meta.env`.                                                                                                                         |
| JM-0103 | Add shared API result helper                     |        Done | Added success/error result helpers for future services.                                                                                                                                  |
| JM-0104 | Add shared error normalization                   |        Done | Added normalized frontend error shape for mock and future backend errors.                                                                                                                |
| JM-0105 | Add notice service shell                         |        Done | Added notice service and UI container for user-visible messages. Notice UI is currently custom and should be reviewed against Calcite alert/notice options before hardening.             |
| JM-0106 | Add basic dark/light theme foundation            | Not started | Deferred until Product Manager theme pattern is verified.                                                                                                                                |
| JM-0107 | Extract app-shell UI modules from `createApp.js` |        Done | Navbar/filter/clustering UI, Jobs overlay shell and map workspace DOM helpers now live under `src/app/ui`.                                                                               |

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

## Phase 3 - Job list UI

Goal:

Provide list-based work access before complex map interaction.

Tasks:

| ID      | Task                                         |      Status | Notes                                                                                                                                                                                                                                                                                            |
| ------- | -------------------------------------------- | ----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| JM-0301 | Create Job list component                    |        Done | Jobs panel now renders active mock Jobs with compact collapsible cards using separate title/badge and date/action rows, fixed-width date chips, fixed-width priority/AOI badges and Calcite brand status actions. Done Jobs remain visible until refresh or panel close after being marked Done. |
| JM-0302 | Create Job detail/selection component        | In progress | Collapsible Job cards provide the first detail surface. Jobs panel can also show Jobs scoped to a selected AOI from the map. Dedicated full Job details flow is deferred until map selection and Job geometry workflows mature.                                                                  |
| JM-0303 | Add Job status buttons                       |        Done | Added To do, In Progress and Done buttons per Job.                                                                                                                                                                                                                                               |
| JM-0304 | Add per-Job mutation loading state           |        Done | Replaced visible per-Job loading text with a local pending guard to avoid card flashing while still preventing duplicate status updates.                                                                                                                                                         |
| JM-0305 | Show success/failure notices for Job updates |        Done | Status updates show success and error notices.                                                                                                                                                                                                                                                   |
| JM-0306 | Show cyclic Job creation notice              |        Done | Mock-created follow-up Jobs show an info notice.                                                                                                                                                                                                                                                 |
| JM-0307 | Add selected AOI Jobs scope                  |        Done | AOI popup action opens the Jobs panel and scopes map Job layers to Jobs related to the selected AOI.                                                                                                                                                                                             |

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

| ID      | Task                                |      Status | Notes                                                                                                                                                |
| ------- | ----------------------------------- | ----------: | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| JM-0401 | Add AOI Feature Service config      |        Done | Added AOI Feature Service config helper using safe runtime config from `VITE_AOI_FEATURE_SERVICE_URL`. No private URL or credential is stored.       |
| JM-0402 | Implement AOI service facade        | In progress | Added service facade skeleton returning a stable API result shape. Real Feature Service querying is deferred until source fields and auth are final. |
| JM-0403 | Implement AOI normalization helpers | In progress | Added frontend AOI normalization helper and centralized field config for the current test Feature Service fields.                                    |
| JM-0404 | Add AOI loading state               | In progress | Added initial map-level status for missing AOI service configuration and map load failures. Full AOI loading/empty/error states are deferred.        |
| JM-0405 | Document required AOI fields        | In progress | Documented current test Feature Service fields in `BACKEND_CONTRACTS.md`. Final AOI fields remain open until the real service is created.            |

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

| ID      | Task                                  |      Status | Notes                                                                                                                                     |
| ------- | ------------------------------------- | ----------: | ----------------------------------------------------------------------------------------------------------------------------------------- |
| JM-0701 | Add AOI hover feedback                |        Done | Map hover now highlights Jobs or AOIs using hit-test order, with Job geometry taking priority over AOIs underneath.                       |
| JM-0702 | Add AOI selection feedback            |        Done | `Show related Jobs` now stores selected AOI state, opens the scoped Jobs panel and highlights the selected AOI on the map.                |
| JM-0703 | Add AOI popup shell                   | In progress | Added ArcGIS popup template using current test Feature Service metadata and a Show related Jobs action.                                   |
| JM-0704 | Show related Job summary in popup     |        Done | AOI popup now shows related, active and high-priority active Job counts using relation summaries and current Job filters where available. |
| JM-0705 | Add popup action to open related Jobs |        Done | AOI popup action opens the Jobs panel scoped to Jobs related to the selected AOI.                                                         |
| JM-0706 | Document popup flow                   |        Done | AOI popup relation summary content and `Show related Jobs` action flow are documented in `ARCHITECTURE.md`.                               |

Exit criteria:

- user can click AOI
- popup shows useful AOI and Job summary
- popup can open related Jobs
- popup flow is documented

## Phase 8 - Filtering and quick filters

Goal:

Create shared filtering used by map and list.

Tasks:

| ID      | Task                             |      Status | Notes                                                                                                              |
| ------- | -------------------------------- | ----------: | ------------------------------------------------------------------------------------------------------------------ |
| JM-0801 | Define filter state model        |        Done | Job filter state lives in `features/jobs/state/jobFilterStore.js`.                                                 |
| JM-0802 | Implement Job filter predicates  |        Done | Job filter predicates and summaries live in `features/jobs/domain/jobFilters.js`.                                  |
| JM-0803 | Implement AOI filter predicates  | In progress | AOI renderer summaries follow Job filters. Dedicated AOI layer filtering/effects are still deferred.               |
| JM-0804 | Add quick filter UI              |        Done | Navbar Filters popover exposes Job quick filters and explicit status/priority filters.                             |
| JM-0805 | Apply filters to Job list        |        Done | Jobs panel consumes shared Job filter state.                                                                       |
| JM-0806 | Apply filters to AOI map layer   | In progress | AOI renderer severity uses filtered relation snapshots. Direct AOI layer filtering is deferred.                    |
| JM-0807 | Add filter-by-selected-Job flow  | In progress | Selecting a Job highlights related AOIs. Persistent AOI layer filtering for selected Job remains deferred.         |
| JM-0808 | Apply filters to Job map layers  |        Done | Map Job point, polygon and priority point layers use shared Job filter definition expressions.                     |
| JM-0809 | Add AOI-scoped Job map filtering |        Done | AOI `Show related Jobs` scopes map Job layers to Jobs related to the selected AOI while preserving active filters. |

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
| JM-0907 | Document clustering decision               | In progress | Job point clustering is documented. AOI clustering decision remains blocked by real geometry.             |
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

| ID      | Task                                         |      Status | Notes                                                                                                                               |
| ------- | -------------------------------------------- | ----------: | ----------------------------------------------------------------------------------------------------------------------------------- |
| JM-1001 | Add manual refresh flow                      |        Done | Jobs panel refresh now also refreshes map Job layers, AOI renderer summaries, filters, clustering and active scope/highlight state. |
| JM-1002 | Add silent refresh plan                      | Not started | Implement only if needed early.                                                                                                     |
| JM-1003 | Preserve selected AOI/Job across refresh     | Not started | Best effort; depends on manual refresh design.                                                                                      |
| JM-1004 | Add mutation conflict handling placeholder   | Not started | Backend future.                                                                                                                     |
| JM-1005 | Add retry-friendly error states              | Not started | User should know what failed and what can be retried.                                                                               |
| JM-1006 | Review loading states across app             | In progress | Map, Jobs panel, Job mutations and relation-derived UI have initial states. Full refresh review remains.                            |
| JM-1007 | Polish hover cleanup and initial panel state |        Done | Hover clears on map exit/stale hit-test, and Jobs panel starts closed on app load.                                                  |

Exit criteria:

- refresh does not destroy user context unnecessarily
- failures are visible
- loading states are consistent
- mock failure scenarios are handled

## Phase 11 - Documentation and backend preparation

Goal:

Prepare for backend integration and reduce future rework.

Tasks:

| ID      | Task                                          |      Status | Notes                                                                                                     |
| ------- | --------------------------------------------- | ----------: | --------------------------------------------------------------------------------------------------------- |
| JM-1101 | Create `docs/BACKEND_CONTRACTS.md`            |        Done | Draft backend assumptions, frontend models, AOI fields and open questions are documented.                 |
| JM-1102 | Create `docs/ARCHITECTURE.md`                 |        Done | Folder ownership, state rules, service rules and map flows are documented.                                |
| JM-1103 | Document mock backend behavior                | In progress | Core mock behavior is documented in tracker/backend notes. Dedicated mock section can improve this later. |
| JM-1104 | Document AOI Feature Service requirements     | In progress | Current test service fields are documented. Final service fields remain open.                             |
| JM-1105 | Document clustering decision                  | In progress | Job point clustering is documented. AOI clustering remains blocked by real geometry.                      |
| JM-1106 | Review for secrets before backend config work | Not started | Ensure `.env.example` only has placeholders before backend/auth work.                                     |

Exit criteria:

- backend assumptions are documented
- mock behavior is documented
- architecture decisions are recorded
- future backend integration path is clear

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
| OQ-007 | What counts as “due soon”?                                        |        Open | Suggested default: deadline within 7 days.                                                                                            |
| OQ-008 | Should `Done` Jobs remain visible by default?                     |    Resolved | Done Jobs are hidden by default. The explicit `Done` status filter reveals them.                                                      |
| OQ-009 | Should cyclic mock Job creation be deterministic in dev?          |        Open | A seed option may make testing easier.                                                                                                |
| OQ-010 | Should the app use Product Manager’s server/SSPI setup initially? |        Open | Only if needed for auth or deployment.                                                                                                |
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

| ID          | Task                                                     |      Status | Notes                                                                                                   |
| ----------- | -------------------------------------------------------- | ----------: | ------------------------------------------------------------------------------------------------------- |
| JM-NEXT-001 | Add `docs/BACKEND_CONTRACTS.md` skeleton                 |        Done | Initial backend assumptions and open questions documented.                                              |
| JM-NEXT-002 | Add `docs/ARCHITECTURE.md` skeleton                      |        Done | Initial architecture boundaries and data flow documented.                                               |
| JM-NEXT-003 | Implement app shell layout                               |        Done | Product Manager-style navbar, map-first workspace, Jobs panel and notices are implemented.              |
| JM-NEXT-004 | Implement notice service foundation                      |        Done | Notice service and UI container are implemented.                                                        |
| JM-NEXT-005 | Implement mock Jobs service                              |        Done | Mock Jobs service supports loading, failures, status mutation and cyclic mock Job creation.             |
| JM-NEXT-006 | Connect AOI Feature Service loading                      | In progress | AOI FeatureLayer is wired from runtime config. Dedicated AOI service querying remains deferred.         |
| JM-NEXT-007 | Add AOI/Job relation service                             |        Done | Mock `relatedAoiIds` are exposed through relation helpers and snapshots.                                |
| JM-NEXT-008 | Add AOI renderer and popup foundation                    |        Done | AOI renderer and popup related Job summary are implemented.                                             |
| JM-NEXT-009 | Extract navbar/filter/clustering UI from `createApp.js`  |        Done | App-shell navbar UI now lives in `src/app/ui/createNavbarController.js`.                                |
| JM-NEXT-010 | Extract Jobs overlay and map workspace DOM helpers       |        Done | Jobs overlay and map workspace DOM helpers now live under `src/app/ui`.                                 |
| JM-NEXT-011 | Clean up tracker/docs status drift                       |        Done | Phase 8/9 and latest map/list interaction statuses have been aligned with implementation.               |
| JM-NEXT-012 | Add manual refresh flow                                  | Not started | Recommended next feature; preserve filters, AOI scope, selected Job and map layer state where possible. |
| JM-NEXT-013 | Add theme foundation / dark mode                         | Not started | Follow Product Manager pattern after current implementation is verified.                                |
| JM-NEXT-014 | Review final AOI Feature Service field/auth requirements | Not started | Needed before hardening AOI service, AOI clustering and backend integration.                            |
