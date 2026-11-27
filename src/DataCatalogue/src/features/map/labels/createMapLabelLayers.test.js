import test from "node:test";
import assert from "node:assert/strict";
import { createMapLabelLayers, MAP_LABEL_STYLES } from "./createMapLabelLayers.js";

function polygon(wkid = 4326) {
  const spatialReference = { toJSON: () => ({ wkid }) };
  return {
    type: "polygon",
    spatialReference,
    extent: { center: { type: "point", x: 1, y: 2, spatialReference } },
  };
}

function fixture(kind = "workspace") {
  const map = {
    layers: [],
    add(layer) {
      this.layers.push(layer);
    },
    remove(layer) {
      this.layers = this.layers.filter((entry) => entry !== layer);
    },
  };
  class FeatureLayer {
    constructor(options) {
      Object.assign(this, options);
    }
    destroy() {
      this.destroyed = true;
    }
  }
  class Graphic {
    constructor(options) {
      Object.assign(this, options);
    }
  }
  const labels = createMapLabelLayers({ map, FeatureLayer, Graphic, kind });
  return { map, labels };
}

test("Workspace labels use existing polygon geometry with native scale and collision settings", () => {
  const { map, labels } = fixture();
  const geometry = polygon();
  labels.replace([{ id: '["enc","dk1"]', text: "DK1", geometry }]);
  const [layer] = map.layers;
  assert.equal(layer.geometryType, "polygon");
  assert.equal(layer.source[0].geometry, geometry);
  assert.deepEqual(layer.source[0].attributes, { ObjectID: 1, labelText: "DK1" });
  assert.equal(layer.minScale, MAP_LABEL_STYLES.workspace.minScale);
  assert.equal(layer.labelingInfo[0].labelPlacement, "always-horizontal");
  assert.equal(layer.labelingInfo[0].deconflictionStrategy, "static");
  assert.equal(layer.popupEnabled, false);
  assert.equal(layer.listMode, "hide");
  assert.equal(layer.legendEnabled, false);
  assert.equal(layer.renderer.symbol.style, "none");
  labels.destroy();
  assert.equal(layer.destroyed, true);
  assert.equal(map.layers.length, 0);
});

test("Package labels use the AOI center, a closer scale and no synthetic fallback text", () => {
  const { map, labels } = fixture("package");
  const geometry = polygon();
  labels.replace([
    { id: "p1", text: " NM-551-25 ", geometry },
    { id: "p2", text: null, geometry },
    { id: "p3", text: "  ", geometry },
    { id: "p4", text: "NM-4", geometry: null },
  ]);
  const [layer] = map.layers;
  assert.equal(layer.geometryType, "point");
  assert.equal(layer.source.length, 1);
  assert.equal(layer.source[0].geometry, geometry.extent.center);
  assert.equal(layer.source[0].attributes.labelText, "NM-551-25");
  assert.ok(layer.minScale < MAP_LABEL_STYLES.workspace.minScale);
  assert.equal(layer.labelingInfo[0].labelPlacement, "above-center");
  assert.equal(layer.labelingInfo[0].symbol.haloColor, "#ffffff");
  labels.destroy();
});

test("Label layers preserve spatial references and deduplicate only the supplied identity", () => {
  const { map, labels } = fixture();
  const first = polygon(4326);
  const second = polygon(25832);
  labels.replace([
    { id: "enc/dk1", text: "DK1", geometry: first },
    { id: "enc/dk1", text: "DK1", geometry: first },
    { id: "paper/dk1", text: "DK1", geometry: second },
  ]);
  assert.equal(map.layers.length, 2);
  assert.deepEqual(
    map.layers.map((layer) => layer.spatialReference.toJSON().wkid),
    [4326, 25832]
  );
  assert.deepEqual(
    map.layers.map((layer) => layer.source.length),
    [1, 1]
  );
  labels.destroy();
});

test("Unchanged visibility does not recreate layers; replacement and teardown remove old labels", () => {
  const { map, labels } = fixture();
  const first = { id: "a", text: "A", geometry: polygon() };
  const second = { id: "b", text: "B", geometry: polygon() };
  labels.replace([first, second]);
  const original = map.layers[0];
  labels.replace([{ ...first }, { ...second }]);
  assert.equal(map.layers[0], original);
  labels.replace([second]);
  assert.equal(original.destroyed, true);
  assert.deepEqual(
    map.layers[0].source.map((graphic) => graphic.attributes.labelText),
    ["B"]
  );
  labels.clear();
  assert.equal(map.layers.length, 0);
  labels.replace([first]);
  labels.destroy();
  labels.replace([second]);
  assert.equal(map.layers.length, 0);
});

test("An unsupported label anchor does not prevent labels for other valid geometry", () => {
  const { map, labels } = fixture("package");
  const valid = polygon();
  const invalid = polygon();
  invalid.extent.center.x = NaN;
  labels.replace([
    { id: "invalid", text: "Invalid", geometry: invalid },
    { id: "valid", text: "NM-100", geometry: valid },
  ]);
  assert.deepEqual(
    map.layers[0].source.map((graphic) => graphic.attributes.labelText),
    ["NM-100"]
  );
  labels.destroy();
});

test("Detailed point labels use exact point anchors and their supplied numbers", () => {
  const { map, labels } = fixture("detailedPoint");
  const first = { ...polygon().extent.center, extent: null };
  const second = { ...first, x: 0, y: 0 };
  const entries = [
    { id: "1", text: "1, 3", geometry: first },
    { id: "2", text: "2", geometry: second },
    { id: "4", text: "4", geometry: { ...first, x: 3 } },
  ];
  labels.replace(entries);
  const [layer] = map.layers;
  assert.equal(layer.source[0].geometry, first);
  assert.equal(layer.source[1].geometry, second);
  assert.deepEqual(
    layer.source.map(({ attributes }) => attributes),
    [
      { ObjectID: 1, labelText: "1, 3" },
      { ObjectID: 2, labelText: "2" },
      { ObjectID: 3, labelText: "4" },
    ]
  );
  assert.equal(layer.geometryType, "point");
  assert.equal(layer.minScale, 0);
  assert.equal(layer.labelsVisible, true);
  assert.equal(layer.labelingInfo[0].labelPlacement, "below-center");
  assert.equal(layer.labelingInfo[0].deconflictionStrategy, "static");
  assert.equal(layer.labelingInfo[0].symbol.haloColor, "#ffffff");
  assert.equal(layer.popupEnabled, false);
  assert.equal(layer.legendEnabled, false);
  assert.equal(layer.listMode, "hide");
  assert.deepEqual(layer.renderer.symbol.color, [0, 0, 0, 0]);
  labels.replace(entries);
  assert.equal(map.layers[0], layer);
  labels.replace([]);
  assert.equal(layer.destroyed, true);
  assert.equal(map.layers.length, 0);
  labels.replace(entries);
  const replacement = map.layers[0];
  labels.destroy();
  labels.replace(entries);
  assert.equal(replacement.destroyed, true);
  assert.equal(map.layers.length, 0);
});
