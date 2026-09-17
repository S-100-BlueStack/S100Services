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

Only intentionally registered navbar popovers participate. Product search, Preferences, Product
History, popup action menus, and other independent panels keep their existing close priorities and
are not closed automatically.

## Shared scrollbar contract

Add `pc-scrollbar` to an application-owned element that already owns overflow. The neutral class
provides the compact Product Catalogue scrollbar colors and dimensions in light and dark mode without
changing overflow, sizing, wheel, touch, or keyboard behavior. It must not be applied to private
Calcite or ArcGIS shadow-DOM internals.

Analyze uses the contract for its outer sidebar content scroller and bounded Product list. Existing
Review scroll surfaces use the same class, preserving their established appearance. Future features,
including the separately scoped Filter-panel work, can consume the class without depending on Analyze
or Review selectors.
