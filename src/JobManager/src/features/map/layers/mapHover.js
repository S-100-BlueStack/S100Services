import { AOI_FIELD } from "../../aoi/config/aoiFieldConfig.js";
import { JOB_LAYER_FIELD } from "./jobLayerFeatureData.js";

const HOVER_TARGET_TYPE = Object.freeze({
  AOI: "aoi",
  JOB: "job",
});

export function createMapHoverController({ view, aoiLayer, jobLayers } = {}) {
  const hoverLayerConfigs = createHoverLayerConfigs({ aoiLayer, jobLayers });
  const hoverLayerConfigById = new Map(
    hoverLayerConfigs.map((layerConfig) => [layerConfig.layer.id, layerConfig])
  );
  const layerViewPromiseById = new Map();

  let pointerMoveHandle = null;
  let dragHandle = null;
  let immediateClickHandle = null;
  let abortController = null;
  let hoverHandle = null;
  let activeHoverKey = "";
  let hoverRequestId = 0;
  let isDestroyed = false;

  function start() {
    if (!view || hoverLayerConfigs.length === 0) {
      return;
    }

    abortController = new AbortController();

    warmLayerViews();

    pointerMoveHandle = view.on("pointer-move", handlePointerMove);
    dragHandle = view.on("drag", clearHover);
    immediateClickHandle = view.on("immediate-click", clearHover);

    view.container?.addEventListener("pointerleave", clearHover, {
      signal: abortController.signal,
    });
  }

  function destroy() {
    isDestroyed = true;
    hoverRequestId += 1;

    pointerMoveHandle?.remove();
    dragHandle?.remove();
    immediateClickHandle?.remove();
    abortController?.abort();

    pointerMoveHandle = null;
    dragHandle = null;
    immediateClickHandle = null;
    abortController = null;

    clearHoverHandle();
  }

  function handlePointerMove(event) {
    const requestId = hoverRequestId + 1;
    hoverRequestId = requestId;

    void updateHoverFromPointer({
      event,
      requestId,
    });
  }

  async function updateHoverFromPointer({ event, requestId }) {
    if (isDestroyed || requestId !== hoverRequestId) {
      return;
    }

    try {
      const hitTestResult = await view.hitTest(event);
      const hoverTarget = getFirstHoverTarget(hitTestResult);

      if (isDestroyed || requestId !== hoverRequestId) {
        return;
      }

      if (!hoverTarget) {
        clearHoverHandle();

        return;
      }

      if (hoverTarget.key === activeHoverKey) {
        return;
      }

      const layerView = await getLayerView(hoverTarget.layer);

      if (isDestroyed || requestId !== hoverRequestId) {
        return;
      }

      clearHoverHandle();

      activeHoverKey = hoverTarget.key;
      hoverHandle = layerView.highlight(hoverTarget.graphic);
    } catch {
      if (!isDestroyed && requestId === hoverRequestId) {
        clearHoverHandle();
      }
    }
  }

  function getFirstHoverTarget(hitTestResult) {
    const results = hitTestResult?.results ?? [];

    for (const result of results) {
      const graphic = result.graphic;

      if (!graphic) {
        continue;
      }

      const layer = result.layer ?? graphic.layer;
      const layerConfig = hoverLayerConfigById.get(layer?.id);

      if (!layerConfig) {
        continue;
      }

      const key = createHoverKey({
        graphic,
        layer: layerConfig.layer,
        targetType: layerConfig.targetType,
      });

      if (!key) {
        continue;
      }

      return {
        key,
        graphic,
        layer: layerConfig.layer,
        targetType: layerConfig.targetType,
      };
    }

    return null;
  }

  function getLayerView(layer) {
    const layerId = layer?.id;

    if (!layerId) {
      return Promise.reject(new Error("Hover layer is missing an id."));
    }

    if (!layerViewPromiseById.has(layerId)) {
      layerViewPromiseById.set(layerId, view.whenLayerView(layer));
    }

    return layerViewPromiseById.get(layerId);
  }

  function warmLayerViews() {
    for (const layerConfig of hoverLayerConfigs) {
      void getLayerView(layerConfig.layer).catch(() => {
        layerViewPromiseById.delete(layerConfig.layer.id);
      });
    }
  }

  function clearHover() {
    hoverRequestId += 1;
    clearHoverHandle();
  }

  function clearHoverHandle() {
    hoverHandle?.remove();
    hoverHandle = null;
    activeHoverKey = "";
  }

  start();

  return {
    destroy,
    clearHover,
  };
}

function createHoverLayerConfigs({ aoiLayer, jobLayers } = {}) {
  return [
    ...getJobHoverLayers(jobLayers).map((layer) => ({
      layer,
      targetType: HOVER_TARGET_TYPE.JOB,
    })),
    ...(aoiLayer
      ? [
          {
            layer: aoiLayer,
            targetType: HOVER_TARGET_TYPE.AOI,
          },
        ]
      : []),
  ].filter((layerConfig) => Boolean(layerConfig.layer?.id));
}

function getJobHoverLayers(jobLayers) {
  return normalizeArray(jobLayers?.layers).filter(Boolean);
}

function createHoverKey({ graphic, layer, targetType }) {
  if (targetType === HOVER_TARGET_TYPE.JOB) {
    return createTypedHoverKey({
      type: targetType,
      layer,
      id:
        normalizeOptionalString(graphic?.attributes?.[JOB_LAYER_FIELD.OBJECT_ID]) ||
        normalizeOptionalString(graphic?.attributes?.[JOB_LAYER_FIELD.JOB_ID]) ||
        normalizeOptionalString(graphic?.uid),
    });
  }

  if (targetType === HOVER_TARGET_TYPE.AOI) {
    return createTypedHoverKey({
      type: targetType,
      layer,
      id:
        normalizeOptionalString(graphic?.attributes?.[AOI_FIELD.OBJECT_ID]) ||
        normalizeOptionalString(graphic?.attributes?.[AOI_FIELD.GLOBAL_ID]) ||
        normalizeOptionalString(graphic?.uid),
    });
  }

  return "";
}

function createTypedHoverKey({ type, layer, id }) {
  const normalizedId = normalizeOptionalString(id);

  if (!normalizedId) {
    return "";
  }

  return `${type}:${layer.id}:${normalizedId}`;
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value;
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
