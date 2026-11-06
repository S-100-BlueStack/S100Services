import { dismissNotice, subscribeToNotices } from "../services/noticeService.js";

export function createNoticeRegion() {
  const regionElement = document.createElement("section");
  regionElement.className = "data-catalogue-notices";
  regionElement.setAttribute("aria-label", "Notifications");
  regionElement.setAttribute("aria-live", "polite");
  regionElement.setAttribute("aria-relevant", "additions removals");

  const unsubscribe = subscribeToNotices((notices) => {
    renderNotices(regionElement, notices);
  });

  regionElement.destroy = unsubscribe;

  return regionElement;
}

function renderNotices(regionElement, notices) {
  regionElement.replaceChildren(...notices.map((notice) => createNoticeElement(notice)));
}

function createNoticeElement(notice) {
  const noticeElement = document.createElement("article");
  noticeElement.className = `data-catalogue-notice data-catalogue-notice--${notice.type}`;
  noticeElement.setAttribute("role", notice.type === "error" ? "alert" : "status");

  const contentElement = document.createElement("div");
  contentElement.className = "data-catalogue-notice__content";

  const titleElement = document.createElement("strong");
  titleElement.className = "data-catalogue-notice__title";
  titleElement.textContent = notice.title;

  const messageElement = document.createElement("p");
  messageElement.className = "data-catalogue-notice__message";
  messageElement.textContent = notice.message;

  contentElement.append(titleElement, messageElement);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "data-catalogue-notice__close";
  closeButton.setAttribute("aria-label", `Dismiss notification: ${notice.title}`);
  closeButton.textContent = "×";

  closeButton.addEventListener("click", () => {
    dismissNotice(notice.id);
  });

  noticeElement.append(contentElement, closeButton);

  return noticeElement;
}
