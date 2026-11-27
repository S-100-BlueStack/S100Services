import assert from "node:assert/strict";
import test from "node:test";
import { createRectangleSketch } from "./createRectangleSketch.js";
import { rectangleAoi } from "./rectangleAoi.js";

const clockwise = [
  [12, 55],
  [12, 56],
  [13, 56],
  [13, 55],
  [12, 55],
];

test("rectangle normalizes orientation with the native AOI fixture's WKID", () => {
  assert.deepEqual(rectangleAoi([...clockwise].reverse()), {
    rings: [clockwise],
    spatialReference: { wkid: 4326 },
  });
});

test("geometry validation rejects non-rectangles, non-XY, nonfinite, zero-area and dateline draws", () => {
  for (const ring of [
    [
      [12, 55],
      [13, 56],
      [12, 56],
      [13, 55],
      [12, 55],
    ],
    clockwise.slice(0, 4),
    clockwise.map(([x, y]) => [x, y, 0]),
    clockwise.map(([x, y]) => [x, y === 55 ? Infinity : y]),
    clockwise.map(([, y]) => [12, y]),
    clockwise.map(([x, y]) => [x === 12 ? -179 : 179, y]),
    clockwise.map(([x, y]) => [x, y + 40]),
  ]) {
    assert.throws(() => rectangleAoi(ring), /rectangle/);
  }
});

class SketchComponent extends EventTarget {
  activeTool = null;
  destroyed = false;
  cancelCount = 0;

  beginRectangle() {
    this.activeTool = "rectangle";
    this.dispatchEvent(new CustomEvent("arcgisPropertyChange", { detail: { name: "activeTool" } }));
  }

  emitCreate(state, geometry, tool = "rectangle") {
    this.dispatchEvent(
      new CustomEvent("arcgisCreate", { detail: { state, tool, graphic: { geometry } } })
    );
  }

  async cancel() {
    this.cancelCount++;
    this.activeTool = null;
    this.emitCreate("cancel");
  }

  componentOnReady() {
    return Promise.resolve(this);
  }

  remove() {}

  async destroy() {
    this.destroyed = true;
  }
}

test("native rectangle events preserve the accepted AOI through Escape and invalid replacement", async () => {
  const component = new SketchComponent();
  const states = [];
  const view = {};
  const layer = {};
  let draft;
  const sketch = createRectangleSketch({
    component,
    host: {
      append(node) {
        assert.equal(node, component);
      },
    },
    view,
    layer,
    clearSketch() {},
    clearDraft() {
      draft = null;
    },
    acceptGeometry(geometry) {
      draft = rectangleAoi(geometry);
      return draft;
    },
    onState(state) {
      states.push(state);
    },
  });
  assert.equal(await sketch.ready, component);
  assert.equal(component.view, view);
  assert.equal(component.layer, layer);
  assert.deepEqual(component.availableCreateTools, ["rectangle"]);
  assert.equal(component.creationMode, "single");
  assert.equal(component.defaultGraphicsLayerDisabled, true);
  assert.equal(component.updateOnGraphicClickDisabled, true);
  assert.equal(component.hidden, true);
  assert.equal(component.inert, true);
  sketch.setEditing(true);
  assert.equal(component.hidden, false);
  assert.equal(component.inert, false);
  component.beginRectangle();
  assert.equal(states.at(-1).drawing, true, "armed before the first vertex");
  component.emitCreate("complete", clockwise);
  const accepted = draft;
  assert.equal(states.at(-1).aoi, accepted);
  assert.equal(states.at(-1).drawing, false);
  component.beginRectangle();
  component.emitCreate("cancel");
  assert.equal(states.at(-1).aoi, accepted);
  component.beginRectangle();
  component.emitCreate("complete", []);
  assert.equal(states.at(-1).aoi, accepted);
  assert.match(states.at(-1).message, /rectangle/);
  component.emitCreate("complete", clockwise, "polygon");
  assert.equal(states.at(-1).aoi, accepted);
  sketch.clear();
  assert.equal(states.at(-1).aoi, null);
  await sketch.destroy();
  assert.equal(component.destroyed, true);
});

test("locking and disposal ignore completion events and cancel an armed sketch", async () => {
  const component = new SketchComponent();
  const states = [];
  let accepted = 0;
  const sketch = createRectangleSketch({
    component,
    host: { append() {} },
    clearSketch() {},
    clearDraft() {},
    acceptGeometry() {
      accepted++;
    },
    onState(state) {
      states.push(state);
    },
  });
  sketch.setEditing(true);
  component.beginRectangle();
  sketch.setEditing(false);
  assert.equal(component.inert, true);
  component.emitCreate("complete", clockwise);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(component.cancelCount, 1);
  assert.equal(accepted, 0);
  assert.equal(states.at(-1).drawing, false);
  sketch.setEditing(true);
  assert.equal(component.inert, false);
  await sketch.destroy();
  const length = states.length;
  component.beginRectangle();
  component.emitCreate("complete", clockwise);
  assert.equal(states.length, length);
  assert.equal(accepted, 0);
});
