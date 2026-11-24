import { workspaceColorForOpenJobs } from "../workspaces/workspaceJobColors.js";

// ProductCatalogue's popupHeaderController establishes the visual pattern:
// the native Popup title is colored, and app-owned actions follow below it.
// ArcGIS does not expose a public native header background property in the
// current MapView widget. Keep this compatibility adapter isolated here.
export function createWorkspacePopupHeaderStyle({ view, layerId, watch }) {
  let alive = true;
  const styledElements = new Map();
  let observedHost = null;
  let observer = null;
  let animationFrameId = null;
  let generation = 0;

  function selectedWorkspace() {
    const popup = view?.popup;
    const feature = popup?.selectedFeature ?? popup?.viewModel?.selectedFeature;
    return popup?.visible !== false && feature?.visible !== false && feature?.layer?.id === layerId
      ? feature
      : null;
  }

  function restoreStyles(element, properties) {
    for (const [name, { value, priority }] of properties) {
      if (value) element.style.setProperty(name, value, priority);
      else element.style.removeProperty(name);
    }
  }

  function resetHeader() {
    for (const [element, properties] of styledElements) restoreStyles(element, properties);
    styledElements.clear();
  }

  function applyStyles(element, values) {
    let properties = styledElements.get(element);
    if (!properties) {
      properties = new Map();
      styledElements.set(element, properties);
    }
    for (const [name, value] of Object.entries(values)) {
      if (!properties.has(name)) {
        properties.set(name, {
          value: element.style.getPropertyValue(name),
          priority: element.style.getPropertyPriority(name),
        });
      }
      element.style.setProperty(name, value, "important");
    }
  }

  function styleHeader({ header, heading, panel }, feature) {
    const targets = new Set([header, heading, panel]);
    for (const [element, properties] of styledElements) {
      if (!targets.has(element)) {
        restoreStyles(element, properties);
        styledElements.delete(element);
      }
    }

    const color = workspaceColorForOpenJobs(feature.attributes?.openJobs);
    const foreground = readableTextColor(color);
    const textColors = {
      color: foreground,
      "--calcite-color-text-1": foreground,
      "--calcite-color-text-2": foreground,
      "--calcite-color-text-3": foreground,
      "--calcite-ui-text-1": foreground,
      "--calcite-ui-text-2": foreground,
      "--calcite-ui-text-3": foreground,
    };

    const foregroundChannel = foreground === "#ffffff" ? 255 : 0;
    const hoverColor = `rgb(${color
      .map((value) => Math.round(value * 0.9 + foregroundChannel * 0.1))
      .join(", ")})`;

    // The native heading has its own theme color, so inherited header color
    // alone does not guarantee contrast for the slotted title in dark mode.
    applyStyles(header, {
      ...textColors,
      "background-color": `rgb(${color.join(", ")})`,
      "--calcite-action-text-color": foreground,
      "--calcite-action-text-color-press": foreground,
      "--calcite-action-background-color-hover": hoverColor,
      "--calcite-action-background-color-press": hoverColor,
    });
    if (heading) applyStyles(heading, textColors);

    // Panel header-specific tokens cover the native Close action without
    // changing the text colors of the panel's actions or information body.
    applyStyles(panel, {
      "--calcite-panel-header-action-text-color": foreground,
      "--calcite-panel-header-action-text-color-press": foreground,
      "--calcite-panel-header-action-background-color-hover": hoverColor,
      "--calcite-panel-header-action-background-color-press": hoverColor,
    });
  }

  function cancelRetry() {
    generation += 1;
    if (animationFrameId !== null) {
      globalThis.cancelAnimationFrame?.(animationFrameId);
      animationFrameId = null;
    }
  }

  function attempt(generationId, remainingFrames) {
    if (!alive || generation !== generationId) return;
    const feature = selectedWorkspace();
    if (!feature) {
      resetHeader();
      return;
    }
    const elements = findNativePopupHeader(view?.popup?.container);
    if (elements) {
      styleHeader(elements, feature);
      return;
    }
    if (remainingFrames > 0 && typeof globalThis.requestAnimationFrame === "function") {
      animationFrameId = globalThis.requestAnimationFrame(() => {
        animationFrameId = null;
        attempt(generationId, remainingFrames - 1);
      });
    }
  }

  function attachHostObserver(host) {
    if (host === observedHost) return;
    observer?.disconnect();
    observer = null;
    observedHost = host ?? null;
    if (host && typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(() => {
        if (selectedWorkspace()) refresh();
      });
      observer.observe(host, { childList: true, subtree: true });
    }
  }

  function refresh() {
    if (!alive) return;
    attachHostObserver(view?.popup?.container);
    cancelRetry();
    if (!selectedWorkspace()) {
      resetHeader();
      return;
    }
    attempt(generation, 24);
  }

  const handle = watch(
    () => [
      view?.popup?.container,
      view?.popup?.selectedFeature,
      view?.popup?.viewModel?.selectedFeature,
      view?.popup?.visible,
    ],
    refresh,
    { initial: true }
  );

  return {
    refresh,
    destroy() {
      alive = false;
      handle?.remove?.();
      cancelRetry();
      observer?.disconnect();
      observer = null;
      observedHost = null;
      resetHeader();
    },
  };
}

// This is the native Calcite panel header lookup used by ProductCatalogue.
// No application state or event handlers are attached to the SDK's internal DOM.
function findNativePopupHeader(host) {
  if (!host?.querySelector) return null;
  const heading = host.querySelector(".esri-features__heading");
  const flowItem =
    heading?.closest?.("calcite-flow-item") ?? host.querySelector("calcite-flow-item");
  const panel =
    flowItem?.shadowRoot?.querySelector("calcite-panel") ?? host.querySelector("calcite-panel");
  const header = panel?.shadowRoot?.querySelector(".header");
  return header ? { header, heading, panel } : null;
}

function readableTextColor([red, green, blue]) {
  const channels = [red, green, blue].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return blackContrast >= whiteContrast ? "#000000" : "#ffffff";
}
