import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { refreshRenderedFilterCounts, updateRangePreview } from "./attributeFilterCounts.js";
import { createAttributeFilterService } from "./attributeFilterService.js";

// These doubles expose only the application's light DOM contract. Any attempt to replace
// controls, change focus, or use private component internals fails because no such API exists.
function textNode() {
  return {
    textContent: "",
    replaceChildren(value) {
      this.textContent = value;
    },
  };
}

function checkboxField(providerId, fieldName, values) {
  const options = values.map((value) => {
    const count = textNode();
    const classes = new Set();
    const option = {
      querySelector: (selector) => (selector === ".pc-filter-option__count" ? count : null),
      classList: {
        toggle(name, enabled) {
          if (enabled) classes.add(name);
          else classes.delete(name);
        },
      },
    };
    return {
      count,
      classes,
      checkbox: {
        dataset: { filterValue: value },
        checked: true,
        closest: (selector) => (selector === ".pc-filter-option" ? option : null),
      },
    };
  });
  return {
    dataset: { providerId, fieldName },
    options,
    querySelector: () => null,
    querySelectorAll: (selector) =>
      selector === "[data-filter-checkbox]" ? options.map(({ checkbox }) => checkbox) : [],
  };
}

function panelFixture() {
  const service = createAttributeFilterService({ getStatuses: () => [], getUsages: () => [] });
  const layer = {
    graphics: [
      { attributes: { status: "Ready", usageBand: "Coastal", displayScale: 1000 } },
      { attributes: { status: "Error", usageBand: "Overview", displayScale: 2000 } },
      { attributes: { status: "Ready", usageBand: "Coastal", displayScale: 3000 } },
    ],
  };
  service.replaceProvider({
    providerId: "source",
    generation: 1,
    layers: [layer],
    filterDefinitions: ["status", "usageBand", "displayScale"],
  });
  const status = checkboxField("source", "status", ["Ready", "Error"]);
  const usage = checkboxField("source", "usageBand", ["Coastal", "Overview"]);
  const min = textNode();
  const max = textNode();
  const hint = textNode();
  const summary = textNode();
  const container = {
    querySelector: (selector) =>
      ({
        '[data-range-output="min"]': min,
        '[data-range-output="max"]': max,
        "[data-range-hint]": hint,
      })[selector],
  };
  const slider = {
    minValue: 0,
    maxValue: 2,
    closest: (selector) => (selector === "[data-range-values]" ? container : null),
  };
  const range = {
    dataset: { providerId: "source", fieldName: "displayScale" },
    querySelector: (selector) =>
      ({
        "calcite-slider[data-filter-range]": slider,
        "[data-range-summary]": summary,
      })[selector],
    querySelectorAll: () => [],
  };
  const providerCount = textNode();
  const fields = [status, usage, range];
  const provider = {
    dataset: { filterProvider: "source" },
    querySelector: (selector) => (selector === "[data-provider-count]" ? providerCount : null),
    querySelectorAll: (selector) => (selector === ".pc-filter-field" ? fields : []),
  };
  const panel = {
    querySelectorAll: (selector) =>
      ({
        "[data-filter-provider]": [provider],
        ".pc-filter-field": fields,
      })[selector] ?? [],
  };
  return { service, panel, status, usage, range, slider, min, max, hint, summary, providerCount };
}

test("range commits patch provider and checkbox counts without replacing or changing controls", () => {
  const f = panelFixture();
  refreshRenderedFilterCounts(f.panel, f.service);
  assert.equal(f.providerCount.textContent, "3 of 3 visible");
  assert.equal(f.status.options[0].count.textContent, "2");
  assert.equal(f.hint.textContent, "3 product(s) in range");
  f.slider.minValue = 1;
  f.service.setRangeFilter("source", "displayScale", 2000, 3000, 1000, 3000);
  refreshRenderedFilterCounts(f.panel, f.service);
  assert.equal(f.providerCount.textContent, "2 of 3 visible");
  assert.equal(f.status.options[0].count.textContent, "1");
  assert.equal(f.usage.options[0].count.textContent, "1");
  assert.equal(f.hint.textContent, "2 product(s) in range");
  assert.equal(f.summary.textContent, "2/3");
  assert.equal(f.min.textContent, "2000");
  assert.equal(f.max.textContent, "3000");
  assert.equal(f.range.querySelector("calcite-slider[data-filter-range]"), f.slider);
  assert.equal(f.slider.minValue, 1);
  assert.equal(f.slider.maxValue, 2);
  assert.ok(f.status.options.every(({ checkbox }) => checkbox.checked));

  f.slider.minValue = 2;
  f.service.setRangeFilter("source", "displayScale", 3000, 3000, 1000, 3000);
  refreshRenderedFilterCounts(f.panel, f.service);
  assert.equal(f.status.options[1].count.textContent, "0");
  assert.ok(f.status.options[1].classes.has("pc-filter-option--empty"));
  assert.ok(f.usage.options[1].classes.has("pc-filter-option--empty"));
  assert.equal(f.hint.textContent, "1 product(s) in range");
  assert.equal(f.providerCount.textContent, "1 of 3 visible");

  f.slider.minValue = 0;
  f.service.clearFilter("source", "displayScale");
  refreshRenderedFilterCounts(f.panel, f.service);
  assert.equal(f.status.options[1].count.textContent, "1");
  assert.equal(f.status.options[1].classes.has("pc-filter-option--empty"), false);
  assert.equal(f.range.querySelector("calcite-slider[data-filter-range]"), f.slider);
});

test("range preview sums contextual scale counts without committing or altering slider values", () => {
  const f = panelFixture();
  f.service.setFilter("source", "status", ["Ready"], 2);
  f.slider.minValue = 1;
  const snapshot = f.service.getFilterSnapshot();
  updateRangePreview(f.panel, f.service, "source", "displayScale");
  assert.equal(f.hint.textContent, "1 product(s) in range");
  assert.equal(f.summary.textContent, "2/3");
  assert.equal(f.slider.minValue, 1);
  assert.equal(f.slider.maxValue, 2);
  assert.deepEqual(f.service.getFilterSnapshot(), snapshot);
});

test("panel range commit keeps its no-rerender boundary and calls the tested count patch", async () => {
  const source = await readFile(new URL("attributeFilterPanel.js", import.meta.url), "utf8");
  const commit = source.slice(
    source.indexOf("  function commitFilterChange("),
    source.indexOf("  function refreshBadge(")
  );
  assert.match(commit, /applyVisibility\?\.\(\);/);
  assert.match(
    commit,
    /if \(isOpen\(\)\) \{\s*refreshRenderedFilterCounts\(panel, filterService\);/
  );
  const sliderChange = source.slice(
    source.indexOf("  function handleSliderChange("),
    source.indexOf("  function handlePanelClick(")
  );
  assert.match(sliderChange, /commitFilterChange\(\{ rerender: false \}\);/);
  assert.doesNotMatch(sliderChange, /innerHTML|\.focus\(|render\(\)/);
  assert.match(source, /data-provider-count/);
});
