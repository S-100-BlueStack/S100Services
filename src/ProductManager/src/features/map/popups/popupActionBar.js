import { buildAnalyzeUrl } from "../../analyze/routing/analyzeRoute.js";
import { exportNewEdition, exportNewUpdate } from "../../data/api/exportApi.js";
import { changeFreezeState, uploadProduct } from "../../data/api/productApi.js";
import { noticeError, noticeInfo, noticeSuccess } from "../../notices/services/noticeService.js";
import { confirmAction } from "../../../shared/ui/confirm/services/confirmService.js";
import { isStatusFrozen } from "../state/featureState.js";

let isSending = false;
let activeDropdown = null;

const activeExportActionIds = new Set();
const DROPDOWN_POINTER_CLOSE_DISTANCE = 90;

export function createPopupActionBar({ attributes, refreshAndRender } = {}) {
  closePopupActionDropdown();

  const container = document.createElement("div");
  container.className = "popup-action-bar";
  container.setAttribute("aria-label", "Popup actions");

  const frozen = isStatusFrozen(attributes?.status);

  container.appendChild(
    createActionRow([
      createFreezeAction({
        attributes,
        frozen,
        refreshAndRender,
      }),
      createSendAction({
        attributes,
        frozen,
      }),
    ])
  );

  container.appendChild(
    createActionRow([
      createExportAction({
        attributes,
        frozen,
        refreshAndRender,
      }),
      createRollbackAction({
        attributes,
      }),
      createToolsAction({
        attributes,
      }),
    ])
  );

  return container;
}

function createFreezeAction({ attributes, frozen, refreshAndRender }) {
  return createAction({
    id: frozen ? "unfreeze-feature" : "freeze-feature",
    label: frozen ? "Unfreeze" : "Freeze",
    icon: frozen ? "brightness" : "snow",
    className: "popup-action-bar__action--freeze",
    onClick: async ({ anchorElement }) => {
      const nextFrozenState = !frozen;
      const result = await triggerFreeze(attributes.datasetName, nextFrozenState, anchorElement);

      if (!result?.success) {
        return;
      }

      await refreshAndRender?.();
    },
  });
}

function createActionRow(actions) {
  const row = document.createElement("div");
  row.className = "popup-action-bar__row";

  for (const action of actions) {
    row.appendChild(action);
  }

  return row;
}

function createSendAction({ attributes, frozen }) {
  return createAction({
    id: "send-immediately",
    label: "Send to IC-ENC",
    icon: "send",
    disabled: frozen,
    className: "popup-action-bar__action--send",
    onClick: async ({ anchorElement }) => {
      await sendImmediately(attributes.datasetName, anchorElement);
    },
  });
}

function createExportAction({ attributes, frozen, refreshAndRender }) {
  return createDropdownAction({
    id: "export",
    label: "Export...",
    icon: "plus-square",
    items: [
      {
        id: "export-all",
        label: "All",
        icon: "plus-square",
        items: [
          createExportLeafAction({
            id: "export-all-edition",
            label: "Edition",
            icon: "notepad-add",
            attributes,
            frozen,
            implemented: true,
            scope: "All",
            exportType: "Edition",
            request: exportNewEdition,
            refreshAndRender,
          }),
          createExportLeafAction({
            id: "export-all-update",
            label: "Update",
            icon: "notepad-edit",
            attributes,
            frozen,
            implemented: true,
            scope: "All",
            exportType: "Update",
            request: exportNewUpdate,
            refreshAndRender,
          }),
        ],
      },
      {
        id: "export-s57",
        label: "S57",
        icon: "plus-square",
        items: [
          createExportLeafAction({
            id: "s57-export-edition",
            label: "Edition",
            icon: "notepad-add",
            attributes,
            frozen,
            implemented: false,
            scope: "S57",
            exportType: "Edition",
          }),
          createExportLeafAction({
            id: "s57-export-update",
            label: "Update",
            icon: "notepad-edit",
            attributes,
            frozen,
            implemented: false,
            scope: "S57",
            exportType: "Update",
          }),
        ],
      },
      {
        id: "export-s100",
        label: "S100",
        icon: "plus-square",
        items: [
          createExportLeafAction({
            id: "s100-export-edition",
            label: "Edition",
            icon: "notepad-add",
            attributes,
            frozen,
            implemented: false,
            scope: "S100",
            exportType: "Edition",
          }),
          createExportLeafAction({
            id: "s100-export-update",
            label: "Update",
            icon: "notepad-edit",
            attributes,
            frozen,
            implemented: false,
            scope: "S100",
            exportType: "Update",
          }),
        ],
      },
    ],
  });
}

