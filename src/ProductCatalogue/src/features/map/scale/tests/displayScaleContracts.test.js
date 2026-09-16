import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../../../../../", import.meta.url);

async function readProjectFile(relativePath) {
  return readFile(new URL(relativePath, projectRoot), "utf8");
}

test("Main-map navbar omits Scale hiding and retains the FI-026 control order", async () => {
  const navbar = await readProjectFile("public/components/navbar.html");
  const controlIds = [
    "filter-button",
    "data-sources-button",
    "refresh-button",
    "last-updated",
    "notification-button",
    "preferences-button",
  ];
  const positions = controlIds.map((id) => navbar.indexOf(`id="${id}"`));

  assert.doesNotMatch(navbar, /display-scale-toggle/);
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(
    positions,
    [...positions].sort((left, right) => left - right)
  );
});

test("Main-map Preferences separates Scale hiding behavior from persistence", async () => {
  const preferences = await readProjectFile("src/features/preferences/ui/preferencesPanel.js");

  assert.match(preferences, /id="preferences-scale-hiding"/);
  assert.match(preferences, /bindDisplayScaleOverrideControl/);
  assert.match(preferences, /context\.view \? renderDisplayScaleSetting\(\) : ""/);
  assert.match(preferences, /data-preference-persistence-key=/);
  assert.match(preferences, /Save Scale hiding/);
  assert.match(preferences, /data-preference-action="reset-display-scale"/);
  assert.match(preferences, /renderThemeSelector\(getCurrentTheme\(\)\)/);
});

test("Display scale filters and source reconciliation do not mutate Scale hiding", async () => {
  const [filters, initMap] = await Promise.all([
    readProjectFile("src/features/map/filters/attributeFilterPanel.js"),
    readProjectFile("src/app/initMap.js"),
  ]);

  assert.doesNotMatch(filters, /setDisplayScaleHidingDisabled/);
  assert.doesNotMatch(filters, /syncDisplayScaleFilterAutoDisable/);
  assert.doesNotMatch(filters, /displayScaleFilter/);
  assert.doesNotMatch(initMap, /setDisplayScaleHidingDisabled/);
});

test("Scale hiding reset removes the explicit value and restores the off default", async () => {
  const [state, preferences] = await Promise.all([
    readProjectFile("src/features/map/scale/displayScaleOverrideState.js"),
    readProjectFile("src/features/preferences/ui/preferencesPanel.js"),
  ]);

  assert.match(
    state,
    /removePersistedDisplayScaleHidingDisabled\(\);[\s\S]*?setDisplayScaleHidingDisabled\(DEFAULT_DISPLAY_SCALE_HIDING_DISABLED/
  );
  assert.doesNotMatch(state, /localStorage\.setItem[\s\S]*readPersistedDisplayScaleHidingDisabled/);
  assert.match(preferences, /case "reset-all":[\s\S]*?resetDisplayScaleHidingPreference\(\)/);
});

test("existing map visibility still composes Scale hiding with source-aware filters", async () => {
  const visibility = await readProjectFile("src/features/map/scale/displayScaleVisibility.js");

  assert.match(visibility, /const ignoreDisplayScale = isDisplayScaleHidingDisabled\(\)/);
  assert.match(
    visibility,
    /!supportsDisplayScale \|\| ignoreDisplayScale \|\| isGraphicVisibleAtScale/
  );
  assert.match(
    visibility,
    /graphic\.visible = visibleAtScale && isGraphicAllowed\(graphic, layer\)/
  );
});
