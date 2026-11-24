import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { canonicalizeAnalyzeItems } from "../../features/analyze/domain/analyzeWorkUnits.js";
import { normalizeAnalyzeDatasetItems } from "../../features/analyze/domain/analyzeDatasetList.js";
import {
  getReviewContentTypeDefinitions,
  isReviewContentTypeEnabled,
  normalizeReviewProductItems,
} from "../../features/review/domain/reviewProductList.js";
import { parseWorkspaceRoute } from "../routing/workspaceRoute.js";
import {
  captureWorkspaceTransferFocus,
  createWorkspaceTransferLink,
  restoreWorkspaceTransferFocus,
} from "./workspaceTransferLink.js";

const origin = "https://catalogue.example";
const listSelector = ".product-list";

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.scrollTop = 0;
    this.classList = {
      add: (...values) => {
        this.className += ` ${values.join(" ")}`;
      },
    };
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  appendChild(node) {
    this.append(node);
    return node;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  addEventListener() {}

  contains(node) {
    return this === node || this.children.some((child) => child.contains(node));
  }

  querySelectorAll(selector) {
    const [tag, className] = selector.split(".");
    return this.children.flatMap((child) => [
      ...((!tag || child.tagName === tag) && child.className.split(" ").includes(className)
        ? [child]
        : []),
      ...child.querySelectorAll(selector),
    ]);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  focus(options) {
    this.focusOptions = options;
    document.activeElement = this;
  }
}

function browser(t) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const body = new Element("body");
  globalThis.document = {
    body,
    activeElement: body,
    createElement: (name) => new Element(name),
  };
  globalThis.window = { location: new URL("/Analyze?Datasets=Other", origin) };
  t.after(() => {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  });
}

// Exercise the production list renderers without the unrelated map, report or Calcite imports.
async function loadListRenderer(path, functionName) {
  const source = (await readFile(new URL(path, import.meta.url), "utf8"))
    .replace(/^import[\s\S]*?from "[^"]+";\s*/gm, "")
    .replace(/^import "[^"]+";\s*/gm, "")
    .replace(/export function/g, "function");
  return runInNewContext(`${source}\n${functionName};`, {
    document,
    createWorkspaceTransferLink,
    getReviewContentTypeDefinitions,
    isReviewContentTypeEnabled,
  });
}

function getTransfers(root) {
  return root.querySelectorAll("a.pc-workspace-transfer");
}

function readRoute(link) {
  assert.equal(link.target, undefined);
  assert.equal(link.rel, undefined);
  return parseWorkspaceRoute(link.href, { origin, baseUrl: "/" });
}

for (const scenario of [
  {
    source: "Analyze",
    destination: "review",
    label: "Review",
    file: "../../features/analyze/ui/analyzeSidebar.js",
    renderer: "createDatasetList",
    normalize: normalizeAnalyzeDatasetItems,
  },
  {
    source: "Review",
    destination: "analyze",
    label: "Analyze",
    file: "../../features/review/ui/reviewSidebar.js",
    renderer: "createProductList",
    normalize: normalizeReviewProductItems,
  },
]) {
  test(`${scenario.source} renders individual and whole-list transfers in composition order`, async (t) => {
    browser(t);
    const render = await loadListRenderer(scenario.file, scenario.renderer);
    const names = ["Primary", "Harbour & east", "Chart + revision"];
    const items = scenario.normalize([
      { name: names[0], enabled: false },
      { name: names[1], enabled: true },
      { name: names[2], enabled: false },
    ]);
    const transfers = getTransfers(render(items, false));
    assert.equal(transfers.length, 4);
    assert.equal(transfers[0].textContent, `Open all in ${scenario.label}`);
    assert.deepEqual(readRoute(transfers[0]), {
      name: scenario.destination,
      datasetNames: names,
    });
    for (const [index, transfer] of transfers.slice(1).entries()) {
      assert.equal(transfer.attributes["aria-label"], `Open ${names[index]} in ${scenario.label}`);
      assert.deepEqual(readRoute(transfer), {
        name: scenario.destination,
        datasetNames: [names[index]],
      });
    }
    // A removed Product is no longer part of the bulk link. All-disabled is still transferable.
    const updated = getTransfers(
      render(
        items.filter((item) => !item.enabled),
        false
      )
    );
    assert.deepEqual(readRoute(updated[0]).datasetNames, [names[0], names[2]]);
    assert.equal(getTransfers(render([], false)).length, 0);
  });
}

test("a proven package is transferred through its canonical representative only", (t) => {
  browser(t);
  const canonicalItems = canonicalizeAnalyzeItems(
    ["Secondary", "Independent", "Primary"],
    [
      {
        datasetName: "Primary",
        workUnit: {
          kind: "package",
          members: [{ datasetName: "Primary" }, { datasetName: "Secondary" }],
        },
      },
    ]
  );
  const link = createWorkspaceTransferLink({
    destination: "review",
    datasetNames: canonicalItems.map((item) => item.name),
  });
  assert.deepEqual(readRoute(link).datasetNames, ["Primary", "Independent"]);
});

test("an unrepresentable name does not silently drop a Product or construct a different route", (t) => {
  browser(t);
  const link = createWorkspaceTransferLink({
    destination: "review",
    datasetNames: ["Valid", "Comma, name"],
  });
  assert.equal(link.tagName, "span");
  assert.equal(link.attributes["aria-disabled"], "true");
  assert.equal(link.href, undefined);
  assert.equal(createWorkspaceTransferLink({ destination: "review", datasetNames: [] }), null);
});

test("a rerender restores a surviving navigation control and Product-list scroll by stable identity", (t) => {
  browser(t);
  const makeRoot = (names) => {
    const root = new Element("section");
    const list = new Element("div");
    list.className = "product-list";
    root.append(list);
    for (const name of names) {
      list.append(
        createWorkspaceTransferLink({
          destination: "analyze",
          datasetNames: [name],
          productId: name,
        })
      );
    }
    return { root, list };
  };
  const previous = makeRoot(["A", "B"]);
  previous.list.scrollTop = 72;
  previous.list.children[1].focus();
  const focus = captureWorkspaceTransferFocus(previous.root, listSelector);
  const next = makeRoot(["B"]);
  document.activeElement = document.body;
  restoreWorkspaceTransferFocus(next.root, listSelector, focus);
  assert.equal(document.activeElement, next.list.children[0]);
  assert.deepEqual(next.list.children[0].focusOptions, { preventScroll: true });
  assert.equal(next.list.scrollTop, 72);

  const unrelated = new Element("input");
  unrelated.focus();
  restoreWorkspaceTransferFocus(next.root, listSelector, focus);
  assert.equal(document.activeElement, unrelated);
  assert.equal(captureWorkspaceTransferFocus(next.root, listSelector), null);

  document.activeElement = document.body;
  restoreWorkspaceTransferFocus(makeRoot(["A"]).root, listSelector, focus);
  assert.equal(document.activeElement, document.body);
});
