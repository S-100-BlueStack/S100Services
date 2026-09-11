import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(relativeUrl) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

test("keeps Locator controller isolated from Product search and geographic provider details", () => {
  const locatorController = readSource("./mainMapLocator.js");

  assert.doesNotMatch(locatorController, /mainMapProductSearch/);
  assert.doesNotMatch(locatorController, /sourceAwareProductSearchIndex/);
  assert.doesNotMatch(
    locatorController,
    /clearSelectedProduct|openProductPopup|closeProductPopup|selectProduct/
  );
  assert.doesNotMatch(locatorController, /DNK|GRL|sourceCountry|findAddressCandidates/);
});

test("centers the Locator action through the public Calcite alignment property", () => {
  const locatorController = readSource("./mainMapLocator.js");

  assert.match(locatorController, /button\.alignment\s*=\s*["']center["']/);
  assert.doesNotMatch(locatorController, /shadowRoot|icon-container|querySelector\([^)]*button/);
});

test("keeps Calcite Action host styling out of the component's native icon layout", () => {
  const locatorStyles = readSource("../../../styles/main-map-locator.css");
  const buttonRule = locatorStyles.match(/\.main-map-locator__button\s*\{([\s\S]*?)\}/)?.[1] ?? "";

  assert.doesNotMatch(buttonRule, /\bdisplay\s*:/);
  assert.doesNotMatch(buttonRule, /\b(?:align-items|justify-content|padding|margin|transform)\s*:/);
  assert.doesNotMatch(buttonRule, /(^|\n)\s*border\s*:/);
  assert.match(buttonRule, /inset 0 0 0 1px var\(--pc-border\)/);
});

test("wires generic Locator provider-state reset into the Search lifecycle", () => {
  const sourceFactory = readSource("./locatorSearchSources.js");
  const locatorController = readSource("./mainMapLocator.js");
  const appComposition = readSource("../../../app/initMap.js");

  assert.match(sourceFactory, /resetTransientState/);
  assert.match(locatorController, /resetSourceState/);
  assert.match(appComposition, /resetSourceState:\s*locatorConfiguration\.resetTransientState/);
});

test("keeps Product search independent from Locator implementation details", () => {
  const productSearchController = readSource("../search/mainMapProductSearch.js");

  assert.doesNotMatch(productSearchController, /features\/map\/locator|\.\.\/locator\//);
});

test("keeps the shared search-controls host free of Product and Locator feature imports", () => {
  const sharedControls = readSource("../search/mainMapSearchControls.js");

  assert.doesNotMatch(sharedControls, /^import .*mainMapProductSearch/m);
  assert.doesNotMatch(sharedControls, /^import .*locator/m);
});

test("materializes logical Locator sources through the generic ArcGIS SearchSource", () => {
  const sourceFactory = readSource("./locatorSearchSources.js");

  assert.match(sourceFactory, /widgets\/Search\/SearchSource\.js/);
  assert.doesNotMatch(sourceFactory, /widgets\/Search\/LocatorSearchSource\.js/);
});

test("keeps credentials and service URLs out of Locator UI and source materialization", () => {
  const locatorController = readSource("./mainMapLocator.js");
  const sourceFactory = readSource("./locatorSearchSources.js");
  const combinedSource = `${locatorController}\n${sourceFactory}`;

  assert.doesNotMatch(combinedSource, /geocode\.arcgis\.com/);
  assert.doesNotMatch(combinedSource, /arcgisConfig\.apiKey|apiKey\s*:|token\s*:|IdentityManager/);
});
