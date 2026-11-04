import test from "node:test";
import assert from "node:assert/strict";
import { createAssignmentPage } from "./createAssignmentPage.js";
import { REQUIRED_ASSIGNMENT_PAGE_TARGETS } from "./assignmentPageContract.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function fakeDom() {
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  const oldOption = globalThis.Option;
  let root;
  const targets = new Map();

  class Node {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.children = [];
      this.childNodes = this.children;
      this.attributes = new Map();
      this.dataset = {};
      this.value = "";
      this.textContent = "";
      this.hidden = false;
      this.disabled = false;
      this.inert = false;
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }
    addEventListener(type, handler) {
      this.listeners ??= new Map();
      this.listeners.set(type, handler);
    }
    removeEventListener(type) {
      this.listeners?.delete(type);
    }
    click() {
      this.listeners?.get("click")?.({ target: this });
    }
    append(...nodes) {
      for (const node of nodes) {
        if (node.parent) node.remove();
        node.parent = this;
        this.children.push(node);
      }
    }
    replaceChildren(...nodes) {
      for (const child of this.children) child.parent = null;
      this.children = [];
      this.childNodes = this.children;
      this.append(...nodes);
    }
    insertBefore(node, before) {
      if (node.parent) node.remove();
      node.parent = this;
      const index = before ? this.children.indexOf(before) : -1;
      this.children.splice(index < 0 ? this.children.length : index, 0, node);
    }
    remove() {
      if (!this.parent) return;
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = null;
    }
    contains(node) {
      return this === node || this.children.some((child) => child.contains?.(node));
    }
    focus() {
      globalThis.document.activeElement = this;
    }
    closest() {
      return { hidden: false };
    }
    querySelector(selector) {
      if (this === root) {
        const match = /^\[data-([a-z-]+)\]$/.exec(selector);
        if (match) return targets.get(match[1]);
        if (selector === ".dc-assignment-legend") return new Node("div");
        if (selector === ".dc-prototype-toolbar > span") return new Node("span");
      }
      return null;
    }
    querySelectorAll(selector) {
      return selector === "[data-feature-id]"
        ? this.children.filter((child) => child.dataset.featureId)
        : [];
    }
  }

  globalThis.document = {
    activeElement: null,
    createElement(tagName) {
      const node = new Node(tagName);
      if (tagName === "main") {
        root = node;
        for (const key of REQUIRED_ASSIGNMENT_PAGE_TARGETS) targets.set(key, new Node("div"));
        targets.get("type").previousSibling = { textContent: "Type" };
      }
      return node;
    },
  };
  globalThis.window = { addEventListener() {} };
  globalThis.Option = class {
    constructor(label, value) {
      this.label = label;
      this.value = value;
    }
  };

  return {
    get: (name) => targets.get(name),
    restore() {
      globalThis.document = oldDocument;
      globalThis.window = oldWindow;
      globalThis.Option = oldOption;
    },
  };
}

function packageData(id) {
  return {
    id,
    packageId: id,
    name: id,
    shortId: id,
    type: "NM",
    category: "NM",
    title: `Package ${id}`,
    descriptionEntries: [],
  };
}

