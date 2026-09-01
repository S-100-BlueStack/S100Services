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
