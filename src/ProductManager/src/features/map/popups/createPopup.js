import { fetchProductPropertiesByDatasetName } from "../../data/api/productApi.js";
import { getStatusName } from "../../data/stores/statusStore.js";
import { noticeError } from "../../notices/services/noticeService.js";
import { applyGraphicAttributes } from "../state/featureState.js";
import { createPopupActionBar } from "./popupActionBar.js";

export function createPopup() {
  return {
    title: (event) => {
      const attr = event.graphic.attributes;
      return `${attr.datasetName}`;
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

  const section = document.createElement("div");
  section.className = "popup-section";

  container.appendChild(
    createPopupActionBar({
      attributes,
      refreshAndRender,
    })
  );

  container.appendChild(section);

  section.appendChild(createRow("Edition", attributes.edition));
  section.appendChild(createRow("Update", attributes.update));
  section.appendChild(createStatusRow(attributes.status));
  if (attributes.errorMessage) {
    section.appendChild(createRow("Error Message", attributes.errorMessage));
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
