import { addNotice } from "../state/noticeStore";
function createNotice(type, title, message = null, options = {}) {
  const notice = {
    id: crypto.randomUUID(),
    type: type,
    title: title,
    message: message,
    source: options.source ?? "app",
    persist: options.persist ?? false,
    timestamp: new Date(),
  };
  addNotice(notice);
}

export function noticeSuccess(title, message, options) {
  createNotice("success", title, message, options);
}

export function noticeError(title, message, options) {
  createNotice("danger", title, message, options);
}

export function noticeWarning(title, message, options) {
  createNotice("warning", title, message, options);
}

export function noticeInfo(title, message, options) {
  createNotice("info", title, message, options);
}
