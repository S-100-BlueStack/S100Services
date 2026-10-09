import { createPackagePopupPresentation } from "./packagePopupPresentation.js";
import { updatePackagePopupWorkflow } from "./packagePopupWorkflow.js";
import { createPackagePopupSnapshotSynchronization } from "./packagePopupSnapshot.js";
import { createPopupErrorDetails } from "./popupErrorDetails.js";
import { applyPopupProductStatusCell } from "./popupProductStatusCell.js";
import { fetchProductPropertiesByDatasetName } from "../../data/api/productApi.js";
import { getStatusName, getStatusIdByName, getAllStatuses } from "../../data/stores/statusStore.js";
import { noticeError } from "../../notices/services/noticeService.js";
import { resolveProductContext } from "../../products/domain/productContext.js";
import { attributesSupportLayerCapability } from "../config/layerDefinitions.js";
import { applyGraphicAttributes } from "../state/featureState.js";
import { createPopupActionBar, updatePopupActionBar } from "./popupActionBar.js";
import {
  fetchPopupProductRefresh,
  initializePopupBackendSynchronization,
  mergePopupProductRefreshAttributes,
} from "./popupBackendSync.js";
import { onPopupExportStateChanged } from "./popupExportState.js";
import { onProductOperationStateChanged } from "../../products/state/productOperationState.js";
import { watchActiveProductJobs } from "../../products/services/productJobService.js";
import { registerPopupRefreshHandler } from "./popupRefreshBridge.js";
import { createPopupProductMetadataColumns } from "./popupProductMetadata.js";

const GENERIC_POPUP_EXCLUDED_FIELDS = new Set([
  "featureKey",
  "layerId",
  "layerKind",
  "sourceId",
  "sourceLabel",
  "productKey",
  "productIdentityKey",
  "productType",
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
      const errorDetails = createPopupErrorDetails();
      let latestRefreshId = 0;
      let disposed = false;
      const productContext = resolveProductContext({
        graphic,
        attributes: currentAttributes,
      });
      const popupDatasetName =
        productContext?.datasetName ??
        readDatasetName(currentAttributes) ??
        readDatasetName(graphic?.attributes);
      let backendSync = {
        enabled: false,
        stopWatchingActiveJobs: null,
        stopRefreshingPopup: null,
      };

      const packageSnapshot =
        productContext?.workUnit?.kind === "package"
          ? createPackagePopupSnapshotSynchronization({
              graphic,
              productContext,
              isConnected: () => !disposed && container.isConnected,
              getAttributes: () => currentAttributes,
              onSourcePublication: () => {
                latestRefreshId += 1;
              },
              publish: (attributes) => {
                currentAttributes = attributes;
                render();
              },
              onInvalid: invalidatePackagePresentation,
            })
          : null;

      function invalidatePackagePresentation() {
        disposed = true;
        latestRefreshId += 1;
        backendSync.stopRefreshingPopup?.();
        const actionBar = getDirectChildByClass(container, "popup-action-bar");
        // Clear this session's dropdown through the established action-bar cleanup.
        if (actionBar) updatePopupActionBar(actionBar);
        errorDetails.destroy();
        container.replaceChildren();
      }

      function render() {
        if (disposed) return;
        if (
          packageSnapshot &&
          ((container.isConnected && !packageSnapshot.isCurrent()) ||
            !createPackagePopupPresentation({ productContext, attributes: currentAttributes }))
        ) {
          invalidatePackagePresentation();
          return;
        }
        renderPopupContent(container, currentAttributes, {
          graphic,
          productContext,
          refreshAndRender,
          errorDetails,
        });
      }

      async function refreshAndRender({ showFailureNotice = true } = {}) {
        if (packageSnapshot && !packageSnapshot.isCurrent()) {
          invalidatePackagePresentation();
          return false;
        }
        const refreshId = ++latestRefreshId;
        const datasetName =
          productContext?.datasetName ??
          readDatasetName(currentAttributes) ??
          readDatasetName(graphic?.attributes);

        if (!backendSync.enabled) {
          return false;
        }
        if (!shouldRenderProductContent(currentAttributes)) {
          return false;
        }
        if (!datasetName) {
          return false;
        }

        const refreshRequest = await fetchPopupProductRefresh({
          productContext,
          datasetName,
          fetchProduct: fetchProductPropertiesByDatasetName,
        });
        if (!refreshRequest.dispatched) {
          return false;
        }
        const result = refreshRequest.result;

        // The same generation rejects older detail after a source publication
        // as well as after a newer action refresh.
        if (
          disposed ||
          !container.isConnected ||
          refreshId !== latestRefreshId ||
          (packageSnapshot && !packageSnapshot.isCurrent())
        ) {
          if (packageSnapshot && !packageSnapshot.isCurrent()) {
            invalidatePackagePresentation();
          }
          return false;
        }
        if (!result.success) {
          if (showFailureNotice) {
            noticeError("Selected product could not be refreshed", result.errorMessage);
          }

          return false;
        }

        currentAttributes = applyGraphicAttributes(
          graphic,
          mergePopupProductRefreshAttributes(productContext, result.data)
        );
        render();

        return true;
      }

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
          () => {
            const actionBar = getDirectChildByClass(container, "popup-action-bar");
            if (packageSnapshot && actionBar) updatePopupActionBar(actionBar);
            errorDetails.destroy();
            disposed = true;
            latestRefreshId += 1;
          },
          unsubscribeFromExportState,
          unsubscribeFromProductOperationState,
          () => backendSync.stopWatchingActiveJobs?.(),
          () => backendSync.stopRefreshingPopup?.()
        ),
        () => {
          if (disposed) return;
          backendSync = initializePopupBackendSynchronization({
            productContext,
            datasetName: popupDatasetName,
            refresh: refreshAndRender,
            watchActiveProductJobs,
            registerPopupRefreshHandler,
            syncFromGraphic: packageSnapshot?.synchronize,
          });
          if (backendSync.enabled) {
            if (backendSync.start) {
              void backendSync.start();
            } else {
              void refreshAndRender({ showFailureNotice: false });
            }
          }
        }
      );

      function rerenderWhenDatasetMatches(datasetName) {
        if (disposed || !container.isConnected) return;
        const currentDatasetName =
          productContext?.datasetName ??
          readDatasetName(currentAttributes) ??
          readDatasetName(graphic?.attributes);
        if (!isSameDatasetName(datasetName, currentDatasetName)) {
          return;
        }

        render();
      }

      render();

      return container;
    },
    visibleElements: {
      collapseButton: false,
      featureNavigation: false,
    },
  };
}

