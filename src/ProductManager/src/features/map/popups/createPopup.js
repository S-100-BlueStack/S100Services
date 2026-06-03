import { fetchProductPropertiesByDatasetName } from "../../data/api/productApi.js";
import { getStatusName } from "../../data/stores/statusStore.js";
import { noticeError } from "../../notices/services/noticeService.js";
import { attributesSupportLayerCapability } from "../config/layerDefinitions.js";
import { applyGraphicAttributes } from "../state/featureState.js";
import { createPopupActionBar } from "./popupActionBar.js";
import { closePopupActionDropdown } from "./popupActionDropdown.js";
import { onPopupExportStateChanged } from "./popupExportState.js";

const GENERIC_POPUP_EXCLUDED_FIELDS = new Set(["featureKey", "layerId", "layerKind"]);

export function createPopup() {
  return {
    title: (event) => {
      return getPopupTitle(event.graphic?.attributes);
    },

    content: (event) => {
      const graphic = event.graphic;
      const container = document.createElement("div");
      container.className = "popup-container popup-container--with-action-bar";

      let currentAttributes = {
        ...(graphic.attributes ?? {}),
      };
      let latestRefreshId = 0;

      function render() {
        renderPopupContent(container, currentAttributes, {
          refreshAndRender,
        });
      }

      async function refreshAndRender() {
        const refreshId = ++latestRefreshId;
        const datasetName = currentAttributes.datasetName ?? graphic?.attributes?.datasetName;

        if (!attributesSupportLayerCapability(currentAttributes, "supportsProductActions")) {
          return false;
        }

        if (!datasetName) {
          return false;
        }

        const result = await fetchProductPropertiesByDatasetName(datasetName);

        // Ignore stale refreshes. This prevents an older popup-open refresh from
        // overwriting a newer freeze/unfreeze refresh.
        if (refreshId !== latestRefreshId) {
          return false;
        }

        if (!result.success) {
          noticeError("Selected product could not be refreshed", result.errorMessage);
          return false;
        }

        currentAttributes = applyGraphicAttributes(graphic, result.data);
        render();

        return true;
      }

      const unsubscribeFromExportState = onPopupExportStateChanged(({ datasetName }) => {
        const currentDatasetName =
          currentAttributes.datasetName ?? graphic?.attributes?.datasetName;

        if (!isSameDatasetName(datasetName, currentDatasetName)) {
          return;
        }

        closePopupActionDropdown();
        render();
      });

      cleanupWhenDisconnected(container, unsubscribeFromExportState);

      render();

      // Initial freshness check when the popup opens.
      void refreshAndRender();

      return container;
    },

    visibleElements: {
      collapseButton: false,
      featureNavigation: false,
    },
  };
}

function renderPopupContent(container, attributes, { refreshAndRender }) {
  container.replaceChildren();

  const actionBar = createPopupActionBar({
    attributes,
    refreshAndRender,
  });

  if (actionBar) {
    container.appendChild(actionBar);
  }

  const section = document.createElement("div");
  section.className = "popup-section";
  container.appendChild(section);

  if (attributesSupportLayerCapability(attributes, "supportsProductActions")) {
    renderProductRows(section, attributes);
    return;
  }

  renderGenericRows(section, attributes);
}

function renderProductRows(section, attributes) {
  section.appendChild(createRow("Edition", attributes.edition));
  section.appendChild(createRow("Update", attributes.update));
  section.appendChild(createStatusRow(attributes.status));

  if (attributes.errorMessage) {
    section.appendChild(createRow("Error Message", attributes.errorMessage));
  }
}

function renderGenericRows(section, attributes) {
  const entries = Object.entries(attributes ?? {}).filter(([fieldName]) => {
    return !GENERIC_POPUP_EXCLUDED_FIELDS.has(fieldName);
  });

  if (entries.length === 0) {
    section.appendChild(createRow("Details", "No displayable attributes."));
    return;
  }

  for (const [fieldName, value] of entries) {
    section.appendChild(createRow(formatFieldLabel(fieldName), formatPopupValue(value)));
  }
}

function createRow(label, value, withCopy = false) {
  const row = document.createElement("div");
  row.className = "popup-row";

  const labelEl = document.createElement("span");
  labelEl.className = "popup-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "popup-value";
  valueEl.textContent = value ?? "";

  row.appendChild(labelEl);
  row.appendChild(valueEl);

  if (withCopy) {
    const copy = document.createElement("calcite-action");
    copy.setAttribute("icon", "copy");
    copy.setAttribute("scale", "s");
    copy.className = "copy-btn";
    copy.dataset.copy = value;
    row.appendChild(copy);
  }

  return row;
}

function createStatusRow(status) {
  const row = document.createElement("div");
  row.className = "popup-row";

  const label = document.createElement("span");
  label.className = "popup-label";
  label.textContent = "Status";

  const value = document.createElement("span");
  value.className = "popup-value";
  value.textContent = getStatusName(status);

  row.appendChild(label);
  row.appendChild(value);

  return row;
}

function getPopupTitle(attributes) {
  return (
    attributes?.datasetName ??
    attributes?.name ??
    attributes?.Name ??
    attributes?.featureKey ??
    "Feature"
  );
}

function formatFieldLabel(fieldName) {
  return String(fieldName ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function formatPopupValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function cleanupWhenDisconnected(element, cleanup) {
  let hasBeenConnected = element.isConnected;
  let cleanupHasRun = false;

  const runCleanup = () => {
    if (cleanupHasRun) {
      return;
    }

    cleanupHasRun = true;
    cleanup?.();
  };

  const observer = new MutationObserver(() => {
    if (element.isConnected) {
      hasBeenConnected = true;
      return;
    }

    // ArcGIS may create popup content before attaching it to the DOM. Only clean
    // up after the element has actually been connected at least once.
    if (!hasBeenConnected) {
      return;
    }

    runCleanup();
    observer.disconnect();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  requestAnimationFrame(() => {
    if (element.isConnected) {
      hasBeenConnected = true;
    }
  });
}

function isSameDatasetName(left, right) {
  return normalizeDatasetName(left) === normalizeDatasetName(right);
}

function normalizeDatasetName(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}
