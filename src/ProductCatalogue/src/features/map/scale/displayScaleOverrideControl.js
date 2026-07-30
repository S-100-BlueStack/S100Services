import "@esri/calcite-components/components/calcite-switch";
import {
  isDisplayScaleHidingDisabled,
  onDisplayScaleOverrideChange,
  setDisplayScaleHidingDisabled,
} from "./displayScaleOverrideState.js";

let activeHandle = null;

export function initDisplayScaleOverrideControl() {
  activeHandle?.remove();

  const switchElement = document.getElementById("display-scale-toggle");

  if (!switchElement) {
    activeHandle = null;
    return;
  }

  const syncSwitch = () => {
    const scaleHidingEnabled = !isDisplayScaleHidingDisabled();

    switchElement.checked = scaleHidingEnabled;
    switchElement.title = scaleHidingEnabled
      ? "Display scale hiding is enabled"
      : "Display scale hiding is disabled";
  };

  const onChange = () => {
    // The switch describes the positive state: checked means scale hiding is enabled.
    // Internally the map logic stores the inverse because it needs to know when to ignore displayScale.
    setDisplayScaleHidingDisabled(!switchElement.checked, {
      source: "manual",
    });
  };

  switchElement.addEventListener("calciteSwitchChange", onChange);

  const overrideHandle = onDisplayScaleOverrideChange(syncSwitch);

  syncSwitch();

  activeHandle = {
    remove() {
      switchElement.removeEventListener("calciteSwitchChange", onChange);
      overrideHandle.remove();
    },
  };
}
