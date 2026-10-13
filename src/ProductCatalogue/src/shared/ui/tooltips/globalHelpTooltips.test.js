import assert from "node:assert/strict";
import test from "node:test";

import { applyGlobalHelpTooltips } from "./globalHelpTooltips.js";

const LOCATOR_HELP = "Find a place on the map";

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
    removeAttribute(name) {
      attributes.delete(name);
    },
    matches(selector) {
      return selector === "#main-map-locator-button";
    },
    closest() {
      return null;
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
  assert.equal(locatorAction.hasAttribute("title"), false);
  assert.equal(locatorAction.getAttribute("data-app-original-title"), "Locator");
  assert.equal(locatorAction.hasAttribute("data-app-help"), true);
  assert.equal(LOCATOR_HELP, "Find a place on the map");
});

test("global help does not restore native titles on application-owned popup controls", () => {
  const attributes = new Map([
    ["data-popup-help", ""],
    ["aria-label", "Discard"],
  ]);
  const popupControl = {
    tagName: "BUTTON",
    textContent: "",
    dataset: {},
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
  };
  applyGlobalHelpTooltips({
    querySelectorAll(selector) {
      return selector.includes(".popup-action-bar__action") ? [popupControl] : [];
    },
  });
  assert.equal(popupControl.hasAttribute("title"), false);
  assert.equal(popupControl.getAttribute("aria-label"), "Discard");
});
