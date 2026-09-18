# Product Review

Product Review is a workspace for comparing product-specific data that does not belong directly in main map feature attributes.

It currently supports:

- Multiple products in one Review page
- Workspace and per-product content toggles
- Product History cards
- Placeholder cards for IC-ENC reports
- Public validation diagnostic downloads for supported electronic Products
- Fixed content ordering and bounded content heights for comparison
- Opening new Review tabs from the Product Collection tray

The existing floating Product History panel is still the quick-view workflow for one selected product on the main map.

Product Review is the multi-product and multi-content workspace.

## Terminology

User-facing Review UI should use `Product` and `Products`, not `Dataset` or `Datasets`.

Code can keep technical identifiers such as `datasetName` where required by backend contracts or normalized product attributes, but labels, buttons, empty states and help text should use product terminology.

## Collection workflow

The Product Collection tray can open a new Review tab with the current collection. Review pages are intentionally independent once opened. Users can adjust the product list and content toggles directly on each Review page.

This keeps the workflow predictable and avoids hidden cross-tab synchronization. Future work can reintroduce live Review sessions if there is a clear need for it.

## Shared workspace Product picker

Review uses the same source-aware workspace catalog/resolver as Analyze:

```txt
src/features/products/services/workspaceProductService.js
```

The picker loads the lightweight `GET electronicproducts` dataset-name list. Review resolves only each
selected Product through `GET electronicproducts/{datasetName}/aoi`; the targeted response supplies the
authoritative `ProductSpecification` used to select the registry source. Review therefore does not load
the complete S57 and S101 AOI catalogs during workspace startup.

Workspace resolution is not tied to Main-map enabled-source localStorage and does not infer source from
dataset-name conventions. Backend identity conflicts, malformed targeted responses and unavailable
deployment-configured sources fail closed rather than falling through another source.

## FI-036 compact sidebar presentation

The route already identifies Product Review, so the sidebar omits the repeated visible workspace
eyebrow, title, and explanatory description while retaining an accessible `Product Review workspace
controls` landmark name. The shared Product picker keeps its accessible `Add product` name but suppresses
its normal visible label and instructional help for Review. Loading, catalog failure, invalid Product,
and already-selected Product messages remain visible when relevant.

Review explicitly opts the shared Product picker into its anchored results-overlay presentation. The
listbox is positioned relative to the picker control and overlays the `Products` section without
changing sidebar layout. Analyze and other picker consumers retain the default in-flow presentation.

The existing manual Refresh action is an icon-only native button in the `Products` header immediately
before the counter. Its event, accessible name, title, loading/disabled rules, and FI-022 full-refresh
lifecycle are unchanged. The sidebar retains the shared `pc-scrollbar` contract and does not change
Product composition, content toggles, targeted source resolution, automatic freshness, routing, or
independent content failures.

## FI-041 Product-list interaction preservation

Per-Product History, IC-ENC, and Validation toggles still update the authoritative Review state and
rerender the board and sidebar. Before that specific synchronous render, Review captures the Product
list's `scrollTop` plus the focused Product/content-type identity. The accepted replacement DOM restores
the scroll offset and focuses the corresponding toggle with `preventScroll` immediately after render.

The snapshot is passed only through the current content-toggle render call. It is not global, delayed,
or reused by add/remove, route replacement, manual Refresh, automatic freshness, or teardown, so an old
interaction cannot restore state into a newer Review composition or session.

## Content model

Review content types should stay dynamic.

The current frontend content types are:

1. History
2. IC-ENC reports
3. Internal validation reports

The ordering is fixed so product columns remain comparable even when individual products have different content toggles enabled.

## FI-038 content defaults and workspace controls

New Review Product state enables History, IC-ENC, and Internal validation by default. The compact
`Content` controls apply one content type at a time to every composed Product and expose native checked,
unchecked, or indeterminate state from the current per-Product selections. The controls are disabled
when the Review composition is empty.

Each content type also has a session-local workspace intent. It starts enabled and changes only when
the corresponding workspace control is used. A subsequently added Product inherits those three current
intent values; an individual Product override does not change them. Product visibility remains a
separate state and is never inferred from content selection.

Manual Refresh, FI-022 targeted freshness, and content payload replacement retain Product selection
and workspace intent. Adding or removing Products preserves surviving Product selections; only new
Products are initialized from workspace intent. Authoritative route/composition replacement starts a
new Review state and resets the intent to the all-enabled default. Bulk rerenders retain the Product-list
scroll offset and return focus to the initiating workspace control without delayed restoration or
`scrollIntoView()`.

## FI-037 content layout and states

History cards use their natural content height up to a viewport-aware `clamp(240px, 50dvh, 500px)`
maximum. History keeps the only intentional content-card scroller after that bound; short histories no
longer reserve a fixed-height region. IC-ENC and Internal validation bodies render at natural height,
and the Product-column content container owns vertical overflow for those cards.

