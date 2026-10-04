import "@esri/calcite-components/components/calcite-switch";
import {
  isDisplayScaleHidingDisabled,
  onDisplayScaleOverrideChange,
  setDisplayScaleHidingDisabled,
} from "./displayScaleOverrideState.js";
import { bindDisplayScaleOverrideSwitch } from "./displayScaleOverrideControlBinding.js";

export function bindDisplayScaleOverrideControl(switchElement) {
  return bindDisplayScaleOverrideSwitch(switchElement, {
    readHidingDisabled: isDisplayScaleHidingDisabled,
    setHidingDisabled: setDisplayScaleHidingDisabled,
    subscribe: onDisplayScaleOverrideChange,
  });
}
