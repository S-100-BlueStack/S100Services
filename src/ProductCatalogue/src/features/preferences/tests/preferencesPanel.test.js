import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Exercise application-owned DOM contracts without loading ArcGIS or Calcite internals.
class TestElement extends EventTarget {
  constructor(tag = "div", attributes = "") {
    super();
    this.tagName = tag;
    this.attributes = new Map();
    this.dataset = {};
    this.children = [];
    this.style = {};
    this.hidden = false;
    this.value = "";
    this.id = "";
    this.textContent = "";
    this.classes = new Set();
    this.classList = {
      contains: (name) => this.classes.has(name),
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
    };
    for (const [, name, value] of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
      this.setAttribute(name, value ?? "");
    }
    this.checked = this.attributes.has("checked");
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "id" || name === "value") this[name] = value;
    if (name.startsWith("data-")) {
      this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    }
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  toggleAttribute(name, enabled) {
    if (enabled) this.setAttribute(name, "");
    else this.attributes.delete(name);
  }
  matches(selector) {
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    const [, tag, attribute, value] =
      selector.match(/^([\w-]+)?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/) ?? [];
    return (
      (!tag || this.tagName === tag) &&
      (!attribute ||
        (this.attributes.has(attribute) &&
          (value === undefined || this.attributes.get(attribute) === value)))
    );
  }
  closest(selector) {
    return this.matches(selector) ? this : null;
  }
  querySelectorAll(selector) {
    const matches = selector.split(",").map((part) => part.trim());
    return this.children
      .flatMap((child) => [child, ...child.querySelectorAll("*")])
      .filter((child) => selector === "*" || matches.some((part) => child.matches(part)));
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  set innerHTML(value) {
    this.html = value;
    this.children = [...value.matchAll(/<([\w-]+)([^>]*)>/g)].map(
      ([, tag, attributes]) => new TestElement(tag, attributes)
    );
  }
  append(...children) {
    this.children.push(...children);
  }
  appendChild(child) {
    this.append(child);
  }
  contains(target) {
    return this === target || this.children.some((child) => child.contains(target));
  }
  focus() {
    document.activeElement = this;
  }
  remove() {
    this.removed = true;
  }
  getBoundingClientRect() {
    return { bottom: 48, right: 1000 };
  }
}

const values = new Map();
const localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};
globalThis.Element = TestElement;
globalThis.localStorage = localStorage;
globalThis.window = Object.assign(new EventTarget(), {
  localStorage,
  innerWidth: 1024,
  innerHeight: 768,
});
globalThis.document = Object.assign(new EventTarget(), {
  body: new TestElement("body"),
  head: new TestElement("head"),
  documentElement: new TestElement("html"),
  activeElement: null,
  createElement: (tag) => new TestElement(tag),
  getElementById(id) {
    return this.body.querySelector(`#${id}`) ?? this.head.querySelector(`#${id}`);
  },
  querySelector(selector) {
    return this.body.querySelector(selector);
  },
});

async function loadModule(relativePath, replacements = {}) {
  const url = new URL(relativePath, import.meta.url);
  let source = await readFile(url, "utf8");
  for (const [original, replacement] of Object.entries(replacements))
    source = source.replace(original, replacement);
  source = source.replace(
    /from "(\.[^"]+)"/g,
    (_, specifier) => `from "${new URL(specifier, url).href}"`
  );
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  return { module: await import(moduleUrl), moduleUrl };
}
const theme = await loadModule("../../themes/themeService.js", {
  'import lightThemeUrl from "@arcgis/core/assets/esri/themes/light/main.css?url";':
    'const lightThemeUrl = "light.css";',
  'import darkThemeUrl from "@arcgis/core/assets/esri/themes/dark/main.css?url";':
    'const darkThemeUrl = "dark.css";',
});
const { module: preferences } = await loadModule("../ui/preferencesPanel.js", {
  'import { noticeSuccess } from "../../notices/services/noticeService.js";':
    "const noticeSuccess = () => {};",
  'from "../../themes/themeService.js"': `from "${theme.moduleUrl}"`,
});
const persistence = await import("../state/preferencePersistenceState.js");
const scale = await import("../../map/scale/displayScaleOverrideState.js");
const dashboard = await import("../../dashboard/state/dashboardPageSizePreference.js");

