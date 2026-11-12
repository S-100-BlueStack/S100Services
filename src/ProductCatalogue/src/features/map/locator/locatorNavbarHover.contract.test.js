import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Main-map Search and Locator use the same readable icon tokens as navbar actions", async () => {
  const searchCss = await readFile(
    new URL("../../../styles/main-map-search-controls.css", import.meta.url),
    "utf8"
  );
  const locatorCss = await readFile(
    new URL("../../../styles/main-map-locator.css", import.meta.url),
    "utf8"
  );
  assert.match(searchCss, /#header \.main-map-product-search__button/);
  assert.match(searchCss, /#header \.main-map-locator__button/);
  assert.match(searchCss, /--calcite-action-text-color:\s*#ffffff/);
  assert.match(
    searchCss,
    /--calcite-action-background-color-hover:\s*rgba\(255, 255, 255, 0\.25\)/
  );
  assert.match(locatorCss, /--calcite-action-text-color-press:\s*#ffffff/);
});

test("Locator uses the documented pin-tear Calcite icon", async () => {
  const source = await readFile(new URL("./mainMapLocator.js", import.meta.url), "utf8");
  assert.match(source, /button\.icon = "pin-tear"/);
});
