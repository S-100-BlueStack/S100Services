# Shared navbar primary navigation

The four primary route links in `public/components/navbar.html` use native HTML
`<a>` elements. The accepted `calcite-link` experiment in candidate v3 was
reverted because its native inline anchor could not provide a full-height
clickable area and the separate application underline through public Calcite
styling. Artifact/download links in Analyze and Review still use Calcite Link.

- Keep the `data-nav-*` attributes and the existing URL-building/navigation
  policy. Main Map opens Dashboard/Analyze/Review in new tabs; workspace routes
  navigate in the same tab, preserving `target` and `rel` behavior.
- `navbarRouteState.js` sets `aria-current="page"` on exactly one route.
  The active link has a fixed white 3px indicator at the navbar's bottom edge.
- Other links animate the same white indicator from left to right on hover or
  keyboard focus. The entire link height is clickable, not just the text; the
  native pointer cursor, Enter activation, keyboard focus and visited link
  contrast all remain available. Respect `prefers-reduced-motion`.
- Descriptive route labels do not show duplicate application hover tooltips.
  The shared help system still owns tooltips for icon-only actions and other
  controls; framework map controls remain untouched.
- Keep focus outlines visible. Do not manipulate Calcite shadow DOM or replace
  standard anchor navigation with custom click handlers.

For manual verification, hover the top, text and bottom of each link in both
application themes. Check pointer and click across the full 50px navbar height,
animated hover/focus versus solid current-route indicator, reduced-motion
behavior, Tab/Enter navigation, and Main Map new-tab links.

## Narrow-screen route layout

At widths up to 820 px, Dashboard, Analyze and Review use a two-row shared
navbar: the four native route links remain keyboard-accessible in a horizontally
scrollable first row, while the right-hand controls wrap onto the second row.
This does not change the desktop full-height links and 3 px indicators. Main Map
continues to use its dedicated `has-main-map-search` responsive layout, including
the Product search and Locator.

Verify Preferences and Notifications remain reachable at 320, 390, 500, 650
and 820 px, that keyboard focus scrolls clipped navigation links into view,
and that Main Map and desktop navbar behavior stay unchanged.
