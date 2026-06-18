import assert from "node:assert/strict";
import test from "node:test";

import {
  AOI_RENDERER_SEVERITY,
  createAoiJobSeverityExpression,
  createAoiJobSummaryRenderer,
  createDefaultAoiRenderer,
  getAoiJobSeverity,
} from "./aoiRenderer.js";

test("createDefaultAoiRenderer returns a neutral simple renderer", () => {
  const renderer = createDefaultAoiRenderer();

  assert.equal(renderer.type, "simple");
  assert.equal(renderer.label, "Areas of Interest");
  assert.equal(renderer.symbol.type, "simple-fill");
});

test("getAoiJobSeverity prioritizes active high-priority Jobs", () => {
  assert.equal(
    getAoiJobSeverity({
      active: 0,
      highPriority: 2,
      activeHighPriority: 0,
    }),
    AOI_RENDERER_SEVERITY.NONE
  );

  assert.equal(
    getAoiJobSeverity({
      active: 2,
      highPriority: 0,
      activeHighPriority: 0,
    }),
    AOI_RENDERER_SEVERITY.ACTIVE
  );

  assert.equal(
    getAoiJobSeverity({
      active: 2,
      highPriority: 1,
      activeHighPriority: 1,
    }),
    AOI_RENDERER_SEVERITY.HIGH
  );
});

test("createAoiJobSummaryRenderer returns class breaks for matching summaries", () => {
  const renderer = createAoiJobSummaryRenderer({
    "{GLOBAL-ID-1}": {
      active: 1,
      highPriority: 0,
      activeHighPriority: 0,
    },
    "{GLOBAL-ID-2}": {
      active: 2,
      highPriority: 1,
      activeHighPriority: 1,
    },
  });

  assert.equal(renderer.type, "class-breaks");
  assert.match(renderer.valueExpression, /Text\(\$feature\["GlobalID"\]\)/);
  assert.match(renderer.valueExpression, /\{GLOBAL-ID-1\}/);
  assert.match(renderer.valueExpression, /\{GLOBAL-ID-2\}/);
  assert.equal(renderer.classBreakInfos.length, 3);
});

test("createAoiJobSeverityExpression ignores neutral entries", () => {
  const expression = createAoiJobSeverityExpression([
    ["{GLOBAL-ID-1}", AOI_RENDERER_SEVERITY.NONE],
    ["{GLOBAL-ID-2}", AOI_RENDERER_SEVERITY.HIGH],
  ]);

  assert.doesNotMatch(expression, /\{GLOBAL-ID-1\}/);
  assert.match(expression, /\{GLOBAL-ID-2\}/);
});
