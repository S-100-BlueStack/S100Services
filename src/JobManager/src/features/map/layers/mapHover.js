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
  let mouseWheelHandle = null;
  let abortController = null;
  let hoverHandle = null;
  let activeHoverKey = "";
  let pointerEvent = null;
  let frameRequested = false;
  let hoverRequestId = 0;
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
    mouseWheelHandle = view.on("mouse-wheel", clearHover);

    view.container?.addEventListener("pointerleave", handlePointerExit, {
      signal: abortController.signal,
    });
    view.container?.addEventListener("pointerout", handlePointerExit, {
      signal: abortController.signal,
    });
    view.container?.addEventListener("mouseleave", handlePointerExit, {
      signal: abortController.signal,
    });

    window.addEventListener("blur", clearHover, {
      signal: abortController.signal,
    });
    document.addEventListener("visibilitychange", handleVisibilityChange, {
      signal: abortController.signal,
    });
  }

  function destroy() {
    isDestroyed = true;
    hoverRequestId += 1;
    pointerEvent = null;
    frameRequested = false;

    pointerMoveHandle?.remove();
    dragHandle?.remove();
    immediateClickHandle?.remove();
    mouseWheelHandle?.remove();
    abortController?.abort();

    pointerMoveHandle = null;
    dragHandle = null;
    immediateClickHandle = null;
    mouseWheelHandle = null;
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

    const hitTestEvent = pointerEvent;
    const requestId = hoverRequestId + 1;
    hoverRequestId = requestId;

    if (isDestroyed || !hitTestEvent || hoverLayers.length === 0) {
      return;
    }

    try {
      const hitTestResult = await view.hitTest(hitTestEvent, {
        include: hoverLayers,
      });

      if (isDestroyed || requestId !== hoverRequestId || hitTestEvent !== pointerEvent) {
        return;
      }

      const hoverTarget = getHoverTarget(hitTestResult);

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
      if (!isDestroyed && requestId === hoverRequestId) {
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
    if (!layer?.id || layerViews.has(layer) || layerViewPromises.has(layer)) {
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

  function handlePointerExit(event) {
    const nextTarget = event.relatedTarget;

    if (nextTarget && view.container?.contains(nextTarget)) {
      return;
    }

    clearHover();
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== "visible") {
      clearHover();
    }
  }

  function clearHover() {
    hoverRequestId += 1;
    pointerEvent = null;
    frameRequested = false;
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
  ];
}

function getJobHoverLayers(jobLayers) {
  return [
    jobLayers?.pointLayer,
    jobLayers?.polygonLayer,
    ...Object.values(jobLayers?.priorityPointLayers ?? {}),
  ].filter(Boolean);
}

function createHoverKey({ graphic, layer, targetType }) {
  const attributes = graphic?.attributes ?? {};

  if (targetType === HOVER_TARGET_TYPE.JOB) {
    return createTypedHoverKey({
      targetType,
      layer,
      id: attributes[JOB_LAYER_FIELD.JOB_ID],
    });
  }

  if (targetType === HOVER_TARGET_TYPE.AOI) {
    return createTypedHoverKey({
      targetType,
      layer,
      id:
        attributes[AOI_FIELD.GLOBAL_ID] ??
        attributes[AOI_FIELD.PRODUCT_ID] ??
        attributes[AOI_FIELD.OBJECT_ID],
    });
  }

  return "";
}

function createTypedHoverKey({ targetType, layer, id }) {
  const normalizedId = normalizeOptionalString(id);

  if (!normalizedId) {
    return "";
  }

  return `${targetType}:${layer.id}:${normalizedId}`;
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
