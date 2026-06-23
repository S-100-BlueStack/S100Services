import { AOI_FIELD } from "../../aoi/config/aoiFieldConfig.js";
import { JOB_LAYER_FIELD } from "./jobLayerFeatureData.js";

const HOVER_TARGET_TYPE = Object.freeze({
  AOI: "aoi",
  JOB: "job",
});

export function createMapHoverController({ view, aoiLayer, jobLayers } = {}) {
  const hoverLayerConfigs = createHoverLayerConfigs({ aoiLayer, jobLayers });
  const hoverLayers = hoverLayerConfigs.map((layerConfig) => layerConfig.layer);
  const hoverLayerConfigById = new Map(
    hoverLayerConfigs.map((layerConfig) => [layerConfig.layer.id, layerConfig])
  );
  const layerViews = new Map();
  const layerViewPromises = new Map();

  let pointerMoveHandle = null;
  let dragHandle = null;
  let immediateClickHandle = null;
  let abortController = null;
  let hoverHandle = null;
  let activeHoverKey = "";
  let pointerEvent = null;
  let frameRequested = false;
  let isDestroyed = false;

  function start() {
    if (!view || hoverLayers.length === 0) {
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
    pointerEvent = null;
    frameRequested = false;

    pointerMoveHandle?.remove();
    dragHandle?.remove();
    immediateClickHandle?.remove();
    abortController?.abort();

    pointerMoveHandle = null;
    dragHandle = null;
    immediateClickHandle = null;
    abortController = null;

    clearHoverHandle();
    layerViews.clear();
    layerViewPromises.clear();
  }

  function handlePointerMove(event) {
    pointerEvent = event;

    if (!frameRequested) {
      frameRequested = true;
      requestAnimationFrame(runHitTest);
    }
  }

  async function runHitTest() {
    frameRequested = false;

    if (isDestroyed || !pointerEvent || hoverLayers.length === 0) {
      return;
    }

    try {
      const hitTestResult = await view.hitTest(pointerEvent, {
        include: hoverLayers,
      });
      const hoverTarget = getHoverTarget(hitTestResult);

      if (isDestroyed) {
        return;
      }

      if (!hoverTarget) {
        clearHoverHandle();
        return;
      }

      if (hoverTarget.key === activeHoverKey) {
        return;
      }

      const layerView = layerViews.get(hoverTarget.layer);

      if (!layerView) {
        clearHoverHandle();
        warmLayerView(hoverTarget.layer);
        return;
      }

      clearHoverHandle();

      activeHoverKey = hoverTarget.key;
      hoverHandle = layerView.highlight(hoverTarget.graphic);
    } catch {
      if (!isDestroyed) {
        clearHoverHandle();
      }
    }
  }

  function getHoverTarget(hitTestResult) {
    const jobTarget = getFirstHoverTargetByType(hitTestResult, HOVER_TARGET_TYPE.JOB);

    if (jobTarget) {
      return jobTarget;
    }

    return getFirstHoverTargetByType(hitTestResult, HOVER_TARGET_TYPE.AOI);
  }

  function getFirstHoverTargetByType(hitTestResult, targetType) {
    const results = hitTestResult?.results ?? [];

    for (const result of results) {
      const graphic = result.graphic;

      if (!graphic) {
        continue;
      }

      const layer = result.layer ?? graphic.layer;
      const layerConfig = hoverLayerConfigById.get(layer?.id);

      if (!layerConfig || layerConfig.targetType !== targetType) {
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

  function warmLayerViews() {
    for (const layer of hoverLayers) {
      warmLayerView(layer);
    }
  }

  function warmLayerView(layer) {
    if (!layer || layerViews.has(layer) || layerViewPromises.has(layer)) {
      return;
    }

    const layerViewPromise = view
      .whenLayerView(layer)
      .then((layerView) => {
        if (!isDestroyed) {
          layerViews.set(layer, layerView);
        }

        return layerView;
      })
      .catch((error) => {
        layerViewPromises.delete(layer);
        throw error;
      });

    layerViewPromises.set(layer, layerViewPromise);
  }

  function clearHover() {
    pointerEvent = null;
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