function event(type, target, properties = {}) {
  const result = new Event(type, { cancelable: true });
  Object.defineProperty(result, "target", { value: target });
  Object.assign(result, properties);
  return result;
}
function mount(options = {}, route = "main") {
  document.body.children = [];
  document.body.classes.clear();
  document.body.classList.add(`pc-${route}-route`);
  const button = new TestElement("calcite-action", 'id="preferences-button"');
  document.body.append(button);
  const api = preferences.initPreferencesPanel(options);
  const panel = document.getElementById("preferences-panel");
  button.dispatchEvent(event("click", button));
  return { api, panel, button };
}
function click(panel, action) {
  const button = panel.querySelector(`[data-preference-action="${action}"]`);
  assert.ok(button, action);
  button.focus();
  panel.dispatchEvent(event("click", button));
  return button;
}
for (const route of ["analyze", "review", "dashboard", "other-shared-page"]) {
  test(`${route}: Preferences opens without map capability, storage writes or map controls`, () => {
    const before = new Map(values);
    let introductions = 0;
    const { api, panel, button } = mount({ onStartIntroduction: () => introductions++ }, route);
    assert.deepEqual(values, before);
    assert.equal(panel.querySelectorAll("#preferences-dark-mode").length, 1);
    assert.equal(panel.querySelector("#preferences-scale-hiding"), null);
    assert.equal(panel.querySelector('[data-preference-persistence-key="mapViewpoint"]'), null);
    assert.doesNotMatch(panel.html, />Introduction<\/h3>|>Settings<\/h3>/);
    assert.match(panel.html, /id="preferences-theme-label">Theme<\/h4>/);
    assert.match(
      panel.html,
      /icon="brightness"[\s\S]*id="preferences-dark-mode"[\s\S]*icon="moon"/
    );
    assert.match(
      panel.html,
      /class="pc-preferences-panel__introduction"[\s\S]*data-preference-action="start-introduction"/
    );
    assert.match(panel.html, /title="Show a short guide to the controls on this page\."/);
    assert.doesNotMatch(panel.html, /Show a short guide[^"]*<\/small>/);
    assert.match(panel.html, /<h3 id="preferences-saved-heading">Saved preferences<\/h3>/);
    assert.match(
      panel.html,
      /Choose which preferences are remembered\. Turning Auto-save off removes the saved value\./
    );
    assert.doesNotMatch(panel.html, /Clear saved value|data-preference-action="clear-/);
    assert.equal(document.activeElement.id, "preferences-dark-mode");
    click(panel, "start-introduction");
    assert.equal(introductions, 1);
    assert.equal(panel.hidden, true);
    button.dispatchEvent(event("click", button));
    const escape = event("keydown", button, { key: "Escape" });
    document.dispatchEvent(escape);
    assert.equal(escape.defaultPrevented, true);
    assert.equal(panel.hidden, true);
    assert.equal(document.activeElement, button);
    api.destroy();
  });
}

test("shared Preferences import graph excludes every Main-map module", async () => {
  const visited = new Set();
  async function visit(url) {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    assert.doesNotMatch(url.pathname, /\/features\/(map|dataSources)\//);
    const source = await readFile(url, "utf8");
    for (const [, specifier] of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+\.js)["']/g)) {
      await visit(new URL(specifier, url));
    }
  }
  await visit(new URL("../ui/preferencesPanel.js", import.meta.url));
});

test("Theme switch uses icon endpoints, the Theme owner and keeps focus", () => {
  persistence.setPreferencePersistenceEnabled("theme", true);
  theme.module.applyTheme("light");
  const { api, panel } = mount({}, "review");
  const control = panel.querySelector("#preferences-dark-mode");
  assert.ok(control);
  assert.equal(control.checked, false);
  assert.equal(control.getAttribute("label"), "Dark theme");
  control.focus();
  control.checked = true;
  panel.dispatchEvent(event("calciteSwitchChange", control));
  assert.equal(theme.module.getCurrentTheme(), "dark");
  assert.equal(control.checked, true);
  assert.equal(document.activeElement, control);
  control.checked = false;
  panel.dispatchEvent(event("calciteSwitchChange", control));
  assert.equal(theme.module.getCurrentTheme(), "light");
  assert.equal(control.checked, false);
  assert.equal(document.activeElement, control);
  api.updateContext({ themeView: null });
  assert.equal(document.activeElement.id, "preferences-dark-mode");
  api.destroy();
});

test("Theme Auto-save off removes persistence without changing runtime or unrelated state", async () => {
  persistence.setPreferencePersistenceEnabled("theme", true);
  theme.module.applyTheme("dark");
  values.set("unrelated-source-state", "unchanged");
  const { api, panel } = mount({}, "analyze");
  const control = panel.querySelector('[data-preference-persistence-key="theme"]');
  control.checked = false;
  control.focus();
  panel.dispatchEvent(event("calciteSwitchChange", control));
  await Promise.resolve();
  assert.equal(theme.module.getCurrentTheme(), "dark");
  assert.equal(localStorage.getItem("app-theme"), null);
  assert.equal(localStorage.getItem("unrelated-source-state"), "unchanged");
  assert.equal(document.activeElement, control);
  const reset = click(panel, "reset-theme");
  assert.equal(theme.module.getCurrentTheme(), "light");
  assert.equal(localStorage.getItem("app-theme"), null);
  assert.equal(persistence.isPreferencePersistenceEnabled("theme"), false);
  assert.equal(document.activeElement, reset);
  persistence.setPreferencePersistenceEnabled("theme", true);
  await Promise.resolve();
  assert.equal(control.checked, true);
  api.destroy();
});

test("Main-map Scale hiding Auto-save and Reset remain independent", async () => {
  persistence.setPreferencePersistenceEnabled("displayScaleOverride", true);
  scale.resetDisplayScaleHidingPreference();
  let binds = 0;
  let removes = 0;
  const mapPreferences = {
    ...scale,
    bindDisplayScaleOverrideControl(element) {
      binds++;
      const sync = () => {
        element.checked = !scale.isDisplayScaleHidingDisabled();
      };
      const handle = scale.onDisplayScaleOverrideChange(sync);
      sync();
      return {
        remove() {
          removes++;
          handle.remove();
        },
      };
    },
  };
  const { api, panel, button } = mount({ mapPreferences });
  assert.ok(binds > 0);
  assert.equal(panel.querySelector("#preferences-scale-hiding").checked, false);
  assert.equal(panel.querySelectorAll("#preferences-dark-mode").length, 1);
  scale.setDisplayScaleHidingDisabled(false);
  assert.equal(panel.querySelector("#preferences-scale-hiding").checked, true);
  const autoSave = panel.querySelector('[data-preference-persistence-key="displayScaleOverride"]');
  values.set("unrelated-source-state", "unchanged");
  autoSave.checked = false;
  autoSave.focus();
  panel.dispatchEvent(event("calciteSwitchChange", autoSave));
  await Promise.resolve();
  assert.equal(scale.isDisplayScaleHidingDisabled(), false);
  assert.equal(localStorage.getItem("pc.displayScale.hidingDisabled"), null);
  assert.equal(localStorage.getItem("unrelated-source-state"), "unchanged");
  assert.equal(document.activeElement, autoSave);
  const reset = click(panel, "reset-display-scale");
  assert.equal(scale.isDisplayScaleHidingDisabled(), true);
  assert.equal(localStorage.getItem("pc.displayScale.hidingDisabled"), null);
  assert.equal(persistence.isPreferencePersistenceEnabled("displayScaleOverride"), false);
  assert.equal(document.activeElement, reset);
  const escape = event("keydown", button, { key: "Escape" });
  document.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, false, "Main-map coordinator retains Escape priority");
  api.close();
  assert.equal(document.activeElement, button);
  api.destroy();
  assert.equal(removes, binds);
  persistence.setPreferencePersistenceEnabled("displayScaleOverride", true);
});

test("Dashboard page-size Reset uses its existing owner without rendering saved-value status", () => {
  const { api, panel } = mount({}, "dashboard");
  dashboard.writeDashboardPageSizePreference(100);
  click(panel, "reset-dashboard-page-size");
  assert.equal(dashboard.readDashboardPageSizePreference(), 50);
  assert.equal(panel.querySelector("[data-preference-status]"), null);
  api.destroy();
});

test("Map view Reset restores defaults without changing its Auto-save selection", async () => {
  const { module: mapState } = await loadModule("../../map/state/mapViewpointPersistence.js", {
    'import { watch } from "@arcgis/core/core/reactiveUtils.js";':
      "const watch = () => ({ remove() {} });",
  });
  const view = {
    center: { longitude: 12, latitude: 55 },
    scale: 20000,
    rotation: 10,
    when: async () => {},
    async goTo(next) {
      this.center = { longitude: next.center[0], latitude: next.center[1] };
      this.rotation = next.rotation;
    },
  };
  persistence.setPreferencePersistenceEnabled("mapViewpoint", false);
  await mapState.resetMapViewpoint(view);
  assert.deepEqual(view.center, { longitude: 10.3, latitude: 56 });
  assert.equal(view.rotation, 0);
  assert.equal(persistence.isPreferencePersistenceEnabled("mapViewpoint"), false);
  assert.equal(localStorage.getItem("pc:main-map-viewpoint:v1"), null);
  persistence.setPreferencePersistenceEnabled("mapViewpoint", true);
});

test("click-away closes without stealing the destination focus", () => {
  const { api, panel, button } = mount({}, "review");
  const outside = new TestElement("button");
  outside.focus();
  document.dispatchEvent(event("click", outside));
  assert.equal(panel.hidden, true);
  assert.equal(document.activeElement, outside);
  button.dispatchEvent(event("click", button));
  assert.equal(panel.hidden, false);
  api.destroy();
});

test("workspace bootstrap has no eager Main-map scale or filter service imports", async () => {
  const visited = new Set();
  async function visit(url) {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    assert.doesNotMatch(
      url.pathname,
      /\/app\/(initMap|loadInitialData)\.js$|\/map\/scale\/displayScale(?:Override|Visibility)|\/map\/filters\/attributeFilter(?:Panel|Service)/
    );
    const source = await readFile(url, "utf8");
    for (const [, specifier] of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+\.js)["']/g)) {
      await visit(new URL(specifier, url));
    }
  }
  await visit(new URL("../../../app/bootstrap.js", import.meta.url));
});

for (const routeName of ["analyze", "review", "dashboard"]) {
  test(`${routeName}: bootstrap and opening Preferences never request Main-map startup`, async () => {
    let mainRequests = 0;
    let ready = false;
    let mounted;
    const errors = [];
    const noop = () => {};
    const title = () => "Workspace";
    globalThis.requestAnimationFrame = (callback) => callback();
    globalThis.preferencesBootstrapDependencies = {
      initAnalyzePage: async () => ({ view: null }),
      initReviewPage: async () => ({}),
      initDashboardPage: async () => ({}),
      createAnalyzeDocumentTitle: title,
      createReviewDocumentTitle: title,
      createDashboardDocumentTitle: title,
      noticeError: (...args) => errors.push(args),
      initializeProductJobTracking: noop,
      hideLoader: noop,
      setLoaderProgress: noop,
      setLoaderText: noop,
      showLoader: noop,
      initRefreshControls: noop,
      initUI: async () => {
        mounted = mount({}, routeName);
        return {
          preferencesPanel: mounted.api,
          onboarding: {
            setRouteReady: () => {
              ready = true;
            },
          },
        };
      },
      initializeTheme: theme.module.initializeTheme,
      waitForCalciteComponents: async () => {},
      getCurrentRoute: () => ({ name: routeName, datasetNames: [] }),
    };
    globalThis.requestMainMapForPreferencesTest = () => {
      mainRequests++;
      throw new Error("Main-map startup requested from a workspace route");
    };
    let source = await readFile(new URL("../../../app/bootstrap.js", import.meta.url), "utf8");
    source = source.replace(
      /import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,
      (_, names) => `const {${names}} = globalThis.preferencesBootstrapDependencies;`
    );
    source = source.replace(
      /import\("\.\/(?:initMap|loadInitialData)\.js"\)/g,
      "globalThis.requestMainMapForPreferencesTest()"
    );
    const { bootstrap } = await import(
      `data:text/javascript;base64,${Buffer.from(source + `\n// ${routeName}`).toString("base64")}`
    );
    try {
      await bootstrap();
      assert.equal(ready, true);
      assert.deepEqual(errors, []);
      assert.equal(mainRequests, 0);
      assert.equal(mounted.panel.hidden, false);
      assert.equal(mounted.panel.querySelector("#preferences-scale-hiding"), null);
      assert.equal(mounted.panel.querySelectorAll("#preferences-dark-mode").length, 1);
    } finally {
      mounted?.api.destroy();
      delete globalThis.preferencesBootstrapDependencies;
      delete globalThis.requestMainMapForPreferencesTest;
      delete globalThis.requestAnimationFrame;
    }
  });
}
