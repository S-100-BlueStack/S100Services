import { buildAnalyzeUrl } from "../../analyze/routing/analyzeRoute.js";
import { noticeError } from "../../notices/services/noticeService.js";
import { addNotice } from "../../notices/state/noticeStore.js";
import { buildReviewUrl } from "../../review/routing/reviewRoute.js";
import {
  getLatestActiveReviewSession,
  sendProductsToReviewSession,
  subscribeReviewSessionRegistry,
} from "../../review/session/reviewSessionChannel.js";
import {
  clearProductCollection,
  getProductCollectionSnapshot,
  removeProductCollectionProduct,
  subscribeProductCollection,
} from "../state/productCollectionStore.js";

export function initProductCollectionTray({ root = document.body } = {}) {
  const tray = document.createElement("section");
  tray.className = "pm-product-collection-tray";
  tray.hidden = true;
  tray.setAttribute("aria-label", "Product collection");

  root.appendChild(tray);

  let currentSnapshot = getProductCollectionSnapshot();

  const render = () => {
    renderProductCollectionTray(tray, currentSnapshot);
  };

  const unsubscribeCollection = subscribeProductCollection((snapshot) => {
    currentSnapshot = snapshot;
    render();
  });

  const unsubscribeReviewSessions = subscribeReviewSessionRegistry(render);

  render();

  return {
    element: tray,
    destroy() {
      unsubscribeCollection();
      unsubscribeReviewSessions();
      tray.remove();
    },
  };
}

function renderProductCollectionTray(tray, snapshot) {
  tray.replaceChildren();

  if (snapshot.count === 0) {
    tray.hidden = true;
    return;
  }

  tray.hidden = false;
  tray.appendChild(createHeader(snapshot));
  tray.appendChild(createProductList(snapshot.items));
  tray.appendChild(createActions(snapshot.datasetNames));
}

function createHeader(snapshot) {
  const header = document.createElement("div");
  header.className = "pm-product-collection-tray__header";

  const title = document.createElement("div");
  title.className = "pm-product-collection-tray__title";
  title.textContent = "Collection";

  const count = document.createElement("span");
  count.className = "pm-product-collection-tray__count";
  count.textContent = `${snapshot.count} product${snapshot.count === 1 ? "" : "s"}`;

  const titleGroup = document.createElement("div");
  titleGroup.className = "pm-product-collection-tray__title-group";
  titleGroup.append(title, count);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "pm-product-collection-tray__clear-button";
  clearButton.title = "Clear collection";
  clearButton.setAttribute("aria-label", "Clear collection");
  clearButton.addEventListener("click", () => {
    clearProductCollection();
  });

  header.append(titleGroup, clearButton);

  return header;
}

function createProductList(items) {
  const list = document.createElement("div");
  list.className = "pm-product-collection-tray__list";
  list.setAttribute("role", "list");

  for (const item of items) {
    list.appendChild(createProductItem(item));
  }

  return list;
}

function createProductItem(item) {
  const row = document.createElement("div");
  row.className = "pm-product-collection-tray__item";
  row.setAttribute("role", "listitem");

  const name = document.createElement("span");
  name.className = "pm-product-collection-tray__item-name";
  name.textContent = item.datasetName;
  name.title = item.datasetName;

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "pm-product-collection-tray__remove-button";
  removeButton.title = `Remove ${item.datasetName}`;
  removeButton.setAttribute("aria-label", `Remove ${item.datasetName}`);
  removeButton.addEventListener("click", () => {
    removeProductCollectionProduct(item.id);
  });

  row.append(name, removeButton);

  return row;
}

function createActions(datasetNames) {
  const footer = document.createElement("div");
  const activeReviewSession = getLatestActiveReviewSession();

  footer.className = "pm-product-collection-tray__footer";
  footer.toggleAttribute("data-review-session-active", Boolean(activeReviewSession));

  if (activeReviewSession) {
    footer.append(
      createActionButton({
        label: "New Review",
        title: "Open a new Product Review tab with the current collection",
        onClick: () => {
          openReviewCollection(datasetNames);
        },
      }),
      createActionButton({
        label: "Update Review",
        title: "Replace the latest open Product Review tab with the current collection",
        onClick: () => {
          updateReviewCollection(datasetNames, activeReviewSession);
        },
      }),
      createActionButton({
        label: "Analyze",
        title: "Open Analyze in a new tab with the current collection",
        onClick: () => {
          openCollectionUrl(buildAnalyzeUrl(datasetNames), "Analyze page was blocked");
        },
      })
    );

    return footer;
  }

  footer.append(
    createActionButton({
      label: "Review",
      title: "Open Product Review in a new tab",
      onClick: () => {
        openReviewCollection(datasetNames);
      },
    }),
    createActionButton({
      label: "Analyze",
      title: "Open Analyze in a new tab with the current collection",
      onClick: () => {
        openCollectionUrl(buildAnalyzeUrl(datasetNames), "Analyze page was blocked");
      },
    })
  );

  return footer;
}

function createActionButton({ label, title, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pm-product-collection-tray__action";
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.addEventListener("click", onClick);

  return button;
}

function openReviewCollection(datasetNames) {
  openCollectionUrl(buildReviewUrl(datasetNames), "Product Review page was blocked");
}

function updateReviewCollection(datasetNames, activeReviewSession) {
  const sent = sendProductsToReviewSession(datasetNames, {
    sessionId: activeReviewSession.sessionId,
    mode: "replace",
  });

  if (!sent) {
    noticeError(
      "Product Review could not be updated",
      "The open Review tab could not be reached. Open a new Review tab and try again."
    );
    return;
  }

  addNotice({
    type: "success",
    message: `Updated Product Review with ${datasetNames.length} product${
      datasetNames.length === 1 ? "" : "s"
    }`,
    duration: 2200,
    storeInCenter: false,
  });
}

function openCollectionUrl(url, errorTitle) {
  const openedWindow = window.open(url, "_blank", "noopener,noreferrer");

  if (!openedWindow) {
    noticeError(errorTitle, "Allow popups for this site and try again.");
  }
}
