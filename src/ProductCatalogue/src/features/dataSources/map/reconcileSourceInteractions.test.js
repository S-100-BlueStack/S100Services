import assert from "node:assert/strict";
import test from "node:test";
import { reconcileSourceInteractions } from "./reconcileSourceInteractions.js";

function setup({ visible = true, sourceId = "s57", identity = "s57:P" } = {}) {
  const selectedFeature = { attributes: { sourceId, productIdentityKey: identity } };
  const replacement = { attributes: { sourceId: "s57", productIdentityKey: "s57:P" } };
  const calls = [];
  const popup = {
    visible,
    selectedFeature,
    location: { x: 10, y: 56 },
    open: (options) => calls.push(options),
    close: () => calls.push("close"),
  };
  return {
    popup,
    replacement,
    calls,
    run: () =>
      reconcileSourceInteractions({
        sourceId: "s57",
        layers: [{ graphics: [replacement] }],
        view: { popup },
      }),
  };
}

test("source refresh transfers only the currently open stable selection", () => {
  const state = setup();
  state.run();
  assert.deepEqual(state.calls, [
    { features: [state.replacement], location: state.popup.location },
  ]);
});

test("source refresh cannot reopen closed sessions or replace another source selection", () => {
  for (const options of [{ visible: false }, { sourceId: "s101" }]) {
    const state = setup(options);
    state.run();
    assert.deepEqual(state.calls, []);
  }
});

test("missing or filtered refreshed products close the old selection", () => {
  const missing = setup({ identity: "s57:REMOVED" });
  missing.run();
  assert.deepEqual(missing.calls, ["close"]);
  const filtered = setup();
  filtered.replacement.visible = false;
  filtered.run();
  assert.deepEqual(filtered.calls, ["close"]);
});