function createExportLeafAction({
  id,
  label,
  icon,
  attributes,
  frozen,
  implemented,
  scope,
  exportType,
  request,
  refreshAndRender,
}) {
  return {
    id,
    label,
    icon,
    disabled: frozen || !implemented,
    disabledReason: getExportDisabledReason({
      frozen,
      implemented,
    }),
    onClick: async ({ anchorElement }) => {
      const result = await triggerExport({
        actionId: id,
        datasetName: attributes.datasetName,
        scope,
        exportType,
        request,
        anchorElement,
      });

      if (result?.success) {
        await refreshAndRender?.();
      }
    },
  };
}

function getExportDisabledReason({ frozen, implemented }) {
  if (frozen) {
    return "Unfreeze the product before exporting.";
  }

  if (!implemented) {
    return "Feature is not available yet.";
  }

  return null;
}

function createToolsAction({ attributes }) {
  return createDropdownAction({
    id: "tools",
    label: "Tools",
    icon: "wrench",
    items: [
      {
        id: "analyze",
        label: "Analyze",
        icon: "magnifying-glass",
        onClick: () => {
          openAnalyzePage(attributes.datasetName);
        },
      },
    ],
  });
}

function createDropdownAction({ id, label, icon, items }) {
  return createAction({
    id,
    label,
    icon,
    closeDropdownOnClick: false,
    className: "popup-action-bar__action--dropdown",
    onClick: ({ anchorElement }) => {
      togglePopupActionDropdown({
        anchorElement,
        items,
      });
    },
  });
}
function createRollbackAction({ attributes }) {
  return createAction({
    id: "rollback",
    label: "Rollback",
    icon: "undo",
    className: "popup-action-bar__action--rollback",
    onClick: () => {
      noticeInfo("Rollback is not available yet", attributes.datasetName);
    },
  });
}

function createAction({
  id,
  label,
  icon,
  disabled = false,
  className = "",
  closeDropdownOnClick = true,
  onClick,
}) {
  const action = document.createElement("calcite-action");

  action.icon = icon;
  action.text = label;
  action.title = label;
  action.scale = "m";
  action.appearance = "transparent";
  action.disabled = Boolean(disabled);
  action.textEnabled = true;
  action.className = ["popup-action-bar__action", className].filter(Boolean).join(" ");
  action.dataset.popupActionId = id;

  // Keep attributes in sync because Calcite upgrades custom elements asynchronously.
  action.setAttribute("text", label);
  action.setAttribute("title", label);
  action.setAttribute("text-enabled", "");

  if (disabled) {
    action.setAttribute("disabled", "");
    action.setAttribute("aria-disabled", "true");
  }

  action.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (action.disabled) {
      return;
    }

    if (closeDropdownOnClick) {
      closePopupActionDropdown();
    }

    await onClick?.({
      anchorElement: action,
    });
  });

  return action;
}

function togglePopupActionDropdown({ anchorElement, items }) {
  if (activeDropdown?.anchorElement === anchorElement) {
    closePopupActionDropdown();
    return;
  }

  openPopupActionDropdown({
    anchorElement,
    items,
  });
}

function openPopupActionDropdown({ anchorElement, items }) {
  closePopupActionDropdown();

  if (!anchorElement || !items?.length) {
    return;
  }

  const dropdown = document.createElement("div");
  dropdown.className = "popup-action-dropdown";
  dropdown.setAttribute("role", "menu");

  for (const item of items) {
    dropdown.appendChild(createDropdownItem(item));
  }

  document.body.appendChild(dropdown);
  positionDropdown(dropdown, anchorElement);
  anchorElement.blur?.();

  activeDropdown = {
    element: dropdown,
    anchorElement,
  };

  requestAnimationFrame(() => {
    document.addEventListener("click", handleOutsideDropdownClick);
    document.addEventListener("pointermove", handleDropdownPointerMove);
    window.addEventListener("resize", closePopupActionDropdown);
    window.addEventListener("scroll", closePopupActionDropdown, true);
  });
}

