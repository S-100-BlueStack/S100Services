import assert from "node:assert/strict";
import test from "node:test";
import { applyProductStatusTone } from "./productStatusTone.js";
import { statusColorConfig } from "../config/colorsConfig.js";

function createStatusElement(text) {
  const properties = new Map();
  const attributes = new Map();
  const classes = new Set();
  const element = {
    textContent: text,
    classList: { add: (name) => classes.add(name) },
    style: { setProperty: (key, value) => properties.set(key, value) },
    setAttribute: (key, value) => attributes.set(key, value),
  };
  return { element, properties, attributes, classes };
}

test("Product status uses the existing ProductState palette, not a Package palette", () => {
  const error = createStatusElement("Error");
  applyProductStatusTone(error.element, 15, { errorMessage: "Validation failed" });
  assert.ok(error.classes.has("pc-status-chip--colored"));
  assert.equal(error.properties.get("--pc-status-chip-background"), statusColorConfig[15].header);
  assert.equal(error.properties.get("--pc-status-chip-border"), statusColorConfig[15].outline);
  assert.equal(error.element.title, "Validation failed");
  assert.equal(error.attributes.get("aria-label"), "Error: Validation failed");

  const ready = createStatusElement("Ready For Distribution");
  applyProductStatusTone(ready.element, 11);
  assert.equal(ready.properties.get("--pc-status-chip-background"), statusColorConfig[11].header);
  assert.equal(ready.attributes.size, 0);
});

test("unknown status fails neutral without claiming a known status color", () => {
  const element = createStatusElement("Unknown");
  applyProductStatusTone(element.element, "unrecognized-backend-value");
  assert.equal(element.properties.size, 0);
  assert.equal(element.classes.size, 0);
});
