import assert from "node:assert/strict";
import test from "node:test";
import {
  ENC_PACKAGE_STATUSES,
  normalizeEncPackageStatus,
  getEncPackageStatusLabel,
  readEncPackageStatusFilterValues,
} from "./encPackageStatus.js";
import {
  getPackageCorrectionSymbol,
  getCorrectionSymbol,
} from "../../map/symbology/correctionSymbols.js";
import { packageStatusColorConfig } from "../../../shared/config/colorsConfig.js";

test("backend EncPackageStatus values and names remain distinct from export candidates", () => {
  assert.deepEqual(
    ENC_PACKAGE_STATUSES.map(({ id }) => id),
    [0, 2, 3, 4, 5]
  );
  for (const { id, label } of ENC_PACKAGE_STATUSES) {
    assert.equal(normalizeEncPackageStatus(id), id);
    assert.equal(normalizeEncPackageStatus(String(id)), id);
    assert.equal(normalizeEncPackageStatus(label.toLowerCase()), id);
    assert.equal(getEncPackageStatusLabel(id), label);
    assert.deepEqual(
      readEncPackageStatusFilterValues({
        attributes: {
          status: 11,
          workUnitStatus: {
            packageStatus: id,
            workflowStatus: 15,
            members: [{ status: 11 }, { status: 15 }],
          },
        },
      }),
      [String(id)]
    );
  }
  for (const value of [
    1,
    6,
    11,
    15,
    "ReadyForDistribution",
    "Error from candidate",
    NaN,
    null,
    undefined,
  ]) {
    assert.equal(normalizeEncPackageStatus(value), undefined);
  }
  assert.equal(getEncPackageStatusLabel(999), "Unknown");
  assert.deepEqual(readEncPackageStatusFilterValues({ attributes: { status: 15 } }), ["unknown"]);
});

test("every known package status uses its own solid low-opacity symbol and a thicker border", () => {
  for (const { id } of ENC_PACKAGE_STATUSES) {
    const symbol = getPackageCorrectionSymbol(id);
    assert.equal(symbol.type, "simple-fill");
    assert.equal(symbol.color, packageStatusColorConfig[id].fill);
    assert.equal(symbol.outline.color, packageStatusColorConfig[id].outline);
    assert.equal(symbol.outline.width, 1.5);
    assert.equal(symbol.outline.style, undefined);
    assert.notDeepEqual(symbol, getCorrectionSymbol(id));
  }
  const unknown = getPackageCorrectionSymbol(undefined);
  assert.equal(unknown.outline.style, "dash");
  assert.notDeepEqual(unknown, getPackageCorrectionSymbol(0));
});
