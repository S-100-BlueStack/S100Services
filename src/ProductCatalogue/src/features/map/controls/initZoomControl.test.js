import assert from "node:assert/strict";
import test from "node:test";
import { initZoomControl } from "./initZoomControl.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fixture({ loadComponent = async () => {} } = {}) {
  const previousDocument = globalThis.document;
  const created = [];
  const added = [];
  const removed = [];
  const ready = [];
  globalThis.document = {
    createElement(tagName) {
      const completion = deferred();
      ready.push(completion);
      const element = {
        tagName,
        style: {},
        componentOnReady: () => completion.promise,
        remove() {
          this.removed = true;
        },
        destroy() {
          this.destroyed = true;
        },
      };
      created.push(element);
      return element;
    },
  };
  const view = {
    map: {},
    ui: {
      add(items) {
        added.push(...items);
      },
      remove(item) {
        removed.push(item);
      },
    },
  };
  return {
    created,
    ready,
    added,
    removed,
    view,
    init(options = {}) {
      return initZoomControl(view, { loadComponent, ...options });
    },
    async flush() {
      await new Promise((resolve) => setImmediate(resolve));
    },
    cleanup() {
      globalThis.document = previousDocument;
    },
  };
}

test("Zoom replaces the built-in widget only after its first component is ready", async () => {
  const f = fixture();
  try {
    const owner = f.init({ themeMode: "dark" });
    await f.flush();
    const zoom = f.created[0];
    assert.equal(zoom.tagName, "arcgis-zoom");
    assert.equal(zoom.view, f.view);
    assert.equal(zoom.className, "pc-map-zoom calcite-mode-dark");
    assert.equal(zoom.style.colorScheme, "dark");
    assert.equal(zoom.hidden, true);
    assert.equal(zoom.visualScale, "m");
    assert.deepEqual(f.added[0], { component: zoom, position: "top-left", index: 0 });
    assert.deepEqual(f.removed, [], "retain the original Zoom until replacement is ready");

    f.ready[0].resolve();
    await f.flush();
    assert.deepEqual(f.removed, ["zoom"]);
    assert.equal(zoom.hidden, false);

    owner.destroy();
    owner.destroy();
    assert.deepEqual(f.removed, ["zoom", zoom]);
    assert.equal(zoom.view, undefined);
    assert.equal(zoom.removed, true);
    assert.equal(zoom.destroyed, true);
  } finally {
    f.cleanup();
  }
});

test("Theme changes stage a fresh Zoom without removing the usable one prematurely", async () => {
  const f = fixture();
  try {
    const owner = f.init({ themeMode: "light" });
    await f.flush();
    const lightZoom = f.created[0];
    f.ready[0].resolve();
    await f.flush();

    owner.setThemeMode("dark");
    await f.flush();
    const darkZoom = f.created[1];
    assert.equal(darkZoom.className, "pc-map-zoom calcite-mode-dark");
    assert.equal(darkZoom.style.colorScheme, "dark");
    assert.equal(darkZoom.hidden, true);
    assert.equal(lightZoom.removed, undefined);
    assert.deepEqual(f.removed, ["zoom"]);

    // A redundant Theme publication must not churn controls or focus.
    owner.setThemeMode("dark");
    await f.flush();
    assert.equal(f.created.length, 2);

    f.ready[1].resolve();
    await f.flush();
    assert.equal(darkZoom.hidden, false);
    assert.equal(lightZoom.removed, true);
    assert.deepEqual(f.removed, ["zoom", lightZoom]);

    owner.setThemeMode("light");
    await f.flush();
    const restoredLightZoom = f.created[2];
    assert.equal(restoredLightZoom.className, "pc-map-zoom calcite-mode-light");
    assert.equal(darkZoom.removed, undefined);
    f.ready[2].resolve();
    await f.flush();
    assert.equal(darkZoom.removed, true);
    assert.equal(restoredLightZoom.hidden, false);
    assert.equal(f.removed.filter((item) => item === "zoom").length, 1);

    owner.destroy();
    assert.equal(restoredLightZoom.destroyed, true);
  } finally {
    f.cleanup();
  }
});

