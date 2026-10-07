import assert from "node:assert/strict";
import test from "node:test";
import {
  createDataSourceRegistry,
  getRuntimeSelectableDataSources,
} from "../../dataSources/config/dataSourceRegistry.js";
import { resolveProductContext } from "../../products/domain/productContext.js";
import { normalizeProductExportMetadata } from "../../data/normalizers/productExportMetadata.js";
import { createPopupProductMetadataColumns } from "./popupProductMetadata.js";
import { createPopupActionGroups } from "./popupActionConfig.js";
import { createPopupExportActions } from "./popupExportConfig.js";
import { validateExportDispatch } from "./popupExportContract.js";
import { applyPopupProductStatusCell } from "./popupProductStatusCell.js";
import { statusColorConfig } from "../../../shared/config/colorsConfig.js";
import {
  addProductCollectionProduct,
  clearProductCollection,
  getProductCollectionSnapshot,
  reconcileProductCollectionSourceProducts,
} from "../../productCollection/state/productCollectionStore.js";

function packageContext() {
  const source = createDataSourceRegistry().byId.get("s101");
  return resolveProductContext({
    graphic: {
      attributes: {
        sourceId: source.id,
        productKey: "PRIMARY",
        datasetName: "PRIMARY",
        productType: source.productType,
      },
      layer: {
        appSourceDefinition: source,
        appSourceId: source.id,
        appProductType: source.productType,
        customId: source.layerDefinitions[0].id,
      },
    },
  });
}

test("one Main-map package preserves its representative source identity and immutable member order", () => {
  const sources = getRuntimeSelectableDataSources(createDataSourceRegistry());
  assert.deepEqual(
    sources.map(({ id, label }) => ({ id, label })),
    [{ id: "s101", label: "ENC-package" }]
  );
  const context = packageContext();
  assert.equal(context.sourceId, "s101");
  assert.equal(context.productKey, "PRIMARY");
  assert.equal(context.workUnit.primaryMemberKey, "s101");
  assert.deepEqual(
    context.workUnit.members.map((member) => member.label),
    ["S-101", "S-57"]
  );
  assert.equal(Object.isFrozen(context.workUnit.members[0]), true);
  assert.equal(sources[0].layerDefinitions.length, 1);
  assert.equal(sources[0].loader.path, "electronicproducts/aoi?layer=ENC");
});

test("package Collection identity survives refresh without adding child entries", () => {
  clearProductCollection();
  try {
    const context = packageContext();
    assert.equal(addProductCollectionProduct(context).added, true);
    assert.equal(addProductCollectionProduct(packageContext()).added, false);
    reconcileProductCollectionSourceProducts("s101", [{ productKey: "PRIMARY" }]);
    const snapshot = getProductCollectionSnapshot();
    assert.equal(snapshot.count, 1);
    assert.equal(snapshot.items[0].id, context.identityKey);
    assert.deepEqual(snapshot.datasetNames, ["PRIMARY"]);
  } finally {
    clearProductCollection();
  }
});

test("package columns prefer current normalized related export values and keep independent versions", () => {
  const columns = createPopupProductMetadataColumns(
    {
      edition: 2,
      update: 1,
      status: 1,
      exportMetadata: normalizeProductExportMetadata([
        { Type: "S57", Edition: 9, Update: 0, Status: 15, ErrorMessage: "Full validation failure" },
        { Type: "S100", Edition: 3, Update: 0, Status: 11 },
      ]),
    },
    packageContext()
  );
  assert.deepEqual(
    columns.map((column) => column.label),
    ["S-101", "S-57"]
  );
  assert.deepEqual(
    columns.map(({ item }) => [item.edition, item.update, item.status]),
    [
      [3, 0, 11],
      [9, 0, 15],
    ]
  );
  assert.equal(columns[1].item.errorMessage, "Full validation failure");
});

test("missing current member metadata never falls back to representative attributes", () => {
  const columns = createPopupProductMetadataColumns(
    { edition: 2, update: 4, status: 1, errorMessage: "Primary error" },
    packageContext()
  );
  assert.equal(columns[0].item.edition, undefined);
  for (const key of ["edition", "update", "status", "errorMessage"])
    assert.equal(columns[1].item[key], undefined);
  assert.deepEqual(columns[1].item.validationArtifacts, []);
});

test("metadata presentation is declared by work-unit members rather than source name", () => {
  const context = {
    workUnit: {
      kind: "package",
      primaryMemberKey: "second",
      members: [
        { key: "first", label: "First", exportStandard: "S57" },
        { key: "second", label: "Second", exportStandard: "S100" },
      ],
    },
  };
  const columns = createPopupProductMetadataColumns({ sourceId: "unrelated", edition: 6 }, context);
  assert.deepEqual(
    columns.map((column) => column.label),
    ["First", "Second"]
  );
  assert.equal(columns[0].item.edition, undefined);
  assert.equal(columns[1].item.edition, undefined);
  assert.equal(
    columns.every((column) => column.presentation.statusCell && column.presentation.compactError),
    true
  );
  assert.equal(createPopupProductMetadataColumns({ sourceId: "s101" }).length, 1);
});

test("package actions cannot expose or dispatch old single-product mutations even in eligible states", () => {
  const context = packageContext();
  for (const status of [1, 2, 5, 11, 15]) {
    const groups = createPopupActionGroups({
      productContext: context,
      attributes: { datasetName: "PRIMARY", status },
      frozen: status === 5,
    });
    assert.deepEqual(groups, []);
  }
  assert.deepEqual(createPopupExportActions(context), []);
  for (const capability of [
    "freeze",
    "unfreeze",
    "sendToIcEnc",
    "cancelExport",
    "exportEdition",
    "exportUpdate",
    "popupExport",
  ])
    assert.equal(context.capabilities[capability], false);
  assert.equal(
    validateExportDispatch({
      productContext: context,
      actionId: "export-edition",
      target: "S101",
      exportType: "Edition",
      implemented: true,
      request() {
        throw new Error("Must not dispatch");
      },
    }).allowed,
    false
  );
});

test("status decoration changes only the supplied value cell and preserves its text", () => {
  const classes = [];
  const properties = new Map();
  const cell = {
    textContent: "Error",
    classList: { add: (value) => classes.push(value) },
    style: { setProperty: (key, value) => properties.set(key, value) },
  };
  applyPopupProductStatusCell(cell, 15);
  assert.equal(cell.textContent, "Error");
  assert.deepEqual(classes, ["popup-product-table__status"]);
  assert.equal(properties.get("--pc-product-status-background"), statusColorConfig[15].header);
  properties.clear();
  applyPopupProductStatusCell(cell, "Future status");
  assert.equal(properties.size, 0);
  applyPopupProductStatusCell(cell, "Error", { resolveStatusId: () => 15 });
  assert.equal(properties.size, 1);
});
