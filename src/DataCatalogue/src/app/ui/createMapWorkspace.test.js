import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createMapWorkspace } from "./createMapWorkspace.js";

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attributes = new Map();
    this.hidden = false;
  }
  append(...children) {
    this.children.push(...children);
  }
  setAttribute(key, value) {
    this.attributes.set(key, value);
  }
}

test("Action Bar reserves map width while Pipelines and Jobs overlay the same map", () => {
  const original = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag), activeElement: null };
  try {
    const ui = createMapWorkspace({ live: true });
    const shell = ui.element.children[0];
    assert.equal(shell.tagName, "div");
    assert.deepEqual(shell.children, [ui.actionBar, shell.children[1], ui.panelHost]);
    assert.equal(shell.children[1].children[1], ui.mapViewElement);
    assert.equal(ui.panelHost.hidden, false);
    assert.equal(ui.pipelineAction.active, true);

    ui.setJobsVisible(true);
    assert.equal(ui.panelHost.hidden, false);
    assert.equal(ui.pipelineAction.active, false);
    assert.equal(ui.panelHost.children[0].hidden, true);
    ui.setJobsVisible(false);
    assert.equal(ui.panelHost.hidden, true);
    ui.setPipelinesPanelOpen(true);
    assert.equal(ui.panelHost.hidden, false);
    assert.equal(ui.pipelineAction.active, true);
    ui.togglePipelinesPanel();
    assert.equal(ui.panelHost.hidden, true);

    const css = readFileSync(new URL("../../styles/map.css", import.meta.url), "utf8");
    assert.match(css, /grid-template-columns:\s*var\(--dc-map-action-bar-width\) minmax\(0, 1fr\)/);
    assert.match(css, /\.dc-map-side-panel\s*\{[^}]*position:\s*absolute/s);
  } finally {
    globalThis.document = original;
  }
});

test("Action Bar uses neutral Calcite surfaces for light and dark themes", () => {
  const css = readFileSync(new URL("../../styles/map.css", import.meta.url), "utf8");
  const actionBarRule = css.match(/\.dc-map-action-bar\s*\{([^}]*)\}/)?.[1];
  assert.ok(actionBarRule, "The map Action Bar rule must exist");
  assert.match(actionBarRule, /background:\s*var\(--calcite-color-surface-2\)/);
  assert.match(
    actionBarRule,
    /--calcite-action-bar-background-color:\s*var\(--calcite-color-surface-2\)/
  );
  assert.match(
    actionBarRule,
    /--calcite-action-background-color:\s*var\(--calcite-color-surface-2\)/
  );
  assert.match(
    actionBarRule,
    /--calcite-action-background-color-hover:\s*var\(--calcite-color-surface-3\)/
  );
  assert.match(
    actionBarRule,
    /--calcite-action-background-color-press:\s*var\(--calcite-color-surface-4\)/
  );
  assert.match(actionBarRule, /--calcite-action-text-color:\s*var\(--calcite-color-text-2\)/);
  assert.match(actionBarRule, /--calcite-action-text-color-press:\s*var\(--calcite-color-text-1\)/);
  assert.doesNotMatch(actionBarRule, /--dc-surface/);
});
