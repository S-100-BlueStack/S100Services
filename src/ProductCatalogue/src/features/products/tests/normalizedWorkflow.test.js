import assert from "node:assert/strict";
import test from "node:test";
import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { normalizeDataSourcePayload } from "../../dataSources/services/dataSourceNormalizer.js";
import { createWorkspaceProductService } from "../services/workspaceProductService.js";
import { createWorkspaceProductContext } from "../domain/productContext.js";
import { createPopupExportActions } from "../../map/popups/popupExportConfig.js";
import { isSupportedExportAction } from "../../map/popups/popupExportContract.js";
import { buildExportRequestPath } from "../../data/api/exportApi.js";
import { normalizeProductExportMetadata } from "../../data/normalizers/productExportMetadata.js";
import { findProductExportMetadataItem } from "../domain/productExportTrack.js";
import {
  normalizeProductArtifact,
  normalizeArtifactHistory,
} from "../../data/normalizers/productArtifact.js";
import { fetchAnalyzeProducts } from "../../analyze/api/analyzeApi.js";
import { fetchProductHistory } from "../../timeline/api/productHistoryApi.js";
import { fetchProductArtifacts } from "../../data/api/productArtifactApi.js";
import {
  createProductActionAvailability,
  createProductExportAvailability,
} from "../domain/productActionAvailability.js";
import { createProductJobRecord, createProductJobLabel } from "../domain/productJob.js";
import { readDataSourceSelection } from "../../dataSources/domain/dataSourcePersistence.js";
import { isFrozenStatus } from "../../data/stores/statusStore.js";

const registry = createDataSourceRegistry({ isDevelopment: false });
const geometry = {
  rings: [
    [
      [10, 56],
      [11, 56],
      [10, 56],
    ],
  ],
  spatialReference: { wkid: 4326 },
};
const aoi = (name) => ({
  Geometry: JSON.stringify(geometry),
  Attributes: { DatasetName: name, Status: 8, DisplayScale: 25000, UsageBand: 3 },
});
const artifactId = "d2875e6d-e17e-4cd3-b4a3-23654cc1398a";
const artifact = {
  Id: artifactId,
  FileName: "diagnostic.vld",
  Url: `/electronicproducts/PRODUCT/artifacts/${artifactId}`,
  ProductSpecification: "S101",
  DatasetName: "PRODUCT",
  TrackId: "track",
  RevisionId: "revision",
};
function context(id, datasetName = "PRODUCT") {
  const source = registry.byId.get(id);
  return createWorkspaceProductContext({
    sourceId: id,
    sourceLabel: source.label,
    datasetName,
    productKey: datasetName,
    productType: source.productType,
    capabilities: source.capabilities,
    exportConfiguration: source.exportConfiguration,
    contentConfiguration: source.contentConfiguration,
    data: { geometry },
  });
}

for (const id of ["s57", "s101"]) {
  test(`${id} derives identity from the specification-scoped AOI contract`, () => {
    const source = registry.byId.get(id);
    const result = normalizeDataSourcePayload([aoi("NAME-WITHOUT-STANDARD")], source);
    assert.equal(
      source.loader.path,
      `electronicproducts/aoi?productSpecification=${id.toUpperCase()}`
    );
    assert.equal(result.products[0].sourceId, id);
    assert.equal(result.products[0].productSpecification, id.toUpperCase());
    assert.equal(result.products[0].datasetName, "NAME-WITHOUT-STANDARD");
    assert.deepEqual(result.layers[0].data.features[0].geometry, geometry);
    assert.equal(result.layers[0].data.features[0].attributes.status, 8);
    assert.equal(result.products[0].edition, undefined);
  });
  test(`${id} exposes Edition and Update with a matching generic dispatch contract`, () => {
    const productContext = context(id);
    const actions = createPopupExportActions(productContext);
    assert.deepEqual(
      actions.map((action) => action.operationKind),
      ["Edition", "Update"]
    );
    for (const action of actions) {
      assert.equal(isSupportedExportAction(action), true);
      assert.equal(action.backendTarget, id.toUpperCase());
      assert.equal(isSupportedExportAction({ ...action, backendTarget: "S102" }), false);
    }
    assert.equal(productContext.capabilities.freeze, id === "s101");
  });
}

