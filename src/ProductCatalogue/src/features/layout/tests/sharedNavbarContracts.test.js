import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../../../..", import.meta.url);

async function readProjectFile(relativePath) {
  return readFile(new URL(relativePath, projectRoot), "utf8");
}

test("Main-map FI-026 controls use the required compact relative order", async () => {
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

  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(
    positions,
    [...positions].sort((left, right) => left - right)
  );
});

test("shared navbar exposes semantic routes and retains inactive-link hover styling", async () => {
  const [navbar, loader, headerStyles] = await Promise.all([
    readProjectFile("public/components/navbar.html"),
    readProjectFile("src/features/layout/services/navbarLoader.js"),
    readProjectFile("src/styles/header.css"),
  ]);

  for (const routeName of ["main", "dashboard", "analyze", "review"]) {
    assert.match(navbar, new RegExp(`data-nav-route="${routeName}"`));
  }
  assert.match(loader, /applyNavbarRouteState\(document, route\)/);
  assert.match(headerStyles, /\.navbar-title-link:hover/);
  assert.match(headerStyles, /\.navbar-title-link\[aria-current="page"\]/);
});

test("navbar omits visible Help and standalone Theme controls", async () => {
  const navbar = await readProjectFile("public/components/navbar.html");

  assert.doesNotMatch(navbar, /id="documentation-button"/);
  assert.doesNotMatch(navbar, /id="theme-toggle"/);
  assert.match(navbar, /id="preferences-button"/);
});

test("manual refresh keeps and restores the complete last-successful timestamp presentation", async () => {
  const initMap = await readProjectFile("src/app/initMap.js");

  assert.match(initMap, /previousLastUpdatedPresentation = readCurrentLastUpdatedPresentation\(\)/);
  assert.match(initMap, /setLastUpdatedPresentation\(createRefreshingPresentation\(\)\)/);
  assert.match(initMap, /setLastUpdatedPresentation\(previousLastUpdatedPresentation\)/);
});

test("Preferences owns immediate Light and Dark selection through the existing theme service", async () => {
  const [preferences, bootstrap] = await Promise.all([
    readProjectFile("src/features/preferences/ui/preferencesPanel.js"),
    readProjectFile("src/app/bootstrap.js"),
  ]);

  assert.match(preferences, /renderThemeOption\(themes\.light, "Light", currentTheme\)/);
  assert.match(preferences, /renderThemeOption\(themes\.dark, "Dark", currentTheme\)/);
  assert.match(
    preferences,
    /applyTheme\(themeOption\.value, context\.themeView \?\? context\.view\)/
  );
  assert.match(preferences, /getCurrentTheme\(\)/);
  assert.match(bootstrap, /ui\.preferencesPanel\.updateContext\(\{ themeView: app\.view \}\)/);
  assert.doesNotMatch(bootstrap, /registerThemeToggle/);
});

test("Preferences retains introduction, reset and route-safe map preference boundaries", async () => {
  const [preferences, onboarding] = await Promise.all([
    readProjectFile("src/features/preferences/ui/preferencesPanel.js"),
    readProjectFile("src/features/onboarding/config/onboardingSteps.js"),
  ]);

  assert.match(preferences, /data-preference-action="start-introduction"/);
  assert.match(preferences, /data-preference-action="reset-all"/);
  assert.match(preferences, /!item\.requiresMapContext \|\| context\.view/);
  assert.match(preferences, /resetDisplayScaleHidingPreference\(\)/);
  assert.match(onboarding, /selectors: \["#preferences-button"\]/);
  assert.doesNotMatch(onboarding, /#theme-toggle/);
});

test("Scale hiding moves out of the navbar while Notifications retain their public control", async () => {
  const navbar = await readProjectFile("public/components/navbar.html");

  assert.doesNotMatch(navbar, /id="display-scale-toggle"/);
  assert.doesNotMatch(navbar, /Scale hiding/);
  assert.match(navbar, /id="notification-button"/);
});

test("Notifications retain their established state subscription", async () => {
  const notifications = await readProjectFile("src/features/notices/ui/navbarNotifications.js");

  assert.match(notifications, /subscribeToNotices/);
  assert.match(notifications, /resetUnread\(\)/);
});