function record(active) {
  return { relations: active ? { ENC: { active: true, workspaces: [] } } : {} };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("Switching Package retains the map and bindings until the next Package is ready", async () => {
  const dom = fakeDom();
  const nextPackage = deferred();
  const nextBindings = deferred();
  const nextPipelines = deferred();
  const mapSelections = [];
  let pipelineReads = 0;
  const services = {
    source: "live",
    categories: async () => [],
    features: {
      search: async () => ({ items: [], page: 0, pageSize: 25, total: 0 }),
      get: (id) => (id === "B" ? nextPackage.promise : Promise.resolve(packageData(id))),
    },
    assignments: {
      load: (id) => (id === "B" ? nextBindings.promise : Promise.resolve(record(true))),
    },
    workStreams: {
      list: () => {
        pipelineReads++;
        return pipelineReads === 1
          ? Promise.resolve({ items: [{ id: "ENC", name: "ENC" }], total: 1 })
          : nextPipelines.promise;
      },
    },
  };
  let page;
  try {
    page = createAssignmentPage({
      services,
      createMap: () => ({
        view: null,
        selectContext: (feature) => mapSelections.push(feature?.id ?? null),
        destroy() {},
      }),
      runtimeConfig: { sourceMode: "live" },
    });
    page.activate();
    assert.equal(await page.selectPackage("A"), true);
    await flush();
    assert.equal(dom.get("work-streams").children.length, 1);
    assert.equal(dom.get("map-empty").hidden, true);
    const before = [...mapSelections];
    const visiblePipelines = [...dom.get("work-streams").children];

    const pending = page.selectPackage("B");
    await flush();
    assert.match(dom.get("selection-status").textContent, /Loading Package/);
    assert.equal(dom.get("map-empty").hidden, true);
    assert.deepEqual(mapSelections, before);
    assert.deepEqual(dom.get("work-streams").children, visiblePipelines);
    assert.equal(dom.get("work-streams").inert, true);

    nextPackage.resolve(packageData("B"));
    await flush();
    assert.deepEqual(mapSelections, before);
    nextBindings.resolve(record(false));
    assert.equal(await pending, true);
    assert.deepEqual(mapSelections, [...before, "B"]);
    assert.match(dom.get("work-stream-status").textContent, /Loading Pipelines/);
    assert.deepEqual(dom.get("work-streams").children, visiblePipelines);
    assert.equal(dom.get("work-streams").inert, true);

    nextPipelines.resolve({ items: [{ id: "ENC", name: "ENC" }], total: 1 });
    await flush();
    assert.equal(dom.get("work-streams").children.length, 1);
    assert.equal(dom.get("work-streams").inert, false);
    assert.match(dom.get("selection-status").textContent, /B/);
    assert.equal(dom.get("map-empty").hidden, true);
    assert.doesNotMatch(dom.get("work-stream-status").textContent, /Select a Package/);
  } finally {
    page?.destroy();
    dom.restore();
  }
});

test("Failed Package selection keeps the previous bindings and offers selection Retry", async () => {
  const dom = fakeDom();
  const mapSelections = [];
  let attempts = 0;
  const services = {
    source: "live",
    categories: async () => [],
    features: {
      search: async () => ({ items: [], page: 0, pageSize: 25, total: 0 }),
      get: async (id) => {
        if (id === "B" && ++attempts === 1) throw new Error("Package unavailable");
        return packageData(id);
      },
    },
    assignments: { load: async () => record(true) },
    workStreams: {
      list: async () => ({ items: [{ id: "ENC", name: "ENC" }], total: 1 }),
    },
  };
  let page;
  try {
    page = createAssignmentPage({
      services,
      createMap: () => ({
        view: null,
        selectContext: (feature) => mapSelections.push(feature?.id ?? null),
        destroy() {},
      }),
      runtimeConfig: { sourceMode: "live" },
    });
    page.activate();
    assert.equal(await page.selectPackage("A"), true);
    await flush();
    const previousRows = [...dom.get("work-streams").children];
    const previousMap = [...mapSelections];

    assert.equal(await page.selectPackage("B"), false);
    await flush();
    assert.match(dom.get("selection-status").textContent, /Package unavailable/);
    assert.equal(dom.get("selection-retry").hidden, false);
    assert.equal(dom.get("map-empty").hidden, true);
    assert.deepEqual(dom.get("work-streams").children, previousRows);
    assert.equal(dom.get("work-streams").inert, false);
    assert.deepEqual(mapSelections, previousMap);

    assert.equal(await page.selectPackage("B"), true);
    await flush();
    assert.equal(dom.get("selection-retry").hidden, true);
    assert.equal(mapSelections.at(-1), "B");
  } finally {
    page?.destroy();
    dom.restore();
  }
});

test("Failed Pipeline catalogue does not show stale bindings under a new Package", async () => {
  const dom = fakeDom();
  let pipelineReads = 0;
  const services = {
    source: "live",
    categories: async () => [],
    features: {
      search: async () => ({ items: [], page: 0, pageSize: 25, total: 0 }),
      get: async (id) => packageData(id),
    },
    assignments: { load: async () => record(true) },
    workStreams: {
      list: async () => {
        pipelineReads++;
        if (pipelineReads === 2) throw new Error("Pipelines unavailable");
        return { items: [{ id: "ENC", name: "ENC" }], total: 1 };
      },
    },
  };
  let page;
  try {
    page = createAssignmentPage({
      services,
      createMap: () => ({ view: null, selectContext() {}, destroy() {} }),
      runtimeConfig: { sourceMode: "live" },
    });
    assert.equal(await page.selectPackage("A"), true);
    await flush();
    assert.equal(dom.get("work-streams").children.length, 1);
    assert.equal(await page.selectPackage("B"), true);
    await flush();
    assert.match(dom.get("work-stream-status").textContent, /Pipelines unavailable/);
    assert.equal(dom.get("work-streams").children.length, 0);
    assert.equal(dom.get("work-stream-retry").disabled, false);

    dom.get("work-stream-retry").click();
    await flush();
    assert.equal(dom.get("work-streams").children.length, 1);
    assert.equal(dom.get("work-streams").inert, false);
    assert.doesNotMatch(dom.get("work-stream-status").textContent, /unavailable/);
  } finally {
    page?.destroy();
    dom.restore();
  }
});