test("electronic AOIs reject absent identity, malformed payloads and duplicate identities", () => {
  const source = registry.byId.get("s57");
  for (const payload of [
    { Success: false },
    [aoi("")],
    [aoi("A"), aoi("A")],
    [{ ...aoi("A"), Geometry: "bad" }],
  ]) {
    assert.throws(() => normalizeDataSourcePayload(payload, source));
  }
});

test("workspace resolves both standards through targeted AOIs without loading bulk source catalogs", async () => {
  let bulkCalls = 0;
  const specifications = new Map([
    ["S57-DATA", "S57"],
    ["S101-DATA", "S101"],
  ]);
  const service = createWorkspaceProductService({
    registry,
    loadSource: async () => {
      bulkCalls += 1;
      throw new Error("Bulk AOI source must not run for workspace resolution.");
    },
    loadCompatibilityCatalog: async () => {
      throw new Error("Legacy transport must not run");
    },
    loadTargetedProduct: async (datasetName) => ({
      success: true,
      status: 200,
      data: {
        Data: {
          ...aoi(datasetName),
          Attributes: {
            ...aoi(datasetName).Attributes,
            ProductSpecification: specifications.get(datasetName),
          },
        },
      },
    }),
  });
  assert.equal((await service.resolveProduct("S57-DATA")).product.sourceId, "s57");
  assert.equal((await service.resolveProduct("S101-DATA")).product.sourceId, "s101");
  assert.equal(bulkCalls, 0);
});

test("failed electronic source does not resolve through another source", async () => {
  const service = createWorkspaceProductService({
    registry,
    loadTargetedProduct: null,
    loadSource: async (source) => {
      if (source.id === "s57") throw new Error("offline");
      return [aoi("OTHER")];
    },
  });
  assert.equal((await service.resolveProduct("MISSING")).status, "failed");
  assert.equal((await service.resolveProduct("OTHER")).product.sourceId, "s101");
});

test("normalized export routes have no target override or obsolete jobs suffix", () => {
  for (const action of ["newedition", "newupdate", "cancel-export"])
    assert.equal(buildExportRequestPath("A /?", action), `export/A%20%2F%3F/${action}`);
  assert.throws(() => buildExportRequestPath("A", "rollback"));
});

test("export metadata retains the backend S100 alias and validation diagnostics", () => {
  const result = normalizeProductExportMetadata([
    {
      Type: "S100",
      Name: "PRODUCT",
      Edition: 4,
      Update: 0,
      Status: 15,
      ErrorMessage: "Validation failed",
      ValidationArtifacts: [artifact],
    },
  ]);
  assert.equal(result.items[0].label, "S-101");
  assert.equal(result.items[0].status, 15);
  assert.equal(result.items[0].validationArtifacts[0].id, artifactId);
  assert.equal(result.items[0].datasetName, "PRODUCT");
  assert.equal(normalizeProductExportMetadata([{ Type: "S57" }]).items[0].label, "S-57");
});

test("export metadata resolves only the requested Product standard", () => {
  const result = normalizeProductExportMetadata([
    { Type: "S100", Status: "Idle" },
    { Type: "S57", Status: "ReadyForDistribution" },
  ]);

  assert.equal(findProductExportMetadataItem(result, ["S-101"])?.status, "Idle");
  assert.equal(findProductExportMetadataItem(result, ["s57"])?.status, "ReadyForDistribution");
  assert.equal(findProductExportMetadataItem(result, ["Paper Charts"]), null);
});

