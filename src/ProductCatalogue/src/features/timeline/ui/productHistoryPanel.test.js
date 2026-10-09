import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  createCompatibilityWorkspaceProductContext,
  createProductContextIdentityAttributes,
  registerGraphicProductContext,
} from "../../products/domain/productContext.js";
import { loadPackageHistory } from "../services/packageHistoryLoader.js";
import { openProductHistoryPanel } from "../events/productHistoryEvents.js";
import { createPopupActionGroups } from "../../map/popups/popupActionConfig.js";
import {
  createPackageHarness,
  emptyHistory,
  deferred,
} from "../tests/packageHistoryTestSupport.js";

// Exercise the public owner and real renderers without external component code.
const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const renderer = (
  await readFile(new URL("./productHistoryRenderers.js", import.meta.url), "utf8")
).replace(/import "@esri[^;]+;/, "");
let source = (await readFile(new URL("./productHistoryPanel.js", import.meta.url), "utf8"))
  .replace(/import "@esri[^;]+;/, "")
  .replace(
    /import \{ watch \} from "@arcgis[^;]+;/,
    "const watch = () => { throw new Error('Inject watcher'); };"
  );
source = source.replace(
  /from "(\.[^"]+)"/g,
  (_, path) =>
    `from "${path === "./productHistoryRenderers.js" ? moduleUrl(renderer) : new URL(path, import.meta.url).href}"`
);
const { initProductHistoryPanel } = await import(moduleUrl(source));
class Element extends EventTarget {
  constructor(tag) {
    super();
    this.tagName = tag;
    this.children = [];
    this.attributes = new Map();
    this.hidden = false;
    this.textContent = "";
  }
  append(...children) {
    this.children.push(...children);
    children.forEach((child) => {
      child.parent = this;
    });
  }
  appendChild(child) {
    this.append(child);
    return child;
  }
  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }
  setAttribute(key, value) {
    this.attributes.set(key, String(value));
  }
  getAttribute(key) {
    return this.attributes.get(key);
  }
  toggleAttribute(key, value) {
    if (value) this.setAttribute(key, "");
    else this.attributes.delete(key);
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
  }
  querySelector(selector) {
    return walk(this).find((element) => element !== this && element.tagName === selector) ?? null;
  }
}
const walk = (element) => [element, ...element.children.flatMap(walk)];
const text = (element) => [element.textContent, ...element.children.map(text)].join(" ");
const find = (root, name) => walk(root).find((element) => element.className === name);
const settle = () => new Promise((resolve) => setImmediate(resolve));
async function harness(t, options = {}) {
  const h = createPackageHarness();
  const context = (await h.workUnitService.resolveWorkUnit(h.names.s101)).product;
  const layer = { appSourceDefinition: h.registry.byId.get("s101"), graphics: [] };
  const graphic = { layer, attributes: createProductContextIdentityAttributes(context) };
  registerGraphicProductContext(graphic, context);
  layer.graphics.push(graphic);
  const oldDocument = globalThis.document,
    oldFrame = globalThis.requestAnimationFrame;
  const doc = new EventTarget();
  doc.body = new Element("body");
  doc.createElement = (tag) => new Element(tag);
  doc.createDocumentFragment = () => new Element("fragment");
  globalThis.document = doc;
  const frames = [];
  globalThis.requestAnimationFrame = (callback) => frames.push(callback);
  const watchers = [],
    notices = [],
    calls = [];
  let click;
  const view = {
    popup: { visible: true, selectedFeature: graphic },
    map: { allLayers: [layer] },
    on: (_, callback) => {
      click = callback;
      return { remove() {} };
    },
  };
  const state = { enabled: true, generation: 1 };
  const watchPopup = (read, callback) => {
    const entry = { read, callback, value: read() };
    watchers.push(entry);
    return {
      remove() {
        entry.removed = true;
      },
    };
  };
  const fetchHistory =
    options.fetchHistory ??
    (async (name, args) => {
      calls.push([name, args]);
      return emptyHistory(name);
    });
  const panel = initProductHistoryPanel({
    view,
    registry: h.registry,
    dataSourceController: { getState: () => state },
    watchPopup,
    notifyError: (...args) => notices.push(args),
    fetchHistory,
    loadPackage:
      options.loadPackage ?? ((name, args) => loadPackageHistory(name, { ...h, ...args })),
  });
  const root = doc.body.children[0];
  t.after(() => {
    panel.destroy();
    globalThis.document = oldDocument;
    globalThis.requestAnimationFrame = oldFrame;
  });
  return {
    ...h,
    context,
    graphic,
    layer,
    state,
    panel,
    root,
    view,
    notices,
    calls,
    tick() {
      for (const entry of watchers) {
        const value = entry.read();
        if (!entry.removed && value !== entry.value) {
          entry.value = value;
          entry.callback(value);
        }
      }
    },
    mapClick() {
      click();
      frames.splice(0).forEach((callback) => callback());
    },
  };
}
const pin = (h) => find(h.root, "pc-product-history-panel__pin").dispatchEvent(new Event("click"));

