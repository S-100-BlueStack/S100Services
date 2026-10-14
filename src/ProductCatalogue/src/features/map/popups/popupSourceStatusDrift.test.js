import assert from "node:assert/strict";
import test from "node:test";
import { detectPackagePopupStatusDrift } from "./popupSourceStatusDrift.js";

test("primary Product detail drift requests targeted authoritative status revalidation without changing package status", () => {
  const productContext = {
    sourceId: "s101",
    datasetName: "PRIMARY",
    workUnit: { kind: "package", primaryMemberKey: "s101" },
  };
  const attributes = {
    sourceId: "s101",
    datasetName: "PRIMARY",
    status: 11,
    workUnitStatus: {
      members: [
        { key: "s101", datasetName: "PRIMARY", status: 15 },
        { key: "s57", datasetName: "SECONDARY", status: 1 },
      ],
    },
  };
  const detail = { datasetName: "PRIMARY", status: 1 };
  const input = { productContext, attributes, detail };
  assert.deepEqual(detectPackagePopupStatusDrift(input), {
    sourceId: "s101",
    datasetName: "PRIMARY",
  });
  assert.equal(attributes.workUnitStatus.members[0].status, 15);
  assert.equal(attributes.status, 11);
  assert.equal(
    detectPackagePopupStatusDrift({ ...input, detail: { ...detail, status: 15 } }),
    null
  );
  assert.equal(
    detectPackagePopupStatusDrift({ ...input, detail: { ...detail, status: 999 } }),
    null
  );
  assert.equal(
    detectPackagePopupStatusDrift({ ...input, detail: { datasetName: "OTHER", status: 1 } }),
    null
  );
  assert.equal(
    detectPackagePopupStatusDrift({
      ...input,
      attributes: { ...attributes, datasetName: "OTHER" },
    }),
    null
  );
  assert.equal(
    detectPackagePopupStatusDrift({
      ...input,
      attributes: { ...attributes, sourceId: "s57" },
    }),
    null
  );
  assert.equal(
    detectPackagePopupStatusDrift({
      ...input,
      attributes: { ...attributes, workUnitStatus: { members: {} } },
    }),
    null
  );
  assert.equal(
    detectPackagePopupStatusDrift({
      ...input,
      attributes: {
        ...attributes,
        workUnitStatus: {
          members: [{ key: "s101", datasetName: "OTHER", status: 15 }],
        },
      },
    }),
    null
  );
  assert.equal(
    detectPackagePopupStatusDrift({
      ...input,
      productContext: { ...productContext, workUnit: null },
    }),
    null
  );
  assert.equal(
    detectPackagePopupStatusDrift({
      ...input,
      attributes: { ...attributes, workUnitStatus: null },
    }),
    null
  );
  assert.equal(
    detectPackagePopupStatusDrift({
      ...input,
      attributes: {
        ...attributes,
        workUnitStatus: {
          members: [
            { key: "s101", status: 15 },
            { key: "s57", status: 1 },
          ],
        },
      },
    })?.sourceId,
    "s101"
  );
});
