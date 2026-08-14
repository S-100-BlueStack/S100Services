import { fetchProductPropertiesByDatasetName } from "../../data/api/productApi.js";
import { getStatusName } from "../../data/stores/statusStore.js";
import { noticeError } from "../../notices/services/noticeService.js";
import { attributesSupportLayerCapability } from "../config/layerDefinitions.js";
import { applyGraphicAttributes } from "../state/featureState.js";
import { createPopupActionBar, updatePopupActionBar } from "./popupActionBar.js";
import { onPopupExportStateChanged } from "./popupExportState.js";
import { onProductOperationStateChanged } from "../../products/state/productOperationState.js";
import { watchActiveProductJobs } from "../../products/services/productJobService.js";
import { registerPopupRefreshHandler } from "./popupRefreshBridge.js";

const GENERIC_POPUP_EXCLUDED_FIELDS = new Set([
  "featureKey",
  "layerId",
  "layerKind",
  // Internal Analyze/report fields should not leak into generic map popups.
  "aoiGeometry",
  "errorMessage",
  "isMock",
  "loadError",
  "raw",
  "xml",
  "exportMetadata",
]);

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
      const popupDatasetName =
        readDatasetName(currentAttributes) ?? readDatasetName(graphic?.attributes);
      const stopWatchingActiveJobs =
        shouldRenderProductContent(currentAttributes) && popupDatasetName
          ? watchActiveProductJobs(popupDatasetName)
          : null;

      function render() {
        renderPopupContent(container, currentAttributes, {
          refreshAndRender,
        });
      }

      async function refreshAndRender({ showFailureNotice = true } = {}) {
        const refreshId = ++latestRefreshId;
        const datasetName =
          readDatasetName(currentAttributes) ?? readDatasetName(graphic?.attributes);

        if (!shouldRenderProductContent(currentAttributes)) {
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
          if (showFailureNotice) {
            noticeError("Selected product could not be refreshed", result.errorMessage);
          }

          return false;
        }

        currentAttributes = applyGraphicAttributes(graphic, result.data);
        render();

        return true;
      }

      const stopRefreshingPopup =
        shouldRenderProductContent(currentAttributes) && popupDatasetName
          ? registerPopupRefreshHandler({
              datasetName: popupDatasetName,
              refresh: refreshAndRender,
            })
          : null;
      const unsubscribeFromExportState = onPopupExportStateChanged(({ datasetName }) => {
        rerenderWhenDatasetMatches(datasetName);
      });
      const unsubscribeFromProductOperationState = onProductOperationStateChanged(
        ({ datasetName }) => {
          rerenderWhenDatasetMatches(datasetName);
        }
      );

      cleanupWhenDisconnected(
        container,
        combineCleanups(
          unsubscribeFromExportState,
          unsubscribeFromProductOperationState,
          stopWatchingActiveJobs,
          stopRefreshingPopup
        )
      );

      function rerenderWhenDatasetMatches(datasetName) {
        const currentDatasetName =
          readDatasetName(currentAttributes) ?? readDatasetName(graphic?.attributes);

        if (!isSameDatasetName(datasetName, currentDatasetName)) {
          return;
        }

        render();
      }

      render();

      // Initial popup freshness should be silent on failure. A restored popup can be
      // opened while a full map refresh is still retrying, and the full refresh flow
      // owns the user-facing failure notice in that case.
      void refreshAndRender({ showFailureNotice: false });

      return container;
    },

    visibleElements: {
      collapseButton: false,
      featureNavigation: false,
    },
  };
}

function renderPopupContent(container, attributes, { refreshAndRender }) {
  const section = getOrCreatePopupSection(container);
  const actionBar = getDirectChildByClass(container, "popup-action-bar");

  if (actionBar) {
    const actionBarUpdate = updatePopupActionBar(actionBar, {
      attributes,
      refreshAndRender,
    });

    if (!actionBarUpdate.supported) {
      actionBar.remove();
    }
  } else {
    const nextActionBar = createPopupActionBar({
      attributes,
      refreshAndRender,
    });

    if (nextActionBar) {
      container.insertBefore(nextActionBar, section);
    }
  }

  section.replaceChildren();

  if (shouldRenderProductContent(attributes)) {
    renderProductRows(section, attributes);
    return;
  }

  renderGenericRows(section, attributes);
}

