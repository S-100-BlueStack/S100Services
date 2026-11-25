import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const apiRoot = new URL("../../../../../ProductCatalogueAPI/", import.meta.url);

test("ProductCatalogueAPI does not expose synthetic data sources", async () => {
  const program = await readFile(new URL("Program.cs", apiRoot), "utf8");

  assert.doesNotMatch(program, /MockDataSources|GetMockGeoJson|["']\/mock\//);
});

test("ProductCatalogueAPI does not ship the retired source fixtures", async () => {
  const projectFile = await readFile(new URL("ProductCatalogueAPI.csproj", apiRoot), "utf8");

  assert.doesNotMatch(projectFile, /ProductCatalogueAPI\.mock\./);
  for (const file of ["mock/paper-charts.geojson", "mock/s102.geojson"]) {
    await assert.rejects(access(new URL(file, apiRoot)), { code: "ENOENT" });
  }
});
