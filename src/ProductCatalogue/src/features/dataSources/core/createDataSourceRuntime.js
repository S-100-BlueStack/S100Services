import { noticeError } from "../../notices/services/noticeService.js";
import { createDataSourceRegistry } from "../config/dataSourceRegistry.js";
import { createDataSourcePersistence } from "../domain/dataSourcePersistence.js";
import { createDataSourceMapAdapter } from "../map/dataSourceMapAdapter.js";
import { createDataSourceController } from "../services/dataSourceController.js";
import { createDataSourceLifecycle } from "../services/dataSourceLifecycle.js";
import { createDataSourceLoader } from "../services/dataSourceLoader.js";
import { normalizeDataSourcePayload } from "../services/dataSourceNormalizer.js";
import { initDataSourcePanel } from "../ui/dataSourcePanel.js";

export function createDataSourceRuntime({
  map,
  view,
  hoverManager,
  createLayer,
  onLayersChanged,
} = {}) {
  const registry = createDataSourceRegistry();
  const persistence = createDataSourcePersistence();
  const lifecycle = createDataSourceLifecycle();
  const mapAdapter = createDataSourceMapAdapter({
    map,
    hoverManager,
    createLayer,
  });
  const controller = createDataSourceController({
    registry,
    persistence,
    loadSource: createDataSourceLoader(),
    normalizeSource: normalizeDataSourcePayload,
    mapAdapter,
    lifecycle,
    noticeError,
    onLayersChanged,
  });
  const unsubscribeInteractionCleanup = lifecycle.subscribe("deactivating", ({ sourceId }) => {
    clearSourceInteractionState({
      sourceId,
      view,
      hoverManager,
    });
  });
  const panel = initDataSourcePanel({
    registry,
    controller,
  });

  return {
    registry,
    persistence,
    lifecycle,
    mapAdapter,
    controller,
    panel,
    destroy() {
      unsubscribeInteractionCleanup();
      panel.destroy();
      controller.destroy();
      lifecycle.clear();
    },
  };
}

function clearSourceInteractionState({ sourceId, view, hoverManager }) {
  const selectedGraphic = view?.popup?.selectedFeature;
  const selectedSourceId =
    selectedGraphic?.attributes?.sourceId ?? selectedGraphic?.layer?.appSourceId ?? null;

  if (selectedSourceId === sourceId) {
    view.popup.close();
  }

  if (hoverManager?.getLockedSourceId?.() === sourceId) {
    hoverManager.clearLockedFeature?.();
  }

  hoverManager?.clearSource?.(sourceId);
}
