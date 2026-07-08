const REVIEW_CHANNEL_NAME = "product-manager-review";
const REVIEW_SESSION_STORAGE_KEY = "product-manager-review-sessions";
const REVIEW_SESSION_HEARTBEAT_INTERVAL_MS = 4000;
const REVIEW_SESSION_STALE_MS = 12000;
const ADD_PRODUCTS_MESSAGE_TYPE = "product-manager-review:add-products";
const REPLACE_PRODUCTS_MESSAGE_TYPE = "product-manager-review:replace-products";

export function initReviewSessionChannel({
  getDatasetNames,
  onAddProducts,
  onReplaceProducts,
} = {}) {
  const sessionId = createSessionId();
  const channel = createReviewBroadcastChannel();

  const writeHeartbeat = () => {
    upsertReviewSession({
      sessionId,
      datasetNames: normalizeDatasetNames(getDatasetNames?.() ?? []),
      url: window.location.href,
      title: document.title,
      lastSeenAt: Date.now(),
    });
  };

  const handleMessage = (event) => {
    const message = event.data;

    if (!isPlainObject(message)) {
      return;
    }

    if (message.targetSessionId && message.targetSessionId !== sessionId) {
      return;
    }

    const datasetNames = normalizeDatasetNames(message.datasetNames);

    if (message.type === ADD_PRODUCTS_MESSAGE_TYPE) {
      if (datasetNames.length === 0) {
        return;
      }

      onAddProducts?.({
        datasetNames,
        source: "broadcast",
        sessionId,
      });
      return;
    }

    if (message.type === REPLACE_PRODUCTS_MESSAGE_TYPE) {
      onReplaceProducts?.({
        datasetNames,
        source: "broadcast",
        sessionId,
      });
    }
  };

  channel?.addEventListener?.("message", handleMessage);

  writeHeartbeat();

  const intervalId = window.setInterval(writeHeartbeat, REVIEW_SESSION_HEARTBEAT_INTERVAL_MS);

  const handlePageHide = () => {
    removeReviewSession(sessionId);
  };

  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("beforeunload", handlePageHide);

  return {
    sessionId,
    refresh: writeHeartbeat,
    destroy() {
      window.clearInterval(intervalId);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
      channel?.removeEventListener?.("message", handleMessage);
      channel?.close?.();
      removeReviewSession(sessionId);
    },
  };
}

export function getLatestActiveReviewSession({ now = Date.now() } = {}) {
  const sessions = getActiveReviewSessions({ now });

  return sessions[0] ?? null;
}

export function getActiveReviewSessions({ now = Date.now() } = {}) {
  const sessions = readReviewSessions()
    .filter((session) => isReviewSessionFresh(session, now))
    .sort((left, right) => right.lastSeenAt - left.lastSeenAt);

  writeReviewSessions(sessions);

  return sessions.map((session) => ({ ...session, datasetNames: [...session.datasetNames] }));
}

export function sendProductsToReviewSession(datasetNames, { sessionId, mode = "add" } = {}) {
  const names = normalizeDatasetNames(datasetNames);

  if (names.length === 0) {
    return false;
  }

  const channel = createReviewBroadcastChannel();

  if (!channel) {
    return false;
  }

  channel.postMessage({
    type: mode === "replace" ? REPLACE_PRODUCTS_MESSAGE_TYPE : ADD_PRODUCTS_MESSAGE_TYPE,
    targetSessionId: sessionId ?? null,
    datasetNames: names,
    sentAt: Date.now(),
  });

  channel.close?.();

  return true;
}

export function subscribeReviewSessionRegistry(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }

  let previousSignature = createReviewSessionSignature(getActiveReviewSessions());

  const intervalId = window.setInterval(() => {
    const sessions = getActiveReviewSessions();
    const nextSignature = createReviewSessionSignature(sessions);

    if (nextSignature === previousSignature) {
      return;
    }

    previousSignature = nextSignature;
    listener(sessions);
  }, REVIEW_SESSION_HEARTBEAT_INTERVAL_MS);

  return () => {
    window.clearInterval(intervalId);
  };
}

function upsertReviewSession(session) {
  const sessions = readReviewSessions().filter(
    (candidate) => candidate.sessionId !== session.sessionId
  );

  writeReviewSessions([...sessions, normalizeReviewSession(session)]);
}

function removeReviewSession(sessionId) {
  if (!sessionId) {
    return;
  }

  const sessions = readReviewSessions().filter((session) => session.sessionId !== sessionId);

  writeReviewSessions(sessions);
}

function normalizeReviewSession(session) {
  return {
    sessionId: String(session?.sessionId ?? "").trim(),
    datasetNames: normalizeDatasetNames(session?.datasetNames ?? []),
    url: String(session?.url ?? ""),
    title: String(session?.title ?? "Product Review"),
    lastSeenAt: Number.isFinite(Number(session?.lastSeenAt))
      ? Number(session.lastSeenAt)
      : Date.now(),
  };
}

function readReviewSessions() {
  try {
    const rawValue = window.localStorage?.getItem(REVIEW_SESSION_STORAGE_KEY);
    const parsedValue = JSON.parse(rawValue ?? "[]");

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.map(normalizeReviewSession).filter((session) => session.sessionId);
  } catch {
    return [];
  }
}

function writeReviewSessions(sessions) {
  try {
    window.localStorage?.setItem(REVIEW_SESSION_STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Session discovery is a convenience feature. Product Review itself should
    // continue to work even if localStorage is unavailable or full.
  }
}

function isReviewSessionFresh(session, now) {
  return now - session.lastSeenAt <= REVIEW_SESSION_STALE_MS;
}

function createReviewBroadcastChannel() {
  if (typeof BroadcastChannel !== "function") {
    return null;
  }

  return new BroadcastChannel(REVIEW_CHANNEL_NAME);
}

function createReviewSessionSignature(sessions) {
  return sessions
    .map(
      (session) => `${session.sessionId}:${session.lastSeenAt}:${session.datasetNames.join("|")}`
    )
    .join(";");
}

function createSessionId() {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `review-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeDatasetNames(datasetNames) {
  const values = Array.isArray(datasetNames) ? datasetNames : [datasetNames];

  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
