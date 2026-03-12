import { subscribeToNotices, getNotices } from "../state/noticeStore";

let container;

export function initNoticePanel() {
  container = document.getElementById("notice-log");

  render(getNotices());

  subscribeToNotices((notice, notices) => {
    render(notices);
  });
}

function render(notices) {
  container.innerHTML = "";

  for (const notice of notices) {
    const row = document.createElement("div");

    row.className = `notice-row notice-${notice.type}`;

    row.innerHTML = `
<span class="notice-type">${getIcon(notice.type)}</span>

<span class="notice-content">
  <div class="notice-title">${notice.title ?? ""}</div>
  ${notice.message ? `<div class="notice-message">${notice.message}</div>` : ""}
</span>

<span class="notice-time">${notice.timestamp.toLocaleTimeString()}</span>
`;

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
