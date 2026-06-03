import { addNotice } from "../state/noticeStore.js";

function createNotice(type, title, message = null, options = {}) {
  const notice = {
    id: crypto.randomUUID(),
    type,
    title,
    message,
    source: options.source ?? "app",
    persist: options.persist ?? false,

    // New behavior flags
    storeInCenter: options.storeInCenter ?? true,
    countAsUnread: options.countAsUnread ?? options.storeInCenter ?? true,

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
