import assert from "node:assert/strict";
import test from "node:test";
import { createBasemapSettings } from "./basemapSettings.js";
import { createBasemapSelector } from "./createBasemapSelector.js";

class FakeElement extends EventTarget {
  constructor(tagName) {
    super();
    this.tagName = tagName;
    this.children = [];
  }
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this.children = [...children];
  }
  remove() {
    this.removed = true;
  }
  destroy() {
    this.destroyed = true;
    return Promise.resolve();
  }
  componentOnReady() {
    return Promise.resolve(this);
  }
}

class Basemap {
  constructor({ id, style }) {
    this.id = id ?? style?.id;
  }
  static fromId(id) {
    return new Basemap({ id });
  }
}

class LocalBasemapsSource {
  constructor({ basemaps }) {
    this.basemaps = basemaps;
  }
  destroy() {
    this.destroyed = true;
  }
}

const fakeModules = [null, null, { default: Basemap }, { default: LocalBasemapsSource }];
const tick = () => new Promise((resolve) => setImmediate(resolve));

function createFixture({ apiKey = "", validateProtectedBasemap, loadModules } = {}) {
  const oldDocument = globalThis.document;
  const oldCustomElements = globalThis.customElements;
  const created = [];
  const whenDefined = [];
  globalThis.customElements = {
    async whenDefined(tag) {
      whenDefined.push(tag);
    },
  };
  globalThis.document = {
    createElement(tagName) {
      const element = new FakeElement(tagName);
      created.push(element);
      return element;
    },
  };
  const container = new FakeElement("div");
  const settings = createBasemapSettings({
    apiKey,
    storage: null,
    validateProtectedBasemap: validateProtectedBasemap ?? (async () => true),
  });
  const selector = createBasemapSelector({
    container,
    settings,
    loadModules: loadModules ?? (async () => fakeModules),
  });
  const uiCalls = [];
  function view(name) {
    return {
      ui: {
        add(node, position) {
          uiCalls.push([name, "add", node, position]);
        },
        remove(node) {
          uiCalls.push([name, "remove", node]);
        },
      },
    };
  }
  return {
    created,
    whenDefined,
    container,
    settings,
    selector,
    uiCalls,
    view,
    get expand() {
      return container.children[0];
    },
    get gallery() {
      return container.children[0]?.children[0];
    },
    async ready() {
      await tick();
      await tick();
      const gallery = container.children[0]?.children[0];
      if (gallery?.tagName === "arcgis-basemap-gallery") {
        gallery.dispatchEvent(new Event("arcgisReady"));
      }
    },
    dispose() {
      selector.destroy();
      settings.destroy();
      globalThis.document = oldDocument;
      globalThis.customElements = oldCustomElements;
    },
  };
}

function select(gallery, id) {
  gallery.activeBasemap = gallery.source.basemaps.find((basemap) => basemap.id === id);
  const event = new Event("arcgisPropertyChange");
  Object.defineProperty(event, "detail", { value: { name: "activeBasemap" } });
  gallery.dispatchEvent(event);
}

test("the chooser uses the actual Esri Basemap Gallery and Expand components", async () => {
  const f = createFixture();
  try {
    const view = f.view("main");
    f.selector.setView(view);
    await f.ready();
    assert.deepEqual(f.whenDefined, ["arcgis-basemap-gallery", "arcgis-expand"]);
    assert.equal(f.expand.tagName, "arcgis-expand");
    assert.equal(f.gallery.tagName, "arcgis-basemap-gallery");
    assert.equal(f.expand.expandIcon, "basemap");
    assert.equal(f.expand.autoDestroyDisabled, true);
    assert.equal(f.gallery.autoDestroyDisabled, true);
    assert.equal(f.expand.view, view);
    assert.equal(f.gallery.view, view);
    assert.deepEqual(
      f.gallery.source.basemaps.map((basemap) => basemap.title),
      ["Topographic", "Oceans", "Dark Gray"]
    );
    assert.equal(f.gallery.activeBasemap.id, "topo-vector");
    assert.equal(f.uiCalls[0][3].position, "top-right");
  } finally {
    f.dispose();
  }
});

