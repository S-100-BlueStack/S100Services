import { closePopupActionDropdown, togglePopupActionDropdown } from "./popupActionDropdown.js";

export function createActionButton(actionConfig) {
  const action = document.createElement("calcite-action");
  const hasDropdown = Array.isArray(actionConfig.items) && actionConfig.items.length > 0;

  action.icon = actionConfig.icon;
  action.text = actionConfig.label;
  action.title = actionConfig.disabledReason ?? actionConfig.label;
  action.scale = "m";
  action.appearance = "transparent";
  action.disabled = Boolean(actionConfig.disabled);
  action.textEnabled = true;
  action.className = ["popup-action-bar__action", actionConfig.className].filter(Boolean).join(" ");
  action.dataset.popupActionId = actionConfig.id;

  // Calcite upgrades custom elements asynchronously, so set attributes as well
  // as properties to keep first render and upgraded render aligned.
  action.setAttribute("text", actionConfig.label);
  action.setAttribute("title", actionConfig.disabledReason ?? actionConfig.label);
  action.setAttribute("text-enabled", "");

  if (actionConfig.disabled) {
    action.setAttribute("disabled", "");
    action.setAttribute("aria-disabled", "true");
  }

  action.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (action.disabled) {
      return;
    }

    if (hasDropdown) {
      togglePopupActionDropdown({
        anchorElement: action,
        items: actionConfig.items,
      });
      return;
    }

    closePopupActionDropdown();

    await actionConfig.onClick?.({
      anchorElement: action,
    });
  });

  return action;
}
