# Job Manager AOI hardening context


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

## src/JobManager/.env.example

```
VITE_ARCGIS_PORTAL_URL=https://example.maps.arcgis.com
VITE_AOI_FEATURE_SERVICE_URL=https://example.com/arcgis/rest/services/aoi/FeatureServer/0
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
| OQ-007 | What counts as â€œdue soonâ€?                                        |        Open | Suggested default: deadline within 7 days.                                                                                            |
| OQ-008 | Should `Done` Jobs remain visible by default?                     |    Resolved | Done Jobs are hidden by default. The explicit `Done` status filter reveals them.                                                      |
| OQ-009 | Should cyclic mock Job creation be deterministic in dev?          |        Open | A seed option may make testing easier.                                                                                                |
| OQ-010 | Should the app use Product Managerâ€™s server/SSPI setup initially? |        Open | Only if needed for auth or deployment.                                                                                                |
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
| JM-NEXT-013 | Add theme foundation / dark mode                         |        Done | Theme foundation, persisted preference and navbar toggle are implemented.                               |
| JM-NEXT-014 | Review final AOI Feature Service field/auth requirements | Not started | Needed before hardening AOI service, AOI clustering and backend integration.                            |
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

Expected initial flow:

```txt
AOI Feature Service
  -> AOI service
  -> AOI normalization
  -> AOI state
  -> Map/UI

Mock Job backend
  -> Job service
  -> Job normalization
  -> Job state
  -> Job list/UI

AOI state + Job state
  -> Relation service/domain helpers
  -> AOI summaries, Job details, filters, popups
```

Future backend flow should replace the mock backend behind the Job service without requiring UI components to change significantly.

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

Rules:

- Keep test-service field names centralized.
- Do not spread raw field names across UI components.
- Do not treat the test-service field mapping as final backend contract.
- Update this section when the real AOI Feature Service is created.

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

Initial state can be lightweight JavaScript state.

State should be introduced only where it solves coordination between UI, map, services and filters.

State rules:

- keep canonical Jobs state in Jobs feature/state
- keep canonical AOI state in AOI feature/state
- keep Job filter rules and Job filter state in `features/jobs` while they only describe Jobs
- keep map-specific application of filters in `features/map/filters`
- introduce a broader app-level filter state only if filters become truly cross-domain
- avoid hidden global mutable state unless documented
- preserve selected AOI/Job across refresh where practical

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
- Job geometry selection and highlight are deferred.

Rules:

- Keep point and polygon Jobs in separate layers because client-side FeatureLayers are geometry-type specific.
- Keep Job geometry display read-only until editing/selection workflows are explicitly introduced.
- Keep Job layer data refresh replaceable so it can later consume central Job state or backend data instead of a separate service snapshot.

### Job selection flow

Status: Done

Current flow:

```txt
Job geometry popup custom content button
  -> DOM custom event with feature-scoped Job selection
  -> app-level selected Job callback
  -> selected Job state
  -> Jobs panel opens
  -> matching Job card expands and receives focus
  -> selected Job geometry is highlighted on the map
```

Rules:

- Job details should use feature-scoped custom popup content so the selected Job is derived from the popup content graphic rather than ambiguous popup ViewModel state.
- Job popup action wiring should wait for `view.popup.viewModel` with `reactiveUtils.whenOnce`.
- Selected Job state should live outside map layer construction.
- Map highlight should be owned by map layer/controller code.
- Jobs panel focus/expanded state should be owned by Jobs UI code.
- Selecting a Job from the map clears AOI-scoped list mode.
- Closing the Jobs panel or returning to the normal Jobs list clears selected Job highlight.
- Related AOI highlight for selected Job is deferred.

Implementation note:

Job details uses a `PopupTemplate` action for action bar placement. A hidden Esri `CustomContent` item captures the feature-scoped Job selection from the rendered popup graphic, because `PopupViewModel` selected feature state can be ambiguous for point Jobs when multiple popup features are present.

### Selected Job related AOI highlight

Status: In progress

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
- Clustering and de-emphasis effects remain deferred.

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

Status: In progress

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

Rules:

- Manual refresh starts from explicit user action.
- Jobs UI owns the Jobs panel refresh button and Jobs store reload.
- App composition owns coordination between Jobs refresh and map refresh.
- Map controller owns refreshing ArcGIS Job layer data and reapplying map-specific presentation state.
- Manual refresh must preserve Job filters where practical.
- Manual refresh must preserve AOI scope where practical by resolving related Job ids again.
- Manual refresh must preserve selected Job and related AOI highlights best-effort.
- The map refresh should use the refreshed Jobs already returned to the Jobs panel instead of loading Jobs a second time.
- If Jobs refresh fails, map refresh should not run.
- If map refresh fails, show a user-facing notice.
- Manual refresh should not perform a full app reload.

### AOI popup Job summary content

Status: Done

Current flow:

```txt
AOI PopupTemplate custom content
  -> selected AOI id from popup graphic attributes
  -> relation service snapshot using current Job filters
  -> AOI Job summary lookup
  -> popup summary metrics
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

Known limitation: open AOI popups do not live-refresh summary counts when Job filters change; reopening the popup refreshes the summary.

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

Status: In progress

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

- Job geometry layers use a separate service snapshot from the Jobs panel
- editing Job geometry is not supported
- Job polygon clustering is not supported
- final backend geometry ownership is not confirmed

Backend assumptions remain unchanged:

- backend may later provide Jobs and Job geometry directly
- backend may later own authoritative Job/AOI relation calculation
- frontend should continue normalizing incoming Job geometry before UI or map use

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
- includes AOI normalization helpers for current test-service field names and legacy/provisional fallbacks
- configures an initial AOI popup template using test-service metadata

Current limitations:

- real AOI querying is not implemented in the AOI service yet
- AOI renderer is not connected to Job summaries yet
- AOI load/empty/error states are only partially represented through map status
- AOI clustering is deferred until real geometry characteristics are known
- current field mapping is based on a temporary test Feature Service and must not be treated as the final backend contract

Current test AOI Feature Service fields:

```txt
OBJECTID
Shape
PRODUCTNAME
SERIES
EDITION
LOCKED
FILELINK
JSON
ISSUEDATE
IS_TECHNICAL
UPDT
PRODUCTID
GlobalID
created_user
created_date
last_edited_user
last_edited_date
Shape.STArea()
Shape.STLength()
```

Current provisional frontend field decisions:

```txt
Stable test AOI id:
GlobalID

ArcGIS object id:
OBJECTID

Display name:
PRODUCTNAME

Optional product id metadata:
PRODUCTID

Secondary display metadata:
SERIES
EDITION

Other useful metadata:
ISSUEDATE
LOCKED
IS_TECHNICAL
UPDT
```

Decision:

Use `GlobalID` as the provisional frontend AOI identifier for the test Feature Service. Use `PRODUCTNAME` as the provisional display name. Use `OBJECTID` for ArcGIS/service mechanics only. Do not treat this as the final backend contract until the real AOI Feature Service is created.

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

Status: In progress

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

## src/JobManager/src/shared/config/runtimeConfig.js

```
export function getRuntimeConfig() {
  return {
    arcgisPortalUrl: readStringEnv("VITE_ARCGIS_PORTAL_URL"),
    aoiFeatureServiceUrl: readStringEnv("VITE_AOI_FEATURE_SERVICE_URL"),
  };
}

export function hasAoiFeatureServiceConfig(config = getRuntimeConfig()) {
  return Boolean(config.aoiFeatureServiceUrl);
}

function readStringEnv(key) {
  const value = import.meta.env[key];

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}
```

---

## src/JobManager/src/app/createApp.js

