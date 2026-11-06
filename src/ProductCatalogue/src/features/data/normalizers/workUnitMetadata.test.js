import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWorkUnitMetadata } from "./workUnitMetadata.js";
import { normalizeDataSourcePayload } from "../../dataSources/services/dataSourceNormalizer.js";
const declarations = [
  { key: "s101", field: "S101" },
  { key: "s57", field: "S57" },
];
test("current members retain independent authoritative identities, versions and dates", () => {
  const value = normalizeWorkUnitMetadata(
    {
      S101: { Name: "PRIMARY", Edition: 2, Update: 4, IssueDate: "2026-01-01" },
      S57: { Name: "UNRELATED-NAME", Edition: 7, Update: 0, IssueDate: "2026-02-01" },
    },
    declarations.map(({ key }) => ({ key, field: key }))
  );
  assert.deepEqual(value.members.s57, {
    datasetName: "UNRELATED-NAME",
    edition: 7,
    update: 0,
    issueDate: "2026-02-01",
  });
  assert.equal(value.members.s101.edition, 2);
  assert.deepEqual(Object.keys(value.members), ["s101", "s57"]);
  assert.deepEqual(
    normalizeWorkUnitMetadata({ s101: { name: "A", edition: 3 } }, [
      { key: "s101", field: "s101" },
      { key: "s57", field: "s57" },
    ]).members.s57,
    undefined
  );
});
test("live AOI current metadata matches detail normalization and preserves member status", () => {
  const source = {
    id: "s101",
    label: "ENC",
    productType: "enc-package",
    identityStrategy: { type: "dataset-name" },
    normalizer: {
      type: "electronic-aoi",
      specification: 101,
      packageMembers: {
        s101: { field: "S101", specification: 101 },
        s57: { field: "S57", specification: 57 },
      },
    },
    workUnit: { kind: "package", primaryMemberKey: "s101", members: declarations },
    layerDefinitions: [{ id: "enc" }],
  };
  const attributes = {
    DatasetName: "PRIMARY",
    Status: 11,
    Package: {
      SourceDatasetName: "PRIMARY",
      S101: {
        DatasetName: "PRIMARY",
        ProductSpecification: 101,
        CurrentEdition: 2,
        CurrentUpdate: 4,
        IssueDate: "A",
        Status: 11,
      },
      S57: {
        DatasetName: "OTHER",
        ProductSpecification: 57,
        CurrentEdition: 7,
        CurrentUpdate: 0,
        IssueDate: "B",
        Status: 15,
      },
    },
  };
  const load = () =>
    normalizeDataSourcePayload([{ Attributes: attributes, Geometry: { x: 1, y: 2 } }], source)
      .products[0];
  const product = load();
  assert.equal(product.workUnitMetadata.members.s57.datasetName, "OTHER");
  assert.equal(product.workUnitMetadata.members.s57.edition, 7);
  assert.deepEqual(
    product.workUnitStatus.members.map(({ status }) => status),
    [11, 15]
  );
  attributes.Package.S57.DatasetName = "PRIMARY";
  assert.throws(load, /contradictory/);
});
