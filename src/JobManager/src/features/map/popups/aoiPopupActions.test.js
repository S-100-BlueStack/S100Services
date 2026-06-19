import assert from "node:assert/strict";
import test from "node:test";

import { createAoiSelectionFromGraphic } from "./aoiPopupActions.js";

test("createAoiSelectionFromGraphic uses GlobalID and PRODUCTNAME from AOI attributes", () => {
  const selectedAoi = createAoiSelectionFromGraphic({
    attributes: {
      OBJECTID: 9,
      PRODUCTNAME: "Demo AOI",
      PRODUCTID: "{PRODUCT-ID}",
      GlobalID: "{GLOBAL-ID}",
    },
  });

  assert.deepEqual(selectedAoi, {
    aoiId: "{GLOBAL-ID}",
    aoiName: "Demo AOI",
    objectId: "9",
  });
});

test("createAoiSelectionFromGraphic falls back to prefixed OBJECTID", () => {
  const selectedAoi = createAoiSelectionFromGraphic({
    attributes: {
      OBJECTID: 9,
    },
  });

  assert.deepEqual(selectedAoi, {
    aoiId: "aoi-9",
    aoiName: "Selected AOI",
    objectId: "9",
  });
});
