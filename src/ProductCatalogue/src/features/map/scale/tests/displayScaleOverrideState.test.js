import assert from "node:assert/strict";
import test from "node:test";

const values = new Map();
const localStorage = {
  getItem(key) {
    return values.has(key) ? values.get(key) : null;
  },
  setItem(key, value) {
    values.set(key, String(value));
  },
  removeItem(key) {
    values.delete(key);
  },
};

globalThis.window = { localStorage };
globalThis.document = new EventTarget();

const state = await import("../displayScaleOverrideState.js");
const persistence = await import("../../../preferences/state/preferencePersistenceState.js");

const storageKey = "pc.displayScale.hidingDisabled";
const persistenceKey = persistence.PREFERENCE_PERSISTENCE_KEY.DISPLAY_SCALE_OVERRIDE;

test("explicit Scale hiding changes follow the existing persistence lifecycle", () => {
  assert.equal(state.isDisplayScaleHidingDisabled(), true);
  assert.equal(localStorage.getItem(storageKey), null);

  state.setDisplayScaleHidingDisabled(false, { source: "manual" });
  assert.equal(state.isDisplayScaleHidingDisabled(), false);
  assert.equal(localStorage.getItem(storageKey), "false");

  persistence.setPreferencePersistenceEnabled(persistenceKey, false);
  assert.equal(localStorage.getItem(storageKey), null);

  state.setDisplayScaleHidingDisabled(true, { source: "manual" });
  assert.equal(state.isDisplayScaleHidingDisabled(), true);
  assert.equal(localStorage.getItem(storageKey), null);

  state.setDisplayScaleHidingDisabled(false, { source: "manual" });
  persistence.setPreferencePersistenceEnabled(persistenceKey, true);
  assert.equal(localStorage.getItem(storageKey), "false");
});

test("Scale hiding reset removes the explicit value and returns to off", () => {
  state.resetDisplayScaleHidingPreference();

  assert.equal(state.isDisplayScaleHidingDisabled(), true);
  assert.equal(localStorage.getItem(storageKey), null);
});
