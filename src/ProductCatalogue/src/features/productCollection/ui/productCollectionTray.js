import { getCollectionNavigationAvailability } from "../domain/productCollectionNavigation.js";
import { buildAnalyzeUrl } from "../../analyze/routing/analyzeRoute.js";
import { launchWorkspaceUrl } from "../../../app/routing/workspaceNavigation.js";
import { noticeError } from "../../notices/services/noticeService.js";
import { buildReviewUrl } from "../../review/routing/reviewRoute.js";
import {
  clearProductCollection,
  getProductCollectionSnapshot,
  removeProductCollectionProduct,
  subscribeProductCollection,
} from "../state/productCollectionStore.js";

export function initProductCollectionTray({ root = document.body } = {}) {
  const tray = document.createElement("section");
  tray.className = "pc-product-collection-tray";
  tray.hidden = true;
  tray.setAttribute("aria-label", "Product collection");
  tray.dataset.onboardingTarget = "product-collection";

  root.appendChild(tray);

  const unsubscribeCollection = subscribeProductCollection((snapshot) => {
    renderProductCollectionTray(tray, snapshot);
  });

  renderProductCollectionTray(tray, getProductCollectionSnapshot());

  return {
    element: tray,
    destroy() {
      unsubscribeCollection();
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
  tray.appendChild(createActions(snapshot.items));
}

function createHeader(snapshot) {
  const header = document.createElement("div");
  header.className = "pc-product-collection-tray__header";

  const title = document.createElement("div");
  title.className = "pc-product-collection-tray__title";
  title.textContent = "Collection";

  const count = document.createElement("span");
  count.className = "pc-product-collection-tray__count";
  count.textContent = `${snapshot.count} product${snapshot.count === 1 ? "" : "s"}`;

  const titleGroup = document.createElement("div");
  titleGroup.className = "pc-product-collection-tray__title-group";
  titleGroup.append(title, count);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "pc-product-collection-tray__clear-button";
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
  list.className = "pc-product-collection-tray__list";
  list.setAttribute("role", "list");

  for (const item of items) {
    list.appendChild(createProductItem(item));
  }

  return list;
}

function createProductItem(item) {
  const row = document.createElement("div");
  row.className = "pc-product-collection-tray__item";
  row.setAttribute("role", "listitem");

  const name = document.createElement("span");
  name.className = "pc-product-collection-tray__item-name";
  name.textContent = item.datasetName;
  name.title = item.datasetName;

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "pc-product-collection-tray__remove-button";
  removeButton.title = `Remove ${item.datasetName}`;
  removeButton.setAttribute("aria-label", `Remove ${item.datasetName}`);
  removeButton.addEventListener("click", () => {
    removeProductCollectionProduct(item.id);
  });

  row.append(name, removeButton);

  return row;
}

function createActions(items) {
  const footer = document.createElement("div");
  footer.className = "pc-product-collection-tray__footer";

  for (const [destination, label, title] of [
    ["review", "Review", "Open Product Review in a new tab with the current collection"],
    ["analyze", "Analyze", "Open Analyze in a new tab with the current collection"],
  ]) {
    const availability = getCollectionNavigationAvailability(items, destination);
    footer.appendChild(
      createActionButton({
        label,
        title: availability.reason ?? title,
        disabled: !availability.allowed,
        onClick: () => openProductCollection(destination),
      })
    );
  }

  return footer;
}

function createActionButton({ label, title, disabled, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pc-product-collection-tray__action";
  button.textContent = label;
  button.title = title;
  button.disabled = disabled;
  button.setAttribute("aria-label", title);
  button.addEventListener("click", onClick);

  return button;
}

export function openProductCollection(
  destination,
  { getSnapshot = getProductCollectionSnapshot, ...navigationOptions } = {}
) {
  // Re-read at dispatch time: a previously rendered enabled action must not
  // launch a stale subset after an unsupported work unit enters the collection.
  const snapshot = getSnapshot();
  if (!getCollectionNavigationAvailability(snapshot.items, destination).allowed) return false;
  const datasetNames = snapshot.items.map((item) => item.datasetName);
  const url =
    destination === "review" ? buildReviewUrl(datasetNames) : buildAnalyzeUrl(datasetNames);
  return openCollectionUrl(
    url,
    destination,
    destination === "review" ? "Product Review page was blocked" : "Analyze page was blocked",
    navigationOptions
  );
}

export function openCollectionUrl(
  url,
  destinationRoute,
  errorTitle,
  { launch = launchWorkspaceUrl, showError = noticeError } = {}
) {
  if (!url) {
    showError(
      "Workspace link unavailable",
      "Product names containing commas cannot be shared in a workspace URL."
    );
    return false;
  }
  const result = launch(url, destinationRoute);

  if (!result.opened) {
    showError(errorTitle, "Allow popups for this site and try again.");
    return false;
  }

  return true;
}