test("one canonical panel, exact ordered sections and independently collapsed real event details", async (t) => {
  const h = await harness(t, {
    fetchHistory: async (name) =>
      emptyHistory(name, {
        events: [
          {
            id: name,
            title: name,
            timestamp: "2026-10-08T08:00:00Z",
            actor: name,
            details: [{ label: "Edition", value: name }],
          },
        ],
      }),
  });
  await h.panel.openHistory(h.names.s101);
  assert.equal(document.body.children.length, 1);
  assert.equal(find(h.root, "pc-product-history-panel__title").textContent, h.names.s101);
  assert.deepEqual(
    walk(h.root)
      .filter((e) => e.className === "pc-product-history-member__heading")
      .map((e) => e.textContent),
    [`S-101 · ${h.names.s101}`, `S-57 · ${h.names.s57}`]
  );
  const details = walk(h.root).filter(
    (e) => e.className === "pc-product-history-list__details-panel"
  );
  assert.equal(details.length, 2);
  assert.ok(details.every((e) => e.hidden));
  walk(h.root)
    .find((e) => e.className === "pc-product-history-list__summary")
    .dispatchEvent(new Event("click"));
  assert.equal(details[0].hidden, false);
  assert.equal(details[1].hidden, true);
});
test("actual Tools action captures context and sends one explicit read per member", async (t) => {
  const h = await harness(t);
  createPopupActionGroups({ graphic: h.graphic, productContext: h.context })
    .flat()
    .find((g) => g.id === "tools")
    .items.find((i) => i.id === "history")
    .onClick({ anchorElement: { isConnected: true } });
  await settle();
  assert.deepEqual(
    h.calls.map(([name]) => name),
    [h.names.s101, h.names.s57]
  );
});
test("ordinary compatibility context retains one exact explicit read", async (t) => {
  const h = await harness(t);
  const context = createCompatibilityWorkspaceProductContext("Ordinary");
  await h.panel.openHistory("Ordinary", { source: "external", productContext: context });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][1].productContext, context);
  assert.equal(walk(h.root).filter((e) => e.className === "pc-product-history-member").length, 0);
});
test("missing explicit source context never uses compatibility fallback", async (t) => {
  const h = await harness(t);
  await h.panel.openHistory("Missing", { source: "external" });
  assert.equal(h.calls.length, 0);
  assert.equal(h.notices.length, 1);
});
for (const end of [
  "close",
  "close-button",
  "destroy",
  "popup-close",
  "unrelated-selection",
  "map-click",
]) {
  test(`${end} revokes pending resolution without resurrection or stale notice`, async (t) => {
    const gate = deferred();
    const h = await harness(t, { loadPackage: () => gate.promise });
    const pending = h.panel.openHistory(h.names.s101);
    if (end === "close") h.panel.close();
    if (end === "close-button")
      find(h.root, "pc-product-history-panel__close").dispatchEvent(new Event("click"));
    if (end === "destroy") h.panel.destroy();
    if (end === "popup-close") {
      h.view.popup.visible = false;
      h.tick();
    }
    if (end === "unrelated-selection") {
      h.view.popup.selectedFeature = null;
      h.tick();
    }
    if (end === "map-click") {
      h.view.popup.visible = false;
      h.mapClick();
    }
    gate.reject(new Error("Obsolete"));
    await pending;
    assert.equal(h.root.hidden, true);
    assert.equal(h.root.attributes.has("aria-busy"), false);
    assert.equal(h.notices.length, 0);
  });
}
for (const sequence of [
  ["A", "B"],
  ["A", "B", "A"],
  ["A", "A", "A"],
]) {
  test(`${sequence.join(" -> ")} rejects all superseded successful and failed reads`, async (t) => {
    const gates = [];
    const h = await harness(t, {
      fetchHistory: () => {
        const gate = deferred();
        gates.push(gate);
        return gate.promise;
      },
    });
    const pending = sequence.map((name) =>
      h.panel.openHistory(name, {
        source: "external",
        productContext: createCompatibilityWorkspaceProductContext(name),
      })
    );
    assert.equal(gates.length, sequence.length);
    gates.at(-1).resolve(emptyHistory(sequence.at(-1)));
    await pending.at(-1);
    const accepted = text(h.root);
    gates
      .slice(0, -1)
      .forEach((gate, i) =>
        i % 2 ? gate.resolve(emptyHistory("Old")) : gate.reject(new Error("Stale"))
      );
    await Promise.all(pending);
    assert.equal(text(h.root), accepted);
    assert.equal(h.notices.length, 0);
  });
}
for (const change of [
  "deactivate",
  "generation",
  "layer-replacement",
  "definition-replacement",
  "graphic-removal",
  "mapping-change",
]) {
  for (const pinned of [false, true]) {
    test(`${change} blocks pending member publication (${pinned ? "pinned" : "unpinned"})`, async (t) => {
      const gate = deferred();
      const h = await harness(t, {
        fetchHistory: async (name) => {
          await gate.promise;
          return emptyHistory(name);
        },
      });
      const pending = h.panel.openHistory(h.names.s101);
      await settle();
      if (pinned) pin(h);
      if (change === "deactivate") h.state.enabled = false;
      if (change === "generation") h.state.generation++;
      if (change === "layer-replacement") h.view.map.allLayers = [];
      if (change === "definition-replacement") h.layer.appSourceDefinition = {};
      if (change === "graphic-removal") h.layer.graphics = [];
      if (change === "mapping-change")
        h.graphic.attributes = { ...h.graphic.attributes, workUnitMetadata: { changed: true } };
      gate.resolve();
      await pending;
      assert.equal(h.root.hidden, true);
      assert.equal(h.notices.length, 0);
    });
  }
}
test("same-identity popup rerender preserves unpinned panel; accepted pinned snapshot survives source removal", async (t) => {
  const h = await harness(t);
  await h.panel.openHistory(h.names.s101);
  const replacement = { layer: h.layer, attributes: h.graphic.attributes };
  registerGraphicProductContext(replacement, h.context);
  h.layer.graphics.push(replacement);
  h.view.popup.selectedFeature = replacement;
  h.tick();
  assert.equal(h.root.hidden, false);
  pin(h);
  const accepted = text(h.root);
  h.view.popup.visible = false;
  h.view.popup.selectedFeature = null;
  h.state.enabled = false;
  h.tick();
  h.mapClick();
  assert.equal(h.root.hidden, false);
  assert.equal(text(h.root), accepted);
});
test("new open supersedes pending pinned content even after original popup closes", async (t) => {
  const gate = deferred();
  const h = await harness(t, { loadPackage: () => gate.promise });
  const pending = h.panel.openHistory(h.names.s101);
  pin(h);
  h.view.popup.visible = false;
  h.view.popup.selectedFeature = null;
  h.tick();
  await h.panel.openHistory("New", {
    source: "external",
    productContext: createCompatibilityWorkspaceProductContext("New"),
  });
  gate.reject(new Error("Old"));
  await pending;
  assert.equal(find(h.root, "pc-product-history-panel__title").textContent, "New");
  assert.equal(h.notices.length, 0);
});
test("obsolete captured popup action cannot borrow another selection", async (t) => {
  const h = await harness(t);
  h.view.popup.selectedFeature = null;
  openProductHistoryPanel(h.names.s101, { productContext: h.context, graphic: h.graphic });
  await settle();
  assert.equal(h.calls.length, 0);
  assert.equal(h.root.hidden, true);
  assert.equal(h.notices.length, 0);
});

