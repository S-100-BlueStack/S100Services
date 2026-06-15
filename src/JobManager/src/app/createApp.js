import { getRuntimeConfig } from "../shared/config/runtimeConfig.js";
import { createNoticeRegion } from "../features/notices/ui/noticeContainer.js";
import {
  showInfoNotice,
  showSuccessNotice,
} from "../features/notices/services/noticeService.js";

export function createApp(rootElement) {
  const runtimeConfig = getRuntimeConfig();

  const shellElement = document.createElement("div");
  shellElement.className = "job-manager-app";

  shellElement.appendChild(createHeader());
  shellElement.appendChild(createMainContent(runtimeConfig));
  shellElement.appendChild(createNoticeRegion());

  rootElement.replaceChildren(shellElement);

  return {
    destroy() {
      rootElement.replaceChildren();
    },
  };
}

function createHeader() {
  const headerElement = document.createElement("header");
  headerElement.className = "job-manager-header";

  const titleGroupElement = document.createElement("div");
  titleGroupElement.className = "job-manager-header__title-group";

  const titleElement = document.createElement("h1");
  titleElement.className = "job-manager-header__title";
  titleElement.textContent = "Job Manager";

  const subtitleElement = document.createElement("p");
  subtitleElement.className = "job-manager-header__subtitle";
  subtitleElement.textContent = "Areas of Interest and related Jobs";

  titleGroupElement.append(titleElement, subtitleElement);

  const actionsElement = document.createElement("div");
  actionsElement.className = "job-manager-header__actions";

  const noticeTestButton = document.createElement("button");
  noticeTestButton.type = "button";
  noticeTestButton.className = "btn btn-outline-primary btn-sm";
  noticeTestButton.textContent = "Show test notice";

  // This temporary action validates the notice pipeline before real Job mutations exist.
  noticeTestButton.addEventListener("click", () => {
    showSuccessNotice({
      title: "Notice pipeline ready",
      message: "User-facing notices can now be triggered from services.",
    });
  });

  actionsElement.appendChild(noticeTestButton);
  headerElement.append(titleGroupElement, actionsElement);

  return headerElement;
}

function createMainContent(runtimeConfig) {
  const mainElement = document.createElement("main");
  mainElement.className = "job-manager-main";

  const mapSectionElement = createMapPlaceholder(runtimeConfig);
  const jobsSectionElement = createJobsPlaceholder();

  mainElement.append(mapSectionElement, jobsSectionElement);

  return mainElement;
}

function createMapPlaceholder(runtimeConfig) {
  const sectionElement = document.createElement("section");
  sectionElement.className = "job-manager-panel job-manager-map-panel";
  sectionElement.setAttribute("aria-labelledby", "job-manager-map-title");

  const titleElement = document.createElement("h2");
  titleElement.id = "job-manager-map-title";
  titleElement.className = "job-manager-panel__title";
  titleElement.textContent = "Map";

  const descriptionElement = document.createElement("p");
  descriptionElement.className = "job-manager-panel__description";
  descriptionElement.textContent =
    "The ArcGIS map will show Areas of Interest and Job-aware filtering.";

  const configStatusElement = document.createElement("p");
  configStatusElement.className = "job-manager-panel__meta";

  if (runtimeConfig.aoiFeatureServiceUrl) {
    configStatusElement.textContent =
      "AOI Feature Service configuration found.";
  } else {
    configStatusElement.textContent =
      "AOI Feature Service configuration is not set yet.";
  }

  const placeholderElement = document.createElement("div");
  placeholderElement.className = "job-manager-map-placeholder";
  placeholderElement.textContent = "Map area";

  sectionElement.append(
    titleElement,
    descriptionElement,
    configStatusElement,
    placeholderElement,
  );

  return sectionElement;
}

function createJobsPlaceholder() {
  const sectionElement = document.createElement("section");
  sectionElement.className = "job-manager-panel job-manager-jobs-panel";
  sectionElement.setAttribute("aria-labelledby", "job-manager-jobs-title");

  const titleElement = document.createElement("h2");
  titleElement.id = "job-manager-jobs-title";
  titleElement.className = "job-manager-panel__title";
  titleElement.textContent = "Jobs";

  const descriptionElement = document.createElement("p");
  descriptionElement.className = "job-manager-panel__description";
  descriptionElement.textContent =
    "The Job list will show status, priority, deadline and related AOIs.";

  const statusListElement = document.createElement("ul");
  statusListElement.className = "job-manager-placeholder-list";

  for (const item of [
    "Mock Job service",
    "Job list",
    "Status mutations",
    "AOI relation summary",
  ]) {
    const itemElement = document.createElement("li");
    itemElement.textContent = item;
    statusListElement.appendChild(itemElement);
  }

  const infoButton = document.createElement("button");
  infoButton.type = "button";
  infoButton.className = "btn btn-outline-secondary btn-sm";
  infoButton.textContent = "Show next step";

  infoButton.addEventListener("click", () => {
    showInfoNotice({
      title: "Next implementation step",
      message: "Mock Jobs service should be implemented before map complexity.",
    });
  });

  sectionElement.append(
    titleElement,
    descriptionElement,
    statusListElement,
    infoButton,
  );

  return sectionElement;
}