function createDropdownItem(itemConfig, level = 0) {
  const hasChildren = Array.isArray(itemConfig.items) && itemConfig.items.length > 0;
  const disabled = itemConfig.disabled === true;

  const node = document.createElement("div");
  node.className = "popup-action-dropdown__node";

  if (hasChildren) {
    node.classList.add("popup-action-dropdown__node--has-children");
  }

  const item = document.createElement("button");
  item.type = "button";
  item.className = "popup-action-dropdown__item";
  item.disabled = disabled;
  item.setAttribute("role", "menuitem");
  item.dataset.dropdownActionId = itemConfig.id;
  item.style.setProperty("--popup-action-dropdown-level", String(level));

  if (hasChildren) {
    item.classList.add("popup-action-dropdown__item--has-children");
    item.setAttribute("aria-haspopup", "menu");
  }

  if (disabled) {
    item.setAttribute("aria-disabled", "true");
    item.title = itemConfig.disabledReason ?? "This action is unavailable.";
  }

  item.appendChild(createDropdownIcon(itemConfig.icon));

  const label = document.createElement("span");
  label.className = "popup-action-dropdown__label";
  label.textContent = itemConfig.label;
  item.appendChild(label);

  if (hasChildren) {
    const indicator = document.createElement("calcite-icon");
    indicator.className = "popup-action-dropdown__submenu-indicator";
    indicator.icon = "chevron-right";
    indicator.scale = "s";
    item.appendChild(indicator);

    const submenu = document.createElement("div");
    submenu.className = "popup-action-dropdown popup-action-dropdown--submenu";
    submenu.setAttribute("role", "menu");

    for (const childItem of itemConfig.items) {
      submenu.appendChild(createDropdownItem(childItem, level + 1));
    }

    // Parent menu items are hover-only triggers. Preventing mousedown keeps the
    // button from receiving focus, so the submenu cannot stay open after click.
    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });

    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      item.blur();
    });

    node.appendChild(item);
    node.appendChild(submenu);

    return node;
  }

  item.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (item.disabled) {
      return;
    }

    // Dropdown items are removed before the action runs. Keep the top-level
    // Export/Tools button as a stable confirmation anchor for actions that open
    // the shared confirm popover.
    const stableAnchorElement = activeDropdown?.anchorElement ?? item;

    closePopupActionDropdown();

    await itemConfig.onClick?.({
      anchorElement: stableAnchorElement,
    });
  });

  node.appendChild(item);

  return node;
}

function createDropdownIcon(iconName) {
  if (!iconName) {
    const placeholder = document.createElement("span");
    placeholder.className = "popup-action-dropdown__icon-placeholder";
    return placeholder;
  }

  const icon = document.createElement("calcite-icon");
  icon.icon = iconName;
  icon.scale = "s";
  return icon;
}

function positionDropdown(dropdown, anchorElement) {
  const rect = anchorElement.getBoundingClientRect();
  const dropdownOffset = 8;
  const viewportPadding = 8;

  const left = Math.min(rect.left, window.innerWidth - dropdown.offsetWidth - viewportPadding);
  const arrowLeft = rect.left + rect.width / 2 - left - 5;

  dropdown.style.top = `${rect.bottom + dropdownOffset}px`;
  dropdown.style.left = `${left}px`;
  dropdown.style.setProperty("--pm-popup-dropdown-arrow-left", `${Math.max(12, arrowLeft)}px`);
}

function handleOutsideDropdownClick(event) {
  if (!activeDropdown) {
    return;
  }

  const target = event.target;

  if (activeDropdown.element.contains(target) || activeDropdown.anchorElement.contains?.(target)) {
    return;
  }

  closePopupActionDropdown();
}

function closePopupActionDropdown() {
  if (!activeDropdown) {
    return;
  }

  activeDropdown.element.remove();
  activeDropdown = null;

  document.removeEventListener("click", handleOutsideDropdownClick);
  document.removeEventListener("pointermove", handleDropdownPointerMove);
  window.removeEventListener("resize", closePopupActionDropdown);
  window.removeEventListener("scroll", closePopupActionDropdown, true);
}

function openAnalyzePage(datasetName) {
  if (!datasetName) {
    noticeError("Cannot analyze product", "The selected feature does not have a datasetName.");
    return;
  }

  const analyzeUrl = buildAnalyzeUrl([datasetName]);
  const openedWindow = window.open(analyzeUrl, "_blank", "noopener,noreferrer");

  if (!openedWindow) {
    noticeError(
      "Analyze page was blocked",
      "The browser blocked the new tab. Allow popups for this site and try again."
    );
  }
}

async function triggerFreeze(datasetName, state, anchorElement) {
  const confirmed = await confirmAction({
    title: `${state ? "Freeze" : "Unfreeze"} ${datasetName}`,
    message: `Are you sure you want to ${
      state ? "freeze" : "unfreeze"
    } ${datasetName}? Freezing a product will prevent it from being sent to IC-ENC until it is unfrozen.`,
    confirmText: "Confirm",
    cancelText: "Cancel",
    anchorElement,
  });

  if (!confirmed) {
    return null;
  }

  const result = await changeFreezeState(datasetName, state);

  if (result.success) {
    noticeSuccess(`Product ${datasetName} ${state ? "frozen" : "unfrozen"} successfully`, null, {
      countAsUnread: false,
    });
  } else if (result.networkError) {
    noticeError(`Network error while ${state ? "freezing" : "unfreezing"} ${datasetName}`);
  } else {
    noticeError(
      `Failed to ${state ? "freeze" : "unfreeze"} ${datasetName} (${result.status})`,
      `${result.statusText}`
    );
  }

  return result;
}

