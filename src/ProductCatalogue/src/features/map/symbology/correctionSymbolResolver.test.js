import assert from "node:assert/strict";
import test from "node:test";

import {
  WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  areCorrectionSymbolsEquivalent,
  canResolveCorrectionSymbol,
  resolveCorrectionSymbol,
} from "./correctionSymbolResolver.js";
import { getCorrectionSymbol } from "./correctionSymbols.js";

const polygon = { type: "polygon" };

test("simple and non-opted-in sources retain scalar symbolization", () => {
  const attributes = {
    status: 8,
    workUnitStatus: {
      members: [{ status: 8 }, { status: 11 }],
    },
  };

  assert.deepEqual(
    resolveCorrectionSymbol({ attributes, geometry: polygon }),
    getCorrectionSymbol(8)
  );
  assert.deepEqual(
    resolveCorrectionSymbol({ attributes, geometry: polygon, symbolization: { type: "other" } }),
    getCorrectionSymbol(8)
  );
});

test("member-aware scalar fallback remains identical without usable member status", () => {
  const symbol = resolveCorrectionSymbol({
    attributes: {
      status: 8,
      workUnitStatus: { workflowStatus: "package-paused", members: [{ key: "missing" }] },
    },
    geometry: polygon,
    symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  });

  assert.deepEqual(symbol, getCorrectionSymbol(8));
});

test("one authoritative member status uses ordinary scalar styling", () => {
  const symbol = resolveCorrectionSymbol({
    attributes: {
      status: 8,
      workUnitStatus: { members: [{ key: "only", status: 11 }] },
    },
    geometry: polygon,
    symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  });

  assert.deepEqual(symbol, getCorrectionSymbol(11));
});

test("mixed member state produces deterministic multi-color CIM striping", () => {
  const first = resolveCorrectionSymbol({
    attributes: {
      status: 15,
      workUnitStatus: { members: [{ status: 8 }, { status: 11 }] },
    },
    geometry: polygon,
    symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  });
  const reordered = resolveCorrectionSymbol({
    attributes: {
      status: 15,
      workUnitStatus: { members: [{ status: "11" }, { status: "8" }] },
    },
    geometry: polygon,
    symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  });

  assert.equal(first.type, "cim");
  assert.deepEqual(reordered, first);

  const layers = first.data.symbol.symbolLayers;
  const hatch = layers.find((layer) => layer.type === "CIMHatchFill");
  const fill = layers.find((layer) => layer.type === "CIMSolidFill");

  assert.deepEqual(fill.color.slice(0, 3), [40, 155, 130]);
  assert.deepEqual(hatch.lineSymbol.symbolLayers[0].color.slice(0, 3), [205, 140, 30]);
});

test("representative and workflow status changes cannot alter a mixed member symbol", () => {
  const first = resolveCorrectionSymbol({
    attributes: {
      status: 15,
      workUnitStatus: {
        workflowStatus: "first-workflow-state",
        members: [{ status: 8 }, { status: 11 }],
      },
    },
    geometry: polygon,
    symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  });
  const changedWorkflow = resolveCorrectionSymbol({
    attributes: {
      status: 2,
      workUnitStatus: {
        workflowStatus: "second-workflow-state",
        members: [{ status: 11 }, { status: 8 }],
      },
    },
    geometry: polygon,
    symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  });

  assert.deepEqual(changedWorkflow, first);
});

test("known plus unknown mixed state exposes known color and existing black fallback", () => {
  const symbol = resolveCorrectionSymbol({
    attributes: {
      status: "future-representative",
      workUnitStatus: {
        members: [{ status: "future-member" }, { status: 8 }],
      },
    },
    geometry: polygon,
    symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  });

  const layers = symbol.data.symbol.symbolLayers;
  const hatch = layers.find((layer) => layer.type === "CIMHatchFill");
  const fill = layers.find((layer) => layer.type === "CIMSolidFill");
  const renderedRgb = [fill.color.slice(0, 3), hatch.lineSymbol.symbolLayers[0].color.slice(0, 3)];

  assert.equal(
    renderedRgb.some((rgb) => rgb.join(",") === "205,140,30"),
    true
  );
  assert.equal(
    renderedRgb.some((rgb) => rgb.join(",") === "0,0,0"),
    true
  );
});

