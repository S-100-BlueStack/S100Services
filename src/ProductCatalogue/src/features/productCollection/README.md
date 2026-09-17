# Product Collection

FI-011D makes Product Collection source-aware while keeping it session-only, in-memory state.

Each item stores:

```js
{
  id,
  sourceId,
  sourceLabel,
  productKey,
  datasetName,
  productType,
  addedAt,
}
```

`id` is the deterministic serialized `[sourceId, productKey]` Product identity. Registry-backed
Products therefore cannot collide across sources. The compatibility adapter preserves the historical
case-insensitive dataset-name behavior for transitional string callers, but ProductContext objects are
the primary mutation contract. `snapshot.datasetNames` remains the stable route projection used by
Analyze/Review. No persistence is introduced.

Authoritative Main-map source deactivation removes only Collection items owned by that source. A
successful guarded activation/refresh reconciles existing items against the committed source Product
set and prunes stale references; it never auto-adds Products. Failed activation, failed refresh, and
filter changes do not remove Collection state. Workspace windows are independent after opening.

Main-map Collection actions resolve their canonical Analyze/Review URL before opening a new tab. The
shared workspace navigation policy uses the actual `window.open` result: an accepted open leaves the
Collection unchanged and emits no blocked-popup notice, while a null or failed open reports the
existing notice without retrying or falling back to same-tab navigation.

## FI-032 manual acceptance

FI-032 was manually accepted in the browser on 2026-09-17 and committed at `11491d15272b165b63da58dece83cb0c0776077b`. Main-map Product Collection Analyze/Review actions open the canonical workspace URL in a new tab, keep the Collection and Main-map state intact, and emit the blocked-popup notice only when the browser open actually fails. Successful action-based launches detach `window.opener`; workspace-to-workspace navigation remains same-tab through the shared navigation policy. The local frontend check passed and formatting was run before commit.
