import { subscribeToNotices, getNotices } from "../state/noticeStore.js";

let container;

export function initNoticePanel() {
  container = document.getElementById("notice-log");

  render(getNotices());

  subscribeToNotices((_notice, notices) => {
    render(notices);
  });
}

function render(notices) {
  container.replaceChildren();

  for (const notice of notices) {
    const row = document.createElement("div");
    row.className = `notice-row notice-${notice.type}`;

    const type = document.createElement("span");
    type.className = "notice-type";
    type.textContent = getIcon(notice.type);

    const content = document.createElement("span");
    content.className = "notice-content";

    const title = document.createElement("div");
    title.className = "notice-title";
    title.textContent = notice.title ?? "";
    content.appendChild(title);

    if (notice.message) {
      const message = document.createElement("div");
      message.className = "notice-message";
      message.textContent = notice.message;
      content.appendChild(message);
    }

    const time = document.createElement("span");
    time.className = "notice-time";
    time.textContent = String(notice.timestamp?.toLocaleTimeString());

    row.appendChild(type);
    row.appendChild(content);
    row.appendChild(time);
    container.appendChild(row);
  }
}

function getIcon(type) {
  switch (type) {
    case "success":
      return "✔";
    case "danger":
      return "✖";
    case "warning":
      return "⚠";
    default:
      return "ℹ";
  }
}