```
import { createSelectedAoiStore } from "../features/aoi/state/selectedAoiStore.js";
import { createJobFilterStore } from "../features/jobs/state/jobFilterStore.js";
import { createSelectedJobStore } from "../features/jobs/state/selectedJobStore.js";
import { createMapController } from "../features/map/core/mapController.js";
import { createJobClusterSettingsStore } from "../features/map/state/jobClusterSettingsStore.js";
import { showErrorNotice, showSuccessNotice } from "../features/notices/services/noticeService.js";
import { createNoticeRegion } from "../features/notices/ui/noticeContainer.js";
import { getRuntimeConfig } from "../shared/config/runtimeConfig.js";
import { createJobsOverlay } from "./ui/createJobsOverlay.js";
import { createMapWorkspace } from "./ui/createMapWorkspace.js";
import { createNavbarController } from "./ui/createNavbarController.js";
import { createThemeStore } from "../features/theme/state/themeStore.js";

export async function createApp(rootElement) {
  const runtimeConfig = getRuntimeConfig();
  const selectedAoiStore = createSelectedAoiStore();
  const selectedJobStore = createSelectedJobStore();
  const jobFilterStore = createJobFilterStore();
  const jobClusterSettingsStore = createJobClusterSettingsStore();
  const themeStore = createThemeStore();
  const noticeRegion = createNoticeRegion();
  const appEventAbortController = new AbortController();
  let jobsRefreshRequestId = 0;

  const navbar = await createNavbarController({
    jobFilterStore,
    jobClusterSettingsStore,
    themeStore,
    onTestNotice() {
      showSuccessNotice({
        title: "Notice pipeline ready",
        message: "User-facing notices can now be triggered from services.",
      });
    },
  });

  const jobsPanel = createJobsOverlay({ jobFilterStore });
  const workspace = createMapWorkspace();

  const mapController = createMapController({
    container: workspace.mapViewElement,
    statusElement: workspace.mapStatusElement,
    runtimeConfig,
    onError(error) {
      showErrorNotice({
        title: "Map could not be loaded",
        message: error.message,
      });
    },
    onJobLayerError(error) {
      showErrorNotice({
        title: "Job geometry could not be loaded",
        message: error.message,
      });
    },
    onShowRelatedJobs(selectedAoi) {
      const normalizedSelectedAoi = selectedAoiStore.selectAoi(selectedAoi);

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

      selectedAoiStore.clearSelection();
      mapController.clearAoiJobScope();
      jobsPanel.showJobDetails(normalizedSelectedJob);
      setPanelOpen(jobsPanel.element, navbar.jobsButton, true);

      void mapController.highlightJob(normalizedSelectedJob).catch((error) => {
        showErrorNotice({
          title: "Job highlight failed",
          message: error.message,
        });
      });

      if (normalizedSelectedJob.relatedAoiIds.length > 0) {
        void mapController.highlightRelatedAoisForJob(normalizedSelectedJob).catch((error) => {
          mapController.clearAoiHighlight();

          showErrorNotice({
            title: "Related AOIs could not be highlighted",
            message: error.message,
          });
        });
      } else {
        mapController.clearAoiHighlight();
      }
    },
  });

  workspace.element.appendChild(jobsPanel.element);

  const shellElement = document.createElement("div");
  shellElement.className = "job-manager-app";
  shellElement.append(navbar.element, workspace.element, noticeRegion);

  rootElement.replaceChildren(shellElement);

  const unsubscribeMapJobFilters = jobFilterStore.subscribe((snapshot) => {
    mapController.applyJobFilters(snapshot.filters);
  });

  const unsubscribeMapJobClusterSettings = jobClusterSettingsStore.subscribe((snapshot) => {
    mapController.applyJobClusterSettings(snapshot.settings);
  });

  jobsPanel.element.addEventListener(
    "job-manager:aoi-filter-cleared",
    () => {
      selectedAoiStore.clearSelection();
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
      void refreshMapAfterJobsRefresh({
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
      selectedAoiStore.clearSelection();
      selectedJobStore.clearSelection();
      jobsPanel.clearSelectedJob();
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

  async function refreshMapAfterJobsRefresh({ jobs } = {}) {
    const refreshRequestId = jobsRefreshRequestId + 1;
    jobsRefreshRequestId = refreshRequestId;

    const result = await mapController.refreshJobData({
      jobs,
    });

    if (refreshRequestId !== jobsRefreshRequestId) {
      return;
    }

    if (!result.ok) {
      showErrorNotice({
        title: "Map refresh failed",
        message: result.error.message,
      });

      return;
    }

    const selectedAoi = selectedAoiStore.getSnapshot().selectedAoi;
    const selectedJob = selectedJobStore.getSnapshot().selectedJob;

    if (selectedAoi?.aoiId) {
      await refreshSelectedAoiMapState(selectedAoi, refreshRequestId);
      return;
    }

    if (selectedJob?.jobId) {
      await refreshSelectedJobMapState(selectedJob, refreshRequestId);
    }
  }

  async function refreshSelectedAoiMapState(selectedAoi, refreshRequestId) {
    try {
      const scopeResult = await mapController.applyAoiJobScope(selectedAoi);

      if (refreshRequestId !== jobsRefreshRequestId) {
        return;
      }

      if (!scopeResult.ok) {
        showErrorNotice({
          title: "Related Jobs could not be refreshed on the map",
          message: scopeResult.error.message,
        });
      }
    } catch (error) {
      if (refreshRequestId === jobsRefreshRequestId) {
        showErrorNotice({
          title: "Related Jobs could not be refreshed on the map",
          message: error.message,
        });
      }
    }

    try {
      await mapController.highlightAoiById(selectedAoi.aoiId);
    } catch (error) {
      if (refreshRequestId !== jobsRefreshRequestId) {
        return;
      }

      mapController.clearAoiHighlight();

      showErrorNotice({
        title: "AOI highlight failed",
        message: error.message,
      });
    }
  }

  async function refreshSelectedJobMapState(selectedJob, refreshRequestId) {
    try {
      await mapController.highlightJob(selectedJob);
    } catch (error) {
      if (refreshRequestId !== jobsRefreshRequestId) {
        return;
      }

      showErrorNotice({
        title: "Job highlight failed",
        message: error.message,
      });
    }

    if (refreshRequestId !== jobsRefreshRequestId) {
      return;
    }

    if (selectedJob.relatedAoiIds.length === 0) {
      mapController.clearAoiHighlight();
      return;
    }

    try {
      await mapController.highlightRelatedAoisForJob(selectedJob);
    } catch (error) {
      if (refreshRequestId !== jobsRefreshRequestId) {
        return;
      }

      mapController.clearAoiHighlight();

      showErrorNotice({
        title: "Related AOIs could not be highlighted",
        message: error.message,
      });
    }
  }

  mapController.start();

  return {
    destroy() {
      jobsRefreshRequestId += 1;
      appEventAbortController.abort();
      unsubscribeMapJobFilters();
      unsubscribeMapJobClusterSettings();
      navbar.destroy();
      themeStore.destroy();
      jobsPanel.destroy();
      mapController.destroy();
      noticeRegion.destroy?.();
      rootElement.replaceChildren();
    },
  };
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

## src/JobManager/src/features/map/core/createMapView.js

```
import ArcGISMap from "@arcgis/core/Map.js";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import MapView from "@arcgis/core/views/MapView.js";

import { createDefaultMapConfig, configureArcGisRuntime } from "../config/mapConfig.js";
import { createAoiLayer } from "../layers/createAoiLayer.js";
import { createJobLayers } from "../layers/createJobLayers.js";

