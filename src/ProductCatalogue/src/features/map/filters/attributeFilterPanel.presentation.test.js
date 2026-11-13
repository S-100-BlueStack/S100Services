import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const filtersDirectory = new URL("./", import.meta.url);
const productCatalogueDirectory = new URL("../../../../", import.meta.url);

test("Filter overflow surfaces use the neutral shared scrollbar contract", async () => {
  const [panelSource, filterCss, scrollbarCss] = await Promise.all([
    readFile(new URL("attributeFilterPanel.js", filtersDirectory), "utf8"),
    readFile(new URL("src/styles/filters.css", productCatalogueDirectory), "utf8"),
    readFile(new URL("src/styles/scrollbars.css", productCatalogueDirectory), "utf8"),
  ]);

  assert.match(panelSource, /panel\.className = "pc-filter-panel pc-scrollbar";/);
  assert.match(panelSource, /class="pc-filter-options pc-scrollbar"/);
  assert.match(filterCss, /#attribute-filter-panel\.pc-filter-panel\s*\{[^}]*overflow-y: auto;/s);
  assert.match(filterCss, /\.pc-filter-options\s*\{[^}]*overflow-y: auto;/s);
  assert.match(scrollbarCss, /\.pc-scrollbar \{/);
  assert.doesNotMatch(scrollbarCss, /filter|analyze|review/);
  assert.doesNotMatch(filterCss, /scrollbar-(?:color|width)|::-webkit-scrollbar/);
});

// The Calcite-backed panel cannot be mounted in this Node-only export; this
// contract guards the keyboard focus path until local browser acceptance.
test("Filter panel focuses its dialog instead of activating Clear all help on open", async () => {
  const source = await readFile(new URL("attributeFilterPanel.js", filtersDirectory), "utf8");
  assert.match(source, /panel\.tabIndex = -1;/);
  assert.match(
    source,
    /if \(focusInitial\) \{\s*\/\/[\s\S]*?panel\.focus\(\{ preventScroll: true \}\);/
  );
  assert.doesNotMatch(source, /panel\.querySelector\("button, input, calcite-slider"\)\?\.focus/);
});
