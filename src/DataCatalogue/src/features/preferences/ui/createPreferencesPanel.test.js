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
    this.style = {};
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
  getBoundingClientRect() {
    return { right: 640, bottom: 50 };
  }
  focus() {
    this.focused = true;
  }
}

function find(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root?.children ?? []) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}

function fixture() {
  const documentRef = new EventTarget();
  documentRef.createElement = (tag) => new Element(tag);
  documentRef.createTextNode = (value) => ({ textContent: value });
  documentRef.defaultView = Object.assign(new EventTarget(), {
    innerWidth: 800,
    innerHeight: 600,
  });
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
    settings,
    storage,
    themeStore,
    basemapSettings,
    find: (predicate) => find(host, predicate),
    destroy() {
      controller.destroy();
      basemapSettings.destroy();
      settings.destroy();
    },
  };
}

test("Preferences uses grouped settings with accessible Calcite switches", () => {
  const f = fixture();
  try {
    const headings = [];
    const collect = (element) => {
      if (["h2", "h3", "h4"].includes(element?.tagName)) headings.push(element.textContent);
      for (const child of element?.children ?? []) collect(child);
    };
    collect(f.host);
    assert.deepEqual(headings, [
      "Preferences",
      "Display",
      "Theme",
      "Basemap",
      "Saved preferences",
      "Basemap",
      "Map view",
      "Theme",
    ]);
    const switches = [];
    const collectSwitches = (element) => {
      if (element?.tagName === "calcite-switch") switches.push(element);
      for (const child of element?.children ?? []) collectSwitches(child);
    };
    collectSwitches(f.host);
    assert.equal(switches.length, 4);
    assert.ok(switches.every((input) => input.attributes.get("label")));
    assert.equal(f.button.attributes.get("aria-controls"), "preferences-panel");
    assert.equal(f.host.attributes.get("aria-labelledby"), "data-catalogue-preferences-title");
  } finally {
    f.destroy();
  }
});

test("Preferences opens from navbar, closes on Escape, and restores keyboard focus", () => {
  const f = fixture();
  try {
    assert.equal(f.host.hidden, true);
    assert.equal(f.host.inert, true);
    f.button.dispatchEvent(new Event("click"));
    assert.equal(f.host.hidden, false);
    assert.equal(f.button.attributes.get("aria-expanded"), "true");
    assert.equal(f.find((element) => element?.id === "data-catalogue-dark-mode").focused, true);
    const escape = Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" });
    f.documentRef.dispatchEvent(escape);
    assert.equal(escape.defaultPrevented, true);
    assert.equal(f.host.hidden, true);
    assert.equal(f.host.inert, true);
    assert.equal(f.button.focused, true);
  } finally {
    f.destroy();
  }
});

test("Theme switch and outside dismissal preserve independent settings", () => {
  const f = fixture();
  try {
    f.button.dispatchEvent(new Event("click"));
    const themeSwitch = f.find((element) => element?.id === "data-catalogue-dark-mode");
    themeSwitch.checked = true;
    themeSwitch.dispatchEvent(new Event("calciteSwitchChange"));
    assert.equal(f.themeStore.getSnapshot().themeMode, "dark");
    assert.equal(f.settings.getSnapshot().rememberTheme, true);
    f.documentRef.dispatchEvent(new Event("pointerdown"));
    assert.equal(f.host.hidden, true);
    assert.equal(f.themeStore.getSnapshot().themeMode, "dark");
  } finally {
    f.destroy();
  }
});

test("Theme Auto-save opt-out clears persistence and opt-in saves the current mode", () => {
  const f = fixture();
  try {
    f.themeStore.setThemeMode("dark");
    f.storage.setItem("data-catalogue:theme-mode", "dark");
    const rememberTheme = f.find((element) => element?.name === "rememberTheme");
    rememberTheme.checked = false;
    rememberTheme.dispatchEvent(new Event("calciteSwitchChange"));
    assert.equal(f.settings.getSnapshot().rememberTheme, false);
    assert.equal(f.storage.getItem("data-catalogue:theme-mode"), null);
    rememberTheme.checked = true;
    rememberTheme.dispatchEvent(new Event("calciteSwitchChange"));
    assert.equal(f.settings.getSnapshot().rememberTheme, true);
    assert.equal(f.storage.getItem("data-catalogue:theme-mode"), "dark");
  } finally {
    f.destroy();
  }
});

test("Preferences restores automatic basemap selection without changing theme", () => {
  const f = fixture();
  try {
    f.basemapSettings.setValue("oceans");
    const resetButton = f.find((element) => element?.className === "dc-preferences__reset-basemap");
    const basemapDescription = f.find(
      (element) => element?.className === "dc-preferences__basemap-status"
    );
    assert.equal(resetButton.disabled, false);
    assert.equal(basemapDescription.textContent, "Custom: Oceans");
    resetButton.dispatchEvent(new Event("click"));
    assert.equal(f.basemapSettings.isCustom(), false);
    assert.equal(resetButton.disabled, true);
    assert.equal(basemapDescription.textContent, "Automatic: Topographic");
    assert.equal(f.themeStore.getSnapshot().themeMode, "light");
  } finally {
    f.destroy();
  }
});

test("Preferences positions below the action and responds to viewport resizing", () => {
  const f = fixture();
  try {
    f.button.dispatchEvent(new Event("click"));
    assert.equal(f.host.style.top, "58px");
    assert.equal(f.host.style.right, "160px");
    f.documentRef.defaultView.innerWidth = 700;
    f.documentRef.defaultView.dispatchEvent(new Event("resize"));
    assert.equal(f.host.style.right, "60px");
    f.documentRef.defaultView.innerWidth = 400;
    f.documentRef.defaultView.dispatchEvent(new Event("resize"));
    assert.equal(f.host.style.left, "12px");
    assert.equal(f.host.style.right, "12px");
  } finally {
    f.destroy();
  }
});

test("Preferences teardown removes listeners and panel content", () => {
  const f = fixture();
  f.button.dispatchEvent(new Event("click"));
  f.destroy();
  assert.equal(f.host.hidden, true);
  assert.equal(f.host.children.length, 0);
  f.button.dispatchEvent(new Event("click"));
  assert.equal(f.host.hidden, true);
});
