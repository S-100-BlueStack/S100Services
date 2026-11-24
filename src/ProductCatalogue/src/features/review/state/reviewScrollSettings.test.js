import assert from "node:assert/strict";
import test from "node:test";

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};
globalThis.window = { localStorage: storage };
globalThis.document = new EventTarget();

const { PREFERENCE_PERSISTENCE_KEY, setPreferencePersistenceEnabled } =
  await import("../../preferences/state/preferencePersistenceState.js");
const { createReviewScrollSettings, REVIEW_SYNC_SCROLLING_STORAGE_KEY } =
  await import("./reviewScrollSettings.js");
const key = PREFERENCE_PERSISTENCE_KEY.REVIEW_SYNC_SCROLLING;
const storageKey = REVIEW_SYNC_SCROLLING_STORAGE_KEY;

function setup(t, initialValue = null, autoSave = true) {
  setPreferencePersistenceEnabled(key, autoSave);
  values.delete(storageKey);
  if (initialValue !== null) values.set(storageKey, initialValue);
  const settings = createReviewScrollSettings();
  t.after(() => settings.destroy());
  return settings;
}

test("scroll synchronization defaults off without writing a saved preference", (t) => {
  const settings = setup(t);
  assert.equal(settings.getValue(), false);
  assert.equal(values.has(storageKey), false);
  assert.equal(settings.setValue("true"), false);
  assert.equal(settings.setValue(false), false);
  assert.equal(values.has(storageKey), false);
});

test("valid saved on state is restored, malformed values and disabled Auto-save fail off", (t) => {
  for (const [saved, autoSave, expected] of [
    ["true", true, true],
    ["false", true, false],
    ["unexpected", true, false],
    ["true", false, false],
  ]) {
    const settings = setup(t, saved, autoSave);
    assert.equal(settings.getValue(), expected);
    assert.equal(values.get(storageKey), saved);
    settings.destroy();
  }
});

test("Auto-save off clears only stored state, on saves the current value, reset defaults to off", (t) => {
  const settings = setup(t);
  const changes = [];
  settings.subscribe((enabled) => changes.push(enabled));
  values.set("unrelated", "unchanged");
  assert.equal(settings.setValue(true), true);
  assert.equal(values.get(storageKey), "true");
  setPreferencePersistenceEnabled(key, false);
  assert.equal(values.has(storageKey), false);
  assert.equal(settings.getValue(), true);
  assert.deepEqual(changes, [true]);
  settings.setValue(false);
  assert.equal(values.has(storageKey), false);
  settings.setValue(true);
  setPreferencePersistenceEnabled(key, true);
  assert.equal(values.get(storageKey), "true");
  settings.reset();
  assert.equal(values.has(storageKey), false);
  assert.equal(settings.getValue(), false);
  assert.equal(values.get("unrelated"), "unchanged");
  assert.deepEqual(changes, [true, false, true, false]);
});

test("unsubscribe and disposal stop further publications and persistence writes", (t) => {
  const settings = setup(t);
  let count = 0;
  const unsubscribe = settings.subscribe(() => count++);
  settings.setValue(true);
  unsubscribe();
  settings.setValue(false);
  assert.equal(count, 1);
  settings.destroy();
  values.set(storageKey, "unrelated-session-value");
  setPreferencePersistenceEnabled(key, false);
  assert.equal(settings.setValue(true), false);
  settings.reset();
  assert.equal(values.get(storageKey), "unrelated-session-value");
  assert.equal(count, 1);
});

test("unavailable browser storage does not block the runtime control", (t) => {
  const previousStorage = window.localStorage;
  const previousWarn = console.warn;
  t.after(() => {
    window.localStorage = previousStorage;
    console.warn = previousWarn;
  });
  setPreferencePersistenceEnabled(key, true);
  window.localStorage = {
    getItem() {
      throw new Error("Storage unavailable");
    },
    setItem() {
      throw new Error("Storage unavailable");
    },
    removeItem() {
      throw new Error("Storage unavailable");
    },
  };
  console.warn = () => {};
  const settings = createReviewScrollSettings();
  t.after(() => settings.destroy());
  assert.equal(settings.getValue(), false);
  assert.equal(settings.setValue(true), true);
  assert.equal(settings.getValue(), true);
  settings.reset();
  assert.equal(settings.getValue(), false);
});
