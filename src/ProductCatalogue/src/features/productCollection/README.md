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
  navigationCapabilities, // Immutable Analyze/Review permissions from ProductContext.
  addedAt,
}
```

`id` is the deterministic serialized `[sourceId, productKey]` Product identity. Registry-backed
Products therefore cannot collide across sources. The compatibility adapter preserves the historical
case-insensitive dataset-name behavior for transitional string callers, but ProductContext objects are
the primary mutation contract. `snapshot.datasetNames` remains a data projection, not authorization
for navigation. No persistence is introduced. Only the `analyze` and `review` booleans are copied from
ProductContext capabilities; absent permissions fail closed. Legacy compatibility string callers
retain both permissions. Full contexts, Graphics and package member lists are not stored.

Authoritative Main-map source deactivation removes only Collection items owned by that source. A
successful guarded activation/refresh reconciles existing items against the committed source Product
set and prunes stale references; it never auto-adds Products. Failed activation, failed refresh, and
filter changes do not remove Collection state. Workspace windows are independent after opening.

Main-map Collection actions require every current item to explicitly permit the destination before
resolving a canonical Analyze/Review URL. Unsupported actions remain visible and disabled with truthful
help text. A mixed collection is blocked as a whole; no supported subset is silently launched.
Dispatch re-reads current state, protecting against stale enabled callbacks. Package work units can
navigate to Analyze/Review when the registry and authoritative Product context grant those
capabilities (including the accepted package-aware workspaces). Unsupported or mixed collections
remain blocked; this policy consumes permissions, not source names, labels or an inferred member
identity. Direct product-based workspace routes are unchanged.

For supported collections, the
shared workspace navigation policy uses the actual `window.open` result: an accepted open leaves the
Collection unchanged and emits no blocked-popup notice, while a null or failed open reports the
existing notice without retrying or falling back to same-tab navigation.

## FI-032 manual acceptance

FI-032 was manually accepted in the browser on 2026-09-17 and committed at `11491d15272b165b63da58dece83cb0c0776077b`. Main-map Product Collection Analyze/Review actions open the canonical workspace URL in a new tab, keep the Collection and Main-map state intact, and emit the blocked-popup notice only when the browser open actually fails. Successful action-based launches detach `window.opener`; workspace-to-workspace navigation remains same-tab through the shared navigation policy. The local frontend check passed and formatting was run before commit.

## DSA-07 focus behavior

The Main-map Collection tray retains keyboard focus across synchronous store
publications using the focused control's semantic identity, not the previous DOM
node. A surviving Remove control is resolved by source-aware item ID, while a
removed row transfers focus to an adjacent Remove control. Review/Analyze focus
is retained only if the current collection still permits the destination;
otherwise focus moves to the visible Clear control.

When the final item disappears, focus leaves the hidden tray. The Main map
prefers the visible popup Collection control, then the map surface as a
neutral fallback. Product search is not focused, so its suggestions do not
open. External inputs and panels keep their focus when Collection state
changes in the background. Restoration is
synchronous and does not change Collection identity, authorization, actions,
navigation or source-reconciliation behavior.
