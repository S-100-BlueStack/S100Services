import { createNoticeContainer } from "../components/NoticeContainer";

let toastManager = null;

function getManager() {
  if (!toastManager) {
    toastManager = createNoticeContainer();
  }

  return toastManager;
}

export function renderNotice({ title, message, kind = "brand", duration = 4000 }) {
  const manager = getManager();

  const toast = document.createElement("calcite-toast");

  toast.heading = title;
  toast.message = message;
  toast.kind = kind;
  toast.duration = duration;

  manager.appendChild(toast);
}
