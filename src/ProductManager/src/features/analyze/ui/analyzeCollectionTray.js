import { buildAnalyzeUrl } from "../routing/analyzeRoute.js";
import { buildReviewUrl } from "../../review/routing/reviewRoute.js";
import {
  clearAnalyzeCollection,
  getAnalyzeCollectionSnapshot,
  removeAnalyzeCollectionProduct,
  subscribeAnalyzeCollection,
} from "../state/analyzeCollectionStore.js";
import { noticeError } from "../../notices/services/noticeService.js";

export function initAnalyzeCollectionTray({ root = document.body } = {}) {
  const tray = document.createElement("section");
  tray.className = "pm-analyze-collection-tray";
  tray.hidden = true;
  tray.setAttribute("aria-label", "Product collection");

  root.appendChild(tray);

  const unsubscribe = subscribeAnalyzeCollection((snapshot) => {
    renderAnalyzeCollectionTray(tray, snapshot);
  });

  renderAnalyzeCollectionTray(tray, getAnalyzeCollectionSnapshot());

  return {
    element: tray,
    destroy() {
      unsubscribe();
      tray.remove();
    },
  };
}

function renderAnalyzeCollectionTray(tray, snapshot) {
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
  header.className = "pm-analyze-collection-tray__header";

  const title = document.createElement("div");
  title.className = "pm-analyze-collection-tray__title";
  title.textContent = "Collection";

  const count = document.createElement("span");
  count.className = "pm-analyze-collection-tray__count";
  count.textContent = `${snapshot.count} product${snapshot.count === 1 ? "" : "s"}`;

  const titleGroup = document.createElement("div");
  titleGroup.className = "pm-analyze-collection-tray__title-group";
  titleGroup.append(title, count);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "pm-analyze-collection-tray__clear-button";
  clearButton.title = "Clear collection";
  clearButton.setAttribute("aria-label", "Clear collection");
  clearButton.addEventListener("click", () => {
    clearAnalyzeCollection();
  });

  header.append(titleGroup, clearButton);

  return header;
}

function createProductList(items) {
  const list = document.createElement("div");
  list.className = "pm-analyze-collection-tray__list";
  list.setAttribute("role", "list");

  for (const item of items) {
    list.appendChild(createProductItem(item));
  }

  return list;
}

function createProductItem(item) {
  const row = document.createElement("div");
  row.className = "pm-analyze-collection-tray__item";
  row.setAttribute("role", "listitem");

  const name = document.createElement("span");
  name.className = "pm-analyze-collection-tray__item-name";
  name.textContent = item.datasetName;
  name.title = item.datasetName;

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "pm-analyze-collection-tray__remove-button";
  removeButton.title = `Remove ${item.datasetName}`;
  removeButton.setAttribute("aria-label", `Remove ${item.datasetName}`);
  removeButton.addEventListener("click", () => {
    removeAnalyzeCollectionProduct(item.id);
  });

  row.append(name, removeButton);

  return row;
}

function createActions(datasetNames) {
  const footer = document.createElement("div");
  footer.className = "pm-analyze-collection-tray__footer";

  const reviewButton = document.createElement("button");
  reviewButton.type = "button";
  reviewButton.className = "pm-analyze-collection-tray__secondary-action";
  reviewButton.textContent = "Review";
  reviewButton.addEventListener("click", () => {
    openCollectionUrl(buildReviewUrl(datasetNames), "Product Review page was blocked");
  });

  const analyzeButton = document.createElement("button");
  analyzeButton.type = "button";
  analyzeButton.className = "pm-analyze-collection-tray__primary-action";
  analyzeButton.textContent = "Analyze";
  analyzeButton.addEventListener("click", () => {
    openCollectionUrl(buildAnalyzeUrl(datasetNames), "Analyze page was blocked");
  });

  footer.append(reviewButton, analyzeButton);

  return footer;
}

function openCollectionUrl(url, errorTitle) {
  const openedWindow = window.open(url, "_blank", "noopener,noreferrer");

  if (!openedWindow) {
    noticeError(errorTitle, "Allow popups for this site and try again.");
  }
}
