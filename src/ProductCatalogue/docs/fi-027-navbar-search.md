# FI-027 – Main-map navbar search (v1 candidate)

## Scope

The shared Main-map search host is mounted at the beginning of `#header .header-right`, before
Filters and Data sources. The Product search field remains visible. Locator remains an independent
click-to-expand ArcGIS Search field alongside Product search. The existing navbar routes, refresh,
notifications, Preferences, Product/Locator search services and backend contracts are unchanged.

At widths up to 1150px, the Main-map navbar wraps its action controls onto a second row; at widths
up to 650px, Product search occupies a full-width row before the compact actions. Other routes do
not mount the Main-map search host or receive its responsive layout class.

Product/Locator opening closes active Filters/Data sources popovers without restoring focus. The
existing Locator `onOpen`, `close`, `destroy`, Search-session generation and Escape handling remain
authoritative. Product search retains its input, suggestions, index, navigation and popup state.

## Manual browser verification

1. Check Main-map navbar at 1920px, 1440px, 1280px, 1150px, 768px, 650px and 390px. Verify
   both searches and all navbar actions remain visible, reachable and do not overlap or clip.
2. Verify Product suggestions, exact-match Enter, source-ambiguous labels, Product popup opening,
   keyboard result navigation, Escape, and preservation of selected Product on refresh.
3. Open Locator from its action, search Denmark and Greenland addresses, select with keyboard or
   pointer, verify map navigation without Product popup, markers or Product selection changes.
4. Close Locator by its action, Escape, outside pointer and focus-out; rapidly open/close/reopen,
   including while suggestions are loading. Confirm no stale map navigation or orphaned field.
5. Open Filters/Data sources then focus Product search or open Locator. Verify the earlier
   popover closes, focus remains in the requested search, and reopening the popover closes Locator.
6. Verify Main-map onboarding targets, product-search/Locator tooltips, keyboard-only interactions,
   dark/light mode, and reduced-motion behavior.
7. Verify Dashboard, Analyze and Review navbar, focus, controls and navigation remain unchanged.

## Verification boundary

This candidate is based on Git commit `0cab4e4f08a88717c25794a85fb691e8d64a7fbd`, with no
relevant uncommitted files according to its input manifest. Browser acceptance and the local
`npm run check` are required before marking FI-027 Done. The optional later version with two
icon-only search triggers is not part of this candidate.
