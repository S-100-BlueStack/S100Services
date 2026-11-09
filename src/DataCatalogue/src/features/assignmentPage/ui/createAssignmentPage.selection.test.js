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
      this.classes = new Set();
      this.classList = {
        toggle: (name, enabled) => {
          if (enabled) this.classes.add(name);
          else this.classes.delete(name);
        },
        contains: (name) => this.classes.has(name),
      };
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
        targets.get("status").previousSibling = { textContent: "Status" };
        targets.get("search").previousSibling = { textContent: "Feature name" };
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
    assert.equal(dom.get("package-name").textContent, "B");
    assert.equal(dom.get("selection-status").textContent, "");
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

test("uncertain Save exposes read-only verification without repeating the mutation", async () => {
  const dom = fakeDom();
  let writes = 0;
  let verifies = 0;
  const services = {
    source: "live",
    categories: async () => [],
    features: {
      search: async () => ({ items: [], page: 0, pageSize: 25, total: 0 }),
      get: async (id) => packageData(id),
    },
    assignments: {
      load: async () => record(false),
      save: async () => {
        writes++;
        throw Object.assign(new Error("Binding write timed out; server outcome unknown"), {
          requiresReconciliation: true,
        });
      },
      reconcile: async () => {
        verifies++;
        return record(true);
      },
    },
    workStreams: {
      list: async () => ({ items: [{ id: "ENC", name: "ENC" }], total: 1 }),
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
    const checkbox = dom.get("work-streams").children[0].children[0].children[0].children[0];
    checkbox.checked = true;
    checkbox.listeners.get("change")();
    dom.get("save").click();
    await flush();
    assert.equal(writes, 1);
    assert.equal(dom.get("save").disabled, true);
    assert.equal(dom.get("reconcile").hidden, false);
    assert.equal(dom.get("abandon").hidden, false);
    assert.match(dom.get("save-error").textContent, /outcome unknown/);
    assert.equal(await page.allowLeave(), false);

    dom.get("reconcile").click();
    await flush();
    assert.equal(verifies, 1);
    assert.equal(writes, 1);
    assert.equal(dom.get("reconcile").hidden, true);
    assert.equal(dom.get("abandon").hidden, true);
    assert.equal(dom.get("save").disabled, true);
  } finally {
    page?.destroy();
    dom.restore();
  }
});

test("confirmed local discard clears uncertain Package without claiming rollback", async () => {
  const dom = fakeDom();
  let writes = 0;
  let confirms = 0;
  globalThis.window.confirm = (message) => {
    confirms++;
    assert.match(message, /will not undo server changes/);
    return true;
  };
  const services = {
    source: "live",
    categories: async () => [],
    features: {
      search: async () => ({ items: [], page: 0, pageSize: 25, total: 0 }),
      get: async (id) => packageData(id),
    },
    assignments: {
      load: async () => record(false),
      save: async () => {
        writes++;
        throw Object.assign(new Error("Write timed out"), { requiresReconciliation: true });
      },
    },
    workStreams: { list: async () => ({ items: [{ id: "ENC", name: "ENC" }], total: 1 }) },
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
    const checkbox = dom.get("work-streams").children[0].children[0].children[0].children[0];
    checkbox.checked = true;
    checkbox.listeners.get("change")();
    dom.get("save").click();
    await flush();
    assert.equal(dom.get("abandon").hidden, false);
    dom.get("abandon").click();
    assert.equal(confirms, 1);
    assert.equal(writes, 1);
    assert.equal(dom.get("map-empty").hidden, false);
    assert.equal(await page.allowLeave(), true);
  } finally {
    page?.destroy();
    dom.restore();
  }
});

test("Live Package search filters only the loaded page without extra API reads", async () => {
  const dom = fakeDom();
  let reads = 0;
  const services = {
    source: "live",
    categories: async () => [],
    features: {
      search: async () => {
        reads++;
        return {
          page: 0,
          pageSize: 25,
          total: 45,
          items: [
            { ...packageData("A"), name: "NM260001", title: "Harbour closure", status: "Assigned" },
            {
              ...packageData("B"),
              name: "KP260002",
              title: "Dredging notice",
              status: "Not assigned",
            },
          ],
        };
      },
      get: async (id) => packageData(id),
    },
    assignments: { load: async () => record(false) },
    workStreams: { list: async () => ({ items: [], total: 0 }) },
  };
  let page;
  try {
    page = createAssignmentPage({
      services,
      createMap: () => ({ view: null, selectContext() {}, destroy() {} }),
    });
    await flush();
    assert.equal(reads, 1);
    assert.equal(dom.get("features").children.length, 2);
    assert.equal(dom.get("feature-page").textContent, "Page 1 of 2");

    dom.get("search").value = "harbour";
    dom.get("search").listeners.get("input")();
    assert.equal(reads, 1);
    assert.deepEqual(
      dom.get("features").children.map((item) => item.dataset.featureId),
      ["A"]
    );
    assert.equal(dom.get("list-status").textContent, "1 matching on this page");

    assert.equal(await page.selectPackage("A"), true);
    await flush();
    dom.get("search").value = "dredging";
    dom.get("search").listeners.get("input")();
    assert.match(dom.get("selection-status").textContent, /Outside the current filter/);
    assert.equal(reads, 1);

    dom.get("search").value = "not in this page";
    dom.get("search").listeners.get("input")();
    assert.equal(dom.get("features").children.length, 0);
    assert.match(dom.get("list-status").textContent, /try another page/);
    assert.equal(reads, 1);
  } finally {
    page?.destroy();
    dom.restore();
  }
});

test("Live details show ordered fields and only saved Pipeline and Workspace bindings", async () => {
  const dom = fakeDom();
  const services = {
    source: "live",
    categories: async () => [],
    features: {
      search: async () => ({ items: [], page: 0, pageSize: 25, total: 0 }),
      get: async (id) => packageData(id),
    },
    assignments: {
      load: async () => ({
        relations: {
          ENC: { active: true, workspaces: [{ name: "Kattegat" }] },
        },
      }),
    },
    workStreams: {
      list: async () => ({ items: [{ id: "ENC", name: "ENC Production" }], total: 1 }),
    },
  };
  let page;
  try {
    page = createAssignmentPage({
      services,
      createMap: () => ({ view: null, selectContext() {}, destroy() {} }),
    });
    const html = page.element.innerHTML;
    const left = html.split('class="dc-assignment-column dc-assignment-column--right"')[0];
    const right = html.split('class="dc-assignment-column dc-assignment-column--right"')[1];
    assert.ok(left.indexOf("dc-feature-panel") < left.indexOf("dc-work-stream-panel"));
    assert.ok(right.indexOf("dc-information-panel") < right.indexOf("dc-assignment-map-panel"));

    assert.equal(await page.selectPackage("A"), true);
    await flush();
    assert.equal(dom.get("package-name").textContent, "A");
    const labels = dom
      .get("information")
      .children[0].children.filter((item) => item.tagName === "DT")
      .map((item) => item.textContent);
    assert.deepEqual(labels, [
      "Title",
      "Category",
      "Severity",
      "Details",
      "Nautical charts",
      "Publication",
    ]);
    const binding = dom.get("saved-bindings").children[0];
    assert.equal(binding.children[0].textContent, "ENC Production");
    assert.equal(binding.children[1].textContent, " · Kattegat");

    const checkbox = dom.get("work-streams").children[0].children[0].children[0].children[0];
    checkbox.checked = false;
    checkbox.listeners.get("change")();
    assert.equal(dom.get("saved-bindings").children[0].children[1].textContent, " · Kattegat");
  } finally {
    page?.destroy();
    dom.restore();
  }
});

test("Package assignment exposes auto-selected Workspace previews and blocks unsupported Save", async () => {
  const dom = fakeDom();
  const savedWorkspaces = [{ id: "ws1", name: "Kattegat" }];
  const mapContexts = [];
  let workspaceReads = 0;
  let writes = 0;
  const services = {
    source: "live",
    categories: async () => [],
    features: {
      search: async () => ({ items: [], page: 0, pageSize: 25, total: 0 }),
      get: async (id) => packageData(id),
    },
    assignments: {
      load: async () => ({ relations: { ENC: { active: true, workspaces: savedWorkspaces } } }),
      save: async () => {
        writes++;
        return record(true);
      },
    },
    workStreams: {
      list: async () => ({ items: [{ id: "ENC", name: "ENC Production" }], total: 1 }),
    },
    workspaces: {
      list: async ({ pipelineId }) => {
        workspaceReads++;
        assert.equal(pipelineId, "ENC");
        return {
          items: [
            { id: "ws1", name: "Kattegat" },
            { id: "ws2", name: "Baltic" },
          ],
          total: 2,
        };
      },
    },
  };
  let page;
  try {
    page = createAssignmentPage({
      services,
      createMap: () => ({
        view: null,
        selectContext(feature, record) {
          mapContexts.push({ feature: feature?.id, workspaces: record.relations?.ENC?.workspaces });
        },
        destroy() {},
      }),
    });
    page.activate();
    assert.equal(await page.selectPackage("A"), true);
    await flush();
    const row = dom.get("work-streams").children[0];
    const workspaceToggle = row.children[0].children[1];
    workspaceToggle.click();
    await flush();
    assert.equal(workspaceReads, 1);
    const workspaceList = row.children[3].children[1];
    const byName = (name) =>
      workspaceList.children.find((item) => item.children[1].textContent === name).children[0];
    const first = byName("Kattegat");
    const second = byName("Baltic");
    assert.equal(first.checked, true);
    assert.equal(second.checked, false);
    const savedSummary = dom.get("saved-bindings").children[0].children[1].textContent;

    second.checked = true;
    second.listeners.get("change")();
    assert.equal(dom.get("save").disabled, true);
    assert.match(dom.get("save-error").textContent, /preview-only/);
    assert.equal(dom.get("saved-bindings").children[0].children[1].textContent, savedSummary);
    assert.equal(mapContexts.at(-1).workspaces.length, 1);
    assert.equal(writes, 0);

    second.checked = false;
    second.listeners.get("change")();
    assert.equal(dom.get("save-error").textContent, "");
    assert.equal(second.checked, false);
  } finally {
    page?.destroy();
    dom.restore();
  }
});

test("Package list only loads bindings on selection and retains summaries across selections and pages", async () => {
  const dom = fakeDom();
  const bindingReads = [];
  let listReads = 0;
  const services = {
    source: "live",
    categories: async () => [],
    features: {
      search: async ({ page }) => {
        listReads++;
        return {
          items: page === 0 ? [packageData("A"), packageData("B")] : [packageData("C")],
          total: 3,
          page,
          pageSize: 2,
        };
      },
      get: async (id) => packageData(id),
      bindingSummaries: () => {
        throw new Error("Package list must not prefetch bindings");
      },
    },
    assignments: {
      load: async (id) => {
        bindingReads.push(id);
        return record(id === "A");
      },
    },
    workStreams: {
      list: async () => ({ items: [{ id: "ENC", name: "ENC Production" }], total: 1 }),
    },
  };
  let page;
  const row = (id) =>
    [...dom.get("features").children].find((element) => element.dataset.featureId === id);
  const status = (button) => button.children[0].children[1].textContent;
  const pipelines = (button) => button.children[0].children[0].children[1].textContent;
  try {
    page = createAssignmentPage({
      services,
      createMap: () => ({ view: null, selectContext() {}, destroy() {} }),
    });
    await flush();
    assert.equal(listReads, 1);
    assert.deepEqual(bindingReads, []);
    assert.equal(status(row("A")), "");
    assert.equal(status(row("B")), "");

    assert.equal(await page.selectPackage("A"), true);
    await flush();
    assert.deepEqual(bindingReads, ["A"]);
    assert.equal(status(row("A")), "Assigned");
    assert.equal(pipelines(row("A")), "ENC Production");
    assert.equal(status(row("B")), "");

    assert.equal(await page.selectPackage("B"), true);
    await flush();
    assert.deepEqual(bindingReads, ["A", "B"]);
    assert.equal(status(row("A")), "Assigned");
    assert.equal(pipelines(row("A")), "ENC Production");
    assert.equal(status(row("B")), "Not assigned");

    dom.get("feature-next").click();
    await flush();
    assert.equal(row("A"), undefined);
    assert.equal(status(row("C")), "");
    assert.deepEqual(bindingReads, ["A", "B"]);
    dom.get("feature-prev").click();
    await flush();
    assert.equal(listReads, 3);
    assert.equal(status(row("A")), "Assigned");
    assert.equal(pipelines(row("A")), "ENC Production");
    assert.equal(status(row("B")), "Not assigned");
    assert.deepEqual(bindingReads, ["A", "B"]);
  } finally {
    page?.destroy();
    dom.restore();
  }
});

test("Package row reflects confirmed Save but not an unsaved Pipeline draft", async () => {
  const dom = fakeDom();
  let saved = false;
  const services = {
    source: "live",
    categories: async () => [],
    features: {
      search: async () => ({ items: [packageData("A")], total: 1, page: 0, pageSize: 25 }),
      get: async (id) => packageData(id),
    },
    assignments: {
      load: async () => record(saved),
      save: async () => {
        saved = true;
        return record(saved);
      },
    },
    workStreams: {
      list: async () => ({ items: [{ id: "ENC", name: "ENC Production" }], total: 1 }),
    },
  };
  let page;
  try {
    page = createAssignmentPage({ services, createMap: () => ({ view: null, destroy() {} }) });
    await flush();
    assert.equal(await page.selectPackage("A"), true);
    await flush();
    const row = dom.get("features").children[0];
    assert.equal(row.children[0].children[1].textContent, "Not assigned");
    const checkbox = dom.get("work-streams").children[0].children[0].children[0].children[0];
    checkbox.checked = true;
    checkbox.listeners.get("change")();
    assert.equal(row.children[0].children[1].textContent, "Not assigned");
    dom.get("save").click();
    await flush();
    assert.equal(row.children[0].children[1].textContent, "Assigned");
    assert.equal(row.children[0].children[0].children[1].textContent, "ENC Production");
  } finally {
    page?.destroy();
    dom.restore();
  }
});

test("Superseded Package page results cannot replace the latest page or cached bindings", async () => {
  const dom = fakeDom();
  const older = deferred();
  let firstPageReads = 0;
  const services = {
    source: "live",
    categories: async () => [],
    features: {
      search: async ({ page }) => {
        if (page === 0 && ++firstPageReads > 1) return older.promise;
        return {
          items: [packageData(page === 0 ? "A" : "B")],
          total: 2,
          page,
          pageSize: 1,
        };
      },
      get: async (id) => packageData(id),
    },
    assignments: { load: async () => record(true) },
    workStreams: { list: async () => ({ items: [{ id: "ENC", name: "ENC" }], total: 1 }) },
  };
  let page;
  try {
    page = createAssignmentPage({ services, createMap: () => ({ view: null, destroy() {} }) });
    await flush();
    assert.equal(await page.selectPackage("A"), true);
    await flush();
    dom.get("feature-retry").click();
    await flush();
    dom.get("feature-next").click();
    await flush();
    const currentRow = dom.get("features").children[0];
    assert.equal(currentRow.dataset.featureId, "B");
    older.resolve({ items: [packageData("A")], total: 2, page: 0, pageSize: 1 });
    await flush();
    assert.equal(dom.get("features").children[0], currentRow);
    assert.equal(currentRow.dataset.featureId, "B");
    dom.get("feature-prev").click();
    await flush();
    // A was already inspected; its saved summary survives superseded page requests.
    assert.equal(dom.get("features").children[0].children[0].children[1].textContent, "Assigned");
  } finally {
    page?.destroy();
    dom.restore();
  }
});

test("An uncertain Save invalidates cached bindings until read-only reconciliation", async () => {
  const dom = fakeDom();
  let reads = 0;
  const services = {
    source: "live",
    categories: async () => [],
    features: {
      search: async () => ({ items: [packageData("A")], total: 1, page: 0, pageSize: 25 }),
      get: async (id) => packageData(id),
    },
    assignments: {
      load: async () => {
        reads++;
        return record(false);
      },
      save: async () => {
        const error = new Error("Write may have committed");
        error.requiresReconciliation = true;
        throw error;
      },
      reconcile: async () => {
        reads++;
        return record(true);
      },
    },
    workStreams: {
      list: async () => ({ items: [{ id: "ENC", name: "ENC Production" }], total: 1 }),
    },
  };
  let page;
  try {
    page = createAssignmentPage({ services, createMap: () => ({ view: null, destroy() {} }) });
    await flush();
    assert.equal(await page.selectPackage("A"), true);
    await flush();
    const row = dom.get("features").children[0];
    assert.equal(row.children[0].children[1].textContent, "Not assigned");
    const checkbox = dom.get("work-streams").children[0].children[0].children[0].children[0];
    checkbox.checked = true;
    checkbox.listeners.get("change")();
    dom.get("save").click();
    await flush();
    assert.equal(dom.get("reconcile").hidden, false);
    assert.equal(row.children[0].children[1].textContent, "");
    dom.get("reconcile").click();
    await flush();
    assert.equal(row.children[0].children[1].textContent, "Assigned");
    assert.equal(row.children[0].children[0].children[1].textContent, "ENC Production");
    assert.equal(reads, 2);
  } finally {
    page?.destroy();
    dom.restore();
  }
});

test("Save highlights only actionable binding drafts and keeps the status alongside the control", async () => {
  const dom = fakeDom();
  const services = {
    source: "live",
    categories: async () => [],
    features: {
      search: async () => ({ items: [], total: 0, page: 0, pageSize: 25 }),
      get: async (id) => packageData(id),
    },
    assignments: { load: async () => record(false) },
    workStreams: { list: async () => ({ items: [{ id: "ENC", name: "ENC" }], total: 1 }) },
  };
  let page;
  try {
    page = createAssignmentPage({ services, createMap: () => ({ view: null, destroy() {} }) });
    assert.equal(await page.selectPackage("A"), true);
    await flush();
    const save = dom.get("save");
    assert.equal(save.disabled, true);
    assert.equal(save.classList.contains("is-actionable"), false);
    const checkbox = dom.get("work-streams").children[0].children[0].children[0].children[0];
    checkbox.checked = true;
    checkbox.listeners.get("change")();
    assert.equal(save.disabled, false);
    assert.equal(save.classList.contains("is-actionable"), true);
    assert.equal(dom.get("draft-status").textContent, "Unsaved changes");
    checkbox.checked = false;
    checkbox.listeners.get("change")();
    assert.equal(save.disabled, true);
    assert.equal(save.classList.contains("is-actionable"), false);
  } finally {
    page?.destroy();
    dom.restore();
  }
});

test("assignment map Retry uses the same MapView top-right stack as basemap and Zoom", async () => {
  const dom = fakeDom();
  const calls = [];
  let index = 0;
  const services = {
    source: "live",
    categories: async () => [],
    features: { search: async () => ({ items: [], page: 0, pageSize: 25, total: 0 }) },
    assignments: { load: async () => record(false) },
    workStreams: { list: async () => ({ items: [], total: 0 }) },
  };
  let page;
  try {
    page = createAssignmentPage({
      services,
      createMap: () => {
        const id = ++index;
        return {
          view: {
            ui: {
              add: (node, options) => calls.push(["add", id, node, options]),
              remove: (node) => calls.push(["remove", id, node]),
            },
          },
          selectContext() {},
          destroy() {},
        };
      },
    });
    page.activate();
    const retry = dom.get("map-retry");
    assert.deepEqual(calls[0], ["add", 1, retry, { position: "top-right", index: 2 }]);
    retry.click();
    assert.deepEqual(calls[1], ["remove", 1, retry]);
    assert.deepEqual(calls[2], ["add", 2, retry, { position: "top-right", index: 2 }]);
  } finally {
    page?.destroy();
    dom.restore();
  }
});