for (const state of ["empty", "unavailable", "rejected"]) {
  test(`visible ${state} member state preserves successful sibling summary and notices`, async (t) => {
    let secondary;
    const h = await harness(t, {
      fetchHistory: async (name) => {
        if (name === secondary) {
          if (state === "rejected") throw new Error("Member endpoint failed");
          return emptyHistory(name, {
            endpointAvailable: state !== "unavailable",
            warnings: ["Member note"],
          });
        }
        return emptyHistory(name, {
          events: [
            { id: "event", title: "Own event", timestamp: "2026-10-08T08:00:00Z", details: [] },
          ],
        });
      },
    });
    secondary = h.names.s57;
    await h.panel.openHistory(h.names.s101);
    assert.match(text(h.root), /Own event/);
    assert.match(
      text(h.root),
      state === "rejected"
        ? /Member endpoint failed/
        : state === "empty"
          ? /No historical changes found/
          : /Historical changes are not available yet/
    );
    assert.equal(h.notices.length, 0);
    if (state !== "rejected") assert.match(text(h.root), /Member note/);
  });
}
for (const sequence of [
  ["A", "B"],
  ["A", "B", "A"],
  ["A", "A", "A"],
]) {
  test(`package resolution ${sequence.join(" -> ")} starts no superseded member reads`, async (t) => {
    const gates = [];
    const h = await harness(t, {
      loadPackage: async (name, options) => {
        const gate = deferred();
        gates.push(gate);
        await gate.promise;
        options.assertCurrent();
        await Promise.all(
          [name, `${name} legacy`].map((datasetName) =>
            options.fetchHistory(datasetName, {
              productContext: { ...options.productContext, datasetName },
            })
          )
        );
        options.assertCurrent();
        return {
          datasetName: name,
          workUnit: { kind: "package" },
          members: [
            { label: "S-101", datasetName: name, history: emptyHistory(name) },
            {
              label: "S-57",
              datasetName: `${name} legacy`,
              history: emptyHistory(`${name} legacy`),
            },
          ],
        };
      },
    });
    const pending = sequence.map((name) =>
      h.panel.openHistory(name, {
        source: "external",
        productContext: { ...h.context, datasetName: name },
      })
    );
    gates.at(-1).resolve();
    await pending.at(-1);
    const accepted = text(h.root);
    gates.slice(0, -1).forEach((gate) => gate.resolve());
    await Promise.all(pending);
    assert.equal(text(h.root), accepted);
    assert.equal(h.notices.length, 0);
    assert.equal(h.calls.length, 2);
  });
}
for (const end of ["close", "destroy"]) {
  test(`${end} revokes pending real package member reads`, async (t) => {
    const gate = deferred();
    const h = await harness(t, {
      fetchHistory: async (name) => {
        await gate.promise;
        return emptyHistory(name);
      },
    });
    const pending = h.panel.openHistory(h.names.s101);
    await settle();
    h.panel[end]();
    gate.resolve();
    await pending;
    assert.equal(h.root.hidden, true);
    assert.equal(h.notices.length, 0);
  });
}

