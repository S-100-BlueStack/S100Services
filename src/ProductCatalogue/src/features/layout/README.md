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
