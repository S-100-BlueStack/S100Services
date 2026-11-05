import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getOnboardingSteps } from "../../onboarding/config/onboardingSteps.js";

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

test("shared navbar keeps full-height navigable anchors and one animated underline", async () => {
  const [navbar, loader, headerStyles, main] = await Promise.all([
    readProjectFile("public/components/navbar.html"),
    readProjectFile("src/features/layout/services/navbarLoader.js"),
    readProjectFile("src/styles/header.css"),
    readProjectFile("src/main.js"),
  ]);

  const links = [...navbar.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  const expected = new Map([
    ["main", "Product Catalogue"],
    ["dashboard", "Dashboard"],
    ["analyze", "Analyze"],
    ["review", "Review"],
  ]);

  assert.equal(links.length, expected.size);
  for (const [, attributes, label] of links) {
    const routeName = attributes.match(/data-nav-route="([^"]+)"/)?.[1];
    assert.ok(expected.has(routeName));
    assert.equal(label.trim(), expected.get(routeName));
    assert.match(attributes, /class="navbar-title-link"/);
    assert.match(attributes, /\bhref="[^"]+"/);
    expected.delete(routeName);
  }
  assert.equal(expected.size, 0);
  assert.doesNotMatch(navbar, /<calcite-link/);
  assert.doesNotMatch(main, /@esri\/calcite-components\/components\/calcite-link/);
  assert.match(loader, /applyNavbarRouteState\(document, route\)/);
  assert.match(loader, /applyWorkspaceLinkNavigation\(dashboardLink, route, "dashboard"\)/);
  assert.match(loader, /applyWorkspaceLinkNavigation\(analyzeLink, route, "analyze"\)/);
  assert.match(loader, /applyWorkspaceLinkNavigation\(reviewLink, route, "review"\)/);

  // The same native link receives pointer events and renders the bottom line.
  assert.match(headerStyles, /\.header-center\s*\{[^}]*align-self: stretch;/);
  assert.match(headerStyles, /\.navbar-title-link\s*\{[^}]*align-self: stretch;/);
  assert.match(headerStyles, /\.navbar-title-link::after\s*\{[^}]*bottom: 0;/);
  assert.match(headerStyles, /\.navbar-title-link::after\s*\{[^}]*transform: scaleX\(0\);/);
  assert.match(headerStyles, /\.navbar-title-link\[aria-current="page"\]::after/);
  assert.match(headerStyles, /\.navbar-title-link:not\(\[aria-current="page"\]\):hover::after/);
  assert.match(headerStyles, /\.navbar-title-link:focus-visible/);
  assert.match(headerStyles, /prefers-reduced-motion: reduce/);
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

test("Preferences owns one immediate Theme switch through the existing theme service", async () => {
  const [preferences, bootstrap] = await Promise.all([
    readProjectFile("src/features/preferences/ui/preferencesPanel.js"),
    readProjectFile("src/app/bootstrap.js"),
  ]);

  assert.match(preferences, /renderThemeSetting\(getCurrentTheme\(\)\)/);
  assert.match(preferences, /id="preferences-dark-mode"/);
  assert.match(preferences, /label="Dark theme"/);
  assert.match(preferences, /icon="brightness"/);
  assert.match(preferences, /icon="moon"/);
  assert.match(preferences, /toggleTheme\(context\.themeView \?\? context\.view\)/);
  assert.doesNotMatch(preferences, /data-preference-action="toggle-theme"/);
  assert.doesNotMatch(preferences, /data-preference-theme|type="radio"/);
  assert.match(preferences, /getCurrentTheme\(\)/);
  assert.match(bootstrap, /ui\.preferencesPanel\.updateContext\(\{\s*themeView: app\.view,/);
  assert.doesNotMatch(bootstrap, /registerThemeToggle/);
});

test("Preferences retains introduction, reset and route-safe map preference boundaries", async () => {
  const preferences = await readProjectFile("src/features/preferences/ui/preferencesPanel.js");
  const steps = getOnboardingSteps("main");
  const settings = steps.find((step) => step.id === "main-preferences");
  const saved = steps.find((step) => step.id === "main-saved-preferences");

  assert.match(preferences, /data-preference-action="start-introduction"/);
  assert.match(preferences, /data-preference-action="reset-all"/);
  assert.match(preferences, /!item\.requiresMapContext \|\| context\.mapPreferences/);
  assert.match(preferences, /resetDisplayScaleHidingPreference\(\)/);

  // The guide highlights individual settings while the shared panel remains the reveal boundary.
  const reveal = { triggerSelector: "#preferences-button", openSelector: "#preferences-panel" };
  assert.deepEqual(settings?.reveal, reveal);
  assert.deepEqual(saved?.reveal, reveal);
  assert.deepEqual(settings?.selectors, [".pc-preferences-panel__setting--theme"]);
  assert.deepEqual(settings?.highlightSelectors, [
    ".pc-preferences-panel__setting--theme",
    ".pc-preferences-panel__setting--scale",
  ]);
  assert.deepEqual(saved?.selectors, [".pc-preferences-panel__group"]);
  assert.ok(saved?.highlightSelectors?.includes(".pc-preferences-panel__introduction-action"));
  assert.doesNotMatch(settings.selectors.join(" "), /#theme-toggle/);
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
