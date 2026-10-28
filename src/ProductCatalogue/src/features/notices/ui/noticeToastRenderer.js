import { subscribeToNotices } from "../state/noticeStore";

let container;

const MAX_STACK = 4;
const AUTO_CLOSE_MS = 5000;
const FADE_DURATION = 500;

function ensureContainer() {
  if (container) return container;

  container = document.createElement("div");
  container.id = "notice-container";

  Object.assign(container.style, {
    position: "fixed",
    top: "60px",
    right: "16px",
    zIndex: "1000",
    width: "320px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  });

  document.body.appendChild(container);

  return container;
}

export function initNoticeToasts() {
  ensureContainer();

  subscribeToNotices((notice) => {
    if (!notice) return;

    if (isNoticePanelVisible()) return;

    const element = createNoticeElement(notice);

    container.prepend(element);

    requestAnimationFrame(() => {
      element.style.opacity = "1";
      element.style.transform = "translateX(0)";
    });

    enforceStackLimit();
    autoCloseNotice(element, notice);
  });
}

function isNoticePanelVisible() {
  const panel = document.getElementById("notice-log");
  return panel && panel.offsetParent !== null;
}

function createNoticeElement(notice) {
  const element = document.createElement("calcite-notice");

  element.kind = notice.type;
  element.scale = "m";
  element.open = true;
  element.closable = true;
  element.icon = getSeverityIcon(notice.type);
  element.style.transition = `opacity ${FADE_DURATION}ms ease, transform ${FADE_DURATION}ms ease`;
  element.style.opacity = "0";
  element.style.transform = "translateX(100px)";

  element.addEventListener("calciteNoticeClose", () => {
    if (element.isConnected) element.remove();
  });

  const title = document.createElement("div");
  title.slot = "title";
  title.textContent = notice.title;
  element.appendChild(title);

  if (notice.message) {
    const message = document.createElement("div");
    message.slot = "message";
    message.textContent = notice.message;
    element.appendChild(message);
  }

  return element;
}

function closeNotice(element) {
  if (!element?.isConnected) return;

  element.style.opacity = "0";
  element.style.transform = "translateX(100px)";

  setTimeout(() => {
    element.remove();
  }, FADE_DURATION);
}

function autoCloseNotice(element, notice) {
  if (notice.persist) return;

  let remaining = AUTO_CLOSE_MS;
  let start = Date.now();
  let timer = startTimer();

  function startTimer() {
    return setTimeout(() => closeNotice(element), remaining);
  }

  element.addEventListener("mouseenter", () => {
    clearTimeout(timer);
    remaining -= Date.now() - start;
  });

  element.addEventListener("mouseleave", () => {
    start = Date.now();
    timer = startTimer();
  });
}

function enforceStackLimit() {
  const notices = container.querySelectorAll("calcite-notice");

  if (notices.length <= MAX_STACK) return;

  for (let i = MAX_STACK; i < notices.length; i++) {
    closeNotice(notices[i]);
  }
}

function getSeverityIcon(type) {
  switch (type) {
    case "success":
      return "check-circle-f";
    case "danger":
      return "exclamation-mark-triangle-f";
    case "warning":
      return "exclamation-point-f";
    case "info":
      return "information-f";
    default:
      return "question";
  }
}
