import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createMapWorkspace } from "./createMapWorkspace.js";

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attributes = new Map();
    this.style = {};
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
    assert.equal(shell.children[1].children[4].className, "dc-workspace-color-legend");
    assert.equal(shell.children[1].children[4].children[0].textContent, "Workspace colors");
    assert.equal(ui.panelHost.hidden, false);
    assert.equal(ui.pipelineAction.active, true);
    assert.equal(ui.actionBar.expandToggleDisabled, true);
    assert.equal(ui.actionBar.overflowMode, "none");

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

test("Only the live Main Map mounts the count legend outside the hidden Pipeline panel", () => {
  const original = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag), activeElement: null };
  try {
    const liveMap = createMapWorkspace({ live: true });
    const mainMap = liveMap.element.children[0].children[1];
    assert.equal(
      mainMap.children.filter((node) => node.className === "dc-workspace-color-legend").length,
      1
    );
    assert.equal(liveMap.pipelineContent.children.length, 0);

    const mockMap = createMapWorkspace();
    const mockMapElement = mockMap.element.children[0].children[1];
    assert.equal(
      mockMapElement.children.some((node) => node.className === "dc-workspace-color-legend"),
      false
    );
  } finally {
    globalThis.document = original;
  }
});

test("Live Package information is a sibling of the existing map and left panel", () => {
  const original = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag), activeElement: null };
  try {
    const information = new Element("aside");
    information.hidden = true;
    const ui = createMapWorkspace({ live: true, packageInformationElement: information });
    const shell = ui.element.children[0];
    assert.equal(shell.children[3], information);
    assert.equal(shell.children[1].children[1], ui.mapViewElement);
    ui.setJobsVisible(true);
    information.hidden = false;
    assert.equal(shell.children[3], information);
    assert.equal(shell.children[1].children[1], ui.mapViewElement);
    assert.equal(ui.panelHost.hidden, false);
  } finally {
    globalThis.document = original;
  }
});

test("Package information overlays the unchanged map grid and retains both panel shadows", () => {
  const css = readFileSync(new URL("../../styles/map.css", import.meta.url), "utf8");
  const leftPanel = css.match(/\.dc-map-side-panel\s*\{([^}]*)\}/)?.[1];
  const rightPanel = css.match(/\.dc-package-information-panel\s*\{([^}]*)\}/)?.[1];
  assert.ok(leftPanel && rightPanel);
  for (const rule of [leftPanel, rightPanel]) {
    assert.match(rule, /position:\s*absolute/);
    assert.match(rule, /box-shadow:\s*var\(--dc-shadow\)/);
  }
  assert.match(rightPanel, /right:\s*0;/);
  assert.match(rightPanel, /top:\s*0;/);
  assert.match(rightPanel, /bottom:\s*0;/);
  assert.doesNotMatch(rightPanel, /grid-(column|row):/);
  for (const [, selector, declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selector.includes(":has(> .dc-package-information-panel:not([hidden]))")) {
      assert.doesNotMatch(declarations, /grid-(template|column|row)|box-shadow\s*:/);
    }
  }
  const jobsCss = readFileSync(new URL("../../styles/jobs.css", import.meta.url), "utf8");
  assert.match(jobsCss, /\.job-list__refresh-button\[hidden\]\s*\{[^}]*display:\s*none/);
});
