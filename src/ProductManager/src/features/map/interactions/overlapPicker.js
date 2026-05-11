import { getAllLayers } from "../core/layerRegistry.js";
import { resetPopupActions, clearPopupActions } from "../popups/popupActionsConfig.js";
import { statusColorConfig } from "../../../shared/config/colorsConfig.js";

let activeClickHandle = null;

export function bindOverlapPicker(view) {
  if (activeClickHandle) {
    activeClickHandle.remove();
    activeClickHandle = null;
  }

  // We need full control over feature clicks because the default popup only
  // opens one selected feature, which is not enough when features overlap.
  view.popupEnabled = false;

  activeClickHandle = view.on("click", async (event) => {
    const interactiveLayers = getInteractiveLayers();

    if (interactiveLayers.length === 0) {
      closePopup(view);
      return;
    }

    const response = await view.hitTest(event, {
      include: interactiveLayers,
    });

    const graphics = getUniqueGraphics(response.results);

    if (graphics.length === 0) {
      closePopup(view);
      return;
    }

    if (graphics.length === 1) {
      openGraphicPopup(view, {
        graphic: graphics[0],
        location: event.mapPoint,
      });

      return;
    }

    openOverlapPickerPopup(view, {
      graphics,
      location: event.mapPoint,
    });
  });
}

function getInteractiveLayers() {
  return getAllLayers().filter(
    (layer) =>
      layer?.type === "graphics" && layer.layerType === "graphics" && layer.visible !== false
  );
}

function getUniqueGraphics(results) {
  const graphics = [];
  const seen = new Set();

  for (const result of results) {
    const graphic = result.graphic;

    if (!graphic?.attributes || graphic.visible === false || graphic.layer?.visible === false) {
      continue;
    }

    const key = getUniqueGraphicKey(graphic);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    graphics.push(graphic);
  }

  return graphics;
}

function getUniqueGraphicKey(graphic) {
  const featureKey = graphic.attributes?.featureKey;
  const layerId = graphic.layer?.appLayerId ?? graphic.layer?.customId;

  if (featureKey && layerId) {
    return `${layerId}:${featureKey}`;
  }

  return graphic.uid;
}

function openOverlapPickerPopup(view, { graphics, location }) {
  clearPopupActions(view);

  const content = createOverlapPickerContent({
    graphics,
    onSelect: (graphic) => {
      openGraphicPopup(view, {
        graphic,
        location,
      });
    },
  });

  openPopup(view, {
    title: `${graphics.length} corrections at this location`,
    location,
    content,
  });
}

function openGraphicPopup(view, { graphic, location }) {
  resetPopupActions(view);
  ensureGraphicHasPopupTemplate(graphic);

  openPopup(view, {
    features: [graphic],
    location,
  });
}

function ensureGraphicHasPopupTemplate(graphic) {
  if (graphic.popupTemplate) {
    return;
  }

  const layerPopupTemplate = graphic.layer?.popupTemplate;

  if (layerPopupTemplate) {
    graphic.popupTemplate = layerPopupTemplate;
  }
}

function createOverlapPickerContent({ graphics, onSelect }) {
  const container = document.createElement("div");
  container.className = "list-group overlap-picker";

  const sortedGraphics = [...graphics].sort(compareGraphicsForPicker);

  for (const graphic of sortedGraphics) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "list-group-item list-group-item-action overlap-picker__item";

    const header = document.createElement("div");
    header.className = "d-flex align-items-start gap-2";

    const statusMarker = document.createElement("span");
    statusMarker.className = "overlap-picker__status-marker";
    statusMarker.style.backgroundColor = getStatusColor(graphic.attributes?.status, "outline");

    const textContainer = document.createElement("div");
    textContainer.className = "flex-grow-1 min-width-0";

    const title = document.createElement("div");
    title.className = "fw-semibold text-truncate";
    title.textContent = getGraphicTitle(graphic);

    const subtitle = document.createElement("div");
    subtitle.className = "small text-muted";
    subtitle.textContent = getGraphicSubtitle(graphic);

    textContainer.appendChild(title);

    if (subtitle) {
      textContainer.appendChild(subtitle);
    }

    header.appendChild(statusMarker);
    header.appendChild(textContainer);
    button.appendChild(header);

    button.addEventListener("click", () => {
      onSelect(graphic);
    });

    container.appendChild(button);
  }

  return container;
}

function getGraphicTitle(graphic) {
  const attributes = graphic.attributes ?? {};

  return (
    attributes.datasetName ??
    attributes.featureKey ??
    attributes.name ??
    attributes.id ??
    "Correction"
  );
}

function getGraphicSubtitle(graphic) {
  const attributes = graphic.attributes ?? {};
  const values = [];

  if (attributes.status !== undefined && attributes.status !== null) {
    values.push(`Status: ${attributes.status}`);
  }

  if (attributes.edition !== undefined && attributes.edition !== null) {
    values.push(`Edition: ${attributes.edition}`);
  }

  if (attributes.update !== undefined && attributes.update !== null) {
    values.push(`Update: ${attributes.update}`);
  }

  if (graphic.layer?.title) {
    values.push(graphic.layer.title);
  }

  return values.join(" · ");
}

function openPopup(view, options) {
  if (typeof view.openPopup === "function") {
    view.openPopup(options);
    return;
  }

  view.popup.open(options);
}

function closePopup(view) {
  if (typeof view.closePopup === "function") {
    view.closePopup();
    return;
  }

  view.popup?.close?.();
}

function getStatusColor(status, colorType = "outline", alphaOverride = null) {
  const cfg = statusColorConfig[status];
  const color = cfg?.[colorType] ?? cfg?.outline ?? cfg?.fill;

  if (!color) {
    return alphaOverride === null ? "rgba(0, 0, 0, 0.65)" : `rgba(0, 0, 0, ${alphaOverride})`;
  }

  if (Array.isArray(color)) {
    const alpha = alphaOverride ?? color[3] ?? 1;

    return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
  }

  if (typeof color === "string" && alphaOverride !== null) {
    return withCssAlpha(color, alphaOverride);
  }

  return color;
}

function withCssAlpha(color, alpha) {
  const rgbaMatch = color.match(/^rgba?\(([^)]+)\)$/i);

  if (!rgbaMatch) {
    return color;
  }

  const parts = rgbaMatch[1].split(",").map((part) => part.trim());

  if (parts.length < 3) {
    return color;
  }

  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
}

function compareGraphicsForPicker(a, b) {
  const statusA = Number(a.attributes?.status ?? 999);
  const statusB = Number(b.attributes?.status ?? 999);

  if (statusA !== statusB) {
    return statusA - statusB;
  }

  return getGraphicTitle(a).localeCompare(getGraphicTitle(b));
}
