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
