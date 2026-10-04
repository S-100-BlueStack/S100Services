import assert from "node:assert/strict";
import test from "node:test";

import {
  filterProductCatalog,
  findProductCatalogMatch,
  normalizeProductCatalog,
  parseProductInput,
  validateProductCatalogSelection,
} from "./productCatalog.js";

test("normalizeProductCatalog reads lightweight Data arrays", () => {
  const products = normalizeProductCatalog({
    Data: [" DK5ABC123 ", "DK5ABC456"],
  });

  assert.deepEqual(products, [
    {
      id: "DK5ABC123",
      name: "DK5ABC123",
      searchText: "dk5abc123",
    },
    {
      id: "DK5ABC456",
      name: "DK5ABC456",
      searchText: "dk5abc456",
    },
  ]);
});

test("normalizeProductCatalog removes empty and duplicate products case-insensitively", () => {
  const products = normalizeProductCatalog({
    Data: ["DK5ABC123", "", null, "dk5abc123", "DK5ABC456"],
  });

  assert.deepEqual(
    products.map((product) => product.name),
    ["DK5ABC123", "DK5ABC456"]
  );
});

test("normalizeProductCatalog supports object aliases for future payloads", () => {
  const products = normalizeProductCatalog({
    Data: [{ ProductName: "DK5ABC123" }, { DatasetName: "DK5ABC456" }, { name: "DK5ABC789" }],
  });

  assert.deepEqual(
    products.map((product) => product.name),
    ["DK5ABC123", "DK5ABC456", "DK5ABC789"]
  );
});

test("filterProductCatalog prioritizes exact and prefix matches", () => {
  const products = normalizeProductCatalog({
    Data: ["XX-DK5ABC123", "DK5ABC123", "DK5ABC123-ALT"],
  });

  assert.deepEqual(
    filterProductCatalog(products, "DK5ABC123").map((product) => product.name),
    ["DK5ABC123", "DK5ABC123-ALT", "XX-DK5ABC123"]
  );
});

test("filterProductCatalog excludes already selected products", () => {
  const products = normalizeProductCatalog({
    Data: ["DK5ABC123", "DK5ABC456", "DK5ABC789"],
  });

  assert.deepEqual(
    filterProductCatalog(products, "DK5", {
      excludedProductNames: ["dk5abc456"],
    }).map((product) => product.name),
    ["DK5ABC123", "DK5ABC789"]
  );
});

test("findProductCatalogMatch finds products case-insensitively", () => {
  const products = normalizeProductCatalog({
    Data: ["DK5ABC123"],
  });

  assert.equal(findProductCatalogMatch(products, "dk5abc123")?.name, "DK5ABC123");
  assert.equal(findProductCatalogMatch(products, "DK5ABC999"), null);
});

test("validateProductCatalogSelection separates valid, existing and unknown products", () => {
  const products = normalizeProductCatalog({
    Data: ["DK5ABC123", "DK5ABC456"],
  });

  assert.deepEqual(
    validateProductCatalogSelection(products, ["DK5ABC123", "DK5ABC456", "DK5ABC999"], {
      excludedProductNames: ["DK5ABC456"],
    }),
    {
      valid: ["DK5ABC123"],
      alreadySelected: ["DK5ABC456"],
      unknown: ["DK5ABC999"],
    }
  );
});

test("parseProductInput supports typed names and pasted route fragments", () => {
  assert.deepEqual(parseProductInput("DK5ABC123&DK5ABC456\nDK5ABC789"), [
    "DK5ABC123",
    "DK5ABC456",
    "DK5ABC789",
  ]);
});
