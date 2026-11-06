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
