import { bindDisplayScaleOverrideControl } from "../scale/displayScaleOverrideControl.js";
import {
  isDisplayScaleHidingDisabled,
  resetDisplayScaleHidingPreference,
} from "../scale/displayScaleOverrideState.js";
import { resetMapViewpoint } from "./mapViewpointPersistence.js";

// Only Main-map bootstrap creates this capability. Shared UI never imports map services.
export function createMainMapPreferences({ view, filterPanel }) {
  return {
    bindDisplayScaleOverrideControl,
    isDisplayScaleHidingDisabled,
    resetDisplayScaleHidingPreference,
    resetMapViewpoint: () => resetMapViewpoint(view),
    resetFilters: () => filterPanel?.resetFiltersToDefaults?.(),
  };
}
