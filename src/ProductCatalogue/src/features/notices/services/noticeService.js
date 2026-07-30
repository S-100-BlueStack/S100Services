import { addNotice } from "../state/noticeStore.js";

const DEFAULT_DEDUPE_MS = 30 * 1000;
const recentNoticeKeys = new Map();

function createNotice(type, title, message = null, options = {}) {
  if (shouldSuppressDuplicateNotice(type, title, message, options)) {
    return null;
  }

  const notice = {
    id: crypto.randomUUID(),
    type,
    title,
    message,
    source: options.source ?? "app",
    persist: options.persist ?? false,

    // These flags keep toast visibility and notice-center storage controlled by
    // the caller instead of coupling every notice to the same UI behavior.
    storeInCenter: options.storeInCenter ?? true,
    countAsUnread: options.countAsUnread ?? options.storeInCenter ?? true,
    timestamp: new Date(),
  };

  addNotice(notice);

  return notice;
}

function shouldSuppressDuplicateNotice(type, title, message, options) {
  if (!options.dedupeKey) {
    return false;
  }

  const now = Date.now();
  const dedupeMs = normalizeDedupeMs(options.dedupeMs);
  const key = createDedupeKey(type, options.dedupeKey, title, message);
  const lastShownAt = recentNoticeKeys.get(key);

  if (lastShownAt && now - lastShownAt < dedupeMs) {
    return true;
  }

  recentNoticeKeys.set(key, now);
  pruneRecentNoticeKeys(now, dedupeMs);

  return false;
}

function createDedupeKey(type, dedupeKey, title, message) {
  return [type, dedupeKey, title, message].map(normalizeKeyPart).join("|");
}

function normalizeKeyPart(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeDedupeMs(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return DEFAULT_DEDUPE_MS;
  }

  return numericValue;
}

function pruneRecentNoticeKeys(now, dedupeMs) {
  for (const [key, lastShownAt] of recentNoticeKeys.entries()) {
    if (now - lastShownAt > dedupeMs) {
      recentNoticeKeys.delete(key);
    }
  }
}

export function noticeSuccess(title, message, options) {
  return createNotice("success", title, message, options);
}

export function noticeError(title, message, options) {
  return createNotice("danger", title, message, options);
}

export function noticeWarning(title, message, options) {
  return createNotice("warning", title, message, options);
}

export function noticeInfo(title, message, options) {
  return createNotice("info", title, message, options);
}
