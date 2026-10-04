import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { getOnboardingSteps } from "../config/onboardingSteps.js";
import { resolveOnboardingTarget } from "../domain/onboardingInteraction.js";
import { getOnboardingService, initOnboarding } from "../services/onboardingService.js";

// The tour uses application-owned light DOM. Native button activation is modeled
// as click; no Calcite or ArcGIS implementation is loaded by these tests.
class TestElement extends EventTarget {
  constructor(tagName = "div") {
    super();
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
    this.dataset = {};
    this.style = { removeProperty() {} };
    this.className = "";
    this.classList = { add() {}, remove() {} };
    this.bounds = { left: 20, top: 100, right: 220, bottom: 140, width: 200, height: 40 };
  }
  get isConnected() {
    return this === document.body || Boolean(this.parentElement?.isConnected);
  }
  setAttribute(name, value) {
    this.attributes.set(name, value);
    if (name === "class") this.className = value;
    if (name === "id") this.id = value;
    if (name.startsWith("data-")) this.dataset[name.slice(5)] = value;
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  matches(selector) {
    if (selector === "*") return true;
    if (selector.startsWith(".")) return this.className.split(" ").includes(selector.slice(1));
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    const attribute = selector.match(/^\[([^=\]]+)(?:=['"]([^'"]+)['"])?\]$/);
    if (attribute)
      return (
        this.attributes.has(attribute[1]) &&
        (!attribute[2] || this.getAttribute(attribute[1]) === attribute[2])
      );
    return this.tagName === selector;
  }
  closest(selector) {
    return this.matches(selector) ? this : this.parentElement?.closest(selector);
  }
  querySelectorAll(selector) {
    return this.children
      .flatMap((child) => [child, ...child.querySelectorAll("*")])
      .filter((child) => child.matches(selector));
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  set innerHTML(value) {
    this.replaceChildren();
    for (const [, tag, attributes] of value.matchAll(/<([\w-]+)([^>]*)>/g)) {
      const child = new TestElement(tag);
      for (const [, name, content] of attributes.matchAll(/([\w-]+)="([^"]*)"/g))
        child.setAttribute(name, content);
      this.append(child);
    }
  }
  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }
  appendChild(child) {
    this.append(child);
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...children);
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  contains(target) {
    return this === target || this.children.some((child) => child.contains(target));
  }
  focus() {
    document.activeElement = this;
  }
  click() {
    this.clickCount = (this.clickCount ?? 0) + 1;
    const event = new Event("click");
    Object.defineProperty(event, "target", { value: this });
    this.dispatchEvent(event);
  }
  getClientRects() {
    return this.hidden || !this.isConnected ? [] : [this.bounds];
  }
  getBoundingClientRect() {
    return this.bounds;
  }
  scrollIntoView() {
    this.scrolled = true;
  }
}

