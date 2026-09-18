import { getAllLayers } from "../core/layerRegistry.js";
import { layerSupportsCapability } from "../config/layerDefinitions.js";
import { statusColorConfig } from "../../../shared/config/colorsConfig.js";
import { formatStatusDisplayValue } from "../attributes/attributeDisplay.js";
import { applyHeaderColor, resetHeaderColor } from "../popups/popupHeaderController.js";
import {
  bindProductKeyboardActivation,
  createProductClickSession,
  getValidUniqueClickCandidates,
  handleProductClick,
} from "./productClickInteraction.js";
import { bindDirectSelectionShortcutHint } from "./directSelectionShortcutHint.js";

let activeClickCleanup = null;

export function bindOverlapPicker(view, { hoverManager } = {}) {
  activeClickCleanup?.();
  activeClickCleanup = null;

  // We need full control over feature clicks because the default popup only
  // opens one selected feature, which is not enough when features overlap.
  view.popupEnabled = false;
  const interactionSession = createProductClickSession();

  const clickHandle = view.on("click", (event) => {
    const isCurrent = interactionSession.begin();
    void handleProductClick({
      event,
      view,
      getInteractiveLayers,
      getClickCandidates: getValidUniqueClickCandidates,
      getHighlightedIdentity: () => hoverManager?.getHighlightedGraphicIdentity?.() ?? null,
      openGraphic: (options) => openGraphicPopup(view, options),
      openOverlap: (options) => openOverlapPickerPopup(view, options),
      closePopup: () => closePopup(view),
      isCurrent,
    });
  });

  const cleanupKeyboardActivation = bindProductKeyboardActivation({
    view,
    beginInteraction: () => interactionSession.begin(),
    getInteractiveLayers,
    getHighlightedIdentity: () => hoverManager?.getHighlightedGraphicIdentity?.() ?? null,
    openGraphic: (options) => openGraphicPopup(view, options),
  });
  const cleanupShortcutHint = bindDirectSelectionShortcutHint(view, { hoverManager });

  const cleanup = () => {
    interactionSession.destroy();
    clickHandle.remove?.();
    cleanupKeyboardActivation();
    cleanupShortcutHint();
    if (activeClickCleanup === cleanup) {
      activeClickCleanup = null;
    }
  };
  activeClickCleanup = cleanup;
  return cleanup;
}

function getInteractiveLayers() {
  return getAllLayers().filter((layer) => {
    return (
      layer?.type === "graphics" &&
      layer.layerType === "graphics" &&
      layer.visible !== false &&
      layerSupportsCapability(layer, "supportsOverlapPicker")
    );
  });
}

function openOverlapPickerPopup(view, { graphics, location, onSelect }) {
  resetHeaderColor(view);
  view.popup.actions = [];

  const content = createOverlapPickerContent({
    graphics,
    onSelect,
  });

  openPopup(view, {
    title: `${graphics.length} corrections at this location`,
    location,
    content,
  });

  requestAnimationFrame(() => {
    resetHeaderColor(view);
  });
}

function openGraphicPopup(view, { graphic, location }) {
  view.popup.actions = [];
  ensureGraphicHasPopupTemplate(graphic);

  openPopup(view, {
    features: [graphic],
    location,
  });

  requestAnimationFrame(() => {
    applyHeaderColor(view);
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
  container.className = "overlap-picker";

  const sortedGraphics = [...graphics].sort(compareGraphicsForPicker);

  for (const graphic of sortedGraphics) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "overlap-picker__item";

    const statusMarker = document.createElement("span");
    statusMarker.className = "overlap-picker__status-marker";
    statusMarker.style.backgroundColor = getStatusColor(graphic.attributes?.status, "outline");

    const textContainer = document.createElement("div");
    textContainer.className = "overlap-picker__content";

    const title = document.createElement("div");
    title.className = "overlap-picker__title";
    title.textContent = getGraphicTitle(graphic);

    const subtitle = document.createElement("div");
    subtitle.className = "overlap-picker__subtitle";
    subtitle.textContent = getGraphicSubtitle(graphic);

    textContainer.appendChild(title);

    if (subtitle.textContent) {
      textContainer.appendChild(subtitle);
    }

    button.appendChild(statusMarker);
    button.appendChild(textContainer);

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
    values.push(`Status: ${formatStatusDisplayValue(attributes.status)}`);
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
