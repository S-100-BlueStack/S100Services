import assert from "node:assert/strict";
import test from "node:test";
import { createBasemapSettings } from "./basemapSettings.js";
import { createBasemapSelector } from "./createBasemapSelector.js";

class Element extends EventTarget {
  constructor(tag) {
    super();
    this.tagName = tag;
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
  async destroy() {
    this.destroyed = true;
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
}

function fixture() {
  const original = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag) };
  const container = new Element("div");
  const settings = createBasemapSettings({ apiKey: "browser-key", storage: null });
  const selector = createBasemapSelector({
    container,
    settings,
    loadModules: async () => [null, null, { default: Basemap }, { default: LocalBasemapsSource }],
  });
  selector.setView({});
  return {
    settings,
    selector,
    container,
    async ready() {
      await new Promise((resolve) => setImmediate(resolve));
    },
    destroy() {
      selector.destroy();
      settings.destroy();
      globalThis.document = original;
    },
  };
}

test("The ArcGIS Basemap Gallery offers four choices regardless of the active theme", async () => {
  const f = fixture();
  try {
    await f.ready();
    const expand = f.container.children[0];
    const gallery = expand.children[0];
    assert.equal(gallery.source.basemaps.length, 4);
    assert.equal(gallery.activeBasemap.id, "topo-vector");
    f.settings.setThemeMode("dark");
    assert.equal(gallery.activeBasemap.id, "dark-gray-vector");
    assert.equal(gallery.source.basemaps.length, 4);

    gallery.activeBasemap = gallery.source.basemaps.find((x) => x.id === "oceans");
    const event = new Event("arcgisPropertyChange");
    event.detail = { name: "activeBasemap" };
    gallery.dispatchEvent(event);
    assert.equal(f.settings.isCustom(), true);
    assert.equal(f.settings.getValue(), "oceans");
    f.settings.setThemeMode("light");
    assert.equal(gallery.activeBasemap.id, "oceans");
  } finally {
    f.destroy();
  }
});

test("basemap control joins the MapView top-right tools and follows view replacement", async () => {
  const f = fixture();
  const calls = [];
  const first = {
    ui: {
      add(node, options) {
        calls.push(["add-first", node, options]);
      },
      remove(node) {
        calls.push(["remove-first", node]);
      },
    },
  };
  const second = {
    ui: {
      add(node, options) {
        calls.push(["add-second", node, options]);
      },
      remove(node) {
        calls.push(["remove-second", node]);
      },
    },
  };
  try {
    await f.ready();
    f.selector.setView(first);
    f.selector.setView(second);
    assert.deepEqual(calls.slice(0, 3), [
      ["add-first", f.container, { position: "top-right", index: 1 }],
      ["remove-first", f.container],
      ["add-second", f.container, { position: "top-right", index: 1 }],
    ]);
  } finally {
    f.destroy();
  }
  assert.deepEqual(calls.at(-1), ["remove-second", f.container]);
});
