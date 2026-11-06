# PC-TH-01 / FI-030 — UI freeze follow-up candidate

## Authority and limits

- Source snapshot: ProductCatalogue `main` commit `59d1e1fc662fa0e0df49cc00724d6ecc97567475`, clean for ProductCatalogue, verified from the uploaded SHA-256 archive.
- The developer confirmed that the slider exception disappeared, the deployed frontend had no Lit warning, local checks passed, and the candidate was committed at `ddfb26bb143c52ac80f1277bbe1de1ad8e87800c` before the merge at `2d596754d43d00352fe0adfac9b0f8420fb817c8`.
- The separate [FI-030B initial map readiness](fi-030b-initial-map-readiness.md) candidate addresses the remaining cold-load display timing issue; this document records the earlier accepted completion presentation.
- Scope: existing Calcite Filter range UI and shared loader completion presentation. No SDK/Calcite upgrades, API changes, feature additions, or backend phase/chunk contract.

## PC-TH-01: Calcite Slider

The deployed frontend previously logged `Slider.getFontSizeForElement` →
`hyphenateCollidingRangeHandleLabels` with a null match. At the supplied snapshot,
`attributeFilterPanel.js` rendered `calcite-slider` elements inside an initially
hidden Filter panel with `label-handles` enabled. The application also rendered
the endpoint values in two visible `output` elements.

The candidate omits the redundant handle labels, leaving the output elements
and native range slider intact. It adds public `min-label` and `max-label`
attributes so the handles retain descriptive accessible names. No custom shadow
DOM, element replacement on range commit, or filter contract changes.

This mitigated the suspected failure path: the developer reported that the
Slider exception disappeared during browser testing. The developer also reported
no `Multiple versions of Lit loaded` warning on the deployed frontend; that is
not evidence that all possible development/dependency combinations are identical.

## FI-030: truthful completion presentation

`createLoaderProgressSession` supports an opt-in `completionHoldMs`; the existing
Main-map startup and Analyze loader sessions opt in to 300 ms. A successful
completion has already reached the real terminal state before the loader shows
`100%` and `Map ready` or `Analyze ready`. A delayed dismissal is only used if
the loader was shown (Analyze) or is externally owned by bootstrap (Main map).

- Fast Analyze loads under the existing 350 ms show delay remain hidden.
- Reduced-motion preference skips the completion hold and disables progress-bar animations.
- Each start claims a new loader generation, so an older completion/failure timer
  cannot dismiss a newer session. Cleanup clears pending completion timers and
  resolves pending completion waits, avoiding startup deadlocks.
- Route startup awaits the completion dismissal so onboarding does not open
  behind a still-visible loader.
- Backend loading, errors, retries, existing progress phases and source isolation
  remain unchanged. There are no new requests or synthetic progress values.

## Local browser acceptance

1. Clear the browser console; cold-load Main map with one or more enabled data
   sources. Observe the real completion state briefly, then unobstructed map
   interaction. Verify refresh remains unchanged.
2. Load Analyze with a slow Product. Verify the existing delayed loader still
   appears; the completed state is visible briefly without obscuring status
   indefinitely. For fast loads, verify no loader flashes on screen.
3. Change Analyze Products quickly during loading. Verify an older completion
   cannot hide a newer loader or leave one visible permanently.
4. In Main-map Filters, expand a numeric display-scale range, drag both handles,
   confirm output/visible counts and correct map filtering. Close/reopen the
   panel and repeat in both light and dark themes. Check for Slider exceptions.
5. Enable `prefers-reduced-motion`, reload, and verify immediate dismissal, no
   animated progress movement and functioning filters.
6. Check keyboard Tab/Shift+Tab/arrow keys, Escape and focus restoration;
   confirm Dashboard/Review and popup workflows are unchanged.

## Verification boundaries

Node unit tests can validate loader state, revision ownership and range-count
contracts, but cannot prove ArcGIS/Calcite rendering, Slider internals or real
browser focus. The developer must run `npm run format` and `npm run check` locally
and complete the browser acceptance steps before committing.