export function createMapView({ container, runtimeConfig, mapConfig } = {}) {
  if (!container) {
    throw new Error("MapView container is required.");
  }

  configureArcGisRuntime(runtimeConfig);

  const resolvedMapConfig = mapConfig ?? createDefaultMapConfig();
  const aoiLayer = createAoiLayer({ runtimeConfig });
  const jobLayers = createJobLayers();
  const operationalLayers = [...(aoiLayer ? [aoiLayer] : []), ...jobLayers.layers];
  const map = new ArcGISMap({
    basemap: resolvedMapConfig.basemap,
    layers: operationalLayers,
  });

  const view = new MapView({
    container,
    map,
    center: resolvedMapConfig.center,
    zoom: resolvedMapConfig.zoom,
    constraints: resolvedMapConfig.constraints,
    popup: {
      dockEnabled: false,
      dockOptions: {
        buttonEnabled: false,
      },
      visibleElements: {
        collapseButton: false,
        featureNavigation: false,
      },
      actions: [],
    },
  });

  configurePopupDefaults(view);

  return {
    map,
    view,
    layers: {
      aoiLayer,
      jobLayers,
    },
  };
}

function configurePopupDefaults(view) {
  reactiveUtils.when(
    () => view.popup?.viewModel,
    () => {
      view.popup.viewModel.includeDefaultActions = false;
      view.popup.actions = [];
    },
    { once: true }
  );
}
```

---

## src/JobManager/src/features/map/core/mapController.js

```
import { normalizeError } from "../../../shared/errors/normalizeError.js";
import * as defaultRelationService from "../../relations/services/relationService.js";
import { applyJobLayerFilters } from "../filters/applyJobLayerFilters.js";
import { applyAoiJobSummaryRenderer } from "../layers/applyAoiRenderer.js";
import { createAoiHighlightController } from "../layers/aoiHighlight.js";
import { applyJobLayerData } from "../layers/applyJobLayerData.js";
import { applyJobPointClustering } from "../layers/jobClustering.js";
import { createJobHighlightController } from "../layers/jobHighlight.js";
import { createMapHoverController } from "../layers/mapHover.js";
import { registerAoiPopupActions } from "../popups/aoiPopupActions.js";
import { configureAoiJobSummaryPopupContent } from "../popups/aoiPopupContent.js";
import { registerJobPopupActions } from "../popups/jobPopupActions.js";
import { createMapView } from "./createMapView.js";

const MAP_STATUS = Object.freeze({
  LOADING: "loading",
  READY: "ready",
  WARNING: "warning",
  ERROR: "error",
});

