import assert from "node:assert/strict";
import test from "node:test";
import { createJobHighlightController } from "./jobHighlight.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createHarness({ queryResponse, viewResponse } = {}) {
  const highlighted = [];
  const layer = {
    visible: true,
    createQuery: () => ({}),
    queryFeatures: () =>
      queryResponse ?? Promise.resolve({ features: [{ attributes: { ObjectID: 5 } }] }),
  };
  const layerView = {
    highlight(id) {
      highlighted.push(id);
      return { remove() {} };
    },
  };
  const controller = createJobHighlightController({
    view: { whenLayerView: () => viewResponse ?? Promise.resolve(layerView) },
    jobLayers: { pointLayer: layer },
  });
  return { controller, highlighted };
}

const selectedJob = { jobId: "one", geometryType: "point" };

test("clearing while query is pending prevents a late Job highlight", async () => {
  const query = deferred();
  const { controller, highlighted } = createHarness({ queryResponse: query.promise });
  const request = controller.highlightJob(selectedJob);

  controller.clearHighlight();
  query.resolve({ features: [{ attributes: { ObjectID: 5 } }] });
  await request;

  assert.deepEqual(highlighted, []);
});

test("clearing while LayerView lookup is pending prevents a late Job highlight", async () => {
  const view = deferred();
  const { controller, highlighted } = createHarness({ viewResponse: view.promise });
  const request = controller.highlightJob(selectedJob);

  await Promise.resolve();
  controller.clearHighlight();
  view.resolve({ highlight: (id) => highlighted.push(id) });
  await request;

  assert.deepEqual(highlighted, []);
});

test("destroy prevents pending and subsequent Job highlights", async () => {
  const query = deferred();
  const { controller, highlighted } = createHarness({ queryResponse: query.promise });
  const request = controller.highlightJob(selectedJob);

  controller.destroy();
  query.resolve({ features: [{ attributes: { ObjectID: 8 } }] });
  await request;
  await controller.highlightJob(selectedJob);

  assert.deepEqual(highlighted, []);
});
