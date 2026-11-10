# Shared UI lifecycle helpers

## Navbar popover coordinator

`navbarPopoverCoordinator.js` coordinates overlapping popovers opened from the Main map navbar.
Participants register a stable ID and lifecycle callbacks for open, close, state, trigger containment,
panel containment, and focus restoration.

The public contract supports:

```js
coordinator.open("filters");
coordinator.open("data-sources");
coordinator.close("filters");
coordinator.closeAll();
```

`toggle()` is used by active toolbar buttons. Opening a participant closes the previous participant
before opening the next one. Feature modules do not import each other.

The coordinator installs one document click listener and one document keydown listener when started.
Repeated openings do not add listeners. Outside click and Escape close only the active registered
popover. The participant restores focus to the correct trigger after keyboard or toggle closure.

Only intentionally registered navbar popovers participate. On Main Map, Filters, Data sources,
and Preferences share mutual exclusion and Escape/outside-click ownership; Preferences registers
with the already created coordinator when Main-map context becomes available. On Analyze, Review,
and Dashboard it retains its independent panel lifecycle. Product search, Product History,
popup action menus, and other independent panels keep their existing close priorities.

## Shared scrollbar contract

Add `pc-scrollbar` to an application-owned element that already owns overflow. The neutral class
provides the compact Product Catalogue scrollbar colors and dimensions in light and dark mode without
changing overflow, sizing, wheel, touch, or keyboard behavior. It must not be applied to private
Calcite or ArcGIS shadow-DOM internals.

Analyze uses the contract for its outer sidebar content scroller and bounded Product list. Existing
Review scroll surfaces use the same class, preserving their established appearance. The Main-map
Filter panel uses it for its outer scroller and nested checkbox option lists without depending on
Analyze or Review selectors.
