import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";

const FREEZE_UI_MODE = "toggle"; // "toggle" | "color"

let freezeAction = null;
let sendAction = null;

export function zoomOut() {
  const graphic = view.popup.selectedFeature;

  view.goTo({
    target: graphic.geometry,
    scale: view.scale * 2,
  });
}

const freezeState = new Map();

export function registerPopupActions(view) {
  reactiveUtils.watch(
    () => view.popup.selectedFeature,
    (feature) => {
      if (!feature) return;

      const id = feature.attributes.id;
      const frozen = freezeState.get(id) === true;

      updateUI(view, frozen);
    },
  );

  reactiveUtils.on(
    () => view.popup,
    "trigger-action",
    (event) => {
      const feature = view.popup.selectedFeature;
      if (!feature) return;

      const id = feature.attributes.id;

      if (event.action.id === "freeze-feature") {
        const newState = !(freezeState.get(id) === true);

        freezeState.set(id, newState);

        updateUI(view, newState);
      }

      if (event.action.id === "send-immediately") {
        mockSendImmediately(feature);
      }
    },
  );
}

function updateUI(view, frozen) {
  if (frozen) {
    view.popup.actions = [
      {
        title: "Unfreeze",
        id: "freeze-feature",
        icon: "brightness",
      },
      {
        title: "Send immediately",
        id: "send-immediately",
        icon: "send",
        disabled: true,
      },
    ];
  } else {
    view.popup.actions = [
      {
        title: "Freeze",
        id: "freeze-feature",
        icon: "snow",
      },
      {
        title: "Send immediately",
        id: "send-immediately",
        icon: "send",
        disabled: false,
      },
    ];
  }
}

function mockSendImmediately(feature) {
  console.log("Send immediately:", feature.attributes.id);
}
