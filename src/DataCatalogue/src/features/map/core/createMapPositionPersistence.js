import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";

export function createMapPositionPersistence({ view, slot, preferences }) {
  if (!preferences) return () => {};
  let alive = true;
  let watcher = null;
  let initialized = false;
  const unsubscribe = preferences.subscribe((snapshot) => {
    if (snapshot.rememberMapPosition) remember();
  });

  function remember() {
    if (!alive || !initialized || !view.ready || !view.stationary) return;
    const longitude = view.center?.longitude;
    const latitude = view.center?.latitude;
    const zoom = view.zoom;
    if (![longitude, latitude, zoom].every(Number.isFinite)) return;
    preferences.saveMapPosition(slot, { center: [longitude, latitude], zoom });
  }

  void view
    .when()
    .then(async () => {
      if (!alive) return;
      const saved = preferences.readMapPosition(slot);
      if (saved) {
        try {
          await view.goTo(saved, { animate: false });
        } catch {
          // A user navigation or component disposal may supersede position restore.
        }
      }
      if (!alive) return;
      initialized = true;
      watcher = reactiveUtils.watch(
        () => [view.stationary, view.center?.longitude, view.center?.latitude, view.zoom],
        ([stationary]) => {
          if (stationary) remember();
        }
      );
    })
    .catch(() => {
      // An unavailable map must not block the rest of the workflow.
    });

  return () => {
    alive = false;
    watcher?.remove();
    unsubscribe();
  };
}
