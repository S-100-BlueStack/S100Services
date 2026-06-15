import {
  dismissNotice,
  subscribeToNotices,
} from "../services/noticeService.js";

export function createNoticeRegion() {
  const regionElement = document.createElement("section");
  regionElement.className = "job-manager-notices";
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
  regionElement.replaceChildren(
    ...notices.map((notice) => createNoticeElement(notice)),
  );
}

function createNoticeElement(notice) {
  const noticeElement = document.createElement("article");
  noticeElement.className = `job-manager-notice job-manager-notice--${notice.type}`;
  noticeElement.setAttribute(
    "role",
    notice.type === "error" ? "alert" : "status",
  );

  const contentElement = document.createElement("div");
  contentElement.className = "job-manager-notice__content";

  const titleElement = document.createElement("strong");
  titleElement.className = "job-manager-notice__title";
  titleElement.textContent = notice.title;

  const messageElement = document.createElement("p");
  messageElement.className = "job-manager-notice__message";
  messageElement.textContent = notice.message;

  contentElement.append(titleElement, messageElement);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "job-manager-notice__close";
  closeButton.setAttribute(
    "aria-label",
    `Dismiss notification: ${notice.title}`,
  );
  closeButton.textContent = "×";

  closeButton.addEventListener("click", () => {
    dismissNotice(notice.id);
  });

  noticeElement.append(contentElement, closeButton);

  return noticeElement;
}