export function createMapController({
  container,
  statusElement,
  runtimeConfig,
  onError,
  onJobLayerError,
  onShowRelatedJobs,
  onShowJobDetails,
  relationService = defaultRelationService,
} = {}) {
  let mapResult = null;
  let isDestroyed = false;
  let removeAoiPopupActions = () => {};
  let removeJobPopupActions = () => {};
  let jobHighlightController = null;
  let aoiHighlightController = null;
  let mapHoverController = null;
  let currentJobFilters = null;
  let currentJobClusterSettings = null;
  let currentScopedJobIds = null;
  let aoiRendererRequestId = 0;
  let jobClusterRequestId = 0;
  let aoiJobScopeRequestId = 0;

  async function start() {
    setStatus({
      status: MAP_STATUS.LOADING,
      title: "Loading map...",
      message: "Preparing the ArcGIS workspace.",
    });

    try {
      mapResult = createMapView({
        container,
        runtimeConfig,
      });

      await mapResult.view.when();

      if (isDestroyed) {
        return {
          ok: false,
          error: null,
        };
      }

      jobHighlightController = createJobHighlightController({
        view: mapResult.view,
        jobLayers: mapResult.layers.jobLayers,
      });
      aoiHighlightController = createAoiHighlightController({
        view: mapResult.view,
        aoiLayer: mapResult.layers.aoiLayer,
      });
      mapHoverController = createMapHoverController({
        view: mapResult.view,
        aoiLayer: mapResult.layers.aoiLayer,
        jobLayers: mapResult.layers.jobLayers,
      });

      configureMapPopupContent();
      registerMapInteractionHandlers();
      applyCurrentJobClusterSettingsWithoutBlocking();
      applyCurrentJobFilters();
      applyCurrentAoiRendererWithoutBlockingMapReady();
      applyJobGeometryWithoutBlockingMapReady(mapResult.layers.jobLayers);
      setReadyStatus(Boolean(mapResult.layers.aoiLayer));

      return {
        ok: true,
        data: mapResult,
      };
    } catch (error) {
      const normalizedError = normalizeError(error, "Map could not be loaded.");

      setStatus({
        status: MAP_STATUS.ERROR,
        title: "Map could not be loaded",
        message: normalizedError.message,
      });
      onError?.(normalizedError);

      return {
        ok: false,
        error: normalizedError,
      };
    }
  }

  function destroy() {
    isDestroyed = true;
    aoiRendererRequestId += 1;
    jobClusterRequestId += 1;
    aoiJobScopeRequestId += 1;
    removeAoiPopupActions();
    removeJobPopupActions();
    removeAoiPopupActions = () => {};
    removeJobPopupActions = () => {};
    mapHoverController?.destroy();
    jobHighlightController?.destroy();
    aoiHighlightController?.destroy();
    mapHoverController = null;
    jobHighlightController = null;
    aoiHighlightController = null;
    mapResult?.view?.destroy();
    mapResult = null;
  }

  function getView() {
    return mapResult?.view ?? null;
  }

  function getMap() {
    return mapResult?.map ?? null;
  }

  function highlightJob(selectedJob) {
    mapHoverController?.clearHover();

    return jobHighlightController?.highlightJob(selectedJob) ?? Promise.resolve();
  }

  function clearJobHighlight() {
    jobHighlightController?.clearHighlight();
  }

  function highlightRelatedAoisForJob(selectedJob = {}) {
    mapHoverController?.clearHover();

    return (
      aoiHighlightController?.highlightAoisByIds(selectedJob.relatedAoiIds) ?? Promise.resolve()
    );
  }

  function highlightAoiById(aoiId) {
    const normalizedAoiId = normalizeOptionalString(aoiId);

    mapHoverController?.clearHover();

    if (!normalizedAoiId) {
      clearAoiHighlight();

      return Promise.resolve();
    }

    return aoiHighlightController?.highlightAoisByIds([normalizedAoiId]) ?? Promise.resolve();
  }

  function clearAoiHighlight() {
    aoiHighlightController?.clearHighlight();
  }

  async function applyAoiJobScope(selectedAoi = {}) {
    const normalizedAoiId = normalizeOptionalString(selectedAoi.aoiId ?? selectedAoi.id);
    const scopeRequestId = aoiJobScopeRequestId + 1;
    aoiJobScopeRequestId = scopeRequestId;

    if (!normalizedAoiId) {
      clearAoiJobScope();

      return {
        ok: true,
        data: {
          jobIds: [],
        },
      };
    }

    if (!relationService?.loadJobIdsForAoi) {
      currentScopedJobIds = [];
      applyCurrentJobFilters();

      throw new Error("Relation service is not available.");
    }

    const result = await relationService.loadJobIdsForAoi({
      aoiId: normalizedAoiId,
    });

    if (isDestroyed || scopeRequestId !== aoiJobScopeRequestId) {
      return result;
    }

    if (!result.ok) {
      // Avoid leaving a previous AOI scope active when the new scope cannot be resolved.
      currentScopedJobIds = [];
      applyCurrentJobFilters();

      return result;
    }

    currentScopedJobIds = normalizeJobIds(result.data.jobIds);
    applyCurrentJobFilters();

    return {
      ...result,
      data: {
        ...result.data,
        jobIds: [...currentScopedJobIds],
      },
    };
  }

  function clearAoiJobScope() {
    aoiJobScopeRequestId += 1;
    currentScopedJobIds = null;
    applyCurrentJobFilters();
  }

  async function refreshJobData({ jobs } = {}) {
    if (!mapResult?.layers?.jobLayers) {
      return {
        ok: true,
        data: {
          pointCount: 0,
          polygonCount: 0,
        },
      };
    }

    mapHoverController?.clearHover();
    closeOpenAggregatePopup();

    try {
      const result = await applyJobLayerData({
        jobLayers: mapResult.layers.jobLayers,
        jobs,
      });

      if (isDestroyed || !result.ok) {
        return result;
      }

      applyCurrentJobFilters();
      applyCurrentJobClusterSettingsWithoutBlocking();
      applyCurrentAoiRendererWithoutBlockingMapReady();

      return result;
    } catch (error) {
      return {
        ok: false,
        error: normalizeError(error, "Job map data could not be refreshed."),
      };
    }
  }

  function applyJobClusterSettings(settings) {
    currentJobClusterSettings = settings;

    applyCurrentJobClusterSettingsWithoutBlocking();
  }

  function applyCurrentJobClusterSettingsWithoutBlocking() {
    if (!mapResult?.layers?.jobLayers) {
      return;
    }

    closeOpenAggregatePopup();

    const clusterRequestId = jobClusterRequestId + 1;
    jobClusterRequestId = clusterRequestId;

    void applyJobPointClustering({
      jobLayers: mapResult.layers.jobLayers,
      settings: currentJobClusterSettings,
      view: mapResult.view,
      onShowJobDetails,
      shouldApply() {
        return !isDestroyed && clusterRequestId === jobClusterRequestId;
      },
    }).catch(() => {
      if (!isDestroyed && clusterRequestId === jobClusterRequestId) {
        void applyJobPointClustering({
          jobLayers: mapResult.layers.jobLayers,
          settings: {
            ...currentJobClusterSettings,
            style: "count",
          },
          view: mapResult.view,
          onShowJobDetails,
        });
      }
    });
  }

  function applyJobFilters(filters) {
    currentJobFilters = filters;

    applyCurrentJobFilters();
    applyCurrentAoiRendererWithoutBlockingMapReady();
  }

  function applyCurrentJobFilters() {
    if (!mapResult?.layers?.jobLayers) {
      return;
    }

    closeOpenAggregatePopup();

    applyJobLayerFilters({
      jobLayers: mapResult.layers.jobLayers,
      filters: currentJobFilters,
      scopedJobIds: currentScopedJobIds,
    });
  }

  function applyCurrentAoiRendererWithoutBlockingMapReady() {
    if (!mapResult?.layers?.aoiLayer) {
      return;
    }

    applyAoiRendererWithoutBlockingMapReady(mapResult.layers.aoiLayer);
  }

  function configureMapPopupContent() {
    if (!mapResult?.layers?.aoiLayer) {
      return;
    }

    configureAoiJobSummaryPopupContent({
      aoiLayer: mapResult.layers.aoiLayer,
      getJobFilters() {
        return currentJobFilters;
      },
    });
  }

  function registerMapInteractionHandlers() {
    if (mapResult?.layers?.aoiLayer) {
      removeAoiPopupActions = registerAoiPopupActions({
        view: mapResult.view,
        onShowRelatedJobs,
      });
    }

    if (mapResult?.layers?.jobLayers) {
      removeJobPopupActions = registerJobPopupActions({
        view: mapResult.view,
        onShowJobDetails,
      });
    }
  }

  function applyAoiRendererWithoutBlockingMapReady(aoiLayer) {
    const rendererRequestId = aoiRendererRequestId + 1;
    aoiRendererRequestId = rendererRequestId;

    void applyAoiJobSummaryRenderer({
      aoiLayer,
      jobFilters: currentJobFilters,
      shouldApply() {
        return !isDestroyed && rendererRequestId === aoiRendererRequestId;
      },
    }).catch(() => {
      if (!isDestroyed && rendererRequestId === aoiRendererRequestId) {
        // Keep the map usable if the mock relation source fails while the renderer is being enriched.
        aoiLayer?.set?.("renderer", aoiLayer.renderer);
      }
    });
  }

  function applyJobGeometryWithoutBlockingMapReady(jobLayers) {
    void applyJobLayerData({ jobLayers })
      .then((result) => {
        if (!result.ok) {
          onJobLayerError?.(result.error);
        }
      })
      .catch((error) => {
        onJobLayerError?.(normalizeError(error, "Job geometry could not be loaded."));
      });
  }

  function closeOpenAggregatePopup() {
    const view = mapResult?.view;
    const popup = view?.popup;

    if (!view || !popup || !hasOpenAggregatePopupFeature(popup)) {
      return;
    }

    if (typeof view.closePopup === "function") {
      view.closePopup();
      return;
    }

    popup.close?.();
  }

  function hasOpenAggregatePopupFeature(popup) {
    if (popup.selectedFeature?.isAggregate) {
      return true;
    }

    return getPopupFeatures(popup).some((feature) => feature?.isAggregate);
  }

  function getPopupFeatures(popup) {
    const features = popup.features;

    if (!features) {
      return [];
    }

    if (Array.isArray(features)) {
      return features;
    }

    if (typeof features.toArray === "function") {
      return features.toArray();
    }

    return [];
  }

  function normalizeJobIds(jobIds) {
    if (!Array.isArray(jobIds)) {
      return [];
    }

    return [...new Set(jobIds.map(normalizeOptionalString).filter(Boolean))];
  }

  function normalizeOptionalString(value) {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value).trim();
  }

  function setReadyStatus(hasAoiLayer) {
    if (hasAoiLayer) {
      setStatus({
        status: MAP_STATUS.READY,
        title: "Map ready",
        message: "",
        hidden: true,
      });

      return;
    }

    setStatus({
      status: MAP_STATUS.WARNING,
      title: "Map ready",
      message: "AOI Feature Service URL is not configured yet.",
    });
  }

  function setStatus({ status, title, message, hidden = false }) {
    if (!statusElement) {
      return;
    }

    statusElement.hidden = hidden;
    statusElement.dataset.status = status;

    const titleElement = document.createElement("p");
    titleElement.className = "job-manager-map-status__title";
    titleElement.textContent = title;

    const messageElement = document.createElement("p");
    messageElement.className = "job-manager-map-status__message";
    messageElement.textContent = message;

    statusElement.replaceChildren(titleElement, messageElement);
  }

  return {
    start,
    destroy,
    getView,
    getMap,
    highlightJob,
    clearJobHighlight,
    highlightRelatedAoisForJob,
    highlightAoiById,
    clearAoiHighlight,
    applyAoiJobScope,
    clearAoiJobScope,
    refreshJobData,
    applyJobFilters,
    applyJobClusterSettings,
  };
}
```

---

## src/JobManager/src/features/map/layers/createAoiLayer.js

```
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";

import { createAoiFeatureServiceConfig } from "../../aoi/config/aoiConfig.js";
import { createAoiOutFields, createAoiPopupTemplate } from "../../aoi/config/aoiFieldConfig.js";
import { createAoiPopupActions } from "../popups/aoiPopupActions.js";
import { createDefaultAoiRenderer } from "./aoiRenderer.js";

export function createAoiLayer({ runtimeConfig } = {}) {
  const config = createAoiFeatureServiceConfig(runtimeConfig);

  if (!config.isConfigured) {
    return null;
  }

  return new FeatureLayer({
    id: "job-manager-aoi-layer",
    title: "Areas of Interest",
    url: config.url,
    outFields: createAoiOutFields(),
    popupEnabled: true,
    popupTemplate: createAoiLayerPopupTemplate(),
    renderer: createDefaultAoiRenderer(),
  });
}

function createAoiLayerPopupTemplate() {
  return {
    ...createAoiPopupTemplate(),
    actions: createAoiPopupActions(),
  };
}
```

---

## src/JobManager/src/features/map/layers/applyAoiRenderer.js

```
import { createDefaultJobFilters } from "../../jobs/domain/jobFilters.js";
import * as defaultRelationService from "../../relations/services/relationService.js";
import { createAoiJobSummaryRenderer, createDefaultAoiRenderer } from "./aoiRenderer.js";

