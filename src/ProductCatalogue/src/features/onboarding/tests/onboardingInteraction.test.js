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
        JSON.stringify({ version: key.includes("main") ? 5 : 3, dismissedWelcome: true }),
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
  addTarget(".pc-preferences-panel__setting--theme", preferencesPanel);
  addTarget(".pc-preferences-panel__setting--scale", preferencesPanel);
  addTarget(".pc-preferences-panel__introduction-action", preferencesPanel);
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
function start(route = "main", { mapView, resolvePopupCollectionButton } = {}) {
  const service = initOnboarding({ routeName: route });
  if (mapView) service.setMapView(mapView, { resolvePopupCollectionButton });
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
    if (route === "analyze") {
      addTarget(".analyze-dataset-list__item");
      addTarget(".analyze-product-card");
    }
    if (route === "review") {
      addTarget(".pc-review-product-list__item");
      addTarget(".pc-review-column");
    }
    const popupContent = addTarget(".popup-container");
    addTarget(".popup-action-bar", popupContent);
    const mapView = {
      popup: {
        visible: true,
        selectedFeature: { attributes: { datasetName: "Example Product" } },
        content: popupContent,
      },
    };
    start(route, { mapView: route === "main" ? mapView : null });
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

test("pagehide destroys the owner and rejects stale route-ready/start callbacks", () => {
  const service = start();
  const old = popover();
  window.dispatchEvent(new Event("resize"));
  const stale = [...frames.values()][0];
  window.dispatchEvent(new Event("pagehide"));
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

for (const route of ["main", "dashboard", "analyze", "review"]) {
  test(`${route} replays the original Preferences callback after repeated Back/Forward`, () => {
    const service = initOnboarding({ routeName: route });
    service.setRouteReady();
    // This is the callback captured once by initUI and kept by Preferences.
    const onStartIntroduction = () => service.startCurrentRoute({ manual: true });

    window.dispatchEvent(new Event("popstate"));
    window.dispatchEvent(new Event("popstate"));
    assert.equal(getOnboardingService(), service);
    assert.equal(popover(), null);
    assert.equal(onStartIntroduction(), true);
    assert.equal(popover().dataset.stepId, `${route}-preferences`);
    assert.equal(document.activeElement.dataset.action, "next");

    window.dispatchEvent(new Event("popstate"));
    assert.equal(popover(), null);
    assert.equal(document.activeElement, preferences);
    assert.equal(intervals.size, 0);
    assert.equal(document.querySelector(".pc-onboarding-highlight-layer"), null);
    assert.equal(onStartIntroduction(), true);
    assert.equal(document.querySelectorAll(".pc-onboarding-popover").length, 1);
    assert.equal(popover().dataset.stepId, `${route}-preferences`);

    key("Escape");
    assert.equal(document.activeElement, preferences);
    assert.equal(onStartIntroduction(), true);
    assert.equal(popover().dataset.stepId, `${route}-preferences`);
  });
}

test("history navigation retires an active tour, reveal, timers and detached callbacks", () => {
  const service = start("dashboard");
  const old = popover();
  const staleInterval = [...intervals.values()][0];
  window.dispatchEvent(new Event("resize"));
  const staleFrame = [...frames.values()][0];
  assert.equal(preferencesPanel.hidden, false);

  window.dispatchEvent(new Event("popstate"));
  assert.equal(getOnboardingService(), service);
  assert.equal(popover(), null);
  assert.equal(document.querySelector(".pc-onboarding-highlight-layer"), null);
  assert.equal(preferencesPanel.hidden, true);
  assert.equal(document.activeElement, preferences);
  assert.equal(intervals.size, 0);
  assert.equal(frames.size, 0);
  assert.equal(key("Escape").defaultPrevented, false);

  staleInterval();
  staleFrame();
  activate("next", old);
  window.dispatchEvent(new Event("popstate"));
  assert.equal(popover(), null);
  assert.equal(preferencesPanel.hidden, true);
  assert.equal(document.activeElement, preferences);
  assert.equal(service.startCurrentRoute(), true);
  assert.equal(popover().dataset.stepId, "dashboard-preferences");
  assert.equal(intervals.size, 1);
});

test("popstate preserves focus in a live application input outside the tour", () => {
  const input = addTarget("#range-input");
  start("dashboard");
  input.focus();
  window.dispatchEvent(new Event("popstate"));
  assert.equal(document.activeElement, input);
  assert.equal(popover(), null);
  assert.equal(preferencesPanel.hidden, true);
});

test("popstate restores focus when a revealed control becomes hidden", () => {
  const input = addTarget("#revealed-control", preferencesPanel);
  start("dashboard");
  assert.equal(preferencesPanel.hidden, false);
  input.focus();
  window.dispatchEvent(new Event("popstate"));
  assert.equal(preferencesPanel.hidden, true);
  assert.equal(document.activeElement, preferences);
  assert.equal(popover(), null);
});

test("history navigation preserves a panel that onboarding did not open", () => {
  preferencesPanel.hidden = false;
  const service = start("dashboard");
  assert.equal(preferences.clickCount ?? 0, 0);
  window.dispatchEvent(new Event("popstate"));
  assert.equal(preferencesPanel.hidden, false);
  assert.equal(popover(), null);
  assert.equal(service.startCurrentRoute(), true);
});

test("history navigation dismisses the first-use welcome without auto-restarting", () => {
  window.localStorage.getItem = () => null;
  const service = initOnboarding({ routeName: "dashboard" });
  service.setRouteReady();
  const old = document.querySelector(".pc-onboarding-welcome__dialog");
  assert.ok(old);
  window.dispatchEvent(new Event("popstate"));
  assert.equal(document.querySelector(".pc-onboarding-welcome"), null);
  assert.equal(document.activeElement, preferences);
  service.setRouteReady();
  window.dispatchEvent(new Event("popstate"));
  assert.equal(document.querySelector(".pc-onboarding-welcome"), null);
  activate("start", old);
  assert.equal(popover(), null);
  assert.equal(service.startCurrentRoute(), true);
  assert.equal(popover().dataset.stepId, "dashboard-preferences");
});

test("explicit destroy after popstate remains idempotent and removes listeners", () => {
  const service = start("review");
  window.dispatchEvent(new Event("popstate"));
  service.destroy();
  service.destroy();
  window.dispatchEvent(new Event("popstate"));
  window.dispatchEvent(new Event("pagehide"));
  service.setRouteReady();
  assert.equal(service.startCurrentRoute(), false);
  assert.equal(popover(), null);
  assert.equal(getOnboardingService(), null);
  assert.equal(intervals.size, 0);
  assert.equal(frames.size, 0);
});

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

test("Main-map guidance waits for a selected Product and returns to the map if its popup closes", () => {
  installMainMapRevealTargets();
  for (const selector of [
    ".header-center",
    "[data-onboarding-target='product-search']",
    "#main-map-locator-button",
    "#viewDiv",
  ])
    addTarget(selector);
  const popupContent = addTarget(".popup-container");
  popupContent.bounds = { left: 600, top: 200, right: 950, bottom: 570, width: 350, height: 370 };
  const actions = addTarget(".popup-action-bar", popupContent);
  actions.bounds = { left: 630, top: 300, right: 910, bottom: 340, width: 280, height: 40 };
  const collectionButton = addTarget(".popup-product-collection-btn", popupContent);
  collectionButton.bounds = { left: 860, top: 208, right: 900, bottom: 248, width: 40, height: 40 };
  const view = {
    popup: {
      visible: false,
      selectedFeature: null,
      content: popupContent,
      container: popupContent,
    },
  };
  start("main", { mapView: view, resolvePopupCollectionButton: () => collectionButton });
  for (let i = 0; i < 5; i++) activate("next");
  assert.equal(popover().dataset.stepId, "main-map");
  assert.equal(popover().querySelector("[data-action='next']").disabled, true);
  assert.match(
    popover().querySelector(".pc-onboarding-popover__requirement").textContent,
    /Open a Product/
  );
  assert.equal(popover().style.left, "12px"); // Keep the map open for selection.

  const mapTarget = document.querySelector("#viewDiv");
  mapTarget.focus();
  view.popup.selectedFeature = { attributes: { datasetName: "Example Product" } };
  view.popup.visible = true;
  flushRefresh();
  assert.equal(popover().dataset.stepId, "main-shortcuts");
  assert.equal(document.activeElement, mapTarget);
  assert.equal(popover().style.left, "388px"); // Beside the popup, not at map top-right.
  activate("back");
  assert.equal(popover().dataset.stepId, "main-map");
  flushRefresh();
  assert.equal(popover().dataset.stepId, "main-map"); // Back must remain usable.
  activate("next");
  assert.equal(popover().dataset.stepId, "main-shortcuts");
  activate("next");
  assert.equal(popover().dataset.stepId, "main-popup-actions");
  assert.equal(document.querySelector(".pc-onboarding-highlight-layer").children.length, 1);
  // Highlight actions precisely while keeping guidance outside the whole popup.
  assert.equal(actions.isConnected, true);
  assert.equal(popover().style.left, "388px");
  activate("next");
  assert.equal(popover().dataset.stepId, "main-product-collection");
  const highlights = document.querySelector(".pc-onboarding-highlight-layer").children;
  assert.equal(highlights.length, 1);
  assert.equal(highlights[0].style.top, "204px");
  assert.equal(highlights[0].style.left, "856px");
  assert.equal(highlights[0].style.width, "48px");
  assert.equal(popover().style.left, "388px");
  // ArcGIS can move the popup after the tour starts. Follow its current bounds.
  popupContent.bounds = { left: 540, top: 240, right: 890, bottom: 610, width: 350, height: 370 };
  collectionButton.bounds = { left: 800, top: 248, right: 840, bottom: 288, width: 40, height: 40 };
  flushRefresh();
  assert.equal(popover().style.left, "328px");
  const movedHighlights = document.querySelector(".pc-onboarding-highlight-layer").children;
  assert.equal(movedHighlights[0].style.top, "244px");
  view.popup.visible = false;
  // A closing popup revokes Next synchronously, even before the next timer tick.
  activate("next");
  assert.equal(popover().dataset.stepId, "main-map");
  flushRefresh();
  assert.equal(popover().dataset.stepId, "main-map");
  assert.equal(popover().querySelector("[data-action='next']").disabled, true);
});

for (const route of ["analyze", "review"]) {
  test(`${route} introduction requires a selected Product and loaded content`, () => {
    addTarget(".header-center");
    const picker = addTarget(
      route === "analyze" ? ".analyze-dataset-form" : ".pc-review-product-form"
    );
    addTarget(route === "analyze" ? ".analyze-dataset-list" : ".pc-review-workspace-content");
    addTarget(route === "analyze" ? ".analyze-products" : ".pc-review-product-list");
    if (route === "review") {
      addTarget(".pc-review-product-list__refresh-button");
      addTarget(".pc-review-board");
    }
    if (route === "analyze") addTarget(".analyze-workspace-refresh");
    start(route);
    activate("next");
    assert.equal(popover().dataset.stepId, `${route}-product-picker`);
    assert.equal(popover().querySelector("[data-action='next']").disabled, true);
    assert.equal(picker.isConnected, true);
    picker.focus();
    addTarget(
      route === "analyze" ? ".analyze-dataset-list__item" : ".pc-review-product-list__item"
    );
    flushRefresh();
    assert.equal(
      popover().dataset.stepId,
      route === "analyze" ? "analyze-product-list" : "review-workspace-content"
    );
    assert.equal(document.activeElement, picker); // The user's selection must not lose focus.
    if (route === "analyze") {
      assert.equal(popover().querySelector("[data-action='next']").disabled, true);
      addTarget(".analyze-product-card");
      flushRefresh();
      assert.equal(popover().querySelector("[data-action='next']").disabled, false);
    } else {
      activate("next");
      assert.equal(popover().dataset.stepId, "review-product-list");
      activate("next");
      assert.equal(popover().dataset.stepId, "review-refresh");
      assert.equal(popover().querySelector("[data-action='next']").disabled, true);
      addTarget(".pc-review-column");
      flushRefresh();
      assert.equal(popover().querySelector("[data-action='next']").disabled, false);
    }
  });
}

test("Main-map collection guidance never outlines the entire popup when its button is unavailable", () => {
  installMainMapRevealTargets();
  for (const selector of [
    ".header-center",
    "[data-onboarding-target='product-search']",
    "#main-map-locator-button",
    "#viewDiv",
  ])
    addTarget(selector);
  const content = addTarget(".popup-container");
  addTarget(".popup-action-bar", content);
  const view = {
    popup: {
      visible: true,
      selectedFeature: { attributes: { datasetName: "A" } },
      content,
      container: content,
    },
  };
  start("main", { mapView: view });
  for (let i = 0; i < 8; i++) activate("next");
  assert.equal(popover().dataset.stepId, "main-product-collection");
  assert.equal(document.querySelector(".pc-onboarding-highlight-layer").children.length, 0);
  const collectionButton = addTarget(".popup-product-collection-btn", content);
  getOnboardingService().setMapView(view, { resolvePopupCollectionButton: () => collectionButton });
  flushRefresh();
  assert.equal(document.querySelector(".pc-onboarding-highlight-layer").children.length, 1);
  collectionButton.remove();
  flushRefresh();
  assert.equal(document.querySelector(".pc-onboarding-highlight-layer").children.length, 0);
});

test("Preferences guidance positions outside the panel while highlighting individual settings", () => {
  preferencesPanel.bounds = {
    left: 700,
    top: 130,
    right: 980,
    bottom: 700,
    width: 280,
    height: 570,
  };
  const theme = preferencesPanel.querySelector(".pc-preferences-panel__setting--theme");
  const scale = preferencesPanel.querySelector(".pc-preferences-panel__setting--scale");
  theme.bounds = { left: 720, top: 180, right: 960, bottom: 220, width: 240, height: 40 };
  scale.bounds = { left: 720, top: 240, right: 960, bottom: 280, width: 240, height: 40 };
  start("main");
  assert.equal(popover().dataset.stepId, "main-preferences");
  assert.equal(popover().style.left, "488px");
  const highlights = document.querySelector(".pc-onboarding-highlight-layer").children;
  assert.equal(highlights.length, 2);
  assert.equal(highlights[0].style.top, "176px");
  assert.equal(highlights[1].style.top, "236px");
});

test("Main-map preselected Products do not skip guidance on refresh", () => {
  installMainMapRevealTargets();
  for (const selector of [
    ".header-center",
    "[data-onboarding-target='product-search']",
    "#main-map-locator-button",
    "#viewDiv",
  ])
    addTarget(selector);
  const content = addTarget(".popup-container");
  const view = {
    popup: {
      visible: true,
      selectedFeature: { attributes: { datasetName: "A" } },
      content,
      container: content,
    },
  };
  start("main", { mapView: view });
  for (let i = 0; i < 5; i++) activate("next");
  assert.equal(popover().dataset.stepId, "main-map");
  flushRefresh();
  assert.equal(popover().dataset.stepId, "main-map");
  activate("next");
  assert.equal(popover().dataset.stepId, "main-shortcuts");
});
