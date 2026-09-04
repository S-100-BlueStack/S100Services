import assert from "node:assert/strict";
import test from "node:test";

import { applyGlobalHelpTooltips } from "./globalHelpTooltips.js";

const LOCATOR_HELP =
  "Search for an address or place in Denmark or Greenland and move the map there.";

test("replaces the generic Locator action tooltip with geographic hover help", () => {
  const attributes = new Map([
    ["aria-label", "Locator"],
    ["title", "Locator"],
  ]);
  const locatorAction = {
    dataset: {},
    tagName: "CALCITE-ACTION",
    textContent: "",
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
  };
  const root = {
    querySelectorAll(selector) {
      return selector === "#main-map-locator-button" ? [locatorAction] : [];
    },
  };

  applyGlobalHelpTooltips(root);

  assert.equal(locatorAction.getAttribute("aria-label"), "Locator");
  assert.equal(locatorAction.getAttribute("title"), LOCATOR_HELP);
});
