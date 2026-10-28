# Source-aware Main map Product search

Main map Product search indexes only Product graphics currently committed in active frontend
providers.

This workflow remains separate from Locator/FI-012 and from backend or connected-data search.

## Shared Main-map search controls

`mainMapSearchControls.js` owns only the shared overlay placement, independent host slots, and the
neutral inline open/closed layout for Product search and Locator. It also owns the decorative Locator
slot transition. Closing immediately targets the collapsed layout, keeps the empty application-owned
Locator slot present while `flex-basis` collapses, and finalizes the layout state on `transitionend`.
Reopening during that transition cancels the old completion through a generation/state guard. Reduced
motion finalizes the collapsed layout immediately. None of this keeps an ArcGIS Search session alive.
Product search still owns its index, suggestions, Product navigation, selected Product behavior, and
popup opening. Locator owns geographic source configuration and geographic navigation.

The app composition layer may call Product search's public `close()` boundary when Locator opens so
the two suggestion surfaces do not overlap. This does not clear the Product query, change Product
selection, or create a dependency from Locator to Product-search internals.

## Index provider contract

`sourceAwareProductSearchIndex.replaceProvider()` receives:

```js
{
  providerId,
  sourceId,
  sourceLabel,
  generation,
  layers,
  searchFields,
}
```

The registry declares runtime-source search capability and searchable normalized fields. The
compatibility AOI adapter publishes the committed Product-corrections layer through the same
contract without creating a permanent combined source.

The index reads source and layer metadata, not layer title or DOM state.

## Identity and results

Each entry retains:

- provider and source identity;
- stable Product key;
- representative layer identity as navigation metadata;
- display label;
- source operation generation;
- the current representative committed ArcGIS Graphic.

The serialized logical result ID is `[providerId, productKey]`. `layerId` is navigation metadata for
the current representative Graphic and is not part of Product identity. Multiple source-owned layers
that represent the same Product therefore produce one suggestion. Equal labels with different
Product keys remain separate, and the same Product key in different providers remains source-aware.

The representative navigation target is selected deterministically by stable layer ID. Within that
layer, candidates with an authoritative object ID rank before candidates without one. Object IDs are
then compared deterministically, and committed Graphic collection order is used only when no more
stable identity is available. Layer or Graphic ordering therefore cannot override an available object
ID or change the logical result ID. Refresh atomically replaces the representative Graphic while
preserving that ID, and `resolve()` always returns the current committed representation. Ambiguous
exact text requires an explicit suggestion selection rather than guessing.

## Atomic lifecycle

Provider replacement builds a complete new entry map and publishes it atomically. Refresh and
reactivation cannot append duplicate suggestions.

Provider removal deletes all results for that source. A temporary first-activation failure uses the
same runtime removal and generation tombstone because search has no persisted provider intent. A
stale activation or refresh therefore cannot publish Products after a newer failure, removal, or
replacement. Other providers remain unchanged.

Search suggestions update after activation, successful refresh, layer replacement, deactivation,
local reset, and global reset through the committed source lifecycle. A failed refresh keeps the last
successful committed provider entries. A failed first activation publishes no entries.

## Selection flow

Selecting a result resolves the exact current entry, navigates to its Graphic, updates the existing
selected-Graphic state, and opens the normal Product popup.

The flow reuses popup capability gating. Paper Charts and S-102 results therefore continue to expose
no Product Collection action or Product actions.

Search never activates a disabled source. If a suggestion becomes stale before selection, the UI
clears the stale result and reports that it is no longer available without throwing.

## Future extension

A later backend/database search provider may implement the same source-aware result identity and
selection boundary. FI-011B intentionally performs no Product catalog or backend search.
