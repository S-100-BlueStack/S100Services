const DEFAULT_NOTICE_TIMEOUT_MS = 5000;
const MAX_VISIBLE_NOTICES = 5;

let notices = [];
const listeners = new Set();

export function subscribeToNotices(listener) {
  listeners.add(listener);
  listener(getNotices());

  return () => {
    listeners.delete(listener);
  };
}

export function getNotices() {
  return notices.map((notice) => ({ ...notice }));
}

export function showSuccessNotice(options) {
  return showNotice({
    ...options,
    type: "success",
  });
}

export function showErrorNotice(options) {
  return showNotice({
    ...options,
    type: "error",
    timeoutMs: options.timeoutMs ?? 8000,
  });
}

export function showInfoNotice(options) {
  return showNotice({
    ...options,
    type: "info",
  });
}

export function showWarningNotice(options) {
  return showNotice({
    ...options,
    type: "warning",
  });
}

export function showNotice({
  title,
  message,
  type = "info",
  timeoutMs = DEFAULT_NOTICE_TIMEOUT_MS,
}) {
  const notice = {
    id: createNoticeId(),
    type,
    title: title || getDefaultTitle(type),
    message: message || "",
    createdAt: new Date().toISOString(),
    timeoutMs,
  };

  notices = [notice, ...notices].slice(0, MAX_VISIBLE_NOTICES);
  emitNotices();

  if (timeoutMs > 0) {
    window.setTimeout(() => {
      dismissNotice(notice.id);
    }, timeoutMs);
  }

  return notice.id;
}

export function dismissNotice(noticeId) {
  const nextNotices = notices.filter((notice) => notice.id !== noticeId);

  if (nextNotices.length === notices.length) {
    return;
  }

  notices = nextNotices;
  emitNotices();
}

export function clearNotices() {
  notices = [];
  emitNotices();
}

function emitNotices() {
  const snapshot = getNotices();

  for (const listener of listeners) {
    listener(snapshot);
  }
}

function createNoticeId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `notice-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getDefaultTitle(type) {
  switch (type) {
    case "success":
      return "Success";
    case "error":
      return "Error";
    case "warning":
      return "Warning";
    default:
      return "Information";
  }
}
