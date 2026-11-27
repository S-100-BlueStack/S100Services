import assert from "node:assert/strict";
import test from "node:test";
import { createPackageCreatorPage } from "./createPackageCreatorPage.js";

class Control extends EventTarget {
  value = "";
  hidden = false;
  disabled = false;
  style = {};
  children = [];
  textContent = "";
  setAttribute() {}
  focus() {}
  remove() {}
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this.children = children;
  }
  click() {
    if (!this.disabled) this.dispatchEvent(new Event("click"));
  }
}

test("the Creator guards drafts, pending writes and explicit unknown abandonment", async (t) => {
  const window = new EventTarget();
  const controls = new Map();
  const names = [
    "category",
    "absoluteUri",
    "refId",
    "priority",
    "severity",
    "descriptionLanguage",
    "language",
    "description",
  ];
  const inputs = Object.fromEntries(names.map((name) => [name, new Control()]));
  const confirmMessages = [];
  const get = (name) => {
    if (!controls.has(name)) controls.set(name, new Control());
    return controls.get(name);
  };
  const root = new Control();
  root.querySelector = (selector) => get(selector.match(/="([^"]+)"/)[1]);
  const form = get("form");
  form.elements = { namedItem: (name) => inputs[name] };
  form.reset = () => {
    for (const input of Object.values(inputs)) input.value = "";
  };

  t.mock.method(globalThis, "FormData", function () {
    return {
      entries: () =>
        Object.entries(inputs)
          .filter(([, input]) => !input.disabled)
          .map(([name, input]) => [name, input.value]),
      values() {
        return this.entries().map(([, value]) => value);
      },
      [Symbol.iterator]() {
        return this.entries()[Symbol.iterator]();
      },
    };
  });
  const original = Object.fromEntries(
    ["document", "window", "Option"].map((key) => [key, globalThis[key]])
  );
  Object.assign(globalThis, {
    document: { createElement: (tag) => (tag === "section" ? root : new Control()) },
    window,
    Option: class {},
  });
  let sketch;
  let drawingEnabled;
  const previews = [];
  let resolve;
  let confirmationsAllowed = false;
  let creates = 0;
  let reads = 0;
  const page = createPackageCreatorPage({
    readCategories: async () => {
      reads++;
      return [{ id: "WorkZone", name: "WorkZone" }];
    },
    service: {
      create(request) {
        creates++;
        assert.equal(request.absoluteUri, "urn:example:approved");
        assert.equal(request.metaData.refId, "42");
        assert.equal(request.severity, "9007199254740993");
        assert.deepEqual(request.descriptions, [{ description: "Draft", language: "de" }]);
        return new Promise((done) => {
          resolve = done;
        });
      },
    },
    createMap({ onReady, onSketchState }) {
      sketch = onSketchState;
      onReady(true);
      return {
        view: null,
        setEditing(value) {
          drawingEnabled = value;
        },
        clear() {
          sketch({ aoi: null, drawing: false });
        },
        showPackage(id) {
          previews.push(id);
        },
        destroy() {},
      };
    },
    basemapSettings: {
      getValue() {},
      getThemeMode() {},
      subscribe: () => () => {},
    },
    onCatalogueChange() {},
    confirm(message) {
      confirmMessages.push(message);
      return confirmationsAllowed;
    },
  });
  t.after(() => {
    page.destroy();
    Object.assign(globalThis, original);
  });
  page.activate();
  await new Promise((done) => setImmediate(done));
  assert.equal(reads, 1);
  assert.equal(page.allowLeave(), true);
  assert.equal(drawingEnabled, true);
  assert.equal(inputs.severity.disabled, true);
  assert.equal(inputs.language.disabled, true);
  const fields = {
    priority: "custom",
    severity: "9007199254740993",
    descriptionLanguage: "other",
    language: "de",
    description: "Draft",
    category: "WorkZone",
    absoluteUri: "urn:example:approved",
    refId: "42",
  };
  function fill() {
    for (const [name, value] of Object.entries(fields)) inputs[name].value = value;
    form.dispatchEvent(new Event("input"));
  }
  const drawn = {
    aoi: {
      rings: [
        [
          [12, 55],
          [12, 56],
          [13, 56],
          [13, 55],
          [12, 55],
        ],
      ],
      spatialReference: { wkid: 4326 },
    },
    count: 1,
    drawing: false,
  };
  fill();
  assert.equal(page.allowLeave(), false);
  assert.match(confirmMessages.at(-1), /Discard this Package draft/);
  assert.equal(inputs.refId.value, "42");
  assert.equal(get("severityField").hidden, false);
  assert.equal(get("languageField").hidden, false);
  sketch(drawn);
  assert.match(get("mapStatus").textContent, /1 draft area ready/);
  sketch({ ...drawn, drawing: true });
  form.dispatchEvent(new Event("submit"));
  assert.equal(creates, 0);
  assert.equal(get("clear").disabled, true);
  sketch(drawn);

  form.dispatchEvent(new Event("submit"));
  form.dispatchEvent(new Event("submit"));
  assert.equal(creates, 1);
  assert.equal(page.allowLeave(), false);
  assert.equal(get("fields").disabled, true);
  assert.equal(drawingEnabled, false);
  assert.equal(get("clear").disabled, true);
  resolve({ status: "unknown", message: "Lost response." });
  await new Promise((done) => setImmediate(done));
  assert.match(get("status").textContent, /Creation outcome unknown/);
  assert.equal(page.allowLeave(), false);
  assert.equal(get("reconcile").hidden, true);
  assert.equal(drawingEnabled, false);
  get("abandon").click();
  assert.equal(inputs.refId.value, "42");
  confirmationsAllowed = true;
  get("abandon").click();
  assert.match(confirmMessages.at(-1), /may have been created/);
  assert.equal(page.allowLeave(), true);
  assert.equal(inputs.refId.value, "");
  assert.equal(inputs.severity.disabled, true);
  assert.equal(inputs.language.disabled, true);
  assert.equal(drawingEnabled, true);
  page.deactivate();
  page.activate();
  assert.equal(reads, 1);
  fill();
  sketch(drawn);
  form.dispatchEvent(new Event("submit"));
  resolve({
    status: "confirmed",
    item: { id: "created", shortId: "WZ-001-26", pipelineIds: [], descriptionEntries: [] },
  });
  await new Promise((done) => setImmediate(done));
  assert.equal(drawingEnabled, false);
  assert.equal(get("clear").disabled, true);
  assert.equal(get("result").hidden, false);
  assert.equal(previews.at(-1), "created");
  form.dispatchEvent(new Event("submit"));
  assert.equal(creates, 2);
  get("another").click();
  assert.equal(drawingEnabled, true);
});
