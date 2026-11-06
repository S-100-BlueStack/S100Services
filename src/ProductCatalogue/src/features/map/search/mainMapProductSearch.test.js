import assert from "node:assert/strict";
import test from "node:test";
import { initMainMapProductSearch } from "./mainMapProductSearch.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.dataset = {};
    this.hidden = false;
    this.value = "";
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type, values = {}) {
    const event = { preventDefault() {}, stopPropagation() {}, ...values };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  appendChild(node) {
    this.append(node);
  }

  replaceChildren(...nodes) {
    this.children = nodes;
  }

  contains(element) {
    return this === element || this.children.some((child) => child.contains(element));
  }

  querySelectorAll(selector) {
    const className = selector.slice(1);
    return this.children.flatMap((child) => [
      ...(child.className?.split(" ").includes(className) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  focus() {
    document.activeElement = this;
    this.emit("focus");
  }

  blur() {
    if (document.activeElement === this) document.activeElement = null;
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}

function graphic(id) {
  return {
    id,
    geometry: { extent: { center: { id: `${id}-center` } } },
  };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function createHarness({ isGraphicAllowed = null } = {}) {
  const previous = {
    HTMLElement: globalThis.HTMLElement,
    document: globalThis.document,
    window: globalThis.window,
  };
  globalThis.HTMLElement = FakeElement;
  globalThis.document = {
    activeElement: null,
    createElement: (tag) => new FakeElement(tag),
  };
  const frames = [];
  globalThis.window = {
    requestAnimationFrame: (callback) => frames.push(callback),
    setTimeout() {
      return 1;
    },
  };

  const entries = new Map([
    ["A", { id: "A", label: "Product A", graphic: graphic("A") }],
    ["B", { id: "B", label: "Product B", graphic: graphic("B") }],
  ]);
  const listeners = new Set();
  const index = {
    search(query, { limit } = {}) {
      return [...entries.values()]
        .filter((entry) => entry.label.toLowerCase().includes(String(query).toLowerCase()))
        .slice(0, limit)
        .map((entry) => ({ ...entry }));
    },
    resolve(id) {
      const entry = entries.get(id);
      return entry ? { ...entry } : null;
    },
    getEntries() {
      return [...entries.values()];
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    remove(id) {
      entries.delete(id);
      for (const listener of listeners) listener();
    },
    replace(id, nextGraphic) {
      entries.set(id, { ...entries.get(id), graphic: nextGraphic });
      for (const listener of listeners) listener();
    },
    restore(id) {
      entries.set(id, { id, label: `Product ${id}`, graphic: graphic(`${id}-new`) });
      for (const listener of listeners) listener();
    },
  };
  const navigations = [];
  const popups = [];
  const view = {
    goTo(target, options) {
      const operation = deferred();
      navigations.push({ target, options, ...operation });
      return operation.promise;
    },
    openPopup(options) {
      popups.push(options.features[0]);
    },
  };
  const host = new FakeElement("div");
  const filterListeners = new Set();
  const controller = initMainMapProductSearch({
    host,
    view,
    productSearchIndex: index,
    isGraphicAllowed,
    subscribeFilterChanges(listener) {
      filterListeners.add(listener);
      return () => filterListeners.delete(listener);
    },
  });
  const form = host.children[0];
  const [input, results] = form.children;

  return {
    host,
    input,
    results,
    form,
    controller,
    index,
    entries,
    changeFilters() {
      for (const listener of filterListeners) listener();
    },
    frames,
    navigations,
    popups,
    select(id) {
      input.value = "";
      input.focus();
      const option = results
        .querySelectorAll(".main-map-product-search__option")
        .find((item) => item.dataset.searchResultId === id);
      assert.ok(option, `Expected a suggestion for ${id}`);
      option.emit("click");
    },
    async completeNavigation(index) {
      navigations[index].resolve();
      await flush();
    },
    async rejectNavigation(
      index,
      error = Object.assign(new Error("Navigation aborted"), { name: "AbortError" })
    ) {
      navigations[index].reject(error);
      await flush();
    },
    async nextFrame() {
      const callback = frames.shift();
      assert.ok(callback, "Expected a pending animation frame");
      callback();
      await flush();
    },
    cleanup() {
      controller.destroy();
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[name];
        else globalThis[name] = value;
      }
    },
  };
}

test("a later Product selection wins even when its navigation completes first", async () => {
  const h = await createHarness();
  try {
    h.select("A");
    h.select("B");
    await h.completeNavigation(1);
    await h.nextFrame();
    await h.completeNavigation(0);
    assert.deepEqual(
      h.popups.map((entry) => entry.id),
      ["B"]
    );
  } finally {
    h.cleanup();
  }
});

test("a newer selection invalidates the old Product awaiting an animation frame", async () => {
  const h = await createHarness();
  try {
    h.select("A");
    await h.completeNavigation(0);
    h.select("B");
    await h.nextFrame();
    await h.completeNavigation(1);
    await h.nextFrame();
    assert.deepEqual(
      h.popups.map((entry) => entry.id),
      ["B"]
    );
  } finally {
    h.cleanup();
  }
});

test("destroy prevents in-flight navigation or detached suggestion callbacks from opening a popup", async () => {
  const h = await createHarness();
  try {
    h.select("A");
    h.controller.destroy();
    await h.completeNavigation(0);
    assert.equal(h.popups.length, 0);
    assert.equal(h.host.children.length, 0);
  } finally {
    h.cleanup();
  }
});

test("source disable and re-enable cannot revive a pending Product selection", async () => {
  const h = await createHarness();
  try {
    h.select("A");
    h.index.remove("A");
    h.index.restore("A");
    await h.completeNavigation(0);
    assert.equal(h.popups.length, 0);
  } finally {
    h.cleanup();
  }
});

test("a committed Graphic replacement keeps the same Product selection", async () => {
  const h = await createHarness();
  try {
    h.select("A");
    await h.completeNavigation(0);
    const replacement = graphic("A-replaced");
    h.index.replace("A", replacement);
    await h.nextFrame();
    assert.equal(h.navigations[1].options.duration, 0);
    await h.completeNavigation(1);
    assert.deepEqual(h.popups, [replacement]);
  } finally {
    h.cleanup();
  }
});

test("a second Graphic replacement during navigation fails closed", async () => {
  const h = await createHarness();
  try {
    h.select("A");
    await h.completeNavigation(0);
    h.index.replace("A", graphic("A-replaced"));
    await h.nextFrame();
    h.index.replace("A", graphic("A-replaced-again"));
    await h.completeNavigation(1);
    assert.equal(h.popups.length, 0);
  } finally {
    h.cleanup();
  }
});

test("an aborted navigation never opens a Product popup", async () => {
  const h = await createHarness();
  try {
    h.select("A");
    await h.rejectNavigation(0);
    assert.equal(h.popups.length, 0);
  } finally {
    h.cleanup();
  }
});

test("a newer map or Locator interaction cancels only pending navigation, not the query", async () => {
  const h = await createHarness();
  try {
    h.select("A");
    h.controller.cancelPendingSelection();
    assert.equal(h.input.value, "Product A");
    await h.completeNavigation(0);
    assert.equal(h.popups.length, 0);
  } finally {
    h.cleanup();
  }
});

test("input changes and clearSelection retire pending search results", async () => {
  const h = await createHarness();
  try {
    h.select("A");
    h.input.value = "Product B";
    h.input.emit("input");
    await h.completeNavigation(0);
    assert.equal(h.popups.length, 0);
    h.select("B");
    h.controller.clearSelection();
    await h.completeNavigation(1);
    assert.equal(h.popups.length, 0);
    assert.equal(h.input.value, "");
  } finally {
    h.cleanup();
  }
});

test("closing suggestions alone preserves a current accepted Product selection", async () => {
  const h = await createHarness();
  try {
    h.select("A");
    h.controller.close();
    await h.completeNavigation(0);
    await h.nextFrame();
    assert.deepEqual(
      h.popups.map((entry) => entry.id),
      ["A"]
    );
  } finally {
    h.cleanup();
  }
});

test("filtered Products are omitted from suggestions and counted in a separate footer", async () => {
  const h = await createHarness({ isGraphicAllowed: (entry) => entry.id !== "A" });
  try {
    h.input.value = "Product";
    h.input.focus();
    assert.deepEqual(
      h.results
        .querySelectorAll(".main-map-product-search__option")
        .map((item) => item.dataset.searchResultId),
      ["B"]
    );
    const footer = h.results.querySelector(".main-map-product-search__filtered-summary");
    assert.equal(footer.textContent, "1 filtered out");
    assert.equal(footer.hidden, false);
    assert.equal(h.input.value, "Product");
    assert.equal(h.navigations.length, 0);
  } finally {
    h.cleanup();
  }
});

test("an all-filtered query shows a clear empty state and count without selectable results", async () => {
  const h = await createHarness({ isGraphicAllowed: (entry) => entry.id !== "A" });
  try {
    h.input.value = "Product A";
    h.input.focus();
    assert.equal(h.results.querySelectorAll(".main-map-product-search__option").length, 0);
    assert.equal(
      h.results.querySelector(".main-map-product-search__state").textContent,
      "No visible matching products."
    );
    assert.equal(
      h.results.querySelector(".main-map-product-search__filtered-summary").textContent,
      "1 filtered out"
    );
    assert.equal(h.results.querySelector(".main-map-product-search__list").role, "listbox");
  } finally {
    h.cleanup();
  }
});

test("visible-result limit is applied after filtering and footer counts every hidden match", async () => {
  const h = await createHarness({ isGraphicAllowed: (entry) => !entry.id.startsWith("H") });
  try {
    for (let i = 0; i < 12; i += 1) {
      const id = `H${String(i).padStart(2, "0")}`;
      h.entries.set(id, {
        id,
        label: `Product 0${String(i).padStart(2, "0")}`,
        graphic: graphic(id),
      });
    }
    for (let i = 0; i < 12; i += 1) {
      const id = `V${String(i).padStart(2, "0")}`;
      h.entries.set(id, {
        id,
        label: `Product Z${String(i).padStart(2, "0")}`,
        graphic: graphic(id),
      });
    }
    h.input.value = "Product";
    h.input.focus();
    const options = h.results.querySelectorAll(".main-map-product-search__option");
    assert.equal(options.length, 10);
    assert.equal(
      options.every((option) => !option.dataset.searchResultId.startsWith("H")),
      true
    );
    assert.equal(
      h.results.querySelector(".main-map-product-search__filtered-summary").textContent,
      "12 filtered out"
    );
  } finally {
    h.cleanup();
  }
});

test("filter change updates suggestions without clearing newer input", async () => {
  const blocked = new Set(["A"]);
  const h = await createHarness({ isGraphicAllowed: (entry) => !blocked.has(entry.id) });
  try {
    h.input.value = "Product A";
    h.input.focus();
    assert.equal(h.results.querySelectorAll(".main-map-product-search__option").length, 0);
    assert.equal(
      h.results.querySelector(".main-map-product-search__filtered-summary").textContent,
      "1 filtered out"
    );
    blocked.delete("A");
    h.changeFilters();
    assert.equal(
      h.results.querySelector(".main-map-product-search__option").dataset.searchResultId,
      "A"
    );
    assert.equal(
      h.results.querySelector(".main-map-product-search__filtered-summary").hidden,
      true
    );
    assert.equal(h.input.value, "Product A");
  } finally {
    h.cleanup();
  }
});

test("a Product filtered during navigation cannot open a late popup", async () => {
  const blocked = new Set();
  const h = await createHarness({ isGraphicAllowed: (entry) => !blocked.has(entry.id) });
  try {
    h.select("A");
    blocked.add("A");
    h.changeFilters();
    await h.completeNavigation(0);
    assert.equal(h.popups.length, 0);
    assert.equal(h.input.value, "Product A");
  } finally {
    h.cleanup();
  }
});

test("a Product filtered between navigation completion and popup publication is rejected", async () => {
  const blocked = new Set();
  const h = await createHarness({ isGraphicAllowed: (entry) => !blocked.has(entry.id) });
  try {
    h.select("A");
    await h.completeNavigation(0);
    blocked.add("A");
    await h.nextFrame();
    assert.equal(h.popups.length, 0);
  } finally {
    h.cleanup();
  }
});

test("typing an exact filtered Product name cannot submit an empty popup", async () => {
  const h = await createHarness({ isGraphicAllowed: (entry) => entry.id !== "A" });
  try {
    h.input.value = "Product A";
    h.form.emit("submit");
    assert.equal(h.navigations.length, 0);
    assert.equal(h.popups.length, 0);
    assert.equal(h.input.value, "Product A");
    assert.equal(h.input["aria-expanded"], "true");
  } finally {
    h.cleanup();
  }
});
