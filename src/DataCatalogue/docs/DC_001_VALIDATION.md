# DC-001 Validation

Status: V5 final visual/interaction polish candidate prepared; browser acceptance and live ArcGIS verification remain pending.

Authoritative baseline: `184fdca6f5f8d87dc7a3a878c867b6714ec873f8`.

## Scope

DC-001 adds a separate Feature-assignment workflow while preserving the existing Jobs/AOI main-map workflow. The frontend domain term is `Work stream` / `Work streams`; the external `Workspace API` contract name is unchanged until its owner explicitly changes it.

The V5 correction preserves accepted V4 behavior and adds:

- independent left/right vertical splits so the map receives about 57% of the right column without shrinking the left Feature region;
- a compact top-right `Retry map` icon action using the public Calcite refresh icon, with no dedicated map toolbar row;
- a complete scrollable Work stream list with no Work stream search or pagination controls;
- the existing `Show active` / `Show all` behavior, startup isolation, deterministic history fixtures, map styling, explicit Save lifecycle and Jobs navigation unchanged.

## Runtime configuration

Configure `VITE_WORK_STREAM_MAP_SERVICE_URL` locally with the intended HTTPS MapServer base URL. The committed `.env.example` contains only an example host. Do not add credentials or tokens to any `VITE_*` variable, source file, URL query or persistence.

Jobs/AOI still requires its configured AOI Feature Service. A missing AOI URL must keep Jobs/AOI blocked without blocking the navbar or Feature assignment.

## Deterministic comment fixtures

Use these Features during browser validation:

- `NM260004`: starts Assigned to DK1 with two immutable saved comments.
- `NM260005`: starts Not assigned with two retained inactive DK2 comments.

For `NM260005`, visible inactive history must not make the Feature Assigned. Reassigning DK2 must preserve the two saved comments.

## Focused automated coverage

Dependency-free tests cover:

- blocked Jobs startup remaining blocked while Feature assignment stays reachable;
- returning to Jobs preserving blocked startup state and leaving the interactive startup loader available;
- explicit assignment-to-Jobs open behavior after startup succeeds;
- normal Jobs toggle behavior;
- required assignment-page render targets;
- absence of Work stream search and pagination targets from the page contract;
- complete Work stream catalogue and active-ID subset service behavior without paging metadata;
- Work stream Show active / Show all normalization and zero-to-many layer bindings;
- one logical map retry per Retry action activation;
- deterministic active and inactive saved-comment fixtures;
- immutable saved history and reassignment retention;
- active-draft comment requirements and orphaned-draft validation;
- stale Feature/query suppression and deduplicated Save;
- map configuration validation and non-color-only renderer distinctions.

The candidate environment contains only cumulative changed/new files, not the repository package manifest or installed dependencies. Full `npm run check` therefore remains a local repository verification gate.

## Manual browser checklist

1. Confirm the assignment map is visibly larger than the Work stream panel, at roughly 55–60% of the right column, without dominating the page.
2. Confirm the left-side Feature list/information proportions have not regressed.
3. Confirm `Retry map` is a small top-right refresh icon action with tooltip and accessible name.
4. Activate Retry map with mouse and keyboard and confirm one activation performs one logical map retry.
5. Confirm no empty map toolbar/header row remains.
6. Confirm Work streams have no Previous/Next/page indicator or other pagination controls.
7. Confirm the Work stream list scrolls internally when its content exceeds the panel height.
8. Confirm `Show active` / `Show all` still filters correctly.
9. Select an Assigned Feature in active-only mode, then a Not assigned Feature, and confirm the list falls back to Show all.
10. Recheck `NM260004` / `NM260005` history, comments, orphaned-draft validation, Save, failed Save and dirty-navigation behavior.
11. Verify 1366×768 and lower-height laptop views remain usable, including independent panel scrolling.
12. Verify light and dark mode, including Retry-map visibility against the map background.
13. Recheck existing Jobs/AOI startup isolation, assignment-to-Jobs explicit-open behavior and normal Jobs toggle semantics.
14. With the real Work stream map service configured, verify DK1-DK5 layers 4-8, metadata/sample queries, geometry/spatial reference, CORS and runtime ArcGIS session behavior. Confirm there is no synthetic fallback geography.

## Known integration gates

- No browser session was run in the candidate environment.
- Live ArcGIS metadata, CORS, geometry, spatial reference and authentication remain unverified.
- Package API, Workspace API, assignment/comment backend ownership, production AD integration, Work-area locking, ENC completion and cross-user concurrency remain deferred.
- The local mock persistence envelope and deterministic comment fixture shape are not backend contracts.
