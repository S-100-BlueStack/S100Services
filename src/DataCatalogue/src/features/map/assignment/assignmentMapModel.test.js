import test from "node:test";
import assert from "node:assert/strict";
import {
  mapServiceUrl,
  layerBindings,
  workStreamRenderer,
  featureGraphicProperties,
} from "./assignmentMapModel.js";
test("MapServer config keeps its path and rejects frontend credential URLs", () => {
  assert.equal(
    mapServiceUrl(" https://example.com/arcgis/rest/services/context/MapServer/ "),
    "https://example.com/arcgis/rest/services/context/MapServer"
  );
  for (const value of [
    "",
    "http://example.com/MapServer",
    "https://user:password@example.com/MapServer",
    "https://example.com/MapServer?token=secret",
    "https://example.com/FeatureServer",
    "https://example.com/MapServer#secret",
  ])
    assert.throws(() => mapServiceUrl(value));
});
test("Bindings support zero, multiple and shared layers without assuming one Work stream per layer", () => {
  assert.deepEqual(
    layerBindings([
      { id: "group", layerIds: [4, 5, 6] },
      { id: "shared", layerIds: [6, 7] },
      { id: "non-spatial", layerIds: [] },
    ]),
    [
      { layerId: 4, workStreamIds: ["group"] },
      { layerId: 5, workStreamIds: ["group"] },
      { layerId: 6, workStreamIds: ["group", "shared"] },
      { layerId: 7, workStreamIds: ["shared"] },
    ]
  );
  assert.throws(() => layerBindings([{ id: "invalid", layerIds: [-1] }]));
});
test("Assigned Work stream symbols differ in line style or shape as well as color", () => {
  assert.equal(workStreamRenderer("polygon", true).symbol.outline.style, "solid");
  assert.equal(workStreamRenderer("polygon", false).symbol.outline.style, "dash");
  assert.notEqual(
    workStreamRenderer("point", true).symbol.style,
    workStreamRenderer("point", false).symbol.style
  );
  assert.equal(workStreamRenderer("polyline", true).symbol.type, "simple-line");
  assert.throws(() => workStreamRenderer("mesh", false));
});
test("Selected mock geometry is normalized outside UI and rejects missing spatial references", () => {
  const geometry = { type: "point", longitude: 10, latitude: 56, spatialReference: { wkid: 4326 } };
  assert.deepEqual(featureGraphicProperties({ geometry }).geometry, geometry);
  assert.throws(() =>
    featureGraphicProperties({ geometry: { type: "point", longitude: 10, latitude: 56 } })
  );
});
