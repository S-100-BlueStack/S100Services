import assert from "node:assert/strict";
import test from "node:test";
import { createBasemapSettings } from "../../map/basemaps/basemapSettings.js";
import { createPreferencesSettings } from "../state/createPreferencesSettings.js";
import { createPreferencesPanel } from "./createPreferencesPanel.js";

class Element extends EventTarget {
  constructor(tag) {
    super();
    this.tagName = tag;
    this.children = [];
    this.attributes = new Map();
    this.hidden = false;
    this.inert = false;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this.children = [...children];
  }
  contains(target) {
    return this === target || this.children.some((child) => child?.contains?.(target));
  }
  focus() {
    this.focused = true;
  }
}

function fixture() {
  const documentRef = new EventTarget();
  documentRef.createElement = (tag) => new Element(tag);
  documentRef.createTextNode = (value) => ({ textContent: value });
  const button = new Element("calcite-action");
  const host = new Element("div");
  host.hidden = true;
  const navbarElement = {
    querySelector: (selector) =>
      ({
        "#preferences-button": button,
        "#preferences-panel": host,
      })[selector],
  };
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const settings = createPreferencesSettings({ storage });
  const basemapSettings = createBasemapSettings({ storage, preferences: settings });
  let mode = "light";
  const listeners = new Set();
  const themeStore = {
    getSnapshot: () => ({ themeMode: mode }),
    setThemeMode(next) {
      mode = next;
      for (const listener of listeners) listener({ themeMode: mode });
    },
    subscribe(listener) {
      listeners.add(listener);
      listener({ themeMode: mode });
      return () => listeners.delete(listener);
    },
  };
  const controller = createPreferencesPanel({
    navbarElement,
    settings,
    themeStore,
    basemapSettings,
    documentRef,
  });
  return {
    button,
    host,
    documentRef,
    themeStore,
    basemapSettings,
    destroy() {
      controller.destroy();
      basemapSettings.destroy();
      settings.destroy();
    },
  };
}

test("Preferences opens from navbar, closes on Escape, and restores keyboard focus", () => {
  const f = fixture();
  try {
    assert.equal(f.host.hidden, true);
    f.button.dispatchEvent(new Event("click"));
    assert.equal(f.host.hidden, false);
    assert.equal(f.button.attributes.get("aria-expanded"), "true");
    const escape = Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" });
    f.documentRef.dispatchEvent(escape);
    assert.equal(escape.defaultPrevented, true);
    assert.equal(f.host.hidden, true);
    assert.equal(f.button.focused, true);
  } finally {
    f.destroy();
  }
});

test("Clicking outside closes Preferences and theme moves only from its panel", () => {
  const f = fixture();
  try {
    f.button.dispatchEvent(new Event("click"));
    const panel = f.host.children[0];
    const themeSelect = panel.children[1].children[1];
    themeSelect.value = "dark";
    themeSelect.dispatchEvent(new Event("change"));
    assert.equal(f.themeStore.getSnapshot().themeMode, "dark");
    f.documentRef.dispatchEvent(new Event("pointerdown"));
    assert.equal(f.host.hidden, true);
  } finally {
    f.destroy();
  }
});

test("Preferences restores automatic basemap selection without changing the theme", () => {
  const f = fixture();
  try {
    f.basemapSettings.setValue("oceans");
    f.button.dispatchEvent(new Event("click"));
    const panel = f.host.children[0];
    const resetButton = panel.children[2].children[1];
    assert.equal(resetButton.disabled, false);
    resetButton.dispatchEvent(new Event("click"));
    assert.equal(f.basemapSettings.isCustom(), false);
    assert.equal(resetButton.disabled, true);
    assert.equal(f.themeStore.getSnapshot().themeMode, "light");
  } finally {
    f.destroy();
  }
});
