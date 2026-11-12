# Source-aware Main map Product search

Main map Product search indexes only Product graphics currently committed in active frontend
providers.

This workflow remains separate from Locator/FI-012 and from backend or connected-data search.

## Shared Main-map search controls

R03B replaces the old permanently visible Product input and expanding inline Locator with two
icon-only navbar actions: Product search (`search`) and Locator (`pin-tear`). Both controls mount
before Filters, use the same Calcite action styling as the other navbar actions, and expose accessible
names and application tooltips. A selected action opens a small, square-edged search surface below
the navbar. The controls are deliberately optimized for desktop; neither the navbar nor its width
changes when a search opens.

`mainMapSearchControls.js` owns only the shared layout and popover registration. The existing
`navbarPopoverCoordinator` enforces mutual exclusion with each other and with Filters, Sources and
Preferences. A Search action reopens its last query where relevant; Locator still creates and retires
a fresh ArcGIS Search session per open. Escape returns focus to the owning action. Outside clicks close
the search and retire any pending Product navigation or Locator session, so stale work cannot act on
the map. Repositioning uses the navbar's public bounding rectangle on resize/scroll rather than
private ArcGIS or Calcite layout internals. Onboarding highlights the two action buttons.

The Product search index, source-aware identity, filter gating, selected-Product popup and request
generations remain owned by `mainMapProductSearch.js`. Locator retains its independent geographic
provider and MapView navigation lifecycle. The common layout never dispatches search requests.

The earlier FI-027 permanently visible Product search was accepted at
`a0fde73c58a554c58028c2220399e3ae1691121b` and its Locator contrast fix at
`c4b0f7e1108b40b2cb4f4b40f0ac95e2280d906c`. R03B deliberately supersedes **only the
presentation and opening behavior**, not those workflows' source and navigation contracts.

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

REG-01 filter visibility: the source-aware index still covers committed Products from
active providers, even when a map attribute filter hides their representative Graphic.
Filtered matching Products are omitted from the selectable suggestions. The dropdown
shows a subtle count of `N filtered out` below the visible results; the count includes
all matching hidden Products, not only the first ten results. The visible-result limit
is applied after filtering, and an entirely hidden match set displays a clear empty
state. A typed exact name that is filtered out receives a warning to adjust the map
filters rather than opening an empty popup. Filter changes update open suggestions
and the count without clearing the input; selection also revalidates visibility after
asynchronous map navigation and immediately before popup publication. This is map-filter gating, not source activation or backend
mutation permission. Display-scale visibility continues to be owned by the map.

Selecting a result resolves the exact current entry, navigates to its Graphic, updates the existing
selected-Graphic state, and opens the normal Product popup.

The flow reuses popup capability gating. Paper Charts and S-102 results therefore continue to expose
no Product Collection action or Product actions.

Search never activates a disabled source. If a suggestion becomes stale before selection, the UI
clears the stale result and reports that it is no longer available without throwing.

Search navigation uses a per-selection generation. After navigation, animation-frame waiting,
and any committed Graphic replacement navigation, the controller revalidates the latest selection
and currently resolved source-aware Graphic before opening the popup. Newer Product choices,
query edits, explicit selection clearing, index removal, map click/direct keyboard selection,
Locator opening and search teardown retire pending navigation. Merely closing suggestions keeps
the existing query and does not cancel a previously accepted Product choice. Aborted or failed
navigation never opens a late popup; a valid same-identity Graphic replacement can still open.

## Future extension

A later backend/database search provider may implement the same source-aware result identity and
selection boundary. FI-011B intentionally performs no Product catalog or backend search.