Each content-card header remains the state discriminator: `Unavailable`, `Failed`, an empty count, or
an available content count. The body adds one concise message for states without content instead of a
second heading/message pair. IC-ENC remains unavailable without inventing a report contract. Validation
request failures retain their safe error text, and available diagnostic artifacts retain their download
links. These presentation rules do not add a loader or refresh lifecycle.

Future report cards should use the same pattern.

## Backend integration

Review reads Product History and validation artifact history independently. A failed History request
retains resolved Product context and successful diagnostics; failed artifacts do not discard History.
IC-ENC reports remain unavailable. Diagnostic download URLs use the configured API base.

Content loaders remain capability-gated. No unsupported source may call an electronic backend route.

## FI-011D source-aware Review content

Review uses the same workspace Product resolver/catalog as Analyze. S57/S101 Product History
loads through the existing history endpoint with explicit source permission. Paper Charts and S-102 resolve as real
workspace Products but History, IC-ENC reports, and Internal validation render declarative unavailable
states without compatibility backend requests. Per-Product load state distinguishes `loaded`,
`unavailable`, and `failed`, so mixed Review columns remain independent. Product removal invalidates its request ownership; disabling retains its session payload without rendering a column. Full-generation and record-ownership guards prevent stale publication. Main-map source visibility does not
control an already opened Review workspace.

## Public route

The canonical route is `/Review?Datasets=ProductA,ProductB`. See
[workspace routing](../../shared/routing/README.md) for the shared URL boundary, local picker
synchronization, and temporary legacy-path compatibility. Content toggles remain local state.

## FI-039 incremental reconciliation

Status: **Implemented; manual verification pending**.

`core/reviewProductSession.js` now owns the single authoritative Review data generation. The page
coordinator supplies the latest Product items and receives render snapshots; it has no separate full
or automatic-refresh publication counter. The catalog request counter remains scoped to picker data.
The existing FI-022 monitor owns revision observations only, not Review content publication.

Ordinary composition edits reconcile records by the normalized route/picker dataset-name alias. Once
FI-024 resolves that alias, payload storage uses `serializeProductIdentity(productContext)` (sourceId
and productKey). The targeted AOI response remains authoritative for ProductSpecification and registry
capabilities. No array-position identity, source-name branching, bulk AOI fallback, or cross-source
payload merge is introduced. Source changes discovered during a changed-Product reload replace only
that record. The baseline exposes metadata invalidation through the opaque FI-022 revision; no
additional metadata comparison or speculative reload contract is invented.

- Add creates records only for genuinely new Products. Multiple new loads run concurrently, each
  with one targeted AOI resolution and the existing independent History/artifact requests. Existing
  pending records are retained, so rapid additions cannot start another load for the same Product.
- Remove discards that record, its payload and revision bookkeeping. Remaining records preserve their
  payload references and current ordering. Late removed-record completions cannot publish.
- Disable hides the column but retains its payload and pending ownership. Re-enable reuses it; only
  an enabled record without a payload/request needs an initial load. The monitor retains disabled
  Products' revision baselines so a later observed change still refreshes them when enabled.
- Manual Refresh remains a full load of all currently enabled Products. It clears cached payloads,
  invalidates pending operations and primes a full revision baseline. Disabled Products retain their
  selection state but need a new payload on subsequent enable, matching the full-load boundary.
- Direct initial loading and authoritative route replacement create a full generation. Route replacement
  resets FI-038 intent/selections through the existing domain functions. Manual Refresh preserves them.
- FI-022 loads only changed enabled Products through the same session owner. Additional Products prime
  only their own lightweight revisions before payload loading, without resetting survivors' baselines.
  No polling loop is added. Concurrent revision checks and overlapping additional primes are coalesced.
  A changed-Product request already being loaded is declined for retry at the next normal check.
- Publication requires the current generation, the same retained record and that record's current
  operation. Checks run before requests start and after completion, including error/finally paths.
  Full replacement, remove/re-add and teardown therefore suppress stale data, errors and loading state.

FI-038 state still comes exclusively from `reviewProductList.js` and the page's workspace intent.
Payload reconciliation never reconstructs selections or updates workspace intent. FI-041 interaction
snapshots remain local to their original synchronous toggle render. Loaded columns stay present while
new columns show loading; the existing icon-only Refresh remains disabled during visible loading.
Independent Product/History/artifact failures and FI-037 content-state distinctions remain intact.

Behavior tests cover exact loader counts, independent failure, mixed content intent, ordering, enable/
disable, full Refresh, changed-only freshness, removal/re-add, overlapping refresh/add/remove, route
replacement, teardown and out-of-order completions using deferred promises. Page-event tests exercise
the actual coordinator with explicit browser/API test boundaries. See
[the implementation and manual verification record](../../../docs/fi-039-incremental-review.md).
