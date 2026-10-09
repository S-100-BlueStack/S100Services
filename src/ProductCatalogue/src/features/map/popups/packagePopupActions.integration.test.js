import assert from "node:assert/strict";
import test from "node:test";
import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { createPopup } from "./createPopup.js";
import { refreshOpenProductPopup } from "./popupRefreshBridge.js";
import { loadStatuses } from "../../data/stores/statusStore.js";
import { createPackagePopupPresentation } from "./packagePopupPresentation.js";
import { resolveProductContext } from "../../products/domain/productContext.js";
import { createActionButton, updateActionButton, disposeActionButton } from "./popupActionDom.js";

// A public DOM test double: no Calcite/ArcGIS internals or browser behavior is emulated.
function createHarness() {
  class Target {
    listeners = new Map();
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(listener);
    }
    removeEventListener(type, listener) {
      this.listeners.get(type)?.delete(listener);
    }
    emit(type, values = {}) {
      const event = { target: this, preventDefault() {}, stopPropagation() {}, ...values };
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
  }
  const doc = new Target();
  class Element extends Target {
    children = [];
    attributes = new Map();
    dataset = {};
    className = "";
    textContent = "";
    style = { setProperty() {} };
    replacements = 0;
    constructor(tag) {
      super();
      this.tagName = tag;
    }
    get classList() {
      return {
        contains: (name) => this.className.split(/\s+/).includes(name),
        add: (name) => {
          if (!this.classList.contains(name)) this.className += ` ${name}`;
        },
        remove: (name) => {
          this.className = this.className
            .split(/\s+/)
            .filter((item) => item !== name)
            .join(" ");
        },
        toggle: (name, enabled) => {
          this.classList[enabled ? "add" : "remove"](name);
        },
      };
    }
    get parentElement() {
      return this.parent;
    }
    get isConnected() {
      return this === doc.body || Boolean(this.parent?.isConnected);
    }
    get childElementCount() {
      return this.children.length;
    }
    get lastElementChild() {
      return this.children.at(-1);
    }
    get offsetWidth() {
      return 200;
    }
    get offsetHeight() {
      return 100;
    }
    appendChild(child) {
      this.insertBefore(child, null);
      return child;
    }
    append(...children) {
      children.forEach((child) => this.appendChild(child));
    }
    insertBefore(child, before) {
      child.remove();
      const index = before ? this.children.indexOf(before) : this.children.length;
      this.children.splice(index, 0, child);
      child.parent = this;
    }
    remove() {
      if (this.parent)
        this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }
    replaceChildren(...children) {
      this.replacements++;
      for (const child of [...this.children]) child.remove();
      this.append(...children);
    }
    contains(element) {
      return this === element || this.children.some((child) => child.contains(element));
    }
    setAttribute(key, value) {
      this.attributes.set(key, String(value));
    }
    getAttribute(key) {
      return this.attributes.get(key) ?? null;
    }
    hasAttribute(key) {
      return this.attributes.has(key);
    }
    removeAttribute(key) {
      this.attributes.delete(key);
    }
    toggleAttribute(key, enabled) {
      if (enabled) this.setAttribute(key, "");
      else this.removeAttribute(key);
    }
    querySelectorAll(selector) {
      const matches = (element) =>
        selector.startsWith(".")
          ? element.classList.contains(selector.slice(1))
          : selector === '[aria-expanded="true"]'
            ? element.getAttribute("aria-expanded") === "true"
            : selector === "[data-dropdown-action-id]" && Boolean(element.dataset.dropdownActionId);
      return this.children.flatMap((child) => [
        ...(matches(child) ? [child] : []),
        ...child.querySelectorAll(selector),
      ]);
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    }
    closest(selector) {
      if (selector.startsWith(".") && this.classList.contains(selector.slice(1))) return this;
      return this.parent?.closest(selector) ?? null;
    }
    getBoundingClientRect() {
      return { left: 20, top: 250, bottom: 282, width: 80 };
    }
    focus() {
      doc.activeElement = this;
      this.emit("focus");
    }
    blur() {
      if (doc.activeElement === this) doc.activeElement = doc.body;
    }
    click() {
      this.emit("click", { detail: 1 });
    }
  }
  doc.body = new Element("body");
  doc.createElement = (tag) => new Element(tag);
  doc.querySelectorAll = (selector) => doc.body.querySelectorAll(selector);
  doc.getElementById = (id) => {
    const find = (element) =>
      element.id === id ? element : element.children.map(find).find(Boolean);
    return find(doc.body);
  };
  const win = new Target();
  Object.assign(win, { innerWidth: 640, innerHeight: 600, setTimeout, clearTimeout });
  const observers = [];
  const frames = [];
  const intervals = new Map();
  const requests = [];
  let nextInterval = 0;
  let revision = "a";
  let detail = async () => ({
    name: "PRIMARY",
    s101: { name: "PRIMARY", edition: 1, update: 0 },
    s57: { name: "SECONDARY", edition: 4, update: 0 },
  });
  const json = (value) =>
    new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
  const globals = {
    document: doc,
    window: win,
    HTMLElement: Element,
    Node: Element,
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {
        observers.push(this);
      }
      disconnect() {
        this.closed = true;
      }
    },
    requestAnimationFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
    setInterval: (callback, ms) => {
      const id = ++nextInterval;
      intervals.set(id, { callback, ms });
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
    fetch: async (url, options = {}) => {
      requests.push({ url, method: options.method ?? "GET" });
      if (url === "/lookup/productstates")
        return json([
          { Id: 11, Name: "Ready" },
          { Id: 15, Name: "Error" },
        ]);
      if (url.startsWith("/electronicproducts/workspace/freshness?")) {
        return json([{ datasetName: "PRIMARY", available: true, revision }]);
      }
      assert.equal(
        url,
        "/electronicproducts/PRIMARY",
        "No old Product or invented package endpoint may be requested"
      );
      assert.equal(options.method, "GET");
      return json(await detail());
    },
  };
  const originals = new Map(
    Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
  );
  Object.assign(globalThis, globals);
  const source = createDataSourceRegistry().byId.get("s101");
  const graphic = {
    attributes: {
      sourceId: source.id,
      productKey: "PRIMARY",
      productIdentityKey: JSON.stringify([source.id, "PRIMARY"]),
      productType: source.productType,
      datasetName: "PRIMARY",
      workUnitMetadata: {
        members: {
          s101: { datasetName: "PRIMARY", edition: 1, update: 0 },
          s57: { datasetName: "SECONDARY", edition: 4, update: 0 },
        },
      },
      workUnitStatus: {
        workflowStatus: 11,
        members: [
          { key: "s101", status: 11 },
          { key: "s57", status: 15 },
        ],
      },
    },
    layer: {
      appSourceDefinition: source,
      appSourceId: source.id,
      appProductType: source.productType,
      customId: source.layerDefinitions[0].id,
    },
  };
  graphic.layer.graphics = [graphic];
  let popup;
  const notify = () => {
    for (const observer of observers) if (!observer.closed) observer.callback();
  };
  const settle = async () => {
    for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve));
  };
  return {
    doc,
    graphic,
    requests,
    intervals,
    settle,
    open() {
      popup = createPopup().content({ graphic });
      doc.body.appendChild(popup);
      notify();
      return popup;
    },
    close() {
      popup?.remove();
      notify();
    },
    frames() {
      for (const callback of frames.splice(0)) callback();
    },
    revision(value) {
      revision = value;
    },
    detail(callback) {
      detail = callback;
    },
    destroy() {
      popup?.remove();
      notify();
      for (const action of doc.body.querySelectorAll(".popup-action-bar__action")) {
        disposeActionButton(action);
      }
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}

test("actual popup keeps table, error overlay, selection owner, focus and Tools dropdown during summary refresh", async () => {
  const h = createHarness();
  try {
    await loadStatuses();
    const popup = h.open();
    await h.settle();
    assert.equal(h.intervals.size, 1);
    assert.equal([...h.intervals.values()][0].ms, 30_000);
    const tableSection = popup.querySelector(".popup-section");
    const table = tableSection.children[0];
    const summary = popup.querySelector(".popup-package-workflow");
    assert.equal(popup.children.indexOf(summary) > popup.children.indexOf(tableSection), true);
    assert.equal(summary.children[0].textContent, "Package workflow: Ready");
    const actionBar = popup.querySelector(".popup-action-bar");
    const controls = actionBar.querySelectorAll(".popup-action-bar__action");
    const tools = controls.find((control) => control.dataset.popupActionId === "tools");
    assert.equal(actionBar.querySelector(".popup-action-bar__explanation"), null);
    assert.equal(actionBar.querySelectorAll(".popup-action-bar__row").length, 1);
    assert.equal(controls.length, 4);
    assert.deepEqual(
      controls.map((control) => control.dataset.popupActionId),
      ["package-pause-resume", "package-discard-export", "package-send-accept", "tools"]
    );
    assert.equal(tools.scale, "m");
    assert.equal(tools.getAttribute("title"), "Tools");
    const count = h.requests.length;
    for (const action of controls.filter((control) => control !== tools)) {
      assert.equal(action.tagName, "button");
      assert.equal(action.disabled, false);
      assert.equal(action.tabIndex, 0);
      assert.equal(action.getAttribute("aria-disabled"), "true");
      assert.equal(action.children.length, 1);
      assert.equal(action.children[0].tagName, "calcite-icon");
      assert.equal(action.children[0].scale, "m");
      assert.equal(action.hasAttribute("title"), false);
      assert.equal(action.children[0].hasAttribute("title"), false);
      action.emit("pointerenter");
      const hoverHelp = h.doc.body.querySelector(".popup-package-action-help");
      assert.match(hoverHelp.textContent, /not yet connected/);
      assert.equal(hoverHelp.textContent.startsWith(action.getAttribute("aria-label")), true);
      action.emit("pointerleave");
      assert.equal(h.doc.body.querySelector(".popup-package-action-help"), null);
      action.focus();
      const keyboardHelp = h.doc.body.querySelector(".popup-package-action-help");
      assert.equal(keyboardHelp.textContent, hoverHelp.textContent);
      assert.equal(action.getAttribute("aria-describedby"), keyboardHelp.id);
      h.doc.emit("keydown", { key: "Escape" });
      assert.equal(h.doc.body.querySelector(".popup-package-action-help"), null);
      assert.equal(h.doc.activeElement, action);
      action.emit("blur");
      action.click();
      action.emit("keydown", { key: "Enter" });
      action.emit("keydown", { key: " " });
      assert.equal(action.dataset.busy, "false");
    }
    assert.equal(h.requests.length, count);

    // Install a real error trigger through normalized member candidate metadata.
    h.graphic.attributes.exportMetadata = {
      byStandard: { S57: { datasetName: "SECONDARY", errorMessage: "Complete failure detail" } },
    };
    await refreshOpenProductPopup("PRIMARY");
    const error = tableSection.querySelector(".popup-product-error");
    error.click();
    const overlay = h.doc.body.querySelector(".popup-error-details");
    const retainedTable = tableSection.children[0];
    h.doc.selectionOwner = retainedTable;
    const replacements = tableSection.replacements;
    h.graphic.attributes.workUnitStatus = {
      ...h.graphic.attributes.workUnitStatus,
      workflowStatus: 15,
    };
    await refreshOpenProductPopup("PRIMARY");
    assert.equal(summary.children[0].textContent, "Package workflow: Error");
    assert.equal(tableSection.children[0], retainedTable);
    assert.equal(tableSection.replacements, replacements);
    assert.equal(h.doc.selectionOwner, retainedTable);
    assert.equal(h.doc.body.querySelector(".popup-error-details"), overlay);
    assert.equal(h.doc.activeElement, overlay);
    assert.notEqual(table, retainedTable);
    assert.equal(h.requests.length, count);

    tools.emit("keydown", { key: "ArrowDown" });
    h.frames();
    await h.settle();
    const dropdown = h.doc.body.querySelector(".popup-action-dropdown");
    const focused = h.doc.activeElement;
    assert.ok(dropdown);
    await refreshOpenProductPopup("PRIMARY");
    assert.equal(h.doc.body.querySelector(".popup-action-dropdown"), dropdown);
    assert.equal(h.doc.activeElement, focused);
    assert.deepEqual(actionBar.querySelectorAll(".popup-action-bar__action"), controls);
    h.doc.emit("keydown", { key: "Escape", target: focused });
    assert.equal(h.doc.body.querySelector(".popup-action-dropdown"), null);
    await h.settle();
    assert.equal(h.doc.activeElement, tools);
  } finally {
    h.destroy();
  }
});

test("actual popup rejects stale detail after source publication and after close", async () => {
  const h = createHarness();
  try {
    await loadStatuses();
    const popup = h.open();
    await h.settle();
    let finish;
    h.revision("b");
    h.detail(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    [...h.intervals.values()][0].callback();
    await h.settle();
    assert.equal(typeof finish, "function");
    h.graphic.attributes.workUnitStatus.workflowStatus = 15;
    h.graphic.attributes.workUnitMetadata.members.s101.edition = 7;
    await refreshOpenProductPopup("PRIMARY");
    const table = popup.querySelector(".popup-section").children[0];
    const summary = popup.querySelector(".popup-package-workflow");
    finish({
      name: "PRIMARY",
      s101: { name: "PRIMARY", edition: 2 },
      s57: { name: "SECONDARY", edition: 2 },
    });
    await h.settle();
    assert.equal(h.graphic.attributes.workUnitMetadata.members.s101.edition, 7);
    assert.equal(popup.querySelector(".popup-section").children[0], table);
    assert.equal(summary.children[0].textContent, "Package workflow: Error");
    [...h.intervals.values()][0].callback();
    await h.settle();
    const captured = finish;
    h.close();
    assert.equal(h.intervals.size, 0);
    captured({ name: "PRIMARY", s101: { name: "PRIMARY", edition: 99 } });
    await h.settle();
    assert.equal(h.graphic.attributes.workUnitMetadata.members.s101.edition, 7);
    assert.deepEqual(await refreshOpenProductPopup("PRIMARY"), { matched: 0, refreshed: 0 });
    assert.equal(popup.querySelector(".popup-action-bar"), null);
  } finally {
    h.destroy();
  }
});

for (const [name, invalidate] of [
  [
    "source replacement",
    (graphic) => {
      graphic.layer.appSourceDefinition = { ...graphic.layer.appSourceDefinition };
    },
  ],
  [
    "source disable",
    (graphic) => {
      graphic.layer.visible = false;
    },
  ],
  [
    "Graphic removal",
    (graphic) => {
      graphic.layer.graphics = [];
    },
  ],
  [
    "selection identity switch",
    (graphic) => {
      graphic.attributes.productKey = "OTHER";
    },
  ],
  [
    "contradictory member",
    (graphic) => {
      graphic.attributes.workUnitMetadata.members.s57.datasetName = "PRIMARY";
    },
  ],
]) {
  test(`actual popup invalidates presentation and freshness after ${name}`, async () => {
    const h = createHarness();
    try {
      const popup = h.open();
      await h.settle();
      const requestCount = h.requests.length;
      const packageAction = popup.querySelectorAll(".popup-action-bar__action")[0];
      packageAction.focus();
      assert.ok(h.doc.body.querySelector(".popup-package-action-help"));
      const tools = popup
        .querySelectorAll(".popup-action-bar__action")
        .find((action) => action.dataset.popupActionId === "tools");
      invalidate(h.graphic);
      tools.click();
      assert.equal(h.doc.body.querySelector(".popup-action-dropdown"), null);
      await refreshOpenProductPopup("PRIMARY");
      assert.equal(popup.childElementCount, 0);
      assert.equal(h.doc.body.querySelector(".popup-package-action-help"), null);
      packageAction.emit("pointerenter");
      packageAction.click();
      assert.equal(h.doc.body.querySelector(".popup-package-action-help"), null);
      tools.click();
      assert.equal(h.doc.body.querySelector(".popup-action-dropdown"), null);
      assert.equal(h.intervals.size, 0);
      assert.deepEqual(await refreshOpenProductPopup("PRIMARY"), { matched: 0, refreshed: 0 });
      assert.equal(h.requests.length, requestCount);
    } finally {
      h.destroy();
    }
  });
}

test("future Pause/Resume fixture updates the same host without a callback, loading or focus transfer", () => {
  const h = createHarness();
  try {
    const context = resolveProductContext({ graphic: h.graphic });
    const model = (paused) =>
      createPackagePopupPresentation({
        productContext: context,
        attributes: h.graphic.attributes,
        workflowPresentation: {
          verified: true,
          identityKey: context.identityKey,
          paused,
          primaryAction: "send",
        },
      });
    const action = createActionButton(model(false).actions[0]);
    h.doc.body.appendChild(action);
    action.focus();
    const help = h.doc.body.querySelector(".popup-package-action-help");
    assert.match(help.textContent, /^Pause\./);
    action.setAttribute("title", "Obsolete Pause tooltip");
    assert.equal(updateActionButton(action, model(true).actions[0]), true);
    assert.equal(action.getAttribute("aria-label"), "Resume");
    assert.equal(action.children[0].icon, "play");
    assert.equal(action.children[0].scale, "m");
    assert.equal(action.hasAttribute("title"), false);
    assert.equal(h.doc.body.querySelector(".popup-package-action-help"), help);
    assert.match(help.textContent, /^Resume\./);
    assert.equal(h.doc.body.querySelectorAll(".popup-package-action-help").length, 1);
    assert.equal(action.dataset.popupActionId, "package-pause-resume");
    assert.equal(h.doc.activeElement, action);
    assert.equal(updateActionButton(action, model(true).actions[0]), false);
    action.click();
    assert.equal(action.dataset.busy, "false");
    assert.equal(h.requests.length, 0);
  } finally {
    h.destroy();
  }
});

test("shared Send/Accept updates accessible name, icon and help without replacing the focused control", async () => {
  const h = createHarness();
  try {
    const context = resolveProductContext({ graphic: h.graphic });
    const model = (primaryAction) =>
      createPackagePopupPresentation({
        productContext: context,
        attributes: h.graphic.attributes,
        workflowPresentation: {
          verified: true,
          identityKey: context.identityKey,
          paused: false,
          primaryAction,
        },
      });
    const button = createActionButton(model("send").actions[2]);
    h.doc.body.appendChild(button);
    button.focus();
    button.classList.add("is-visible-focused");
    const help = h.doc.body.querySelector(".popup-package-action-help");
    assert.ok(help);
    assert.equal(updateActionButton(button, model("accept").actions[2]), true);
    assert.equal(button.dataset.popupActionId, "package-send-accept");
    assert.equal(button.getAttribute("aria-label"), "Accept");
    assert.equal(button.children[0].icon, "check");
    assert.equal(button.hasAttribute("title"), false);
    assert.equal(button.children[0].scale, "m");
    assert.equal(button.classList.contains("is-visible-focused"), true);
    assert.equal(h.doc.activeElement, button);
    assert.equal(h.doc.body.querySelector(".popup-package-action-help"), help);
    assert.match(help.textContent, /^Accept\./);
    assert.match(help.textContent, /does not approve a failed product/);
    assert.equal(h.doc.body.querySelectorAll(".popup-package-action-help").length, 1);
    assert.equal(updateActionButton(button, model("accept").actions[2]), false);
    for (let i = 0; i < 3; i++) {
      button.click();
      button.emit("keydown", { key: "Enter" });
      button.emit("keydown", { key: " " });
    }
    assert.equal(h.requests.length, 0);
    // A forged config cannot install a handler in the dedicated unavailable renderer.
    updateActionButton(button, {
      ...model("send").actions[2],
      disabled: false,
      onClick: () => assert.fail("Mutation callback"),
    });
    button.click();
    assert.equal(button.getAttribute("aria-disabled"), "true");
    assert.equal(button.dataset.busy, "false");
    h.doc.emit("keydown", { key: "Escape" });
    assert.equal(h.doc.body.querySelector(".popup-package-action-help"), null);
    assert.equal(h.doc.activeElement, button);
    assert.equal(h.requests.length, 0);
  } finally {
    h.destroy();
  }
});

test("actual popup preserves focused package icon and its tooltip during refresh, then cleans help on close", async () => {
  const h = createHarness();
  try {
    const popup = h.open();
    await h.settle();
    const button = popup.querySelectorAll(".popup-action-bar__action")[2];
    button.focus();
    const help = h.doc.body.querySelector(".popup-package-action-help");
    const requests = h.requests.length;
    for (const action of popup.querySelectorAll(".popup-action-bar__action").slice(0, 3)) {
      action.setAttribute("title", "Obsolete tooltip before popup refresh");
    }
    await refreshOpenProductPopup("PRIMARY");
    await refreshOpenProductPopup("PRIMARY");
    assert.equal(popup.querySelectorAll(".popup-action-bar__action")[2], button);
    assert.equal(h.doc.activeElement, button);
    assert.equal(h.doc.body.querySelector(".popup-package-action-help"), help);
    assert.equal(h.doc.body.querySelectorAll(".popup-package-action-help").length, 1);
    assert.equal(popup.querySelectorAll(".popup-action-bar__action").length, 4);
    for (const action of popup.querySelectorAll(".popup-action-bar__action").slice(0, 3)) {
      assert.equal(action.hasAttribute("title"), false);
      assert.equal(action.children[0].scale, "m");
    }
    assert.equal(h.requests.length, requests);
    h.close();
    assert.equal(h.doc.body.querySelector(".popup-package-action-help"), null);
    button.emit("pointerenter");
    button.click();
    assert.equal(h.doc.body.querySelector(".popup-package-action-help"), null);
    assert.equal(h.intervals.size, 0);
    assert.equal(h.requests.length, requests);
  } finally {
    h.destroy();
  }
});

test("package help can be hovered and Escape removes its transient listeners without moving focus", async () => {
  const h = createHarness();
  try {
    const popup = h.open();
    await h.settle();
    const button = popup.querySelectorAll(".popup-action-bar__action")[0];
    button.emit("pointerenter");
    const help = h.doc.body.querySelector(".popup-package-action-help");
    button.emit("pointerleave", { relatedTarget: help });
    help.emit("pointerenter");
    assert.equal(h.doc.body.querySelector(".popup-package-action-help"), help);
    help.emit("pointerleave", { relatedTarget: h.doc.body });
    assert.equal(h.doc.body.querySelector(".popup-package-action-help"), null);
    button.focus();
    assert.equal(h.doc.listeners.get("scroll")?.size, 1);
    h.doc.emit("keydown", { key: "Escape" });
    assert.equal(h.doc.listeners.get("scroll")?.size, 0);
    assert.equal(h.doc.activeElement, button);
    button.emit("blur");
    button.focus();
    h.close();
    assert.equal(h.doc.listeners.get("scroll")?.size, 0);
    assert.equal(h.doc.body.querySelector(".popup-package-action-help"), null);
  } finally {
    h.destroy();
  }
});

test("package sizing uses compact square surfaces and a non-wrapping row with local narrow-width overflow", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("../../../styles/popup.css", import.meta.url), "utf8");
  const row = css.match(/\.popup-action-bar--package \.popup-action-bar__row\s*\{([^}]+)\}/)?.[1];
  assert.ok(row);
  assert.match(row, /flex-wrap:\s*nowrap/);
  assert.match(row, /overflow-x:\s*auto/);
  assert.doesNotMatch(row, /flex-wrap:\s*wrap\s*;/);
  assert.match(row, /min-height:\s*40px\s*;/);
  const surface = css.match(
    /\.popup-action-bar--package \.popup-action-bar__action--package\s*\{([^}]+)\}/
  )?.[1];
  assert.ok(surface);
  assert.match(surface, /flex:\s*0 0 40px\s*;/);
  assert.match(surface, /\bwidth:\s*40px\s*;/);
  assert.match(surface, /\bheight:\s*40px\s*;/);
  assert.match(surface, /min-height:\s*40px\s*;/);
  assert.match(surface, /padding:\s*0\s*;/);
  assert.match(
    css,
    /\.popup-action-bar__action\[data-popup-action-id="tools"\]\s*\{\s*margin-inline-start:\s*auto\s*;/
  );
});

