import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import { noticeError, noticeInfo, noticeSuccess } from "../../notices/services/noticeService.js";
import { changeFreezeState, uploadProduct } from "../../data/api/productApi.js";

let freezeAction = null;
let sendAction = null;

const freezeState = new Map();

export function registerPopupActions(view) {
  reactiveUtils.on(
    () => view.popup,
    "trigger-action",
    async (event) => {
      const feature = view.popup.selectedFeature;
      if (!feature) return;

      const id = feature.attributes.id;

      if (event.action.id === "freeze-feature" || event.action.id === "freeze-feature-sun") {
        const newState = !(freezeState.get(id) === true);

        const result = await triggerFreeze(feature.attributes.datasetName, newState);
        if (result.success) {
          freezeState.set(id, newState);
          updateUI(view, newState);
        }
      }

      if (event.action.id === "send-immediately") {
        sendImmediately(feature.attributes.datasetName);
      }
    }
  );
}

function updateUI(view, frozen) {
  view.popup.actions = frozen
    ? [
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
      ]
    : [
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
      ];
}

async function triggerFreeze(datasetName, state) {
  const result = await changeFreezeState(datasetName, state);
  if (result.success) {
    noticeSuccess(`Product ${datasetName} ${state ? "frozen" : "unfrozen"} successfully`);
  } else if (result.networkError) {
    noticeError(`Network error while ${state ? "freezing" : "unfreezing"} ${datasetName}`);
  } else {
    noticeError(
      `Failed to ${state ? "freeze" : "unfreeze"} ${datasetName}: (${result.status}) ${result.statusText}`
    );
  }
  return result;
}

async function sendImmediately(datasetName) {
  const result = await uploadProduct(datasetName);

  if (result.success) {
    noticeSuccess(`Product ${datasetName} sent successfully`);
  } else if (result.networkError) {
    noticeError(`Network error while sending ${datasetName}`);
  } else {
    noticeError(`Failed to send ${datasetName}: (${result.status}) ${result.statusText}`);
  }
}
