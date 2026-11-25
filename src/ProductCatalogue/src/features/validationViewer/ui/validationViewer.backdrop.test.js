import assert from "node:assert/strict";
import test from "node:test";
import { openValidationViewer } from "./validationViewer.js";

const artifact = {
  id: "12345678-1234-1234-1234-123456789abc",
  fileName: "Harbour.vld",
  datasetName: "Harbour",
  url: "/electronicproducts/Harbour/artifacts/12345678-1234-1234-1234-123456789abc",
};

function harness(t) {
  const requests = [];
  class Element extends EventTarget {
    children = [];
    attributes = new Map();
    dataset = {};
    open = false;
    isConnected = true;
    focused = false;
    setAttribute(name, value) { this.attributes.set(name, value); }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.append(node); return node; }
    replaceChildren(...nodes) { this.children = nodes; }
    getClientRects() { return [this.getBoundingClientRect()]; }
    getBoundingClientRect() { return { left: 10, top: 10, right: 100, bottom: 100 }; }
    focus() { this.focused = true; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    remove() { this.isConnected = false; }
  }
  const document = {
    body: new Element(),
    createElement: () => new Element(),
  };
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = document;
  globalThis.window = new EventTarget();
  const trigger = new Element();
  const session = openValidationViewer(artifact, trigger, {
    loadBytes: (_artifact, { signal }) => new Promise((resolve) => requests.push({ signal, resolve })),
  });
  t.after(() => {
    session.close();
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  });
  return { dialog: document.body.children[0], trigger, requests };
}

function pointer(dialog, type, values = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX: 2, clientY: 2, button: 0, isPrimary: true, detail: 1, ...values });
  dialog.dispatchEvent(event);
}

test("a backdrop click dismisses the modal, aborts its pending read and restores trigger focus", async (t) => {
  const { dialog, trigger, requests } = harness(t);
  pointer(dialog, "pointerdown");
  pointer(dialog, "click");
  assert.equal(dialog.open, false);
  assert.equal(dialog.isConnected, false);
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(trigger.focused, true);
  requests[0].resolve(new Uint8Array());
  await Promise.resolve();
  assert.equal(dialog.isConnected, false);
});

test("clicks inside the dialog, drags from either side, canceled presses and synthetic clicks do not dismiss it", (t) => {
  const { dialog, requests } = harness(t);
  const inside = { clientX: 50, clientY: 50 };
  pointer(dialog, "pointerdown", inside);
  pointer(dialog, "click", inside);
  pointer(dialog, "pointerdown", inside);
  pointer(dialog, "click");
  pointer(dialog, "pointerdown");
  pointer(dialog, "click", inside);
  pointer(dialog, "pointerdown");
  pointer(dialog, "pointercancel");
  pointer(dialog, "click");
  pointer(dialog, "pointerdown", { button: 2 });
  pointer(dialog, "click");
  pointer(dialog, "pointerdown");
  pointer(dialog, "click", { detail: 0 });
  assert.equal(dialog.open, true);
  assert.equal(requests[0].signal.aborted, false);
});