export async function applyAoiJobSummaryRenderer({
  aoiLayer,
  relationService = defaultRelationService,
  jobFilters,
  shouldApply = () => true,
} = {}) {
  if (!aoiLayer) {
    return {
      ok: true,
      applied: false,
      reason: "aoi-layer-missing",
    };
  }

  if (!shouldApply()) {
    return {
      ok: true,
      applied: false,
      reason: "stale-renderer-request",
    };
  }

  const resolvedJobFilters = jobFilters ?? createDefaultJobFilters();

  aoiLayer.renderer = createDefaultAoiRenderer();

  if (!relationService?.loadAoiJobRelationSnapshot) {
    return {
      ok: false,
      applied: false,
      reason: "relation-service-missing",
    };
  }

  const relationSnapshotResult = await relationService.loadAoiJobRelationSnapshot({
    jobFilters: resolvedJobFilters,
  });

  if (!relationSnapshotResult.ok) {
    return {
      ok: false,
      applied: false,
      error: relationSnapshotResult.error,
    };
  }

  if (!shouldApply()) {
    return {
      ok: true,
      applied: false,
      reason: "stale-renderer-request",
    };
  }

  aoiLayer.renderer = createAoiJobSummaryRenderer(relationSnapshotResult.data.summaryByAoiId);

  return {
    ok: true,
    applied: true,
    data: {
      relationCount: relationSnapshotResult.data.relations.length,
      summaryCount: relationSnapshotResult.data.summaries.length,
    },
  };
}
```

---

## src/JobManager/src/features/map/layers/aoiRenderer.js

```
import { AOI_FIELD } from "../../aoi/config/aoiFieldConfig.js";

export const AOI_RENDERER_SEVERITY = Object.freeze({
  NONE: 0,
  ACTIVE: 1,
  HIGH: 2,
});

const AOI_SYMBOL_COLOR = Object.freeze({
  NONE_FILL: Object.freeze([69, 97, 120, 0.1]),
  NONE_OUTLINE: Object.freeze([69, 97, 120, 0.55]),
  ACTIVE_FILL: Object.freeze([255, 174, 0, 0.26]),
  ACTIVE_OUTLINE: Object.freeze([173, 119, 0, 0.95]),
  HIGH_FILL: Object.freeze([155, 28, 49, 0.3]),
  HIGH_OUTLINE: Object.freeze([155, 28, 49, 1]),
});

export function createDefaultAoiRenderer() {
  return {
    type: "simple",
    symbol: createAoiFillSymbol(AOI_RENDERER_SEVERITY.NONE),
    label: "Areas of Interest",
  };
}

export function createAoiJobSummaryRenderer(
  summaryByAoiId,
  { idField = AOI_FIELD.GLOBAL_ID } = {}
) {
  const severityEntries = createAoiSeverityEntries(summaryByAoiId);

  if (severityEntries.length === 0) {
    return createDefaultAoiRenderer();
  }

  return {
    type: "class-breaks",
    valueExpression: createAoiJobSeverityExpression(severityEntries, { idField }),
    valueExpressionTitle: "AOI Job status",
    defaultSymbol: createAoiFillSymbol(AOI_RENDERER_SEVERITY.NONE),
    defaultLabel: "No active Jobs",
    legendOptions: {
      title: "AOI Job status",
      order: "descending-values",
    },
    classBreakInfos: [
      {
        minValue: AOI_RENDERER_SEVERITY.NONE,
        maxValue: AOI_RENDERER_SEVERITY.NONE,
        symbol: createAoiFillSymbol(AOI_RENDERER_SEVERITY.NONE),
        label: "No active Jobs",
      },
      {
        minValue: AOI_RENDERER_SEVERITY.ACTIVE,
        maxValue: AOI_RENDERER_SEVERITY.ACTIVE,
        symbol: createAoiFillSymbol(AOI_RENDERER_SEVERITY.ACTIVE),
        label: "Active Jobs",
      },
      {
        minValue: AOI_RENDERER_SEVERITY.HIGH,
        maxValue: AOI_RENDERER_SEVERITY.HIGH,
        symbol: createAoiFillSymbol(AOI_RENDERER_SEVERITY.HIGH),
        label: "High-priority active Jobs",
      },
    ],
  };
}

export function createAoiJobSeverityExpression(
  severityEntries,
  { idField = AOI_FIELD.GLOBAL_ID } = {}
) {
  const conditions = normalizeSeverityEntries(severityEntries).map(
    ([aoiId, severity]) => `aoiId == ${JSON.stringify(aoiId)}, ${severity}`
  );

  if (conditions.length === 0) {
    return `return ${AOI_RENDERER_SEVERITY.NONE};`;
  }

  return [
    `var aoiId = Text($feature[${JSON.stringify(idField)}]);`,
    `return When(${conditions.join(", ")}, ${AOI_RENDERER_SEVERITY.NONE});`,
  ].join("\n");
}

export function getAoiJobSeverity(summary) {
  const active = normalizeCount(summary?.active);
  const activeHighPriority = hasOwnProperty(summary, "activeHighPriority")
    ? normalizeCount(summary.activeHighPriority)
    : Math.min(active, normalizeCount(summary?.highPriority));

  if (activeHighPriority > 0) {
    return AOI_RENDERER_SEVERITY.HIGH;
  }

  if (active > 0) {
    return AOI_RENDERER_SEVERITY.ACTIVE;
  }

  return AOI_RENDERER_SEVERITY.NONE;
}

function createAoiSeverityEntries(summaryByAoiId) {
  const entries = getSummaryEntries(summaryByAoiId);

  return entries
    .map(([aoiId, summary]) => [normalizeOptionalString(aoiId), getAoiJobSeverity(summary)])
    .filter(([aoiId, severity]) => aoiId && severity > AOI_RENDERER_SEVERITY.NONE);
}

function normalizeSeverityEntries(severityEntries) {
  if (!Array.isArray(severityEntries)) {
    return [];
  }

  return severityEntries
    .map(([aoiId, severity]) => [
      normalizeOptionalString(aoiId),
      normalizeRendererSeverity(severity),
    ])
    .filter(([aoiId, severity]) => aoiId && severity > AOI_RENDERER_SEVERITY.NONE);
}

function getSummaryEntries(summaryByAoiId) {
  if (summaryByAoiId instanceof Map) {
    return [...summaryByAoiId.entries()];
  }

  if (!summaryByAoiId || typeof summaryByAoiId !== "object") {
    return [];
  }

  return Object.entries(summaryByAoiId);
}

function createAoiFillSymbol(severity) {
  const colorConfig = getAoiSymbolColorConfig(severity);

  return {
    type: "simple-fill",
    style: "solid",
    color: [...colorConfig.fill],
    outline: {
      color: [...colorConfig.outline],
      width: colorConfig.outlineWidth,
    },
  };
}

function getAoiSymbolColorConfig(severity) {
  if (severity === AOI_RENDERER_SEVERITY.HIGH) {
    return {
      fill: AOI_SYMBOL_COLOR.HIGH_FILL,
      outline: AOI_SYMBOL_COLOR.HIGH_OUTLINE,
      outlineWidth: 1.75,
    };
  }

  if (severity === AOI_RENDERER_SEVERITY.ACTIVE) {
    return {
      fill: AOI_SYMBOL_COLOR.ACTIVE_FILL,
      outline: AOI_SYMBOL_COLOR.ACTIVE_OUTLINE,
      outlineWidth: 1.5,
    };
  }

  return {
    fill: AOI_SYMBOL_COLOR.NONE_FILL,
    outline: AOI_SYMBOL_COLOR.NONE_OUTLINE,
    outlineWidth: 1,
  };
}

function normalizeRendererSeverity(value) {
  const severity = Number(value);

  if (!Number.isFinite(severity)) {
    return AOI_RENDERER_SEVERITY.NONE;
  }

  if (severity >= AOI_RENDERER_SEVERITY.HIGH) {
    return AOI_RENDERER_SEVERITY.HIGH;
  }

  if (severity >= AOI_RENDERER_SEVERITY.ACTIVE) {
    return AOI_RENDERER_SEVERITY.ACTIVE;
  }

  return AOI_RENDERER_SEVERITY.NONE;
}

