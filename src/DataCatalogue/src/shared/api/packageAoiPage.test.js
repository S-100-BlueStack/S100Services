import test from "node:test";
import assert from "node:assert/strict";
import { normalizePackageAoiItem } from "./packageAoiPage.js";

const aoi = {
  rings: [
    [
      [10, 54],
      [11, 54],
      [11, 55],
      [10, 55],
      [10, 54],
    ],
  ],
  spatialReference: { wkid: 4326 },
};

test("paged Package geometry normalizes a canonical ID and validated AOI", () => {
  const normalized = normalizePackageAoiItem({
    packageId: "package/id",
    shortId: "NM1000",
    aoi,
    detailedGeometry: { points: [{}] },
  });
  assert.equal(normalized.packageId, "package/id");
  assert.equal(normalized.shortId, "NM1000");
  assert.deepEqual(normalized.aoi, aoi);
  assert.equal("detailedGeometry" in normalized, false);
});

test("missing identity, missing AOI and invalid spatial references never become empty success", () => {
  for (const input of [
    null,
    { packageId: "", aoi },
    { packageId: "p", aoi: null },
    { packageId: "p", shortId: 3, aoi },
    { packageId: "p", aoi: { ...aoi, spatialReference: null } },
    {
      packageId: "p",
      aoi: {
        ...aoi,
        rings: [
          [
            [10, 54],
            [11, 54],
          ],
        ],
      },
    },
  ])
    assert.throws(() => normalizePackageAoiItem(input), /Package/);
});
