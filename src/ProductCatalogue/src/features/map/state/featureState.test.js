import assert from "node:assert/strict";
import test from "node:test";

import {
  WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  resolveCorrectionSymbol,
} from "../symbology/correctionSymbolResolver.js";
import { applyGraphicAttributes } from "./featureState.js";

test("attribute refresh retains mixed rendering without a no-op symbol assignment", () => {
  const graphic = createGraphic({
    status: 8,
    workUnitStatus: { members: [{ status: 8 }, { status: 11 }] },
  });

  applyGraphicAttributes(graphic, { edition: 2 });

  assert.equal(graphic.symbol.type, "cim");
  assert.equal(graphic.attributes.edition, 2);
  assert.equal(graphic.symbolWriteCount, 0);
});

test("reordered equivalent member statuses avoid a no-op symbol assignment", () => {
  const graphic = createGraphic({
    status: 8,
    workUnitStatus: {
      workflowStatus: "first",
      members: [
        { key: "alpha", status: 8 },
        { key: "beta", status: 11 },
      ],
    },
  });

  applyGraphicAttributes(graphic, {
    workUnitStatus: {
      workflowStatus: "first",
      members: [
        { key: "beta", status: "11" },
        { key: "alpha", status: "8" },
      ],
    },
  });

  assert.equal(graphic.symbol.type, "cim");
  assert.equal(graphic.symbolWriteCount, 0);
});

test("workflow-only changes cannot churn a mixed map symbol", () => {
  const graphic = createGraphic({
    status: 8,
    workUnitStatus: {
      workflowStatus: "first",
      members: [{ status: 8 }, { status: 11 }],
    },
  });

  applyGraphicAttributes(graphic, {
    workUnitStatus: {
      workflowStatus: "second",
      members: [{ status: 8 }, { status: 11 }],
    },
  });

  assert.equal(graphic.symbol.type, "cim");
  assert.equal(graphic.symbolWriteCount, 0);
});

test("ordinary scalar Graphic avoids a no-op symbol assignment for unrelated metadata", () => {
  const graphic = createGraphic({ status: 8 }, null);

  applyGraphicAttributes(graphic, { edition: 4 });

  assert.equal(graphic.symbol.style, undefined);
  assert.equal(graphic.symbol.color, "rgba(205, 140, 30, 0.15)");
  assert.equal(graphic.symbolWriteCount, 0);
});

test("scalar to mixed transition assigns the symbol exactly once", () => {
  const graphic = createGraphic({ status: 8 });

  applyGraphicAttributes(graphic, {
    workUnitStatus: { members: [{ status: 8 }, { status: 11 }] },
  });

  assert.equal(graphic.symbol.type, "cim");
  assert.equal(graphic.symbolWriteCount, 1);
});

test("member status refresh transitions mixed rendering back to scalar exactly once", () => {
  const graphic = createGraphic({
    status: 8,
    workUnitStatus: { members: [{ status: 8 }, { status: 11 }] },
  });

  applyGraphicAttributes(graphic, {
    workUnitStatus: { members: [{ status: 11 }, { status: "11" }] },
  });

  assert.equal(graphic.symbol.style, undefined);
  assert.equal(graphic.symbol.color, "rgba(40, 155, 130, 0.15)");
  assert.equal(graphic.symbolWriteCount, 1);
});

test("a genuinely different mixed render state assigns the symbol exactly once", () => {
  const graphic = createGraphic({
    status: 8,
    workUnitStatus: { members: [{ status: 8 }, { status: 11 }] },
  });

  applyGraphicAttributes(graphic, {
    workUnitStatus: { members: [{ status: 10 }, { status: 12 }] },
  });

  assert.equal(graphic.symbol.type, "cim");
  const fill = graphic.symbol.data.symbol.symbolLayers.find(
    (layer) => layer.type === "CIMSolidFill"
  );
  assert.deepEqual(fill.color.slice(0, 3), [125, 95, 190]);
  assert.equal(graphic.symbolWriteCount, 1);
});

test("workflow status refresh alone cannot change the scalar map symbol", () => {
  const graphic = createGraphic({ status: 8 });

  applyGraphicAttributes(graphic, {
    workUnitStatus: { workflowStatus: "package-paused" },
  });

  assert.equal(graphic.symbol.style, undefined);
  assert.equal(graphic.symbol.color, "rgba(205, 140, 30, 0.15)");
  assert.equal(graphic.symbolWriteCount, 0);
});

test("non-opted-in Graphic refresh ignores arbitrary work-unit-shaped attributes", () => {
  const graphic = createGraphic(
    {
      status: 8,
      workUnitStatus: { members: [{ status: 8 }, { status: 11 }] },
    },
    null
  );

  applyGraphicAttributes(graphic, { edition: 3 });

  assert.equal(graphic.symbol.style, undefined);
  assert.equal(graphic.symbol.color, "rgba(205, 140, 30, 0.15)");
  assert.equal(graphic.symbolWriteCount, 0);
});

function createGraphic(attributes, symbolization = WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION) {
  const geometry = { type: "polygon" };
  let symbol = resolveCorrectionSymbol({
    attributes,
    geometry,
    symbolization,
  });
  let symbolWriteCount = 0;

  return {
    attributes,
    geometry,
    layer: { appSymbolization: symbolization },
    get symbol() {
      return symbol;
    },
    set symbol(value) {
      symbol = value;
      symbolWriteCount += 1;
    },
    get symbolWriteCount() {
      return symbolWriteCount;
    },
    set(property, value) {
      this[property] = value;
    },
  };
}
