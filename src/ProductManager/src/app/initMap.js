import { loadAppData } from "../features/data/services/dataLoader.js";
import { createRefreshService } from "../features/data/services/refreshService.js";
import { noticeError, noticeSuccess } from "../features/notices/services/noticeService.js";
import { createMap } from "../features/map/core/createMap.js";
import { createView } from "../features/map/core/createView.js";
import { createLayer } from "../features/map/core/layerFactory.js";
import { createHoverManager } from "../features/map/interactions/hoverManager.js";

function updateLastUpdated() {
  const el = document.getElementById("last-updated");
  if (!el) return;

  const now = new Date();

  el.textContent =
    "Updated: " +
    now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
}

export function initMap() {
  const map = createMap();
  const view = createView(map);
  const hoverManager = createHoverManager(view);

  window.hoverManager = hoverManager;

  const refreshService = createRefreshService({
    map,
    view,
    hoverManager,
    loadAppData,
    addLayer: createLayer,
    onRefreshSuccess: () => {
      updateLastUpdated();
      noticeSuccess("Data refreshed", null, { countAsUnread: false });
    },
    onRefreshError: (error) => {
      noticeError("Refresh failed", error.message);
    },
  });

  return {
    map,
    view,
    hoverManager,
    refreshService,
    updateLastUpdated,
  };
}