function normalizeCount(value) {
  const count = Number(value);

  if (!Number.isFinite(count) || count < 0) {
    return 0;
  }

  return Math.trunc(count);
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function hasOwnProperty(value, propertyName) {
  return Object.prototype.hasOwnProperty.call(value ?? {}, propertyName);
}
```

---

## src/JobManager/src/features/map/popups/aoiPopupActions.js

```
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";

import { AOI_FIELD } from "../../aoi/config/aoiFieldConfig.js";

export const AOI_POPUP_ACTION = Object.freeze({
  SHOW_RELATED_JOBS: "show-related-jobs",
});

export function createAoiPopupActions() {
  return [
    {
      id: AOI_POPUP_ACTION.SHOW_RELATED_JOBS,
      title: "Show related Jobs",
      icon: "list",
    },
  ];
}

export function registerAoiPopupActions({ view, onShowRelatedJobs } = {}) {
  if (!view || typeof onShowRelatedJobs !== "function") {
    return () => {};
  }

  const abortController = new AbortController();
  let popupActionHandle = null;

  const registerPopupViewModelHandler = (popupViewModel) => {
    if (!popupViewModel?.on || popupActionHandle || abortController.signal.aborted) {
      return;
    }

    popupActionHandle = popupViewModel.on("trigger-action", (event) => {
      if (event.action?.id !== AOI_POPUP_ACTION.SHOW_RELATED_JOBS) {
        return;
      }

      const selectedFeature = getSelectedPopupFeature(popupViewModel);
      const selectedAoi = createAoiSelectionFromGraphic(selectedFeature);

      onShowRelatedJobs(selectedAoi);
    });
  };

  const popupViewModel = view.popup?.viewModel;

  if (popupViewModel?.on) {
    registerPopupViewModelHandler(popupViewModel);
  } else {
    // Popup internals can be created lazily, so wait for the ViewModel before wiring actions.
    void reactiveUtils
      .whenOnce(() => view.popup?.viewModel, {
        signal: abortController.signal,
      })
      .then(registerPopupViewModelHandler)
      .catch((error) => {
        if (error?.name !== "AbortError") {
          throw error;
        }
      });
  }

  return () => {
    abortController.abort();
    popupActionHandle?.remove();
    popupActionHandle = null;
  };
}

export function createAoiSelectionFromGraphic(graphic) {
  const attributes = graphic?.attributes ?? {};
  const globalId = normalizeOptionalString(attributes[AOI_FIELD.GLOBAL_ID]);
  const productId = normalizeOptionalString(attributes[AOI_FIELD.PRODUCT_ID]);
  const objectId = normalizeOptionalString(attributes[AOI_FIELD.OBJECT_ID]);
  const aoiId = globalId || productId || createObjectIdFallback(objectId);

  return {
    aoiId,
    aoiName: normalizeOptionalString(attributes[AOI_FIELD.DISPLAY_NAME]) || "Selected AOI",
    objectId,
  };
}

function getSelectedPopupFeature(popupViewModel) {
  if (popupViewModel?.selectedFeature) {
    return popupViewModel.selectedFeature;
  }

  if (popupViewModel?.activeFeature) {
    return popupViewModel.activeFeature;
  }

  const features = popupViewModel?.features;
  const selectedIndex = Number.isInteger(popupViewModel?.selectedFeatureIndex)
    ? popupViewModel.selectedFeatureIndex
    : 0;

  if (Array.isArray(features)) {
    return features[selectedIndex] ?? features[0] ?? null;
  }

  if (typeof features?.at === "function") {
    return features.at(selectedIndex) ?? features.at(0) ?? null;
  }

  return features?.[selectedIndex] ?? features?.[0] ?? null;
}

function createObjectIdFallback(objectId) {
  if (!objectId) {
    return "";
  }

  return `aoi-${objectId}`;
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
```

---

## src/JobManager/src/features/map/popups/aoiPopupContent.js

```
import { createDefaultJobFilters, hasActiveJobFilters } from "../../jobs/domain/jobFilters.js";
import { getAoiJobSummary } from "../../relations/domain/aoiJobSummary.js";
import * as defaultRelationService from "../../relations/services/relationService.js";
import { createAoiSelectionFromGraphic } from "./aoiPopupActions.js";

const AOI_JOB_SUMMARY_POPUP_CONTENT_ID = "job-manager-aoi-job-summary";

export function configureAoiJobSummaryPopupContent({
  aoiLayer,
  getJobFilters,
  relationService = defaultRelationService,
} = {}) {
  if (!aoiLayer?.popupTemplate) {
    return {
      ok: true,
      applied: false,
      reason: "aoi-popup-template-missing",
    };
  }

  const popupTemplate = aoiLayer.popupTemplate;
  const existingContent = normalizePopupContent(popupTemplate.content).filter(
    (contentItem) => contentItem?.id !== AOI_JOB_SUMMARY_POPUP_CONTENT_ID
  );

  popupTemplate.content = [
    ...existingContent,
    createAoiJobSummaryPopupContent({
      getJobFilters,
      relationService,
    }),
  ];

  return {
    ok: true,
    applied: true,
  };
}

export function createAoiJobSummaryPopupContent({
  getJobFilters,
  relationService = defaultRelationService,
} = {}) {
  return {
    id: AOI_JOB_SUMMARY_POPUP_CONTENT_ID,
    type: "custom",
    creator(event) {
      const containerElement = createSummaryContainer();

      renderLoadingState(containerElement);

      void renderAoiJobSummary({
        containerElement,
        graphic: event?.graphic ?? event,
        getJobFilters,
        relationService,
      });

      return containerElement;
    },
  };
}

async function renderAoiJobSummary({ containerElement, graphic, getJobFilters, relationService }) {
  const selectedAoi = createAoiSelectionFromGraphic(graphic);

  if (!selectedAoi.aoiId) {
    renderMessageState({
      containerElement,
      message: "Job summary is unavailable because this AOI has no usable identifier.",
    });

    return;
  }

  if (!relationService?.loadAoiJobRelationSnapshot) {
    renderMessageState({
      containerElement,
      message: "Job summary could not be loaded because the relation service is unavailable.",
    });

    return;
  }

  const jobFilters = resolveJobFilters(getJobFilters);

  try {
    const relationSnapshotResult = await relationService.loadAoiJobRelationSnapshot({
      jobFilters,
    });

    if (!relationSnapshotResult.ok) {
      renderMessageState({
        containerElement,
        message: relationSnapshotResult.error.message,
      });

      return;
    }

    const summary = getAoiJobSummary(relationSnapshotResult.data.summaryByAoiId, selectedAoi.aoiId);

    renderSummaryState({
      containerElement,
      summary,
      filtersActive: hasActiveJobFilters(jobFilters),
    });
  } catch (error) {
    renderMessageState({
      containerElement,
      message: error?.message || "Job summary could not be loaded.",
    });
  }
}

function createSummaryContainer() {
  const containerElement = document.createElement("section");
  containerElement.className = "job-manager-aoi-popup-summary";
  containerElement.setAttribute("aria-label", "Related Jobs summary");

  return containerElement;
}

function renderLoadingState(containerElement) {
  renderMessageState({
    containerElement,
    message: "Loading related Jobs...",
  });
}

function renderMessageState({ containerElement, message }) {
  const titleElement = createTitleElement();

  const messageElement = document.createElement("p");
  messageElement.className = "job-manager-aoi-popup-summary__message";
  messageElement.textContent = message;

  containerElement.replaceChildren(titleElement, messageElement);
}

function renderSummaryState({ containerElement, summary, filtersActive }) {
  const titleElement = createTitleElement();

  const metricsElement = document.createElement("div");
  metricsElement.className = "job-manager-aoi-popup-summary__metrics";
  metricsElement.append(
    createMetricElement({
      label: "Related Jobs",
      value: summary.total,
    }),
    createMetricElement({
      label: "Active Jobs",
      value: summary.active,
    }),
    createMetricElement({
      label: "High-priority active Jobs",
      value: summary.activeHighPriority,
    })
  );

  const hintElement = document.createElement("p");
  hintElement.className = "job-manager-aoi-popup-summary__hint";
  hintElement.textContent =
    summary.total > 0
      ? getSummaryHint({ filtersActive })
      : "No related Jobs match the current Job filters for this AOI.";

  containerElement.replaceChildren(titleElement, metricsElement, hintElement);
}

function createTitleElement() {
  const titleElement = document.createElement("h3");
  titleElement.className = "job-manager-aoi-popup-summary__title";
  titleElement.textContent = "Related Jobs";

  return titleElement;
}

function createMetricElement({ label, value }) {
  const metricElement = document.createElement("div");
  metricElement.className = "job-manager-aoi-popup-summary__metric";

  const valueElement = document.createElement("span");
  valueElement.className = "job-manager-aoi-popup-summary__metric-value";
  valueElement.textContent = String(value);

  const labelElement = document.createElement("span");
  labelElement.className = "job-manager-aoi-popup-summary__metric-label";
  labelElement.textContent = label;

  metricElement.append(valueElement, labelElement);

  return metricElement;
}

function getSummaryHint({ filtersActive }) {
  if (filtersActive) {
    return "Counts reflect the active Job filters.";
  }

  return "Done Jobs are hidden by default unless the Done filter is active.";
}

function resolveJobFilters(getJobFilters) {
  const filters = getJobFilters?.();

  if (filters === null || filters === undefined) {
    return createDefaultJobFilters();
  }

  return filters;
}

function normalizePopupContent(content) {
  if (Array.isArray(content)) {
    return content;
  }

  if (typeof content?.toArray === "function") {
    return content.toArray();
  }

  if (!content) {
    return [];
  }

  return [content];
}
```

---

## src/JobManager/src/features/aoi/config/aoiFieldConfig.js

```
export const AOI_FIELD = Object.freeze({
  OBJECT_ID: "OBJECTID",
  GEOMETRY: "Shape",
  DISPLAY_NAME: "PRODUCTNAME",
  SERIES: "SERIES",
  EDITION: "EDITION",
  LOCKED: "LOCKED",
  FILE_LINK: "FILELINK",
  JSON: "JSON",
  ISSUE_DATE: "ISSUEDATE",
  IS_TECHNICAL: "IS_TECHNICAL",
  UPDATE_TYPE: "UPDT",
  PRODUCT_ID: "PRODUCTID",
  GLOBAL_ID: "GlobalID",
  CREATED_USER: "created_user",
  CREATED_DATE: "created_date",
  LAST_EDITED_USER: "last_edited_user",
  LAST_EDITED_DATE: "last_edited_date",
});

export const AOI_TEST_FIELD_CONFIG = Object.freeze({
  idField: AOI_FIELD.GLOBAL_ID,
  objectIdField: AOI_FIELD.OBJECT_ID,
  displayNameField: AOI_FIELD.DISPLAY_NAME,
  productIdField: AOI_FIELD.PRODUCT_ID,
  secondaryDisplayFields: Object.freeze([AOI_FIELD.SERIES, AOI_FIELD.EDITION]),
});

export const AOI_ID_FIELD_CANDIDATES = Object.freeze([
  AOI_FIELD.GLOBAL_ID,
  "globalId",
  "globalID",
  AOI_FIELD.PRODUCT_ID,
  "productId",
  "id",
  "aoiId",
  "aoi_id",
]);

export const AOI_NAME_FIELD_CANDIDATES = Object.freeze([
  AOI_FIELD.DISPLAY_NAME,
  "productName",
  "name",
  "Name",
  "title",
  "Title",
  "aoiName",
  "aoi_name",
]);

const AOI_POPUP_FIELD_INFOS = Object.freeze([
  Object.freeze({
    fieldName: AOI_FIELD.DISPLAY_NAME,
    label: "Product name",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.SERIES,
    label: "Series",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.EDITION,
    label: "Edition",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.ISSUE_DATE,
    label: "Issue date",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.PRODUCT_ID,
    label: "Product ID",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.GLOBAL_ID,
    label: "Global ID",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.OBJECT_ID,
    label: "Object ID",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.LOCKED,
    label: "Locked",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.IS_TECHNICAL,
    label: "Technical",
  }),
  Object.freeze({
    fieldName: AOI_FIELD.UPDATE_TYPE,
    label: "Update type",
  }),
]);

export function createAoiOutFields() {
  return [
    AOI_FIELD.OBJECT_ID,
    AOI_FIELD.DISPLAY_NAME,
    AOI_FIELD.SERIES,
    AOI_FIELD.EDITION,
    AOI_FIELD.LOCKED,
    AOI_FIELD.ISSUE_DATE,
    AOI_FIELD.IS_TECHNICAL,
    AOI_FIELD.UPDATE_TYPE,
    AOI_FIELD.PRODUCT_ID,
    AOI_FIELD.GLOBAL_ID,
  ];
}

export function createAoiPopupTemplate() {
  return {
    title: `{${AOI_FIELD.DISPLAY_NAME}}`,
    content: [
      {
        type: "fields",
        fieldInfos: createAoiPopupFieldInfos(),
      },
    ],
  };
}

export function createAoiPopupFieldInfos() {
  // Return new objects so ArcGIS can safely enrich popup metadata without mutating shared config.
  return AOI_POPUP_FIELD_INFOS.map((fieldInfo) => ({ ...fieldInfo }));
}
```

---

## src/JobManager/src/features/aoi/domain/aoiModel.js

```
import {
  AOI_FIELD,
  AOI_ID_FIELD_CANDIDATES,
  AOI_NAME_FIELD_CANDIDATES,
} from "../config/aoiFieldConfig.js";

const DEFAULT_AOI_JOB_SUMMARY = Object.freeze({
  total: 0,
  active: 0,
  highPriority: 0,
});

export function normalizeAoi(rawAoi) {
  const attributes = normalizeAttributes(rawAoi?.attributes);
  const globalId = resolveFieldValue(rawAoi, attributes, AOI_FIELD.GLOBAL_ID);
  const objectId = resolveFieldValue(rawAoi, attributes, AOI_FIELD.OBJECT_ID);
  const productId = resolveFieldValue(rawAoi, attributes, AOI_FIELD.PRODUCT_ID);
  const name = resolveFirstStringValue(rawAoi, attributes, AOI_NAME_FIELD_CANDIDATES);
  const id = resolveFirstStringValue(rawAoi, attributes, AOI_ID_FIELD_CANDIDATES);

  return {
    id: id || createFallbackAoiId({ globalId, productId, objectId }),
    name: name || "Unnamed Area of Interest",
    objectId,
    globalId,
    productId,
    series: resolveFieldValue(rawAoi, attributes, AOI_FIELD.SERIES),
    edition: normalizeNullableInteger(resolveFieldValue(rawAoi, attributes, AOI_FIELD.EDITION)),
    geometry: rawAoi?.geometry ?? null,
    attributes,
    jobSummary: normalizeAoiJobSummary(rawAoi?.jobSummary),
  };
}

export function normalizeAoiJobSummary(jobSummary) {
  if (!jobSummary || typeof jobSummary !== "object") {
    return { ...DEFAULT_AOI_JOB_SUMMARY };
  }

  return {
    total: normalizeCount(jobSummary.total),
    active: normalizeCount(jobSummary.active),
    highPriority: normalizeCount(jobSummary.highPriority),
  };
}

function normalizeAttributes(attributes) {
  if (!attributes || typeof attributes !== "object") {
    return {};
  }

  return { ...attributes };
}

function resolveFirstStringValue(rawAoi, attributes, candidateKeys) {
  for (const key of candidateKeys) {
    const value = resolveFieldValue(rawAoi, attributes, key);

    if (value) {
      return value;
    }
  }

  return "";
}

function resolveFieldValue(rawAoi, attributes, fieldName) {
  return normalizeOptionalString(rawAoi?.[fieldName] ?? attributes[fieldName]);
}

function createFallbackAoiId({ globalId, productId, objectId }) {
  if (globalId) {
    return globalId;
  }

  if (productId) {
    return productId;
  }

  if (objectId) {
    return `aoi-${objectId}`;
  }

  return "aoi-unknown";
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeNullableInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  return Math.trunc(numberValue);
}

function normalizeCount(value) {
  const count = Number(value);

  if (!Number.isFinite(count) || count < 0) {
    return 0;
  }

  return Math.trunc(count);
}
```

---

## src/JobManager/src/features/aoi/services/aoiService.js

```
import { createSuccessResult } from "../../../shared/api/apiResult.js";
import { createAoiFeatureServiceConfig } from "../config/aoiConfig.js";

export async function loadAois({ runtimeConfig } = {}) {
  const config = createAoiFeatureServiceConfig(runtimeConfig);

  // Return a stable shape now so UI and map code can integrate before the real AOI query path is confirmed.
  return createSuccessResult(
    {
      aois: [],
      sourceType: config.sourceType,
      isConfigured: config.isConfigured,
    },
    {
      source: "aoi-service-skeleton",
      configured: config.isConfigured,
    }
  );
}
```

---

## src/JobManager/src/features/aoi/state/selectedAoiStore.js

```
export function createSelectedAoiStore() {
  let state = {
    selectedAoi: null,
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
      selectedAoi: state.selectedAoi ? { ...state.selectedAoi } : null,
    };
  }

  function selectAoi(aoi) {
    const selectedAoi = normalizeSelectedAoi(aoi);

    setState({
      selectedAoi,
    });

    return selectedAoi;
  }

  function clearSelection() {
    setState({
      selectedAoi: null,
    });
  }

  function setState(partialState) {
    state = {
      ...state,
      ...partialState,
    };

    emit();
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
    selectAoi,
    clearSelection,
  };
}

function normalizeSelectedAoi(aoi = {}) {
  return {
    aoiId: normalizeOptionalString(aoi.aoiId ?? aoi.id),
    aoiName: normalizeOptionalString(aoi.aoiName ?? aoi.name) || "Selected AOI",
    objectId: normalizeOptionalString(aoi.objectId),
  };
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
```

---

## src/JobManager/src/features/relations/services/relationService.js

```
import { createErrorResult, createSuccessResult } from "../../../shared/api/apiResult.js";
import { filterJobsForVisibleJobSet } from "../../jobs/domain/jobFilters.js";
import * as defaultJobService from "../../jobs/services/jobService.js";
import { buildAoiJobSummaries, buildAoiJobSummaryByAoiId } from "../domain/aoiJobSummary.js";
import {
  buildRelationsFromJobs,
  getAoiIdsForJob,
  getJobIdsForAoi,
  RELATION_SOURCE,
} from "../domain/relationModel.js";

export async function loadAoiJobRelations({
  jobs,
  jobService = defaultJobService,
  source = RELATION_SOURCE.MOCK,
} = {}) {
  const jobsResult = await resolveJobs({ jobs, jobService });

  if (!jobsResult.ok) {
    return createErrorResult(jobsResult.error, {
      operation: "loadAoiJobRelations",
      source,
    });
  }

  const relations = buildRelationsFromJobs(jobsResult.data.jobs, { source });

  return createSuccessResult(
    {
      relations,
    },
    {
      operation: "loadAoiJobRelations",
      source,
      relationCount: relations.length,
    }
  );
}

export async function loadAoiJobRelationSnapshot({
  jobs,
  jobService = defaultJobService,
  source = RELATION_SOURCE.MOCK,
  jobFilters,
} = {}) {
  const jobsResult = await resolveJobs({ jobs, jobService });

  if (!jobsResult.ok) {
    return createErrorResult(jobsResult.error, {
      operation: "loadAoiJobRelationSnapshot",
      source,
    });
  }

  const resolvedJobs = getSnapshotJobs({
    jobs: jobsResult.data.jobs,
    jobFilters,
    shouldApplyJobFilters: isJobFilterInputProvided(jobFilters),
  });
  const relations = buildRelationsFromJobs(resolvedJobs, { source });
  const summaryByAoiId = buildAoiJobSummaryByAoiId({
    jobs: resolvedJobs,
    relations,
  });

  return createSuccessResult(
    {
      relations,
      summaries: buildAoiJobSummaries({ jobs: resolvedJobs, relations }),
      summaryByAoiId: Object.fromEntries(summaryByAoiId.entries()),
    },
    {
      operation: "loadAoiJobRelationSnapshot",
      source,
      relationCount: relations.length,
      aoiSummaryCount: summaryByAoiId.size,
    }
  );
}

export async function loadJobIdsForAoi({
  aoiId,
  jobs,
  jobService = defaultJobService,
  source = RELATION_SOURCE.MOCK,
} = {}) {
  const normalizedAoiId = normalizeOptionalString(aoiId);

  if (!normalizedAoiId) {
    return createSuccessResult(
      {
        jobIds: [],
      },
      {
        operation: "loadJobIdsForAoi",
        source,
        aoiId: "",
        jobCount: 0,
      }
    );
  }

  const relationsResult = await loadAoiJobRelations({
    jobs,
    jobService,
    source,
  });

  if (!relationsResult.ok) {
    return createErrorResult(relationsResult.error, {
      operation: "loadJobIdsForAoi",
      source,
      aoiId: normalizedAoiId,
    });
  }

  const jobIds = getJobIdsForAoi({
    relations: relationsResult.data.relations,
    aoiId: normalizedAoiId,
  });

  return createSuccessResult(
    {
      jobIds,
    },
    {
      operation: "loadJobIdsForAoi",
      source,
      aoiId: normalizedAoiId,
      jobCount: jobIds.length,
    }
  );
}

export function getJobsForAoi({ aoiId, jobs = [], relations = [] } = {}) {
  const jobIds = new Set(getJobIdsForAoi({ relations, aoiId }));

  return normalizeArray(jobs).filter((job) => jobIds.has(normalizeOptionalString(job.id)));
}

export function getJobsForAoiFromJobs({ aoiId, jobs = [] } = {}) {
  const resolvedJobs = normalizeArray(jobs);
  const relations = buildRelationsFromJobs(resolvedJobs);

  // Keep UI filtering source-agnostic so this can later use backend relations without changing Job UI.
  return getJobsForAoi({ aoiId, jobs: resolvedJobs, relations });
}

export function getAoisForJob({ jobId, aois = [], relations = [] } = {}) {
  const aoiIds = new Set(getAoiIdsForJob({ relations, jobId }));

  return normalizeArray(aois).filter((aoi) => aoiIds.has(normalizeOptionalString(aoi.id)));
}

function getSnapshotJobs({ jobs, jobFilters, shouldApplyJobFilters }) {
  const resolvedJobs = normalizeArray(jobs);

  if (!shouldApplyJobFilters) {
    return resolvedJobs;
  }

  return filterJobsForVisibleJobSet(resolvedJobs, jobFilters);
}

function isJobFilterInputProvided(jobFilters) {
  return jobFilters !== undefined;
}

async function resolveJobs({ jobs, jobService }) {
  if (Array.isArray(jobs)) {
    return createSuccessResult(
      {
        jobs,
      },
      {
        source: "provided-jobs",
      }
    );
  }

  if (!jobService?.loadJobs) {
    return createErrorResult(new Error("Job service is not available."), {
      source: "relation-service",
    });
  }

  return jobService.loadJobs();
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value;
}
```
