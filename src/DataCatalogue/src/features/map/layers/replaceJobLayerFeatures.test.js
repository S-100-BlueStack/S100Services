import assert from "node:assert/strict";
import test from "node:test";
import { replaceJobLayerFeatures } from "./replaceJobLayerFeatures.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createLayer({ queryResponse } = {}) {
  const edits = [];
  return {
    edits,
    async load() {},
    createQuery() {
      return {};
    },
    queryFeatures() {
      return queryResponse ?? Promise.resolve({ features: [{ attributes: { ObjectID: 1 } }] });
    },
    async applyEdits(edit) {
      edits.push(edit);
      return { addFeatureResults: [], deleteFeatureResults: [] };
    },
  };
}

test("stale layer query cannot submit edits", async () => {
  const query = deferred();
  let current = true;
  const layer = createLayer({ queryResponse: query.promise });
  const request = replaceJobLayerFeatures({
    layer,
    featureData: [{ id: "old" }],
    createGraphics: (data) => data,
    shouldApply: () => current,
  });

  current = false;
  query.resolve({ features: [] });
  await request;
  assert.deepEqual(layer.edits, []);
});

test("current snapshot replaces all previous features with fresh graphics", async () => {
  const layer = createLayer();
  await replaceJobLayerFeatures({
    layer,
    featureData: [{ id: "new" }],
    createGraphics: (data) => data,
  });

  assert.equal(layer.edits.length, 1);
  assert.deepEqual(layer.edits[0].deleteFeatures, [{ attributes: { ObjectID: 1 } }]);
  assert.deepEqual(layer.edits[0].addFeatures, [{ id: "new" }]);
});

test("edit failures are surfaced and never silently treated as success", async () => {
  const layer = createLayer();
  layer.applyEdits = async () => ({ addFeatureResults: [{ error: { message: "Rejected" } }] });

  await assert.rejects(
    replaceJobLayerFeatures({ layer, featureData: [], createGraphics: (data) => data }),
    /Rejected/
  );
});