test("package controls remove obsolete native titles during unchanged and forced reconciliation without duplicating help", () => {
  const h = createHarness();
  try {
    const context = resolveProductContext({ graphic: h.graphic });
    const configs = createPackagePopupPresentation({
      productContext: context,
      attributes: h.graphic.attributes,
    }).actions;
    for (const config of configs) {
      const button = createActionButton(config);
      h.doc.body.appendChild(button);
      assert.equal(button.hasAttribute("title"), false);
      button.emit("pointerenter");
      button.focus();
      const help = h.doc.body.querySelector(".popup-package-action-help");
      assert.match(help.textContent, /not yet connected/);
      assert.equal(help.textContent.startsWith(config.label), true);
      for (const force of [false, false, true]) {
        button.setAttribute("title", "Obsolete native tooltip");
        assert.equal(updateActionButton(button, config, { force }), true);
        assert.equal(button.hasAttribute("title"), false);
        assert.equal(h.doc.activeElement, button);
        assert.equal(h.doc.body.querySelector(".popup-package-action-help"), help);
        button.emit("pointerenter");
        button.emit("focus");
        assert.equal(h.doc.body.querySelectorAll(".popup-package-action-help").length, 1);
      }
      assert.equal(updateActionButton(button, config), false);
      h.doc.emit("keydown", { key: "Escape" });
      assert.equal(h.doc.body.querySelectorAll(".popup-package-action-help").length, 0);
      assert.equal(h.doc.activeElement, button);
      button.emit("blur");
      button.emit("pointerleave");
      disposeActionButton(button);
      button.emit("pointerenter");
      button.click();
      assert.equal(h.doc.body.querySelectorAll(".popup-package-action-help").length, 0);
    }
    assert.equal(h.requests.length, 0);
  } finally {
    h.destroy();
  }
});

test("ordinary Product controls retain their Calcite sizing and native help when package help is changed", () => {
  const h = createHarness();
  try {
    const config = {
      id: "freeze-feature",
      label: "Freeze",
      icon: "lock",
      disabled: true,
      disabledReason: "Product operation unavailable.",
    };
    const action = createActionButton(config);
    h.doc.body.appendChild(action);
    assert.equal(action.tagName, "calcite-action");
    assert.equal(action.scale, "m");
    assert.equal(action.disabled, true);
    assert.equal(action.getAttribute("title"), config.disabledReason);
    assert.equal(
      updateActionButton(action, { ...config, disabledReason: "Updated Product explanation." }),
      true
    );
    assert.equal(action.getAttribute("title"), "Updated Product explanation.");
    action.click();
    assert.equal(h.requests.length, 0);
    assert.equal(h.doc.body.querySelectorAll(".popup-package-action-help").length, 0);
  } finally {
    h.destroy();
  }
});
