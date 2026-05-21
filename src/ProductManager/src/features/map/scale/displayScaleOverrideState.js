const DISPLAY_SCALE_OVERRIDE_CHANGE_EVENT = "pm-display-scale-override-change";

let displayScaleHidingDisabled = false;

export function isDisplayScaleHidingDisabled() {
  return displayScaleHidingDisabled;
}

export function setDisplayScaleHidingDisabled(disabled, { source = "manual" } = {}) {
  const nextDisabled = Boolean(disabled);

  if (displayScaleHidingDisabled === nextDisabled) {
    return;
  }

  displayScaleHidingDisabled = nextDisabled;

  document.dispatchEvent(
    new CustomEvent(DISPLAY_SCALE_OVERRIDE_CHANGE_EVENT, {
      detail: {
        disabled: displayScaleHidingDisabled,
        source,
      },
    })
  );
}

export function toggleDisplayScaleHidingDisabled() {
  setDisplayScaleHidingDisabled(!displayScaleHidingDisabled, {
    source: "manual",
  });
}

export function onDisplayScaleOverrideChange(callback) {
  const handler = (event) => {
    callback(event.detail);
  };

  document.addEventListener(DISPLAY_SCALE_OVERRIDE_CHANGE_EVENT, handler);

  return {
    remove() {
      document.removeEventListener(DISPLAY_SCALE_OVERRIDE_CHANGE_EVENT, handler);
    },
  };
}
