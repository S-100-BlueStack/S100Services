import assert from "node:assert/strict";
import test from "node:test";

import {
  packageStatusColorConfig,
  statusColorConfig,
} from "../../../shared/config/colorsConfig.js";
import { WORK_UNIT_PACKAGE_STATUS_SYMBOLIZATION } from "./correctionSymbolResolver.js";
import { resolveGraphicStatusPresentation } from "./graphicStatusPresentation.js";

function packageGraphic(status, representativeStatus = 15) {
  return {
    layer: { appSymbolization: WORK_UNIT_PACKAGE_STATUS_SYMBOLIZATION },
    attributes: {
      status: representativeStatus,
      workUnitStatus: { packageStatus: status },
    },
  };
}

test("Package marker, popup header and overlap picker use the aggregate backend status", () => {
  const presentation = resolveGraphicStatusPresentation(packageGraphic(2));
  assert.equal(presentation.isPackage, true);
  assert.equal(presentation.status, 2);
  assert.equal(presentation.label, "Ready");
  assert.deepEqual(presentation.colors, packageStatusColorConfig[2]);
  assert.notEqual(presentation.colors?.outline, statusColorConfig[15].outline);
});

test("Package presentation doesn't infer Idle or a member status when aggregate state is unknown", () => {
  const presentation = resolveGraphicStatusPresentation(packageGraphic(undefined, 15));
  assert.equal(presentation.isPackage, true);
  assert.equal(presentation.status, undefined);
  assert.equal(presentation.label, "Unknown");
  assert.equal(presentation.colors, null);
});

test("Ordinary Product presentation continues to use ProductState and its color", () => {
  const presentation = resolveGraphicStatusPresentation({
    attributes: { status: 15, workUnitStatus: { packageStatus: 2 } },
    layer: {},
  });
  assert.equal(presentation.isPackage, false);
  assert.equal(presentation.status, 15);
  assert.equal(presentation.label, null);
  assert.deepEqual(presentation.colors, statusColorConfig[15]);
});
