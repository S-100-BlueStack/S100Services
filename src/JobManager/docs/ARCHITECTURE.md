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

Rules:

- Selected Job map focus is initiated from Job details UI but coordinated by app composition.
- Job details UI must not import map code or relation backend details directly.
- Map focus uses the existing Job layer filtering path so shared Job filters and clustering continue to work.
- Related AOIs are highlighted, not permanently filtered, until real AOI identifiers, geometry behavior and UX expectations are confirmed.
- Clearing selected Job map focus restores the normal map context without closing Job details.
- This flow must not introduce a final backend/AOI relation contract.

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

Mutation consistency note:

```txt
Job status mutation
  -> Jobs store updates
  -> Jobs panel rerenders
  -> open AOI popup summary re-renders from shared Jobs state
  -> map Job layer data remains unchanged until manual refresh
```

This is acceptable for now because individual mutation sync to ArcGIS client-side layers is not required yet. If immediate map presentation sync becomes required, add an app-level mutation event or store subscription that refreshes map Job layers and AOI renderer state without waiting for manual refresh.

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
