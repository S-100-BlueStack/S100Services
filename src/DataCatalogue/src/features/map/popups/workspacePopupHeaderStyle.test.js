import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspacePopupHeaderStyle } from "./workspacePopupHeaderStyle.js";
import { workspaceColorForOpenJobs } from "../workspaces/workspaceJobColors.js";

function styledElement() {
  const properties = new Map();
  const style = {
    getPropertyValue: (name) => properties.get(name)?.value ?? "",
    getPropertyPriority: (name) => properties.get(name)?.priority ?? "",
    setProperty(name, value, priority = "") {
      properties.set(name, { value, priority });
    },
    removeProperty(name) {
      properties.delete(name);
    },
    get backgroundColor() {
      return this.getPropertyValue("background-color");
    },
    get color() {
      return this.getPropertyValue("color");
    },
  };
  return { style };
}

function makeHost(header) {
  const panel = { ...styledElement(), shadowRoot: { querySelector: () => header } };
  const flow = { shadowRoot: { querySelector: () => panel } };
  const heading = { ...styledElement(), closest: () => flow };
  return {
    panel,
    heading,
    querySelector(selector) {
      if (selector === ".esri-features__heading") return heading;
      if (selector === "calcite-flow-item") return flow;
      if (selector === "calcite-panel") return panel;
      return null;
    },
  };
}

function createHarness() {
  let callback;
  let removed = false;
  const header = styledElement();
  const view = {
    popup: { visible: false, container: makeHost(header), selectedFeature: null },
  };
  const controller = createWorkspacePopupHeaderStyle({
    view,
    layerId: "main-workspaces",
    watch(getter, changed, options) {
      assert.equal(typeof getter, "function");
      assert.deepEqual(options, { initial: true });
      callback = changed;
      changed();
      return {
        remove() {
          removed = true;
        },
      };
    },
  });
  return {
    view,
    header,
    heading: view.popup.container.heading,
    panel: view.popup.container.panel,
    controller,
    update: () => callback(),
    removed: () => removed,
  };
}

function select(view, layerId, count, visible = true) {
  view.popup.visible = visible;
  view.popup.selectedFeature = {
    layer: { id: layerId },
    visible: true,
    attributes: { openJobs: count },
  };
}

