// DEPRECATED:
// This file defines the old Esri popup action arrays for view.popup.actions.
//
// The current popup action UI is custom-rendered through popupActionBar.js.
// New popup buttons, dropdowns, disabled states, and freeze/send behavior should
// be implemented in:
// - src/features/map/popups/popupActionBar.js
//
// Remove this file when all view.popup.actions usage has been removed.
export function createDefaultPopupActions() {
  return [
    {
      title: "Freeze",
      id: "freeze-feature",
      icon: "snow",
      className: "popup-action popup-action-freeze",
    },
    {
      title: "Send immediately",
      id: "send-immediately",
      icon: "send",
      disabled: false,
      className: "popup-action popup-action-send",
    },
    {},
  ];
}

export function createFrozenPopupActions() {
  return [
    {
      title: "Unfreeze",
      id: "freeze-feature-sun",
      icon: "brightness",
      className: "popup-action popup-action-freeze",
    },
    {
      title: "Send immediately",
      id: "send-immediately",
      icon: "send",
      disabled: true,
      className: "popup-action popup-action-send is-disabled",
    },
  ];
}

export function resetPopupActions(view) {
  view.popup.actions = createDefaultPopupActions();
}

export function setFrozenPopupActions(view) {
  view.popup.actions = createFrozenPopupActions();
}

export function clearPopupActions(view) {
  view.popup.actions = [];
}
