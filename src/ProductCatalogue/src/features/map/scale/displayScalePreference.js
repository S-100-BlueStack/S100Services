export const DEFAULT_DISPLAY_SCALE_HIDING_DISABLED = true;

export function parsePersistedDisplayScaleHidingDisabled(rawValue) {
  // Keep the established inverse boolean format strict so absence and corrupt
  // values cannot accidentally restore the former default-on behavior.
  if (rawValue === "true") {
    return true;
  }

  if (rawValue === "false") {
    return false;
  }

  return DEFAULT_DISPLAY_SCALE_HIDING_DISABLED;
}

export function serializeDisplayScaleHidingDisabled(disabled) {
  return String(Boolean(disabled));
}
