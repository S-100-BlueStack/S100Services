import assert from "node:assert/strict";
import test from "node:test";
import { createDataSourceRegistry } from "../config/dataSourceRegistry.js";
import { createTargetedProductStatusLoader } from "./targetedProductStatusLoader.js";

const source = createDataSourceRegistry().byId.get("s101");
const attributes = {
  DatasetName: "101DK001OSTSO",
  Status: 1,
  Package: {
    HasActivePackage: false,
    SourceDatasetName: "101DK001OSTSO",
    S101: { DatasetName: "101DK001OSTSO", ProductSpecification: 1, Status: 1 },
    S57: { DatasetName: "DK1OSTSO", ProductSpecification: 0, Status: 1 },
  },
};

test("targeted loader unwraps the actual API response before status normalization", async () => {
  const calls = [];
  const load = createTargetedProductStatusLoader({
    request: async (path, options) => {
      calls.push({ path, options });
      return {
        success: true,
        status: 200,
        data: { Success: true, Data: attributes, TotalHits: 1 },
      };
    },
  });
  const result = await load(source, "101DK001OSTSO", { signal: new AbortController().signal });
  assert.equal(result, attributes);
  assert.deepEqual(
    calls.map(({ path }) => path),
    ["electronicproducts/101DK001OSTSO/status"]
  );
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.cache, "no-store");
});

test("targeted loader accepts the camelCase API response envelope", async () => {
  const load = createTargetedProductStatusLoader({
    request: async () => ({
      success: true,
      status: 200,
      data: { success: true, data: attributes },
    }),
  });
  assert.equal(await load(source, "101DK001OSTSO"), attributes);
});

test("targeted loader fails closed on missing or unsuccessful API envelopes", async () => {
  for (const data of [
    null,
    attributes,
    { Success: false, Data: attributes },
    { Success: true },
    { Success: true, Data: [] },
    { Success: true, Data: "invalid" },
  ]) {
    const load = createTargetedProductStatusLoader({
      request: async () => ({ success: true, status: 200, data }),
    });
    await assert.rejects(load(source, "101DK001OSTSO"), /invalid API response/);
  }
});

test("targeted loader rejects non-success HTTP responses and unsupported sources", async () => {
  const load = createTargetedProductStatusLoader({
    request: async () => ({
      success: false,
      status: 500,
      data: { Message: "Service unavailable" },
    }),
  });
  await assert.rejects(load(source, "101DK001OSTSO"), /Service unavailable/);
  await assert.rejects(
    load(createDataSourceRegistry().byId.get("s57"), "DK1OSTSO"),
    /does not have/
  );
});