test("unknown-only mixed state uses only the existing black fallback", () => {
  const symbol = resolveCorrectionSymbol({
    attributes: {
      status: 8,
      workUnitStatus: {
        members: [{ status: "future-b" }, { status: "future-a" }],
      },
    },
    geometry: polygon,
    symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  });

  const layers = symbol.data.symbol.symbolLayers;
  const hatch = layers.find((layer) => layer.type === "CIMHatchFill");
  const fill = layers.find((layer) => layer.type === "CIMSolidFill");

  assert.deepEqual(fill.color.slice(0, 3), [0, 0, 0]);
  assert.deepEqual(hatch.lineSymbol.symbolLayers[0].color.slice(0, 3), [0, 0, 0]);
});

test("scalar, mixed, and restored scalar states resolve to distinct expected symbols", () => {
  const scalar = resolveCorrectionSymbol({
    attributes: { status: 8 },
    geometry: polygon,
    symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  });
  const mixed = resolveCorrectionSymbol({
    attributes: { status: 8, workUnitStatus: { members: [{ status: 8 }, { status: 11 }] } },
    geometry: polygon,
    symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  });
  const restored = resolveCorrectionSymbol({
    attributes: { status: 8, workUnitStatus: { members: [{ status: 8 }, { status: "8" }] } },
    geometry: polygon,
    symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  });

  assert.notDeepEqual(mixed, scalar);
  assert.equal(mixed.type, "cim");
  assert.deepEqual(restored, scalar);
});

test("non-polygon mixed state fails closed to representative scalar styling", () => {
  const attributes = {
    status: 8,
    workUnitStatus: { members: [{ status: 8 }, { status: 11 }] },
  };

  for (const type of ["point", "polyline", undefined]) {
    assert.deepEqual(
      resolveCorrectionSymbol({
        attributes,
        geometry: { type },
        symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
      }),
      getCorrectionSymbol(8)
    );
  }
});

test("refresh resolution requires scalar status or opted-in polygon member status", () => {
  assert.equal(canResolveCorrectionSymbol({ attributes: {} }), false);
  assert.equal(
    canResolveCorrectionSymbol({
      attributes: { workUnitStatus: { workflowStatus: "package-paused" } },
      geometry: polygon,
      symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
    }),
    false
  );
  assert.equal(
    canResolveCorrectionSymbol({
      attributes: { workUnitStatus: { members: [{ status: 8 }] } },
      geometry: polygon,
      symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
    }),
    true
  );
});

test("symbol equivalence ignores plain-object property insertion order", () => {
  const left = createCimFixture();
  const right = {
    data: {
      symbol: {
        symbolLayers: [...left.data.symbol.symbolLayers],
        type: "CIMPolygonSymbol",
      },
      type: "CIMSymbolReference",
    },
    type: "cim",
  };

  assert.equal(areCorrectionSymbolsEquivalent(left, right), true);
});

test("symbol equivalence accepts a public toJSON ArcGIS-style CIM representation", () => {
  const fixture = createCimFixture();
  const arcgisShape = {
    toJSON() {
      return {
        type: "cim",
        data: {
          type: "CIMSymbolReference",
          primitiveOverrides: null,
          symbol: {
            type: "CIMPolygonSymbol",
            symbolLayers: fixture.data.symbol.symbolLayers.map((layer) => ({
              ...layer,
              enable: layer.enable ?? true,
            })),
          },
        },
      };
    },
  };

  assert.equal(areCorrectionSymbolsEquivalent(arcgisShape, fixture), true);
});

test("symbol equivalence rejects a genuinely different CIM hatch color", () => {
  const left = createCimFixture();
  const right = structuredClone(left);
  right.data.symbol.symbolLayers[1].lineSymbol.symbolLayers[0].color = [220, 45, 45, 230];

  assert.equal(areCorrectionSymbolsEquivalent(left, right), false);
});

function createCimFixture() {
  return resolveCorrectionSymbol({
    attributes: {
      status: 15,
      workUnitStatus: { members: [{ status: 8 }, { status: 11 }] },
    },
    geometry: polygon,
    symbolization: WORK_UNIT_MEMBER_STATUS_SYMBOLIZATION,
  });
}
