import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceColorLegend } from "./createWorkspaceColorLegend.js";
import { UNKNOWN_WORKSPACE_COLOR, WORKSPACE_JOB_COLOR_LEVELS } from "./workspaceJobColors.js";

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.style = {};
  }
  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
}

test("Main Map legend uses exactly the rendered Workspace count colors and unknown color", () => {
  const original = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag) };
  try {
    const legend = createWorkspaceColorLegend();
    assert.equal(legend.tagName, "section");
    assert.equal(legend.attributes.get("aria-label"), "Workspace color legend");
    assert.equal(legend.children[0].textContent, "Workspace colors");
    assert.equal(legend.children[1].textContent, "Open Packages per Workspace");
    const rows = legend.children[2].children;
    assert.equal(rows.length, WORKSPACE_JOB_COLOR_LEVELS.length + 1);
    for (const [index, item] of [
      ...WORKSPACE_JOB_COLOR_LEVELS.map(({ label, rgb }) => ({ label, rgb })),
      { label: "Loading / unknown", rgb: UNKNOWN_WORKSPACE_COLOR },
    ].entries()) {
      const [swatch, text] = rows[index].children;
      assert.equal(text.textContent, item.label);
      assert.equal(swatch.style.backgroundColor, `rgb(${item.rgb.join(", ")})`);
      assert.equal(swatch.attributes.get("aria-hidden"), "true");
    }
    assert.equal(
      legend.children[2].children.some((entry) => entry.tagName === "button"),
      false
    );
  } finally {
    globalThis.document = original;
  }
});