function renderPopupContent(
  container,
  attributes,
  { graphic, productContext, refreshAndRender, errorDetails }
) {
  const section = getOrCreatePopupSection(container);
  const actionBar = getDirectChildByClass(container, "popup-action-bar");

  if (actionBar) {
    const actionBarUpdate = updatePopupActionBar(actionBar, {
      attributes,
      graphic,
      productContext,
      refreshAndRender,
    });
    if (!actionBarUpdate.supported) {
      actionBar.remove();
    }
  } else {
    const nextActionBar = createPopupActionBar({
      attributes,
      graphic,
      productContext,
      refreshAndRender,
    });

    if (nextActionBar) {
      container.insertBefore(nextActionBar, section);
    }
  }

  updatePackagePopupWorkflow(
    container,
    createPackagePopupPresentation({
      productContext,
      attributes,
      workflowStatusLabels: Object.fromEntries(
        getAllStatuses().map((status) => [status.Id, status.Name])
      ),
    })
  );

  // Job/action updates must not replace focused error controls or selected error text
  // when the metadata itself has not changed.
  const columns = createPopupProductMetadataColumns(attributes, productContext);
  const signature = JSON.stringify({
    columns,
    statuses: columns.map((column) => formatProductStatus(column.item.status)),
  });
  if (shouldRenderProductContent(attributes) && section.metadataSignature === signature) return;
  const focusedErrorKey = errorDetails.beforeRender();
  section.replaceChildren();
  section.metadataSignature = null;
  if (shouldRenderProductContent(attributes)) {
    renderProductRows(section, columns, errorDetails);
    section.metadataSignature = signature;
  } else {
    renderGenericRows(section, attributes);
  }
  errorDetails.afterRender(focusedErrorKey, section);
}

function getOrCreatePopupSection(container) {
  const existingSection = getDirectChildByClass(container, "popup-section");

  if (existingSection) {
    return existingSection;
  }

  const section = document.createElement("div");
  section.className = "popup-section";
  section.tabIndex = -1;
  container.appendChild(section);

  return section;
}

function getDirectChildByClass(container, className) {
  return Array.from(container.children).find((child) => {
    return child.classList.contains(className);
  });
}

function renderProductRows(section, columns, errorDetails) {
  const table = createProductMetadataTable(columns, errorDetails);

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

function cleanupWhenDisconnected(element, cleanup, onConnected) {
  let hasBeenConnected = false;
  const handleConnection = () => {
    if (!hasBeenConnected && element.isConnected) {
      hasBeenConnected = true;
      // ArcGIS may prepare content without showing it. Start backend work only
      // for an attached session, and keep initial freshness failures silent.
      onConnected?.();
    }
  };
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
      handleConnection();
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

  handleConnection();
  requestAnimationFrame(handleConnection);
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

function createProductMetadataTable(columns, errorDetails) {
  if (columns.length === 0) {
    return null;
  }

  const rows = createProductMetadataRows(columns, errorDetails);
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

function createProductMetadataRows(columns, errorDetails) {
  const rows = [
    {
      label: "Product",
      getValue: (item) => formatProductTableValue(item?.datasetName),
      shouldShow: () => columns.some((column) => column.presentation?.productIdentity),
    },
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
      decorateCell: (cell, column) => {
        if (column.presentation?.statusCell) {
          applyPopupProductStatusCell(cell, column.item?.status, {
            resolveStatusId: getStatusIdByName,
          });
        }
      },
      getValue: (item) => formatProductStatus(item?.status),
    },
    {
      label: "Error message",
      getContent: (item, column) =>
        column.presentation?.compactError
          ? errorDetails.createTrigger(item?.errorMessage, column)
          : null,
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

function createProductTableRow({ label, getValue, getContent, decorateCell }, columns) {
  const row = document.createElement("tr");
  const labelCell = document.createElement("th");
  labelCell.scope = "row";
  labelCell.className = "popup-product-table__attribute";
  labelCell.textContent = label;
  row.appendChild(labelCell);

  for (const column of columns) {
    const cell = document.createElement("td");
    const content = getContent?.(column.item, column);
    if (content instanceof Node) {
      cell.appendChild(content);
    } else {
      cell.textContent = getValue?.(column.item) ?? "";
    }
    decorateCell?.(cell, column);
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