test("Rapid changes discard superseded Zoom startup and keep only the newest mode", async () => {
  const f = fixture();
  try {
    const owner = f.init();
    await f.flush();
    f.ready[0].resolve();
    await f.flush();
    const original = f.created[0];

    owner.setThemeMode("dark");
    await f.flush();
    const staleDark = f.created[1];
    owner.setThemeMode("light");
    assert.equal(staleDark.removed, true, "superseded UI is detached immediately");
    await f.flush();
    const currentLight = f.created[2];
    assert.equal(original.removed, undefined, "retain the last working control during load");

    f.ready[1].resolve();
    await f.flush();
    assert.equal(original.removed, undefined, "stale readiness cannot publish itself");
    f.ready[2].resolve();
    await f.flush();
    assert.equal(currentLight.hidden, false);
    assert.equal(original.removed, true);
    assert.deepEqual(f.removed, ["zoom", staleDark, original]);
    owner.destroy();
  } finally {
    f.cleanup();
  }
});

test("Theme switches during initial startup cannot remove the built-in Zoom early", async () => {
  const loading = deferred();
  const f = fixture({ loadComponent: () => loading.promise });
  try {
    const owner = f.init({ themeMode: "light" });
    owner.setThemeMode("dark");
    assert.deepEqual(f.removed, []);
    loading.resolve();
    await f.flush();
    assert.equal(f.created.length, 1);
    assert.equal(f.created[0].style.colorScheme, "dark");
    assert.deepEqual(f.removed, []);
    f.ready[0].resolve();
    await f.flush();
    assert.deepEqual(f.removed, ["zoom"]);
    owner.destroy();
  } finally {
    f.cleanup();
  }
});

test("A failed theme replacement preserves the last functional Zoom", async () => {
  const f = fixture();
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...message) => warnings.push(message);
  try {
    const owner = f.init();
    await f.flush();
    f.ready[0].resolve();
    await f.flush();
    const working = f.created[0];

    owner.setThemeMode("dark");
    await f.flush();
    const failed = f.created[1];
    f.ready[1].reject(new Error("not ready"));
    await f.flush();
    assert.equal(working.removed, undefined);
    assert.equal(failed.removed, true);
    assert.deepEqual(f.removed, ["zoom", failed]);
    assert.equal(warnings.length, 1);
    owner.destroy();
  } finally {
    console.warn = originalWarn;
    f.cleanup();
  }
});

test("Destroy retires a pending replacement and blocks its later completion", async () => {
  const f = fixture();
  try {
    const owner = f.init();
    await f.flush();
    f.ready[0].resolve();
    await f.flush();
    const original = f.created[0];
    owner.setThemeMode("dark");
    await f.flush();
    const pending = f.created[1];

    owner.destroy();
    f.ready[1].resolve();
    await f.flush();
    assert.equal(original.removed, true);
    assert.equal(pending.removed, true);
    assert.equal(pending.destroyed, true);
    assert.deepEqual(f.removed, ["zoom", pending, original]);
  } finally {
    f.cleanup();
  }
});

test("A failed component import preserves the built-in Zoom", async () => {
  const f = fixture({
    loadComponent: async () => {
      throw new Error("offline");
    },
  });
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...message) => warnings.push(message);
  try {
    const owner = f.init();
    await f.flush();
    assert.equal(f.created.length, 0);
    assert.deepEqual(f.removed, []);
    assert.equal(warnings.length, 1);
    owner.destroy();
  } finally {
    console.warn = originalWarn;
    f.cleanup();
  }
});

test("Destroy during initial readiness preserves the original Zoom widget", async () => {
  const f = fixture();
  try {
    const owner = f.init();
    await f.flush();
    const pending = f.created[0];
    owner.destroy();
    f.ready[0].resolve();
    await f.flush();
    assert.deepEqual(f.removed, [pending]);
    assert.equal(pending.destroyed, true);
  } finally {
    f.cleanup();
  }
});

test("No MapView UI leaves the application without a Zoom ownership side effect", () => {
  const owner = initZoomControl({});
  owner.setThemeMode("dark");
  owner.destroy();
});
