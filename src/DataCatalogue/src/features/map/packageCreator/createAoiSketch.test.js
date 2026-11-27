import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { createAoiSketch } from "./createAoiSketch.js";

class SketchComponent extends EventTarget {
  activeTool = null;
  cancelCount = 0;
  destroyed = false;

  emit(event, detail) {
    this.dispatchEvent(new CustomEvent(event, { detail }));
  }

  arm(tool) {
    this.activeTool = tool;
    this.emit("arcgisPropertyChange", { name: "activeTool" });
  }

  async cancel() {
    this.cancelCount++;
    this.activeTool = null;
    this.emit("arcgisUpdate", { state: "complete", aborted: true, graphics: [] });
  }

  componentOnReady() {
    return Promise.resolve(this);
  }

  remove() {}

  async destroy() {
    this.destroyed = true;
  }
}

function area(name) {
  return { name, clone: () => area(name) };
}

function fixture() {
  const component = new SketchComponent();
  const graphics = new Set();
  const states = [];
  const layer = {
    graphics: { toArray: () => [...graphics], includes: (item) => graphics.has(item) },
    add: (item) => graphics.add(item),
    remove: (item) => graphics.delete(item),
    removeAll: () => graphics.clear(),
  };
  const view = {};
  const sketch = createAoiSketch({
    component,
    host: { append: (node) => assert.equal(node, component) },
    view,
    layer,
    geometry: {
      prepare(item) {
        if (item.name === "invalid") throw new Error("Invalid AOI area.");
        return item.name;
      },
      combine(areas) {
        if (areas.includes("invalid union")) throw new Error("Cannot combine AOI areas.");
        return areas.length ? { areas } : null;
      },
    },
    onState: (state) => states.push(state),
  });
  function draw(tool, name, state = "complete") {
    component.arm(tool);
    const graphic = { geometry: area(name) };
    layer.add(graphic);
    component.activeTool = null;
    component.emit("arcgisCreate", { state, tool, graphic });
    return graphic;
  }
  const current = () => states.at(-1);
  const fitted = () => sketch.getAreas().map(({ name }) => name);
  return { component, draw, graphics, sketch, current, fitted, view, layer, states };
}

test("native rectangle, polygon and circle draw independently and Fit reads all accepted areas", async () => {
  const { sketch, component, draw, fitted, current, layer, view } = fixture();
  assert.equal(await sketch.ready, component);
  assert.equal(component.view, view);
  assert.equal(component.layer, layer);
  assert.deepEqual(component.availableCreateTools, ["rectangle", "polygon", "circle"]);
  assert.equal(component.defaultUpdateOptions.tool, "reshape");
  assert.equal(component.hidden, true);
  sketch.setEditing(true);
  assert.equal(component.updateOnGraphicClickDisabled, false);
  component.arm("polygon");
  assert.equal(current().drawing, true);
  for (const tool of component.availableCreateTools) draw(tool, tool);
  assert.deepEqual(fitted(), component.availableCreateTools);
  assert.deepEqual(current().aoi.areas, fitted());
  assert.equal(current().count, 3);
  assert.equal(current().drawing, false);
  await sketch.destroy();
});

test("selection/update commits one area, cancellation and invalid operations restore snapshots", async () => {
  const { sketch, component, draw, graphics, fitted, current } = fixture();
  sketch.setEditing(true);
  const first = draw("rectangle", "first");
  const second = draw("polygon", "second");

  component.emit("arcgisUpdate", { state: "start", graphics: [first] });
  first.geometry = area("moved");
  assert.equal(current().drawing, true);
  assert.deepEqual(current().aoi.areas, ["first", "second"]);
  first.geometry = area("first");
  component.emit("arcgisUndo", { graphics: [first] });
  first.geometry = area("moved");
  component.emit("arcgisRedo", { graphics: [first] });
  assert.equal(current().drawing, true);
  assert.deepEqual(fitted(), ["first", "second"]);
  component.emit("arcgisUpdate", { state: "complete", graphics: [first], aborted: false });
  assert.deepEqual(fitted(), ["moved", "second"]);

  second.geometry = area("tentative");
  component.emit("arcgisUpdate", { state: "complete", graphics: [second], aborted: true });
  assert.equal(second.geometry.name, "second");
  second.geometry = area("invalid");
  component.emit("arcgisUpdate", { state: "complete", graphics: [second], aborted: false });
  assert.equal(second.geometry.name, "second");
  assert.match(current().message, /previous AOI was kept/);

  assert.equal(graphics.has(draw("circle", "invalid union")), false);
  assert.equal(graphics.has(draw("circle", "cancelled", "cancel")), false);
  assert.deepEqual(fitted(), ["moved", "second"]);
  assert.deepEqual([...graphics], [first, second]);
  await sketch.destroy();
});

test("native deletion and Clear do not turn a late update into a new area", async () => {
  const { sketch, component, draw, graphics, current, fitted } = fixture();
  sketch.setEditing(true);
  const first = draw("rectangle", "first");
  const second = draw("polygon", "second");
  graphics.delete(first);
  component.emit("arcgisDelete", { graphics: [first] });
  component.emit("arcgisUpdate", { state: "complete", graphics: [first], aborted: true });
  assert.deepEqual(fitted(), ["second"]);
  assert.deepEqual([...graphics], [second]);
  sketch.clear();
  assert.equal(current().aoi, null);
  assert.equal(current().count, 0);
  assert.equal(graphics.size, 0);
  await sketch.destroy();
});

test("lock cancels a selected edit, ignores late create/delete, and teardown stops publication", async () => {
  const { sketch, component, draw, graphics, current, states } = fixture();
  sketch.setEditing(true);
  const accepted = draw("rectangle", "accepted");
  component.emit("arcgisUpdate", { state: "start", graphics: [accepted] });
  accepted.geometry = area("during edit");
  sketch.setEditing(false);
  assert.equal(component.inert, true);
  assert.equal(component.updateOnGraphicClickDisabled, true);
  assert.equal(graphics.has(draw("circle", "late draw")), false);
  graphics.delete(accepted);
  component.emit("arcgisDelete", { graphics: [accepted] });
  await setImmediate();
  assert.equal(component.cancelCount, 1);
  assert.equal(graphics.has(accepted), true);
  assert.equal(accepted.geometry.name, "accepted");
  assert.deepEqual(current().aoi.areas, ["accepted"]);
  await sketch.destroy();
  const length = states.length;
  component.emit("arcgisDelete", { graphics: [accepted] });
  assert.equal(states.length, length);
  assert.equal(component.destroyed, true);
});
