# FI-030B — Initial map readiness (implementation record)

## Scope and authority

- Original implementation source: `2d596754d43d00352fe0adfac9b0f8420fb817c8`, verified from a supplied archive and SHA-256 manifest.
- The Main-map readiness implementation was later committed at `d400be0` (2026-11-06); the Analyze direct-route follow-up at `1065291` (2026-11-09). This document records their intended contracts, not independent browser acceptance.
- These changes extend the FI-030 completion hold accepted in `ddfb26bb143c52ac80f1277bbe1de1ad8e87800c`.
- Scope: initial **Main Map** readiness only. No backend, source registry, API, map architecture, dependencies, Analyze, Dashboard or Review changes.

## Why the existing loader finished too early

`loadInitialData()` waited for the independent compatibility-AOI and runtime-source startup tasks to settle, including their GraphicsLayer creation/registration. It then reported `Map ready` and started the FI-030 completion hold. This did not establish that MapView or the first visible layer views had finished drawing. On a cold load, basemap resources and map rendering could continue after the overlay disappeared.

Network request count is **not** the readiness contract: tile requests, vector fonts, basemap previews and nonessential background traffic may continue after the first usable map frame. Waiting for all browser requests to stop can block indefinitely.

## Implemented readiness boundary

Following successful completion of both existing source tasks:

1. Bind existing compatibility visibility and keep **the same determinate loading bar** at its last source-owned progress value while displaying `Finishing initial map display...`. The bar does not restart as indeterminate or advance through invented render percentages. It reaches 100% only when readiness has resolved.
2. Await the existing `MapView.when()` and `whenLayerView()` for all currently visible operational layers present in `map.layers`. This includes runtime sources whose layer-view readiness was not part of the startup promise.
3. Observe the public `view.updating`, `view.stationary` and relevant `layerView.updating` properties through `reactiveUtils.watch()`. Require **500 ms** of uninterrupted idle/stationary state before declaring the first map frame ready.
4. Clean up watchers and timers when settled. Bound the entire MapView/layer-view/render wait to **60 seconds**. On timeout, unavailable view or layer-view failure, show a warning and a truthful incomplete completion message rather than claiming `Map ready` or leaving the loader visible forever.
5. Preserve the previously accepted **300 ms** visible completion hold, reduced-motion behavior, source-failure notices, Product interactions and onboarding ordering. `Map ready` and the ordinary graphics success notice are emitted only after verified readiness.

The helper accepts an optional abort signal, removes its watcher on every settled path, and ignores promises that settle after timeout/abort. It does not start, retry or duplicate source requests. `whenLayerView()` observes already-created map layers.

The existing error paths for compatibility-AOI or whole runtime-source initialization failure are unchanged. The Main Map handles partial source failures through its existing notice path. This candidate does not change Analyze's separate loading lifecycle.

## Local browser acceptance

Test against the built frontend from this exact candidate, ideally with **Network → Disable cache** and a full reload:

1. Cold-load Main Map with normal sources enabled. Compare the overlay's dismissal with the last **necessary** basemap/visible-layer drawing. Verify the map is usable when `Map ready` is shown.
2. While the overlay is visible, confirm it shows `Finishing initial map display...` with the original progress bar still at its last source-owned value (typically 96%) rather than restarting. Verify the established brief `100%` hold only after initial map readiness.
3. Cold-load with slow/throttled network, using both light and dark basemaps. Verify no premature completion; check Zoom, Basemap Gallery, Products, Filters, popups and focus after dismissal.
4. Repeat after warm cache; there should be no unnecessary fixed 60-second delay (only the 500 ms stable-frame criterion once data and views are ready).
5. Temporarily block a basemap resource in DevTools. The wait must end within 60 seconds of entering the readiness phase, with a visible warning and no false `Map ready` claim; the map remains usable where possible.
6. Verify source activation failure still gives the existing source-specific notice; do not lose working sources, popup actions or Product status.
7. Verify Analyze/Dashboard/Review and manual Refresh are unchanged. Check reduced motion, tab focus, Escape, onboarding opening after loader dismissal, and browser Console for new errors.

## Verification boundaries

Node tests cover success, visible layer readiness, idle-window restart, timeout, cancellation, failure and cleanup. They do **not** establish ArcGIS rendering behavior, network request timing, live services or complete page readiness. The developer runs `npm run format` and `npm run check` in the actual repository and performs the browser tests before committing.

## Analyze direct-route follow-up (2026-11-09 implementation)

The separate Analyze bootstrap loader previously disappeared immediately after
`view.when()`, before the explicit URL Products finished resolving. The Analyze data
session then displayed a second delayed loading bar. Direct navigation now continues
one visible loader from bootstrap through initial Product, layer and map readiness.
The existing `waitForInitialMapReadiness()` helper is reused with Analyze's visible
layers; a 500 ms idle/stationary window is required, with a bounded 60-second fallback.
Only verified readiness shows `Analyze ready`; an incomplete display raises a notice.
The Product catalogue picker remains independently loaded, as established in DSA-08.

Interactive Analyze Product changes keep their existing compact sidebar loading only.
No global loading bar is started by adding, removing, enabling, disabling or submitting
Products after the first route load. The established load generation and cancellation
rules remain authoritative. Analyze's read-only popup correction is documented in
[`src/features/analyze/README.md`](../src/features/analyze/README.md).

This committed follow-up still needs a fresh-cache browser check on the accepted frontend,
including cold navigation with two Products, LayerView readiness, a later Product
change, popup metadata, focus/Escape, and no regression of Main-map popup actions.
