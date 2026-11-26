import test from "node:test";
import assert from "node:assert/strict";
import { createPackageAoiOverview } from "./createPackageAoiOverview.js";
import { MAP_LABEL_STYLES } from "../labels/createMapLabelLayers.js";

function fixture({ pages } = {}) {
  const calls = [];
  const map = {
    layers: [],
    add(layer, index = this.layers.length) {
      this.layers.splice(index, 0, layer);
      calls.push(`add:${index}`);
    },
    remove(layer) {
      this.layers = this.layers.filter((entry) => entry !== layer);
      calls.push("remove");
    },
  };
  const view = {
    map,
    ui: {
      add() {
        calls.push("unexpected-ui");
      },
    },
  };
  class GraphicsLayer {
    constructor() {
      this.graphics = [];
      this.visible = true;
      this.replacements = 0;
    }
    addMany(graphics) {
      this.graphics.push(...graphics);
      this.replacements++;
    }
    removeAll() {
      this.graphics = [];
    }
    destroy() {
      calls.push("destroy-layer");
    }
  }
  class FeatureLayer {
    constructor(options) {
      Object.assign(this, options);
    }
    destroy() {
      this.destroyed = true;
    }
  }
  class Graphic {
    constructor(value) {
      Object.assign(this, value);
    }
  }
  const catalogue = {
    async packageGeometries(args) {
      calls.push(`page:${args.pipelineId}:${args.hasPipeline}`);
      return (
        pages?.(args) ?? {
          page: 0,
          total: 1,
          items: [{ packageId: `assigned-${args.pipelineId}`, aoi: { rings: [] } }],
        }
      );
    },
  };
  const errors = [];
  const overview = createPackageAoiOverview({
    catalogue,
    loadSdk: async () => ({
      GraphicsLayer,
      FeatureLayer,
      Graphic,
      Polygon: { fromJSON: (aoi) => aoi },
    }),
    onError: (error) => errors.push(error),
  });
  return { calls, view, map, catalogue, overview, errors };
}

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((done) => setImmediate(done));
}

test("Main Map draws only assigned AOIs for the selected Pipeline, without a Layers control", async () => {
  const state = fixture();
  state.map.layers.push({ id: "workspace-overlays" });
  state.overview.setView(state.view);
  await flush();
  assert.equal(state.map.layers.length, 1);
  assert.equal(
    state.calls.some((item) => item.startsWith("page")),
    false
  );
  state.overview.setPipelineId("enc");
  await flush();
  assert.deepEqual(
    state.calls.filter((item) => item.startsWith("page")),
    ["page:enc:true"]
  );
  assert.equal(state.calls.includes("unexpected-ui"), false);
  assert.equal(state.map.layers[0].graphics[0].attributes.overviewPackageId, "assigned-enc");
  assert.equal(state.map.layers[1].id, "workspace-overlays");
  state.overview.setPipelineId(null);
  assert.equal(state.map.layers[0].visible, false);
  state.overview.destroy();
  assert.equal(state.map.layers.length, 1);
});

test("switching Pipelines hides old AOIs until the new scoped read succeeds", async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const state = fixture({
    pages: ({ pipelineId, page }) =>
      pipelineId === "paper"
        ? pending
        : {
            page,
            total: 1,
            items: [{ packageId: "enc-only", aoi: {} }],
          },
  });
  state.overview.setView(state.view);
  state.overview.setPipelineId("enc");
  await flush();
  state.overview.setPipelineId("paper");
  assert.equal(state.map.layers[0].visible, false);
  release({ page: 0, total: 1, items: [{ packageId: "paper-only", aoi: {} }] });
  await flush();
  assert.equal(state.map.layers[0].visible, true);
  assert.equal(state.map.layers[0].graphics[0].attributes.overviewPackageId, "paper-only");
  state.overview.destroy();
});

test("superseded Pipeline AOIs cannot publish after switching or teardown", async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const state = fixture({
    pages: ({ pipelineId, page }) =>
      pipelineId === "enc"
        ? pending
        : {
            page,
            total: 1,
            items: [{ packageId: "new", aoi: {} }],
          },
  });
  state.overview.setView(state.view);
  state.overview.setPipelineId("enc");
  await flush();
  state.overview.setPipelineId("paper");
  release({ page: 0, total: 1, items: [{ packageId: "old", aoi: {} }] });
  await flush();
  assert.equal(state.map.layers[0].graphics[0].attributes.overviewPackageId, "new");
  state.overview.destroy();
  assert.equal(state.map.layers.length, 0);
});

