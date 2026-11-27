import assert from "node:assert/strict";
import test from "node:test";

import { appendIcEncReportViewerAction } from "../ui/icEncReportViewerAction.js";
import { openIcEncReportViewer } from "../ui/icEncReportViewer.js";

const artifactFor = (datasetName, digit) => {
  const id = `${digit}1111111-1111-1111-1111-111111111111`;
  const url = `/electronicproducts/${datasetName}/artifacts/${id}`;
  return {
    id,
    datasetName,
    url,
    originalReportUrl: url,
    kind: "IcEncReport",
    fileName: "Report.DOC",
  };
};
const artifact = artifactFor("SAMPLE57", "1");
const next = artifactFor("SAMPLE101", "2");
const settle = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => Promise.withResolvers();
const tree = (node) => [node, ...node.children.flatMap(tree)];
const report = (text) => ({ metadata: [], blocks: [{ type: "paragraph", text }], partial: false });

function harness() {
  const view = new EventTarget();
  view.navigation = new EventTarget();
  view.location = { href: "https://catalogue.invalid/analyze" };
  view.setTimeout = setTimeout;
  view.clearTimeout = clearTimeout;
  class Node extends EventTarget {
    constructor(tag) {
      super();
      this.tag = tag;
    }
    ownerDocument = document;
    children = [];
    dataset = {};
    textContent = "";
    attributes = {};
    append(...nodes) {
      for (const node of nodes) {
        this.children.push(node);
        node.parent = this;
      }
    }
    appendChild(node) {
      this.append(node);
      return node;
    }
    replaceChildren(...nodes) {
      this.children = [];
      this.append(...nodes);
    }
    remove() {
      this.parent.children = this.parent.children.filter((node) => node !== this);
      this.parent = null;
    }
    get isConnected() {
      return this === document.body || Boolean(this.parent?.isConnected);
    }
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
    contains(node) {
      return tree(this).includes(node);
    }
    getClientRects() {
      return this.isConnected ? [this.getBoundingClientRect()] : [];
    }
    getBoundingClientRect() {
      return { left: 10, right: 150, top: 10, bottom: 150 };
    }
    focus() {
      document.activeElement = this;
    }
    showModal() {
      this.open = true;
      tree(this)
        .find((node) => node.autofocus)
        ?.focus();
    }
    close() {
      this.open = false;
    }
    click() {
      this.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    }
  }
  const document = {
    defaultView: view,
    createElement: (tag) => new Node(tag),
    createDocumentFragment: () => new Node("fragment"),
    querySelector() {
      return tree(document.body).find(
        (node) =>
          node.open && node.tag === "dialog" && !node.className?.includes("pc-icenc-report-dialog")
      );
    },
    querySelectorAll() {
      return tree(document.body).filter((node) => node.dataset.icEncReportKey);
    },
  };
  document.body = new Node("body");
  const container = new Node("section");
  document.body.append(container);
  return {
    document,
    view,
    trigger(item = artifact, options) {
      appendIcEncReportViewerAction(container, item, item.datasetName, item.url, options);
      return container.children.at(-1);
    },
    modal: () => tree(document.body).find((node) => node.tag === "dialog"),
  };
}

function mouseEvent(type, x) {
  return Object.assign(new Event(type), {
    button: 0,
    isPrimary: true,
    clientX: x,
    clientY: x,
    detail: 1,
  });
}

test("activation is lazy, repeated clicks share one request, and Escape restores focus", async () => {
  const h = harness();
  const module = deferred();
  const bytes = deferred();
  let imports = 0;
  let requests = 0;
  let signal;
  const trigger = h.trigger(artifact, {
    open: (verified, button) =>
      openIcEncReportViewer(verified, button, {
        loadDocument() {
          imports++;
          return module.promise;
        },
        loadBytes(selected, options) {
          assert.equal(selected.id, artifact.id);
          requests++;
          signal = options.signal;
          return bytes.promise;
        },
      }),
  });
  assert.equal(imports, 0);
  trigger.click();
  const modal = h.modal();
  assert.equal(h.document.activeElement.textContent, "Close");
  assert.equal(tree(modal).find((node) => node.tag === "a").href, artifact.url);
  trigger.click();
  module.resolve({ readIcEncReportDocument: async () => report("Literal <empty> and </Message>") });
  await settle();
  assert.equal(imports, 1);
  assert.equal(requests, 1);
  const escape = Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" });
  h.view.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true);
  assert.equal(h.modal(), undefined);
  assert.equal(h.document.activeElement, trigger);
  assert.ok(signal.aborted);
  bytes.resolve(new Uint8Array());
  await settle();
  assert.ok(!tree(modal).some((node) => node.textContent.includes("Literal")));
});

