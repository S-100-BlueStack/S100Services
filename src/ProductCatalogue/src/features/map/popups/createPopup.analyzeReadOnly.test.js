import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPopupProductMetadataColumns } from "./popupProductMetadata.js";

class TestNode {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.children = [];
    this.className = "";
    this.attributes = {};
    this.style = { setProperty() {} };
    this.isConnected = false;
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  replaceChildren(...children) {
    this.children = children;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
}

function nodeText(node) {
  return [node.textContent ?? "", ...node.children.map(nodeText)].join(" ");
}

async function loadPopupWithReadOnlyDependencies(graphicContext) {
  const url = new URL("./createPopup.js", import.meta.url);
  const source = await readFile(url, "utf8");
  const namespace = `__analyzeReadOnlyPopupTest${Math.random().toString(36).slice(2)}`;
  globalThis[namespace] = {
    createPopupProductMetadataColumns,
    resolveProductContext: () => graphicContext,
    createPopupErrorDetails: () => ({
      createTrigger: () => null,
      beforeRender: () => undefined,
      afterRender() {},
      destroy() {},
    }),
    getEncPackageStatusLabel: (status) => `Package ${status}`,
    normalizeEncPackageStatus: (status) => status,
    packageStatusColorConfig: {},
    applyPopupProductStatusCell() {},
    getStatusName: (status) => `Status ${status}`,
    attributesSupportLayerCapability: () => false,
    // Read-only rendering must never initialize source-authorized mutations.
    createPackageActionSession: () => {
      throw new Error("Package actions must not be used in Analyze");
    },
    createPopupActionBar: () => {
      throw new Error("Popup actions must not be used in Analyze");
    },
  };

  const isolated = source.replace(
    /import\s+([\s\S]*?)\s+from\s+"[^"]+";/g,
    (_, bindings) => `const ${bindings} = globalThis[${JSON.stringify(namespace)}];`
  );
  try {
    const module = await import(
      `data:text/javascript;base64,${Buffer.from(isolated).toString("base64")}`
    );
    return module.createPopup;
  } finally {
    delete globalThis[namespace];
  }
}

function setupDocument(t) {
  const original = {
    document: globalThis.document,
    window: globalThis.window,
    Node: globalThis.Node,
    MutationObserver: globalThis.MutationObserver,
    requestAnimationFrame: globalThis.requestAnimationFrame,
  };
  globalThis.Node = TestNode;
  globalThis.document = {
    body: new TestNode("body"),
    createElement: (tagName) => new TestNode(tagName),
  };
  globalThis.window = {};
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.requestAnimationFrame = (callback) => callback();
  t.after(() => Object.assign(globalThis, original));
}

test("Analyze package popup renders the existing member table without mutation controls", async (t) => {
  setupDocument(t);
  const context = {
    workUnit: {
      kind: "package",
      members: [
        { key: "s101", label: "S-101", exportStandard: "S100" },
        { key: "s57", label: "S-57", exportStandard: "S57" },
      ],
    },
  };
  const createPopup = await loadPopupWithReadOnlyDependencies(context);
  const template = createPopup({ readOnly: true });
  const graphic = {
    attributes: {
      datasetName: "101DK0020109C",
      workUnitStatus: {
        packageStatus: 4,
        members: [
          { key: "s101", status: 8 },
          { key: "s57", status: 11 },
        ],
      },
      workUnitMetadata: {
        members: {
          s101: { datasetName: "101DK0020109C", edition: 3, update: 1 },
          s57: { datasetName: "DK0020109C", edition: 4, update: 0 },
        },
      },
    },
  };
  const popup = template.content({ graphic });
  const text = nodeText(popup);
  assert.equal(template.title({ graphic }), "101DK0020109C");
  assert.match(text, /Package status/);
  assert.match(text, /Package 4/);
  assert.match(text, /S-101/);
  assert.match(text, /S-57/);
  assert.match(text, /DK0020109C/);
  assert.match(text, /Edition/);
  assert.match(text, /Update/);
  assert.match(text, /Status/);
  assert.equal(popup.className, "popup-container");
  assert.equal(
    popup.children.some((node) => node.className === "popup-action-bar"),
    false
  );
});

test("Analyze ordinary popup renders product details without package source context", async (t) => {
  setupDocument(t);
  const createPopup = await loadPopupWithReadOnlyDependencies(null);
  const graphic = {
    attributes: { datasetName: "Ordinary product", edition: 5, update: 2, status: 8 },
  };
  const popup = createPopup({ readOnly: true }).content({ graphic });
  const text = nodeText(popup);
  assert.match(text, /Edition/);
  assert.match(text, /Update/);
  assert.match(text, /Status 8/);
  assert.equal(
    popup.children.some((node) => node.className === "popup-action-bar"),
    false
  );
});