let originalGlobals;
let intervals;
let frames;
let preferences;
let preferencesPanel;
let nextTimer;
beforeEach(() => {
  originalGlobals = Object.fromEntries(
    ["window", "document", "HTMLElement", "Element"].map((name) => [name, globalThis[name]])
  );
  intervals = new Map();
  frames = new Map();
  nextTimer = 0;
  const documentRef = new EventTarget();
  documentRef.body = new TestElement("body");
  documentRef.createElement = (tag) => new TestElement(tag);
  documentRef.querySelectorAll = (selector) => documentRef.body.querySelectorAll(selector);
  documentRef.querySelector = (selector) => documentRef.body.querySelector(selector);
  documentRef.getElementById = (id) => documentRef.querySelector(`#${id}`);
  const windowRef = new EventTarget();
  Object.assign(windowRef, {
    innerWidth: 1000,
    innerHeight: 800,
    getComputedStyle: () => ({
      visibility: "visible",
      display: "block",
      overflowX: "visible",
      overflowY: "visible",
    }),
    localStorage: {
      getItem: (key) =>
        JSON.stringify({ version: key.includes("main") ? 3 : 2, dismissedWelcome: true }),
      setItem() {},
    },
    setInterval: (callback) => {
      intervals.set(++nextTimer, callback);
      return nextTimer;
    },
    clearInterval: (id) => intervals.delete(id),
    requestAnimationFrame: (callback) => {
      frames.set(++nextTimer, callback);
      return nextTimer;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  Object.assign(globalThis, {
    document: documentRef,
    window: windowRef,
    HTMLElement: TestElement,
    Element: TestElement,
  });
  preferences = addTarget("#preferences-button");
  preferencesPanel = addTarget("#preferences-panel");
  preferencesPanel.hidden = true;
  addTarget(".pc-preferences-panel__group", preferencesPanel);
  bindToggle(preferences, preferencesPanel);
  preferences.focus();
});
afterEach(() => {
  getOnboardingService()?.destroy();
  for (const [name, value] of Object.entries(originalGlobals)) {
    if (value === undefined) delete globalThis[name];
    else globalThis[name] = value;
  }
});

function addTarget(selector, parent = document.body) {
  const element = new TestElement();
  if (selector.startsWith("#")) element.id = selector.slice(1);
  else if (selector.startsWith(".")) element.className = selector.slice(1);
  else element.setAttribute("data-onboarding-target", "product-search");
  parent.append(element);
  return element;
}
function bindToggle(trigger, panel) {
  trigger.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
  });
}
function installMainMapRevealTargets() {
  const dataSourcesButton = addTarget("#data-sources-button");
  const dataSourcesPanel = addTarget(".pc-data-source-panel");
  dataSourcesPanel.hidden = true;
  bindToggle(dataSourcesButton, dataSourcesPanel);

  const filterButton = addTarget("#filter-button");
  const filterPanel = addTarget("#attribute-filter-panel");
  filterPanel.hidden = true;
  bindToggle(filterButton, filterPanel);
  return { dataSourcesButton, dataSourcesPanel, filterButton, filterPanel };
}
function start(route = "main") {
  const service = initOnboarding({ routeName: route });
  service.setRouteReady();
  service.startCurrentRoute();
  return service;
}
function popover() {
  return document.querySelector(".pc-onboarding-popover");
}
function activate(action, root = popover()) {
  const button = root.querySelector(`[data-action='${action}']`);
  assert.ok(button && !button.disabled);
  const event = new Event("click", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "target", { value: button });
  root.dispatchEvent(event);
  if (!event.cancelBubble) {
    const documentEvent = new Event("click", { bubbles: true, cancelable: true });
    Object.defineProperty(documentEvent, "target", { value: button });
    document.dispatchEvent(documentEvent);
  }
  return event;
}
function key(value, target = document, options = {}) {
  const event = new Event("keydown", { cancelable: true });
  Object.assign(event, { key: value, ...options });
  target.dispatchEvent(event);
  return event;
}
function flushRefresh() {
  for (const callback of [...intervals.values()]) callback();
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback();
}

for (const route of ["main", "dashboard", "analyze", "review"]) {
  test(`${route} completes with native controls, initial Next focus and focus return`, () => {
    if (route === "main") installMainMapRevealTargets();
    for (const selector of new Set(getOnboardingSteps(route).flatMap((step) => step.selectors))) {
      if (
        [
          "#preferences-panel",
          ".pc-preferences-panel__group",
          ".pc-data-source-panel",
          "#attribute-filter-panel",
        ].includes(selector)
      )
        continue;
      addTarget(selector);
    }
    start(route);
    const steps = getOnboardingSteps(route);
    for (const step of steps) {
      assert.equal(popover().dataset.stepId, step.id);
      assert.equal(document.activeElement, popover().querySelector("[data-action='next']"));
      assert.equal(document.activeElement.tagName, "button");
      activate("next");
    }
    assert.equal(popover(), null);
    assert.equal(document.activeElement, preferences);
    assert.equal(intervals.size, 0);
  });
}

test("missing targets skip in both directions without losing focus", () => {
  addTarget(".header-center");
  const filterButton = addTarget("#filter-button");
  const filterPanel = addTarget("#attribute-filter-panel");
  filterPanel.hidden = true;
  bindToggle(filterButton, filterPanel);
  start();
  activate("next");
  assert.equal(popover().dataset.stepId, "main-filters");
  activate("back");
  assert.equal(popover().dataset.stepId, "main-navigation");
  assert.equal(document.activeElement.dataset.action, "next");
});

test("Main-map panel steps open through their existing triggers and close when the tour moves on", () => {
  const { dataSourcesPanel, filterPanel } = installMainMapRevealTargets();
  for (const selector of [
    ".header-center",
    "[data-onboarding-target='product-search']",
    "#main-map-locator-button",
    "#viewDiv",
    ".pc-product-collection-tray",
  ])
    addTarget(selector);

  start();
  activate("next");
  activate("next");
  activate("next");
  assert.equal(popover().dataset.stepId, "main-data-sources");
  assert.equal(dataSourcesPanel.hidden, false);

  activate("next");
  assert.equal(popover().dataset.stepId, "main-filters");
  assert.equal(dataSourcesPanel.hidden, true);
  assert.equal(filterPanel.hidden, false);

  activate("next");
  assert.equal(popover().dataset.stepId, "main-map");
  assert.equal(filterPanel.hidden, true);
});

test("Preferences stays open across its two guidance steps and returns to its prior closed state", () => {
  start("dashboard");
  assert.equal(popover().dataset.stepId, "dashboard-preferences");
  assert.equal(preferencesPanel.hidden, false);
  assert.equal(preferences.clickCount, 1);

  activate("next");
  assert.equal(popover().dataset.stepId, "dashboard-saved-preferences");
  assert.equal(preferencesPanel.hidden, false);
  assert.equal(preferences.clickCount, 1);

  activate("next");
  assert.equal(popover(), null);
  assert.equal(preferencesPanel.hidden, true);
  assert.equal(preferences.clickCount, 2);
});

test("a panel that was already open before its step is not closed by onboarding cleanup", () => {
  preferencesPanel.hidden = false;
  start("dashboard");
  assert.equal(popover().dataset.stepId, "dashboard-preferences");
  assert.equal(preferences.clickCount ?? 0, 0);
  key("Escape");
  assert.equal(preferencesPanel.hidden, false);
});

test("tour navigation does not trigger application outside-click dismissal for revealed panels", () => {
  const { dataSourcesButton, dataSourcesPanel, filterButton, filterPanel } =
    installMainMapRevealTargets();
  for (const selector of [
    ".header-center",
    "[data-onboarding-target='product-search']",
    "#main-map-locator-button",
    "#viewDiv",
    ".pc-product-collection-tray",
  ])
    addTarget(selector);

  const panels = [
    { trigger: dataSourcesButton, panel: dataSourcesPanel },
    { trigger: filterButton, panel: filterPanel },
    { trigger: preferences, panel: preferencesPanel },
  ];
  document.addEventListener("click", (event) => {
    for (const { trigger, panel } of panels) {
      if (!panel.hidden && !panel.contains(event.target) && !trigger.contains(event.target)) {
        panel.hidden = true;
      }
    }
  });

  start();
  activate("next");
  activate("next");
  const intoDataSources = activate("next");
  assert.equal(intoDataSources.cancelBubble, true);
  assert.equal(popover().dataset.stepId, "main-data-sources");
  assert.equal(dataSourcesPanel.hidden, false);
  flushRefresh();
  assert.equal(popover().dataset.stepId, "main-data-sources");

  const intoFilters = activate("next");
  assert.equal(intoFilters.cancelBubble, true);
  assert.equal(popover().dataset.stepId, "main-filters");
  assert.equal(filterPanel.hidden, false);
  flushRefresh();
  assert.equal(popover().dataset.stepId, "main-filters");

  activate("next");
  assert.equal(popover().dataset.stepId, "main-map");
  const backToFilters = activate("back");
  assert.equal(backToFilters.cancelBubble, true);
  assert.equal(popover().dataset.stepId, "main-filters");
  assert.equal(filterPanel.hidden, false);
  flushRefresh();
  assert.equal(popover().dataset.stepId, "main-filters");

  activate("back");
  assert.equal(popover().dataset.stepId, "main-data-sources");
  assert.equal(dataSourcesPanel.hidden, false);
  flushRefresh();
  assert.equal(popover().dataset.stepId, "main-data-sources");
});

test("Preferences reveal remains navigable backward while its outside-click owner is active", () => {
  document.addEventListener("click", (event) => {
    if (
      !preferencesPanel.hidden &&
      !preferencesPanel.contains(event.target) &&
      !preferences.contains(event.target)
    ) {
      preferencesPanel.hidden = true;
    }
  });

  start("dashboard");
  assert.equal(popover().dataset.stepId, "dashboard-preferences");
  assert.equal(preferencesPanel.hidden, false);

  activate("next");
  assert.equal(popover().dataset.stepId, "dashboard-saved-preferences");
  assert.equal(preferencesPanel.hidden, false);
  flushRefresh();
  assert.equal(popover().dataset.stepId, "dashboard-saved-preferences");

  const back = activate("back");
  assert.equal(back.cancelBubble, true);
  assert.equal(popover().dataset.stepId, "dashboard-preferences");
  assert.equal(preferencesPanel.hidden, false);
  flushRefresh();
  assert.equal(popover().dataset.stepId, "dashboard-preferences");
});

test("hidden, detached, offscreen and clipped targets fail closed without querying shadow roots", () => {
  const target = addTarget("#filter-button");
  const step = { selectors: ["#filter-button"] };
  Object.defineProperty(target, "shadowRoot", {
    get() {
      throw new Error("Private DOM read");
    },
  });
  assert.equal(resolveOnboardingTarget(step), target);
  target.hidden = true;
  assert.equal(resolveOnboardingTarget(step), null);
  target.hidden = false;
  target.bounds = { left: 1100, right: 1200, top: 100, bottom: 120 };
  assert.equal(resolveOnboardingTarget(step), null);
  target.bounds = { left: 20, right: 220, top: 100, bottom: 140 };
  window.getComputedStyle = () => ({ overflowY: "hidden" });
  document.body.bounds = { left: 0, right: 1000, top: 0, bottom: 50 };
  assert.equal(resolveOnboardingTarget(step), null);
  target.remove();
  assert.equal(resolveOnboardingTarget(step), null);
});

test("removing the current target skips safely during refresh", () => {
  const target = addTarget(".header-center");
  start();
  target.remove();
  flushRefresh();
  assert.equal(popover().dataset.stepId, "main-preferences");
  assert.equal(document.activeElement.dataset.action, "next");
});

test("Escape closes directly and respects an already handled key", () => {
  start();
  const handled = new Event("keydown", { cancelable: true });
  Object.assign(handled, { key: "Escape" });
  handled.preventDefault();
  document.dispatchEvent(handled);
  assert.ok(popover());
  assert.equal(key("Enter").defaultPrevented, false);
  assert.equal(key("Escape").defaultPrevented, true);
  assert.equal(popover(), null);
  assert.equal(document.activeElement, preferences);
  assert.equal(document.querySelector(".pc-onboarding-highlight-layer"), null);
});

test("reopening supersedes detached buttons and scheduled callbacks without duplicate UI", () => {
  const service = start();
  const old = popover();
  window.dispatchEvent(new Event("resize"));
  const staleFrame = [...frames.values()][0];
  const staleInterval = [...intervals.values()][0];
  service.startCurrentRoute();
  staleFrame();
  staleInterval();
  activate("next", old);
  assert.equal(document.querySelectorAll(".pc-onboarding-popover").length, 1);
  assert.equal(popover().dataset.stepId, "main-preferences");
  assert.equal(intervals.size, 1);
  key("Escape");
  assert.equal(document.activeElement, preferences);
});

for (const eventName of ["pagehide", "popstate"]) {
  test(`${eventName} destroys the owner and rejects stale route-ready/start callbacks`, () => {
    const service = start();
    const old = popover();
    window.dispatchEvent(new Event("resize"));
    const stale = [...frames.values()][0];
    window.dispatchEvent(new Event(eventName));
    stale();
    activate("next", old);
    service.setRouteReady();
    assert.equal(service.startCurrentRoute(), false);
    assert.equal(popover(), null);
    assert.equal(getOnboardingService(), null);
    assert.equal(frames.size, 0);
    assert.equal(intervals.size, 0);
    assert.equal(key("Escape").defaultPrevented, false);
  });
}

test("initializing a new route destroys the prior tour", () => {
  const old = start();
  const current = initOnboarding({ routeName: "review" });
  current.setRouteReady();
  current.startCurrentRoute();
  assert.equal(old.startCurrentRoute(), false);
  assert.equal(popover().dataset.stepId, "review-preferences");
});

test("welcome starts with logical focus, contains Tab, and restores the original trigger", () => {
  window.localStorage.getItem = () => null;
  const service = initOnboarding({ routeName: "main" });
  service.setRouteReady();
  const welcome = document.querySelector(".pc-onboarding-welcome__dialog");
  assert.equal(document.activeElement.dataset.action, "start");
  key("Tab", welcome);
  assert.equal(document.activeElement.dataset.action, "dismiss");
  key("Tab", welcome, { shiftKey: true });
  assert.equal(document.activeElement.dataset.action, "start");
  activate("start", welcome);
  key("Escape");
  assert.equal(document.activeElement, preferences);
});

test("a hidden originating control falls back to the Preferences public focus contract", () => {
  const origin = addTarget("#origin");
  origin.focus();
  let focusCalls = 0;
  preferences.setFocus = () => {
    focusCalls += 1;
    preferences.focus();
  };
  start();
  origin.hidden = true;
  key("Escape");
  assert.equal(focusCalls, 1);
  assert.equal(document.activeElement, preferences);
});

test("no available targets finishes without leaving an overlay or polling", () => {
  preferences.hidden = true;
  start();
  assert.equal(popover(), null);
  assert.equal(intervals.size, 0);
});

test("background target removal does not steal focus from an application control", () => {
  const target = addTarget(".header-center");
  const input = addTarget("#active-input");
  start();
  input.focus();
  target.remove();
  flushRefresh();
  assert.equal(popover().dataset.stepId, "main-preferences");
  assert.equal(document.activeElement, input);
});

test("targets obscured by the application header are unavailable", () => {
  const header = addTarget("#header");
  header.bounds = { left: 0, right: 1000, top: 0, bottom: 150 };
  addTarget("#filter-button");
  assert.equal(resolveOnboardingTarget({ selectors: ["#filter-button"] }), null);
});
