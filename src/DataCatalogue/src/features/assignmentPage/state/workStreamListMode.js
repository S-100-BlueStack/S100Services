export const WORK_STREAM_LIST_MODE = Object.freeze({
  ALL: "all",
  ACTIVE: "active",
});

export function normalizeWorkStreamListMode(mode, activeCount) {
  if (activeCount === 0) return WORK_STREAM_LIST_MODE.ALL;
  return mode === WORK_STREAM_LIST_MODE.ACTIVE
    ? WORK_STREAM_LIST_MODE.ACTIVE
    : WORK_STREAM_LIST_MODE.ALL;
}

export function toggleWorkStreamListMode(mode) {
  return mode === WORK_STREAM_LIST_MODE.ACTIVE
    ? WORK_STREAM_LIST_MODE.ALL
    : WORK_STREAM_LIST_MODE.ACTIVE;
}

export function workStreamIdsForMode(draft, mode) {
  return mode === WORK_STREAM_LIST_MODE.ACTIVE ? [...draft.activeIds] : null;
}

export function workStreamModeButtonLabel(mode) {
  return mode === WORK_STREAM_LIST_MODE.ACTIVE ? "Show all" : "Show active";
}