test("a gallery selection persists through the service and synchronizes both maps", async () => {
  const f = createFixture();
  const first = {};
  const second = {};
  const stopFirst = f.settings.registerMap(first);
  const stopSecond = f.settings.registerMap(second);
  try {
    f.selector.setView(f.view("main"));
    await f.ready();
    select(f.gallery, "oceans");
    assert.equal(f.settings.getValue(), "oceans");
    assert.equal(f.settings.isCustom(), true);
    assert.equal(first.basemap, "oceans");
    assert.equal(second.basemap, "oceans");
    assert.equal(f.expand.expanded, false);
    f.settings.setThemeMode("dark");
    assert.equal(f.settings.getValue(), "oceans");
    f.settings.resetToThemeDefault();
    assert.equal(f.gallery.activeBasemap.id, "dark-gray-vector");
  } finally {
    stopFirst();
    stopSecond();
    f.dispose();
  }
});

test("a verified key adds the fourth Esri basemap without changing the MapView", async () => {
  let resolveValidation;
  const f = createFixture({
    apiKey: "browser-key",
    validateProtectedBasemap: () =>
      new Promise((resolve) => {
        resolveValidation = resolve;
      }),
  });
  try {
    const view = f.view("main");
    const map = {};
    f.settings.registerMap(map);
    f.selector.setView(view);
    await f.ready();
    assert.equal(f.gallery.source.basemaps.length, 3);
    resolveValidation(true);
    await f.ready();
    assert.equal(f.gallery.source.basemaps.length, 4);
    assert.equal(f.gallery.view, view);
    select(f.gallery, "arcgis/human-geography-dark");
    assert.equal(map.basemap, "arcgis/human-geography-dark");
  } finally {
    f.dispose();
  }
});

test("failed credential validation never exposes a restricted gallery choice", async () => {
  const f = createFixture({
    apiKey: "expired-key",
    validateProtectedBasemap: async () => {
      throw new Error("Invalid token");
    },
  });
  try {
    const map = {};
    f.settings.registerMap(map);
    f.selector.setView(f.view("main"));
    await f.ready();
    assert.equal(f.gallery.source.basemaps.length, 3);
    assert.equal(map.basemap, "topo-vector");
    assert.equal(f.settings.setValue("arcgis/human-geography-dark"), false);
  } finally {
    f.dispose();
  }
});

test("view replacement removes and destroys the old component instances", async () => {
  const f = createFixture();
  try {
    f.selector.setView(f.view("main"));
    await f.ready();
    const oldGallery = f.gallery;
    const oldExpand = f.expand;
    const assignmentView = f.view("assignment");
    f.selector.setView(assignmentView);
    await f.ready();
    assert.notEqual(oldGallery, f.gallery);
    assert.equal(oldGallery.destroyed, true);
    assert.equal(oldExpand.destroyed, true);
    assert.equal(f.gallery.view, assignmentView);
    assert.equal(f.uiCalls[1][1], "remove");
    assert.equal(f.uiCalls[2][1], "add");
    f.selector.setView(null);
    assert.deepEqual(f.container.children, []);
  } finally {
    f.dispose();
  }
});

test("superseded module initialization cannot publish an older gallery", async () => {
  let finish;
  const f = createFixture({
    loadModules: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  try {
    f.selector.setView(f.view("main"));
    await tick();
    f.selector.setView(null);
    finish(fakeModules);
    await f.ready();
    assert.deepEqual(f.container.children, []);
    assert.equal(f.created.filter((el) => el.tagName === "arcgis-basemap-gallery").length, 0);
  } finally {
    f.dispose();
  }
});

test("module import errors are isolated from map initialization", async () => {
  const f = createFixture({
    loadModules: async () => {
      throw new Error("Unavailable");
    },
  });
  try {
    f.selector.setView(f.view("main"));
    await f.ready();
    assert.match(f.container.textContent, /Basemap gallery is unavailable/);
  } finally {
    f.dispose();
  }
});

test("custom elements are defined before the gallery is constructed and connected", async () => {
  const f = createFixture();
  const callbacks = [];
  const deferred = new Promise((resolve) => callbacks.push(resolve));
  globalThis.customElements.whenDefined = async (tagName) => {
    f.whenDefined.push(tagName);
    await deferred;
  };
  try {
    f.selector.setView(f.view("main"));
    await f.ready();
    assert.deepEqual(f.container.children, []);
    assert.equal(f.created.length, 0);
    callbacks[0]();
    await f.ready();
    assert.equal(f.gallery.tagName, "arcgis-basemap-gallery");
  } finally {
    f.dispose();
  }
});
