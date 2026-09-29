import test from "node:test";
import assert from "node:assert/strict";
import { createJobsPanelActions } from "./createJobsPanelActions.js";

function fixture(initiallyOpen = false) {
  let open = initiallyOpen;
  const calls = { reset: 0, prepareOpen: 0, prepareClose: 0, setOpen: [] };
  const actions = createJobsPanelActions({
    isOpen: () => open,
    resetContext() {
      calls.reset++;
    },
    prepareOpen() {
      calls.prepareOpen++;
    },
    prepareClose() {
      calls.prepareClose++;
    },
    setOpen(value) {
      calls.setOpen.push(value);
      open = value;
    },
  });
  return { actions, calls, isOpen: () => open };
}

test("Explicit Jobs open intent opens a previously closed panel exactly once", () => {
  const f = fixture(false);
  f.actions.open();
  assert.equal(f.isOpen(), true);
  assert.deepEqual(f.calls, { reset: 1, prepareOpen: 1, prepareClose: 0, setOpen: [true] });
});

test("Explicit Jobs open intent keeps an existing panel open without the close branch", () => {
  const f = fixture(true);
  f.actions.open();
  assert.equal(f.isOpen(), true);
  assert.deepEqual(f.calls, { reset: 1, prepareOpen: 1, prepareClose: 0, setOpen: [true] });
});

test("Normal main-workflow Jobs action remains a toggle", () => {
  const f = fixture(false);
  f.actions.toggle();
  assert.equal(f.isOpen(), true);
  f.actions.toggle();
  assert.equal(f.isOpen(), false);
  assert.deepEqual(f.calls, { reset: 2, prepareOpen: 1, prepareClose: 1, setOpen: [true, false] });
});
