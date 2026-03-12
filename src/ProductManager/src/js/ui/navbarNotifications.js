import { subscribeToNotices, resetUnread } from "../state/noticeStore";

export function initNavbarNotifications() {
  document.addEventListener("click", (event) => {
    const bell = event.target.closest("#notification-button");
    const close = event.target.closest("#close-notice-panel");

    const panel = document.getElementById("notice-panel");

    if (!panel) return;

    if (bell) {
      const collapsed = panel.hasAttribute("collapsed");

      if (collapsed) {
        panel.removeAttribute("collapsed");
        resetUnread();
      } else {
        panel.setAttribute("collapsed", "");
      }

      bell.blur(); // fjerner stuck hover/active
    }

    if (close) {
      panel.setAttribute("collapsed", "");
      resetUnread();
    }
  });

  subscribeToNotices((notice, notices, unreadCount) => {
    const counter = document.getElementById("notification-count");
    if (!counter) return;

    counter.textContent = unreadCount;
    counter.style.display = unreadCount > 0 ? "flex" : "none";
  });
}
