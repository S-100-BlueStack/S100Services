import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import { noticeError, noticeInfo, noticeSuccess } from "../../notices/services/noticeService.js";
import { changeFreezeState, uploadProduct } from "../../data/api/productApi.js";
import { confirmAction } from "../../../shared/ui/confirm/services/confirmService.js";
import { resetPopupActions, setFrozenPopupActions } from "./popupActionsConfig.js";

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

      const featureKey = feature.attributes.featureKey ?? feature.attributes.datasetName;

      if (event.action.id === "freeze-feature" || event.action.id === "freeze-feature-sun") {
        const newState = !(freezeState.get(featureKey) === true);

        const freezeButton = document.querySelector(
          '[data-action-id="freeze-feature"], [data-action-id="freeze-feature-sun"]'
        );

        const result = await triggerFreeze(feature.attributes.datasetName, newState, freezeButton);

        if (result.success) {
          freezeState.set(featureKey, newState);
          updateUI(view, newState);
        }
      }

      if (event.action.id === "send-immediately") {
        const sendButton = document.querySelector('[data-action-id="send-immediately"]');
        await sendImmediately(feature.attributes.datasetName, sendButton);
      }
    }
  );
}

function updateUI(view, frozen) {
  if (frozen) {
    setFrozenPopupActions(view);
    return;
  }

  resetPopupActions(view);
}

async function triggerFreeze(datasetName, state, anchorElement) {
  const confirmed = await confirmAction({
    title: `${state ? "Freeze" : "Unfreeze"} ${datasetName}`,
    message: `Are you sure you want to ${state ? "freeze" : "unfreeze"} ${datasetName}?`,
    confirmText: "Confirm",
    cancelText: "Cancel",
    anchorElement,
  });

  if (!confirmed) {
    return false;
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
      ` ${result.statusText}`
    );
  }

  return result;
}

let isSending = false;

async function sendImmediately(datasetName, anchorElement) {
  if (isSending) {
    return;
  }

  const confirmed = await confirmAction({
    title: `Send ${datasetName}`,
    message: `Are you sure you want to send ${datasetName} immediately?`,
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
