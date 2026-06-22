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

Status: In progress

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

Status: In progress

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

### Current MapView foundation

Status: In progress

ArcGIS `Map` and `MapView` creation is isolated under `features/map/core`.

Current responsibilities:

- `features/map/core/createMapView.js` creates the ArcGIS `Map`, operational layers and `MapView`.
- `features/map/core/mapController.js` owns map startup, loading/error status, renderer enrichment, Job layer data enrichment, popup action wiring and cleanup.
- `features/map/layers/createAoiLayer.js` owns AOI `FeatureLayer` construction and connects popup/outFields/actions to AOI field config and popup helpers.
- `features/map/layers/createJobLayers.js` owns read-only Job geometry layer construction.
- `features/map/layers/applyJobLayerData.js` loads Job service data into the Job geometry layers.
- `features/map/layers/aoiRenderer.js` owns AOI renderer configuration.
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

Status: In progress

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

Status: In progress

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

### AOI popup action flow

Status: In progress

Current flow:

```txt
AOI PopupTemplate action
  -> PopupViewModel trigger-action event
  -> app-level selected AOI callback
  -> selected AOI state
  -> Jobs panel scoped to selected AOI
```

Rules:

- Popup actions should be defined on the AOI `PopupTemplate`.
- Popup action wiring should wait for `view.popup.viewModel` with `reactiveUtils.whenOnce` because popup internals can be created lazily.
- Popup action handlers should extract stable AOI values from the selected popup feature.
- Popup action handlers should not load mock Jobs directly.
- Jobs panel filtering should use relation service/domain helpers.
- App-level composition should wire map events to Jobs UI behavior.
- Temporary popup debug logging should not remain in production-ready code.

Current action:

```txt
Show related Jobs
```

The action opens the Jobs panel and scopes it to Jobs related to the selected AOI.

Accessibility note:

When closing the Jobs panel, focus is moved back to the navbar Jobs control before the panel is hidden. This avoids hiding focused descendants from assistive technology.

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