test("artifact normalization retains revision identity and rejects unsafe URLs", () => {
  assert.equal(normalizeArtifactHistory({ Data: [artifact] })[0].revisionId, "revision");
  assert.equal(
    normalizeArtifactHistory({ Data: [artifact] })[0].productSpecificationLabel,
    "S-101"
  );
  for (const url of [
    "javascript:alert(1)",
    "//foreign.example/file",
    "https://foreign.example" + artifact.Url,
    "/unrelated/file",
  ])
    assert.equal(normalizeProductArtifact({ ...artifact, Url: url }), null);
  assert.equal(
    normalizeProductArtifact({ ...artifact, Url: "/api" + artifact.Url }).url,
    artifact.Url
  );
  assert.throws(() => normalizeArtifactHistory({ Success: false }));
});

test("Analyze loads public metadata and validation history while retaining source geometry", async () => {
  const calls = [];
  const productContext = context("s57");
  const [product] = await fetchAnalyzeProducts(["PRODUCT"], {
    workspaceProductService: {
      resolveProduct: async () => ({ status: "resolved", product: productContext }),
    },
    get: async (path) => {
      calls.push(path);
      return path.endsWith("history")
        ? { Data: [artifact] }
        : { Data: { Name: "PRODUCT", Edition: 3, Update: 2, Status: 11 } };
    },
  });
  assert.deepEqual(calls, [
    "electronicproducts/PRODUCT",
    "electronicproducts/PRODUCT/artifacts/history",
  ]);
  assert.deepEqual(product.aoiGeometry, geometry);
  assert.equal(product.edition, 3);
  assert.equal(product.status, 11);
  assert.equal(product.internalValidationReports[0].url, artifact.Url);
  assert.equal(product.contentAvailability.icEncReports.implemented, false);
});

test("History admits electronic sources while mocks make no backend requests", async () => {
  let calls = 0;
  const history = await fetchProductHistory("PRODUCT", {
    productContext: context("s101"),
    get: async () => {
      calls++;
      return { Data: [], Events: [], EventTotalHits: 0 };
    },
  });
  assert.equal(history.endpointAvailable, true);
  const mock = createDataSourceRegistry({ isDevelopment: true }).byId.get("s102");
  const mockContext = {
    sourceId: mock.id,
    sourceLabel: mock.label,
    datasetName: "PRODUCT",
    contentConfiguration: mock.contentConfiguration,
  };
  assert.equal(
    (
      await fetchProductHistory("PRODUCT", {
        productContext: mockContext,
        get: async () => {
          calls++;
        },
      })
    ).endpointAvailable,
    false
  );
  assert.deepEqual(
    await fetchProductArtifacts("PRODUCT", {
      productContext: mockContext,
      get: async () => {
        calls++;
      },
    }),
    []
  );
  assert.equal(calls, 1);
});

test("state gates match normalized candidate and simulation transitions", () => {
  const capability = { mode: "Simulation", available: true };
  for (const status of [1, 2, 7, 8, 13, 14, 15])
    assert.equal(
      createProductExportAvailability({
        attributes: { datasetName: "P", status },
        implemented: true,
      }).disabled,
      false
    );
  for (const status of [5, 6, 9, 10, 11, 12, 99, null])
    assert.equal(
      createProductExportAvailability({
        attributes: { datasetName: "P", status },
        implemented: true,
      }).disabled,
      true
    );
  for (const status of [2, 6, 11, 12, 13, null])
    assert.equal(
      createProductActionAvailability({
        attributes: { datasetName: "P", status },
        sendToIcEncCapability: capability,
      }).sendImmediately.disabled,
      status !== 11
    );
  assert.equal(isFrozenStatus(5), true);
  assert.equal(isFrozenStatus(6), false);
});

test("job identity mismatch fails closed and Update has truthful presentation", () => {
  assert.equal(
    createProductJobRecord({
      response: { jobId: "1", datasetName: "OTHER", operationType: "ExportUpdate" },
      datasetName: "PRODUCT",
      operationType: "ExportUpdate",
    }),
    null
  );
  assert.equal(createProductJobLabel("ExportUpdate", "S57"), "Exporting S-57 Update");
  assert.equal(createProductJobLabel("CancelExport"), "Canceling export");
});

