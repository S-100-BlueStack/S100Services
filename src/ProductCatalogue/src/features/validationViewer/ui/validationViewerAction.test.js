import assert from "node:assert/strict";
import test from "node:test";
import { createValidationViewerAction } from "./validationViewerAction.js";

const id = "12345678-1234-1234-1234-123456789abc";
const artifact = {
  id,
  fileName: "Harbour.vld",
  datasetName: "Harbour",
  kind: "ValidationDiagnostic",
  url: `/electronicproducts/Harbour/artifacts/${id}`,
};
function harness() {
  const events = new Map();
  const document = {
    defaultView: {
      location: { href: "https://example.invalid/review" },
      addEventListener: (name, handler) => events.set(name, handler),
      removeEventListener: (name, handler) => {
        if (events.get(name) === handler) events.delete(name);
      },
    },
    createElement() {
      const listeners = new Map();
      return {
        dataset: {},
        attributes: new Map(),
        isConnected: true,
        setAttribute(name, value) { this.attributes.set(name, value); },
        removeAttribute(name) { this.attributes.delete(name); },
        addEventListener: (name, listener) => listeners.set(name, listener),
        click: () => listeners.get("click")({ stopPropagation() {} }),
      };
    },
  };
  const calls = [];
  const deferred = [];
  function loadViewer() {
    return new Promise((resolve) => deferred.push(() => resolve({
      openValidationViewer: (report, button) => calls.push({ report, button }),
    })));
  }
  return { document, events, calls, deferred, loadViewer };
}

test("viewer loads lazily and repeated activation opens only the exact selected artifact", async () => {
  const h = harness();
  const action = createValidationViewerAction(artifact, "Harbour", { ownerDocument: h.document, loadViewer: h.loadViewer });
  assert.equal(h.deferred.length, 0);
  const first = action.click();
  await action.click();
  assert.equal(h.deferred.length, 1);
  h.deferred[0]();
  await first;
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].report.id, id);
  assert.equal(h.calls[0].button, action);
  assert.equal(action.attributes.has("aria-busy"), false);
  assert.equal(h.events.size, 0);
});

test("detached controls, navigation, pagehide and superseded launch cannot open a viewer", async () => {
  for (const retire of [
    (action) => { action.isConnected = false; },
    (_action, h) => { h.document.defaultView.location.href += "?changed=1"; },
    (_action, h) => { h.events.get("pagehide")(); },
  ]) {
    const h = harness();
    const action = createValidationViewerAction(artifact, "Harbour", { ownerDocument: h.document, loadViewer: h.loadViewer });
    const pending = action.click();
    retire(action, h);
    h.deferred[0]();
    await pending;
    assert.equal(h.calls.length, 0);
  }
  const h = harness();
  const options = { ownerDocument: h.document, loadViewer: h.loadViewer };
  const first = createValidationViewerAction(artifact, "Harbour", options);
  const second = createValidationViewerAction({ ...artifact, fileName: "Other revision.vld" }, "Harbour", options);
  const older = first.click();
  const newer = second.click();
  h.deferred[1](); await newer;
  h.deferred[0](); await older;
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].report.fileName, "Other revision.vld");
});