test("a replacement artifact owns publication and a stale lazy import cannot request bytes", async () => {
  const h = harness();
  const previous = deferred();
  let requests = 0;
  openIcEncReportViewer(artifact, h.trigger(), {
    loadDocument: () => previous.promise,
    loadBytes: async () => {
      requests++;
    },
  });
  const older = h.modal();
  openIcEncReportViewer(next, h.trigger(next), {
    loadDocument: async () => ({
      readIcEncReportDocument: async () => report("<img onerror='text'>"),
    }),
    loadBytes: async (selected) => {
      assert.equal(selected.id, next.id);
      requests++;
    },
  });
  previous.resolve({ readIcEncReportDocument: async () => report("Obsolete") });
  await settle();
  assert.equal(requests, 1);
  assert.equal(older.isConnected, false);
  const modal = h.modal();
  const literal = tree(modal).find((node) => node.textContent.includes("<img"));
  assert.equal(literal.tag, "p");
  assert.equal(literal.children.length, 0);
  h.view.dispatchEvent(new Event("pagehide"));
  assert.equal(h.modal(), undefined);
});

test("backdrop ignores drag, proper outside click closes, and navigation retires the session", async () => {
  const h = harness();
  const trigger = h.trigger();
  const options = { loadDocument: () => new Promise(() => {}) };
  openIcEncReportViewer(artifact, trigger, options);
  const modal = h.modal();
  modal.dispatchEvent(mouseEvent("pointerdown", 50));
  modal.dispatchEvent(mouseEvent("click", 2));
  assert.equal(h.modal(), modal);
  modal.dispatchEvent(mouseEvent("pointerdown", 2));
  modal.dispatchEvent(mouseEvent("click", 2));
  assert.equal(h.modal(), undefined);
  assert.equal(h.document.activeElement, trigger);

  openIcEncReportViewer(artifact, trigger, options);
  h.view.location.href += "?changed";
  h.view.navigation.dispatchEvent(new Event("currententrychange"));
  assert.equal(h.modal(), undefined);
});

test("unreadable preview keeps the authorized download and restores a unique replaced action", async () => {
  const h = harness();
  const trigger = h.trigger();
  openIcEncReportViewer(artifact, trigger, {
    loadDocument: async () => {
      throw new Error("Chunk failed");
    },
  });
  await settle();
  const modal = h.modal();
  assert.ok(tree(modal).some((node) => node.textContent.startsWith("Preview unavailable")));
  assert.equal(tree(modal).find((node) => node.tag === "a").href, artifact.url);
  trigger.remove();
  const replacement = h.trigger();
  tree(modal)
    .find((node) => node.textContent === "Close")
    .click();
  assert.equal(h.document.activeElement, replacement);
});

test("removing the selected Product action retires pending extraction", async () => {
  const h = harness();
  let notify;
  let disconnected = false;
  h.view.MutationObserver = class {
    constructor(callback) {
      notify = callback;
    }
    observe() {}
    disconnect() {
      disconnected = true;
    }
  };

  const trigger = h.trigger();
  const pending = deferred();
  let activeSignal;
  openIcEncReportViewer(artifact, trigger, {
    loadDocument: async () => ({
      readIcEncReportDocument: (_bytes, { signal }) => {
        activeSignal = signal;
        return pending.promise;
      },
    }),
    loadBytes: async () => new Uint8Array(),
  });
  await settle();
  const modal = h.modal();
  trigger.remove();
  h.trigger(next);
  notify([{ type: "childList" }]);
  assert.ok(activeSignal.aborted);
  assert.ok(disconnected);
  assert.equal(h.modal(), undefined);
  pending.resolve(report("No longer selected"));
  await settle();
  assert.ok(!tree(modal).some((node) => node.textContent === "No longer selected"));
});
