import assert from "node:assert/strict";
import test from "node:test";

function installDomEventGlobals() {
  globalThis.document = new EventTarget();

  if (typeof globalThis.CustomEvent !== "function") {
    globalThis.CustomEvent = class CustomEvent extends Event {
      constructor(type, options = {}) {
        super(type);
        this.detail = options.detail;
      }
    };
  }
}

test("identical external operation replacement does not emit another state change", async () => {
  installDomEventGlobals();

  const state = await import(
    `./productOperationState.js?test=${Date.now()}-${Math.random()}`
  );
  let changeCount = 0;
  const unsubscribe = state.onProductOperationStateChanged(() => {
    changeCount += 1;
  });
  const operation = {
    id: "job-1",
    datasetName: "101DK0040943E",
    type: state.PRODUCT_OPERATION_TYPE.EXPORT,
    label: "Exporting S100 Edition",
    source: "backend",
    startedAt: "2026-07-24T08:00:00Z",
    exportTarget: "S100",
    exportType: "Edition",
  };

  state.replaceExternalProductOperations(operation.datasetName, [operation]);
  state.replaceExternalProductOperations(operation.datasetName, [{ ...operation }]);

  assert.equal(changeCount, 1);

  state.replaceExternalProductOperations(operation.datasetName, [
    { ...operation, label: "Export queued" },
  ]);

  assert.equal(changeCount, 2);
  unsubscribe();
});
