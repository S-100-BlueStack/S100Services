import { buildAnalyzeUrl } from "../../analyze/routing/analyzeRoute.js";
import { noticeError, noticeInfo, noticeSuccess } from "../../notices/services/noticeService.js";
import { changeFreezeState, uploadProduct } from "../../data/api/productApi.js";
import { confirmAction } from "../../../shared/ui/confirm/services/confirmService.js";

const freezeState = new Map();

let isSending = false;
let activeDropdown = null;

export function createPopupActionBar(graphic) {
  closePopupActionDropdown();

  const attributes = graphic?.attributes ?? {};
  const featureKey = getFeatureKey(attributes);

  const container = document.createElement("div");
  container.className = "popup-action-bar";
  container.setAttribute("aria-label", "Popup actions");

  function render() {
    container.replaceChildren();

    container.appendChild(
      createActionRow([
        createFreezeAction({ attributes, featureKey, render }),
        createSendAction({ attributes, featureKey }),
      ])
    );

    container.appendChild(
      createActionRow([
        createDropdownAction({
          id: "export",
          label: "Export...",
          icon: "plus-square",
          items: [
            {
              id: "export-edition",
              label: "Edition",
              icon: "notepad-add",
              onClick: () => {
                noticeInfo("Export edition is not available yet", attributes.datasetName);
              },
            },
            {
              id: "export-update",
              label: "Update",
              icon: "notepad-edit",
              onClick: () => {
                noticeInfo("Export update is not available yet", attributes.datasetName);
              },
            },
          ],
        }),
        createRollbackAction({ attributes }),
        createDropdownAction({
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
        }),
      ])
    );
  }

  render();

  return container;
}

function createActionRow(actions) {
  const row = document.createElement("div");
  row.className = "popup-action-bar__row";

  for (const action of actions) {
    row.appendChild(action);
  }

  return row;
}

function createFreezeAction({ attributes, featureKey, render }) {
  const frozen = freezeState.get(featureKey) === true;

  return createAction({
    id: frozen ? "unfreeze-feature" : "freeze-feature",
    label: frozen ? "Unfreeze" : "Freeze",
    icon: frozen ? "brightness" : "snow",
    className: "popup-action-bar__action--freeze",
    onClick: async ({ anchorElement }) => {
      const result = await triggerFreeze(attributes.datasetName, !frozen, anchorElement);

      if (result?.success) {
        freezeState.set(featureKey, !frozen);
        render();
      }
    },
  });
}

function createSendAction({ attributes, featureKey }) {
  const frozen = freezeState.get(featureKey) === true;

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

function createDropdownAction({ id, label, icon, items }) {
  return createAction({
    id,
    label,
    icon,
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

function createAction({ id, label, icon, disabled = false, className = "", onClick }) {
  const action = document.createElement("calcite-action");

  action.icon = icon;
  action.text = label;
  action.title = label;
  action.scale = "m";
  action.appearance = "transparent";
  action.disabled = disabled;
  action.textEnabled = true;
  action.className = ["popup-action-bar__action", className].filter(Boolean).join(" ");
  action.dataset.popupActionId = id;

  // Keep attributes in sync with Calcite's DOM API. This is more reliable
  // when components upgrade after the element has already been created.
  action.setAttribute("text", label);
  action.setAttribute("title", label);
  action.setAttribute("text-enabled", "");

  action.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (action.disabled) {
      return;
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

  activeDropdown = {
    element: dropdown,
    anchorElement,
  };

  requestAnimationFrame(() => {
    document.addEventListener("click", handleOutsideDropdownClick);
    window.addEventListener("resize", closePopupActionDropdown);
    window.addEventListener("scroll", closePopupActionDropdown, true);
  });
}

function createDropdownItem(itemConfig) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "popup-action-dropdown__item";
  item.setAttribute("role", "menuitem");
  item.dataset.dropdownActionId = itemConfig.id;

  const icon = document.createElement("calcite-icon");
  icon.icon = itemConfig.icon;
  icon.scale = "s";

  const label = document.createElement("span");
  label.textContent = itemConfig.label;

  item.appendChild(icon);
  item.appendChild(label);

  item.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    closePopupActionDropdown();

    await itemConfig.onClick?.();
  });

  return item;
}

function positionDropdown(dropdown, anchorElement) {
  const rect = anchorElement.getBoundingClientRect();

  dropdown.style.top = `${rect.bottom + 4}px`;
  dropdown.style.left = `${Math.min(rect.left, window.innerWidth - dropdown.offsetWidth - 8)}px`;
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
  window.removeEventListener("resize", closePopupActionDropdown);
  window.removeEventListener("scroll", closePopupActionDropdown, true);
}

function getFeatureKey(attributes) {
  return attributes.featureKey ?? attributes.datasetName ?? attributes.id;
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
    message: `Are you sure you want to send ${datasetName} immediately? This will upload the product to IC-ENC immediately without waiting for the daily automated upload.`,
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