function getOrCreatePopupSection(container) {
  const existingSection = getDirectChildByClass(container, "popup-section");

  if (existingSection) {
    return existingSection;
  }

  const section = document.createElement("div");
  section.className = "popup-section";
  container.appendChild(section);

  return section;
}

function getDirectChildByClass(container, className) {
  return Array.from(container.children).find((child) => {
    return child.classList.contains(className);
  });
}

function renderProductRows(section, attributes) {
  const table = createProductMetadataTable(attributes);

  if (table) {
    section.appendChild(table);
    return;
  }

  section.appendChild(createRow("Details", "No displayable product attributes."));
}

function renderGenericRows(section, attributes) {
  const entries = Object.entries(attributes ?? {}).filter(([fieldName, value]) => {
    return (
      !GENERIC_POPUP_EXCLUDED_FIELDS.has(fieldName) &&
      hasDisplayableValue(value) &&
      !isComplexValue(value)
    );
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

function getPopupTitle(attributes) {
  return (
    readDatasetName(attributes) ??
    readAttribute(attributes, ["name", "Name"]) ??
    readAttribute(attributes, ["featureKey", "FeatureKey"]) ??
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

  return String(value);
}

function hasDisplayableValue(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return true;
}

function isComplexValue(value) {
  return typeof value === "object" && value !== null;
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

function combineCleanups(...cleanups) {
  return () => {
    for (const cleanup of cleanups) {
      cleanup?.();
    }
  };
}

function isSameDatasetName(left, right) {
  return normalizeDatasetName(left) === normalizeDatasetName(right);
}

function normalizeDatasetName(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function shouldRenderProductContent(attributes) {
  return (
    attributesSupportLayerCapability(attributes, "supportsProductActions") ||
    looksLikeProductAttributes(attributes)
  );
}

function looksLikeProductAttributes(attributes) {
  if (!attributes || typeof attributes !== "object") {
    return false;
  }

  return Boolean(
    readDatasetName(attributes) ||
    readAttribute(attributes, ["edition", "Edition"]) !== undefined ||
    readAttribute(attributes, ["update", "Update"]) !== undefined ||
    readAttribute(attributes, ["status", "Status"]) !== undefined
  );
}

function readDatasetName(attributes) {
  return readAttribute(attributes, ["datasetName", "DatasetName", "datasetname"]);
}

function createProductMetadataTable(attributes) {
  const columns = createProductMetadataColumns(attributes);

  if (columns.length === 0) {
    return null;
  }

  const rows = createProductMetadataRows(columns);

  if (rows.length === 0) {
    return null;
  }

  const container = document.createElement("div");
  container.className = "popup-product-table-wrapper";

  const table = document.createElement("table");
  table.className = "popup-product-table";
  table.appendChild(createProductTableHead(columns));
  table.appendChild(createProductTableBody(columns, rows));

  container.appendChild(table);

  return container;
}

function createProductMetadataColumns(attributes) {
  const columns = [
    {
      key: "main",
      label: "S100",
      item: createMainProductMetadataItem(attributes),
    },
  ];

  const exportMetadata = attributes?.exportMetadata;

  for (const standard of exportMetadata?.standards ?? []) {
    const item = exportMetadata.byStandard?.[standard];

    if (!item) {
      continue;
    }

    columns.push({
      key: `export:${standard}`,
      label: createExportColumnLabel(standard, columns),
      item,
    });
  }

  return columns;
}

function createMainProductMetadataItem(attributes) {
  return {
    edition: readAttribute(attributes, ["edition", "Edition"]),
    update: readAttribute(attributes, ["update", "Update"]),
    status: readAttribute(attributes, ["status", "Status"]),
    date: readAttribute(attributes, ["issueDate", "IssueDate"]),
    errorMessage: readAttribute(attributes, ["errorMessage", "ErrorMessage"]),
    validationArtifacts: [],
  };
}

function createExportColumnLabel(standard, existingColumns) {
  const label = String(standard ?? "").trim() || "Export";
  const labelExists = existingColumns.some((column) => column.label === label);

  return labelExists ? `${label} export` : label;
}

function createProductMetadataRows(columns) {
  const rows = [
    {
      label: "Edition",
      getValue: (item) => formatProductTableValue(item?.edition),
    },
    {
      label: "Update",
      getValue: (item) => formatProductTableValue(item?.update),
    },
    {
      label: "Status",
      getValue: (item) => formatProductStatus(item?.status),
    },
    {
      label: "Error message",
      getValue: (item) => formatProductTableValue(item?.errorMessage),
      shouldShow: () => columns.some((column) => hasDisplayableValue(column.item?.errorMessage)),
    },
    {
      label: "Validation files",
      getContent: (item) => createValidationArtifactLinks(item?.validationArtifacts),
      shouldShow: () => columns.some((column) => column.item?.validationArtifacts?.length),
    },
  ];

  return rows.filter((row) => {
    return typeof row.shouldShow === "function" ? row.shouldShow() : true;
  });
}

function createProductTableHead(columns) {
  const head = document.createElement("thead");
  const row = document.createElement("tr");
  const attributeHeader = createProductTableHeaderCell("");
  attributeHeader.setAttribute("aria-label", "Attribute");
  row.appendChild(attributeHeader);

  for (const column of columns) {
    row.appendChild(createProductTableHeaderCell(column.label));
  }

  head.appendChild(row);

  return head;
}

function createProductTableBody(columns, rows) {
  const body = document.createElement("tbody");

  for (const config of rows) {
    body.appendChild(createProductTableRow(config, columns));
  }

  return body;
}

function createProductTableRow({ label, getValue, getContent }, columns) {
  const row = document.createElement("tr");

  const labelCell = document.createElement("th");
  labelCell.scope = "row";
  labelCell.className = "popup-product-table__attribute";
  labelCell.textContent = label;
  row.appendChild(labelCell);

  for (const column of columns) {
    const cell = document.createElement("td");
    const content = getContent?.(column.item);
    if (content instanceof Node) {
      cell.appendChild(content);
    } else {
      cell.textContent = getValue?.(column.item) ?? "";
    }
    row.appendChild(cell);
  }

  return row;
}

function createValidationArtifactLinks(artifacts) {
  const container = document.createElement("div");
  container.className = "popup-product-table__validation-files";

  for (const [index, artifact] of (artifacts ?? []).entries()) {
    if (!artifact?.url) continue;
    if (index > 0) container.appendChild(document.createElement("br"));

    const link = document.createElement("a");
    link.href = artifact.url;
    link.textContent = artifact.fileName || "Download validation file";
    link.download = artifact.fileName || "";
    container.appendChild(link);
  }

  return container;
}

function createProductTableHeaderCell(label) {
  const cell = document.createElement("th");
  cell.scope = "col";
  cell.textContent = label;

  return cell;
}

function formatProductStatus(status) {
  if (!hasDisplayableValue(status)) {
    return "";
  }

  return getStatusName(status);
}

function formatProductTableValue(value) {
  return hasDisplayableValue(value) ? String(value) : "";
}

function readAttribute(attributes, names) {
  if (!attributes) {
    return undefined;
  }

  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(attributes, name)) {
      return attributes[name];
    }
  }

  const normalizedNames = new Set(names.map(normalizeAttributeName));

  for (const [name, value] of Object.entries(attributes)) {
    if (normalizedNames.has(normalizeAttributeName(name))) {
      return value;
    }
  }

  return undefined;
}

function normalizeAttributeName(value) {
  return String(value ?? "")
    .trim()
    .replace(/[_\-\s]/g, "")
    .toLowerCase();
}