test("existing Main-map Escape priority closes and revokes a pending package", async (t) => {
  const gate = deferred();
  const h = await harness(t, { loadPackage: () => gate.promise });
  const initMap = await readFile(new URL("../../../app/initMap.js", import.meta.url), "utf8");
  const keyboardSource = initMap.slice(
    initMap.indexOf("function bindMainMapKeyboardClose("),
    initMap.indexOf("function closePopupDropdownOnly(")
  );
  const keyboard = await import(
    moduleUrl(`
    const closePopupDropdownOnly = () => false;
    const closeNoticePanel = () => false;
    const hasVisibleElement = (selector) => selector === '#product-history-panel' && !document.body.children[0].hidden;
    export ${keyboardSource}
  `)
  );
  const remove = keyboard.bindMainMapKeyboardClose({ view: h.view, productHistoryPanel: h.panel });
  const pending = h.panel.openHistory(h.names.s101);
  const event = new Event("keydown", { cancelable: true });
  Object.defineProperty(event, "key", { value: "Escape" });
  document.dispatchEvent(event);
  remove();
  assert.equal(event.defaultPrevented, true);
  gate.reject(new Error("Obsolete"));
  await pending;
  assert.equal(h.root.hidden, true);
  assert.equal(h.notices.length, 0);
});

test("loading and publication preserve application focus and accessible member landmarks", async (t) => {
  const h = await harness(t);
  const focus = new Element("button");
  document.activeElement = focus;
  await h.panel.openHistory(h.names.s101);
  assert.equal(document.activeElement, focus);
  const members = walk(h.root).filter((e) => e.className === "pc-product-history-member");
  members.forEach((member) =>
    assert.equal(member.getAttribute("aria-labelledby"), member.children[0].id)
  );
  assert.equal(h.root.attributes.has("aria-busy"), false);
});
