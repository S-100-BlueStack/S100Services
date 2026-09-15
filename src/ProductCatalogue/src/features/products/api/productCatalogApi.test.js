import assert from "node:assert/strict";
import test from "node:test";

import { fetchProductCatalog } from "./productCatalogApi.js";

test("Product picker uses the lightweight product-name endpoint without loading AOI catalogs", async () => {
  const calls = [];
  const products = await fetchProductCatalog({
    get: async (...args) => {
      calls.push(args);
      return { Data: ["100DK0000001", "DK0000001"] };
    },
  });

  assert.deepEqual(calls, [["electronicproducts", "Product catalog request failed"]]);
  assert.deepEqual(
    products.map((product) => product.name),
    ["100DK0000001", "DK0000001"]
  );
  assert.equal(
    calls.some(([path]) => String(path).includes("/aoi?productSpecification=")),
    false
  );
});
