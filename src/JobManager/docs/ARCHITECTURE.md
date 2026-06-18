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

### Current MapView foundation

Status: In progress

ArcGIS `Map` and `MapView` creation is isolated under `features/map/core`.

Current responsibilities:

- `features/map/core/createMapView.js` creates the ArcGIS `Map`, operational layers and `MapView`.
- `features/map/core/mapController.js` owns map startup, loading/error status, renderer enrichment and cleanup.
- `features/map/layers/createAoiLayer.js` owns AOI `FeatureLayer` construction and connects popup/outFields to AOI field config.
- `features/map/layers/aoiRenderer.js` owns AOI renderer configuration.
- `features/map/layers/applyAoiRenderer.js` applies AOI renderer enrichment from relation summaries without blocking map startup.
- `src/app/createApp.js` only creates the DOM container, wires lifecycle and handles app-level notices.

Rules:

- Do not add ArcGIS layer construction directly to `src/app`.
- Do not put AOI field normalization in map layer code.
- Do not make map code the canonical owner of AOI or Job state.
- Keep future AOI popup action, filter and clustering logic under `features/map`.

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

Responsibilities:

- theme state
- theme preference
- Calcite theme integration
- app CSS theme hooks
- theme toggle UI, if needed

Rules:

- Theme behavior should follow Product Manager patterns after current code is verified.
- Map and custom UI must remain readable in both modes.

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
- keep filter state in a shared feature-level place, likely `features/map/filters` or a later dedicated app state module
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

### AOI renderer architecture

Status: In progress

AOI rendering is split into two levels:

```txt
Neutral AOI renderer
  -> used when relation summaries are missing or cannot be matched to AOI ids

Job summary renderer
  -> used when relation summaries can be matched to the AOI Feature Service id field
```

Current behavior:

- `features/map/layers/aoiRenderer.js` creates ArcGIS renderer definitions.
- `features/map/layers/applyAoiRenderer.js` loads relation summaries as best-effort data and applies a renderer to the AOI layer.
- Renderer enrichment is non-blocking. The map should remain usable even if mock Jobs fail to load.

Renderer severity values:

```txt
0 = No active Jobs
1 = Active Jobs
2 = High-priority active Jobs
```

The renderer currently uses `GlobalID` as the provisional AOI id field for matching relation summaries to Feature Service features. This must be revisited when the real AOI Feature Service and backend relation source are confirmed.

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
