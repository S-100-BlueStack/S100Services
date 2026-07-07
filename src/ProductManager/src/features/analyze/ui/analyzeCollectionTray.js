import { buildAnalyzeUrl } from "../routing/analyzeRoute.js";
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
  tray.setAttribute("aria-label", "Analyze collection");

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
  tray.appendChild(createAnalyzeAction(snapshot.datasetNames));
}

function createHeader(snapshot) {
  const header = document.createElement("div");
  header.className = "pm-analyze-collection-tray__header";

  const title = document.createElement("div");
  title.className = "pm-analyze-collection-tray__title";
  title.textContent = "Analyze collection";

  const count = document.createElement("span");
  count.className = "pm-analyze-collection-tray__count";
  count.textContent = `${snapshot.count} product${snapshot.count === 1 ? "" : "s"}`;

  const titleGroup = document.createElement("div");
  titleGroup.className = "pm-analyze-collection-tray__title-group";
  titleGroup.append(title, count);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "pm-analyze-collection-tray__clear-button";
  clearButton.title = "Clear Analyze collection";
  clearButton.setAttribute("aria-label", "Clear Analyze collection");
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

function createAnalyzeAction(datasetNames) {
  const footer = document.createElement("div");
  footer.className = "pm-analyze-collection-tray__footer";

  const analyzeButton = document.createElement("button");
  analyzeButton.type = "button";
  analyzeButton.className = "pm-analyze-collection-tray__analyze-button";
  analyzeButton.textContent = "Analyze";
  analyzeButton.addEventListener("click", () => {
    openAnalyzeCollection(datasetNames);
  });

  footer.appendChild(analyzeButton);

  return footer;
}

function openAnalyzeCollection(datasetNames) {
  if (!Array.isArray(datasetNames) || datasetNames.length === 0) {
    return;
  }

  const analyzeUrl = buildAnalyzeUrl(datasetNames);
  const openedWindow = window.open(analyzeUrl, "_blank", "noopener,noreferrer");

  if (!openedWindow) {
    noticeError("Analyze page was blocked", "Allow popups for this site and try again.");
  }
}
