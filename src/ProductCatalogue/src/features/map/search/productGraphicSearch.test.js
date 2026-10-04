import test from "node:test";
import assert from "node:assert/strict";
import {
  createProductGraphicViewTarget,
  createProductPopupLocation,
  findProductGraphic,
  readGraphicProductName,
} from "./productGraphicSearch.js";

test("findProductGraphic matches datasetName case-insensitively", () => {
  const expected = createGraphic("101DK0040943E");
  const layers = [{ graphics: [createGraphic("101DK0000000E")] }, { graphics: [expected] }];

  assert.equal(findProductGraphic(layers, "101dk0040943e"), expected);
});

test("readGraphicProductName supports backend and normalized attribute names", () => {
  assert.equal(readGraphicProductName(createGraphic("A", "DatasetName")), "A");
  assert.equal(readGraphicProductName(createGraphic("B", "productName")), "B");
});

test("createProductGraphicViewTarget prefers expanded geometry extent", () => {
  const extent = {
    expanded: false,
    expand(value) {
      return { expanded: true, value };
    },
  };
  const graphic = { geometry: { extent } };

  assert.deepEqual(createProductGraphicViewTarget(graphic), {
    expanded: true,
    value: 1.35,
  });
});

function createGraphic(productName, attributeName = "datasetName") {
  return {
    attributes: {
      [attributeName]: productName,
    },
    geometry: {},
  };
}

test("createProductPopupLocation prefers extent center without reading centroid", () => {
  const center = { x: 1, y: 2 };
  const graphic = {
    geometry: {
      extent: { center },
      get centroid() {
        throw new Error("centroid should not be read");
      },
    },
  };

  assert.equal(createProductPopupLocation(graphic), center);
});