test("changing MapView aborts an older geometry generation", async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  let reads = 0;
  const state = fixture({
    pages: ({ page }) =>
      ++reads === 1
        ? pending
        : {
            page,
            total: 1,
            items: [{ packageId: "new-view", aoi: {} }],
          },
  });
  state.overview.setPipelineId("enc");
  state.overview.setView(state.view);
  await flush();
  const map = {
    layers: [],
    add(layer, index = this.layers.length) {
      this.layers.splice(index, 0, layer);
    },
    remove(layer) {
      this.layers = this.layers.filter((x) => x !== layer);
    },
  };
  state.overview.setView({ map, ui: {} });
  release({ page: 0, total: 1, items: [{ packageId: "stale", aoi: {} }] });
  await flush();
  assert.equal(state.map.layers.length, 0);
  assert.equal(map.layers[0].graphics[0].attributes.overviewPackageId, "new-view");
  state.overview.destroy();
});

test("failed same-Pipeline Refresh preserves last valid graphics and surfaces an error", async () => {
  let reads = 0;
  const state = fixture({
    pages: ({ page }) => {
      if (++reads === 1) return { page, total: 1, items: [{ packageId: "good", aoi: {} }] };
      throw new Error("Backend unavailable");
    },
  });
  state.overview.setView(state.view);
  state.overview.setPipelineId("enc");
  await flush();
  await state.overview.refresh();
  assert.equal(state.map.layers[0].graphics[0].attributes.overviewPackageId, "good");
  assert.match(state.errors[0].message, /Backend unavailable/);
  state.overview.destroy();
});

test("a multi-Pipeline scope loads the union and changing Workspace only filters cached graphics", async () => {
  const state = fixture({
    pages: ({ pipelineId, page }) => ({
      page,
      total: 2,
      items: [
        { packageId: "shared", aoi: {} },
        { packageId: `${pipelineId}-only`, aoi: {} },
      ],
    }),
  });
  state.overview.setPipelineIds(["enc", "paper"]);
  state.overview.setView(state.view);
  await flush();
  assert.deepEqual(
    state.map.layers[0].graphics.map((item) => item.attributes.overviewPackageId),
    ["shared", "enc-only", "paper-only"]
  );
  assert.equal(state.calls.filter((call) => call.startsWith("page:")).length, 2);
  state.overview.setVisiblePackageIds(["paper-only"]);
  assert.deepEqual(
    state.map.layers[0].graphics.map((item) => item.attributes.overviewPackageId),
    ["paper-only"]
  );
  const renders = state.map.layers[0].replacements;
  state.overview.setVisiblePackageIds(["paper-only"]);
  assert.equal(
    state.map.layers[0].replacements,
    renders,
    "unchanged Job snapshot must not rebuild AOI graphics"
  );
  state.overview.setVisiblePackageIds(null);
  assert.equal(state.map.layers[0].graphics.length, 3);
  assert.equal(state.calls.filter((call) => call.startsWith("page:")).length, 2);
  state.overview.destroy();
});

test("an old multi-Pipeline generation cannot publish after the user changes scope", async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const state = fixture({
    pages: ({ pipelineId, page }) =>
      pipelineId === "enc" ? pending : { page, total: 1, items: [{ packageId: "paper", aoi: {} }] },
  });
  state.overview.setView(state.view);
  state.overview.setPipelineIds(["enc", "paper"]);
  await flush();
  state.overview.setPipelineIds(["paper"]);
  release({ page: 0, total: 1, items: [{ packageId: "stale-enc", aoi: {} }] });
  await flush();
  assert.deepEqual(
    state.map.layers[0].graphics.map((item) => item.attributes.overviewPackageId),
    ["paper"]
  );
  state.overview.destroy();
});

function labeledAoi(packageId, shortId) {
  const spatialReference = { toJSON: () => ({ wkid: 4326 }) };
  return {
    packageId,
    shortId,
    aoi: {
      spatialReference,
      extent: { center: { x: 12, y: 56, spatialReference } },
    },
  };
}

function packageLabels(map) {
  return map.layers.filter((layer) => layer.title === "Package labels");
}

