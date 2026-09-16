export function bindDisplayScaleOverrideSwitch(
  switchElement,
  { readHidingDisabled, setHidingDisabled, subscribe }
) {
  if (!switchElement) {
    return { remove() {} };
  }

  const syncSwitch = () => {
    const scaleHidingEnabled = !readHidingDisabled();

    switchElement.checked = scaleHidingEnabled;
    switchElement.title = scaleHidingEnabled
      ? "Scale hiding is on. Products outside their display scale range are hidden."
      : "Scale hiding is off. Display scale alone does not hide Products.";
  };

  const onChange = () => {
    // The switch describes the positive state: checked means scale hiding is enabled.
    // Internally the map logic stores the inverse because it needs to know when to ignore displayScale.
    setHidingDisabled(!switchElement.checked, {
      source: "manual",
    });
  };

  switchElement.addEventListener("calciteSwitchChange", onChange);

  const overrideHandle = subscribe(syncSwitch);

  syncSwitch();

  return {
    remove() {
      switchElement.removeEventListener("calciteSwitchChange", onChange);
      overrideHandle.remove();
    },
  };
}
