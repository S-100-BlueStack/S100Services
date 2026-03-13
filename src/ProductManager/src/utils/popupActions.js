import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import {
  noticeError,
  noticeSuccess,
  noticeInfo,
} from "../js/services/noticeService.js";
import { uploadProduct } from "../api/api.js";
import { changeFreezeState } from "../api/api.js";

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

      if (event.action.id === "freeze-feature") {
        const newState = !(freezeState.get(id) === true);

        const result = await triggerFreeze(
          feature.attributes.datasetName,
          newState,
        );
        if (result.success) {
          freezeState.set(id, newState);
          updateUI(view, newState);
        }
      }

      if (event.action.id === "send-immediately") {
        sendImmediately(feature.attributes.datasetName);
      }
    },
  );
}

export function registerPopupHeaderActions(view) {
  reactiveUtils.watch(
    () => view.popup.features,
    (features) => {
      if (!features || !features.length) return;

      const feature = features[0];

      const flowItem = document.querySelector("calcite-flow-item");
      if (!flowItem) return;

      const title = flowItem.querySelector(
        "header-actions--end header-actions",
      );
      if (!title) return;

      // undgå dobbelt knap
      let button = flowItem.querySelector(".copy-dataset-btn");

      if (!button) {
        button = document.createElement("calcite-action");
        button.setAttribute("icon", "copy");
        button.setAttribute("scale", "s");

        button.className = "copy-dataset-btn";

        // wrapper til title + icon
        const wrapper = document.createElement("div");
        wrapper.className = "popup-title-wrapper";

        title.parentNode.insertBefore(wrapper, title);

        wrapper.appendChild(title);
        wrapper.appendChild(button);
      }

      button.onclick = () => {
        const dataset = feature.attributes.datasetName;
        navigator.clipboard.writeText(dataset);
      };
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

async function triggerFreeze(datasetName, state) {
  const result = await changeFreezeState(datasetName, state);
  if (result.success) {
    noticeSuccess(
      `Product ${datasetName} ${state ? "frozen" : "unfrozen"} successfully`,
    );
  } else if (result.networkError) {
    noticeError(
      `Network error while ${state ? "freezing" : "unfreezing"} ${datasetName}`,
    );
  } else {
    noticeError(
      `Failed to ${state ? "freeze" : "unfreeze"} ${datasetName}: (${result.status}) ${result.statusText}`,
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
    noticeError(
      `Failed to send ${datasetName}: (${result.status}) ${result.statusText}`,
    );
  }
}
function mockSendImmediately(feature) {
  console.log("Send immediately:", feature.attributes.id);
  noticeInfo(`Feature ${feature.attributes.id} sent immediately.`);
}
