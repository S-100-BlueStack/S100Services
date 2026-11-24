import test from "node:test";
import assert from "node:assert/strict";
import {
  createPackageGeometryOverlay,
  packageGeometryMessage,
} from "./createPackageGeometryOverlay.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

function fixture() {
  const requests = new Map();
  const published = [];
  const draws = [];
  const focused = [];
  let disposed = false;
  const overlay = createPackageGeometryOverlay({
    source: {
      load(id, { signal }) {
        const request = deferred();
        requests.set(id, { ...request, signal });
        return request.promise;
      },
    },
    renderer: {
      stop() {
        draws.push("stop");
      },
      clear() {
        draws.push("clear");
      },
      async prepare(data) {
        if (disposed) throw new Error("disposed");
        return { graphics: data.graphics ?? [], detailCount: data.detailCount ?? 0 };
      },
      replace(data) {
        draws.push(["replace", data.graphics]);
      },
      async focus(data, { shouldApply }) {
        if (shouldApply()) focused.push(data.graphics);
        return true;
      },
      destroy() {
        disposed = true;
      },
    },
    onStatus: (state) => published.push(state),
  });
  return { overlay, requests, published, draws, focused };
}

test("Out-of-order Package selections never publish the superseded geometry", async () => {
  const { overlay, requests, published, draws, focused } = fixture();
  const a = overlay.setPackage("A", { autoFocus: true });
  const b = overlay.setPackage("B", { autoFocus: true });
  assert.equal(requests.get("A").signal.aborted, true);
  requests.get("B").resolve({ aoi: {}, graphics: ["B"] });
  await b;
  requests.get("A").resolve({ aoi: {}, graphics: ["A"] });
  await a;
  assert.deepEqual(draws.filter(Array.isArray), [["replace", ["B"]]]);
  assert.deepEqual(focused, [["B"]]);
  assert.equal(published.at(-1).status, "ready");
});

test("Keep previous graphics during a new Package read, then atomically replace", async () => {
  const { overlay, requests, draws } = fixture();
  let pending = overlay.setPackage("A");
  requests.get("A").resolve({ aoi: {}, graphics: ["A"] });
  await pending;
  const count = draws.length;
  pending = overlay.setPackage("B");
  assert.equal(draws.length, count + 1); // Only stop; no clear while B is loading.
  assert.equal(draws.at(-1), "stop");
  requests.get("B").resolve({ aoi: {}, graphics: ["B"] });
  await pending;
  assert.deepEqual(draws.filter(Array.isArray), [
    ["replace", ["A"]],
    ["replace", ["B"]],
  ]);
});

test("Nullable detailed geometry and a genuinely absent AOI are valid empty states", async () => {
  const { overlay, requests, published, draws } = fixture();
  const pending = overlay.setPackage("A");
  requests.get("A").resolve({ aoi: null, detailedGeometry: null, graphics: [] });
  await pending;
  assert.equal(published.at(-1).status, "empty");
  assert.equal(published.at(-1).hasGeometry, false);
  assert.match(packageGeometryMessage(published.at(-1)), /No Package geometry/);
  assert.deepEqual(draws.filter(Array.isArray), [["replace", []]]);
});

test("Errors and destroyed overlays do not keep stale Packages or publish late updates", async () => {
  const { overlay, requests, published, draws } = fixture();
  const a = overlay.setPackage("A");
  requests.get("A").reject(new Error("Geometry returned 500"));
  await a;
  assert.equal(published.at(-1).status, "error");
  assert.match(packageGeometryMessage(published.at(-1)), /500/);
  assert.equal(draws.at(-1), "clear");
  const b = overlay.setPackage("B");
  const last = published.length;
  overlay.destroy();
  requests.get("B").resolve({ aoi: {}, graphics: ["late"] });
  await b;
  assert.equal(published.length, last);
  assert.equal(draws.filter(Array.isArray).length, 0);
});

test("Repeated Jobs context for the same Package does not issue duplicate reads", async () => {
  const { overlay, requests, draws } = fixture();
  const a = overlay.setPackage("A");
  const b = overlay.setPackage("A");
  requests.get("A").resolve({ aoi: {}, graphics: ["A"] });
  await Promise.all([a, b]);
  assert.equal(draws.filter(Array.isArray).length, 1);
  await overlay.setPackage(null);
  assert.equal(draws.at(-1), "clear");
});

test("A superseded ArcGIS preparation cannot publish or focus after a newer selection", async () => {
  const geometryReads = new Map();
  const preparations = new Map();
  const replaced = [];
  let focusCount = 0;
  const overlay = createPackageGeometryOverlay({
    source: {
      load(id) {
        const pending = deferred();
        geometryReads.set(id, pending);
        return pending.promise;
      },
    },
    renderer: {
      stop() {},
      clear() {},
      prepare(data, { shouldApply }) {
        const pending = deferred();
        preparations.set(data.id, { ...pending, shouldApply });
        return pending.promise;
      },
      replace(data) {
        replaced.push(data.id);
      },
      async focus() {
        focusCount++;
      },
      destroy() {},
    },
  });
  const first = overlay.setPackage("A", { autoFocus: true });
  geometryReads.get("A").resolve({ id: "A" });
  await Promise.resolve();
  assert.equal(preparations.has("A"), true);
  const second = overlay.setPackage("B", { autoFocus: true });
  geometryReads.get("B").resolve({ id: "B" });
  await Promise.resolve();
  preparations.get("B").resolve({ id: "B", graphics: [{}], detailCount: 0 });
  await second;
  assert.equal(preparations.get("A").shouldApply(), false);
  preparations.get("A").resolve({ id: "A", graphics: [{}], detailCount: 0 });
  await first;
  assert.deepEqual(replaced, ["B"]);
  assert.equal(focusCount, 1);
});
