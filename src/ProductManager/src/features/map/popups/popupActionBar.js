import { isStatusFrozen } from "../state/featureState.js";
import { attributesSupportLayerCapability } from "../config/layerDefinitions.js";
import { createPopupActionGroups } from "./popupActionConfig.js";
import { createActionButton } from "./popupActionDom.js";
import { closePopupActionDropdown } from "./popupActionDropdown.js";

export function createPopupActionBar({ attributes, refreshAndRender } = {}) {
  closePopupActionDropdown();

  if (!attributesSupportLayerCapability(attributes, "supportsProductActions")) {
    return null;
  }

  const container = document.createElement("div");
  container.className = "popup-action-bar";
  container.setAttribute("aria-label", "Popup actions");

  const frozen = isStatusFrozen(attributes?.status);
  const actionGroups = createPopupActionGroups({
    attributes,
    frozen,
    refreshAndRender,
  });

  for (const actions of actionGroups) {
    container.appendChild(createActionRow(actions));
  }

  return container;
}

function createActionRow(actions) {
  const row = document.createElement("div");
  row.className = "popup-action-bar__row";

  for (const action of actions) {
    row.appendChild(createActionButton(action));
  }

  return row;
}