test("v1 migration retains the formerly fixed source without enabling new sources", () => {
  const storage = (schemaVersion) => ({
    getItem: () => JSON.stringify({ schemaVersion, initialized: true, enabledSourceIds: [] }),
  });
  assert.deepEqual(readDataSourceSelection({ registry, storage: storage(1) }).enabledSourceIds, [
    "s101",
  ]);
  assert.deepEqual(readDataSourceSelection({ registry, storage: storage(2) }).enabledSourceIds, []);
});

test("Analyze keeps metadata when validation history is malformed and does not invent a status", async () => {
  const [product] = await fetchAnalyzeProducts(["PRODUCT"], {
    workspaceProductService: {
      resolveProduct: async () => ({ status: "resolved", product: context("s101") }),
    },
    get: async (path) =>
      path.endsWith("history") ? { Success: false } : { Data: { Name: "PRODUCT" } },
  });
  assert.equal(product.workspaceLoadState, "loaded");
  assert.equal(product.status, null);
  assert.match(product.loadError, /artifact history/);
  assert.deepEqual(product.internalValidationReports, []);
});

test("source migration drops retired configured-out mock selection intent", async () => {
  const { writeDataSourceSelection } =
    await import("../../dataSources/domain/dataSourcePersistence.js");
  let value = JSON.stringify({
    schemaVersion: 1,
    initialized: true,
    enabledSourceIds: ["paper-charts"],
  });
  const storage = {
    getItem: () => value,
    setItem: (key, next) => {
      value = next;
    },
  };
  writeDataSourceSelection({ registry, storage, enabledSourceIds: ["s57", "s101"] });
  assert.deepEqual(JSON.parse(value).enabledSourceIds, ["s57", "s101"]);
  assert.equal(JSON.parse(value).schemaVersion, 2);
});

test("Review validation diagnostics survive an independent History failure", async () => {
  const { loadReviewHistories } = await import("../../review/services/reviewHistoryLoader.js");
  const [product] = await loadReviewHistories(["PRODUCT"], {
    workspaceProductService: {
      resolveProduct: async () => ({ status: "resolved", product: context("s101") }),
    },
    fetchHistory: async () => {
      throw new Error("History offline");
    },
    fetchArtifacts: async () => [artifact],
  });
  assert.equal(product.error, "History offline");
  assert.equal(product.productContext.sourceId, "s101");
  assert.equal(product.validationArtifacts.length, 1);
  assert.equal(product.artifactError, null);
});

test("legacy S101 filter intent migrates once without copying into S57", async () => {
  const { readAttributeFilterSnapshot } =
    await import("../../map/filters/attributeFilterPersistence.js");
  const { PRODUCT_CORRECTIONS_LAYER_ID } = await import("../../../shared/config/layerIds.js");
  const fields = [{ fieldName: "status", mode: "values", values: ["15"] }];
  const read = (snapshot) =>
    readAttributeFilterSnapshot({ storage: { getItem: () => JSON.stringify(snapshot) } }).snapshot;
  assert.deepEqual(read({ version: 1, layers: [] }), {
    version: 2,
    sources: [{ providerId: "s101", fields: [] }],
  });
  assert.deepEqual(
    read({ version: 2, sources: [{ providerId: PRODUCT_CORRECTIONS_LAYER_ID, fields }] }),
    { version: 2, sources: [{ providerId: "s101", fields }] }
  );
  const explicit = {
    version: 2,
    sources: [
      { providerId: PRODUCT_CORRECTIONS_LAYER_ID, fields },
      { providerId: "s101", fields: [] },
      { providerId: "s57", fields },
    ],
  };
  assert.deepEqual(read(explicit).sources, explicit.sources.slice(1));
});
