import assert from "node:assert/strict";
import test from "node:test";

import { WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION } from "../symbology/correctionSymbolResolver.js";
import { createGraphicProperties } from "./graphicSymbolization.js";

test("initial transformed Graphic properties resolve member-aware package symbols", () => {
  const geometry = { type: "polygon", rings: [] };
  const attributes = {
    status: 8,
    workUnitStatus: {
      members: [
        { key: "alpha", status: 8 },
        { key: "beta", status: 11 },
      ],
    },
  };

  const properties = createGraphicProperties({
    geometry,
    attributes,
    symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  });

  assert.equal(properties.geometry, geometry);
  assert.equal(properties.attributes, attributes);
  assert.equal(properties.symbol.type, "cim");
});

test("current scalar-only package input retains ordinary scalar symbolization", () => {
  const properties = createGraphicProperties({
    geometry: { type: "polygon", rings: [] },
    attributes: { status: 8 },
    symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  });

  assert.equal(properties.symbol.style, undefined);
  assert.equal(properties.symbol.color, "rgba(205, 140, 30, 0.15)");
});
