import assert from "node:assert/strict";
import test from "node:test";
import { createBasemapSettings } from "./basemapSettings.js";
import { createBasemapSelector } from "./createBasemapSelector.js";

class Element extends EventTarget {
  constructor(tag) {
    super();
    this.tagName = tag;
    this.children = [];
    this.style = {};
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

const modules = [null, null, { default: Basemap }, { default: LocalBasemapsSource }];

function fixture({ loadModules = async () => modules, apiKey = "browser-key" } = {}) {
  const prior = globalThis.document;
  const document = new EventTarget();
  document.createElement = (tag) => new Element(tag);
  globalThis.document = document;
  const container = new Element("div");
  const settings = createBasemapSettings({ apiKey, storage: null });
  const selector = createBasemapSelector({ container, settings, loadModules });
  return {
    container,
    document,
    settings,
    selector,
    async ready() {
      await new Promise((resolve) => setImmediate(resolve));
    },
    destroy() {
      selector.destroy();
      settings.destroy();
      globalThis.document = prior;
    },
  };
}

function emitActiveChange(gallery) {
  const event = new Event("arcgisPropertyChange");
  event.detail = { name: "activeBasemap" };
  gallery.dispatchEvent(event);
}

test("Gallery offers four known basemaps and preserves a manual selection across themes", async () => {
  const f = fixture();
  try {
    const view = { map: {} };
    f.selector.setView(view);
    await f.ready();
    const expand = f.container.children[0];
    const gallery = expand.children[0];
    assert.equal(gallery.view, view);
    assert.equal(expand.view, view);
    assert.equal(expand.visualScale, "m", "Expand uses the normal zoom-control scale");
    assert.equal(gallery.source.basemaps.length, 4);
    assert.equal(gallery.activeBasemap.id, "topo-vector");
    expand.expanded = true;
    assert.equal(f.selector.close(), true);
    assert.equal(expand.expanded, false);
    assert.equal(f.selector.close(), false);
    f.settings.setThemeMode("dark");
    assert.equal(gallery.activeBasemap.id, "dark-gray-vector");
    gallery.activeBasemap = gallery.source.basemaps.find((item) => item.id === "oceans");
    emitActiveChange(gallery);
    assert.equal(f.settings.getValue(), "oceans");
    assert.equal(f.settings.isCustom(), true);
    assert.equal(expand.expanded, false);
    f.settings.setThemeMode("light");
    assert.equal(gallery.activeBasemap.id, "oceans");
    f.selector.destroy();
    assert.equal(gallery.view, null);
    assert.equal(expand.destroyed, true);
    assert.equal(f.container.children.length, 0);
  } finally {
    f.destroy();
  }
});

test("Native gallery closes on outside pointerdown but not within its control or gallery", async () => {
  const f = fixture();
  try {
    f.selector.setView({ id: "main-map" });
    await f.ready();
    const expand = f.container.children[0];
    const gallery = expand.children[0];

    const pointerDown = (path) => {
      const event = new Event("pointerdown", { cancelable: true });
      Object.defineProperty(event, "composedPath", { value: () => path });
      f.document.dispatchEvent(event);
      return event;
    };

    for (const path of [[gallery, expand], [expand, f.container], [f.container]]) {
      expand.expanded = true;
      assert.equal(pointerDown(path).defaultPrevented, false);
      assert.equal(expand.expanded, true, "native gallery interactions must stay inside");
    }

    expand.expanded = true;
    const outsideClick = pointerDown([{}]);
    assert.equal(expand.expanded, false);
    assert.equal(outsideClick.defaultPrevented, false, "do not interfere with map clicks");
    assert.equal(f.settings.getValue(), "topo-vector", "dismissal is not a selection");

    expand.expanded = true;
    f.selector.destroy();
    pointerDown([{}]);
    assert.equal(expand.expanded, true, "destroy removes the global pointer listener");
  } finally {
    f.destroy();
  }
});

test("Theme changes recreate only the native Gallery under the new mode", async () => {
  const f = fixture();
  try {
    const view = { id: "main-map" };
    f.selector.setView(view);
    await f.ready();
    const first = f.container.children[0];
    const firstGallery = first.children[0];
    assert.equal(f.container.style.colorScheme, "light");
    assert.equal(firstGallery.style.colorScheme, "light");
    assert.match(first.className, /calcite-mode-light/);

    f.settings.setValue("oceans");
    f.settings.setThemeMode("dark");
    f.selector.setThemeMode("dark");
    await f.ready();
    const second = f.container.children[0];
    const secondGallery = second.children[0];
    assert.notEqual(second, first);
    assert.equal(firstGallery.view, null);
    assert.equal(first.destroyed, true);
    assert.equal(secondGallery.view, view);
    assert.equal(secondGallery.activeBasemap.id, "oceans");
    assert.equal(f.container.style.colorScheme, "dark");
    assert.equal(second.style.colorScheme, "dark");
    assert.equal(secondGallery.style.colorScheme, "dark");
    assert.match(second.className, /calcite-mode-dark/);
    assert.match(secondGallery.className, /calcite-mode-dark/);

    f.selector.setThemeMode("dark");
    await f.ready();
    assert.equal(f.container.children[0], second, "unchanged modes should not recreate UI");

    // A destroyed gallery may still emit a queued event. It must not change the
    // currently selected work-unit basemap or re-enter the active selector.
    firstGallery.activeBasemap = firstGallery.source.basemaps.find((b) => b.id === "topo-vector");
    emitActiveChange(firstGallery);
    assert.equal(f.settings.getValue(), "oceans");

    f.settings.setThemeMode("light");
    f.selector.setThemeMode("light");
    await f.ready();
    const third = f.container.children[0];
    assert.equal(third.children[0].activeBasemap.id, "oceans");
    assert.equal(third.style.colorScheme, "light");
    assert.equal(second.destroyed, true);
    assert.equal(secondGallery.view, null);
    assert.equal(f.settings.getValue(), "oceans");
  } finally {
    f.destroy();
  }
});

test("Theme changed during asynchronous import is applied only to the latest live selector", async () => {
  let finishImport;
  const loadModules = () =>
    new Promise((resolve) => {
      finishImport = resolve;
    });
  const f = fixture({ loadModules });
  try {
    f.selector.setView({ id: "analyze" });
    f.selector.setThemeMode("dark");
    finishImport(modules);
    await f.ready();
    assert.equal(f.container.children.length, 1, "pending mount uses newest theme");
    assert.equal(f.container.children[0].style.colorScheme, "dark");
    f.selector.setView(null);
    f.selector.setView({ id: "current" });
    await f.ready();
    const gallery = f.container.children[0].children[0];
    assert.equal(gallery.view.id, "current");
    assert.equal(gallery.style.colorScheme, "dark");
  } finally {
    f.destroy();
  }
});

test("No-key gallery hides the key-only style and ignores unrelated property changes", async () => {
  const f = fixture({ apiKey: "" });
  try {
    f.selector.setView({});
    await f.ready();
    const gallery = f.container.children[0].children[0];
    assert.equal(gallery.source.basemaps.length, 3);
    const event = new Event("arcgisPropertyChange");
    event.detail = { name: "state" };
    gallery.dispatchEvent(event);
    assert.equal(f.settings.isCustom(), false);
  } finally {
    f.destroy();
  }
});

test("Superseded async view mounts do not resurrect a destroyed or replaced selector", async () => {
  let finishLoad;
  const promise = new Promise((resolve) => {
    finishLoad = resolve;
  });
  const f = fixture({ loadModules: () => promise });
  try {
    f.selector.setView({ id: "first" });
    f.selector.setView(null);
    finishLoad(modules);
    await f.ready();
    assert.equal(f.container.children.length, 0);
    f.selector.setView({ id: "second" });
    await f.ready();
    assert.equal(f.container.children[0].children[0].view.id, "second");
    f.selector.destroy();
    f.selector.setView({ id: "stale" });
    await f.ready();
    assert.equal(f.container.children.length, 0);
  } finally {
    f.destroy();
  }
});

test("A rejected module load can be retried without changing the map", async () => {
  let attempts = 0;
  const f = fixture({
    loadModules: async () => {
      if (++attempts === 1) throw new Error("component unavailable");
      return modules;
    },
  });
  try {
    f.selector.setView({ id: "first" });
    await f.ready();
    assert.match(f.container.textContent, /unavailable/);
    f.selector.setView({ id: "replacement" });
    await f.ready();
    assert.equal(f.container.children[0].children[0].view.id, "replacement");
  } finally {
    f.destroy();
  }
});