async function sendImmediately(datasetName, anchorElement) {
  if (isSending) {
    return;
  }

  const confirmed = await confirmAction({
    title: `Send ${datasetName}`,
    message: `Are you sure you want to send ${datasetName} immediately? This will upload the product to IC-ENC immediately without waiting for the automated upload.`,
    confirmText: "Send",
    cancelText: "Cancel",
    anchorElement,
  });

  if (!confirmed) {
    return;
  }

  isSending = true;

  try {
    const result = await uploadProduct(datasetName);

    if (result.success) {
      noticeSuccess(`Product ${datasetName} sent successfully`, null, {
        countAsUnread: false,
      });
    } else if (result.networkError) {
      noticeError(`Network error while sending ${datasetName}`);
    } else {
      noticeError(`Failed to send ${datasetName} (${result.status})`, `${result.statusText}`);
    }
  } finally {
    isSending = false;
  }
}

async function triggerExport({ actionId, datasetName, scope, exportType, request, anchorElement }) {
  if (!datasetName) {
    noticeError("Cannot export product", "The selected feature does not have a datasetName.");
    return null;
  }

  if (typeof request !== "function") {
    noticeError(
      "Export is not configured",
      `${scope} ${exportType} does not have an export endpoint configured yet.`
    );
    return null;
  }

  const exportLabel = `${scope} ${exportType}`;
  const actionKey = `${datasetName}:${actionId}`;

  if (activeExportActionIds.has(actionKey)) {
    return null;
  }

  const confirmed = await confirmAction({
    title: `Export ${exportLabel} for ${datasetName}`,
    message: `Are you sure you want to export ${exportLabel.toLowerCase()} for ${datasetName}?`,
    confirmText: "Export",
    cancelText: "Cancel",
    anchorElement,
  });

  if (!confirmed) {
    return null;
  }

  activeExportActionIds.add(actionKey);

  try {
    const result = await request(datasetName);

    if (result.success) {
      noticeSuccess(`Export request sent for ${datasetName}`, exportLabel, {
        countAsUnread: false,
      });
    } else if (result.networkError) {
      noticeError(`Network error while exporting ${datasetName}`, exportLabel);
    } else {
      noticeError(
        `Failed to export ${datasetName} (${result.status})`,
        getApiResultMessage(result) ?? exportLabel
      );
    }

    return result;
  } finally {
    activeExportActionIds.delete(actionKey);
  }
}

function getApiResultMessage(result) {
  if (!result) {
    return null;
  }

  if (typeof result.errorMessage === "string" && result.errorMessage.trim()) {
    return result.errorMessage;
  }

  if (typeof result.statusText === "string" && result.statusText.trim()) {
    return result.statusText;
  }

  if (typeof result.data === "string" && result.data.trim()) {
    return result.data;
  }

  if (result.data && typeof result.data === "object") {
    return (
      result.data.message ??
      result.data.Message ??
      result.data.error ??
      result.data.Error ??
      result.data.title ??
      result.data.Title ??
      null
    );
  }

  return null;
}

function handleDropdownPointerMove(event) {
  if (!activeDropdown) {
    return;
  }

  const target = event.target;

  if (activeDropdown.element.contains(target) || activeDropdown.anchorElement.contains?.(target)) {
    return;
  }

  const safeRect = getExpandedDropdownSafeRect(activeDropdown, DROPDOWN_POINTER_CLOSE_DISTANCE);

  if (isPointInsideRect(event.clientX, event.clientY, safeRect)) {
    return;
  }

  closePopupActionDropdown();
}

function getExpandedDropdownSafeRect(dropdownState, distance) {
  const dropdownRect = dropdownState.element.getBoundingClientRect();
  const anchorRect = dropdownState.anchorElement.getBoundingClientRect();

  return {
    top: Math.min(dropdownRect.top, anchorRect.top) - distance,
    right: Math.max(dropdownRect.right, anchorRect.right) + distance,
    bottom: Math.max(dropdownRect.bottom, anchorRect.bottom) + distance,
    left: Math.min(dropdownRect.left, anchorRect.left) - distance,
  };
}

function isPointInsideRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