test("Package labels reuse the deduplicated geometry page and the same Workspace visibility filter", async () => {
  const state = fixture({
    pages: ({ pipelineId, page }) => ({
      page,
      total: 3,
      items: [
        labeledAoi("canonical-shared", "NM-100"),
        labeledAoi(`${pipelineId}-only`, `NM-${pipelineId}`),
        labeledAoi("missing-short-id", null),
      ],
    }),
  });
  state.overview.setPipelineIds(["enc", "paper"]);
  state.overview.setView(state.view);
  await flush();
  assert.equal(state.errors.length, 0);
  assert.equal(state.map.layers[0].graphics.length, 4);
  assert.equal(packageLabels(state.map).length, 1);
  assert.deepEqual(
    packageLabels(state.map)[0].source.map((graphic) => graphic.attributes.labelText),
    ["NM-100", "NM-enc", "NM-paper"]
  );
  assert.equal(packageLabels(state.map)[0].popupEnabled, false);
  assert.equal(packageLabels(state.map)[0].minScale, MAP_LABEL_STYLES.package.minScale);

  const original = packageLabels(state.map)[0];
  state.overview.setVisiblePackageIds(["canonical-shared"]);
  assert.equal(original.destroyed, true);
  const filtered = packageLabels(state.map)[0];
  assert.deepEqual(
    filtered.source.map((graphic) => graphic.attributes.labelText),
    ["NM-100"]
  );
  state.overview.setVisiblePackageIds(["canonical-shared"]);
  assert.equal(packageLabels(state.map)[0], filtered);
  state.overview.setVisiblePackageIds([]);
  assert.equal(packageLabels(state.map).length, 0);
  assert.equal(state.calls.filter((call) => call.startsWith("page:")).length, 2);
  state.overview.destroy();
  assert.equal(state.map.layers.length, 0);
});

test("Package labels disappear immediately on scope changes and superseded reads cannot restore them", async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const state = fixture({
    pages: ({ pipelineId, page }) =>
      pipelineId === "paper"
        ? pending
        : { page, total: 1, items: [labeledAoi(pipelineId, `NM-${pipelineId}`)] },
  });
  state.overview.setPipelineId("enc");
  state.overview.setView(state.view);
  await flush();
  const original = packageLabels(state.map)[0];
  state.overview.setPipelineId("paper");
  assert.equal(original.destroyed, true);
  assert.equal(packageLabels(state.map).length, 0);
  await flush();
  state.overview.setPipelineId("enc");
  release({ page: 0, total: 1, items: [labeledAoi("paper", "NM-stale")] });
  await flush();
  assert.deepEqual(
    packageLabels(state.map)[0].source.map((graphic) => graphic.attributes.labelText),
    ["NM-enc"]
  );
  state.overview.destroy();
  assert.equal(state.map.layers.length, 0);
});

test("Failed same-scope refresh retains Package labels and MapView replacement disposes them", async () => {
  let fail = false;
  const state = fixture({
    pages: ({ page }) => {
      if (fail) throw new Error("Backend unavailable");
      return { page, total: 1, items: [labeledAoi("p", "NM-100")] };
    },
  });
  state.overview.setPipelineId("enc");
  state.overview.setView(state.view);
  await flush();
  const label = packageLabels(state.map)[0];
  fail = true;
  await state.overview.refresh();
  assert.equal(packageLabels(state.map)[0], label);
  assert.equal(state.errors.length, 1);
  state.overview.setView(null);
  assert.equal(label.destroyed, true);
  assert.equal(state.map.layers.length, 0);
  state.overview.destroy();
});

test("Catalogue refresh sends one AOI read per selected Pipeline", async () => {
  const state = fixture();
  try {
    state.overview.setView(state.view);
    state.overview.setPipelineIds(["enc"]);
    await flush();
    state.calls.length = 0;

    state.overview.setPipelineIds(["enc"], { reload: true });
    state.overview.setPipelineIds(["enc"]);
    await flush();
    assert.deepEqual(state.calls, ["page:enc:true"]);
    state.calls.length = 0;

    state.overview.setPipelineIds(["paper", "enc"], { reload: true });
    state.overview.setPipelineIds(["enc", "paper"]);
    await flush();
    assert.deepEqual(state.calls, ["page:enc:true", "page:paper:true"]);
  } finally {
    state.overview.destroy();
  }
});
