import { AOI_FIELD } from "../../aoi/config/aoiFieldConfig.js";

export function createAoiHoverController({ view, aoiLayer } = {}) {
  let pointerMoveHandle = null;
  let dragHandle = null;
  let abortController = null;
  let hoverHandle = null;
  let layerViewPromise = null;
  let hoveredFeatureId = "";
  let hoverRequestId = 0;
  let animationFrameId = 0;
  let isDestroyed = false;
  let previousCursor = "";

  function start() {
    if (!view || !aoiLayer) {
      return;
    }

    abortController = new AbortController();
    previousCursor = view.container?.style?.cursor ?? "";

    pointerMoveHandle = view.on("pointer-move", handlePointerMove);
    dragHandle = view.on("drag", clearHover);

    view.container?.addEventListener("pointerleave", clearHover, {
      signal: abortController.signal,
    });
  }

  function destroy() {
    isDestroyed = true;
    hoverRequestId += 1;

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }

    pointerMoveHandle?.remove();
    dragHandle?.remove();
    abortController?.abort();

    pointerMoveHandle = null;
    dragHandle = null;
    abortController = null;

    clearHover();
    setPointerCursor(false);
  }

  function handlePointerMove(event) {
    if (isDestroyed) {
      return;
    }

    const nextHoverRequestId = hoverRequestId + 1;
    hoverRequestId = nextHoverRequestId;

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }

    // Pointer events can fire very often; frame throttling keeps hit testing responsive without flooding the view.
    animationFrameId = requestAnimationFrame(() => {
      animationFrameId = 0;

      void updateHoverFromPointer({
        event,
        requestId: nextHoverRequestId,
      });
    });
  }

  async function updateHoverFromPointer({ event, requestId }) {
    if (isDestroyed || requestId !== hoverRequestId) {
      return;
    }

    try {
      const hitTestResult = await view.hitTest(event, {
        include: aoiLayer,
      });

      if (isDestroyed || requestId !== hoverRequestId) {
        return;
      }

      const graphic = getFirstAoiGraphic(hitTestResult);
      const featureId = getGraphicFeatureId(graphic);

      if (!graphic || !featureId) {
        clearHover();
        setPointerCursor(false);

        return;
      }

      setPointerCursor(true);

      if (featureId === hoveredFeatureId) {
        return;
      }

      const layerView = await getAoiLayerView();

      if (isDestroyed || requestId !== hoverRequestId) {
        return;
      }

      clearHoverHandle();

      hoveredFeatureId = featureId;
      hoverHandle = layerView.highlight(graphic);
    } catch {
      if (!isDestroyed && requestId === hoverRequestId) {
        clearHover();
        setPointerCursor(false);
      }
    }
  }

  function getFirstAoiGraphic(hitTestResult) {
    const results = hitTestResult?.results ?? [];

    for (const result of results) {
      const graphic = result.graphic;

      if (!graphic) {
        continue;
      }

      if (result.layer === aoiLayer || graphic.layer === aoiLayer) {
        return graphic;
      }
    }

    return null;
  }

  function getAoiLayerView() {
    if (!layerViewPromise) {
      layerViewPromise = view.whenLayerView(aoiLayer);
    }

    return layerViewPromise;
  }

  function clearHover() {
    hoverRequestId += 1;

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }

    clearHoverHandle();
    setPointerCursor(false);
  }

  function clearHoverHandle() {
    hoverHandle?.remove();
    hoverHandle = null;
    hoveredFeatureId = "";
  }

  function setPointerCursor(isHoveringAoi) {
    if (!view?.container?.style) {
      return;
    }

    view.container.style.cursor = isHoveringAoi ? "pointer" : previousCursor;
  }

  start();

  return {
    destroy,
    clearHover,
  };
}

function getGraphicFeatureId(graphic) {
  const attributes = graphic?.attributes ?? {};

  return (
    normalizeOptionalString(attributes[AOI_FIELD.OBJECT_ID]) ||
    normalizeOptionalString(attributes[AOI_FIELD.GLOBAL_ID]) ||
    normalizeOptionalString(graphic?.uid)
  );
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