test("native ProductCatalogue header receives the exact Workspace legend color", () => {
  const { view, header, controller, update } = createHarness();
  for (const count of [null, 0, 1, 3, 5]) {
    select(view, "main-workspaces", count);
    update();
    assert.equal(
      header.style.backgroundColor,
      `rgb(${workspaceColorForOpenJobs(count).join(", ")})`
    );
    assert.match(header.style.color, /^#[0-9a-f]{6}$/);
  }
  controller.destroy();
  assert.equal(header.style.backgroundColor, "");
  assert.equal(header.style.color, "");
});

test("native header colors are removed for Packages and closed popups", () => {
  const { view, header, controller, update } = createHarness();
  select(view, "main-workspaces", 5);
  update();
  select(view, "package-layer", 5);
  update();
  assert.equal(header.style.backgroundColor, "");
  select(view, "main-workspaces", 0);
  update();
  view.popup.visible = false;
  update();
  assert.equal(header.style.backgroundColor, "");
  controller.destroy();
});

test("old native header and destroyed owner never retain styling", () => {
  const { view, header, controller, update, removed } = createHarness();
  select(view, "main-workspaces", 3);
  update();
  const next = styledElement();
  view.popup.container = makeHost(next);
  update();
  assert.equal(header.style.backgroundColor, "");
  assert.notEqual(next.style.backgroundColor, "");
  controller.destroy();
  assert.equal(next.style.backgroundColor, "");
  assert.equal(removed(), true);
  update();
  assert.equal(next.style.backgroundColor, "");
});

test("an invisible Workspace cannot color the native header", () => {
  const { view, header, controller, update } = createHarness();
  select(view, "main-workspaces", 1);
  view.popup.selectedFeature.visible = false;
  update();
  assert.equal(header.style.backgroundColor, "");
  controller.destroy();
});

test("missing native header is retried but stale selection cannot color another popup", () => {
  const previousFrame = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const queued = new Map();
  let nextId = 0;
  globalThis.requestAnimationFrame = (fn) => {
    queued.set(++nextId, fn);
    return nextId;
  };
  globalThis.cancelAnimationFrame = (id) => queued.delete(id);
  try {
    const { view, header, controller, update } = createHarness();
    select(view, "main-workspaces", 5);
    view.popup.container = { querySelector: () => null };
    update();
    assert.equal(queued.size, 1);
    select(view, "package-layer", 1);
    view.popup.container = makeHost(header);
    update();
    assert.equal(queued.size, 0);
    assert.equal(header.style.backgroundColor, "");
    controller.destroy();
  } finally {
    if (previousFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousFrame;
    if (previousCancel === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = previousCancel;
  }
});

function relativeLuminance(rgb) {
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(left, right) {
  const values = [relativeLuminance(left), relativeLuminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("native title and close action contrast follow the legend rather than the theme", () => {
  const { view, header, heading, panel, controller, update } = createHarness();
  for (const count of [null, 0, 1, 3, 5]) {
    select(view, "main-workspaces", count);
    update();
    const foreground = heading.style.color;
    assert.equal(foreground, header.style.color);
    assert.equal(heading.style.getPropertyPriority("color"), "important");
    assert.equal(header.style.getPropertyValue("--calcite-color-text-1"), foreground);
    assert.equal(
      panel.style.getPropertyValue("--calcite-panel-header-action-text-color"),
      foreground
    );
    assert.equal(
      panel.style.getPropertyValue("--calcite-panel-header-action-text-color-press"),
      foreground
    );
    assert.equal(header.style.getPropertyValue("--calcite-action-text-color"), foreground);
    assert.equal(panel.style.color, "");
    const textRgb = foreground === "#000000" ? [0, 0, 0] : [255, 255, 255];
    assert.ok(contrastRatio(workspaceColorForOpenJobs(count), textRgb) >= 4.5);
    const hoverRgb = panel.style
      .getPropertyValue("--calcite-panel-header-action-background-color-hover")
      .match(/\d+/g)
      .map(Number);
    assert.ok(contrastRatio(hoverRgb, textRgb) >= 3);
  }
  select(view, "main-workspaces", 2);
  update();
  assert.equal(heading.style.color, "#000000");
  controller.destroy();
});

test("selection change restores the previous title and panel action styles with their priorities", () => {
  const { view, header, heading, panel, controller, update } = createHarness();
  heading.style.setProperty("color", "rgb(230, 230, 230)", "important");
  panel.style.setProperty("--calcite-panel-header-action-text-color", "red");
  header.style.setProperty("--calcite-color-text-1", "blue", "important");
  select(view, "main-workspaces", 1);
  update();
  assert.equal(heading.style.color, "#000000");
  select(view, "package-layer", 1);
  update();
  assert.equal(heading.style.color, "rgb(230, 230, 230)");
  assert.equal(heading.style.getPropertyPriority("color"), "important");
  assert.equal(panel.style.getPropertyValue("--calcite-panel-header-action-text-color"), "red");
  assert.equal(panel.style.getPropertyPriority("--calcite-panel-header-action-text-color"), "");
  assert.equal(panel.style.getPropertyValue("--calcite-panel-header-action-text-color-press"), "");
  assert.equal(header.style.getPropertyValue("--calcite-color-text-1"), "blue");
  assert.equal(header.style.getPropertyPriority("--calcite-color-text-1"), "important");
  controller.destroy();
});

test("replacing the native header restores the old title and action styles", () => {
  const { view, header, heading, panel, controller, update } = createHarness();
  select(view, "main-workspaces", 1);
  update();
  const next = styledElement();
  view.popup.container = makeHost(next);
  update();
  assert.equal(header.style.backgroundColor, "");
  assert.equal(heading.style.color, "");
  assert.equal(panel.style.getPropertyValue("--calcite-panel-header-action-text-color"), "");
  assert.equal(view.popup.container.heading.style.color, "#000000");
  controller.destroy();
  assert.equal(view.popup.container.heading.style.color, "");
  assert.equal(
    view.popup.container.panel.style.getPropertyValue("--calcite-panel-header-action-text-color"),
    ""
  );
});
